import request from 'supertest';
import app from '../../app.js';

describe('wallet auth protection', () => {
  it('blocks wallet endpoint without token', async () => {
    const res = await request(app).get('/api/wallet/me');
    expect(res.statusCode).toBe(401);
  });
});
