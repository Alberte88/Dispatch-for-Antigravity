import crypto from 'crypto';

export class SessionManager {
  constructor(hashedPin, timeoutMs = 20 * 60 * 1000) {
    this.hashedPin = hashedPin;
    this.timeoutMs = timeoutMs;
    this.authorizedUntil = 0;
  }

  verifyAndAuthorize(plainPin) {
    const hash = crypto.createHash('sha256').update(plainPin).digest('hex');
    if (hash === this.hashedPin) {
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
