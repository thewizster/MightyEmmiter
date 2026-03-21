# MightyEmitter

[![JSR Version](https://jsr.io/badges/@wxt/mightyemitter)](https://jsr.io/@wxt/mightyemitter)
[![JSR Score](https://jsr.io/badges/@wxt/mightyemitter/score)](https://jsr.io/@wxt/mightyemitter)
[![codecov](https://codecov.io/gh/mightyemitter/core/branch/main/graph/badge.svg)](https://codecov.io/gh/mightyemitter/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A pure TypeScript, zero-dependency, type-safe event emitter.
Small, fast, and portable — works in Deno, Node, Bun, and browsers.

## Install

```ts
// Deno / JSR
import { MightyEmitter } from "@wxt/mightyemitter";

// Node / Bun (after installing from JSR)
// npx jsr add @wxt/mightyemitter
import { MightyEmitter } from "@wxt/mightyemitter";
```

## Quick Start

```ts
import { MightyEmitter } from "@wxt/mightyemitter";

// 1. Define your event map
type Events = {
  message: string;
  error: Error;
  close: void;
};

// 2. Create an emitter
const emitter = new MightyEmitter<Events>();

// 3. Subscribe
const off = emitter.on("message", (msg) => {
  console.log("Received:", msg);
});

// 4. Emit
emitter.emit("message", "hello"); // Received: hello

// 5. Unsubscribe when done
off();
```

## API

### `on(event, listener): Unsubscribe`

Subscribe to an event. Returns an unsubscribe function.

```ts
const off = emitter.on("message", (msg) => console.log(msg));
off(); // stop listening
```

### `once(event, listener): Unsubscribe`

Subscribe to an event for a single firing, then auto-unsubscribe.

```ts
emitter.once("message", (msg) => console.log("Only once:", msg));
```

### `off(event, listener): void`

Remove a specific listener by reference.

```ts
const handler = (msg: string) => console.log(msg);
emitter.on("message", handler);
emitter.off("message", handler);
```

### `emit(event, data?): boolean`

Emit an event synchronously. Returns `true` if the event had listeners.
For `void` events, data is omitted.

```ts
emitter.emit("message", "hello"); // true
emitter.emit("close");            // void event, no payload
emitter.emit("message", "nobody"); // false if no listeners
```

### `next(event, options?): Promise<T>`

Returns a promise that resolves the next time the event fires. Supports `AbortSignal` for cancellation.

```ts
const msg = await emitter.next("message");

// With timeout:
const msg = await emitter.next("message", {
  signal: AbortSignal.timeout(5000),
});
```

### `iter(event, options?): AsyncIterableIterator<T>`

Returns an async iterator that yields each time the event fires. Supports `AbortSignal` to stop iteration.

```ts
const ac = new AbortController();

for await (const msg of emitter.iter("message", { signal: ac.signal })) {
  console.log(msg);
  if (msg === "done") ac.abort();
}
```

### `listenerCount(event?): number`

Returns the number of listeners for a given event, or the total across all events if no event is specified.

```ts
emitter.listenerCount("message"); // 2
emitter.listenerCount();          // total across all events
```

### `clear(event?): void`

Remove all listeners for a given event, or all listeners entirely.

```ts
emitter.clear("message"); // clear only "message" listeners
emitter.clear();          // clear everything
```

## Patterns

### Typed Payloads

TypeScript enforces correct payload types at compile time:

```ts
type Events = {
  data: { id: number; value: string };
  done: void;
};

const ee = new MightyEmitter<Events>();

ee.on("data", (payload) => {
  // payload is { id: number; value: string } — fully typed
  console.log(payload.id, payload.value);
});

ee.emit("data", { id: 1, value: "hello" });
ee.emit("done"); // no payload needed
```

### Extending a Class

```ts
type SocketEvents = {
  open: void;
  message: string;
  close: { code: number; reason: string };
};

class Socket extends MightyEmitter<SocketEvents> {
  connect() {
    // ...
    this.emit("open");
  }

  send(data: string) {
    // ...
  }
}

const socket = new Socket();
socket.on("message", (msg) => console.log(msg));
socket.connect();
```

### Awaiting a Single Event

```ts
async function waitForReady(emitter: MightyEmitter<{ ready: void }>) {
  await emitter.next("ready");
  console.log("System is ready");
}
```

### Streaming Events as an Async Iterator

```ts
async function processStream(emitter: MightyEmitter<{ data: number }>) {
  const ac = new AbortController();

  for await (const value of emitter.iter("data", { signal: ac.signal })) {
    console.log(value);
    if (value < 0) ac.abort(); // stop on negative
  }
}
```

## Development

Requires [Deno](https://deno.land/).

```sh
# Type-check
deno task check

# Run tests
deno task test

# Run benchmarks
deno task bench
```

## Engineering Deep-Dive

### Architecture

MightyEmitter is a single-class, single-file module (~230 LoC) with no
dependencies and no build step. The entire public API is one class and three
type aliases.

**Internal data structure:** Listeners are stored in a `Map<event, Set<listener>>`.
This gives O(1) subscribe, O(1) unsubscribe, and O(n) emit where n is only the
listeners for that specific event — other events are untouched.

### Why It's Safe

- **Type safety at compile time.** The `EventMap` generic enforces that every
  `emit`, `on`, `once`, and `next` call uses the correct event name and payload
  type. Typos and wrong types are caught before code ever runs.

- **Snapshot iteration.** `emit` spreads the listener `Set` into an array
  before iterating (`[...set]`), then checks `set.has(listener)` before each
  call. This means listeners added during an emit cycle do not fire in that
  cycle, and listeners removed mid-cycle are correctly skipped. No stale
  references, no infinite loops.

- **Idempotent unsubscribe.** The `Unsubscribe` function returned by `on` uses
  a `removed` flag so calling it multiple times is a no-op — no risk of
  accidentally removing a different listener.

- **Automatic cleanup.** When the last listener for an event is removed, the
  event key is deleted from the `Map`, preventing unbounded memory growth from
  events that are no longer in use.

- **AbortSignal support.** Both `next` and `iter` accept an `AbortSignal`,
  giving clean cancellation semantics. Abort listeners are properly removed on
  resolve/reject to avoid memory leaks.

- **Private internals.** The listener `Map` is a `#private` field — external
  code cannot tamper with or iterate over registered listeners.

### Why It's Secure

- **Zero dependencies.** No supply-chain surface. No transitive packages to
  audit or worry about. The entire attack surface is one file you can read in
  five minutes.

- **No dynamic code execution.** No `eval`, no `Function()`, no string-based
  event dispatch tricks. Event names are statically typed string literals.

- **No global state.** Each `MightyEmitter` instance is fully isolated. There
  are no shared registries, singletons, or ambient side effects.

- **Strict compiler settings.** The project builds with `strict: true` and
  `noUncheckedIndexedAccess: true`, catching null/undefined access and
  implicit `any` at compile time.

### Why It's Fast

- **`Map` + `Set`** is the optimal JS data structure for this pattern.
  Subscribe and unsubscribe are O(1). Emit iterates only the listeners for
  the targeted event.

- **No wrapper overhead.** There are no middleware chains, priority queues,
  wildcard matchers, or regex-based event routing. The hot path through
  `emit` is a single `Set` spread + `for` loop.

- **No allocations on unsubscribe.** The `off`/unsubscribe path deletes from
  the `Set` in-place. When the `Set` drains to zero, the `Map` key is removed.

- **Benchmarked.** The project includes `Deno.bench` tests covering emit fan-out
  (1, 10, and 100 listeners), subscribe/unsubscribe churn, void events, and
  `once` lifecycle — so regressions are measurable.

### Test Coverage

The test suite covers:

| Area | Cases |
|---|---|
| `on` / `emit` | basic delivery, multiple listeners, subscription order, return value, void events |
| `off` / unsubscribe | removal by reference, double-call safety, empty set cleanup, no-op on unknown event |
| `once` | single-fire guarantee, pre-fire unsubscribe |
| `listenerCount` | per-event, total, after removal |
| `clear` | per-event, global |
| `next` | promise resolution, pre-aborted signal, mid-wait abort, abort listener cleanup |
| `iter` | async iteration with abort |
| Edge cases | add-during-emit, remove-during-emit, error propagation, duplicate reference dedup, event isolation |

## License

MIT
