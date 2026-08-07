/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHmac, randomBytes } from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	computeHostKeyFingerprint,
	matchKnownHosts,
	parseKnownHosts,
	parseKnownHostsLine,
	readHostKeyType,
} from '../../node/sshKnownHosts.js';

/** Build a syntactically valid SSH wire-format public key blob. */
function makeKeyBlob(keyType: string, material: Buffer): Buffer {
	const type = Buffer.from(keyType, 'ascii');
	const header = Buffer.alloc(4);
	header.writeUInt32BE(type.length, 0);
	const body = Buffer.alloc(4);
	body.writeUInt32BE(material.length, 0);
	return Buffer.concat([header, type, body, material]);
}

const ED25519_A = makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xaa));
const ED25519_B = makeKeyBlob('ssh-ed25519', Buffer.alloc(32, 0xbb));
const RSA_A = makeKeyBlob('ssh-rsa', Buffer.alloc(64, 0xcc));

function line(host: string, blob: Buffer, marker?: string): string {
	const type = readHostKeyType(blob)!;
	return `${marker ? `${marker} ` : ''}${host} ${type} ${blob.toString('base64')}`;
}

/** Build a hashed (`|1|salt|hash`) host field the way `ssh-keygen -H` does. */
function hashedHostField(host: string, salt: Buffer): string {
	const hash = createHmac('sha1', salt).update(host).digest();
	return `|1|${salt.toString('base64')}|${hash.toString('base64')}`;
}

