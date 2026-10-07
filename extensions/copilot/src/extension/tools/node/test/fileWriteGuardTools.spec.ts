/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseNotebookEditPart, ChatResponseTextEditPart, ChatResponseWorkspaceEditPart, ExtendedLanguageModelToolResult, LanguageModelTextPart } from '../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ApplyPatchTool, IApplyPatchToolParams } from '../applyPatchTool';
import { CreateFileTool } from '../createFileTool';
import { FileCreateReservation, FileWriteGuardDependencies, getFileWriteGuard, getFileWriteLineage, initializeFileWriteGuard, isFileNotFound, readFileWriteState } from '../fileWriteGuard';
import { ReadFileTool } from '../readFileTool';

class TestReservationProvider implements FileWriteGuardDependencies {
	readonly aliases = new Map<string, string>();
	reservations = 0;
	rollbacks = 0;
	onReserve: (() => void) | undefined;
	private readonly identities = new Map<string, object>();

	constructor(private readonly fileSystem: MockFileSystemService) { }

	async canonicalize(uri: URI): Promise<readonly string[]> {
		return [this.aliases.get(uri.toString()) ?? uri.toString()];
	}

	async reserveCreate(uri: URI): Promise<FileCreateReservation> {
		try {
			await this.fileSystem.stat(uri);
		} catch (error) {
			if (!isFileNotFound(error)) {
				throw error;
			}
			const identity = {};
			this.identities.set(uri.toString(), identity);
			await this.fileSystem.writeFile(uri, new Uint8Array());
			this.reservations++;
			this.onReserve?.();
			const verify = async () => this.identities.get(uri.toString()) === identity && (await this.fileSystem.readFile(uri)).byteLength === 0;
			return {
				verify,
				rollback: async () => {
					if (await verify()) {
						await this.fileSystem.delete(uri);
						this.identities.delete(uri.toString());
						this.rollbacks++;
					}
				},
			};
		}
		throw Object.assign(new Error('File exists'), { code: 'EEXIST' });
	}
}

