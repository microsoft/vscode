/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { prepareCopilotCLINativeShim } from '../copilotCLINativeShim';

const firstBuild = Buffer.from('VSCODE_COPILOT_RUST_SHIM_V1:first-local-build');
const secondBuild = Buffer.from('VSCODE_COPILOT_RUST_SHIM_V1:second-local-build');

class ShimLogService extends TestLogService {
	override info = vi.fn<(message: string) => void>();
	override warn = vi.fn<(message: string) => void>();
}

describe('Copilot CLI native shim deployment', () => {
	let root: string;
	let globalStorage: string;
	let storage: string;
	let source: string;
	let logger: ShimLogService;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(tmpdir(), 'copilot-native-shim-'));
		globalStorage = path.join(root, 'global storage');
		storage = path.join(globalStorage, 'copilotCli');
		source = path.join(root, 'local build');
		logger = new ShimLogService();
		await fs.writeFile(source, firstBuild);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(root, { recursive: true, force: true });
	});

	for (const platform of ['win32', 'linux', 'darwin'] as const) {
		it(`publishes ${platform} shims without deleting global storage or unrelated files`, async () => {
			await fs.mkdir(storage, { recursive: true });
			for (const filename of ['copilot', 'copilot.ps1', 'copilot.bat', 'copilot.cmd', 'copilotCLIShim.js', 'copilotCLIShim.ps1']) {
				await fs.writeFile(path.join(storage, filename), 'legacy script');
			}
			await fs.writeFile(path.join(storage, 'unrelated.txt'), 'keep');
			const filename = platform === 'win32' ? 'copilot.exe' : 'copilot';
			const unrelatedCopy = `.${filename}.previous-not-owned`;
			await fs.writeFile(path.join(storage, unrelatedCopy), 'keep this too');
			const destination = path.join(storage, filename);
			const result = await prepareCopilotCLINativeShim(globalStorage, logger, source, platform);
			expect({
				result,
				entries: (await fs.readdir(storage)).sort(),
				binary: await fs.readFile(destination),
				unrelated: await fs.readFile(path.join(storage, 'unrelated.txt'), 'utf8'),
			}).toEqual({
				result: destination,
				entries: [unrelatedCopy, filename, 'unrelated.txt'],
				binary: firstBuild,
				unrelated: 'keep',
			});
			if (process.platform !== 'win32' && platform !== 'win32') {
				expect((await fs.stat(destination)).mode & 0o777).toBe(0o750);
			}
		});
	}

	it('refreshes changed contents and does not republish identical builds', async () => {
		const destination = await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		const rename = vi.spyOn(fs, 'rename');
		await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		expect(rename).not.toHaveBeenCalled();
		await fs.writeFile(source, secondBuild);
		await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		expect({
			binary: await fs.readFile(destination!),
			entries: await fs.readdir(storage),
		}).toEqual({ binary: secondBuild, entries: ['copilot.exe'] });
	});

	it('serializes concurrent publication in the same storage directory', async () => {
		const results = await Promise.all(Array.from({ length: 3 }, () =>
			prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32')));
		expect({
			results,
			binary: await fs.readFile(path.join(storage, 'copilot.exe')),
			entries: await fs.readdir(storage),
			warnings: logger.warn.mock.calls,
		}).toEqual({
			results: Array(3).fill(path.join(storage, 'copilot.exe')),
			binary: firstBuild,
			entries: ['copilot.exe'],
			warnings: [],
		});
	});

	it('does not advertise an unset or invalid source', async () => {
		await fs.writeFile(source, 'not the Rust shim');
		const results = [
			await prepareCopilotCLINativeShim(globalStorage, logger, '', 'win32'),
			await prepareCopilotCLINativeShim(globalStorage, logger, 'relative-path', 'win32'),
			await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32'),
			await prepareCopilotCLINativeShim(globalStorage, logger, path.join(root, 'missing'), 'win32'),
		];
		expect({
			results,
			loggedUnconfigured: logger.info.mock.calls.some(([message]) => message.includes('No local Rust shim path')),
			loggedFailure: logger.warn.mock.calls.some(([message]) => message.includes('Failed to prepare')),
		}).toEqual({ results: [undefined, undefined, undefined, undefined], loggedUnconfigured: true, loggedFailure: true });
	});

	it('keeps the previously published native copy if the source becomes unavailable', async () => {
		const destination = await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		await fs.unlink(source);
		expect({
			result: await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32'),
			binary: await fs.readFile(destination!),
			loggedRetention: logger.warn.mock.calls.some(([message]) => message.includes('Keeping the previously published')),
		}).toEqual({ result: destination, binary: firstBuild, loggedRetention: true });
	});

	it('rolls back a failed Windows publication instead of losing the working copy', async () => {
		const destination = await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		await fs.writeFile(source, secondBuild);
		const rename = fs.rename;
		vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
			if (from.toString().includes('.new-')) {
				throw Object.assign(new Error('injected publication failure'), { code: 'EIO' });
			}
			return rename(from, to);
		});
		expect({
			result: await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32'),
			binary: await fs.readFile(destination!),
			entries: await fs.readdir(storage),
			warned: logger.warn.mock.calls.length > 0,
		}).toEqual({ result: destination, binary: firstBuild, entries: ['copilot.exe'], warned: true });
	});

	it('retains locked old binaries and cleans them up on a later activation', async () => {
		await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		await fs.writeFile(source, secondBuild);
		const unlink = fs.unlink;
		const lock = vi.spyOn(fs, 'unlink').mockImplementation(async filename => {
			if (filename.toString().includes('.previous-')) {
				throw Object.assign(new Error('running binary'), { code: 'EPERM' });
			}
			return unlink(filename);
		});
		const result = await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		const retained = (await fs.readdir(storage)).filter(name => name.includes('.previous-'));
		lock.mockRestore();
		await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32');
		expect({
			result,
			retained: retained.length,
			entries: await fs.readdir(storage),
			binary: await fs.readFile(path.join(storage, 'copilot.exe')),
		}).toEqual({ result: path.join(storage, 'copilot.exe'), retained: 1, entries: ['copilot.exe'], binary: secondBuild });
	});

	it('does not advertise a directory with a surviving legacy wrapper', async () => {
		await fs.mkdir(storage, { recursive: true });
		const legacy = path.join(storage, 'copilot.ps1');
		await fs.writeFile(legacy, 'legacy script');
		const rm = fs.rm;
		vi.spyOn(fs, 'rm').mockImplementation(async (filename, options) => {
			if (filename === legacy) {
				throw Object.assign(new Error('locked legacy script'), { code: 'EACCES' });
			}
			return rm(filename, options);
		});
		expect({
			result: await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32'),
			legacy: await fs.readFile(legacy, 'utf8'),
			binary: await fs.readFile(path.join(storage, 'copilot.exe')),
			warned: logger.warn.mock.calls.some(([message]) => message.includes('legacy shim')),
		}).toEqual({ result: undefined, legacy: 'legacy script', binary: firstBuild, warned: true });
	});

	it('reports a stale lock without deleting a lock another host may own', async () => {
		await fs.mkdir(storage, { recursive: true });
		await fs.writeFile(path.join(storage, '.publish.lock'), '1234\n');
		expect({
			result: await prepareCopilotCLINativeShim(globalStorage, logger, source, 'win32'),
			lock: await fs.readFile(path.join(storage, '.publish.lock'), 'utf8'),
			warned: logger.warn.mock.calls.some(([message]) => message.includes('stale lock')),
		}).toEqual({ result: undefined, lock: '1234\n', warned: true });
	});
});
