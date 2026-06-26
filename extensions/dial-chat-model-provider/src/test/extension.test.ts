import * as assert from 'assert';
import { isAccessTokenExpired } from '../jwtUtils';

suite('jwtUtils', () => {
	test('isAccessTokenExpired returns false for a fresh token', () => {
		const expiry = Date.now() + 120_000;
		assert.strictEqual(isAccessTokenExpired(expiry, 30_000), false);
	});

	test('isAccessTokenExpired returns true when within skew window', () => {
		const expiry = Date.now() + 10_000;
		assert.strictEqual(isAccessTokenExpired(expiry, 30_000), true);
	});

	test('isAccessTokenExpired returns true when expiry is undefined', () => {
		assert.strictEqual(isAccessTokenExpired(undefined), true);
	});
});
