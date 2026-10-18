/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function getKeyFromPFX(pfx: string): string {
	return convertPFX(pfx, ['-nocerts', '-nodes'], raw => {
		const key = raw.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0];
		if (!key) {
			throw new Error('No private key found in PFX');
		}
		return key;
	});
}

export function getCertificatesFromPFX(pfx: string): string[] {
	return convertPFX(pfx, ['-nokeys'], raw => {
		const matches = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
		if (!matches) {
			throw new Error('No certificates found in PFX');
		}
		return matches.reverse();
	});
}

function convertPFX<T>(pfx: string, args: readonly string[], extract: (raw: string) => T): T {
	// Artifact workers share os.tmpdir(), so each conversion must own both its PFX and PEM paths.
	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-pfx-'));
	const pfxPath = path.join(temporaryDirectory, 'cert.pfx');
	const pemPath = path.join(temporaryDirectory, 'output.pem');
	let result: T;

	try {
		fs.writeFileSync(pfxPath, Buffer.from(pfx, 'base64'));
		cp.execFileSync('openssl', ['pkcs12', '-in', pfxPath, ...args, '-out', pemPath, '-passin', 'pass:']);
		result = extract(fs.readFileSync(pemPath, 'utf-8'));
	} catch (error) {
		try {
			fs.rmSync(temporaryDirectory, { recursive: true, force: true });
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], 'PFX conversion and temporary file cleanup failed', { cause: error });
		}
		throw error;
	}

	fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	return result;
}
