export function must<T extends Element>(
  root: ParentNode,
  selector: string,
  type: { new (): T; prototype: T },
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element ${selector}`);
  return element;
}
