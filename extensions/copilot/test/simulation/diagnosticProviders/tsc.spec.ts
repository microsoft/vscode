/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { beforeEach, describe, test, vi } from 'vitest';
import { IFile } from './diagnosticsProvider';

const state = vi.hoisted(() => {
	interface MockChildProcess extends EventEmitter {
		stdin: {
			setDefaultEncoding: ReturnType<typeof vi.fn>;
			write: ReturnType<typeof vi.fn>;
		};
		stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
		kill: ReturnType<typeof vi.fn>;
	}

	let child: MockChildProcess;

	const makeChild = () => {
		child = Object.assign(new EventEmitter(), {
			stdin: {
				setDefaultEncoding: vi.fn(),
				write: vi.fn(),
			},
			stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
			kill: vi.fn(),
		});
		return child;
	};

	return {
		fork: vi.fn(() => makeChild()),
		get child() {
			return child;
		},
	};
});

vi.mock('child_process', () => ({
	fork: state.fork,
	exec: vi.fn(),
}));

vi.mock('../../base/salts', () => ({
	TestingCacheSalts: { tscCacheSalt: 1 },
}));

vi.mock('../../base/simulationContext', () => ({
	CacheScope: { TSC: 'tsc' },
}));

vi.mock('../../base/stest', () => ({
	REPO_ROOT: '/repo',
}));

vi.mock('../../cacheSalt', () => ({
	TS_SERVER_DIAGNOSTICS_PROVIDER_CACHE_SALT: 5,
}));

vi.mock('../stestUtil', () => ({
	createTempDir: vi.fn(async () => '/tmp/ws'),
	cleanTempDirWithRetry: vi.fn(),
}));

vi.mock('./utils', () => ({
	CachingDiagnosticsProvider: class { },
	setupTemporaryWorkspace: vi.fn(async (_workspacePath: string, files: IFile[]) => files.map(file => ({
		fileName: file.fileName,
		filePath: `/tmp/ws/${file.fileName}`,
		fileContents: file.fileContents,
	}))),
}));

describe('TSServerDiagnosticsProvider', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test.each([3, 6])('rejects malformed diagnostic response %s and ignores later buffered stdout', async requestSeq => {
		const { TSServerDiagnosticsProvider } = await import('./tsc');
		class TestTSServerDiagnosticsProvider extends TSServerDiagnosticsProvider {
			run(files: IFile[]) {
				return this.computeDiagnostics(files);
			}
		}

		const provider = new TestTSServerDiagnosticsProvider();
		const diagnosticsPromise = provider.run([
			{ fileName: 'src/main.ts', fileContents: 'const x = ;' },
			{ fileName: 'tsconfig.json', fileContents: '{}' },
		]);
		const rejectionPromise = assert.rejects(
			diagnosticsPromise,
			new RegExp(`TS Server diagnostic for ${requestSeq === 6 ? 'tsconfig.json' : 'src/main.ts'} is missing line position metadata`.replace(/[/.]/g, '\\$&'))
		);
		await vi.waitFor(() => assert.deepStrictEqual(state.fork.mock.calls.length, 1));

		state.child.stdout.emit('data', frame({
			type: 'response',
			command: requestSeq === 6 ? 'semanticDiagnosticsSync' : 'syntacticDiagnosticsSync',
			request_seq: requestSeq,
			body: [{
				start: 10,
				length: 1,
				message: 'missing metadata',
				code: 1005,
				category: 'error',
			}],
		}));

		await rejectionPromise;
		assert.deepStrictEqual({
			killCount: state.child.kill.mock.calls.length,
			stdoutDataListeners: state.child.stdout.listenerCount('data'),
		}, {
			killCount: 1,
			stdoutDataListeners: 0,
		});

		state.child.stdout.emit('data', frame({
			type: 'response',
			command: 'semanticDiagnosticsSync',
			request_seq: 6,
			body: [],
		}));

		assert.deepStrictEqual({
			killCount: state.child.kill.mock.calls.length,
			writes: state.child.stdin.write.mock.calls.length,
		}, {
			killCount: 1,
			writes: 6,
		});
	});
});

function frame(message: object): string {
	const body = JSON.stringify(message);
	return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}
