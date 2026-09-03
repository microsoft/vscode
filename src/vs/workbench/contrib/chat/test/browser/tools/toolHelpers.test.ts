/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ExtUri, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { resolveSymbolToolFileUri, findLineNumber, findSymbolColumn, errorResult, getChatPermissionLevelForToolInvocation, getSandboxPrecheckInputsForToolInvocation } from '../../../browser/tools/toolHelpers.js';
import type { IChatService } from '../../../common/chatService/chatService.js';
import { ChatPermissionLevel } from '../../../common/constants.js';
import type { IChatWidgetService } from '../../../browser/chat.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';

suite('Tool Helpers', () => {

	const disposables = new DisposableStore();
	const uriIdentityService = { extUri: new ExtUri(() => false) } as Partial<IUriIdentityService> as IUriIdentityService;

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockWorkspaceService(folderUris: URI | readonly URI[] = URI.parse('file:///workspace')): IWorkspaceContextService {
		const uris = URI.isUri(folderUris) ? [folderUris] : folderUris;
		const folders = uris.map(uri => ({
			uri,
			toResource: (relativePath: string) => URI.joinPath(uri, relativePath),
		} as unknown as IWorkspaceFolder));
		return {
			_serviceBrand: undefined,
			getWorkspace: () => ({ folders }),
			getWorkspaceFolder: (uri: URI) => folders.find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(uri, folder.uri)) ?? null,
		} as unknown as IWorkspaceContextService;
	}

	function createMockChatService(requests: readonly { id: string; modeInfo?: { permissionLevel?: ChatPermissionLevel } }[] | undefined): IChatService {
		return {
			_serviceBrand: undefined,
			getSession: () => requests ? { getRequests: () => requests } : undefined,
		} as unknown as IChatService;
	}

	function createMockChatWidgetService(permissionLevel: ChatPermissionLevel | undefined): IChatWidgetService {
		return {
			_serviceBrand: undefined,
			getWidgetBySessionResource: () => permissionLevel === undefined ? undefined : { input: { currentModeInfo: { permissionLevel } } },
		} as unknown as IChatWidgetService;
	}

	suite('resolveSymbolToolFileUri', () => {

		test('resolves full URI string', () => {
			const ws = createMockWorkspaceService();
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///workspace/test/file.ts' }, ws, uriIdentityService);
			assert.strictEqual(result?.toString(), 'file:///workspace/test/file.ts');
		});

		test('resolves workspace-relative filePath', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///project'));
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: 'src/index.ts' }, ws, uriIdentityService);
			assert.strictEqual(result?.toString(), 'file:///project/src/index.ts');
		});

		test('prefers uri over filePath', () => {
			const ws = createMockWorkspaceService();
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///workspace/explicit.ts', filePath: 'other.ts' }, ws, uriIdentityService);
			assert.strictEqual(result?.toString(), 'file:///workspace/explicit.ts');
		});

		test('returns undefined when neither provided', () => {
			const ws = createMockWorkspaceService();
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x' }, ws, uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('resolves filePath against workingDirectory when provided', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///other-workspace'));
			const workingDirectory = URI.parse('file:///session-dir');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: 'src/index.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result?.toString(), 'file:///session-dir/src/index.ts');
		});

		test('workingDirectory takes precedence over workspace folders', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///workspace'));
			const workingDirectory = URI.parse('file:///my-project');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: 'file.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result?.toString(), 'file:///my-project/file.ts');
		});

		test('resolves uri within workingDirectory', () => {
			const ws = createMockWorkspaceService();
			const workingDirectory = URI.parse('file:///session-dir');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///session-dir/path.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result?.toString(), 'file:///session-dir/path.ts');
		});

		test('rejects uri outside workingDirectory', () => {
			const ws = createMockWorkspaceService();
			const workingDirectory = URI.parse('file:///session-dir');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///workspace/path.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result, undefined);
		});

		test('rejects uri outside workspace folders', () => {
			const ws = createMockWorkspaceService();
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///outside/path.ts' }, ws, uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('resolves uri within any workspace folder', () => {
			const ws = createMockWorkspaceService([URI.parse('file:///workspace-one'), URI.parse('file:///workspace-two')]);
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///workspace-two/path.ts' }, ws, uriIdentityService);
			assert.strictEqual(result?.toString(), 'file:///workspace-two/path.ts');
		});

		test('rejects uri with parent segments that escapes the workspace folder', () => {
			const ws = createMockWorkspaceService();
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'file:///workspace/src/../../outside.ts' }, ws, uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('respects case-sensitive remote paths', () => {
			const workspaceUri = URI.parse('vscode-remote://host/project');
			const ws = createMockWorkspaceService(workspaceUri);
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', uri: 'vscode-remote://host/PROJECT/path.ts' }, ws, uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('rejects filePath that escapes the workingDirectory via parent segments', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///workspace'));
			const workingDirectory = URI.parse('file:///my-project');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: '../outside.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result, undefined);
		});

		test('rejects filePath that escapes the workingDirectory via nested parent segments', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///workspace'));
			const workingDirectory = URI.parse('file:///my-project');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: 'src/../../outside.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result, undefined);
		});

		test('allows filePath with interior parent segments that stays within the workingDirectory', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///workspace'));
			const workingDirectory = URI.parse('file:///my-project');
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: 'src/../file.ts' }, ws, uriIdentityService, workingDirectory);
			assert.strictEqual(result?.toString(), 'file:///my-project/file.ts');
		});

		test('rejects filePath that escapes the workspace folder via parent segments', () => {
			const ws = createMockWorkspaceService(URI.parse('file:///project/sub'));
			const result = resolveSymbolToolFileUri({ symbol: 'x', lineContent: 'x', filePath: '../../outside.ts' }, ws, uriIdentityService);
			assert.strictEqual(result, undefined);
		});
	});

	suite('getChatPermissionLevelForToolInvocation', () => {

		test('returns undefined when there is no chat session resource', () => {
			const result = getChatPermissionLevelForToolInvocation(undefined, undefined, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
			assert.strictEqual(result, undefined);
		});

		test('prefers the request permission level for the provided request id', () => {
			const sessionResource = URI.parse('vscode-chat://session/test');
			const result = getChatPermissionLevelForToolInvocation(
				sessionResource,
				'request-2',
				createMockChatWidgetService(ChatPermissionLevel.Default),
				createMockChatService([
					{ id: 'request-1', modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
					{ id: 'request-2', modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } },
				]),
			);

			assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
		});

		test('falls back to the live widget permission level when the request is not found', () => {
			const sessionResource = URI.parse('vscode-chat://session/test');
			const result = getChatPermissionLevelForToolInvocation(
				sessionResource,
				'missing-request',
				createMockChatWidgetService(ChatPermissionLevel.Autopilot),
				createMockChatService([{ id: 'request-1', modeInfo: { permissionLevel: ChatPermissionLevel.Default } }]),
			);

			assert.strictEqual(result, ChatPermissionLevel.Autopilot);
		});

		test('falls back to the latest request permission level when there is no widget', () => {
			const sessionResource = URI.parse('vscode-chat://session/test');
			const result = getChatPermissionLevelForToolInvocation(
				sessionResource,
				undefined,
				createMockChatWidgetService(undefined),
				createMockChatService([
					{ id: 'request-1', modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
					{ id: 'request-2', modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } },
				]),
			);

			assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
		});
	});

	suite('getSandboxPrecheckInputsForToolInvocation', () => {

		test('returns undefined when there is no chat permission level', () => {
			const result = getSandboxPrecheckInputsForToolInvocation(undefined, undefined, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([]));
			assert.strictEqual(result, undefined);
		});

		test('returns undefined for the default chat permission level', () => {
			const sessionResource = URI.parse('vscode-chat://session/test');
			const result = getSandboxPrecheckInputsForToolInvocation(sessionResource, undefined, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
			assert.deepStrictEqual(result, { isDefaultApprovalPermissionEnabled: true });
		});

		test('disables default approval permission for auto-approve chat permission levels', () => {
			const sessionResource = URI.parse('vscode-chat://session/test');

			assert.deepStrictEqual(
				getSandboxPrecheckInputsForToolInvocation(sessionResource, undefined, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([])),
				{ isDefaultApprovalPermissionEnabled: false }
			);
			assert.deepStrictEqual(
				getSandboxPrecheckInputsForToolInvocation(sessionResource, undefined, createMockChatWidgetService(ChatPermissionLevel.Autopilot), createMockChatService([])),
				{ isDefaultApprovalPermissionEnabled: false }
			);
		});
	});

	suite('findLineNumber', () => {

		test('finds exact match', () => {
			const model = disposables.add(createTextModel('line one\nline two\nline three'));
			assert.strictEqual(findLineNumber(model, 'line two'), 2);
		});

		test('handles whitespace normalization', () => {
			const model = disposables.add(createTextModel('function   doSomething(x:  number) {}'));
			assert.strictEqual(findLineNumber(model, 'function doSomething(x: number)'), 1);
		});

		test('returns undefined when not found', () => {
			const model = disposables.add(createTextModel('hello world'));
			assert.strictEqual(findLineNumber(model, 'not here'), undefined);
		});

		test('handles regex special characters in content', () => {
			const model = disposables.add(createTextModel('const arr = [1, 2, 3];'));
			assert.strictEqual(findLineNumber(model, '[1, 2, 3]'), 1);
		});

		test('finds partial line match', () => {
			const model = disposables.add(createTextModel('import { MyClass } from "./myModule";'));
			assert.strictEqual(findLineNumber(model, 'MyClass'), 1);
		});

		test('trims leading and trailing whitespace from input', () => {
			const model = disposables.add(createTextModel('const x = 42;'));
			assert.strictEqual(findLineNumber(model, '  const x = 42;  '), 1);
		});
	});

	suite('findSymbolColumn', () => {

		test('finds symbol with word boundaries', () => {
			assert.strictEqual(findSymbolColumn('const myVar = 42;', 'myVar'), 7);
		});

		test('returns 1-based column', () => {
			assert.strictEqual(findSymbolColumn('x = 1', 'x'), 1);
		});

		test('does not match partial words', () => {
			assert.strictEqual(findSymbolColumn('const myVariable = 42;', 'myVar'), undefined);
		});

		test('returns undefined when not found', () => {
			assert.strictEqual(findSymbolColumn('hello world', 'missing'), undefined);
		});

		test('handles regex special characters in symbol name', () => {
			assert.strictEqual(findSymbolColumn('arr[0] = 1', 'arr'), 1);
		});

		test('finds first occurrence', () => {
			assert.strictEqual(findSymbolColumn('foo + foo', 'foo'), 1);
		});
	});

	suite('errorResult', () => {

		test('creates result with text content', () => {
			const result = errorResult('something went wrong');
			const textPart = result.content.find(p => p.kind === 'text');
			assert.ok(textPart);
			assert.strictEqual((textPart as { kind: 'text'; value: string }).value, 'something went wrong');
		});

		test('sets toolResultMessage', () => {
			const result = errorResult('error message');
			assert.ok(result.toolResultMessage);
		});
	});
});
