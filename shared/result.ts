export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}
