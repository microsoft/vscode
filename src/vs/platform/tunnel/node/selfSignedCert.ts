/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Result of generating a self-signed certificate.
 */
export interface ISelfSignedCert {
	/** PEM-encoded private key. */
	key: string;
	/** PEM-encoded X.509 certificate. */
	cert: string;
	/** SHA-256 fingerprint in Electron's format: `sha256/<base64>`. */
	fingerprint: string;
}

/**
 * Generate a self-signed ECDSA (P-256) certificate for `127.0.0.1` using
 * only Node's built-in `crypto` module. The certificate is valid for one
 * year from the current time.
 *
 * The raw ASN.1/DER construction avoids external dependencies. Only a
 * minimal X.509 v3 certificate is produced — just enough for TLS on the
 * loopback interface with certificate pinning.
 *
 * **Security note:** this certificate is a defence-in-depth measure for a
 * proxy that is already bound exclusively to `127.0.0.1`. TLS prevents
 * other local processes from passively sniffing tunnel traffic and the
 * pinned fingerprint stops active MITM on loopback. If certificate
 * generation fails the proxy simply will not start — the failure is
 * non-critical to the overall application.
 *
 * Do not rely on this certificate for security-critical scenarios.
 */
export async function generateSelfSignedCert(): Promise<ISelfSignedCert> {
	const crypto = await import('crypto');

	const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
		namedCurve: 'prime256v1',
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});

	const cert = createSelfSignedCertPem(crypto, privateKey, publicKey);

	// Compute SHA-256 fingerprint in Electron's format: "sha256/<base64>"
	const certDer = pemToDer(cert);
	const hash = crypto.createHash('sha256').update(certDer).digest('base64');
	const fingerprint = `sha256/${hash}`;

	return { key: privateKey, cert, fingerprint };
}

/**
 * Build a minimal self-signed X.509 v3 certificate in DER, then
 * PEM-encode it. Uses raw ASN.1 construction to avoid external
 * dependencies.
 */
function createSelfSignedCertPem(
	crypto: typeof import('crypto'),
	privateKeyPem: string,
	publicKeyPem: string,
): string {
	// Parse the SPKI public key from PEM
	const spkiDer = pemToDer(publicKeyPem);

	// Build the TBS (To Be Signed) certificate
	const serial = crypto.randomBytes(8);
	// Ensure serial is positive (clear high bit)
	serial[0] &= 0x7f;

	const now = new Date();
	const notAfter = new Date(now);
	notAfter.setFullYear(now.getFullYear() + 1);

	const cnOid = derOid(Buffer.from([0x55, 0x04, 0x03])); // 2.5.4.3

	const issuerAndSubject = derSequence([
		derSet([
			derSequence([
				cnOid,
				derUtf8String('TunnelProxy'),
			]),
		]),
	]);

	// Validity
	const validity = derSequence([
		derUtcTime(now),
		derUtcTime(notAfter),
	]);

	// Version v3 [0] EXPLICIT INTEGER 2
	const version = Buffer.from([0xa0, 0x03, 0x02, 0x01, 0x02]);

	// Serial number
	const serialNumber = derInteger(serial);

	// Signature algorithm: ecdsa-with-SHA256 (1.2.840.10045.4.3.2)
	const sigAlgOidBytes = Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
	const sigAlg = derSequence([derOid(sigAlgOidBytes)]);

	// Extensions [3] EXPLICIT SEQUENCE — SAN with IP 127.0.0.1
	const sanExtension = buildSanExtension();
	const extensions = Buffer.concat([
		Buffer.from([0xa3]),
		derLengthPrefix(derSequence([sanExtension])),
	]);

	// TBSCertificate
	const tbs = derSequence([
		version,
		serialNumber,
		sigAlg,
		issuerAndSubject,
		validity,
		issuerAndSubject,
		spkiDer,
		extensions,
	]);

	// Sign the TBS
	const signer = crypto.createSign('SHA256');
	signer.update(tbs);
	const signature = signer.sign(privateKeyPem);

	// Wrap signature as BIT STRING
	const sigBitString = Buffer.concat([
		Buffer.from([0x03]),
		derLength(signature.length + 1),
		Buffer.from([0x00]), // no unused bits
		signature,
	]);

	// Full certificate
	const certDer = derSequence([tbs, sigAlg, sigBitString]);

	// PEM encode
	const b64 = certDer.toString('base64');
	const lines: string[] = [];
	for (let i = 0; i < b64.length; i += 64) {
		lines.push(b64.substring(i, i + 64));
	}
	return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

/** Build a SAN extension with IP:127.0.0.1 */
function buildSanExtension(): Buffer {
	// Extension OID: 2.5.29.17 (subjectAltName)
	const sanOid = derOid(Buffer.from([0x55, 0x1d, 0x11]));

	// GeneralName: iPAddress [7] 127.0.0.1
	const ipBytes = Buffer.from([0x87, 0x04, 0x7f, 0x00, 0x00, 0x01]);

	const sanValue = derOctetString(derSequence([ipBytes]));

	return derSequence([sanOid, sanValue]);
}

// #region ASN.1 DER helpers

function pemToDer(pem: string): Buffer {
	const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
	return Buffer.from(b64, 'base64');
}

function derLength(length: number): Buffer {
	if (length < 0x80) {
		return Buffer.from([length]);
	} else if (length < 0x100) {
		return Buffer.from([0x81, length]);
	} else {
		return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
	}
}

function derLengthPrefix(content: Buffer): Buffer {
	return Buffer.concat([derLength(content.length), content]);
}

function derSequence(items: Buffer[]): Buffer {
	const content = Buffer.concat(items);
	return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content]);
}

function derSet(items: Buffer[]): Buffer {
	const content = Buffer.concat(items);
	return Buffer.concat([Buffer.from([0x31]), derLength(content.length), content]);
}

function derInteger(value: Buffer): Buffer {
	// Ensure positive — prepend 0x00 if high bit set
	const needsPad = value[0] & 0x80;
	const content = needsPad ? Buffer.concat([Buffer.from([0x00]), value]) : value;
	return Buffer.concat([Buffer.from([0x02]), derLength(content.length), content]);
}

function derOid(value: Buffer): Buffer {
	return Buffer.concat([Buffer.from([0x06]), derLength(value.length), value]);
}

function derUtf8String(str: string): Buffer {
	const content = Buffer.from(str, 'utf8');
	return Buffer.concat([Buffer.from([0x0c]), derLength(content.length), content]);
}

function derOctetString(content: Buffer): Buffer {
	return Buffer.concat([Buffer.from([0x04]), derLength(content.length), content]);
}

function derUtcTime(date: Date): Buffer {
	const s = date.toISOString().replace(/[-:T]/g, '').substring(2, 14) + 'Z';
	const content = Buffer.from(s, 'ascii');
	return Buffer.concat([Buffer.from([0x17]), derLength(content.length), content]);
}

// #endregion
