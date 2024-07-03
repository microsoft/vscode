/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { MenuId, MenuRegistry, IMenuItem } from 'vs/platform/actions/common/actions';
import { ITerminalGroupService, ITerminalService as IIntegratedTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ResourceContextKey } from 'vs/workbench/common/contextkeys';
import { IFileService } from 'vs/platform/files/common/files';
import { IListService } from 'vs/platform/list/browser/listService';
import { getMultiSelectedResources, IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Schemas } from 'vs/base/common/network';
import { distinct } from 'vs/base/common/arrays';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { dirname, basename } from 'vs/base/common/path';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IExternalTerminalConfiguration, IExternalTerminalService } from 'vs/platform/externalTerminal/common/externalTerminal';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

const OPEN_IN_TERMINAL_COMMAND_ID = 'openInTerminal';
const OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID = 'openInIntegratedTerminal';

function registerOpenTerminalCommand(id: string, explorerKind: 'integrated' | 'external') {
	CommandsRegistry.registerCommand({
		id: id,
		handler: async (accessor, resource: URI) => {

			const configurationService = accessor.get(IConfigurationService);
			const editorService = accessor.get(IEditorService);
			const fileService = accessor.get(IFileService);
			const integratedTerminalService = accessor.get(IIntegratedTerminalService);
			const remoteAgentService = accessor.get(IRemoteAgentService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			let externalTerminalService: IExternalTerminalService | undefined = undefined;
			try {
				externalTerminalService = accessor.get(IExternalTerminalService);
			} catch {
			}

			const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
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
