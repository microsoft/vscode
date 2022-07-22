/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isDefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class DeprecatedExtensionMigratorContribution {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		this.init().catch(onUnexpectedError);
	}

	private async init(): Promise<void> {
		const bracketPairColorizerId = 'coenraads.bracket-pair-colorizer';

		await this.extensionsWorkbenchService.queryLocal();
		const extension = this.extensionsWorkbenchService.installed.find(e => e.identifier.id === bracketPairColorizerId);
		if (
			!extension ||
			((extension.enablementState !== EnablementState.EnabledGlobally) &&
				(extension.enablementState !== EnablementState.EnabledWorkspace))
		) {
			return;
		}

		const state = await this.getState();
		const disablementLogEntry = state.disablementLog.some(d => d.extensionId === bracketPairColorizerId);

		if (disablementLogEntry) {
			return;
		}

		state.disablementLog.push({ extensionId: bracketPairColorizerId, disablementDateTime: new Date().getTime() });
		await this.setState(state);

		await this.extensionsWorkbenchService.setEnablement(extension, EnablementState.DisabledGlobally);

		const nativeBracketPairColorizationEnabledKey = 'editor.bracketPairColorization.enabled';
		const bracketPairColorizationEnabled = !!this.configurationService.inspect(nativeBracketPairColorizationEnabledKey).user;

		this.notificationService.notify({
			message: localize('bracketPairColorizer.notification', "The extension 'Bracket pair Colorizer' got disabled because it was deprecated."),
			severity: Severity.Info,
			actions: {
				primary: [
					new Action('', localize('bracketPairColorizer.notification.action.uninstall', "Uninstall Extension"), undefined, undefined, () => {
						this.extensionsWorkbenchService.uninstall(extension);
					}),
				],
				secondary: [
					!bracketPairColorizationEnabled ? new Action('', localize('bracketPairColorizer.notification.action.enableNative', "Enable Native Bracket Pair Colorization"), undefined, undefined, () => {
						this.configurationService.updateValue(nativeBracketPairColorizationEnabledKey, true, ConfigurationTarget.USER);
					}) : undefined,
					new Action('', localize('bracketPairColorizer.notification.action.showMoreInfo', "More Info"), undefined, undefined, () => {
						this.openerService.open('https://github.com/microsoft/vscode/issues/155179');
					}),
				].filter(isDefined),
			}
		});
	}

	private readonly storageKey = 'deprecatedExtensionMigrator.state';

	private async getState(): Promise<State> {
		const jsonStr = await this.storageService.get(this.storageKey, StorageScope.APPLICATION, '');
		if (jsonStr === '') {
			return { disablementLog: [] };
		}
		return JSON.parse(jsonStr) as State;
	}

	private async setState(state: State): Promise<void> {
		const json = JSON.stringify(state);
		await this.storageService.store(this.storageKey, json, StorageScope.APPLICATION, StorageTarget.USER);
	}
}

interface State {
	disablementLog: {
		extensionId: string;
		disablementDateTime: number;
	}[];
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DeprecatedExtensionMigratorContribution, LifecyclePhase.Restored);
