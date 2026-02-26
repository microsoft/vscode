import request from 'supertest';
import app from '../../app.js';

describe('auth validation', () => {
  it('rejects invalid login payload', async () => {
    const res = await request(app).post('/auth/login').send({ phone: '123' });
    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe('خطا در اعتبارسنجی ورودی');
  });
});
