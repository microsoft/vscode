/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionRecommendationsService, milliSecondsInADay } from 'vs/workbench/contrib/extensions/browser/extensionRecommendationsService';
import { IExtensionRecommendationsService, IWorkbenchExtensionEnablementService, ExtensionRecommendationReason, IExtensionRecommendation, ExtensionRecommendationSource } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { basename } from 'vs/base/common/path';
import { distinct, shuffle, isNonEmptyArray } from 'vs/base/common/arrays';
import { IProductService } from 'vs/platform/product/common/productService';
import { IExtensionGalleryService, IExtensionManagementService, IExtensionTipsService, IExecutableBasedExtensionTip } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IExtensionsWorkbenchService, ShowRecommendationsOnlyOnDemandKey } from 'vs/workbench/contrib/extensions/common/extensions';
import { IExperimentService } from 'vs/workbench/contrib/experiments/common/experimentService';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { timeout } from 'vs/base/common/async';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { localize } from 'vs/nls';
import { forEach, IStringDictionary } from 'vs/base/common/collections';
import { isNumber } from 'vs/base/common/types';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

type DynamicWorkspaceRecommendationsClassification = {
	count: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
	cache: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

type ExeExtensionRecommendationsClassification = {
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	exeName: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type IStoredDynamicWorkspaceRecommendations = { recommendations: string[], timestamp: number };

const dynamicWorkspaceRecommendationsStorageKey = 'extensionsAssistant/dynamicWorkspaceRecommendations';

export class NativeExtensionRecommendationsService extends ExtensionRecommendationsService implements IExtensionRecommendationsService {

	private exeBasedRecommendations: { [id: string]: IExecutableBasedExtensionTip; } = Object.create(null);
	private dynamicWorkspaceRecommendations: string[] = [];
	private sessionSeed: number;

	constructor(
		@IExtensionGalleryService galleryService: IExtensionGalleryService,
		@IModelService modelService: IModelService,
		@IStorageService storageService: IStorageService,
		@IExtensionManagementService extensionsService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IExtensionService extensionService: IExtensionService,
		@IViewletService viewletService: IViewletService,
		@INotificationService notificationService: INotificationService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IExtensionsWorkbenchService extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExperimentService experimentService: IExperimentService,
		@IProductService productService: IProductService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super(galleryService, modelService, storageService, extensionsService, extensionEnablementService, instantiationService, fileService, contextService,
			configurationService, telemetryService, environmentService, extensionService, viewletService, notificationService, extensionManagementService, extensionWorkbenchService,
			experimentService, productService);

		if (!this.isEnabled()) {
			this.sessionSeed = 0;
			return;
		}

		this.sessionSeed = +new Date();

		/* 3s has come out to be the good number to fetch and prompt important exe based recommendations */
		/* Fetch important exe based recommendations always for reporting telemetry */
		timeout(3000).then(() => this.fetchAndPromptImportantExeBasedRecommendations());

		if (!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
			this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.fetchProactiveRecommendations());
		}
	}

	private proactiveRecommendationsPromise: Promise<void> | undefined = undefined;
	private async fetchProactiveRecommendations(): Promise<void> {
		if (!this.proactiveRecommendationsPromise) {
			this.proactiveRecommendationsPromise = Promise.all([this.fetchDynamicWorkspaceRecommendations(), this.fetchOtherExeBasedRecommendations()])
				.then(() => {
					this._register(this.contextService.onDidChangeWorkbenchState(() => this.dynamicWorkspaceRecommendations = []));
				});
		}
		return this.proactiveRecommendationsPromise;
	}

	private async fetchAndPromptImportantExeBasedRecommendations(): Promise<void> {
		const importantExeBasedRecommendations: IStringDictionary<IExecutableBasedExtensionTip> = {};
		const importantExectuableBasedTips = await this.extensionTipsService.getImportantExecutableBasedTips();
		importantExectuableBasedTips.forEach(tip => {
			this.exeBasedRecommendations[tip.extensionId.toLowerCase()] = tip;
			importantExeBasedRecommendations[tip.extensionId.toLowerCase()] = tip;
		});

		const local = await this.extensionManagementService.getInstalled(ExtensionType.User);
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

	private promptImportantExeBasedRecommendations(recommendations: string[], importantExeBasedRecommendations: IStringDictionary<IExecutableBasedExtensionTip>): void {
		if (this.hasToIgnoreRecommendationNotifications()) {
			return;
		}
		recommendations = this.filterIgnoredOrNotAllowed(recommendations);
		if (recommendations.length === 0) {
			return;
		}

		const extensionId = recommendations[0];
		const tip = importantExeBasedRecommendations[extensionId];
		const message = localize('exeRecommended', "The '{0}' extension is recommended as you have {1} installed on your system.", tip.friendlyName!, tip.exeFriendlyName || basename(tip.windowsPath!));
		this.promptExtensionInstallNotification(extensionId, message);
	}

	private async fetchOtherExeBasedRecommendations(): Promise<void> {
		const otherExectuableBasedTips = await this.extensionTipsService.getOtherExecutableBasedTips();
		otherExectuableBasedTips.forEach(tip => this.exeBasedRecommendations[tip.extensionId.toLowerCase()] = tip);
	}

	/**
	 * Fetch extensions used by others on the same workspace as recommendations
	 */
	private async fetchDynamicWorkspaceRecommendations(): Promise<void> {
		if (this.dynamicWorkspaceRecommendations.length
			|| this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER
			|| !this.fileService.canHandleResource(this.contextService.getWorkspace().folders[0].uri)
		) {
			return;
		}

		const cachedDynamicWorkspaceRecommendations = this.getCachedDynamicWorkspaceRecommendations();
		if (cachedDynamicWorkspaceRecommendations) {
			this.dynamicWorkspaceRecommendations = cachedDynamicWorkspaceRecommendations;
			this.telemetryService.publicLog2<{ count: number, cache: number }, DynamicWorkspaceRecommendationsClassification>('dynamicWorkspaceRecommendations', { count: this.dynamicWorkspaceRecommendations.length, cache: 1 });
			return;
		}

		const workspaceUri = this.contextService.getWorkspace().folders[0].uri;
		const [hashedRemotes1, hashedRemotes2] = await Promise.all([this.workspaceTagsService.getHashedRemotesFromUri(workspaceUri, false), this.workspaceTagsService.getHashedRemotesFromUri(workspaceUri, true)]);
		const hashedRemotes = (hashedRemotes1 || []).concat(hashedRemotes2 || []);
		if (!hashedRemotes.length) {
			return;
		}

		const workspacesTips = await this.extensionTipsService.getAllWorkspacesTips();
		if (!workspacesTips.length) {
			return;
		}

		for (const hashedRemote of hashedRemotes) {
			const workspaceTip = workspacesTips.filter(workspaceTip => isNonEmptyArray(workspaceTip.remoteSet) && workspaceTip.remoteSet.indexOf(hashedRemote) > -1)[0];
			if (workspaceTip) {
				this.dynamicWorkspaceRecommendations = workspaceTip.recommendations.filter(id => this.isExtensionAllowedToBeRecommended(id)) || [];
				this.storageService.store(dynamicWorkspaceRecommendationsStorageKey, JSON.stringify(<IStoredDynamicWorkspaceRecommendations>{ recommendations: this.dynamicWorkspaceRecommendations, timestamp: Date.now() }), StorageScope.WORKSPACE);
				this.telemetryService.publicLog2<{ count: number, cache: number }, DynamicWorkspaceRecommendationsClassification>('dynamicWorkspaceRecommendations', { count: this.dynamicWorkspaceRecommendations.length, cache: 0 });
				return;
			}
		}
	}

	private getCachedDynamicWorkspaceRecommendations(): string[] | undefined {
		try {
			const storedDynamicWorkspaceRecommendations: IStoredDynamicWorkspaceRecommendations = JSON.parse(this.storageService.get(dynamicWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE, '{}'));
			if (isNonEmptyArray(storedDynamicWorkspaceRecommendations.recommendations)
				&& isNumber(storedDynamicWorkspaceRecommendations.timestamp)
				&& storedDynamicWorkspaceRecommendations.timestamp > 0
				&& (Date.now() - storedDynamicWorkspaceRecommendations.timestamp) / milliSecondsInADay < 14) {
				return storedDynamicWorkspaceRecommendations.recommendations;
			}
		} catch (e) {
			this.storageService.remove(dynamicWorkspaceRecommendationsStorageKey, StorageScope.WORKSPACE);
		}
		return undefined;
	}

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } {
		/* Trigger fetching recommendations */
		this.fetchProactiveRecommendations();

		const output = super.getAllRecommendationsWithReason();
		if (this.contextService.getWorkspace().folders && this.contextService.getWorkspace().folders.length === 1) {
			const currentRepo = this.contextService.getWorkspace().folders[0].name;

			this.dynamicWorkspaceRecommendations.forEach(id => output[id.toLowerCase()] = {
				reasonId: ExtensionRecommendationReason.DynamicWorkspace,
				reasonText: localize('dynamicWorkspaceRecommendation', "This extension may interest you because it's popular among users of the {0} repository.", currentRepo)
			});
		}
		forEach(this.exeBasedRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Executable,
			reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", entry.value.friendlyName)
		});

		for (const id of Object.keys(output)) {
			if (!this.isExtensionAllowedToBeRecommended(id)) {
				delete output[id];
			}
		}

		return output;
	}

	async getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		const otherRecommendations = await super.getOtherRecommendations();
		await this.fetchProactiveRecommendations();
		const others = distinct([
			...Object.keys(this.exeBasedRecommendations),
			...this.dynamicWorkspaceRecommendations,
			...otherRecommendations.map(e => e.extensionId),
		]).filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));
		shuffle(others, this.sessionSeed);
		return others.map(extensionId => {
			const sources: ExtensionRecommendationSource[] = [];
			if (this.exeBasedRecommendations[extensionId]) {
				sources.push('executable');
			}
			if (this.dynamicWorkspaceRecommendations.indexOf(extensionId) !== -1) {
				sources.push('dynamic');
			}
			return (<IExtensionRecommendation>{ extensionId, sources });
		});
	}

}
