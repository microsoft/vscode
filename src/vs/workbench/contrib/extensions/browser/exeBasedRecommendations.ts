/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionTipsService, IExecutableBasedExtensionTip, IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionRecommendations, ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { timeout } from 'vs/base/common/async';
import { localize } from 'vs/nls';
import { IStringDictionary } from 'vs/base/common/collections';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { basename } from 'vs/base/common/path';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';

type ExeExtensionRecommendationsClassification = {
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	exeName: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

export class ExeBasedRecommendations extends ExtensionRecommendations {


	private readonly _otherRecommendations: ExtensionRecommendation[] = [];
	get otherRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._otherRecommendations; }

	private readonly _importantRecommendations: ExtensionRecommendation[] = [];
	get importantRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._importantRecommendations; }

	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return [...this.importantRecommendations, ...this.otherRecommendations]; }

	private readonly tasExperimentService: ITASExperimentService | undefined;

	constructor(
		isExtensionAllowedToBeRecommended: (extensionId: string) => boolean,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
	) {
		super(isExtensionAllowedToBeRecommended, instantiationService, configurationService, notificationService, telemetryService, storageService, storageKeysSyncRegistryService);
		this.tasExperimentService = tasExperimentService;

		/*
			3s has come out to be the good number to fetch and prompt important exe based recommendations
			Also fetch important exe based recommendations for reporting telemetry
		*/
		timeout(3000).then(() => this.fetchAndPromptImportantExeBasedRecommendations());
	}

	protected async doActivate(): Promise<void> {
		const otherExectuableBasedTips = await this.extensionTipsService.getOtherExecutableBasedTips();
		otherExectuableBasedTips.forEach(tip => this._otherRecommendations.push(this.toExtensionRecommendation(tip)));
		await this.fetchImportantExeBasedRecommendations();
	}

	private _importantExeBasedRecommendations: Promise<IStringDictionary<IExecutableBasedExtensionTip>> | undefined;
	private async fetchImportantExeBasedRecommendations(): Promise<IStringDictionary<IExecutableBasedExtensionTip>> {
		if (!this._importantExeBasedRecommendations) {
			this._importantExeBasedRecommendations = this.doFetchImportantExeBasedRecommendations();
		}
		return this._importantExeBasedRecommendations;
	}

	private async doFetchImportantExeBasedRecommendations(): Promise<IStringDictionary<IExecutableBasedExtensionTip>> {
		const importantExeBasedRecommendations: IStringDictionary<IExecutableBasedExtensionTip> = {};
		const importantExectuableBasedTips = await this.extensionTipsService.getImportantExecutableBasedTips();
		importantExectuableBasedTips.forEach(tip => {
			this._importantRecommendations.push(this.toExtensionRecommendation(tip));
			importantExeBasedRecommendations[tip.extensionId.toLowerCase()] = tip;
		});
		return importantExeBasedRecommendations;
	}

	private async fetchAndPromptImportantExeBasedRecommendations(): Promise<void> {
		const importantExeBasedRecommendations = await this.fetchImportantExeBasedRecommendations();

		const local = await this.extensionManagementService.getInstalled();
		const { installed, uninstalled } = this.groupByInstalled(Object.keys(importantExeBasedRecommendations), local);

		/* Log installed and uninstalled exe based recommendations */
		for (const extensionId of installed) {
			const tip = importantExeBasedRecommendations[extensionId];
			this.telemetryService.publicLog2<{ exeName: string, extensionId: string }, ExeExtensionRecommendationsClassification>('exeExtensionRecommendations:alreadyInstalled', { extensionId, exeName: basename(tip.windowsPath!) });
		}
		for (const extensionId of uninstalled) {
			const tip = importantExeBasedRecommendations[extensionId];
			this.telemetryService.publicLog2<{ exeName: string, extensionId: string }, ExeExtensionRecommendationsClassification>('exeExtensionRecommendations:notInstalled', { extensionId, exeName: basename(tip.windowsPath!) });
		}

		this.promptImportantExeBasedRecommendations(uninstalled, importantExeBasedRecommendations);
	}

	private async promptImportantExeBasedRecommendations(recommendations: string[], importantExeBasedRecommendations: IStringDictionary<IExecutableBasedExtensionTip>): Promise<void> {
		if (this.hasToIgnoreRecommendationNotifications()) {
			return;
		}
		recommendations = this.filterIgnoredOrNotAllowed(recommendations);
		if (recommendations.length === 0) {
			return;
		}

		const recommendationsByExe = new Map<string, IExecutableBasedExtensionTip[]>();
		for (const extensionId of recommendations) {
			const tip = importantExeBasedRecommendations[extensionId];
			let tips = recommendationsByExe.get(tip.exeFriendlyName);
			if (!tips) {
				tips = [];
				recommendationsByExe.set(tip.exeFriendlyName, tips);
			}
			tips.push(tip);
		}

		for (const [, tips] of recommendationsByExe) {
			const extensionIds = tips.map(({ extensionId }) => extensionId.toLowerCase());
			if (this.tasExperimentService && extensionIds.indexOf('ms-vscode-remote.remote-wsl') !== -1) {
				await this.tasExperimentService.getTreatment<boolean>('wslpopupaa');
			}

			if (tips.length === 1) {
				const tip = tips[0];
				const message = tip.isExtensionPack ? localize('extensionPackRecommended', "The '{0}' extension pack is recommended as you have {1} installed on your system.", tip.extensionName, tip.exeFriendlyName || basename(tip.windowsPath!))
					: localize('exeRecommended', "The '{0}' extension is recommended as you have {1} installed on your system.", tip.extensionName, tip.exeFriendlyName || basename(tip.windowsPath!));
				this.promptImportantExtensionsInstallNotification(extensionIds, message);
			}

			else if (tips.length === 2) {
				const message = localize('two extensions recommended', "The '{0}' and '{1}' extensions are recommended as you have {2} installed on your system.", tips[0].extensionName, tips[1].extensionName, tips[0].exeFriendlyName || basename(tips[0].windowsPath!));
				this.promptImportantExtensionsInstallNotification(extensionIds, message);
			}

			else if (tips.length > 2) {
				const message = localize('more than two extensions recommended', "The '{0}', '{1}' and other extensions are recommended as you have {2} installed on your system.", tips[0].extensionName, tips[1].extensionName, tips[0].exeFriendlyName || basename(tips[0].windowsPath!));
				this.promptImportantExtensionsInstallNotification(extensionIds, message);
			}
		}
	}

	private groupByInstalled(recommendationsToSuggest: string[], local: ILocalExtension[]): { installed: string[], uninstalled: string[] } {
		const installed: string[] = [], uninstalled: string[] = [];
		const installedExtensionsIds = local.reduce((result, i) => { result.add(i.identifier.id.toLowerCase()); return result; }, new Set<string>());
		recommendationsToSuggest.forEach(id => {
			if (installedExtensionsIds.has(id.toLowerCase())) {
				installed.push(id);
			} else {
				uninstalled.push(id);
			}
		});
		return { installed, uninstalled };
	}

	private toExtensionRecommendation(tip: IExecutableBasedExtensionTip): ExtensionRecommendation {
		return {
			extensionId: tip.extensionId.toLowerCase(),
			source: 'executable',
			reason: {
				reasonId: ExtensionRecommendationReason.Executable,
				reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", tip.exeFriendlyName || basename(tip.windowsPath!))
			}
		};
	}

}

