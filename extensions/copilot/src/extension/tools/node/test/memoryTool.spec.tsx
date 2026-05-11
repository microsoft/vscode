/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, describe, expect, suite, test } from 'vitest';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { MarkdownString } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IAgentMemoryService, RepoMemoryEntry } from '../../common/agentMemoryService';
import { MemoryTool } from '../memoryTool';

/**
 * Capturing telemetry service that records all events for assertion.
 */
class MockCapturingTelemetryService extends NullTelemetryService {
	readonly events: { eventName: string; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }[] = [];

	override sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}

	clear(): void {
		this.events.length = 0;
	}

	getEvents(name: string) {
		return this.events.filter(e => e.eventName === name);
	}
}

/**
 * Mock AgentMemoryService that enables memory for testing.
 */
class MockAgentMemoryService implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;
	storedMemories: RepoMemoryEntry[] = [];

	async checkMemoryEnabled(): Promise<boolean> {
		return true;
	}

	async getRepoMemories(_limit?: number): Promise<RepoMemoryEntry[] | undefined> {
		return this.storedMemories;
	}

	async storeRepoMemory(memory: RepoMemoryEntry): Promise<boolean> {
		this.storedMemories.push(memory);
		return true;
	}

	clearMemories(): void {
		this.storedMemories = [];
	}
}

/**
 * Mock AgentMemoryService that simulates memory being disabled.
 */
class DisabledMockAgentMemoryService implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;

	async checkMemoryEnabled(): Promise<boolean> {
		return false;
	}

	async getRepoMemories(_limit?: number): Promise<RepoMemoryEntry[] | undefined> {
		return undefined;
	}

	async storeRepoMemory(_memory: RepoMemoryEntry): Promise<boolean> {
		return false;
	}
}

function getResultText(result: { content: { value: string }[] }): string {
	return result.content.map((c: { value: string }) => c.value).join('');
}

const TEST_SESSION_RESOURCE = 'vscode-chat-session://local/session-abc123';
const TEST_SESSION_ID = 'session-abc123';

function invokeMemoryTool(tool: MemoryTool, input: object, chatSessionResource: string = TEST_SESSION_RESOURCE) {
	return tool.invoke!({ input, chatSessionResource } as never, CancellationToken.None);
}

