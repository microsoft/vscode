/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NodeExtHostUriHandlerCsrfSecret } from '../../node/extHostUriHandlerCsrfSecret.js';
import { computeToken, CSRF_TOKEN_PARAM, verifyCsrfToken } from '../../../services/extensions/common/uriHandlerCsrf.js';

suite('NodeExtHostUriHandlerCsrfSecret (integration)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const isWindows = process.platform === 'win32';
	let dir: string;
	let store: NodeExtHostUriHandlerCsrfSecret;

	setup(async () => {
		dir = await fs.mkdtemp(join(tmpdir(), 'uri-csrf-'));
		store = new NodeExtHostUriHandlerCsrfSecret(new NullLogService());
	});

	teardown(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	function secretUri(name = 'uri-csrf.secret'): URI {
		return URI.file(join(dir, name));
	}

	test('creates an owner-only secret of sufficient length', async () => {
		const file = secretUri();
		const secret = await store.getSecret(file);

		assert.ok(secret && secret.length >= 32, 'secret should be at least 32 bytes');
		const stat = await fs.stat(file.fsPath);
		if (!isWindows) {
			assert.strictEqual(stat.mode & 0o777, 0o600, 'secret file should be created mode 0600');
		}
	});

	test('is persistent: a second read returns the identical secret (no rotation)', async () => {
		const file = secretUri();
		const first = await store.getSecret(file);
		const second = await store.getSecret(file);
		assert.deepStrictEqual(Array.from(second!), Array.from(first!), 'secret must not change between reads');
	});

	test('create=false does not create the file and yields undefined when absent', async () => {
		const file = secretUri('missing.secret');
		const secret = await store.getSecret(file, false);
		assert.strictEqual(secret, undefined);
		await assert.rejects(fs.stat(file.fsPath), 'file must not have been created');
	});

	test('end-to-end: a link signed with the stored secret verifies, and tampering is rejected', async () => {
		const secret = (await store.getSecret(secretUri()))!;
		const path = '/start';
		const base = 'program=%2Fbin%2Fsh&request=launch';

		const token = await computeToken(secret, path, base);
		const signed = `${base}&${CSRF_TOKEN_PARAM}=${token}`;
		assert.deepStrictEqual(await verifyCsrfToken(secret, path, signed), { ok: true });

		const tampered = `program=%2Fbin%2Fevil&request=launch&${CSRF_TOKEN_PARAM}=${token}`;
		assert.strictEqual((await verifyCsrfToken(secret, path, tampered)).ok, false);
	});

	(isWindows ? test.skip : test)('rejects a group/other-writable secret (POSIX)', async () => {
		const file = secretUri();
		await store.getSecret(file); // create it 0600
		await fs.chmod(file.fsPath, 0o660); // make it group-writable

		const secret = await store.getSecret(file);
		assert.strictEqual(secret, undefined, 'a group-writable secret must not be trusted');
	});
});
