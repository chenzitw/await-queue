export type AsyncFn<T> = () => Promise<T>;

export type Job<T = any> = {
  fn: AsyncFn<T>;
  resolve: (arg: T) => void;
  reject: (arg: any) => void;
};

export type JobAddedEventListener = (size: number) => void;

export type JobEmptyEventListener = () => void;

export type JobErrorHandlingMiddleware = (error: any, times: number) => void;
