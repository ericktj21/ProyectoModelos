/**
 * queues.js
 * ---------------------------------------------------------------------------
 * Estructuras de datos lineales usadas por el simulador:
 *
 *  - FifoQueue:     cola FIFO sobre un buffer circular. enqueue/dequeue O(1).
 *                   Equivale al `deque` de Python mencionado en el documento.
 *  - BinaryHeap:    montículo binario mínimo genérico (Cormen et al., 2022).
 *                   push/pop O(log n). Se usa para la agenda de eventos.
 *  - PriorityQueue: cola de prioridad de aeronaves construida sobre BinaryHeap.
 *                   Las emergencias salen primero y, entre aviones de la misma
 *                   clase, se respeta el orden de llegada (estabilidad).
 *
 * Las tres clases exponen la misma interfaz mínima (enqueue, dequeue, peek,
 * size, isEmpty, toArray) para que el simulador pueda intercambiarlas sin
 * cambiar su lógica (principio de sustitución).
 * ---------------------------------------------------------------------------
 */

export class FifoQueue {
  constructor(initialCapacity = 16) {
    this._buffer = new Array(initialCapacity);
    this._head = 0;
    this._size = 0;
  }

  get size() {
    return this._size;
  }

  isEmpty() {
    return this._size === 0;
  }

  enqueue(item) {
    if (this._size === this._buffer.length) this._grow();
    this._buffer[(this._head + this._size) % this._buffer.length] = item;
    this._size++;
  }

  dequeue() {
    if (this._size === 0) return undefined;
    const item = this._buffer[this._head];
    this._buffer[this._head] = undefined;
    this._head = (this._head + 1) % this._buffer.length;
    this._size--;
    return item;
  }

  peek() {
    return this._size === 0 ? undefined : this._buffer[this._head];
  }

  /** Copia de los elementos en orden de salida (para visualización). */
  toArray() {
    const out = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      out[i] = this._buffer[(this._head + i) % this._buffer.length];
    }
    return out;
  }

  clear() {
    this._buffer = new Array(16);
    this._head = 0;
    this._size = 0;
  }

  _grow() {
    const old = this.toArray();
    this._buffer = new Array(this._buffer.length * 2);
    for (let i = 0; i < old.length; i++) this._buffer[i] = old[i];
    this._head = 0;
  }
}

export class BinaryHeap {
  /** @param {(a:any, b:any) => number} compare negativo si `a` debe salir antes que `b`. */
  constructor(compare) {
    this._compare = compare;
    this._data = [];
  }

  get size() {
    return this._data.length;
  }

  isEmpty() {
    return this._data.length === 0;
  }

  peek() {
    return this._data[0];
  }

  push(item) {
    this._data.push(item);
    this._siftUp(this._data.length - 1);
  }

  pop() {
    const data = this._data;
    if (data.length === 0) return undefined;
    const top = data[0];
    const last = data.pop();
    if (data.length > 0) {
      data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  /** Copia ordenada (no destructiva). Solo para visualización: O(n log n). */
  toSortedArray() {
    return [...this._data].sort(this._compare);
  }

  clear() {
    this._data = [];
  }

  _siftUp(index) {
    const data = this._data;
    const item = data[index];
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this._compare(item, data[parent]) >= 0) break;
      data[index] = data[parent];
      index = parent;
    }
    data[index] = item;
  }

  _siftDown(index) {
    const data = this._data;
    const length = data.length;
    const item = data[index];
    for (;;) {
      const left = 2 * index + 1;
      if (left >= length) break;
      const right = left + 1;
      let child = left;
      if (right < length && this._compare(data[right], data[left]) < 0) child = right;
      if (this._compare(data[child], item) >= 0) break;
      data[index] = data[child];
      index = child;
    }
    data[index] = item;
  }
}

/**
 * Comparador de aeronaves: primero las emergencias (prioridad 0), luego las
 * normales (prioridad 1); a igual prioridad, el que llegó antes (seq menor).
 */
export function compareAircraft(a, b) {
  return a.priority - b.priority || a.seq - b.seq;
}

export class PriorityQueue {
  constructor(compare = compareAircraft) {
    this._heap = new BinaryHeap(compare);
  }

  get size() {
    return this._heap.size;
  }

  isEmpty() {
    return this._heap.isEmpty();
  }

  enqueue(item) {
    this._heap.push(item);
  }

  dequeue() {
    return this._heap.pop();
  }

  peek() {
    return this._heap.peek();
  }

  toArray() {
    return this._heap.toSortedArray();
  }

  clear() {
    this._heap.clear();
  }
}
