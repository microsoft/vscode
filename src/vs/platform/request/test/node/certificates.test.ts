/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash, X509Certificate } from 'crypto';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { rootCertificates } from 'tls';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { normalizeCertificates, writeCertificatesFile, writeUserDataCertificatesFile } from '../../node/certificates.js';

const [certificateA, certificateB] = rootCertificates.slice(0, 2).map(certificate => new X509Certificate(certificate).toString());
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

	test('shares one user-data bundle for equivalent certificate sets', async () => {
		const paths = await Promise.all([
			writeUserDataCertificatesFile([certificateA, certificateB], directory, logService),
			writeUserDataCertificatesFile([certificateB, certificateA, certificateB], directory, logService),
		]);
		assert.ok(paths[0]);
		assert.deepStrictEqual({ samePath: paths[0] === paths[1], directory: basename(dirname(paths[0])), content: await readFile(paths[0], 'utf8') }, {
			samePath: true,
			directory: 'certificates',
			content: [certificateA, certificateB].sort().join('\n'),
		});
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

	test('does not create an empty bundle when all certificates are invalid', async () => {
		assert.deepStrictEqual({
			path: await writeCertificatesFile([invalidCertificate], directory, logService),
			files: await readdir(directory),
			warnings: logService.warnings,
		}, { path: undefined, files: [], warnings: ['[Certificates] Ignored 1 invalid CA certificate(s).'] });
	});

	test('a child Node process trusts the valid certificates in the shared bundle', async () => {
		const path = await writeUserDataCertificatesFile([`${certificateA}\n${invalidCertificate}`, certificateB], directory, logService);
		assert.ok(path);
		const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(\'tls\').getCACertificates(\'extra\').map(cert => new (require(\'crypto\').X509Certificate)(cert).fingerprint256)))'], {
			env: { ...process.env, NODE_EXTRA_CA_CERTS: path, ELECTRON_RUN_AS_NODE: '1' },
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
