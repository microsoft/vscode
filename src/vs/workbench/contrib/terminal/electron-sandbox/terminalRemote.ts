/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ITerminalGroupService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export function registerRemoteContributions() {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NewLocal,
				title: { value: localize('workbench.action.terminal.newLocal', "Create New Integrated Terminal (Local)"), original: 'Create New Integrated Terminal (Local)' },
				f1: true
			});
		}
		async run(accessor: ServicesAccessor) {
			const historyService = accessor.get(IHistoryService);
			const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
			const nativeEnvironmentService = accessor.get(INativeEnvironmentService);
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
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
			const instance = await terminalService.createTerminal({ cwd });
			if (!instance) {
				return Promise.resolve(undefined);
			}

			terminalService.setActiveInstance(instance);
			return terminalGroupService.showPanel(true);
		}
	});
}
