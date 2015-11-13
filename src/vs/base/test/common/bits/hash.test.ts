/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as assert from 'assert';
import { SHA1 } from 'vs/base/common/bits/hash';
import strings = require('vs/base/common/strings');

suite('Hash', () => {
	test('SHA1', function() {
		var sha1 = new SHA1();
		sha1.update(new ArrayBuffer(0));
		assert.equal(sha1.digest(), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');

		sha1 = new SHA1();
		sha1.update('');
		assert.equal(sha1.digest(), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');

		sha1 = new SHA1();
		sha1.update('');
		sha1.update('');
		sha1.update('');
		assert.equal(sha1.digest(), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');

		sha1 = new SHA1();
		sha1.update('a');
		assert.equal(sha1.digest(), '86f7e437faa5a7fce15d1ddcb9eaeaea377667b8');

		sha1 = new SHA1();
		sha1.update('A Test');
		assert.equal(sha1.digest(), '8f0c0855915633e4a7de19468b3874c8901df043');

		sha1 = new SHA1();
		sha1.update('A ');
		sha1.update('Test');
		assert.equal(sha1.digest(), '8f0c0855915633e4a7de19468b3874c8901df043');

		sha1 = new SHA1();
		sha1.update('A');
		sha1.update(' ');
		sha1.update('Test');
		assert.equal(sha1.digest(), '8f0c0855915633e4a7de19468b3874c8901df043');

		sha1 = new SHA1();
		sha1.update('');
		sha1.update('A');
		sha1.update('');
		sha1.update(' ');
		sha1.update('');
		sha1.update('Test');
		sha1.update('');
		assert.equal(sha1.digest(), '8f0c0855915633e4a7de19468b3874c8901df043');

		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog');
		assert.equal(sha1.digest(), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');

		// 54 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick');
		assert.equal(sha1.digest(), 'a9318d5d7993fd4bbad1696ece576e6e105c5872');

		// 55 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick ');
		assert.equal(sha1.digest(), '0558010a9a9800dc97ab12953301cba5c9d78cec');

		// 56 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick b');
		assert.equal(sha1.digest(), '6bb6eba88f4fae6b798459a25a46ecd420a78847');

		// 63 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fo');
		assert.equal(sha1.digest(), '9921d82a69493909e6f8eb4821b231b0509aacf9');

		// 119 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps ove');
		assert.equal(sha1.digest(), '3692531d76fb737715a30169709fb2471e4b08c6');

		// 119 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps ove');
		assert.equal(sha1.digest(), '3692531d76fb737715a30169709fb2471e4b08c6');

		// 120 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over');
		assert.equal(sha1.digest(), '45762fdd4a147dc70d9331b400505562211175dc');

		// 447 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy do');
		assert.equal(sha1.digest(), '684e42cbb799e69004d89863ab14ecaff8a799ce');

		// 448 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog');
		assert.equal(sha1.digest(), 'ca1cc8eb75a8ecbe4176464046c20c2c16f653ec');

		// 1125 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. ');
		assert.equal(sha1.digest(), '6f16d4cf3037e7a1aa135982982b6152f6f1e1a0');

		// 1125 bytes
		sha1 = new SHA1();
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		sha1.update('The quick brown fox jumps over the lazy dog. ');
		assert.equal(sha1.digest(), '6f16d4cf3037e7a1aa135982982b6152f6f1e1a0');

		sha1 = new SHA1();
		sha1.update('blob 20\0');
		sha1.update('var x;\r\nvar y = x;\r\n');
		assert.equal(sha1.digest(), '02352c74ec4882994b413ff8dbc009c0bdb14115');

		sha1 = new SHA1();
		sha1.update(strings.format('blob {0}\0', 20));
		sha1.update('var x;\r\nvar y = x;\r\n');
		assert.equal(sha1.digest(), '02352c74ec4882994b413ff8dbc009c0bdb14115');
	});
});
