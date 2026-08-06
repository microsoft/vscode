/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { parseExplicitNewSessionRequest, resolveNewSessionWorkspaceFolder, selectRouterShortlist } from '../../../browser/sessionRouter/chatSessionRoutingController.js';

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

	test('uses router-tool order rather than lexical title matching for the enrichment shortlist', () => {
		const candidates = Array.from({ length: 13 }, (_, index) => ({
			sessionId: `s${index}`,
			label: index === 0 ? 'exact lexical title match' : `session ${index}`,
		}));
		const results = candidates.slice(1).reverse().map((candidate, index) => ({
			sessionId: candidate.sessionId,
			confidence: 1 - index / 100,
		}));

		assert.deepStrictEqual(
			selectRouterShortlist(candidates, results).map(candidate => candidate.sessionId),
			results.map(result => result.sessionId),
		);
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
});

function folder(name: string, path: string, index: number): IWorkspaceFolder {
	const uri = URI.file(path);
	return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
}
