/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Public keys and user certificates (signed by a throwaway test CA) generated
// with `ssh-keygen`. No private key material is needed: matching only reads
// public data.

export const ED25519_PUBLIC_KEY = Buffer.from([
	'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM500nB+AVfEBCDtYQmeSCcyBlPEWWVssiJBo9yXzs0u',
].join('\n') + '\n');

export const ED25519_CERTIFICATE = Buffer.from([
	'ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQtdjAxQG9wZW5zc2guY29tAAAAIL2o+XqFkiHytwGS6s9lesiiuffQR/z0QGlOKdMFZqWMAAAAIM500nB+AVfEBCDtYQmeSCcyBlPEWWVssiJBo9yXzs0uAAAAAAAAAAEAAAABAAAAFHNzaDItdGVzdC1pZF9lZDI1NTE5AAAADQAAAAlDZXJ0IFVzZXIAAAAAAAAAAP//////////AAAAAAAAAIIAAAAVcGVybWl0LVgxMS1mb3J3YXJkaW5nAAAAAAAAABdwZXJtaXQtYWdlbnQtZm9yd2FyZGluZwAAAAAAAAAWcGVybWl0LXBvcnQtZm9yd2FyZGluZwAAAAAAAAAKcGVybWl0LXB0eQAAAAAAAAAOcGVybWl0LXVzZXItcmMAAAAAAAAAAAAAADMAAAALc3NoLWVkMjU1MTkAAAAg3uJxCeKXnDyyWRrPsLn4Srn8qRQVRfNO+7ME2VcDb+UAAABTAAAAC3NzaC1lZDI1NTE5AAAAQK2ZWEQPzYtrgyyL3rA37Ru40Lpf3vpS2KmJHm2TfaN/9iGTkamsGZc1baj849FSnY5TIscWjNj3V4F5AD+QeQ4= test/fixtures/certs/id_ed25519.pub',
].join('\n') + '\n');

export const ECDSA_PUBLIC_KEY = Buffer.from([
	'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBL6ozx85LzRR3dYVFzF/ZFSwLI+6AgbLMmgRLw3vLpjHuH+6JGqWAmizXRl7sBUbiU2apUczW29xF9Ak3/VskBs=',
].join('\n') + '\n');

export const ECDSA_CERTIFICATE = Buffer.from([
	'ecdsa-sha2-nistp256-cert-v01@openssh.com AAAAKGVjZHNhLXNoYTItbmlzdHAyNTYtY2VydC12MDFAb3BlbnNzaC5jb20AAAAgIvNg2eTT2BTr6ky7e28n3ZB1P03G5pMbzwGRO0MNYA0AAAAIbmlzdHAyNTYAAABBBL6ozx85LzRR3dYVFzF/ZFSwLI+6AgbLMmgRLw3vLpjHuH+6JGqWAmizXRl7sBUbiU2apUczW29xF9Ak3/VskBsAAAAAAAAAAQAAAAEAAAASc3NoMi10ZXN0LWlkX2VjZHNhAAAADQAAAAlDZXJ0IFVzZXIAAAAAAAAAAP//////////AAAAAAAAAIIAAAAVcGVybWl0LVgxMS1mb3J3YXJkaW5nAAAAAAAAABdwZXJtaXQtYWdlbnQtZm9yd2FyZGluZwAAAAAAAAAWcGVybWl0LXBvcnQtZm9yd2FyZGluZwAAAAAAAAAKcGVybWl0LXB0eQAAAAAAAAAOcGVybWl0LXVzZXItcmMAAAAAAAAAAAAAADMAAAALc3NoLWVkMjU1MTkAAAAg3uJxCeKXnDyyWRrPsLn4Srn8qRQVRfNO+7ME2VcDb+UAAABTAAAAC3NzaC1lZDI1NTE5AAAAQAQnCtLVw4FkDGP95N6JZahyBdn/fHLEfS8G7nIxVFRhwQoInf4nxS1GEmLuKLSxYMJXndN23OVsNfEFecwBIwI= test/fixtures/certs/id_ecdsa.pub',
].join('\n') + '\n');

function sshString(value: Buffer | string): Buffer {
	const valueBuffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
	const lengthBuffer = Buffer.alloc(4);
	lengthBuffer.writeUInt32BE(valueBuffer.length, 0);
	return Buffer.concat([lengthBuffer, valueBuffer]);
}

/**
 * Build an `openssh-key-v1` private key container whose header carries the
 * public key from `publicKeyLine`. The private section is a placeholder, which
 * is enough for code that only inspects the unencrypted header.
 */
export function openSSHPrivateKeyFor(publicKeyLine: Buffer, cipher = 'none'): Buffer {
	const publicBlob = Buffer.from(publicKeyLine.toString().split(/\s+/)[1], 'base64');
	const count = Buffer.alloc(4);
	count.writeUInt32BE(1, 0);
	const data = Buffer.concat([
		Buffer.from('openssh-key-v1\0', 'utf8'),
		sshString(cipher),
		sshString(cipher === 'none' ? 'none' : 'bcrypt'),
		sshString(''),
		count,
		sshString(publicBlob),
		sshString('placeholder'),
	]);
	return Buffer.from(`-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----\n`);
}
