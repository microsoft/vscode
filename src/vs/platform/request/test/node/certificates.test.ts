/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash, X509Certificate } from 'crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { rootCertificates } from 'tls';
import { basename, join } from '../../../../base/common/path.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { configureNodeExtraCaCerts, normalizeCertificates, writeCertificatesFile } from '../../node/certificates.js';

const [certificateA, certificateB, certificateC] = rootCertificates.slice(0, 3).map(certificate => new X509Certificate(certificate).toString());
const invalidCertificate = '-----BEGIN CERTIFICATE-----\ninvalid-secret-certificate\n-----END CERTIFICATE-----';

class TestLogService extends NullLogService {
	readonly warnings: string[] = [];
	override warn(message: string): void {
		this.warnings.push(message);
	}
}

suite('Certificate bundles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let logService: TestLogService;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'vscode-certificates-test-'));
		logService = new TestLogService();
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	test('merges the client certificates without modifying the user-supplied bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, certificateA);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		const certificates = Object.freeze([certificateB]);
		await configureNodeExtraCaCerts(environment, directory, certificates, logService);
		assert.deepStrictEqual({
			newPath: environment.NODE_EXTRA_CA_CERTS !== path,
			combined: await readFile(environment.NODE_EXTRA_CA_CERTS, 'utf8'),
			original: await readFile(path, 'utf8'),
			certificates,
		}, {
			newPath: true,
			combined: [certificateA, certificateB].sort().join('\n'),
			original: certificateA,
			certificates: [certificateB],
		});
	});

	test('reuses the combined bundle for identical launches and includes updates to the user bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, certificateA);
		const environments = [{ NODE_EXTRA_CA_CERTS: path }, { NODE_EXTRA_CA_CERTS: path }, { NODE_EXTRA_CA_CERTS: path }];
		await configureNodeExtraCaCerts(environments[0], directory, [certificateB], logService);
		await configureNodeExtraCaCerts(environments[1], directory, [certificateB], logService);
		await writeFile(path, certificateC);
		await configureNodeExtraCaCerts(environments[2], directory, [certificateB], logService);
		assert.deepStrictEqual({
			reused: environments[0].NODE_EXTRA_CA_CERTS === environments[1].NODE_EXTRA_CA_CERTS,
			updated: environments[0].NODE_EXTRA_CA_CERTS !== environments[2].NODE_EXTRA_CA_CERTS,
			content: await readFile(environments[2].NODE_EXTRA_CA_CERTS, 'utf8'),
		}, {
			reused: true,
			updated: true,
			content: [certificateB, certificateC].sort().join('\n'),
		});
	});

	test('leaves an existing bundle and environment unchanged when no client certificates are supplied', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, certificateA);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await configureNodeExtraCaCerts(environment, directory, [], logService);
		assert.deepStrictEqual({ environment, entries: await readdir(directory) }, { environment: { NODE_EXTRA_CA_CERTS: path }, entries: ['custom.pem'] });
	});

	test('propagates bundle write failures without changing the environment or user bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, certificateA);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await assert.rejects(configureNodeExtraCaCerts(environment, path, [certificateB], logService));
		assert.deepStrictEqual({ environment, original: await readFile(path, 'utf8') }, { environment: { NODE_EXTRA_CA_CERTS: path }, original: certificateA });
	});

	test('replaces a missing bundle and combines all supplied certificates', async () => {
		const environment = { NODE_EXTRA_CA_CERTS: join(directory, 'missing.pem') };
		await configureNodeExtraCaCerts(environment, directory, [certificateB, certificateA], logService);
		assert.strictEqual(await readFile(environment.NODE_EXTRA_CA_CERTS, 'utf8'), [certificateA, certificateB].sort().join('\n'));
	});

	test('does not set an environment variable when there are no certificates', async () => {
		const environment: IProcessEnvironment = {};
		await configureNodeExtraCaCerts(environment, directory, [], logService);
		assert.deepStrictEqual({ environment, entries: await readdir(directory) }, { environment: {}, entries: [] });
	});

	test('uses immutable content-addressed files and tolerates concurrent writers', async () => {
		const paths = await Promise.all([
			writeCertificatesFile([certificateA], directory, logService),
			writeCertificatesFile([certificateA], directory, logService),
		]);
		const next = await writeCertificatesFile([certificateB], directory, logService);
		assert.ok(paths[0] && next);
		assert.deepStrictEqual({
			reused: paths[0] === paths[1],
			changed: paths[0] !== next,
			contents: await Promise.all([paths[0], next].map(path => readFile(path, 'utf8'))),
			files: (await readdir(directory)).length,
		}, { reused: true, changed: true, contents: [certificateA, certificateB], files: 2 });
	});

	test('hashes individual certificates independently of order, duplicates, grouping, and line endings', async () => {
		const variants = [
			[certificateB, certificateA, certificateB],
			[certificateA.replace(/\n/g, '\r\n'), certificateB],
			[`# CA bundle\n${certificateB}\n${certificateA}`, certificateB],
			[certificateA, `${certificateA}\n${certificateB}`],
		];
		const paths = await Promise.all(variants.map(certificates => writeCertificatesFile(certificates, directory, logService)));
		assert.ok(paths[0]);
		const content = [certificateA, certificateB].sort().join('\n');
		const fileName = `certificates-${createHash('sha256').update(content).digest('hex')}.pem`;
		assert.deepStrictEqual({
			samePath: paths.every(path => path === paths[0]),
			fileName: basename(paths[0]),
			content: await readFile(paths[0], 'utf8'),
			files: await readdir(directory),
			warnings: logService.warnings,
		}, { samePath: true, fileName, content, files: [fileName], warnings: [] });
	});

	test('skips malformed and truncated certificates while retaining every valid certificate', () => {
		const certificates = Object.freeze([
			'invalid-secret-input',
			`${certificateA}\n${invalidCertificate}\n${certificateB}`,
			`-----BEGIN CERTIFICATE-----\ntruncated-secret\n${certificateA}`,
		]);
		assert.deepStrictEqual({
			certificates: normalizeCertificates(certificates, logService),
			warnings: logService.warnings,
		}, {
			certificates: [certificateA, certificateB].sort(),
			warnings: ['[Certificates] Ignored 3 invalid CA certificate(s).'],
		});
	});

	test('skips invalid existing-bundle entries and deduplicates valid roots across both sources', async () => {
		const path = join(directory, 'custom.pem');
		const original = `${certificateB}\n${invalidCertificate}\n${certificateA}`;
		await writeFile(path, original);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await configureNodeExtraCaCerts(environment, directory, [certificateA, certificateC], logService);
		assert.deepStrictEqual({
			content: await readFile(environment.NODE_EXTRA_CA_CERTS, 'utf8'),
			original: await readFile(path, 'utf8'),
			warnings: logService.warnings,
		}, {
			content: [certificateA, certificateB, certificateC].sort().join('\n'),
			original,
			warnings: ['[Certificates] Ignored 1 invalid CA certificate(s).'],
		});
	});

	test('does not create an empty bundle or change the environment when all certificates are invalid', async () => {
		const environment: IProcessEnvironment = {};
		await configureNodeExtraCaCerts(environment, directory, [invalidCertificate], logService);
		assert.deepStrictEqual({
			environment,
			files: await readdir(directory),
			warnings: logService.warnings,
		}, { environment: {}, files: [], warnings: ['[Certificates] Ignored 1 invalid CA certificate(s).'] });
	});

	test('a child Node process trusts both the original and forwarded certificates', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, `${certificateA}\n${invalidCertificate}`);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await configureNodeExtraCaCerts(environment, directory, [certificateB, certificateA], logService);
		const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(\'tls\').getCACertificates(\'extra\').map(cert => new (require(\'crypto\').X509Certificate)(cert).fingerprint256)))'], {
			env: { ...process.env, ...environment, ELECTRON_RUN_AS_NODE: '1' },
			encoding: 'utf8',
			timeout: 10000,
		});
		assert.deepStrictEqual({ status: child.status, stderr: child.stderr, stdout: child.stdout }, {
			status: 0,
			stderr: '',
			stdout: JSON.stringify([certificateA, certificateB].sort().map(certificate => new X509Certificate(certificate).fingerprint256)),
		});
	});
});
