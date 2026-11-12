export class Pool<T> {
  readonly #free: T[] = [];
  readonly #create: () => T;
  created = 0;

  constructor(create: () => T, prefill = 0) {
    this.#create = create;
    for (let i = 0; i < prefill; i++) this.#free.push(this.#make());
  }

  #make(): T {
    this.created += 1;
    return this.#create();
  }

  acquire(): T {
    return this.#free.pop() ?? this.#make();
  }

  release(item: T): void {
    this.#free.push(item);
  }

  get available(): number {
    return this.#free.length;
  }
}

export function removeWhere<T>(
  items: T[],
  dead: (item: T) => boolean,
  onRemove?: (item: T) => void,
): void {
  let kept = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    if (dead(item)) {
      onRemove?.(item);
      continue;
    }
    items[kept] = item;
    kept += 1;
  }
  items.length = kept;
}
