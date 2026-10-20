/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { combinedDisposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Action2, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import product from '../../../../platform/product/common/product.js';
import { InstallShellScriptAction } from '../../../electron-browser/actions/installActions.js';
import { ChatConfiguration } from '../../chat/common/constants.js';
import { ITerminalGroupService, ITerminalService } from '../browser/terminal.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';

const copilotCliEnabled = ContextKeyExpr.equals(`config.${ChatConfiguration.CopilotCliCommandEnabled}`, true);
const copilotCliAvailable = ContextKeyExpr.and(ChatEntitlementContextKeys.Setup.hidden.negate(), copilotCliEnabled);
const copilotCliUnavailable = ContextKeyExpr.or(ChatEntitlementContextKeys.Setup.hidden, ContextKeyExpr.notEquals(`config.${ChatConfiguration.CopilotCliCommandEnabled}`, true));

interface IInstallCopilotPickItem extends IQuickPickItem {
	readonly installCopilot: boolean;
}

export class InstallShellScriptWithCopilotAction extends Action2 {

	constructor() {
		const legacyAction = new InstallShellScriptAction();
		super({
			...legacyAction.desc,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const legacyAction = new InstallShellScriptAction();
		const configurationService = accessor.get(IConfigurationService);
		const chatEntitlementService = accessor.get(IChatEntitlementService);
		const quickInputService = accessor.get(IQuickInputService);
		const nativeEnvironmentService = accessor.get(INativeEnvironmentService);
		const fileService = accessor.get(IFileService);
		const dialogService = accessor.get(IDialogService);
		const terminalService = accessor.get(ITerminalService);
		const terminalGroupService = accessor.get(ITerminalGroupService);
		const instantiationService = accessor.get(IInstantiationService);
		const installLegacyCommand = () => instantiationService.invokeFunction(legacyAccessor => legacyAction.run(legacyAccessor));

		if (chatEntitlementService.sentiment.hidden || !configurationService.getValue<boolean>(ChatConfiguration.CopilotCliCommandEnabled)) {
			return installLegacyCommand();
		}

		const picks: IInstallCopilotPickItem[] = [
			{ label: localize('yes', "Yes"), installCopilot: true },
			{ label: localize('no', "No"), installCopilot: false }
		];
		const pick = await quickInputService.pick(picks, {
			placeHolder: localize('installCopilotPrompt', "Would you also like to install GitHub Copilot CLI?"),
			activeItem: picks[0]
		});

		if (!pick) {
			return;
		}

		if (pick.installCopilot) {
			await this._installCopilot(
				configurationService,
				chatEntitlementService,
				nativeEnvironmentService,
				fileService,
				dialogService,
				terminalService,
				terminalGroupService
			);
		}

		return installLegacyCommand();
	}

	private async _installCopilot(
		configurationService: IConfigurationService,
		chatEntitlementService: IChatEntitlementService,
		nativeEnvironmentService: INativeEnvironmentService,
		fileService: IFileService,
		dialogService: IDialogService,
		terminalService: ITerminalService,
		terminalGroupService: ITerminalGroupService
	): Promise<void> {
		if (chatEntitlementService.sentiment.hidden || !configurationService.getValue<boolean>(ChatConfiguration.CopilotCliCommandEnabled)) {
			return;
		}

		const shim = URI.file(join(nativeEnvironmentService.appRoot, 'bin', 'copilot-shim', 'copilot'));

		try {
			if (!await fileService.exists(shim)) {
				await dialogService.error(localize('copilotShimMissing', "GitHub Copilot CLI installation could not be started because the shipped installer was not found."));
				return;
			}

			if (chatEntitlementService.sentiment.hidden || !configurationService.getValue<boolean>(ChatConfiguration.CopilotCliCommandEnabled)) {
				return;
			}

			const terminal = await terminalService.createTerminal({
				config: {
					name: localize('copilotInstallTerminal', "Install GitHub Copilot CLI"),
					executable: shim.fsPath,
					args: ['--vscode-shim', 'install', '--interactive'],
					useShellEnvironment: true,
					isFeatureTerminal: true,
					isTransient: true,
					waitOnExit: localize('pressAnyKeyToCloseTerminal', "Press any key to close this terminal.")
				},
				cwd: nativeEnvironmentService.userHome,
				location: TerminalLocation.Panel,
				skipContributedProfileCheck: true
			});
			terminalService.setActiveInstance(terminal);
			await terminalGroupService.showPanel(true);
		} catch (error) {
			await dialogService.error(localize('copilotShimStartFailed', "GitHub Copilot CLI installation could not be started: {0}", error instanceof Error ? error.message : String(error)));
		}
	}
}

export function registerInstallShellScriptWithCopilotMenu(): IDisposable {
	const legacyAction = new InstallShellScriptAction();
	return combinedDisposable(
		MenuRegistry.addCommand(legacyAction.desc),
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				...legacyAction.desc,
				title: localize2('installWithCopilot', "Install '{0}' and optionally 'copilot' commands in PATH", product.applicationName)
			},
			when: copilotCliAvailable
		}),
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: legacyAction.desc,
			when: copilotCliUnavailable
		})
	);
}
