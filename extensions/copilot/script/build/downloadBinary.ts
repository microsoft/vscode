/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as tar from 'tar';
import * as zlib from 'zlib';

const REPO_ROOT = path.join(__dirname, '..', '..');

export interface IBinary {
	url: string;
	sha256: string;
	destination: string;
}

export async function ensureBinary(binary: IBinary) {
	const binaryPath = path.join(REPO_ROOT, binary.destination);
	if (fs.existsSync(binaryPath)) {
		const sha256 = await computeSha256(binaryPath);
		if (sha256 === binary.sha256) {
			console.log(`Binary ${binary.destination} already exists and matches expected checksum.`);
			return;
		}
		console.log(`Binary ${binary.destination} already exists but does not match expected checksum. \n - Expected: ${binary.sha256}\n - Actual: ${sha256}\nRe-downloading...`);
	}

	console.log(`Downloading binary ${binary.destination}...`);
	await fs.promises.mkdir(path.dirname(binaryPath), { recursive: true });
	const tempPath = path.join(path.dirname(binaryPath), crypto.randomUUID() + '.tgz');
	try {
		await downloadFile(binary.url, tempPath);
		await untar(tempPath, path.dirname(binaryPath), /*strip*/2);
		const sha256 = await computeSha256(binaryPath);
		if (sha256 !== binary.sha256) {
			throw new Error(`Downloaded binary ${binary.destination} does not match expected checksum. Expected: ${binary.sha256}, actual: ${sha256}.`);
		}
	} finally {
		await fs.promises.unlink(tempPath);
	}
}

export function computeSha256(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

export function downloadFile(url: string, tempPath: string, headers?: Record<string, string>): Promise<void> {
	return new Promise((resolve, reject) => {
		https.get(url, { headers }, (response) => {
			if (response.headers.location) {
				console.log(`Following redirect to ${response.headers.location}`);
				return downloadFile(response.headers.location, tempPath).then(resolve, reject);
			}

			if (response.statusCode === 404) {
				return reject(new Error(`File not found: ${url}`));
			}

			const file = fs.createWriteStream(tempPath);
			response.pipe(file);
			file.on('finish', () => {
				file.close();
				resolve();
			});

		}).on('error', (err) => {
			fs.unlink(tempPath, () => reject(err));
		});
	});
}

export function get(url: string, opts: https.RequestOptions): Promise<string> {
	return new Promise((resolve, reject) => {
		let result = '';
		https.get(url, opts, response => {
			if (response.headers.location) {
				console.log(`Following redirect to ${response.headers.location}`);
				get(response.headers.location, opts).then(resolve, reject);
			}

			if (response.statusCode !== 200) {
				reject(new Error('Request failed: ' + response.statusCode));
			}

			response.on('data', d => {
				result += d.toString();
			});

			response.on('end', () => {
				resolve(result);
			});

			response.on('error', e => {
				reject(e);
			});
		});
	});
}

export function untar(filePath: string, destination: string, strip?: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(filePath);
		const writeStream = zlib.createGunzip();
		const extractStream = tar.extract({
			cwd: destination,
			strip,
			strict: true,
			onentry: (entry: any) => {
				console.log(`Extracting ${entry.path}`);
			}
		});

		readStream.on('error', reject);
		writeStream.on('error', reject);
		extractStream.on('error', reject);

		extractStream.on('end', () => {
			resolve();
		});

		readStream.pipe(writeStream).pipe(extractStream);
	});
}
