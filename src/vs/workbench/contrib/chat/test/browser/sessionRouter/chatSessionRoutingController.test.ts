/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost, parseExplicitNewSessionRequest, resolveNewSessionWorkspaceFolder, selectBestSessionRoute, selectRouterShortlist } from '../../../browser/sessionRouter/chatSessionRoutingController.js';
import { ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';

suite('ChatSessionRoutingController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const vscode = folder('vscode', '/work/vscode', 0);
	const docs = folder('vscode-docs', '/work/vscode-docs', 1);

	test('chooses an explicitly mentioned workspace folder', () => {
		const result = resolveNewSessionWorkspaceFolder(
			'update the vscode-docs API reference',
			[vscode, docs],
			[],
			[],
			vscode.uri,
		);

		assert.strictEqual(result?.toString(), docs.uri.toString());
	});

	test('uses a related session working directory when starting a new session', () => {
		const result = resolveNewSessionWorkspaceFolder(
			'continue the authentication cleanup',
			[vscode, docs],
			[{ sessionId: 'related', confidence: 0.5 }],
			[{ sessionId: 'related', label: 'Authentication cleanup', cwd: '/work/vscode-docs/src' }],
			vscode.uri,
		);

		assert.strictEqual(result?.toString(), docs.uri.toString());
	});

	test('explicit folder mention overrides a related session in another folder', () => {
		const result = resolveNewSessionWorkspaceFolder(
			'update the vscode-docs API reference',
			[vscode, docs],
			[{ sessionId: 'related', confidence: 0.9 }],
			[{ sessionId: 'related', label: 'Related work', cwd: '/work/vscode/src' }],
			vscode.uri,
		);

		assert.strictEqual(result?.toString(), docs.uri.toString());
	});

	test('bounds transcript enrichment after every candidate receives model scoring', () => {
		const candidates = Array.from({ length: 13 }, (_, index) => ({
			sessionId: `s${index}`,
			label: `Session ${index}`,
			status: index === 12 ? 'working' : 'idle',
			lastActivity: index,
		}));
		const shortlist = selectRouterShortlist(candidates, [
			{ sessionId: 's0', confidence: 0.9 },
			{ sessionId: 's3', confidence: 0.8 },
		]);

		assert.deepStrictEqual({
			length: shortlist.length,
			first: shortlist[0].sessionId,
			second: shortlist[1].sessionId,
			third: shortlist[2].sessionId,
			excluded: candidates.filter(candidate => !shortlist.includes(candidate)).map(candidate => candidate.sessionId),
		}, {
			length: 12,
			first: 's0',
			second: 's3',
			third: 's12',
			excluded: ['s1'],
		});
	});

	test('selects the highest-confidence route without a sticky-session override', () => {
		assert.deepStrictEqual(selectBestSessionRoute([
			{ sessionId: 'best', confidence: 0.9 },
			{ sessionId: 'previous', confidence: 0.86 },
		]), { sessionId: 'best', confidence: 0.9 });
	});

	test('keeps the sticky default for a weak related-session match', () => {
		const result = resolveNewSessionWorkspaceFolder(
			'start something new',
			[vscode, docs],
			[{ sessionId: 'weak', confidence: 0.1 }],
			[{ sessionId: 'weak', label: 'Unrelated docs work', cwd: '/work/vscode-docs' }],
			vscode.uri,
		);

		assert.strictEqual(result?.toString(), vscode.uri.toString());
	});

	test('extracts the task from an explicit new-session voice request', () => {
		assert.strictEqual(parseExplicitNewSessionRequest('Create a new session to update the chocolate file'), 'update the chocolate file');
		assert.strictEqual(parseExplicitNewSessionRequest('Please start a new chat session for fixing tests'), 'fixing tests');
		assert.strictEqual(parseExplicitNewSessionRequest('Create a new session'), undefined);
		assert.strictEqual(parseExplicitNewSessionRequest('Create a file in the current session'), undefined);
	});

	test('returns the stable request id for an immediately sent route', async () => {
		const resource = URI.parse('agent-host-copilotcli:/untitled-route');
		const chatService = {
			sendRequest: async (): Promise<ChatSendResult> => ({
				kind: 'sent',
				newSessionResource: URI.parse('agent-host-copilotcli:/durable-route'),
				data: {
					agent: undefined!,
					responseCreatedPromise: Promise.resolve({ requestId: 'stable-request-id' } as never),
					responseCompletePromise: Promise.resolve(),
				},
			}),
		} as unknown as IChatService;
		const controller = new ChatSessionRoutingController(
			{} as IChatSessionRoutingHost,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const sendRequest = Reflect.get(controller, '_sendRequest') as (resource: URI, utterance: string, options: object) => Promise<{ status: string; resource?: URI; requestId?: string }>;

		const result = await sendRequest.call(controller, resource, 'Run the build', {});

		assert.deepStrictEqual({
			status: result.status,
			resource: result.resource?.toString(),
			requestId: result.requestId,
		}, {
			status: 'sent',
			resource: 'agent-host-copilotcli:/durable-route',
			requestId: 'stable-request-id',
		});
		controller.dispose();
	});
});

function folder(name: string, path: string, index: number): IWorkspaceFolder {
	const uri = URI.file(path);
	return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
}
