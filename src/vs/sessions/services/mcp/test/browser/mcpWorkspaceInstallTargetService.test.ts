/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { SessionsWorkspaceContextService } from '../../../workspace/browser/workspaceContextService.js';
import { SessionsMcpWorkspaceInstallTargetService } from '../../browser/mcpWorkspaceInstallTargetService.js';

suite('Sessions MCP workspace install targets', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('excludes the synthetic workspace while following project folder changes', async () => {
		const workspace = store.add(new SessionsWorkspaceContextService(
			{ id: 'agents', configPath: URI.file('/settings/agent-sessions.code-workspace') },
			upcastPartial<IUriIdentityService>({ extUri }),
		));
		const service = new SessionsMcpWorkspaceInstallTargetService(workspace);
		const first = URI.file('/first');
		const second = URI.file('/second');
		const targets = [service.getTargets()];
		await workspace.addFolders([{ uri: first }]);
		targets.push(service.getTargets());
		await workspace.addFolders([{ uri: second }]);
		targets.push(service.getTargets());
		await workspace.removeFolders([first, second]);
		targets.push(service.getTargets());
		assert.deepStrictEqual(targets.map(items => items.map(item => typeof item === 'number' ? item : item.uri)), [
			[],
			[first],
			[first, second],
			[],
		]);
	});
});
