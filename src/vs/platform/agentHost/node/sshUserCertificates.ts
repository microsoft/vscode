/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for pairing OpenSSH user certificates (`*-cert.pub`) with private
 * keys, following the format described in OpenSSH's PROTOCOL.certkeys.
 */

const CERT_TYPE_SUFFIX = '-cert-v01@openssh.com';
const OPENSSH_KEY_MAGIC = Buffer.from('openssh-key-v1\0', 'utf8');

function readSSHBytes(buffer: Buffer, offset: number): { value: Buffer; offset: number } | undefined {
	if (offset + 4 > buffer.length) {
		return undefined;
	}
	const length = buffer.readUInt32BE(offset);
	const valueOffset = offset + 4;
	const nextOffset = valueOffset + length;
	if (nextOffset > buffer.length) {
		return undefined;
	}
	return { value: buffer.subarray(valueOffset, nextOffset), offset: nextOffset };
}

/** Parse the binary blob of a one-line OpenSSH public key or certificate (`<type> <base64> [comment]`). */
export function parseOpenSSHPublicKeyLine(contents: Buffer | string): { type: string; blob: Buffer } | undefined {
	const line = contents.toString().split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#'));
	const match = line && /^(\S+)\s+([A-Za-z0-9+/]+={0,2})(?:\s|$)/.exec(line);
	if (!match) {
		return undefined;
	}
	const blob = Buffer.from(match[2], 'base64');
	const type = readSSHBytes(blob, 0)?.value.toString('utf8');
	if (type !== match[1]) {
		return undefined;
	}
	return { type, blob };
}

/** Return true when the given key type names an OpenSSH certificate. */
export function isOpenSSHCertificateType(type: string): boolean {
	return type.endsWith(CERT_TYPE_SUFFIX);
}

/**
 * Read the public key blob stored in the unencrypted header of an
 * `openssh-key-v1` private key, which is available even when the private part
 * is passphrase-protected. Returns `undefined` for other key formats.
 */
export function getOpenSSHPrivateKeyPublicBlob(key: Buffer): Buffer | undefined {
	const armored = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END OPENSSH PRIVATE KEY-----/.exec(key.toString('utf8'));
	if (!armored) {
		return undefined;
	}
	const data = Buffer.from(armored[1].replace(/\s+/g, ''), 'base64');
	if (data.length < OPENSSH_KEY_MAGIC.length || !data.subarray(0, OPENSSH_KEY_MAGIC.length).equals(OPENSSH_KEY_MAGIC)) {
		return undefined;
	}
	let offset = OPENSSH_KEY_MAGIC.length;
	// ciphername, kdfname, kdfoptions
	for (let i = 0; i < 3; i++) {
		const field = readSSHBytes(data, offset);
		if (!field) {
			return undefined;
		}
		offset = field.offset;
	}
	if (offset + 4 > data.length || data.readUInt32BE(offset) < 1) {
		return undefined;
	}
	return readSSHBytes(data, offset + 4)?.value;
}

/**
 * Return true when the certificate certifies the given plain public key blob.
 * A certificate blob is `string certType, string nonce, <key fields>, ...`
 * while a public key blob is `string keyType, <key fields>`, so the key fields
 * of the public key must appear right after the certificate nonce.
 */
export function certificateMatchesPublicKey(certificateBlob: Buffer, publicKeyBlob: Buffer): boolean {
	const certType = readSSHBytes(certificateBlob, 0);
	const keyType = readSSHBytes(publicKeyBlob, 0);
	if (!certType || !keyType) {
		return false;
	}
	const expectedCertType = keyType.value.toString('utf8').replace(/@openssh\.com$/, '') + CERT_TYPE_SUFFIX;
	if (certType.value.toString('utf8') !== expectedCertType) {
		return false;
	}
	const nonce = readSSHBytes(certificateBlob, certType.offset);
	if (!nonce) {
		return false;
	}
	const keyFields = publicKeyBlob.subarray(keyType.offset);
	return keyFields.length > 0 && certificateBlob.subarray(nonce.offset, nonce.offset + keyFields.length).equals(keyFields);
}
