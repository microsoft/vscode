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
import { TerminalCommandId, ITerminalProfileResolverService } from '../common/terminal.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { OS } from '../../../../base/common/platform.js';

export function registerRemoteContributions() {
	registerTerminalAction({
		id: TerminalCommandId.NewLocal,
		title: localize2('workbench.action.terminal.newLocal', 'Create New Integrated Terminal (Local)'),
		run: async (c, accessor) => {
			const historyService = accessor.get(IHistoryService);
			const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
			const nativeEnvironmentService = accessor.get(INativeEnvironmentService);
			const terminalProfileResolverService = accessor.get(ITerminalProfileResolverService);
			const terminalLogService = accessor.get(ITerminalLogService);

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

			// Make sure to explicitly get the local default profile
			const localProfile = await terminalProfileResolverService.getDefaultProfile({
				remoteAuthority: undefined,
				os: OS
			});
			terminalLogService.trace('terminalRemote#newLocal resolved profile', {
				os: OS,
				profileName: localProfile?.profileName,
				isAutoDetected: localProfile?.isAutoDetected ?? false
			});

			// Create terminal with explicit local profile configuration
			const instance = await c.service.createTerminal({
				cwd,
				config: localProfile
			});
			if (!instance) {
				return Promise.resolve(undefined);
			}

			c.service.setActiveInstance(instance);
			return c.groupService.showPanel(true);
		}
	});
}
