import Callback from '../Callback';

describe('Callback util', () => {
  it('listeners should be called when trigger', () => {
    const emitter = new Callback<[boolean, number]>();

    const listener1 = jest.fn<[], [boolean, number]>();

    const listener2 = jest.fn<[], [boolean, number]>();

    emitter.addListener(listener1);

    expect(listener1).toBeCalledTimes(0);
    emitter.trigger(true, 9999);
    expect(listener1).toBeCalledTimes(1);
    expect(listener1).toBeCalledWith(true, 9999);

    emitter.addListener(listener2);

    expect(listener2).toBeCalledTimes(0);
    emitter.trigger(false, -1234);
    expect(listener1).toBeCalledTimes(2);
    expect(listener2).toBeCalledTimes(1);
    expect(listener1).toBeCalledWith(false, -1234);
    expect(listener2).toBeCalledWith(false, -1234);
  });
});
