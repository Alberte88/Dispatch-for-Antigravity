import crypto from 'crypto';

export class SessionManager {
  constructor(hashedPin, timeoutMs = 20 * 60 * 1000) {
    this.hashedPin = hashedPin;
    this.timeoutMs = timeoutMs;
    this.authorizedUntil = 0;
  }

  verifyAndAuthorize(plainPin) {
    const hash = crypto.createHash('sha256').update(plainPin).digest('hex');
    const hashBuf = Buffer.from(hash);
    const storedBuf = Buffer.from(this.hashedPin);
    if (hashBuf.length === storedBuf.length && crypto.timingSafeEqual(hashBuf, storedBuf)) {
      this.resetTimeout();
      return true;
    }
    return false;
  }

  isAuthorized() {
    return Date.now() < this.authorizedUntil;
  }

  resetTimeout() {
    this.authorizedUntil = Date.now() + this.timeoutMs;
  }

  lock() {
    this.authorizedUntil = 0;
  }
}
