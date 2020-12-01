import {
  JobAddedEventListener,
  JobEmptyEventListener,
  JobErrorHandlingMiddleware,
} from '../types';
import AwaitQueue from '../AwaitQueue';

type AddedReturn = ReturnType<JobAddedEventListener>;
type AddedParams = Parameters<JobAddedEventListener>;
type EmptyReturn = ReturnType<JobEmptyEventListener>;
type EmptyParams = Parameters<JobEmptyEventListener>;
type ErrHandleReturn = ReturnType<JobErrorHandlingMiddleware>;
type ErrHandleParams = Parameters<JobErrorHandlingMiddleware>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

describe('AwaitQueue rough integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const connect = jest
    .fn<Promise<void>, void[]>()
    .mockImplementation(async () => {
      await sleep(50);
    });

  const disconnect = jest.fn<void, void[]>();

  const getSomething = jest
    .fn<Promise<'something'>, void[]>()
    .mockImplementation(async () => {
      await sleep(50);
      return 'something';
    });

  const getAnotherThing = jest
    .fn<Promise<'another-thing'>, void[]>()
    .mockImplementation(async () => {
      await sleep(50);
      return 'another-thing';
    });

  const getWrongThingUntilThird = jest
    .fn<Promise<'right-thing'>, void[]>()
    .mockImplementationOnce(async () => {
      await sleep(50);
      throw new Error();
    })
    .mockImplementationOnce(async () => {
      await sleep(50);
      throw new Error();
    })
    .mockImplementationOnce(async () => {
      await sleep(50);
      return 'right-thing';
    });

  const getWrongThing = jest
    .fn<Promise<never>, void[]>()
    .mockImplementation(async () => {
      await sleep(50);
      throw new Error();
    });

  it(
    'AwaitQueue should be work for one job twice',
    async () => {
      const awaitQueue = new AwaitQueue();

      const onAddedFn = jest.fn<AddedReturn, AddedParams>(async (count) => {
        if (count === 1) {
          await connect();
          awaitQueue.run();
        }
      });

      const onEmptyFn = jest.fn<EmptyReturn, EmptyParams>(() => {
        awaitQueue.pause();
        disconnect();
      });

      awaitQueue.onAdded(onAddedFn);

      awaitQueue.onEmpty(onEmptyFn);

      {
        const promise = awaitQueue.promise(getSomething);
        expect(onAddedFn).toBeCalledTimes(1);
        expect(onAddedFn).toBeCalledWith(1);

        await sleep(50); // wait for connect

        expect(getSomething).toBeCalledTimes(1);
        await expect(promise).resolves.toBe('something');

        expect(onEmptyFn).toBeCalledTimes(1);
      }

      {
        const promise = awaitQueue.promise(getAnotherThing);
        expect(onAddedFn).toBeCalledTimes(2);
        expect(onAddedFn).toBeCalledWith(1);

        await sleep(50); // wait for connect

        expect(getAnotherThing).toBeCalledTimes(1);
        await expect(promise).resolves.toBe('another-thing');

        expect(onEmptyFn).toBeCalledTimes(2);
      }
    },
    10 * 1000,
  );

  it(
    'AwaitQueue should be work for two jobs',
    async () => {
      const awaitQueue = new AwaitQueue();

      const onAddedFn = jest.fn<AddedReturn, AddedParams>(async (count) => {
        if (count === 1) {
          await connect();
          awaitQueue.run();
        }
      });

      const onEmptyFn = jest.fn<EmptyReturn, EmptyParams>(() => {
        awaitQueue.pause();
        disconnect();
      });

      awaitQueue.onAdded(onAddedFn);

      awaitQueue.onEmpty(onEmptyFn);

      const promiseOfSomething = awaitQueue.promise(getSomething);
      expect(onAddedFn).toBeCalledTimes(1);
      expect(onAddedFn).toBeCalledWith(1);

      const promiseOfAnotherThing = awaitQueue.promise(getAnotherThing);
      expect(onAddedFn).toBeCalledTimes(2);
      expect(onAddedFn).toBeCalledWith(2);

      await sleep(50); // wait for connect

      expect(getSomething).toBeCalledTimes(1);
      await expect(promiseOfSomething).resolves.toBe('something');

      expect(getAnotherThing).toBeCalledTimes(1);
      await expect(promiseOfAnotherThing).resolves.toBe('another-thing');

      expect(onEmptyFn).toBeCalledTimes(1);
    },
    10 * 1000,
  );

  it(
    'AwaitQueue should be work for three jobs with retrying successfully',
    async () => {
      const awaitQueue = new AwaitQueue();

      const onAddedFn = jest.fn<AddedReturn, AddedParams>(async (count) => {
        if (count === 1) {
          await connect();
          awaitQueue.run();
        }
      });

      const onEmptyFn = jest.fn<EmptyReturn, EmptyParams>(() => {
        awaitQueue.pause();
        disconnect();
      });

      const errHandle = jest.fn<ErrHandleReturn, ErrHandleParams>(() => {
        awaitQueue.pause();
        disconnect();

        (async () => {
          await connect();
          awaitQueue.run();
        })();
      });

      awaitQueue.onAdded(onAddedFn);

      awaitQueue.onEmpty(onEmptyFn);

      awaitQueue.useErrorHandlingMiddleware(errHandle);

      const promiseOfSomething = awaitQueue.promise(getSomething);
      expect(onAddedFn).toBeCalledTimes(1);
      expect(onAddedFn).toBeCalledWith(1);

      const promiseOfWrongThing = awaitQueue.promise(getWrongThingUntilThird);
      expect(onAddedFn).toBeCalledTimes(2);
      expect(onAddedFn).toBeCalledWith(2);

      const promiseOfAnotherThing = awaitQueue.promise(getAnotherThing);
      expect(onAddedFn).toBeCalledTimes(3);
      expect(onAddedFn).toBeCalledWith(3);

      await sleep(50); // wait for connect

      expect(getSomething).toBeCalledTimes(1);
      await expect(promiseOfSomething).resolves.toBe('something');

      expect(getWrongThingUntilThird).toBeCalledTimes(1);
      await sleep(50); // wait for first time calling
      expect(errHandle).toBeCalledTimes(1);

      await sleep(50); // wait for connect

      expect(getWrongThingUntilThird).toBeCalledTimes(2);
      await sleep(50); // wait for second time calling
      expect(errHandle).toBeCalledTimes(2);

      await sleep(50); // wait for connect

      expect(getWrongThingUntilThird).toBeCalledTimes(3);
      await expect(promiseOfWrongThing).resolves.toBe('right-thing');

      expect(getAnotherThing).toBeCalledTimes(1);
      await expect(promiseOfAnotherThing).resolves.toBe('another-thing');

      expect(onEmptyFn).toBeCalledTimes(1);
    },
    10 * 1000,
  );

  it(
    'AwaitQueue should be work for three jobs with retrying failed',
    async () => {
      const awaitQueue = new AwaitQueue();

      const onAddedFn = jest.fn<AddedReturn, AddedParams>(async (count) => {
        if (count === 1) {
          await connect();
          awaitQueue.run();
        }
      });

      const onEmptyFn = jest.fn<EmptyReturn, EmptyParams>(() => {
        awaitQueue.pause();
        disconnect();
      });

      const errHandle = jest.fn<ErrHandleReturn, ErrHandleParams>((_error, times) => {
        awaitQueue.pause();
        disconnect();

        (async () => {
          await connect();
          awaitQueue.run();
        })();

        if (times >= 3) {
          throw new Error();
        }
      });

      awaitQueue.onAdded(onAddedFn);

      awaitQueue.onEmpty(onEmptyFn);

      awaitQueue.useErrorHandlingMiddleware(errHandle);

      const promiseOfSomething = awaitQueue.promise(getSomething);
      expect(onAddedFn).toBeCalledTimes(1);
      expect(onAddedFn).toBeCalledWith(1);

      const promiseOfWrongThing = awaitQueue.promise(getWrongThing);
      expect(onAddedFn).toBeCalledTimes(2);
      expect(onAddedFn).toBeCalledWith(2);

      const promiseOfAnotherThing = awaitQueue.promise(getAnotherThing);
      expect(onAddedFn).toBeCalledTimes(3);
      expect(onAddedFn).toBeCalledWith(3);

      await sleep(50); // wait for connect

      expect(getSomething).toBeCalledTimes(1);
      await expect(promiseOfSomething).resolves.toBe('something');

      expect(getWrongThing).toBeCalledTimes(1);
      await sleep(50); // wait for first time calling
      expect(errHandle).toBeCalledTimes(1);

      await sleep(50); // wait for connect

      expect(getWrongThing).toBeCalledTimes(2);
      await sleep(50); // wait for second time calling
      expect(errHandle).toBeCalledTimes(2);

      await sleep(50); // wait for connect

      expect(getWrongThing).toBeCalledTimes(3);
      await expect(promiseOfWrongThing).rejects.toBeDefined();

      await sleep(50); // wait for connect

      expect(getAnotherThing).toBeCalledTimes(1);
      await expect(promiseOfAnotherThing).resolves.toBe('another-thing');

      expect(onEmptyFn).toBeCalledTimes(1);
    },
    10 * 1000,
  );
});
