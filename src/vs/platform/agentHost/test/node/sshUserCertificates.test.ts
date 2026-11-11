/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { certificateMatchesPublicKey, getOpenSSHPrivateKeyPublicBlob, isOpenSSHCertificateType, parseOpenSSHPublicKeyLine } from '../../node/sshUserCertificates.js';
import { ECDSA_CERTIFICATE, ECDSA_PUBLIC_KEY, ED25519_CERTIFICATE, ED25519_PUBLIC_KEY, openSSHPrivateKeyFor } from './sshCertificateFixtures.js';

suite('sshUserCertificates', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function blob(line: Buffer): Buffer {
		const parsed = parseOpenSSHPublicKeyLine(line);
		assert.ok(parsed);
		return parsed.blob;
	}

	test('parseOpenSSHPublicKeyLine reads type and blob of keys and certificates', () => {
		assert.strictEqual(parseOpenSSHPublicKeyLine(ED25519_PUBLIC_KEY)?.type, 'ssh-ed25519');
		assert.strictEqual(parseOpenSSHPublicKeyLine(ED25519_CERTIFICATE)?.type, 'ssh-ed25519-cert-v01@openssh.com');
		assert.strictEqual(parseOpenSSHPublicKeyLine(`# comment\r\n${ECDSA_CERTIFICATE.toString()}`)?.type, 'ecdsa-sha2-nistp256-cert-v01@openssh.com');
	});

	test('parseOpenSSHPublicKeyLine rejects malformed input and mismatched type labels', () => {
		assert.strictEqual(parseOpenSSHPublicKeyLine(''), undefined);
		assert.strictEqual(parseOpenSSHPublicKeyLine('not a key'), undefined);
		const relabelled = ED25519_PUBLIC_KEY.toString().replace(/^ssh-ed25519/, 'ssh-rsa');
		assert.strictEqual(parseOpenSSHPublicKeyLine(relabelled), undefined);
	});

	test('isOpenSSHCertificateType', () => {
		assert.strictEqual(isOpenSSHCertificateType('ssh-ed25519-cert-v01@openssh.com'), true);
		assert.strictEqual(isOpenSSHCertificateType('ssh-ed25519'), false);
	});

	test('getOpenSSHPrivateKeyPublicBlob reads the public key of plain and encrypted keys', () => {
		assert.deepStrictEqual(getOpenSSHPrivateKeyPublicBlob(openSSHPrivateKeyFor(ED25519_PUBLIC_KEY)), blob(ED25519_PUBLIC_KEY));
		assert.deepStrictEqual(getOpenSSHPrivateKeyPublicBlob(openSSHPrivateKeyFor(ED25519_PUBLIC_KEY, 'aes256-ctr')), blob(ED25519_PUBLIC_KEY));
	});

	test('getOpenSSHPrivateKeyPublicBlob ignores other formats and truncated keys', () => {
		assert.strictEqual(getOpenSSHPrivateKeyPublicBlob(Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n')), undefined);
		const truncated = Buffer.from(`-----BEGIN OPENSSH PRIVATE KEY-----\n${Buffer.from('openssh-key-v1\0\0\0\0\x04none').toString('base64')}\n-----END OPENSSH PRIVATE KEY-----\n`);
		assert.strictEqual(getOpenSSHPrivateKeyPublicBlob(truncated), undefined);
	});

	test('certificateMatchesPublicKey pairs certificates with the key they certify', () => {
		assert.strictEqual(certificateMatchesPublicKey(blob(ED25519_CERTIFICATE), blob(ED25519_PUBLIC_KEY)), true);
		assert.strictEqual(certificateMatchesPublicKey(blob(ECDSA_CERTIFICATE), blob(ECDSA_PUBLIC_KEY)), true);
		assert.strictEqual(certificateMatchesPublicKey(blob(ECDSA_CERTIFICATE), blob(ED25519_PUBLIC_KEY)), false);
		assert.strictEqual(certificateMatchesPublicKey(blob(ED25519_CERTIFICATE), blob(ECDSA_PUBLIC_KEY)), false);
	});

	test('certificateMatchesPublicKey rejects a same-type certificate for a different key', () => {
		const otherKey = Buffer.from(blob(ED25519_PUBLIC_KEY));
		otherKey[otherKey.length - 1] ^= 0xff;
		assert.strictEqual(certificateMatchesPublicKey(blob(ED25519_CERTIFICATE), otherKey), false);
	});
});
