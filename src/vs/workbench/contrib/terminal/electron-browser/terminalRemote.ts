/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { registerTerminalAction } from '../browser/terminalActions.js';
import { TerminalCommandId } from '../common/terminal.js';
import { IHistoryService } from '../../../services/history/common/history.js';

export function registerRemoteContributions() {
	registerTerminalAction({
		id: TerminalCommandId.NewLocal,
		title: localize2('workbench.action.terminal.newLocal', 'Create New Integrated Terminal (Local)'),
		run: async (c, accessor) => {
			const historyService = accessor.get(IHistoryService);
			const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
			const nativeEnvironmentService = accessor.get(INativeEnvironmentService);
			let cwd: URI | undefined;
			try {
				const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.vscodeRemote);
				if (activeWorkspaceRootUri) {
					const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(activeWorkspaceRootUri);
					if (canonicalUri.scheme === Schemas.file) {
						cwd = canonicalUri;
					}
				}
			} catch { }
			if (!cwd) {
				cwd = nativeEnvironmentService.userHome;
			}
			const instance = await c.service.createTerminal({ cwd });
			if (!instance) {
				return Promise.resolve(undefined);
			}

			c.service.setActiveInstance(instance);
			return c.groupService.showPanel(true);
		}
	});
}