suite('sshKnownHosts', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('computeHostKeyFingerprint', () => {
		test('matches the ssh-keygen -lf format for a known key', () => {
			// Golden value: this exact blob and fingerprint pair was verified
			// against `ssh-keygen -lf` so a change in encoding is caught here
			// rather than only showing up against a live server.
			const blob = Buffer.from(
				'AAAAC3NzaC1lZDI1NTE5AAAAIJ5SStkj9JLI/lWstJ2hIit3/xB+2xVeUesa/GlxqHFz',
				'base64');
			assert.deepStrictEqual(
				{
					fingerprint: computeHostKeyFingerprint(blob),
					keyType: readHostKeyType(blob),
				},
				{
					fingerprint: 'SHA256:yvH+SxFjYRQ8Vcgn8CFkUoghmVAaLoQjp+kmo5k7y/8',
					keyType: 'ssh-ed25519',
				});
		});

		test('strips base64 padding', () => {
			assert.ok(!computeHostKeyFingerprint(ED25519_A).includes('='));
		});
	});

	suite('readHostKeyType', () => {
		test('reads the algorithm and rejects malformed blobs', () => {
			const lying = Buffer.alloc(8);
			lying.writeUInt32BE(0xffff, 0);
			assert.deepStrictEqual(
				{
					ed25519: readHostKeyType(ED25519_A),
					rsa: readHostKeyType(RSA_A),
					empty: readHostKeyType(Buffer.alloc(0)),
					truncated: readHostKeyType(Buffer.alloc(2)),
					lengthPastEnd: readHostKeyType(lying),
				},
				{
					ed25519: 'ssh-ed25519',
					rsa: 'ssh-rsa',
					empty: undefined,
					truncated: undefined,
					lengthPastEnd: undefined,
				});
		});
	});

	suite('parseKnownHostsLine', () => {
		test('parses a plain entry', () => {
			const entry = parseKnownHostsLine(line('example.com', ED25519_A));
			assert.deepStrictEqual(
				{
					patterns: entry?.patterns,
					keyType: entry?.keyType,
					marker: entry?.marker,
					keyMatches: entry?.key.equals(ED25519_A),
				},
				{ patterns: ['example.com'], keyType: 'ssh-ed25519', marker: undefined, keyMatches: true });
		});

		test('parses comma-separated patterns and markers', () => {
			const multi = parseKnownHostsLine(line('a.example.com,b.example.com,1.2.3.4', ED25519_A));
			const revoked = parseKnownHostsLine(line('example.com', ED25519_A, '@revoked'));
			const ca = parseKnownHostsLine(line('*.example.com', ED25519_A, '@cert-authority'));
			assert.deepStrictEqual(
				{
					patterns: multi?.patterns,
					revokedMarker: revoked?.marker,
					caMarker: ca?.marker,
				},
				{
					patterns: ['a.example.com', 'b.example.com', '1.2.3.4'],
					revokedMarker: 'revoked',
					caMarker: 'cert-authority',
				});
		});

		test('parses a hashed entry', () => {
			const salt = randomBytes(20);
			const entry = parseKnownHostsLine(`${hashedHostField('example.com', salt)} ssh-ed25519 ${ED25519_A.toString('base64')}`);
			assert.deepStrictEqual(
				{
					saltMatches: entry?.hashedHost?.salt.equals(salt),
					hashLength: entry?.hashedHost?.hash.length,
					patterns: entry?.patterns,
				},
				{ saltMatches: true, hashLength: 20, patterns: [] });
		});

		test('skips blanks, comments and malformed lines', () => {
			const typeMismatch = `example.com ssh-rsa ${ED25519_A.toString('base64')}`;
			assert.deepStrictEqual(
				{
					blank: parseKnownHostsLine('   '),
					comment: parseKnownHostsLine('# a comment'),
					tooFewFields: parseKnownHostsLine('example.com ssh-ed25519'),
					unknownMarker: parseKnownHostsLine(line('example.com', ED25519_A, '@bogus')),
					// The line claims ssh-rsa but the blob says ssh-ed25519.
					// Trusting the label would let a mislabeled entry match a
					// key type it does not actually hold.
					typeDisagreesWithBlob: parseKnownHostsLine(typeMismatch),
					shortHashedHash: parseKnownHostsLine(`|1|${randomBytes(20).toString('base64')}|${randomBytes(4).toString('base64')} ssh-ed25519 ${ED25519_A.toString('base64')}`),
				},
				{
					blank: undefined,
					comment: undefined,
					tooFewFields: undefined,
					unknownMarker: undefined,
					typeDisagreesWithBlob: undefined,
					shortHashedHash: undefined,
				});
		});
	});

	suite('matchKnownHosts', () => {
		const match = (contents: string, host: string, port: number, blob: Buffer) =>
			matchKnownHosts(parseKnownHosts(contents), host, port, readHostKeyType(blob)!, blob);

		test('matches, mismatches and reports unknown hosts', () => {
			const known = line('example.com', ED25519_A);
			assert.deepStrictEqual(
				{
					exact: match(known, 'example.com', 22, ED25519_A),
					caseInsensitive: match(known, 'EXAMPLE.COM', 22, ED25519_A),
					changedKey: match(known, 'example.com', 22, ED25519_B),
					otherHost: match(known, 'other.com', 22, ED25519_A),
					empty: match('', 'example.com', 22, ED25519_A),
				},
				{
					exact: 'match',
					caseInsensitive: 'match',
					changedKey: 'mismatch',
					otherHost: 'unknown',
					empty: 'unknown',
				});
		});

		test('scopes mismatch to the same key type', () => {
			// A host with only an RSA entry that presents an ed25519 key is
			// unknown, not evidence of an attack. Reporting `mismatch` here
			// would fire a false alarm for every RSA-only user, since ssh2
			// negotiates ed25519 first.
			const rsaOnly = line('example.com', RSA_A);
			assert.deepStrictEqual(
				{
					differentType: match(rsaOnly, 'example.com', 22, ED25519_A),
					sameType: match(rsaOnly, 'example.com', 22, RSA_A),
				},
				{ differentType: 'unknown', sameType: 'match' });
		});

		test('handles non-default ports via the bracket form', () => {
			const bracketed = line('[example.com]:2222', ED25519_A);
			const bare = line('example.com', ED25519_A);
			assert.deepStrictEqual(
				{
					bracketedOnCustomPort: match(bracketed, 'example.com', 2222, ED25519_A),
					bracketedOnDefaultPort: match(bracketed, 'example.com', 22, ED25519_A),
					bareOnCustomPort: match(bare, 'example.com', 2222, ED25519_A),
				},
				{
					bracketedOnCustomPort: 'match',
					bracketedOnDefaultPort: 'unknown',
					bareOnCustomPort: 'unknown',
				});
		});

		test('supports glob patterns and negation', () => {
			const glob = line('*.example.com', ED25519_A);
			const negated = line('*.example.com,!secret.example.com', ED25519_A);
			assert.deepStrictEqual(
				{
					globMatches: match(glob, 'host.example.com', 22, ED25519_A),
					globMissesOtherDomain: match(glob, 'host.other.com', 22, ED25519_A),
					singleChar: match(line('host?.example.com', ED25519_A), 'host1.example.com', 22, ED25519_A),
					// A negation must veto the whole entry even though the
					// wildcard on the same line also matches.
					negatedHost: match(negated, 'secret.example.com', 22, ED25519_A),
					nonNegatedHost: match(negated, 'public.example.com', 22, ED25519_A),
				},
				{
					globMatches: 'match',
					globMissesOtherDomain: 'unknown',
					singleChar: 'match',
					negatedHost: 'unknown',
					nonNegatedHost: 'match',
				});
		});

		test('matches hashed entries', () => {
			const salt = randomBytes(20);
			const hashed = `${hashedHostField('example.com', salt)} ssh-ed25519 ${ED25519_A.toString('base64')}`;
			assert.deepStrictEqual(
				{
					sameKey: match(hashed, 'example.com', 22, ED25519_A),
					changedKey: match(hashed, 'example.com', 22, ED25519_B),
					otherHost: match(hashed, 'other.com', 22, ED25519_A),
				},
				{ sameKey: 'match', changedKey: 'mismatch', otherHost: 'unknown' });
		});

		test('revocation overrides an otherwise matching entry', () => {
			// The revoked key is also listed as trusted; revocation must win,
			// or an explicitly revoked key could still be accepted.
			const contents = [
				line('example.com', ED25519_A),
				line('example.com', ED25519_A, '@revoked'),
			].join('\n');
			assert.deepStrictEqual(
				{
					revokedKey: match(contents, 'example.com', 22, ED25519_A),
					otherKey: match(contents, 'example.com', 22, ED25519_B),
				},
				{ revokedKey: 'revoked', otherKey: 'mismatch' });
		});

		test('reports ca-only when the host is covered solely by a cert authority', () => {
			const ca = line('*.example.com', ED25519_A, '@cert-authority');
			assert.deepStrictEqual(
				{
					caOnly: match(ca, 'host.example.com', 22, ED25519_B),
					// A normal entry alongside the CA line still decides.
					caPlusNormal: match([ca, line('host.example.com', ED25519_B)].join('\n'), 'host.example.com', 22, ED25519_B),
				},
				{ caOnly: 'ca-only', caPlusNormal: 'match' });
		});
	});
});
