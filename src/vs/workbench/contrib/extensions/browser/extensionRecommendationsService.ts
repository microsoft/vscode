/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionManagementService, IExtensionGalleryService, InstallOperation, InstallExtensionResult } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionRecommendationsService, ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { distinct, shuffle } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { LifecyclePhase, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ExeBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/exeBasedRecommendations';
import { WorkspaceRecommendations } from 'vs/workbench/contrib/extensions/browser/workspaceRecommendations';
import { FileBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/fileBasedRecommendations';
import { KeymapRecommendations } from 'vs/workbench/contrib/extensions/browser/keymapRecommendations';
import { LanguageRecommendations } from 'vs/workbench/contrib/extensions/browser/languageRecommendations';
import { ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { ConfigBasedRecommendations } from 'vs/workbench/contrib/extensions/browser/configBasedRecommendations';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { timeout } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { WebRecommendations } from 'vs/workbench/contrib/extensions/browser/webRecommendations';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { RemoteRecommendations } from 'vs/workbench/contrib/extensions/browser/remoteRecommendations';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { IUserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';

type IgnoreRecommendationClassification = {
	owner: 'sandy081';
	comment: 'Report when a recommendation is ignored';
	recommendationReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Reason why extension is recommended' };
	extensionId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Id of the extension recommendation that is being ignored' };
};

export class ExtensionRecommendationsService extends Disposable implements IExtensionRecommendationsService {

	declare readonly _serviceBrand: undefined;

	// Recommendations
	private readonly fileBasedRecommendations: FileBasedRecommendations;
	private readonly workspaceRecommendations: WorkspaceRecommendations;
	private readonly configBasedRecommendations: ConfigBasedRecommendations;
	private readonly exeBasedRecommendations: ExeBasedRecommendations;
	private readonly keymapRecommendations: KeymapRecommendations;
	private readonly webRecommendations: WebRecommendations;
	private readonly languageRecommendations: LanguageRecommendations;
	private readonly remoteRecommendations: RemoteRecommendations;

	public readonly activationPromise: Promise<void>;
	private sessionSeed: number;

	private _onDidChangeRecommendations = this._register(new Emitter<void>());
	readonly onDidChangeRecommendations = this._onDidChangeRecommendations.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionIgnoredRecommendationsService private readonly extensionRecommendationsManagementService: IExtensionIgnoredRecommendationsService,
		@IExtensionRecommendationNotificationService private readonly extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IRemoteExtensionsScannerService private readonly remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@IUserDataInitializationService private readonly userDataInitializationService: IUserDataInitializationService,
	) {
		super();

		this.workspaceRecommendations = instantiationService.createInstance(WorkspaceRecommendations);
		this.fileBasedRecommendations = instantiationService.createInstance(FileBasedRecommendations);
		this.configBasedRecommendations = instantiationService.createInstance(ConfigBasedRecommendations);
		this.exeBasedRecommendations = instantiationService.createInstance(ExeBasedRecommendations);
		this.keymapRecommendations = instantiationService.createInstance(KeymapRecommendations);
		this.webRecommendations = instantiationService.createInstance(WebRecommendations);
		this.languageRecommendations = instantiationService.createInstance(LanguageRecommendations);
		this.remoteRecommendations = instantiationService.createInstance(RemoteRecommendations);

		if (!this.isEnabled()) {
			this.sessionSeed = 0;
			this.activationPromise = Promise.resolve();
			return;
		}

		this.sessionSeed = +new Date();

		// Activation
		this.activationPromise = this.activate();

		this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
	}

	private async activate(): Promise<void> {
		try {
			await Promise.allSettled([
				this.remoteExtensionsScannerService.whenExtensionsReady(),
				this.userDataInitializationService.whenInitializationFinished(),
				this.lifecycleService.when(LifecyclePhase.Restored)]);
		} catch (error) { /* ignore */ }

		// activate all recommendations
		await Promise.all([
			this.workspaceRecommendations.activate(),
			this.configBasedRecommendations.activate(),
			this.fileBasedRecommendations.activate(),
			this.keymapRecommendations.activate(),
			this.languageRecommendations.activate(),
			this.webRecommendations.activate(),
			this.remoteRecommendations.activate()
		]);

		this._register(Event.any(this.workspaceRecommendations.onDidChangeRecommendations, this.configBasedRecommendations.onDidChangeRecommendations, this.extensionRecommendationsManagementService.onDidChangeIgnoredRecommendations)(() => this._onDidChangeRecommendations.fire()));
		this._register(this.extensionRecommendationsManagementService.onDidChangeGlobalIgnoredRecommendation(({ extensionId, isRecommended }) => {
			if (!isRecommended) {
				const reason = this.getAllRecommendationsWithReason()[extensionId];
				if (reason && reason.reasonId) {
					this.telemetryService.publicLog2<{ extensionId: string; recommendationReason: ExtensionRecommendationReason }, IgnoreRecommendationClassification>('extensionsRecommendations:ignoreRecommendation', { extensionId, recommendationReason: reason.reasonId });
				}
			}
		}));

		this.promptWorkspaceRecommendations();
	}

	private isEnabled(): boolean {
		return this.galleryService.isEnabled() && !this.environmentService.isExtensionDevelopment;
	}

	private async activateProactiveRecommendations(): Promise<void> {
		await Promise.all([this.exeBasedRecommendations.activate(), this.configBasedRecommendations.activate()]);
	}

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason; reasonText: string } } {
		/* Activate proactive recommendations */
		this.activateProactiveRecommendations();

		const output: { [id: string]: { reasonId: ExtensionRecommendationReason; reasonText: string } } = Object.create(null);

		const allRecommendations = [
			...this.configBasedRecommendations.recommendations,
			...this.exeBasedRecommendations.recommendations,
			...this.fileBasedRecommendations.recommendations,
			...this.workspaceRecommendations.recommendations,
			...this.keymapRecommendations.recommendations,
			...this.languageRecommendations.recommendations,
			...this.webRecommendations.recommendations,
		];

		for (const { extensionId, reason } of allRecommendations) {
			if (this.isExtensionAllowedToBeRecommended(extensionId)) {
				output[extensionId.toLowerCase()] = reason;
			}
		}

		return output;
	}

	async getConfigBasedRecommendations(): Promise<{ important: string[]; others: string[] }> {
		await this.configBasedRecommendations.activate();
		return {
			important: this.toExtensionRecommendations(this.configBasedRecommendations.importantRecommendations),
			others: this.toExtensionRecommendations(this.configBasedRecommendations.otherRecommendations)
		};
	}

	async getOtherRecommendations(): Promise<string[]> {
		await this.activationPromise;
		await this.activateProactiveRecommendations();

		const recommendations = [
			...this.configBasedRecommendations.otherRecommendations,
			...this.exeBasedRecommendations.otherRecommendations,
			...this.webRecommendations.recommendations
		];

		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		shuffle(extensionIds, this.sessionSeed);

		return extensionIds;
	}

	async getImportantRecommendations(): Promise<string[]> {
		await this.activateProactiveRecommendations();

		const recommendations = [
			...this.fileBasedRecommendations.importantRecommendations,
			...this.configBasedRecommendations.importantRecommendations,
			...this.exeBasedRecommendations.importantRecommendations,
		];

		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		shuffle(extensionIds, this.sessionSeed);

		return extensionIds;
	}

	getKeymapRecommendations(): string[] {
		return this.toExtensionRecommendations(this.keymapRecommendations.recommendations);
	}

	getLanguageRecommendations(): string[] {
		return this.toExtensionRecommendations(this.languageRecommendations.recommendations);
	}

	getRemoteRecommendations(): string[] {
		return this.toExtensionRecommendations(this.remoteRecommendations.recommendations);
	}

	async getWorkspaceRecommendations(): Promise<string[]> {
		if (!this.isEnabled()) {
			return [];
		}
		await this.workspaceRecommendations.activate();
		return this.toExtensionRecommendations(this.workspaceRecommendations.recommendations);
	}

	async getExeBasedRecommendations(exe?: string): Promise<{ important: string[]; others: string[] }> {
		await this.exeBasedRecommendations.activate();
		const { important, others } = exe ? this.exeBasedRecommendations.getRecommendations(exe)
			: { important: this.exeBasedRecommendations.importantRecommendations, others: this.exeBasedRecommendations.otherRecommendations };
		return { important: this.toExtensionRecommendations(important), others: this.toExtensionRecommendations(others) };
	}

	getFileBasedRecommendations(): string[] {
		return this.toExtensionRecommendations(this.fileBasedRecommendations.recommendations);
	}

	private onDidInstallExtensions(results: readonly InstallExtensionResult[]): void {
		for (const e of results) {
			if (e.source && !URI.isUri(e.source) && e.operation === InstallOperation.Install) {
				const extRecommendations = this.getAllRecommendationsWithReason() || {};
				const recommendationReason = extRecommendations[e.source.identifier.id.toLowerCase()];
				if (recommendationReason) {
					/* __GDPR__
						"extensionGallery:install:recommendations" : {
							"owner": "sandy081",
							"recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
							"${include}": [
								"${GalleryExtensionTelemetryData}"
							]
						}
					*/
					this.telemetryService.publicLog('extensionGallery:install:recommendations', { ...e.source.telemetryData, recommendationReason: recommendationReason.reasonId });
				}
			}
		}
	}

	private toExtensionRecommendations(recommendations: ReadonlyArray<ExtensionRecommendation>): string[] {
		const extensionIds = distinct(recommendations.map(e => e.extensionId))
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		return extensionIds;
	}

	private isExtensionAllowedToBeRecommended(extensionId: string): boolean {
		return !this.extensionRecommendationsManagementService.ignoredRecommendations.includes(extensionId.toLowerCase());
	}

	private async promptWorkspaceRecommendations(): Promise<void> {
		const installed = await this.extensionsWorkbenchService.queryLocal();
		const allowedRecommendations = [
			...this.workspaceRecommendations.recommendations,
			...this.configBasedRecommendations.importantRecommendations.filter(
				recommendation => !recommendation.whenNotInstalled || recommendation.whenNotInstalled.every(id => installed.every(local => !areSameExtensions(local.identifier, { id }))))
		]
			.map(({ extensionId }) => extensionId)
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));

		if (allowedRecommendations.length) {
			await timeout(5000);
			await this.extensionRecommendationNotificationService.promptWorkspaceRecommendations(allowedRecommendations);
		}
	}
}
