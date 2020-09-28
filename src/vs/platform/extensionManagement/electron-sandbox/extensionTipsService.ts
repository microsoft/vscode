/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { basename, join, } from 'vs/base/common/path';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IFileService } from 'vs/platform/files/common/files';
import { isWindows } from 'vs/base/common/platform';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IExecutableBasedExtensionTip, IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { forEach, IStringDictionary } from 'vs/base/common/collections';
import { IRequestService } from 'vs/platform/request/common/request';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtensionTipsService as BaseExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionTipsService';
import { timeout } from 'vs/base/common/async';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { localize } from 'vs/nls';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

type ExeExtensionRecommendationsClassification = {
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	exeName: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type IExeBasedExtensionTips = {
	readonly exeFriendlyName: string,
	readonly windowsPath?: string,
	readonly recommendations: { extensionId: string, extensionName: string, isExtensionPack: boolean }[];
};

const promptedExecutableTipsStorageKey = 'extensionTips/promptedExecutableTips';

export class ExtensionTipsService extends BaseExtensionTipsService {

	_serviceBrand: any;

	private readonly allImportantExecutableTips: Map<string, IExeBasedExtensionTips> = new Map<string, IExeBasedExtensionTips>();
	private readonly allOtherExecutableTips: Map<string, IExeBasedExtensionTips> = new Map<string, IExeBasedExtensionTips>();

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionRecommendationNotificationService private readonly extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
	) {
		super(fileService, productService, requestService, logService);
		if (productService.exeBasedExtensionTips) {
			forEach(productService.exeBasedExtensionTips, ({ key, value }) => {
				const importantRecommendations: { extensionId: string, extensionName: string, isExtensionPack: boolean }[] = [];
				const otherRecommendations: { extensionId: string, extensionName: string, isExtensionPack: boolean }[] = [];
				forEach(value.recommendations, ({ key: extensionId, value }) => {
					if (value.important) {
						importantRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
					} else {
						otherRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
					}
				});
				if (importantRecommendations.length) {
					this.allImportantExecutableTips.set(key, { exeFriendlyName: value.friendlyName, windowsPath: value.windowsPath, recommendations: importantRecommendations });
				}
				if (otherRecommendations.length) {
					this.allOtherExecutableTips.set(key, { exeFriendlyName: value.friendlyName, windowsPath: value.windowsPath, recommendations: otherRecommendations });
				}
			});
		}

		/*
			3s has come out to be the good number to fetch and prompt important exe based recommendations
			Also fetch important exe based recommendations for reporting telemetry
		*/
		timeout(3000).then(() => this.promptImportantExeBasedRecommendations());
	}

	getImportantExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return this.getValidExecutableBasedExtensionTips(this.allImportantExecutableTips);
	}

	getOtherExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return this.getValidExecutableBasedExtensionTips(this.allOtherExecutableTips);
	}

	private async promptImportantExeBasedRecommendations(): Promise<void> {
		const importantExeBasedRecommendations = new Map<string, IExecutableBasedExtensionTip>();
		const importantExeBasedTips = await this.getImportantExecutableBasedTips();
		importantExeBasedTips.forEach(tip => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));

		const local = await this.extensionManagementService.getInstalled();
		const { installed, uninstalled: recommendations } = this.groupByInstalled([...importantExeBasedRecommendations.keys()], local);

		/* Log installed and uninstalled exe based recommendations */
		for (const extensionId of installed) {
			const tip = importantExeBasedRecommendations.get(extensionId);
			if (tip) {
				this.telemetryService.publicLog2<{ exeName: string, extensionId: string }, ExeExtensionRecommendationsClassification>('exeExtensionRecommendations:alreadyInstalled', { extensionId, exeName: basename(tip.windowsPath!) });
			}
		}
		for (const extensionId of recommendations) {
			const tip = importantExeBasedRecommendations.get(extensionId);
			if (tip) {
				this.telemetryService.publicLog2<{ exeName: string, extensionId: string }, ExeExtensionRecommendationsClassification>('exeExtensionRecommendations:notInstalled', { extensionId, exeName: basename(tip.windowsPath!) });
			}
		}

		const recommendationsByExe = new Map<string, IExecutableBasedExtensionTip[]>();
		const promptedExecutableTips = this.getPromptedExecutableTips();
		for (const extensionId of recommendations) {
			const tip = importantExeBasedRecommendations.get(extensionId);
			if (tip && (!promptedExecutableTips[tip.exeName] || !promptedExecutableTips[tip.exeName].includes(tip.extensionId))) {
				let tips = recommendationsByExe.get(tip.exeName);
				if (!tips) {
					tips = [];
					recommendationsByExe.set(tip.exeName, tips);
				}
				tips.push(tip);
			}
		}

		for (const [, tips] of recommendationsByExe) {
			const extensionIds = tips.map(({ extensionId }) => extensionId.toLowerCase());
			const message = localize('exeRecommended', "You have {0} installed on your system. Do you want to install the recommended extensions for it?", tips[0].exeFriendlyName);
			this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification(extensionIds, message, `@exe:"${tips[0].exeName}"`)
				.then(result => {
					if (result) {
						this.addToRecommendedExecutables(tips[0].exeName, extensionIds);
					}
				});
		}
	}

	private getPromptedExecutableTips(): IStringDictionary<string[]> {
		return JSON.parse(this.storageService.get(promptedExecutableTipsStorageKey, StorageScope.GLOBAL, '{}'));
	}

	private addToRecommendedExecutables(exeName: string, extensions: string[]) {
		const promptedExecutableTips = this.getPromptedExecutableTips();
		promptedExecutableTips[exeName] = extensions;
		this.storageService.store(promptedExecutableTipsStorageKey, JSON.stringify(promptedExecutableTips), StorageScope.GLOBAL);
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

	private async getValidExecutableBasedExtensionTips(executableTips: Map<string, IExeBasedExtensionTips>): Promise<IExecutableBasedExtensionTip[]> {
		const result: IExecutableBasedExtensionTip[] = [];

		const checkedExecutables: Map<string, boolean> = new Map<string, boolean>();
		for (const exeName of executableTips.keys()) {
			const extensionTip = executableTips.get(exeName);
			if (!extensionTip || !isNonEmptyArray(extensionTip.recommendations)) {
				continue;
			}

			const exePaths: string[] = [];
			if (isWindows) {
				if (extensionTip.windowsPath) {
					exePaths.push(extensionTip.windowsPath.replace('%USERPROFILE%', process.env['USERPROFILE']!)
						.replace('%ProgramFiles(x86)%', process.env['ProgramFiles(x86)']!)
						.replace('%ProgramFiles%', process.env['ProgramFiles']!)
						.replace('%APPDATA%', process.env['APPDATA']!)
						.replace('%WINDIR%', process.env['WINDIR']!));
				}
			} else {
				exePaths.push(join('/usr/local/bin', exeName));
				exePaths.push(join('/usr/bin', exeName));
				exePaths.push(join(this.environmentService.userHome.fsPath, exeName));
			}

			for (const exePath of exePaths) {
				let exists = checkedExecutables.get(exePath);
				if (exists === undefined) {
					exists = await this.fileService.exists(URI.file(exePath));
					checkedExecutables.set(exePath, exists);
				}
				if (exists) {
					for (const { extensionId, extensionName, isExtensionPack } of extensionTip.recommendations) {
						result.push({
							extensionId,
							extensionName,
							isExtensionPack,
							exeName,
							exeFriendlyName: extensionTip.exeFriendlyName,
							windowsPath: extensionTip.windowsPath,
						});
					}
				}
			}
		}

		return result;
	}

}
