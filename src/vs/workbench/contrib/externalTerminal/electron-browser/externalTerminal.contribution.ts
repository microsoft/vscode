/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as paths from '../../../../base/common/path.js';
import { DEFAULT_TERMINAL_OSX, IExternalTerminalSettings } from '../../../../platform/externalTerminal/common/externalTerminal.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationRegistry, Extensions, ConfigurationScope, type IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IExternalTerminalService } from '../../../../platform/externalTerminal/electron-browser/externalTerminalService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TerminalContextKeys } from '../../terminal/common/terminalContextKey.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

const OPEN_NATIVE_CONSOLE_COMMAND_ID = 'workbench.action.terminal.openNativeConsole';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: OPEN_NATIVE_CONSOLE_COMMAND_ID,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
	when: TerminalContextKeys.notFocus,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: async (accessor) => {
		const historyService = accessor.get(IHistoryService);
		// Open external terminal in local workspaces
		const terminalService = accessor.get(IExternalTerminalService);
		const configurationService = accessor.get(IConfigurationService);
		const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
		const root = historyService.getLastActiveWorkspaceRoot();
		const config = configurationService.getValue<IExternalTerminalSettings>('terminal.external');

		// It's a local workspace, open the root
		if (root?.scheme === Schemas.file) {
			terminalService.openTerminal(config, root.fsPath);
			return;
		}

		// If it's a remote workspace, open the canonical URI if it is a local folder
		try {
			if (root?.scheme === Schemas.vscodeRemote) {
				const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(root);
				if (canonicalUri.scheme === Schemas.file) {
					terminalService.openTerminal(config, canonicalUri.fsPath);
					return;
				}
			}
		} catch { }

		// Open the current file's folder if it's local or its canonical URI is local
		// Opens current file's folder, if no folder is open in editor
		const activeFile = historyService.getLastActiveFile(Schemas.file);
		if (activeFile?.scheme === Schemas.file) {
			terminalService.openTerminal(config, paths.dirname(activeFile.fsPath));
			return;
		}
		try {
			if (activeFile?.scheme === Schemas.vscodeRemote) {
				const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(activeFile);
				if (canonicalUri.scheme === Schemas.file) {
					terminalService.openTerminal(config, canonicalUri.fsPath);
					return;
				}
			}
		} catch { }

		// Fallback to opening without a cwd which will end up using the local home path
		terminalService.openTerminal(config, undefined);
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OPEN_NATIVE_CONSOLE_COMMAND_ID,
		title: nls.localize2('globalConsoleAction', "Open New External Terminal")
	}
});

export class ExternalTerminalContribution implements IWorkbenchContribution {

	public _serviceBrand: undefined;
	constructor(@IExternalTerminalService private readonly _externalTerminalService: IExternalTerminalService) {
		this._updateConfiguration();
	}

	private async _updateConfiguration(): Promise<void> {
		const terminals = await this._externalTerminalService.getDefaultTerminalForPlatforms();
		const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const terminalKindProperties: Partial<IConfigurationPropertySchema> = {
			type: 'string',
			enum: [
				'integrated',
				'external',
				'both'
			],
			enumDescriptions: [
				nls.localize('terminal.kind.integrated', "Show the integrated terminal action."),
				nls.localize('terminal.kind.external', "Show the external terminal action."),
				nls.localize('terminal.kind.both', "Show both integrated and external terminal actions.")
			],
			default: 'integrated'
		};
		configurationRegistry.registerConfiguration({
			id: 'externalTerminal',
			order: 100,
			title: nls.localize('terminalConfigurationTitle', "External Terminal"),
			type: 'object',
			properties: {
				'terminal.explorerKind': {
					...terminalKindProperties,
					description: nls.localize('explorer.openInTerminalKind', "When opening a file from the Explorer in a terminal, determines what kind of terminal will be launched"),
				},
				'terminal.sourceControlRepositoriesKind': {
					...terminalKindProperties,
					description: nls.localize('sourceControlRepositories.openInTerminalKind', "When opening a repository from the Source Control Repositories view in a terminal, determines what kind of terminal will be launched"),
				},
				'terminal.external.windowsExec': {
					type: 'string',
					description: nls.localize('terminal.external.windowsExec', "Customizes which terminal to run on Windows."),
					default: terminals.windows,
					scope: ConfigurationScope.APPLICATION
				},
				'terminal.external.osxExec': {
					type: 'string',
					description: nls.localize('terminal.external.osxExec', "Customizes which terminal application to run on macOS."),
					default: DEFAULT_TERMINAL_OSX,
					scope: ConfigurationScope.APPLICATION
				},
				'terminal.external.linuxExec': {
					type: 'string',
					description: nls.localize('terminal.external.linuxExec', "Customizes which terminal to run on Linux."),
					default: terminals.linux,
					scope: ConfigurationScope.APPLICATION
				}
			}
		});
	}
}

// Register workbench contributions
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExternalTerminalContribution, LifecyclePhase.Restored);
