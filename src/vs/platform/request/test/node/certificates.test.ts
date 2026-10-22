/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { X509Certificate } from 'crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { rootCertificates } from 'tls';
import { join } from '../../../../base/common/path.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { configureNodeExtraCaCerts, writeCertificatesFile } from '../../node/certificates.js';

suite('Certificate bundles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'vscode-certificates-test-'));
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	test('merges the client certificates without modifying the user-supplied bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, 'CUSTOM CA');
		const environment = { NODE_EXTRA_CA_CERTS: path };
		const certificates = Object.freeze(['CLIENT CA']);
		await configureNodeExtraCaCerts(environment, directory, certificates);
		assert.deepStrictEqual({
			newPath: environment.NODE_EXTRA_CA_CERTS !== path,
			combined: await readFile(environment.NODE_EXTRA_CA_CERTS, 'utf8'),
			original: await readFile(path, 'utf8'),
			certificates,
		}, {
			newPath: true,
			combined: ['CUSTOM CA', 'CLIENT CA'].join(process.platform === 'win32' ? '\r\n' : '\n'),
			original: 'CUSTOM CA',
			certificates: ['CLIENT CA'],
		});
	});

	test('reuses the combined bundle for identical launches and includes updates to the user bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, 'CUSTOM CA');
		const environments = [{ NODE_EXTRA_CA_CERTS: path }, { NODE_EXTRA_CA_CERTS: path }, { NODE_EXTRA_CA_CERTS: path }];
		await configureNodeExtraCaCerts(environments[0], directory, ['CLIENT CA']);
		await configureNodeExtraCaCerts(environments[1], directory, ['CLIENT CA']);
		await writeFile(path, 'UPDATED CUSTOM CA');
		await configureNodeExtraCaCerts(environments[2], directory, ['CLIENT CA']);
		assert.deepStrictEqual({
			reused: environments[0].NODE_EXTRA_CA_CERTS === environments[1].NODE_EXTRA_CA_CERTS,
			updated: environments[0].NODE_EXTRA_CA_CERTS !== environments[2].NODE_EXTRA_CA_CERTS,
			content: await readFile(environments[2].NODE_EXTRA_CA_CERTS, 'utf8'),
		}, {
			reused: true,
			updated: true,
			content: ['UPDATED CUSTOM CA', 'CLIENT CA'].join(process.platform === 'win32' ? '\r\n' : '\n'),
		});
	});

	test('leaves an existing bundle and environment unchanged when no client certificates are supplied', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, 'CUSTOM CA');
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await configureNodeExtraCaCerts(environment, directory, []);
		assert.deepStrictEqual({ environment, entries: await readdir(directory) }, { environment: { NODE_EXTRA_CA_CERTS: path }, entries: ['custom.pem'] });
	});

	test('propagates bundle write failures without changing the environment or user bundle', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, 'CUSTOM CA');
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await assert.rejects(configureNodeExtraCaCerts(environment, path, ['CLIENT CA']));
		assert.deepStrictEqual({ environment, original: await readFile(path, 'utf8') }, { environment: { NODE_EXTRA_CA_CERTS: path }, original: 'CUSTOM CA' });
	});

	test('replaces a missing bundle and combines all supplied certificates', async () => {
		const environment = { NODE_EXTRA_CA_CERTS: join(directory, 'missing.pem') };
		await configureNodeExtraCaCerts(environment, directory, ['REMOTE CA', 'LOCAL CA']);
		assert.strictEqual(await readFile(environment.NODE_EXTRA_CA_CERTS, 'utf8'), ['REMOTE CA', 'LOCAL CA'].join(process.platform === 'win32' ? '\r\n' : '\n'));
	});

	test('does not set an environment variable when there are no certificates', async () => {
		const environment: IProcessEnvironment = {};
		await configureNodeExtraCaCerts(environment, directory, []);
		assert.deepStrictEqual({ environment, entries: await readdir(directory) }, { environment: {}, entries: [] });
	});

	test('uses immutable content-addressed files and tolerates concurrent writers', async () => {
		const paths = await Promise.all([
			writeCertificatesFile(['CA A'], directory),
			writeCertificatesFile(['CA A'], directory),
		]);
		const next = await writeCertificatesFile(['CA B'], directory);
		assert.deepStrictEqual({
			reused: paths[0] === paths[1],
			changed: paths[0] !== next,
			contents: await Promise.all([paths[0], next].map(path => readFile(path, 'utf8'))),
			files: (await readdir(directory)).length,
		}, { reused: true, changed: true, contents: ['CA A', 'CA B'], files: 2 });
	});

	test('a child Node process trusts both the original and forwarded certificates', async () => {
		const path = join(directory, 'custom.pem');
		await writeFile(path, rootCertificates[0]);
		const environment = { NODE_EXTRA_CA_CERTS: path };
		await configureNodeExtraCaCerts(environment, directory, [rootCertificates[1]]);
		const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(\'tls\').getCACertificates(\'extra\').map(cert => new (require(\'crypto\').X509Certificate)(cert).fingerprint256)))'], {
			env: { ...process.env, ...environment, ELECTRON_RUN_AS_NODE: '1' },
			encoding: 'utf8',
			timeout: 10000,
		});
		assert.deepStrictEqual({ status: child.status, stderr: child.stderr, stdout: child.stdout }, {
			status: 0,
			stderr: '',
			stdout: JSON.stringify(rootCertificates.slice(0, 2).map(certificate => new X509Certificate(certificate).fingerprint256)),
		});
	});
});
