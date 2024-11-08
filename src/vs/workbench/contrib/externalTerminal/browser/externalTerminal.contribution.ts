/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuId, MenuRegistry, IMenuItem } from '../../../../platform/actions/common/actions.js';
import { ITerminalGroupService, ITerminalService as IIntegratedTerminalService } from '../../terminal/browser/terminal.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { getMultiSelectedResources, IExplorerService } from '../../files/browser/files.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../base/common/network.js';
import { distinct } from '../../../../base/common/arrays.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { dirname, basename } from '../../../../base/common/path.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IExternalTerminalConfiguration, IExternalTerminalService } from '../../../../platform/externalTerminal/common/externalTerminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

const OPEN_IN_TERMINAL_COMMAND_ID = 'openInTerminal';
const OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID = 'openInIntegratedTerminal';

function registerOpenTerminalCommand(id: string, explorerKind: 'integrated' | 'external') {
	CommandsRegistry.registerCommand({
		id: id,
		handler: async (accessor, resource: URI) => {

			const configurationService = accessor.get(IConfigurationService);
			const fileService = accessor.get(IFileService);
			const integratedTerminalService = accessor.get(IIntegratedTerminalService);
			const remoteAgentService = accessor.get(IRemoteAgentService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			let externalTerminalService: IExternalTerminalService | undefined = undefined;
			try {
				externalTerminalService = accessor.get(IExternalTerminalService);
			} catch { }

			const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
			return fileService.resolveAll(resources.map(r => ({ resource: r }))).then(async stats => {
				// Always use integrated terminal when using a remote
				const config = configurationService.getValue<IExternalTerminalConfiguration>();

				const useIntegratedTerminal = remoteAgentService.getConnection() || explorerKind === 'integrated';
				const targets = distinct(stats.filter(data => data.success));
				if (useIntegratedTerminal) {
					// TODO: Use uri for cwd in createterminal
					const opened: { [path: string]: boolean } = {};
					const cwds = targets.map(({ stat }) => {
						const resource = stat!.resource;
						if (stat!.isDirectory) {
							return resource;
						}
						return URI.from({
							scheme: resource.scheme,
							authority: resource.authority,
							fragment: resource.fragment,
							query: resource.query,
							path: dirname(resource.path)
						});
					});
					for (const cwd of cwds) {
						if (opened[cwd.path]) {
							return;
						}
						opened[cwd.path] = true;
						const instance = await integratedTerminalService.createTerminal({ config: { cwd } });
						if (instance && instance.target !== TerminalLocation.Editor && (resources.length === 1 || !resource || cwd.path === resource.path || cwd.path === dirname(resource.path))) {
							integratedTerminalService.setActiveInstance(instance);
							terminalGroupService.showPanel(true);
						}
					}
				} else if (externalTerminalService) {
					distinct(targets.map(({ stat }) => stat!.isDirectory ? stat!.resource.fsPath : dirname(stat!.resource.fsPath))).forEach(cwd => {
						externalTerminalService.openTerminal(config.terminal.external, cwd);
					});
				}
			});
		}
	});
}

registerOpenTerminalCommand(OPEN_IN_TERMINAL_COMMAND_ID, 'external');
registerOpenTerminalCommand(OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID, 'integrated');

export class ExternalTerminalContribution extends Disposable implements IWorkbenchContribution {
	private _openInIntegratedTerminalMenuItem: IMenuItem;
	private _openInTerminalMenuItem: IMenuItem;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		const shouldShowIntegratedOnLocal = ContextKeyExpr.and(
			ResourceContextKey.Scheme.isEqualTo(Schemas.file),
			ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.explorerKind', 'integrated'), ContextKeyExpr.equals('config.terminal.explorerKind', 'both')));


		const shouldShowExternalKindOnLocal = ContextKeyExpr.and(
			ResourceContextKey.Scheme.isEqualTo(Schemas.file),
			ContextKeyExpr.or(ContextKeyExpr.equals('config.terminal.explorerKind', 'external'), ContextKeyExpr.equals('config.terminal.explorerKind', 'both')));

		this._openInIntegratedTerminalMenuItem = {
			group: 'navigation',
			order: 30,
			command: {
				id: OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID,
				title: nls.localize('scopedConsoleAction.Integrated', "Open in Integrated Terminal")
			},
			when: ContextKeyExpr.or(shouldShowIntegratedOnLocal, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))
		};


		this._openInTerminalMenuItem = {
			group: 'navigation',
			order: 31,
			command: {
				id: OPEN_IN_TERMINAL_COMMAND_ID,
				title: nls.localize('scopedConsoleAction.external', "Open in External Terminal")
			},
			when: shouldShowExternalKindOnLocal
		};


		MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInTerminalMenuItem);
		MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInIntegratedTerminalMenuItem);

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.explorerKind') || e.affectsConfiguration('terminal.external')) {
				this._refreshOpenInTerminalMenuItemTitle();
			}
		}));

		this._refreshOpenInTerminalMenuItemTitle();
	}

	private isWindows(): boolean {
		const config = this._configurationService.getValue<IExternalTerminalConfiguration>().terminal;
		if (isWindows && config.external?.windowsExec) {
			const file = basename(config.external.windowsExec);
			if (file === 'wt' || file === 'wt.exe') {
				return true;
			}
		}
		return false;
	}

	private _refreshOpenInTerminalMenuItemTitle(): void {
		if (this.isWindows()) {
			this._openInTerminalMenuItem.command.title = nls.localize('scopedConsoleAction.wt', "Open in Windows Terminal");
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExternalTerminalContribution, LifecyclePhase.Restored);
