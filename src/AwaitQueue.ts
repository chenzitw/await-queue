import {
  AsyncFn,
  Job,
  JobAddedEventListener,
  JobEmptyEventListener,
  JobErrorHandlingMiddleware,
} from './types';
import { JobCanceledError } from './errors';
import Callback from './utils/Callback';

const defaultErrorHandlingMiddleware: JobErrorHandlingMiddleware = (error) => {
  throw error;
};

class AwaitQueue {
  protected jobSet: Job[];
  protected isProcessing: boolean;
  protected isPaused: boolean;
  protected jobAddedCallback: Callback<Parameters<JobAddedEventListener>>;
  protected jobEmptyCallback: Callback<Parameters<JobEmptyEventListener>>;
  protected processingJobErrorCount: number;
  protected errorHandlingMiddleware: JobErrorHandlingMiddleware;

  constructor() {
    this.jobSet = [];
    this.isProcessing = false;
    this.isPaused = true;
    this.jobAddedCallback = new Callback();
    this.jobEmptyCallback = new Callback();
    this.processingJobErrorCount = 0;
    this.errorHandlingMiddleware = defaultErrorHandlingMiddleware;
  }

  protected addJob<T>(job: Job<T>): void {
    this.jobSet.push(job);

    const size = this.jobSet.length;
    this.jobAddedCallback.trigger(size);
  }

  protected removeJobs(amount: number): void {
    this.jobSet.splice(0, amount);

    if (this.jobSet.length <= 0) {
      this.jobEmptyCallback.trigger();
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
    this.jobAddedCallback.addListener((size) => fn.apply(undefined, [size]));
  }

  onEmpty(fn: JobEmptyEventListener): void {
    this.jobEmptyCallback.addListener(() => fn.apply(undefined));
  }

  useErrorHandlingMiddleware(fn: JobErrorHandlingMiddleware): void {
    this.errorHandlingMiddleware = (error, times) => {
      fn.apply(undefined, [error, times]);
    };
  }

  cleanup(): void {
    this.pause();
    this.clear();
    this.jobAddedCallback.clearListeners();
    this.jobEmptyCallback.clearListeners();
  }
}

export default AwaitQueue;
