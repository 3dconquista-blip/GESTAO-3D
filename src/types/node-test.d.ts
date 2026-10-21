// Declarações mínimas para os testes rodarem com `node --test` (sem @types/node).
declare module 'node:test' {
  type Fn = (t?: unknown) => void | Promise<void>;
  export function test(name: string, fn: Fn): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: Fn): void;
  export function beforeEach(fn: Fn): void;
  export function afterEach(fn: Fn): void;
  export function before(fn: Fn): void;
  export function after(fn: Fn): void;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    rejects(fn: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: string): Promise<void>;
    match(value: string, regexp: RegExp, message?: string): void;
    doesNotMatch(value: string, regexp: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:module' {
  /** Registra ganchos de carregamento de módulos (usado nos testes para achar o Preact em vendor/). */
  export function register(especificador: string, pai?: string | URL): void;
}
