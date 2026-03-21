import { MightyEmitter } from "./mod.ts";

type Events = {
  data: number;
  ping: void;
};

Deno.bench("emit to 1 listener", () => {
  const ee = new MightyEmitter<Events>();
  ee.on("data", () => {});
  for (let i = 0; i < 1000; i++) ee.emit("data", i);
});

Deno.bench("emit to 10 listeners", () => {
  const ee = new MightyEmitter<Events>();
  for (let i = 0; i < 10; i++) ee.on("data", () => {});
  for (let i = 0; i < 1000; i++) ee.emit("data", i);
});

Deno.bench("emit to 100 listeners", () => {
  const ee = new MightyEmitter<Events>();
  for (let i = 0; i < 100; i++) ee.on("data", () => {});
  for (let i = 0; i < 1000; i++) ee.emit("data", i);
});

Deno.bench("subscribe + unsubscribe", () => {
  const ee = new MightyEmitter<Events>();
  for (let i = 0; i < 1000; i++) {
    const off = ee.on("data", () => {});
    off();
  }
});

Deno.bench("emit void event (no payload)", () => {
  const ee = new MightyEmitter<Events>();
  ee.on("ping", () => {});
  for (let i = 0; i < 1000; i++) ee.emit("ping");
});

Deno.bench("once: subscribe + emit + auto-cleanup", () => {
  const ee = new MightyEmitter<Events>();
  for (let i = 0; i < 1000; i++) {
    ee.once("data", () => {});
    ee.emit("data", i);
  }
});
