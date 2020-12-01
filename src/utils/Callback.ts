type Listener<T extends any[] = []> = (...args: T) => void;

class Callback<T extends any[] = []> {
  protected listeners: Set<Listener<T>>;

  constructor() {
    this.listeners = new Set();
  }

  addListener(listener: Listener<T>): void {
    if (typeof listener !== 'function') {
      throw new TypeError();
    }

    this.listeners.add(listener);
  }

  removeListener(listener: Listener<T>): void {
    if (typeof listener !== 'function') {
      throw new TypeError();
    }

    this.listeners.delete(listener);
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  trigger(...args: T): void {
    this.listeners.forEach((listener) => {
      try {
        listener.apply(undefined, args);
      } catch (e) {}
    });
  }
}

export default Callback;
