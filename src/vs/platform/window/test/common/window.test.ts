/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseExternalAgentsWindowNewSessionLinkUri } from '../../common/window.js';

suite('window', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses an external Agents Window new-session link', () => {
		const query = new URLSearchParams({
			workspace: 'file:///Users/example/project',
			prompt: 'Fix the tests & explain why',
		});
		const link = URI.from({
			scheme: 'vscode-insiders',
			authority: 'agents',
			path: '/new',
			query: query.toString(),
		});

		const parsed = parseExternalAgentsWindowNewSessionLinkUri(link, 'vscode-insiders');

		assert.deepStrictEqual(parsed && {
			workspace: parsed.workspaceUri.toString(),
			draft: parsed.draft,
		}, {
			workspace: 'file:///Users/example/project',
			draft: {
				inputText: 'Fix the tests & explain why',
				attachments: '[]',
			},
		});
	});

	test('rejects invalid external Agents Window new-session links', () => {
		assert.deepStrictEqual([
			parseExternalAgentsWindowNewSessionLinkUri('vscode://agents/new?workspace=file%3A%2F%2F%2Fproject&prompt=Fix', 'vscode-insiders'),
			parseExternalAgentsWindowNewSessionLinkUri('vscode-insiders://extensions/new?workspace=file%3A%2F%2F%2Fproject&prompt=Fix', 'vscode-insiders'),
			parseExternalAgentsWindowNewSessionLinkUri('vscode-insiders://agents/session?workspace=file%3A%2F%2F%2Fproject&prompt=Fix', 'vscode-insiders'),
			parseExternalAgentsWindowNewSessionLinkUri('vscode-insiders://agents/new?prompt=Fix', 'vscode-insiders'),
			parseExternalAgentsWindowNewSessionLinkUri('vscode-insiders://agents/new?workspace=file%3A%2F%2F%2Fproject', 'vscode-insiders'),
			parseExternalAgentsWindowNewSessionLinkUri('vscode-insiders://agents/new?workspace=project&prompt=Fix', 'vscode-insiders'),
		], [undefined, undefined, undefined, undefined, undefined, undefined]);
	});
});
