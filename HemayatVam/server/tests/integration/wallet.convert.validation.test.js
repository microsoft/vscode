import request from 'supertest';
import app from '../../app.js';

describe('wallet convert validation', () => {
  it('rejects invalid convert payload without token', async () => {
    const res = await request(app)
      .post('/api/wallet/convert')
      .send({ from: 'IRR', to: 'IRR', amount: -10 });
    expect(res.statusCode).toBe(401);
  });
});
