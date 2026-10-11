/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import cp from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, afterEach, before, beforeEach, mock, suite, test } from 'node:test';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { getCertificatesFromPFX, getKeyFromPFX } from '../pfx.ts';

type Conversion = 'key' | 'certificates';

interface ConversionInput {
	kind: Conversion;
	pfx: string;
	failCleanup?: boolean;
	failIO?: 'write' | 'read';
	synchronization?: { signals: SharedArrayBuffer; index: number };
}

interface ConversionResult {
	directory: string;
	identities?: string[];
	error?: {
		message: string;
		originalPreserved: boolean;
		cleanupPreserved: boolean;
		causePreserved: boolean;
	};
}

function publicIdentity(key: crypto.KeyObject): string {
	return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

function waitFor(signals: Int32Array, index: number): void {
	assert.notStrictEqual(Atomics.wait(signals, index, 0, 10_000), 'timed-out', `Worker synchronization ${index} timed out`);
}

function signal(signals: Int32Array, index: number): void {
	Atomics.store(signals, index, 1);
	Atomics.notify(signals, index);
}

if (!isMainThread) {
	const input: ConversionInput = workerData;
	const signals = input.synchronization && new Int32Array(input.synchronization.signals);
	const writeFileSync = fs.writeFileSync;
	const execFileSync = cp.execFileSync;
	const cleanupError = new Error('Synthetic cleanup failure');
	const ioError = new Error('Synthetic I/O failure');
	let originalError: unknown;
	const result: ConversionResult = { directory: '' };

	try {
		mock.method(fs, 'writeFileSync', (file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
			assert.ok(typeof file === 'string');
			result.directory = path.dirname(file);
			writeFileSync(file, data, options);
			if (input.failIO === 'write') {
				originalError = ioError;
				throw ioError;
			}
			if (signals) {
				if (input.synchronization!.index === 0) {
					signal(signals, 0);
					waitFor(signals, 1);
				} else {
					signal(signals, 1);
					waitFor(signals, 2);
				}
			}
		});
		mock.method(cp, 'execFileSync', (file: string, args: readonly string[]) => {
			try {
				return execFileSync(file, args, { stdio: 'pipe', timeout: 10_000 });
			} catch (error) {
				originalError = error;
				throw error;
			}
		});
		if (input.failCleanup) {
			mock.method(fs, 'rmSync', () => { throw cleanupError; });
		}
		if (input.failIO === 'read') {
			mock.method(fs, 'readFileSync', () => {
				originalError = ioError;
				throw ioError;
			});
		}
		if (signals && input.synchronization!.index === 1) {
			waitFor(signals, 0);
		}

		result.identities = input.kind === 'key'
			? [publicIdentity(crypto.createPublicKey(getKeyFromPFX(input.pfx)))]
			: getCertificatesFromPFX(input.pfx).map(certificate => new crypto.X509Certificate(certificate).fingerprint256);
	} catch (error) {
		result.error = {
			message: error instanceof Error ? error.message : String(error),
			originalPreserved: error === originalError || error instanceof AggregateError && error.errors.includes(originalError),
			cleanupPreserved: error === cleanupError || error instanceof AggregateError && error.errors.includes(cleanupError),
			causePreserved: error instanceof Error && error.cause === originalError,
		};
	} finally {
		mock.restoreAll();
		if (signals && input.synchronization!.index === 0) {
			signal(signals, 2);
		}
	}
	parentPort!.postMessage(result);
} else {
	suite('PFX conversion', { timeout: 30_000 }, () => {
		let root: string;
		let temporaryDirectory: string;
		let certificates: { pfx: string; keyIdentity: string; certificateIdentity: string }[];
		let certificateBundle: string;
		let certificateOnly: string;
		let keyOnly: string;
		const invalidPFX = Buffer.from('Not a PKCS#12 certificate').toString('base64');

		before(() => {
			root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-pfx-test-'));
			certificates = ['auth', 'signing'].map(name => {
				const key = path.join(root, `${name}.key`);
				const certificate = path.join(root, `${name}.pem`);
				const pfx = path.join(root, `${name}.pfx`);
				cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', `/CN=synthetic-${name}`], { stdio: 'pipe', timeout: 10_000 });
				cp.execFileSync('openssl', ['pkcs12', '-export', '-inkey', key, '-in', certificate, '-out', pfx, '-passout', 'pass:'], { stdio: 'pipe', timeout: 10_000 });
				const parsedCertificate = new crypto.X509Certificate(fs.readFileSync(certificate));
				return {
					pfx: fs.readFileSync(pfx).toString('base64'),
					keyIdentity: publicIdentity(parsedCertificate.publicKey),
					certificateIdentity: parsedCertificate.fingerprint256,
				};
			});
			const exportPFX = (name: string, args: string[]) => {
				const file = path.join(root, `${name}.pfx`);
				cp.execFileSync('openssl', ['pkcs12', '-export', ...args, '-out', file, '-passout', 'pass:'], { stdio: 'pipe', timeout: 10_000 });
				return fs.readFileSync(file).toString('base64');
			};
			certificateBundle = exportPFX('bundle', ['-inkey', path.join(root, 'auth.key'), '-in', path.join(root, 'auth.pem'), '-certfile', path.join(root, 'signing.pem')]);
			certificateOnly = exportPFX('certificate-only', ['-nokeys', '-in', path.join(root, 'auth.pem')]);
			keyOnly = exportPFX('key-only', ['-nocerts', '-inkey', path.join(root, 'auth.key')]);
		});
		after(() => {
			fs.rmSync(root, { recursive: true, force: true });
		});
		beforeEach(() => {
			temporaryDirectory = fs.mkdtempSync(path.join(root, 'conversion with spaces-'));
		});
		afterEach(() => {
			fs.rmSync(temporaryDirectory, { recursive: true, force: true });
		});

		async function convert(inputs: ConversionInput[]): Promise<ConversionResult[]> {
			const workers: Worker[] = [];
			try {
				return await Promise.all(inputs.map(input => new Promise<ConversionResult>((resolve, reject) => {
					const worker = new Worker(import.meta.filename, {
						workerData: input,
						env: { ...process.env, TMP: temporaryDirectory, TEMP: temporaryDirectory, TMPDIR: temporaryDirectory },
					});
					workers.push(worker);
					let result: ConversionResult | undefined;
					worker.once('message', (message: ConversionResult) => { result = message; });
					worker.once('error', reject);
					worker.once('exit', code => {
						if (code !== 0 || !result) {
							reject(new Error(`Conversion worker exited with code ${code} without a result`));
						} else {
							resolve(result);
						}
					});
				})));
			} finally {
				await Promise.all(workers.map(worker => worker.terminate()));
			}
		}

		test('preserves certificate order and private key identity', async () => {
			const [key] = await convert([{ kind: 'key', pfx: certificateBundle }]);
			const [chain] = await convert([{ kind: 'certificates', pfx: certificateBundle }]);
			assert.deepStrictEqual({
				key: key.identities,
				certificates: chain.identities,
				errors: [key.error, chain.error],
				remaining: fs.readdirSync(temporaryDirectory),
			}, {
				key: [certificates[0].keyIdentity],
				certificates: [certificates[1].certificateIdentity, certificates[0].certificateIdentity],
				errors: [undefined, undefined],
				remaining: [],
			});
		});

		for (const first of ['key', 'certificates'] as const) {
			for (const second of ['key', 'certificates'] as const) {
				test(`isolates concurrent ${first}/${second} conversions and cleanup`, async () => {
					const sentinels = ['cert.pfx', 'key.pem', 'cert.pem'];
					for (const name of sentinels) {
						fs.writeFileSync(path.join(temporaryDirectory, name), 'Not owned by a conversion');
					}
					const signals = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
					// Both inputs are written before the first conversion; its cleanup precedes the second conversion.
					const results = await convert([first, second].map((kind, index) => ({
						kind, pfx: certificates[index].pfx, synchronization: { signals, index },
					})));
					assert.deepStrictEqual({
						identities: results.map(result => result.identities),
						errors: results.map(result => result.error?.message),
						directories: new Set(results.map(result => result.directory)).size,
						remaining: fs.readdirSync(temporaryDirectory).sort(),
						sentinelsPreserved: sentinels.every(name => {
							const file = path.join(temporaryDirectory, name);
							return fs.existsSync(file) && fs.readFileSync(file, 'utf8') === 'Not owned by a conversion';
						}),
					}, {
						identities: [first, second].map((kind, index) => [
							kind === 'key' ? certificates[index].keyIdentity : certificates[index].certificateIdentity,
						]),
						errors: [undefined, undefined],
						directories: 2,
						remaining: sentinels.sort(),
						sentinelsPreserved: true,
					});
				});
			}

			test(`failed ${first} conversion does not remove a concurrent input`, async () => {
				const signals = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
				const [failed, succeeded] = await convert([
					{ kind: first, pfx: invalidPFX, synchronization: { signals, index: 0 } },
					{ kind: first, pfx: certificates[0].pfx, synchronization: { signals, index: 1 } },
				]);
				assert.deepStrictEqual({
					originalPreserved: failed.error?.originalPreserved,
					identities: succeeded.identities,
					error: succeeded.error,
					remaining: fs.readdirSync(temporaryDirectory),
				}, {
					originalPreserved: true,
					identities: [first === 'key' ? certificates[0].keyIdentity : certificates[0].certificateIdentity],
					error: undefined,
					remaining: [],
				});
			});

			test(`${first} conversion preserves OpenSSL failures and cleans temporary files`, async () => {
				const [result] = await convert([{ kind: first, pfx: invalidPFX }]);
				assert.deepStrictEqual({
					failed: !!result.error,
					originalPreserved: result.error?.originalPreserved,
					remaining: fs.readdirSync(temporaryDirectory),
				}, { failed: true, originalPreserved: true, remaining: [] });
			});

			for (const failIO of ['write', 'read'] as const) {
				test(`${first} conversion cleans up after ${failIO} failures`, async () => {
					const [result] = await convert([{ kind: first, pfx: certificates[0].pfx, failIO }]);
					assert.deepStrictEqual({
						error: result.error?.message,
						originalPreserved: result.error?.originalPreserved,
						remaining: fs.readdirSync(temporaryDirectory),
					}, { error: 'Synthetic I/O failure', originalPreserved: true, remaining: [] });
				});
			}

			test(`${first} conversion surfaces cleanup failures`, async () => {
				const [result] = await convert([{ kind: first, pfx: certificates[0].pfx, failCleanup: true }]);
				assert.deepStrictEqual({
					error: result.error?.message,
					cleanupPreserved: result.error?.cleanupPreserved,
					identities: result.identities,
				}, { error: 'Synthetic cleanup failure', cleanupPreserved: true, identities: undefined });
			});

			test(`${first} conversion preserves both conversion and cleanup failures`, async () => {
				const [result] = await convert([{ kind: first, pfx: invalidPFX, failCleanup: true }]);
				assert.deepStrictEqual({
					originalPreserved: result.error?.originalPreserved,
					cleanupPreserved: result.error?.cleanupPreserved,
					causePreserved: result.error?.causePreserved,
					identities: result.identities,
				}, { originalPreserved: true, cleanupPreserved: true, causePreserved: true, identities: undefined });
			});
		}

		test('rejects missing keys or certificates instead of returning empty credentials', async () => {
			const [key] = await convert([{ kind: 'key', pfx: certificateOnly }]);
			const [certificate] = await convert([{ kind: 'certificates', pfx: keyOnly }]);
			assert.deepStrictEqual({
				errors: [key.error?.message, certificate.error?.message],
				identities: [key.identities, certificate.identities],
				remaining: fs.readdirSync(temporaryDirectory),
			}, {
				errors: ['No private key found in PFX', 'No certificates found in PFX'],
				identities: [undefined, undefined],
				remaining: [],
			});
		});
	});
}
