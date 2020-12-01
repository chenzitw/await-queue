import Callback from './Callback';

export type AddedEventListener = (size: number) => void;
export type EmptyEventListener = () => void;

class Queue<T = any> {
  protected items: T[];
  protected addedCallback: Callback<Parameters<AddedEventListener>>;
  protected emptyCallback: Callback<Parameters<EmptyEventListener>>;

  constructor() {
    this.items = [];
    this.addedCallback = new Callback();
    this.emptyCallback = new Callback();
  }

  push(item: T): void {
    this.items.push(item);

    const size = this.items.length;
    this.addedCallback.trigger(size);
  }

  pop(amount: number = 1): void {
    this.items.splice(0, amount);

    if (this.items.length === 0) {
      this.emptyCallback.trigger();
    }
  }

  size(): number {
    return this.items.length;
  }

  getHead(): undefined | T {
    if (this.items.length <= 0) {
      return undefined;
    }

    return this.items[0];
  }

  getTail(): undefined | T {
    if (this.items.length <= 0) {
      return undefined;
    }

    return this.items[this.items.length - 1];
  }

  onAdded(listener: AddedEventListener): () => void {
    this.addedCallback.addListener(listener);

    const cancel = () => {
      this.addedCallback.removeListener(listener);
    };
    return cancel;
  }

  onEmpty(listener: EmptyEventListener): () => void {
    this.emptyCallback.addListener(listener);

    const cancel = () => {
      this.emptyCallback.removeListener(listener);
    };
    return cancel;
  }

  cleanup(): void {
    this.addedCallback.clearListeners();
    this.emptyCallback.clearListeners();
  }
}

export default Queue;
