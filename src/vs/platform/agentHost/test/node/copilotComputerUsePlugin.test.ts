/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { join } from '../../../../base/common/path.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRequestService } from '../../../request/common/request.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { CopilotComputerUsePlugin, IComputerUsePluginRelease } from '../../node/copilot/copilotComputerUsePlugin.js';

suite('CopilotComputerUsePlugin', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const target = `${process.platform}-${process.arch}`;
	let tmpDir: string;
	let archive: Buffer;

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'computer-use-plugin-'));
		// Mirror the release layout, including the explicit directory entry.
		const { ZipFile } = await import('yazl');
		const zipFile = new ZipFile();
		zipFile.addEmptyDirectory(`${target}/`);
		zipFile.addBuffer(Buffer.from('{"name":"computer-use"}'), `${target}/plugin.json`);
		zipFile.addBuffer(Buffer.from('#!/bin/sh\n'), `${target}/computer-use-mcp`, { mode: 0o100755 });
		zipFile.addBuffer(Buffer.from('{}'), 'other-platform/plugin.json');
		zipFile.end();
		const chunks: Buffer[] = [];
		for await (const chunk of zipFile.outputStream) {
			chunks.push(chunk as Buffer);
		}
		archive = Buffer.concat(chunks);
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	function createPlugin(sha256: string | undefined, requests: string[]): CopilotComputerUsePlugin {
		const release: IComputerUsePluginRelease = {
			version: '1.2.3',
			sha256: sha256 ? { [target]: sha256 } : {},
			urlTemplate: 'https://example.test/v{version}/plugin-{target}.zip',
		};
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions): Promise<IRequestContext> {
				requests.push(options.url ?? '');
				return { res: { headers: {}, statusCode: 200 }, stream: bufferToStream(VSBuffer.wrap(archive)) };
			}
		};
		const environmentService = new class extends mock<INativeEnvironmentService>() {
			override readonly userDataPath = join(tmpDir, 'user-data');
		};
		return new CopilotComputerUsePlugin(release, requestService, environmentService, new NullLogService());
	}

	test('downloads, verifies and caches the platform plugin', async () => {
		const sha256 = createHash('sha256').update(archive).digest('hex');
		const requests: string[] = [];
		const first = await createPlugin(sha256, requests).resolve(CancellationToken.None);
		const second = await createPlugin(sha256, requests).resolve(CancellationToken.None);
		const pluginDir = join(tmpDir, 'user-data', 'agent-host', 'computer-use-plugin', '1.2.3', target);

		assert.deepStrictEqual({
			first,
			second,
			requests,
			files: (await fs.promises.readdir(pluginDir)).sort(),
			executable: process.platform === 'win32' || ((await fs.promises.stat(join(pluginDir, 'computer-use-mcp'))).mode & 0o111) !== 0,
			siblings: (await fs.promises.readdir(join(pluginDir, '..'))).sort(),
		}, {
			first: pluginDir,
			second: pluginDir,
			requests: [`https://example.test/v1.2.3/plugin-${target}.zip`],
			files: ['.complete', 'computer-use-mcp', 'plugin.json'],
			executable: true,
			siblings: [target],
		});
	});

	test('rejects a checksum mismatch without installing, and retries afterwards', async () => {
		const requests: string[] = [];
		const plugin = createPlugin('0'.repeat(64), requests);
		const firstError = await plugin.resolve(CancellationToken.None).then(() => undefined, error => error instanceof Error ? error.message : String(error));
		const secondError = await plugin.resolve(CancellationToken.None).then(() => undefined, error => error instanceof Error ? error.message : String(error));

		assert.deepStrictEqual({
			firstMismatch: firstError?.includes('checksum mismatch'),
			secondMismatch: secondError?.includes('checksum mismatch'),
			requestCount: requests.length,
			installed: fs.existsSync(join(tmpDir, 'user-data', 'agent-host', 'computer-use-plugin', '1.2.3')) && fs.readdirSync(join(tmpDir, 'user-data', 'agent-host', 'computer-use-plugin', '1.2.3')).length > 0,
		}, {
			firstMismatch: true,
			secondMismatch: true,
			requestCount: 2,
			installed: false,
		});
	});

	test('is unavailable on platforms without a release', async () => {
		const requests: string[] = [];
		assert.deepStrictEqual({
			path: await createPlugin(undefined, requests).resolve(CancellationToken.None),
			requests,
		}, {
			path: undefined,
			requests: [],
		});
	});
});
