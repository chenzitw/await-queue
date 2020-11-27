export class JobCanceledError extends Error {
  name = 'JobCanceledError';
  message = 'Job was canceled.';
}
