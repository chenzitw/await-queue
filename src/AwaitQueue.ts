import {
  AsyncFn,
  Job,
  JobAddedEventListener,
  JobEmptyEventListener,
  JobErrorHandlingMiddleware,
} from './types';
import { JobCanceledError } from './errors';
import Queue from './utils/Queue';

const defaultErrorHandlingMiddleware: JobErrorHandlingMiddleware = (error) => {
  throw error;
};

class AwaitQueue {
  protected jobQueue: Queue<Job>;
  protected isProcessing: boolean;
  protected isPaused: boolean;
  protected processingJobErrorCount: number;
  protected errorHandlingMiddleware: JobErrorHandlingMiddleware;

  constructor() {
    this.jobQueue = new Queue();
    this.isProcessing = false;
    this.isPaused = true;
    this.processingJobErrorCount = 0;
    this.errorHandlingMiddleware = defaultErrorHandlingMiddleware;
  }

  protected async processJob(): Promise<void> {
    const job = this.jobQueue.getHead();

    if (typeof job === 'undefined') {
      return;
    }

    let caughtError: any;
    let jobResult: any;

    try {
      jobResult = await job.fn.apply(undefined);
    } catch (error) {
      caughtError = error;
    }

    if (this.jobQueue.getHead() !== job) {
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
        this.jobQueue.pop();
        return;
      }

      // if catch fn does not throw error, ignore this error
      return;
    }

    // when not caught any error, resolve this job and do next job
    job.resolve.apply(undefined, [jobResult]);
    this.processingJobErrorCount = 0;
    this.jobQueue.pop();
  }

  protected async main(): Promise<void> {
    if (!(!this.isProcessing && !this.isPaused && this.jobQueue.size() > 0)) {
      return;
    }

    this.isProcessing = true;

    await this.processJob();

    this.isProcessing = false;

    if (!this.isPaused && this.jobQueue.size() > 0) {
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
      const job = this.jobQueue.getHead();
      this.jobQueue.pop();
      if (typeof job === 'undefined') {
        return;
      }

      job.reject.apply(undefined, [new JobCanceledError()]);
    }
  }

  clear(): void {
    const queueSize = this.jobQueue.size();

    if (queueSize > 0) {
      this.skip(queueSize);
    }
  }

  promise<T>(fn: AsyncFn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        fn: fn,
        resolve: resolve,
        reject: reject,
      };

      this.jobQueue.push(job);
    });
  }

  size(): number {
    return this.jobQueue.size();
  }

  onAdded(fn: JobAddedEventListener): void {
    this.jobQueue.onAdded((size) => fn.apply(undefined, [size]));
  }

  onEmpty(fn: JobEmptyEventListener): void {
    this.jobQueue.onEmpty(() => fn.apply(undefined));
  }

  useErrorHandlingMiddleware(fn: JobErrorHandlingMiddleware): void {
    this.errorHandlingMiddleware = (error, times) => {
      fn.apply(undefined, [error, times]);
    };
  }

  cleanup(): void {
    this.pause();
    this.clear();
    this.jobQueue.cleanup();
  }
}

export default AwaitQueue;