describe('file write guard tool integration', () => {
	const source = URI.file('/workspace/source.ts');
	const second = URI.file('/workspace/second.ts');
	const destination = URI.file('/workspace/destination.ts');
	let store: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let fileSystem: MockFileSystemService;
	let provider: TestReservationProvider;
	let context: IBuildPromptContext;
	let parts: vscode.ExtendedChatResponsePart[];
	let patchTool: ApplyPatchTool;
	let createTool: CreateFileTool;
	let readTool: ReadFileTool;

	beforeEach(() => {
		store = new DisposableStore();
		fileSystem = new MockFileSystemService();
		fileSystem.mockDirectory(URI.file('/workspace'), []);
		fileSystem.mockFile(source, 'old\nunshown');
		fileSystem.mockFile(second, 'second');
		provider = new TestReservationProvider(fileSystem);
		initializeFileWriteGuard(fileSystem, provider);
		const services = createExtensionUnitTestingServices(store);
		services.define(IFileSystemService, fileSystem);
		services.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService, [
			[URI.file('/workspace')],
			[
				createTextDocumentData(source, 'old\nunshown', 'typescript').document,
				createTextDocumentData(second, 'second', 'typescript').document,
				createTextDocumentData(destination, '', 'typescript').document,
			],
		]));
		accessor = store.add(services.createTestingAccessor());
		const instantiation = accessor.get(IInstantiationService);
		patchTool = instantiation.createInstance(ApplyPatchTool);
		createTool = instantiation.createInstance(CreateFileTool);
		readTool = store.add(instantiation.createInstance(ReadFileTool));
		parts = [];
		context = {
			requestId: 'guard-turn',
			query: '',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			stream: new ChatResponseStreamImpl(part => parts.push(part), () => undefined),
		};
	});

	afterEach(() => store.dispose());

	function options<T>(input: T): vscode.LanguageModelToolInvocationOptions<T> {
		return { input, toolInvocationToken: null as never, chatRequestId: 'guard-turn' };
	}

	function mutations() {
		return parts.filter(part => part instanceof ChatResponseTextEditPart || part instanceof ChatResponseNotebookEditPart || part instanceof ChatResponseWorkspaceEditPart);
	}

	async function read(uri = source) {
		const input = { filePath: uri.fsPath, startLine: 1, endLine: 1 };
		await readTool.resolveInput(input, context);
		return readTool.invoke(options(input), CancellationToken.None);
	}

	async function apply(input: IApplyPatchToolParams) {
		await patchTool.resolveInput(input, context);
		return patchTool.invoke(options(input), CancellationToken.None);
	}

	function rejected(result: vscode.LanguageModelToolResult) {
		return result instanceof ExtendedLanguageModelToolResult && result.hasError && result.content.some(part => part instanceof LanguageModelTextPart && part.value.includes('STALE_WRITE'));
	}

	test('a one-line read protects unseen bytes before a delete', async () => {
		await read();
		fileSystem.mockFile(source, 'old\nchanged unseen line');
		const result = await apply({ input: `*** Begin Patch\n*** Delete File: ${source.fsPath}\n*** End Patch`, explanation: 'delete' });
		expect({ stale: rejected(result), edits: mutations().length, reservations: provider.reservations }).toEqual({ stale: true, edits: 0, reservations: 0 });
	});

	test('a stale later target prevents earlier multi-file add/update/delete mutations', async () => {
		await read(second);
		fileSystem.mockFile(second, 'concurrent edit');
		const input = `*** Begin Patch\n*** Add File: ${destination.fsPath}\n+new\n*** Update File: ${source.fsPath}\n@@\n-old\n+new\n unshown\n*** Delete File: ${second.fsPath}\n*** End Patch`;
		const result = await apply({ input, explanation: 'multi-file edit' });
		expect({ stale: rejected(result), edits: mutations().length, reservations: provider.reservations }).toEqual({ stale: true, edits: 0, reservations: 0 });
	});

	test('move destinations participate in read-lineage checks', async () => {
		fileSystem.mockFile(destination, 'old destination');
		const guard = getFileWriteGuard(fileSystem);
		const lineage = getFileWriteLineage(options({}), context);
		guard.recordRead(lineage, await guard.snapshot(destination, await readFileWriteState(fileSystem, destination)));
		fileSystem.mockFile(destination, 'new destination');
		const input = `*** Begin Patch\n*** Update File: ${source.fsPath}\n*** Move to: ${destination.fsPath}\n@@\n-old\n+new\n unshown\n*** End Patch`;
		const result = await apply({ input, explanation: 'rename' });
		expect({ stale: rejected(result), edits: mutations().length }).toEqual({ stale: true, edits: 0 });
	});

	test('overlapping canonical targets are rejected rather than emitting two replacements', async () => {
		provider.aliases.set(second.toString(), source.toString());
		const input = `*** Begin Patch\n*** Delete File: ${source.fsPath}\n*** Delete File: ${second.fsPath}\n*** End Patch`;
		const result = await apply({ input, explanation: 'overlapping deletes' });
		expect({ stale: rejected(result), edits: mutations().length }).toEqual({ stale: true, edits: 0 });
	});

	test.each(['hash', 'epoch'])('confirmation cache rejects a changed %s before delete emission', async change => {
		const input = { input: `*** Begin Patch\n*** Delete File: ${source.fsPath}\n*** End Patch`, explanation: 'delete' };
		await patchTool.resolveInput(input, context);
		await patchTool.prepareInvocation({ ...options(input), forceConfirmationReason: 'Review deletion' }, CancellationToken.None);
		if (change === 'hash') {
			fileSystem.mockFile(source, 'concurrent content');
		} else {
			const guard = getFileWriteGuard(fileSystem);
			guard.emitted({ owner: context, id: 'agent:other' }, [await guard.snapshot(source, await readFileWriteState(fileSystem, source))]);
		}
		const result = await patchTool.invoke(options(input), CancellationToken.None);
		expect({ stale: rejected(result), edits: mutations().length }).toEqual({ stale: true, edits: 0 });
	});

	test('apply_patch preserves access errors and releases every target lock', async () => {
		fileSystem.mockError(second, Object.assign(new Error('Inaccessible source'), { code: 'EACCES' }));
		await expect(apply({ input: `*** Begin Patch\n*** Delete File: ${source.fsPath}\n*** Delete File: ${second.fsPath}\n*** End Patch`, explanation: 'delete' })).rejects.toMatchObject({ code: 'EACCES' });
		const release = await getFileWriteGuard(fileSystem).acquire([second, source], CancellationToken.None);
		release();
		expect(mutations()).toEqual([]);
	});

	test('rereading replaces the blocked read snapshot without changing the invocation UI', async () => {
		await read();
		fileSystem.mockFile(source, 'new\nunshown');
		await apply({ input: `*** Begin Patch\n*** Delete File: ${source.fsPath}\n*** End Patch`, explanation: 'delete' });
		await read();
		const guard = getFileWriteGuard(fileSystem);
		const state = await readFileWriteState(fileSystem, source, async () => 'old\nunshown');
		const snapshot = await guard.snapshot(source, state);
		expect(() => guard.assertTracked(getFileWriteLineage(options({}), context), [snapshot])).not.toThrow();
		const ui = await createTool.handleToolStream({ rawInput: { filePath: destination.fsPath, content: 'new' } }, CancellationToken.None);
		expect(ui.invocationMessage).toBeDefined();
	});

	test('create_file rejects an existing zero-byte file without a reservation or edit', async () => {
		fileSystem.mockFile(destination, '');
		const input = { filePath: destination.fsPath, content: 'replacement' };
		await createTool.resolveInput(input, context);
		await expect(createTool.invoke(options(input), CancellationToken.None)).rejects.toThrow('File already exists');
		expect({ edits: mutations().length, reservations: provider.reservations }).toEqual({ edits: 0, reservations: 0 });
	});

	test('inaccessible resources do not become missing reservations', async () => {
		fileSystem.mockError(destination, Object.assign(new Error('Permission denied: not found'), { code: 'EACCES' }));
		const input = { filePath: destination.fsPath, content: 'new' };
		await createTool.resolveInput(input, context);
		await expect(createTool.invoke(options(input), CancellationToken.None)).rejects.toMatchObject({ code: 'EACCES' });
		expect({ edits: mutations().length, reservations: provider.reservations }).toEqual({ edits: 0, reservations: 0 });
		const release = await getFileWriteGuard(fileSystem).acquire([destination], CancellationToken.None);
		release();
	});

	test('cancellation after create reservation rolls back only that identity and releases the lock', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		provider.onReserve = () => cancellation.cancel();
		const input = { filePath: destination.fsPath, content: 'new' };
		await createTool.resolveInput(input, context);
		await expect(createTool.invoke(options(input), cancellation.token)).rejects.toThrow('Canceled');
		const release = await getFileWriteGuard(fileSystem).acquire([destination], CancellationToken.None);
		release();
		expect({ edits: mutations().length, reservations: provider.reservations, rollbacks: provider.rollbacks }).toEqual({ edits: 0, reservations: 1, rollbacks: 1 });
		await expect(fileSystem.stat(destination)).rejects.toThrow('ENOENT');
	});
});