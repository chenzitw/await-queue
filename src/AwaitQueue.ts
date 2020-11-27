import {
  AsyncFn,
  Job,
  JobAddedEventListener,
  JobEmptyEventListener,
  JobErrorHandlingMiddleware,
} from './types';

import { JobCanceledError } from './errors';

const defaultErrorHandlingMiddleware: JobErrorHandlingMiddleware = (error) => {
  throw error;
};

class AwaitQueue {
  protected jobSet: Job[];
  protected isProcessing: boolean;
  protected isPaused: boolean;
  protected jobAddedFns: JobAddedEventListener[];
  protected jobEmptyFns: JobEmptyEventListener[];
  protected processingJobErrorCount: number;
  protected errorHandlingMiddleware: JobErrorHandlingMiddleware;

  constructor() {
    this.jobSet = [];
    this.isProcessing = false;
    this.isPaused = true;
    this.jobAddedFns = [];
    this.jobEmptyFns = [];
    this.processingJobErrorCount = 0;
    this.errorHandlingMiddleware = defaultErrorHandlingMiddleware;
  }

  protected emitJobAddedFns(): void {
    const amount = this.jobSet.length;

    this.jobAddedFns.forEach((fn) => {
      // TODO: try catch
      fn.apply(undefined, [amount]);
    });
  }

  protected emitJobEmptyFns(): void {
    this.jobEmptyFns.forEach((fn) => {
      // TODO: try catch
      fn.apply(undefined);
    });
  }

  protected addJob<T>(job: Job<T>): void {
    this.jobSet.push(job);

    this.emitJobAddedFns();
  }

  protected removeJobs(amount: number): void {
    this.jobSet.splice(0, amount);

    if (this.jobSet.length <= 0) {
      this.emitJobEmptyFns();
    }
  }

  protected async processJob(): Promise<void> {
    const job = this.jobSet[0];

    let caughtError: any;
    let jobResult: any;

    try {
      jobResult = await job.fn.apply(undefined);
    } catch (error) {
      caughtError = error;
    }

    if (this.jobSet[0] !== job) {
      return;
    }

    if (caughtError) {
      // when caught an error, call the error handler
      this.processingJobErrorCount += 1;
      try {
        this.errorHandlingMiddleware(caughtError, this.processingJobErrorCount);
      } catch (customError) {
        // if catch fn throw error, reject this job and do next job
        job.reject.apply(undefined, [customError]);
        this.processingJobErrorCount = 0;
        this.removeJobs(1);
        return;
      }

      // if catch fn does not throw error, ignore this error
      return;
    }

    // when not caught any error, resolve this job and do next job
    job.resolve.apply(undefined, [jobResult]);
    this.processingJobErrorCount = 0;
    this.removeJobs(1);
  }

  protected async main(): Promise<void> {
    if (!(!this.isProcessing && !this.isPaused && this.jobSet.length > 0)) {
      return;
    }

    this.isProcessing = true;

    await this.processJob();

    this.isProcessing = false;

    if (!this.isPaused && this.jobSet.length > 0) {
      this.main();
    }
  }

  run(): void {
    if (this.isProcessing) {
      return;
    }

    if (this.isPaused) {
      this.isPaused = false;
    }

    this.main();
  }

  pause(): void {
    this.isPaused = true;
  }

  skip(num: number = 1): void {
    for (let index = 0; index < num; index++) {
      this.jobSet[index].reject(new JobCanceledError());
    }

    this.removeJobs(num);
  }

  clear(): void {
    this.skip(this.jobSet.length);
  }

  promise<T>(fn: AsyncFn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.addJob({
        fn: fn,
        resolve: resolve,
        reject: reject,
      });
    });
  }

  onAdded(fn: JobAddedEventListener): void {
    this.jobAddedFns.push((size) => fn.apply(undefined, [size]));
  }

  onEmpty(fn: JobEmptyEventListener): void {
    this.jobEmptyFns.push(() => fn.apply(undefined));
  }

  useErrorHandlingMiddleware(fn: JobErrorHandlingMiddleware): void {
    this.errorHandlingMiddleware = (error, times) => {
      fn.apply(undefined, [error, times]);
    };
  }

  cleanup(): void {
    this.pause();
    this.clear();
  }
}

export default AwaitQueue;
