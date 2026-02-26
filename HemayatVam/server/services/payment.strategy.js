export class PaymentStrategy {
  async createPaymentRequest() { throw new Error('Not implemented'); }
  async verifyTransaction() { throw new Error('Not implemented'); }
  async handleCallback() { throw new Error('Not implemented'); }
}

export class ZarinPalStrategy extends PaymentStrategy {
  constructor(merchantId) { super(); this.merchantId = merchantId; }
  async createPaymentRequest(payload) { return { authority: `ZP-${Date.now()}`, ...payload }; }
  async verifyTransaction({ authority }) { return { success: true, referenceId: `REF-${authority}` }; }
  async handleCallback(query) { return query; }
}

export class NextPayStrategy extends PaymentStrategy {
  constructor(apiKey) { super(); this.apiKey = apiKey; }
  async createPaymentRequest(payload) { return { token: `NP-${Date.now()}`, ...payload }; }
  async verifyTransaction({ token }) { return { success: true, referenceId: `REF-${token}` }; }
  async handleCallback(query) { return query; }
}

export class IDPayStrategy extends PaymentStrategy {
  constructor(apiKey) { super(); this.apiKey = apiKey; }
  async createPaymentRequest(payload) { return { id: `IDP-${Date.now()}`, ...payload }; }
  async verifyTransaction({ id }) { return { success: true, referenceId: `REF-${id}` }; }
  async handleCallback(query) { return query; }
}
