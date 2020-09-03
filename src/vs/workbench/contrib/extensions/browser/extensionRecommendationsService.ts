/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, IExtensionGalleryService, InstallOperation, DidInstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionRecommendationsService, ExtensionRecommendationReason, RecommendationChangeNotification, IExtensionRecommendation, ExtensionRecommendationSource } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendationsOnlyOnDemandKey } from 'vs/workbench/contrib/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { distinct, shuffle } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { LifecyclePhase, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { DynamicWorkspaceRecommendations } from 'vs/workbench/contrib/extensions/browser/dynamicWorkspaceRecommendations';
import { ExeBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/exeBasedRecommendations';
import { ExperimentalRecommendations } from 'vs/workbench/contrib/extensions/browser/experimentalRecommendations';
import { WorkspaceRecommendations } from 'vs/workbench/contrib/extensions/browser/workspaceRecommendations';
import { FileBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/fileBasedRecommendations';
import { KeymapRecommendations } from 'vs/workbench/contrib/extensions/browser/keymapRecommendations';
import { ExtensionRecommendation, PromptedExtensionRecommendations } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { ConfigBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/configBasedRecommendations';

type IgnoreRecommendationClassification = {
	recommendationReason: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

const ignoredRecommendationsStorageKey = 'extensionsAssistant/ignored_recommendations';

export class ExtensionRecommendationsService extends Disposable implements IExtensionRecommendationsService {

	declare readonly _serviceBrand: undefined;

	private readonly promptedExtensionRecommendations: PromptedExtensionRecommendations;

	// Recommendations
	private readonly fileBasedRecommendations: FileBasedRecommendations;
	private readonly workspaceRecommendations: WorkspaceRecommendations;
	private readonly experimentalRecommendations: ExperimentalRecommendations;
	private readonly configBasedRecommendations: ConfigBasedRecommendations;
	private readonly exeBasedRecommendations: ExeBasedRecommendations;
	private readonly dynamicWorkspaceRecommendations: DynamicWorkspaceRecommendations;
	private readonly keymapRecommendations: KeymapRecommendations;

	// Ignored Recommendations
	private globallyIgnoredRecommendations: string[] = [];

	public readonly activationPromise: Promise<void>;
	private sessionSeed: number;

	private readonly _onRecommendationChange = this._register(new Emitter<RecommendationChangeNotification>());
	onRecommendationChange: Event<RecommendationChangeNotification> = this._onRecommendationChange.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
	) {
		super();

		storageKeysSyncRegistryService.registerStorageKey({ key: ignoredRecommendationsStorageKey, version: 1 });

		const isExtensionAllowedToBeRecommended = (extensionId: string) => this.isExtensionAllowedToBeRecommended(extensionId);
		this.promptedExtensionRecommendations = instantiationService.createInstance(PromptedExtensionRecommendations, isExtensionAllowedToBeRecommended);
		this.workspaceRecommendations = instantiationService.createInstance(WorkspaceRecommendations, this.promptedExtensionRecommendations);
		this.fileBasedRecommendations = instantiationService.createInstance(FileBasedRecommendations, this.promptedExtensionRecommendations);
		this.experimentalRecommendations = instantiationService.createInstance(ExperimentalRecommendations, this.promptedExtensionRecommendations);
		this.configBasedRecommendations = instantiationService.createInstance(ConfigBasedRecommendations, this.promptedExtensionRecommendations);
		this.exeBasedRecommendations = instantiationService.createInstance(ExeBasedRecommendations, this.promptedExtensionRecommendations);
		this.dynamicWorkspaceRecommendations = instantiationService.createInstance(DynamicWorkspaceRecommendations, this.promptedExtensionRecommendations);
		this.keymapRecommendations = instantiationService.createInstance(KeymapRecommendations, this.promptedExtensionRecommendations);

		if (!this.isEnabled()) {
			this.sessionSeed = 0;
			this.activationPromise = Promise.resolve();
			return;
		}

		this.sessionSeed = +new Date();
		this.globallyIgnoredRecommendations = this.getCachedIgnoredRecommendations();

		// Activation
		this.activationPromise = this.activate();

		this._register(this.extensionManagementService.onDidInstallExtension(e => this.onDidInstallExtension(e)));
		this._register(this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
	}

	private async activate(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		// activate all recommendations
		await Promise.all([
			this.workspaceRecommendations.activate(),
			this.fileBasedRecommendations.activate(),
			this.experimentalRecommendations.activate(),
			this.keymapRecommendations.activate(),
			this.lifecycleService.when(LifecyclePhase.Eventually)
				.then(() => {
					if (!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
						this.activateProactiveRecommendations();
					}
				})
		]);

		await this.promptWorkspaceRecommendations();
		this._register(Event.any(this.workspaceRecommendations.onDidChangeRecommendations, this.configBasedRecommendations.onDidChangeRecommendations)(() => this.promptWorkspaceRecommendations()));
	}

	private isEnabled(): boolean {
		return this.galleryService.isEnabled() && !this.environmentService.extensionDevelopmentLocationURI;
	}

	private async activateProactiveRecommendations(): Promise<void> {
		await Promise.all([this.dynamicWorkspaceRecommendations.activate(), this.exeBasedRecommendations.activate(), this.configBasedRecommendations.activate()]);
	}

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } {
		/* Activate proactive recommendations */
		this.activateProactiveRecommendations();

		const output: { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } = Object.create(null);

		const allRecommendations = [
			...this.dynamicWorkspaceRecommendations.recommendations,
			...this.configBasedRecommendations.recommendations,
			...this.exeBasedRecommendations.recommendations,
			...this.experimentalRecommendations.recommendations,
			...this.fileBasedRecommendations.recommendations,
			...this.workspaceRecommendations.recommendations,
			...this.keymapRecommendations.recommendations,
		];

		for (const { extensionId, reason } of allRecommendations) {
			if (this.isExtensionAllowedToBeRecommended(extensionId)) {
				output[extensionId.toLowerCase()] = reason;
			}
		}

		return output;
	}

	async getConfigBasedRecommendations(): Promise<{ important: IExtensionRecommendation[], others: IExtensionRecommendation[] }> {
		await this.configBasedRecommendations.activate();
		return {
			important: this.toExtensionRecommendations(this.configBasedRecommendations.importantRecommendations),
			others: this.toExtensionRecommendations(this.configBasedRecommendations.otherRecommendations)
		};
	}

	async getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		await this.activateProactiveRecommendations();

		const recommendations = [
			...this.configBasedRecommendations.otherRecommendations,
			...this.exeBasedRecommendations.otherRecommendations,
			...this.dynamicWorkspaceRecommendations.recommendations,
			...this.experimentalRecommendations.recommendations
		];

		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		shuffle(extensionIds, this.sessionSeed);

		return extensionIds.map(extensionId => {
			const sources: ExtensionRecommendationSource[] = distinct(recommendations.filter(r => r.extensionId === extensionId).map(r => r.source));
			return (<IExtensionRecommendation>{ extensionId, sources });
		});
	}

	async getImportantRecommendations(): Promise<IExtensionRecommendation[]> {
		await this.activateProactiveRecommendations();

		const recommendations = [
			...this.fileBasedRecommendations.importantRecommendations,
			...this.configBasedRecommendations.importantRecommendations,
			...this.exeBasedRecommendations.importantRecommendations,
		];

		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		shuffle(extensionIds, this.sessionSeed);

		return extensionIds.map(extensionId => {
			const sources: ExtensionRecommendationSource[] = distinct(recommendations.filter(r => r.extensionId === extensionId).map(r => r.source));
			return (<IExtensionRecommendation>{ extensionId, sources });
		});
	}

	getKeymapRecommendations(): IExtensionRecommendation[] {
		return this.toExtensionRecommendations(this.keymapRecommendations.recommendations);
	}

	async getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]> {
		if (!this.isEnabled()) {
			return [];
		}
		await this.workspaceRecommendations.activate();
		return this.toExtensionRecommendations(this.workspaceRecommendations.recommendations);
	}

	async getExeBasedRecommendations(exe?: string): Promise<{ important: IExtensionRecommendation[], others: IExtensionRecommendation[] }> {
		await this.exeBasedRecommendations.activate();
		const { important, others } = exe ? this.exeBasedRecommendations.getRecommendations(exe)
			: { important: this.exeBasedRecommendations.importantRecommendations, others: this.exeBasedRecommendations.otherRecommendations };
		return { important: this.toExtensionRecommendations(important), others: this.toExtensionRecommendations(others) };
	}

	getFileBasedRecommendations(): IExtensionRecommendation[] {
		return this.toExtensionRecommendations(this.fileBasedRecommendations.recommendations);
	}

	getIgnoredRecommendations(): ReadonlyArray<string> {
		return this.globallyIgnoredRecommendations;
	}

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean) {
		extensionId = extensionId.toLowerCase();
		const ignored = this.globallyIgnoredRecommendations.indexOf(extensionId) !== -1;
		if (ignored === shouldIgnore) {
			return;
		}

		if (shouldIgnore) {
			const reason = this.getAllRecommendationsWithReason()[extensionId];
			if (reason && reason.reasonId) {
				this.telemetryService.publicLog2<{ extensionId: string, recommendationReason: ExtensionRecommendationReason }, IgnoreRecommendationClassification>('extensionsRecommendations:ignoreRecommendation', { extensionId, recommendationReason: reason.reasonId });
			}
		}

		this.globallyIgnoredRecommendations = shouldIgnore ? [...this.globallyIgnoredRecommendations, extensionId] : this.globallyIgnoredRecommendations.filter(id => id !== extensionId);
		this.storeCachedIgnoredRecommendations(this.globallyIgnoredRecommendations);
		this._onRecommendationChange.fire({ extensionId, isRecommended: !shouldIgnore });
	}

	private onDidInstallExtension(e: DidInstallExtensionEvent): void {
		if (e.gallery && e.operation === InstallOperation.Install) {
			const extRecommendations = this.getAllRecommendationsWithReason() || {};
			const recommendationReason = extRecommendations[e.gallery.identifier.id.toLowerCase()];
			if (recommendationReason) {
				/* __GDPR__
					"extensionGallery:install:recommendations" : {
						"recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"${include}": [
							"${GalleryExtensionTelemetryData}"
						]
					}
				*/
				this.telemetryService.publicLog('extensionGallery:install:recommendations', assign(e.gallery.telemetryData, { recommendationReason: recommendationReason.reasonId }));
			}
		}
	}

	private toExtensionRecommendations(recommendations: ReadonlyArray<ExtensionRecommendation>): IExtensionRecommendation[] {
		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		return extensionIds.map(extensionId => {
			const sources: ExtensionRecommendationSource[] = distinct(recommendations.filter(r => r.extensionId === extensionId).map(r => r.source));
			return (<IExtensionRecommendation>{ extensionId, sources });
		});
	}

	private isExtensionAllowedToBeRecommended(id: string): boolean {
		const allIgnoredRecommendations = [
			...this.globallyIgnoredRecommendations,
			...this.workspaceRecommendations.ignoredRecommendations
		];
		return allIgnoredRecommendations.indexOf(id.toLowerCase()) === -1;
	}

	private async promptWorkspaceRecommendations(): Promise<void> {
		const allowedRecommendations = [...this.workspaceRecommendations.recommendations, ...this.configBasedRecommendations.importantRecommendations]
			.map(({ extensionId }) => extensionId)
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		if (allowedRecommendations.length) {
			await this.promptedExtensionRecommendations.promptWorkspaceRecommendations(allowedRecommendations);
		}
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === ignoredRecommendationsStorageKey && e.scope === StorageScope.GLOBAL
			&& this.ignoredRecommendationsValue !== this.getStoredIgnoredRecommendationsValue() /* This checks if current window changed the value or not */) {
			this._ignoredRecommendationsValue = undefined;
			this.globallyIgnoredRecommendations = this.getCachedIgnoredRecommendations();
		}
	}

	private getCachedIgnoredRecommendations(): string[] {
		const ignoredRecommendations: string[] = JSON.parse(this.ignoredRecommendationsValue);
		return ignoredRecommendations.map(e => e.toLowerCase());
	}

	private storeCachedIgnoredRecommendations(ignoredRecommendations: string[]): void {
		this.ignoredRecommendationsValue = JSON.stringify(ignoredRecommendations);
	}

	private _ignoredRecommendationsValue: string | undefined;
	private get ignoredRecommendationsValue(): string {
		if (!this._ignoredRecommendationsValue) {
			this._ignoredRecommendationsValue = this.getStoredIgnoredRecommendationsValue();
		}

		return this._ignoredRecommendationsValue;
	}

	private set ignoredRecommendationsValue(ignoredRecommendationsValue: string) {
		if (this.ignoredRecommendationsValue !== ignoredRecommendationsValue) {
			this._ignoredRecommendationsValue = ignoredRecommendationsValue;
			this.setStoredIgnoredRecommendationsValue(ignoredRecommendationsValue);
		}
	}

	private getStoredIgnoredRecommendationsValue(): string {
		return this.storageService.get(ignoredRecommendationsStorageKey, StorageScope.GLOBAL, '[]');
	}

	private setStoredIgnoredRecommendationsValue(value: string): void {
		this.storageService.store(ignoredRecommendationsStorageKey, value, StorageScope.GLOBAL);
	}

}
