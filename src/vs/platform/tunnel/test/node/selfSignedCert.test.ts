/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
import * as tls from 'tls';
import * as net from 'net';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { generateSelfSignedCert, ISelfSignedCert } from '../../node/selfSignedCert.js';

suite('selfSignedCert', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let cert: ISelfSignedCert;

	suiteSetup(async () => {
		cert = await generateSelfSignedCert();
	});

	test('returns PEM-encoded key', () => {
		assert.ok(cert.key.startsWith('-----BEGIN PRIVATE KEY-----'));
		assert.ok(cert.key.trimEnd().endsWith('-----END PRIVATE KEY-----'));
	});

	test('returns PEM-encoded certificate', () => {
		assert.ok(cert.cert.startsWith('-----BEGIN CERTIFICATE-----'));
		assert.ok(cert.cert.trimEnd().endsWith('-----END CERTIFICATE-----'));
	});

	test('fingerprint is in Electron sha256/<base64> format', () => {
		assert.ok(cert.fingerprint.startsWith('sha256/'));
		const b64 = cert.fingerprint.substring('sha256/'.length);
		// SHA-256 digest is 32 bytes → 44 base64 chars (with padding)
		assert.strictEqual(Buffer.from(b64, 'base64').length, 32);
	});

	test('fingerprint matches the certificate DER', () => {
		const derB64 = cert.cert.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
		const der = Buffer.from(derB64, 'base64');
		const expected = 'sha256/' + crypto.createHash('sha256').update(der).digest('base64');
		assert.strictEqual(cert.fingerprint, expected);
	});

	test('certificate can be parsed by Node X509Certificate', () => {
		const x509 = new crypto.X509Certificate(cert.cert);
		assert.strictEqual(x509.issuer, 'CN=TunnelProxy');
		assert.strictEqual(x509.subject, 'CN=TunnelProxy');
	});

	test('certificate has SAN with IP 127.0.0.1', () => {
		const x509 = new crypto.X509Certificate(cert.cert);
		assert.ok(
			x509.subjectAltName?.includes('IP Address:127.0.0.1'),
			`Expected SAN to include IP 127.0.0.1, got: ${x509.subjectAltName}`
		);
	});

	test('certificate is not yet expired', () => {
		const x509 = new crypto.X509Certificate(cert.cert);
		const notBefore = new Date(x509.validFrom);
		const notAfter = new Date(x509.validTo);
		const now = new Date();
		assert.ok(notBefore <= now, `Certificate not yet valid: notBefore=${notBefore}`);
		assert.ok(notAfter > now, `Certificate already expired: notAfter=${notAfter}`);
	});

	test('key and certificate form a valid TLS pair', async () => {
		// Start a TLS server with the generated cert, connect to it,
		// and verify the handshake completes successfully.
		const server = tls.createServer({ key: cert.key, cert: cert.cert });
		server.listen(0, '127.0.0.1');
		await new Promise<void>(resolve => server.once('listening', resolve));
		const address = server.address() as net.AddressInfo;

		try {
			await new Promise<void>((resolve, reject) => {
				const client = tls.connect({
					host: '127.0.0.1',
					port: address.port,
					// Accept our self-signed cert for this test
					rejectUnauthorized: false,
				}, () => {
					// Handshake succeeded
					const peerCert = client.getPeerCertificate();
					assert.ok(peerCert, 'Should have a peer certificate');
					assert.strictEqual(peerCert.subject?.CN, 'TunnelProxy');
					client.end();
					resolve();
				});
				client.on('error', reject);
			});
		} finally {
			server.close();
		}
	});

	test('each invocation produces a unique certificate', async () => {
		const cert2 = await generateSelfSignedCert();
		// Different key pair → different fingerprint
		assert.notStrictEqual(cert.fingerprint, cert2.fingerprint);
		assert.notStrictEqual(cert.key, cert2.key);
	});

	test('produces canonical DER INTEGER serials across many runs', async () => {
		// Regression: a random 8-byte serial with `serial[0] &= 0x7f`
		// occasionally yields a leading 0x00 byte where the next byte's
		// high bit is unset — that's non-canonical DER and OpenSSL
		// rejects it with ASN.1 INVALID_INTEGER when the cert is loaded.
		// Run enough iterations that the probability of hitting the bad
		// path is overwhelming: P(failure per cert) ≈ 1/256, so 200 runs
		// gives P(no failure) ≈ (255/256)^200 ≈ 46% — comfortably high
		// enough that a buggy encoder fails most invocations.
		for (let i = 0; i < 200; i++) {
			const c = await generateSelfSignedCert();
			// Constructing a TLS secure context is what triggers the
			// OpenSSL INVALID_INTEGER error path.
			tls.createSecureContext({ key: c.key, cert: c.cert });
		}
	});
});
