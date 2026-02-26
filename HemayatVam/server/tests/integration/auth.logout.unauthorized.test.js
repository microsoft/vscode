import request from 'supertest';
import app from '../../app.js';

describe('auth logout endpoint', () => {
  it('requires auth for logout', async () => {
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'x' });
    expect(res.statusCode).toBe(401);
  });
});
