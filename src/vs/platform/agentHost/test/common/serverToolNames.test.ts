/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isRenameChatTool, matchesServerToolName, SemanticDiffServerToolName, SessionServerToolName } from '../../common/serverToolNames.js';

suite('serverToolNames', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches bare and transport-prefixed server tool names only', () => {
		const name = SemanticDiffServerToolName.ClassifyDiffHunks;
		assert.deepStrictEqual({
			bare: matchesServerToolName(name, name),
			claudePrefixed: matchesServerToolName(`mcp__vscode__${name}`, name),
			undelimitedSuffix: matchesServerToolName(`my${name}`, name),
			differentTool: matchesServerToolName(SessionServerToolName.RenameChat, name),
			renameChat: [SessionServerToolName.RenameChat, `mcp__vscode__${SessionServerToolName.RenameChat}`, SessionServerToolName.CreateChat].map(isRenameChatTool),
		}, {
			bare: true,
			claudePrefixed: true,
			undelimitedSuffix: false,
			differentTool: false,
			renameChat: [true, true, false],
		});
	});
});
