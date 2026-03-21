/**
 * @module MightyEmitter
 *
 * A pure TypeScript, zero-dependency, type-safe event emitter.
 * Small, fast, and portable — works in Deno, Node, Bun, and browsers.
 *
 * @example Basic usage
 * ```ts
 * import { MightyEmitter } from "@mightyemitter/core";
 *
 * type Events = {
 *   message: string;
 *   error: Error;
 *   close: void;
 * };
 *
 * const emitter = new MightyEmitter<Events>();
 *
 * emitter.on("message", (msg) => console.log(msg));
 * emitter.emit("message", "hello");
 * ```
 */

/** A listener function for a specific event. */
export type Listener<T> = (data: T) => void;

/** Unsubscribe function returned by `on` and `once`. */
export type Unsubscribe = () => void;

/** Map of event names to their payload types. */
export type EventMap = Record<string, unknown>;

/**
 * A type-safe, synchronous event emitter with zero dependencies.
 *
 * @typeParam T - An object type mapping event names to their payload types.
 *
 * @example
 * ```ts
 * type Events = {
 *   data: { id: number; value: string };
 *   done: void;
 * };
 *
 * const ee = new MightyEmitter<Events>();
 *
 * const off = ee.on("data", (payload) => {
 *   console.log(payload.id, payload.value);
 * });
 *
 * ee.emit("data", { id: 1, value: "hello" });
 * off(); // unsubscribe
 * ```
 */
export class MightyEmitter<T extends EventMap = EventMap> {
  /**
   * Internal listener storage.
   * Uses a Map of Sets for O(1) add/delete and clean iteration.
   */
  #listeners = new Map<keyof T, Set<Listener<never>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   *
   * @param event - The event name.
   * @param listener - The callback to invoke when the event fires.
   * @returns A function that removes this listener when called.
   *
   * @example
   * ```ts
   * const off = emitter.on("message", (msg) => console.log(msg));
   * off(); // stop listening
   * ```
   */
  on<K extends keyof T>(event: K, listener: Listener<T[K]>): Unsubscribe {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener<never>);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      set!.delete(listener as Listener<never>);
      if (set!.size === 0) this.#listeners.delete(event);
    };
  }

  /**
   * Subscribe to an event for a single firing, then auto-unsubscribe.
   *
   * @param event - The event name.
   * @param listener - The callback to invoke once.
   * @returns A function that removes this listener if it hasn't fired yet.
   *
   * @example
   * ```ts
   * emitter.once("ready", () => console.log("ready!"));
   * ```
   */
  once<K extends keyof T>(event: K, listener: Listener<T[K]>): Unsubscribe {
    const off = this.on(event, ((data: T[K]) => {
      off();
      listener(data);
    }) as Listener<T[K]>);
    return off;
  }

  /**
   * Remove a specific listener from an event.
   *
   * @param event - The event name.
   * @param listener - The exact function reference passed to `on`.
   *
   * @example
   * ```ts
   * const handler = (msg: string) => console.log(msg);
   * emitter.on("message", handler);
   * emitter.off("message", handler);
   * ```
   */
  off<K extends keyof T>(event: K, listener: Listener<T[K]>): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<never>);
    if (set.size === 0) this.#listeners.delete(event);
  }

  /**
   * Emit an event, invoking all listeners synchronously in subscription order.
   *
   * @param event - The event name.
   * @param data - The payload to pass to each listener.
   * @returns `true` if the event had listeners, `false` otherwise.
   *
   * @example
   * ```ts
   * const had = emitter.emit("message", "hello");
   * console.log(had); // true if there were listeners
   * ```
   */
  emit<K extends keyof T>(event: K, ...args: T[K] extends void ? [] : [data: T[K]]): boolean {
    const set = this.#listeners.get(event);
    if (!set || set.size === 0) return false;
    const data = args[0] as T[K];
    // Snapshot via spread so adds/removes mid-iteration are safe
    for (const listener of [...set]) {
      if (set.has(listener)) {
        (listener as Listener<T[K]>)(data);
      }
    }
    return true;
  }

  /**
   * Returns a promise that resolves the next time the event fires.
   * Optionally accepts an `AbortSignal` for cancellation.
   *
   * @param event - The event name.
   * @param options - Optional. Pass `{ signal }` to make the wait abortable.
   * @returns A promise resolving with the event payload.
   * @throws {DOMException} `AbortError` if the signal is aborted.
   *
   * @example
   * ```ts
   * const msg = await emitter.next("message");
   *
   * // With timeout:
   * const msg = await emitter.next("message", {
   *   signal: AbortSignal.timeout(5000),
   * });
   * ```
   */
  next<K extends keyof T>(
    event: K,
    options?: { signal?: AbortSignal },
  ): Promise<T[K]> {
    return new Promise<T[K]>((resolve, reject) => {
      const signal = options?.signal;

      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }

      const off = this.once(event, (data: T[K]) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(data);
      });

      function onAbort() {
        off();
        reject(signal!.reason ?? new DOMException("Aborted", "AbortError"));
      }

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Returns the number of listeners for a given event,
   * or the total number across all events if no event is specified.
   *
   * @param event - Optional event name.
   */
  listenerCount<K extends keyof T>(event?: K): number {
    if (event !== undefined) {
      return this.#listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.#listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Remove all listeners for a given event, or all listeners entirely.
   *
   * @param event - Optional. If provided, clears only that event's listeners.
   *
   * @example
   * ```ts
   * emitter.clear("message"); // clear message listeners
   * emitter.clear();          // clear everything
   * ```
   */
  clear<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
  }

  /**
   * Returns an async iterator that yields each time the event fires.
   * Optionally accepts an `AbortSignal` to stop iteration.
   *
   * @param event - The event name.
   * @param options - Optional. Pass `{ signal }` to make the iterator abortable.
   *
   * @example
   * ```ts
   * const ac = new AbortController();
   *
   * for await (const msg of emitter.iter("message", { signal: ac.signal })) {
   *   console.log(msg);
   *   if (msg === "stop") ac.abort();
   * }
   * ```
   */
  async *iter<K extends keyof T>(
    event: K,
    options?: { signal?: AbortSignal },
  ): AsyncIterableIterator<T[K]> {
    const signal = options?.signal;

    while (!signal?.aborted) {
      try {
        yield await this.next(event, options);
      } catch {
        return; // AbortError — end iteration
      }
    }
  }
}