suite('MemoryTool', () => {
	let accessor: ITestingServicesAccessor;
	let mockMemoryService: MockAgentMemoryService;
	let mockFs: MockFileSystemService;
	let mockTelemetry: MockCapturingTelemetryService;
	let tool: MemoryTool;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		mockMemoryService = new MockAgentMemoryService();
		mockTelemetry = new MockCapturingTelemetryService();
		services.define(IAgentMemoryService, mockMemoryService);
		services.define(ITelemetryService, mockTelemetry);
		services.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, ['/tmp/test-memory-global', undefined, '/tmp/test-memory']));
		accessor = services.createTestingAccessor();
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		mockFs = accessor.get(IFileSystemService) as MockFileSystemService;
		tool = accessor.get(IInstantiationService).createInstance(MemoryTool);
		mockMemoryService.clearMemories();
		mockTelemetry.clear();
	});

	// --- Path validation ---

	test('rejects paths not starting with /memories/', async () => {
		const result = await invokeMemoryTool(tool, { command: 'view', path: '/other/path' });
		const text = getResultText(result as never);
		expect(text).toContain('Error: All memory paths must start with /memories/');
	});

	test('rejects paths with traversal', async () => {
		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/../etc/passwd' });
		const text = getResultText(result as never);
		expect(text).toContain('Error: Path traversal is not allowed');
	});

	// --- Local view ---

	test('view returns file not exist message for missing path', async () => {
		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/session/nonexistent.md' });
		const text = getResultText(result as never);
		expect(text).toContain('No memories found in /memories/session/nonexistent.md');
	});

	test('view returns file content with line numbers', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/notes.md`);
		mockFs.mockFile(fileUri, 'line one\nline two\nline three');

		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/session/notes.md' });
		const text = getResultText(result as never);
		expect(text).toContain('line one');
		expect(text).toContain('line two');
		expect(text).toContain('line three');
		expect(text).toMatch(/1.*line one/);
	});

	test('view lists session directory contents', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const dirUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}`);
		mockFs.mockDirectory(dirUri, [['notes.md', 1 /* FileType.File */]]);

		const childUri = URI.joinPath(dirUri, 'notes.md');
		mockFs.mockFile(childUri, 'content');

		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/session/' });
		const text = getResultText(result as never);
		expect(text).toContain('notes.md');
	});

	test('view /memories/ shows merged root with user files and session entry', async () => {
		const globalStorageUri = accessor.get(IVSCodeExtensionContext).globalStorageUri;
		if (!globalStorageUri) {
			return;
		}
		const userDirUri = URI.joinPath(globalStorageUri, 'memory-tool/memories');
		mockFs.mockDirectory(userDirUri, [['user-note.md', 1 /* FileType.File */]]);
		const childUri = URI.joinPath(userDirUri, 'user-note.md');
		mockFs.mockFile(childUri, 'user content');

		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/' });
		const text = getResultText(result as never);
		expect(text).toContain('/memories/user-note.md');
		expect(text).toContain('/memories/session/');
	});

	test('view with view_range returns specific lines', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/ranged.md`);
		mockFs.mockFile(fileUri, 'line one\nline two\nline three\nline four\nline five');

		const result = await invokeMemoryTool(tool, { command: 'view', path: '/memories/session/ranged.md', view_range: [2, 4] });
		const text = getResultText(result as never);
		expect(text).toContain('line two');
		expect(text).toContain('line three');
		expect(text).toContain('line four');
		expect(text).not.toContain('line one');
		expect(text).not.toContain('line five');
		expect(text).toContain('lines 2-4');
	});

	// --- Local create ---

	test('create creates a new session file', async () => {
		const result = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/session/test.md',
			file_text: 'hello world',
		});
		const text = getResultText(result as never);
		expect(text).toContain('File created successfully at: /memories/session/test.md');
	});

	test('create fails if file already exists', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/existing.md`);
		mockFs.mockFile(fileUri, 'existing content');

		const result = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/session/existing.md',
			file_text: 'new content',
		});
		const text = getResultText(result as never);
		expect(text).toContain('Error: File /memories/session/existing.md already exists');
	});

	// --- Local str_replace ---

	test('str_replace replaces unique text', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/test.md`);
		mockFs.mockFile(fileUri, 'Hello world\nfoo bar\nbaz');

		const result = await invokeMemoryTool(tool, {
			command: 'str_replace',
			path: '/memories/session/test.md',
			old_str: 'foo bar',
			new_str: 'replaced text',
		});
		const text = getResultText(result as never);
		expect(text).toContain('memory file has been edited');
	});

	test('str_replace fails when text not found', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/test2.md`);
		mockFs.mockFile(fileUri, 'Hello world');

		const result = await invokeMemoryTool(tool, {
			command: 'str_replace',
			path: '/memories/session/test2.md',
			old_str: 'nonexistent',
			new_str: 'replacement',
		});
		const text = getResultText(result as never);
		expect(text).toContain('did not appear verbatim');
	});

	test('str_replace fails on multiple occurrences', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/dup.md`);
		mockFs.mockFile(fileUri, 'foo\nbar\nfoo');

		const result = await invokeMemoryTool(tool, {
			command: 'str_replace',
			path: '/memories/session/dup.md',
			old_str: 'foo',
			new_str: 'baz',
		});
		const text = getResultText(result as never);
		expect(text).toContain('Multiple occurrences');
	});

	// --- Local insert ---

	test('insert adds text at specified line', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/insert-test.md`);
		mockFs.mockFile(fileUri, 'line1\nline2\nline3');

		const result = await invokeMemoryTool(tool, {
			command: 'insert',
			path: '/memories/session/insert-test.md',
			insert_line: 1,
			insert_text: 'inserted',
		});
		const text = getResultText(result as never);
		expect(text).toContain('has been edited');
	});

	test('insert fails with invalid line number', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/insert-bad.md`);
		mockFs.mockFile(fileUri, 'line1\nline2');

		const result = await invokeMemoryTool(tool, {
			command: 'insert',
			path: '/memories/session/insert-bad.md',
			insert_line: 10,
			insert_text: 'too far',
		});
		const text = getResultText(result as never);
		expect(text).toContain('Invalid `insert_line` parameter');
	});

	// --- Local delete ---

	test('delete removes a file', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/to-delete.md`);
		mockFs.mockFile(fileUri, 'content');

		const result = await invokeMemoryTool(tool, {
			command: 'delete',
			path: '/memories/session/to-delete.md',
		});
		const text = getResultText(result as never);
		expect(text).toContain('Successfully deleted /memories/session/to-delete.md');
	});

	test('delete fails on nonexistent path', async () => {
		const result = await invokeMemoryTool(tool, {
			command: 'delete',
			path: '/memories/session/nonexistent.md',
		});
		const text = getResultText(result as never);
		expect(text).toContain('does not exist');
	});

	// --- Local rename ---

	test('rename moves a file', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const srcUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/old-name.md`);
		mockFs.mockFile(srcUri, 'content');

		const result = await invokeMemoryTool(tool, {
			command: 'rename',
			old_path: '/memories/session/old-name.md',
			new_path: '/memories/session/new-name.md',
		});
		const text = getResultText(result as never);
		expect(text).toContain('Successfully renamed');
	});

	test('rename fails when source does not exist', async () => {
		const result = await invokeMemoryTool(tool, {
			command: 'rename',
			old_path: '/memories/session/no-such.md',
			new_path: '/memories/session/new.md',
		});
		const text = getResultText(result as never);
		expect(text).toContain('does not exist');
	});

	test('rename fails when destination already exists', async () => {
		const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
		if (!storageUri) {
			return;
		}
		const srcUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/src.md`);
		const destUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/dest.md`);
		mockFs.mockFile(srcUri, 'source');
		mockFs.mockFile(destUri, 'destination');

		const result = await invokeMemoryTool(tool, {
			command: 'rename',
			old_path: '/memories/session/src.md',
			new_path: '/memories/session/dest.md',
		});
		const text = getResultText(result as never);
		expect(text).toContain('already exists');
	});

	// --- Session isolation ---

	test('different sessions have isolated storage', async () => {
		const sessionA = 'vscode-chat-session://local/session-aaa';
		const sessionB = 'vscode-chat-session://local/session-bbb';

		// Create a file in session A
		const resultA = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/session/shared-name.md',
			file_text: 'session A content',
		}, sessionA);
		expect(getResultText(resultA as never)).toContain('File created successfully');

		// Create a file with the same name in session B — should not conflict
		const resultB = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/session/shared-name.md',
			file_text: 'session B content',
		}, sessionB);
		expect(getResultText(resultB as never)).toContain('File created successfully');

		// View from session A returns session A content
		const viewA = await invokeMemoryTool(tool, {
			command: 'view',
			path: '/memories/session/shared-name.md',
		}, sessionA);
		expect(getResultText(viewA as never)).toContain('session A content');

		// View from session B returns session B content
		const viewB = await invokeMemoryTool(tool, {
			command: 'view',
			path: '/memories/session/shared-name.md',
		}, sessionB);
		expect(getResultText(viewB as never)).toContain('session B content');
	});

	// --- Repo path routing ---

	describe('repo path operations', () => {
		test('view is not supported for repo paths', async () => {
			const result = await invokeMemoryTool(tool, {
				command: 'view',
				path: '/memories/repo',
			});
			const text = getResultText(result as never);
			expect(text).toContain('not supported');
		});

		test('create repo memory stores entry', async () => {
			const result = await invokeMemoryTool(tool, {
				command: 'create',
				path: '/memories/repo/new-fact.json',
				file_text: JSON.stringify({
					subject: 'build',
					fact: 'npm run build',
					citations: 'package.json:10',
					reason: 'Build command',
					category: 'bootstrap_and_build',
				}),
			});
			const text = getResultText(result as never);
			expect(text).toContain('File created successfully');
		});
	});

	// --- Telemetry ---

	describe('telemetry', () => {
		test('emits memoryToolInvoked for session view', async () => {
			await invokeMemoryTool(tool, { command: 'view', path: '/memories/session/nonexistent.md' });
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'view',
				scope: 'session',
				toolOutcome: 'notFound',
			});
		});

		test('emits memoryToolInvoked for user create success', async () => {
			await invokeMemoryTool(tool, {
				command: 'create',
				path: '/memories/test-telemetry.md',
				file_text: 'hello',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'create',
				scope: 'user',
				toolOutcome: 'success',
			});
		});

		test('emits memoryToolInvoked for session create success', async () => {
			await invokeMemoryTool(tool, {
				command: 'create',
				path: '/memories/session/test-telemetry.md',
				file_text: 'hello',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'create',
				scope: 'session',
				toolOutcome: 'success',
			});
		});

		test('emits memoryToolInvoked with error outcome on create conflict', async () => {
			const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
			if (!storageUri) {
				return;
			}
			const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/exists.md`);
			mockFs.mockFile(fileUri, 'existing');

			await invokeMemoryTool(tool, {
				command: 'create',
				path: '/memories/session/exists.md',
				file_text: 'new',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'create',
				scope: 'session',
				toolOutcome: 'error',
			});
		});

		test('emits memoryToolInvoked for delete notFound', async () => {
			await invokeMemoryTool(tool, {
				command: 'delete',
				path: '/memories/session/nonexistent.md',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'delete',
				scope: 'session',
				toolOutcome: 'notFound',
			});
		});

		test('emits memoryToolInvoked for delete success', async () => {
			const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
			if (!storageUri) {
				return;
			}
			const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/to-delete-tel.md`);
			mockFs.mockFile(fileUri, 'content');

			await invokeMemoryTool(tool, {
				command: 'delete',
				path: '/memories/session/to-delete-tel.md',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'delete',
				scope: 'session',
				toolOutcome: 'success',
			});
		});

		test('emits memoryToolInvoked for str_replace error', async () => {
			const storageUri = accessor.get(IVSCodeExtensionContext).storageUri;
			if (!storageUri) {
				return;
			}
			const fileUri = URI.joinPath(URI.from(storageUri), `memory-tool/memories/${TEST_SESSION_ID}/str-tel.md`);
			mockFs.mockFile(fileUri, 'Hello world');

			await invokeMemoryTool(tool, {
				command: 'str_replace',
				path: '/memories/session/str-tel.md',
				old_str: 'nonexistent',
				new_str: 'replacement',
			});
			const events = mockTelemetry.getEvents('memoryToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'str_replace',
				scope: 'session',
				toolOutcome: 'error',
			});
		});

		test('emits memoryRepoToolInvoked for repo create', async () => {
			await invokeMemoryTool(tool, {
				command: 'create',
				path: '/memories/repo/fact.json',
				file_text: JSON.stringify({ subject: 'test', fact: 'fact' }),
			});
			const events = mockTelemetry.getEvents('memoryRepoToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'create',
				toolOutcome: 'success',
			});
		});

		test('emits memoryRepoToolInvoked with error for unsupported command', async () => {
			await invokeMemoryTool(tool, {
				command: 'view',
				path: '/memories/repo',
			});
			const events = mockTelemetry.getEvents('memoryRepoToolInvoked');
			expect(events.length).toBe(1);
			expect(events[0].properties).toMatchObject({
				command: 'view',
				toolOutcome: 'error',
			});
		});

		test('emits memoryToolInvoked with repo scope when CAPI memory disabled (local fallback)', async () => {
			// Use the disabled service suite's approach inline
			const services = createExtensionUnitTestingServices();
			const disabledTelemetry = new MockCapturingTelemetryService();
			services.define(IAgentMemoryService, new DisabledMockAgentMemoryService());
			services.define(ITelemetryService, disabledTelemetry);
			services.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, ['/tmp/test-disabled-tel-global', undefined, '/tmp/test-disabled-tel']));
			const acc = services.createTestingAccessor();
			try {
				const disabledTool = acc.get(IInstantiationService).createInstance(MemoryTool);

				await invokeMemoryTool(disabledTool, {
					command: 'create',
					path: '/memories/repo/fact.json',
					file_text: JSON.stringify({ subject: 'test', fact: 'fact' }),
				});

				const events = disabledTelemetry.getEvents('memoryToolInvoked');
				expect(events.length).toBe(1);
				expect(events[0].properties).toMatchObject({
					command: 'create',
					scope: 'repo',
					toolOutcome: 'success',
				});
			} finally {
				acc.dispose();
			}
		});
	});

	describe('prepareInvocation', () => {
		test('generates file widget with file: scheme for user-scoped str_replace', () => {
			const result = tool.prepareInvocation({
				input: { command: 'str_replace', path: '/memories/notes.md', old_str: 'a', new_str: 'b' },
			} as never, CancellationToken.None);
			expect(result).toBeDefined();
			const prepared = result as { invocationMessage: { value: string }; pastTenseMessage: { value: string } };
			expect(prepared.invocationMessage.value).toContain('[](file:///');
			expect(prepared.invocationMessage.value).toContain('memory-tool/memories/notes.md');
			expect(prepared.pastTenseMessage.value).toContain('[](file:///');
		});

		test('generates file widget for user-scoped create', () => {
			const result = tool.prepareInvocation({
				input: { command: 'create', path: '/memories/plan.md', file_text: 'hello' },
			} as never, CancellationToken.None);
			const prepared = result as { invocationMessage: { value: string }; pastTenseMessage: { value: string } };
			expect(prepared.invocationMessage.value).toContain('[](');
			expect(prepared.pastTenseMessage.value).toContain('Created memory file');
		});

		test('generates file widget for session-scoped view', () => {
			const sessionResource = URI.from({ scheme: 'vscode-chat-session', authority: 'local', path: '/session-abc123' });
			const result = tool.prepareInvocation({
				input: { command: 'view', path: '/memories/session/notes.md' },
				chatSessionResource: sessionResource,
			} as never, CancellationToken.None);
			const prepared = result as { invocationMessage: { value: string }; pastTenseMessage: { value: string } };
			expect(prepared.invocationMessage.value).toContain('[](');
		});

		test('returns plain text for directory paths', () => {
			const result = tool.prepareInvocation({
				input: { command: 'view', path: '/memories/' },
			} as never, CancellationToken.None);
			const prepared = result as { invocationMessage: string; pastTenseMessage: string };
			expect(typeof prepared.invocationMessage).toBe('string');
			expect(prepared.invocationMessage).toContain('Reading memory');
		});

		test('uses file widget for repo file paths', () => {
			const result = tool.prepareInvocation({
				input: { command: 'create', path: '/memories/repo/fact.json', file_text: '{}' },
			} as never, CancellationToken.None);
			const prepared = result as { invocationMessage: MarkdownString; pastTenseMessage: MarkdownString };
			expect(prepared.invocationMessage).toBeInstanceOf(MarkdownString);
			expect(prepared.invocationMessage.value).toContain('fact.json');
		});
	});
});

suite('MemoryTool when CAPI disabled', () => {
	let accessor: ITestingServicesAccessor;
	let mockTelemetry: MockCapturingTelemetryService;
	let tool: MemoryTool;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		mockTelemetry = new MockCapturingTelemetryService();
		services.define(IAgentMemoryService, new DisabledMockAgentMemoryService());
		services.define(ITelemetryService, mockTelemetry);
		services.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, ['/tmp/test-memory-disabled-global', undefined, '/tmp/test-memory-disabled']));
		accessor = services.createTestingAccessor();
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		tool = accessor.get(IInstantiationService).createInstance(MemoryTool);
	});

	test('create repo falls back to local storage when CAPI not enabled', async () => {
		const result = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/repo/new.json',
			file_text: '{"subject":"test","fact":"test"}',
		});
		const text = getResultText(result as never);
		expect(text).toContain('File created successfully');
	});

	test('local operations still work when CAPI is disabled', async () => {
		// Local file operations should work independently of CAPI status
		const result = await invokeMemoryTool(tool, {
			command: 'create',
			path: '/memories/session/local-note.md',
			file_text: 'local content',
		});
		const text = getResultText(result as never);
		expect(text).toContain('File created successfully');
	});
});
