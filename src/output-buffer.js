import stripAnsi from 'strip-ansi';

const DEFAULT_CHUNK_SIZE = 3800;  // Telegram max message length is 4096; leave margin
const DEFAULT_FLUSH_MS  = 2000;   // Flush accumulated output every 2 seconds

/**
 * OutputBuffer collects raw stdout/stderr data from a child process, strips
 * ANSI escape codes, and flushes it to a Telegram chat in rate-limited chunks.
 *
 * Usage:
 *   const buf = new OutputBuffer(ctx, { chunkSize: 3800, flushMs: 2000 });
 *   buf.feed(chunk);          // call on each 'data' event
 *   await buf.flush(true);    // force-flush remaining data when process exits
 */
export class OutputBuffer {
  /**
   * @param {Function} sendFn   - Async function that sends a string to the user (e.g. ctx.reply)
   * @param {object}  [opts]
   * @param {number}  [opts.chunkSize] - Max characters per Telegram message
   * @param {number}  [opts.flushMs]  - Interval between auto-flushes in ms
   */
  constructor(sendFn, { chunkSize = DEFAULT_CHUNK_SIZE, flushMs = DEFAULT_FLUSH_MS } = {}) {
    this.sendFn    = sendFn;
    this.chunkSize = chunkSize;
    this.flushMs   = flushMs;
    this._buffer   = '';
    this._timer    = null;
  }

  /**
   * Feed raw output data (Buffer or string) into the buffer.
   * Starts the auto-flush timer if not already running.
   * @param {Buffer|string} data
   */
  feed(data) {
    this._buffer += stripAnsi(String(data));
    if (!this._timer) {
      this._timer = setTimeout(() => this.flush(), this.flushMs);
    }
  }

  /**
   * Flush accumulated output, splitting into chunkSize-length messages.
   * @param {boolean} [force=false] - If true, flush even if buffer is empty (sends nothing).
   * @returns {Promise<void>}
   */
  async flush(force = false) {
    clearTimeout(this._timer);
    this._timer = null;

    if (!this._buffer && !force) return;

    const text = this._buffer;
    this._buffer = '';

    if (!text) return;

    // Split into chunks that fit within Telegram's message size limit
    for (let i = 0; i < text.length; i += this.chunkSize) {
      const chunk = text.slice(i, i + this.chunkSize);
      await this.sendFn(chunk);
    }
  }

  /** Cancel any pending flush and clear the buffer */
  dispose() {
    clearTimeout(this._timer);
    this._timer  = null;
    this._buffer = '';
  }
}
