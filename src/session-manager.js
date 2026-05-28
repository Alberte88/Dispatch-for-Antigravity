import crypto from 'crypto';

const HASH_LEN = 32; // SHA-256 produces 32 bytes

export class SessionManager {
  /**
   * @param {string} hashedPin - 64-char hex-encoded SHA-256 digest of the user's PIN
   * @param {number} timeoutMs - Session sliding window in ms (default: 20 minutes)
   */
  constructor(hashedPin, timeoutMs = 20 * 60 * 1000) {
    if (typeof hashedPin !== 'string' || hashedPin.length !== 64) {
      throw new TypeError('hashedPin must be a 64-char hex SHA-256 string');
    }
    this.hashedPin = hashedPin;
    this.timeoutMs = timeoutMs;
    this.authorizedUntil = 0;
  }

  /**
   * Verify a plain-text PIN and authorize if correct.
   * Uses binary digest buffers with timingSafeEqual for constant-time comparison.
   * @param {string} plainPin
   * @returns {boolean}
   */
  verifyAndAuthorize(plainPin) {
    if (typeof plainPin !== 'string' || plainPin.length === 0) return false;
    const hash = crypto.createHash('sha256').update(plainPin, 'utf8').digest(); // 32 binary bytes
    const stored = Buffer.from(this.hashedPin, 'hex'); // decode 64-char hex → 32 binary bytes
    const sentinel = Buffer.alloc(HASH_LEN); // all-zeros fallback for constant-time path
    const target = stored.length === HASH_LEN ? stored : sentinel;
    const match = crypto.timingSafeEqual(hash, target);
    if (match && stored.length === HASH_LEN) {
      this.resetTimeout();
      return true;
    }
    return false;
  }

  /** @returns {boolean} True if a valid session is active */
  isAuthorized() {
    return Date.now() < this.authorizedUntil;
  }

  /** Slide the session window forward by timeoutMs from now */
  resetTimeout() {
    this.authorizedUntil = Date.now() + this.timeoutMs;
  }

  /** Immediately revoke authorization */
  lock() {
    this.authorizedUntil = 0;
  }
}
