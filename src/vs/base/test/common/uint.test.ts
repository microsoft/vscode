import assert from 'assert';
import { Constants, toUint8, toUint32 } from '../../common/uint.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('uint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('toUint8', () => {
		assert.strictEqual(toUint8(-1), 0);
		assert.strictEqual(toUint8(0), 0);
		assert.strictEqual(toUint8(1), 1);
		assert.strictEqual(toUint8(128), 128);
		assert.strictEqual(toUint8(255), 255);
		assert.strictEqual(toUint8(256), 255);

		// Floats
		assert.strictEqual(toUint8(1.5), 1);
		assert.strictEqual(toUint8(1.9), 1);
	});

	test('toUint32', () => {
		assert.strictEqual(toUint32(-1), 0);
		assert.strictEqual(toUint32(0), 0);
		assert.strictEqual(toUint32(1), 1);
		assert.strictEqual(toUint32(Constants.MAX_UINT_32), Constants.MAX_UINT_32);
		assert.strictEqual(toUint32(Constants.MAX_UINT_32 + 1), Constants.MAX_UINT_32);

		// Floats
		assert.strictEqual(toUint32(1.5), 1);
		assert.strictEqual(toUint32(1.9), 1);
	});
});
