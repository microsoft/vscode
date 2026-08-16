/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { parseExplicitNewSessionRequest, resolveMentionedWorkspaceFolder, resolveNewSessionWorkspaceFolder, resolveSessionWorkspaceFolder, selectBestSessionRoute, selectRouterShortlist } from '../../../browser/sessionRouter/chatSessionRoutingHelpers.js';

suite('Chat session routing helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const vscode = folder('vscode', '/work/vscode', 0);
	const docs = folder('vscode-docs', '/work/vscode-docs', 1);

	test('chooses an explicitly mentioned workspace folder', () => {
		assert.deepStrictEqual([
			resolveNewSessionWorkspaceFolder('update the vscode-docs API reference', [vscode, docs], [], [], vscode.uri)?.toString(),
			resolveNewSessionWorkspaceFolder('update the vscode docs API reference', [vscode, docs], [], [], vscode.uri)?.toString(),
			resolveNewSessionWorkspaceFolder('update the VS Code docs API reference', [vscode, docs], [], [], vscode.uri)?.toString(),
			resolveNewSessionWorkspaceFolder('update the VSCODE DOCS API reference', [vscode, docs], [], [], vscode.uri)?.toString(),
		], [
			docs.uri.toString(),
			docs.uri.toString(),
			docs.uri.toString(),
			docs.uri.toString(),
		]);
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

	test('explicit folder mention constrains existing session routing', () => {
		const mentionedFolder = resolveMentionedWorkspaceFolder('fix the API in vscode-docs', [vscode, docs]);
		const candidates = [
			{ sessionId: 'vscode', label: 'API work', cwd: '/work/vscode/src' },
			{ sessionId: 'docs', label: 'Documentation', cwd: '/WORK/VSCODE-DOCS/GUIDES' },
			{ sessionId: 'unknown', label: 'Unknown folder' },
		];

		assert.deepStrictEqual({
			mentionedFolder: mentionedFolder?.name,
			matchingCandidates: candidates
				.filter(candidate => resolveSessionWorkspaceFolder(candidate, [vscode, docs]) === mentionedFolder)
				.map(candidate => candidate.sessionId),
		}, {
			mentionedFolder: 'vscode-docs',
			matchingCandidates: ['docs'],
		});
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

	test('selects only a high-confidence route', () => {
		assert.deepStrictEqual(selectBestSessionRoute([
			{ sessionId: 'best', confidence: 0.9 },
			{ sessionId: 'previous', confidence: 0.86 },
		]), { sessionId: 'best', confidence: 0.9 });
		assert.strictEqual(selectBestSessionRoute([{ sessionId: 'weak', confidence: 0.8 }]), undefined);
	});

	test('keeps the default folder for a weak related-session match', () => {
		const result = resolveNewSessionWorkspaceFolder(
			'start something new',
			[vscode, docs],
			[{ sessionId: 'weak', confidence: 0.1 }],
			[{ sessionId: 'weak', label: 'Unrelated docs work', cwd: '/work/vscode-docs' }],
			vscode.uri,
		);

		assert.strictEqual(result?.toString(), vscode.uri.toString());
	});

	test('extracts only explicit new-session tasks', () => {
		assert.strictEqual(parseExplicitNewSessionRequest('Create a new session to update the chocolate file'), 'update the chocolate file');
		assert.strictEqual(parseExplicitNewSessionRequest('Please start a new chat session for fixing tests'), 'fixing tests');
		assert.strictEqual(parseExplicitNewSessionRequest('Create a new session'), undefined);
		assert.strictEqual(parseExplicitNewSessionRequest('Create a file in the current session'), undefined);
	});
});

function folder(name: string, path: string, index: number): IWorkspaceFolder {
	const uri = URI.file(path);
	return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
}
