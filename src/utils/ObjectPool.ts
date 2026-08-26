/**
 * Fixed-purpose object pool. `create` builds a fresh item, `reset` prepares a
 * recycled one. Used by the renderer for particles and note visuals so dense
 * charts do not allocate per frame.
 */
export class ObjectPool<T> {
  private free: T[] = [];
  private live = 0;

  constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T {
    this.live++;
    const item = this.free.pop();
    if (item !== undefined) {
      this.reset(item);
      return item;
    }
    return this.create();
  }

  release(item: T): void {
    this.live--;
    this.free.push(item);
  }

  get liveCount(): number {
    return this.live;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
