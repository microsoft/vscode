import request from 'supertest';
import app from '../../app.js';

describe('user me endpoint', () => {
  it('requires auth token', async () => {
    const res = await request(app).get('/api/user/me');
    expect(res.statusCode).toBe(401);
  });
});
