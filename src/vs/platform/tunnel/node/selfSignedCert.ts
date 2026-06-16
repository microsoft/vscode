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
		derTime(now),
		derTime(notAfter),
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
	} else if (length < 0x10000) {
		return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
	} else if (length < 0x1000000) {
		return Buffer.from([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
	} else {
		// X.690 section 8.1.3 allows up to 0x7f length octets, but anything
		// beyond 3 bytes (16 MiB) is well outside our use case and most
		// likely indicates a bug. Fail loudly rather than silently emit
		// a truncated, malformed length.
		throw new Error(`derLength: value too large (${length})`);
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
	// Canonical DER INTEGER encoding (X.690 section 8.3.2): the contents octets
	// must use the smallest number of octets. Strip leading 0x00 bytes
	// that are not needed to keep the high bit unset, then prepend a
	// single 0x00 if the high bit is set (to keep the value positive).
	// INTEGER value MUST contain at least one octet.
	if (value.length === 0) {
		throw new Error('derInteger: value must be non-empty');
	}
	let start = 0;
	while (start < value.length - 1 && value[start] === 0 && (value[start + 1] & 0x80) === 0) {
		start++;
	}
	let content = value.subarray(start);
	if (content[0] & 0x80) {
		content = Buffer.concat([Buffer.from([0x00]), content]);
	}
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

function derTime(date: Date): Buffer {
	// RFC 5280 section 4.1.2.5: CAs MUST encode times through 2049 as UTCTime
	// (YY...) and times from 2050 onward as GeneralizedTime (YYYY...).
	// UTCTime two-digit years 50-99 are interpreted as 1950-1999 and
	// 00-49 as 2000-2049, so a UTCTime for 2050 would be misread as 1950.
	const iso = date.toISOString().replace(/[-:T]/g, '');
	const year = date.getUTCFullYear();
	if (year >= 1950 && year < 2050) {
		// UTCTime: YYMMDDHHMMSSZ
		const content = Buffer.from(iso.substring(2, 14) + 'Z', 'ascii');
		return Buffer.concat([Buffer.from([0x17]), derLength(content.length), content]);
	} else {
		// GeneralizedTime: YYYYMMDDHHMMSSZ
		const content = Buffer.from(iso.substring(0, 14) + 'Z', 'ascii');
		return Buffer.concat([Buffer.from([0x18]), derLength(content.length), content]);
	}
}

// #endregion
