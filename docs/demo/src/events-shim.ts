type Fn = (...args: any[]) => void;

export class EventEmitter {
  #l = new Map<string, Fn[]>();
  on(e: string, f: Fn): this {
    if (!this.#l.has(e)) this.#l.set(e, []);
    this.#l.get(e)!.push(f);
    return this;
  }
  off(e: string, f: Fn): this {
    this.#l.set(e, (this.#l.get(e) ?? []).filter((x) => x !== f));
    return this;
  }
  emit(e: string, ...a: unknown[]): boolean {
    const l = this.#l.get(e);
    if (!l?.length) return false;
    for (const f of l.slice()) f(...a);
    return true;
  }
}
