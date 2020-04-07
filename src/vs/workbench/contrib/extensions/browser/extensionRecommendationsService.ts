/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { forEach, IStringDictionary } from 'vs/base/common/collections';
import { Disposable } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';
import * as json from 'vs/base/common/json';
import { IExtensionManagementService, IExtensionGalleryService, EXTENSION_IDENTIFIER_PATTERN, InstallOperation, ILocalExtension, IExecutableBasedExtensionTip, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionRecommendationsService, ExtensionRecommendationReason, IExtensionsConfigContent, RecommendationChangeNotification, IExtensionRecommendation, ExtensionRecommendationSource, IWorkbenchExtensionEnablementService, EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModel } from 'vs/editor/common/model';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction, InstallRecommendedExtensionAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionsConfiguration, ConfigurationKey, IExtensionsViewPaneContainer, IExtensionsWorkbenchService, EXTENSIONS_CONFIG, ShowRecommendationsOnlyOnDemandKey } from 'vs/workbench/contrib/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { flatten, distinct, coalesce, isNonEmptyArray, shuffle } from 'vs/base/common/arrays';
import { guessMimeTypes, MIME_UNKNOWN } from 'vs/base/common/mime';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Emitter, Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExperimentService, ExperimentActionType, ExperimentState } from 'vs/workbench/contrib/experiments/common/experimentService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { extname } from 'vs/base/common/resources';
import { IProductService } from 'vs/platform/product/common/productService';
import { setImmediate } from 'vs/base/common/platform';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { timeout } from 'vs/base/common/async';
import { LifecyclePhase, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { isNumber } from 'vs/base/common/types';
import { basename } from 'vs/base/common/path';

type ExtensionRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	extensionId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type FileExtensionSuggestionClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	fileExtension: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};

type ExtensionWorkspaceRecommendationsNotificationClassification = {
	userReaction: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

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
const milliSecondsInADay = 1000 * 60 * 60 * 24;
const choiceNever = localize('neverShowAgain', "Don't Show Again");
const searchMarketplace = localize('searchMarketplace', "Search Marketplace");
const processedFileExtensions: string[] = [];

function caseInsensitiveGet<T>(obj: { [key: string]: T }, key: string): T | undefined {
	if (!obj) {
		return undefined;
	}
	for (const _key in obj) {
		if (Object.hasOwnProperty.call(obj, _key) && _key.toLowerCase() === key.toLowerCase()) {
			return obj[_key];
		}
	}
	return undefined;
}

export class ExtensionRecommendationsService extends Disposable implements IExtensionRecommendationsService {

	_serviceBrand: undefined;

	// Recommendations
	private fileBasedRecommendations: { [id: string]: { recommendedTime: number, sources: ExtensionRecommendationSource[] }; } = Object.create(null);
	private availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private allWorkspaceRecommendedExtensions: IExtensionRecommendation[] = [];
	private experimentalRecommendations: { [id: string]: string } = Object.create(null);
	private exeBasedRecommendations: { [id: string]: IExecutableBasedExtensionTip; } = Object.create(null);
	private dynamicWorkspaceRecommendations: string[] = [];

	// Ignored Recommendations
	private allIgnoredRecommendations: string[] = [];
	private globallyIgnoredRecommendations: string[] = [];
	private workspaceIgnoredRecommendations: string[] = [];

	public loadWorkspaceConfigPromise: Promise<void>;
	private sessionSeed: number;

	private readonly _onRecommendationChange = this._register(new Emitter<RecommendationChangeNotification>());
	onRecommendationChange: Event<RecommendationChangeNotification> = this._onRecommendationChange.event;

	constructor(
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IModelService private readonly modelService: IModelService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionsService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IViewletService private readonly viewletService: IViewletService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExperimentService private readonly experimentService: IExperimentService,
		@IProductService private readonly productService: IProductService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		if (!this.isEnabled()) {
			this.sessionSeed = 0;
			this.loadWorkspaceConfigPromise = Promise.resolve();
			return;
		}

		this.sessionSeed = +new Date();

		const globallyIgnored = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/ignored_recommendations', StorageScope.GLOBAL, '[]'));
		this.globallyIgnoredRecommendations = globallyIgnored.map(id => id.toLowerCase());

		this.fetchFileBasedRecommendations();
		this.fetchExperimentalRecommendations();

		/* 3s has come out to be the good number to fetch and prompt important exe based recommendations */
		/* Fetch important exe based recommendations always for reporting telemetry */
		timeout(3000).then(() => this.fetchAndPromptImportantExeBasedRecommendations());

		if (!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
			this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.fetchProactiveRecommendations());
		}

		this.loadWorkspaceConfigPromise = this.getWorkspaceRecommendations().then(() => {
			this.promptWorkspaceRecommendations();
			this._register(this.modelService.onModelAdded(this.promptFiletypeBasedRecommendations, this));
			this.modelService.getModels().forEach(model => this.promptFiletypeBasedRecommendations(model));
		});

		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));

		this._register(this.extensionManagementService.onDidInstallExtension(e => {
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
		}));
	}

	private isEnabled(): boolean {
		return this.galleryService.isEnabled() && !this.environmentService.extensionDevelopmentLocationURI;
	}

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } {
		/* Trigger fetching proactive recommendations */
		this.fetchProactiveRecommendations();

		const output: { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } = Object.create(null);

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

		forEach(this.experimentalRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Experimental,
			reasonText: entry.value
		});

		forEach(this.fileBasedRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.File,
			reasonText: localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened.")
		});

		this.allWorkspaceRecommendedExtensions.forEach(({ extensionId }) => output[extensionId.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Workspace,
			reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
		});

		for (const id of Object.keys(output)) {
			if (!this.isExtensionAllowedToBeRecommended(id)) {
				delete output[id];
			}
		}

		return output;
	}

	getAllIgnoredRecommendations(): { global: string[], workspace: string[] } {
		return {
			global: this.globallyIgnoredRecommendations,
			workspace: this.workspaceIgnoredRecommendations
		};
	}

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean) {
		const lowerId = extensionId.toLowerCase();
		if (shouldIgnore) {
			const reason = this.getAllRecommendationsWithReason()[lowerId];
			if (reason && reason.reasonId) {
				/* __GDPR__
					"extensionsRecommendations:ignoreRecommendation" : {
						"recommendationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('extensionsRecommendations:ignoreRecommendation', { id: extensionId, recommendationReason: reason.reasonId });
			}
		}

		this.globallyIgnoredRecommendations = shouldIgnore ?
			distinct([...this.globallyIgnoredRecommendations, lowerId].map(id => id.toLowerCase())) :
			this.globallyIgnoredRecommendations.filter(id => id !== lowerId);

		this.storageService.store('extensionsAssistant/ignored_recommendations', JSON.stringify(this.globallyIgnoredRecommendations), StorageScope.GLOBAL);
		this.allIgnoredRecommendations = distinct([...this.globallyIgnoredRecommendations, ...this.workspaceIgnoredRecommendations]);

		this._onRecommendationChange.fire({ extensionId: extensionId, isRecommended: !shouldIgnore });
	}

	getKeymapRecommendations(): IExtensionRecommendation[] {
		return (this.productService.keymapExtensionTips || [])
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId))
			.map(extensionId => (<IExtensionRecommendation>{ extensionId, sources: ['application'] }));
	}

	//#region workspaceRecommendations

	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]> {
		if (!this.isEnabled()) { return Promise.resolve([]); }
		return this.fetchWorkspaceRecommendations()
			.then(() => this.allWorkspaceRecommendedExtensions.filter(rec => this.isExtensionAllowedToBeRecommended(rec.extensionId)));
	}

	/**
	 * Parse all extensions.json files, fetch workspace recommendations, filter out invalid and unwanted ones
	 */
	private fetchWorkspaceRecommendations(): Promise<void> {

		if (!this.isEnabled) { return Promise.resolve(undefined); }

		return this.fetchExtensionRecommendationContents()
			.then(result => this.validateExtensions(result.map(({ contents }) => contents))
				.then(({ invalidExtensions, message }) => {

					if (invalidExtensions.length > 0 && this.notificationService) {
						this.notificationService.warn(`The below ${invalidExtensions.length} extension(s) in workspace recommendations have issues:\n${message}`);
					}

					const seenUnWantedRecommendations: { [id: string]: boolean } = {};

					this.allWorkspaceRecommendedExtensions = [];
					this.workspaceIgnoredRecommendations = [];

					for (const contentsBySource of result) {
						if (contentsBySource.contents.unwantedRecommendations) {
							for (const r of contentsBySource.contents.unwantedRecommendations) {
								const unwantedRecommendation = r.toLowerCase();
								if (!seenUnWantedRecommendations[unwantedRecommendation] && invalidExtensions.indexOf(unwantedRecommendation) === -1) {
									this.workspaceIgnoredRecommendations.push(unwantedRecommendation);
									seenUnWantedRecommendations[unwantedRecommendation] = true;
								}
							}
						}

						if (contentsBySource.contents.recommendations) {
							for (const r of contentsBySource.contents.recommendations) {
								const extensionId = r.toLowerCase();
								if (invalidExtensions.indexOf(extensionId) === -1) {
									let recommendation = this.allWorkspaceRecommendedExtensions.filter(r => r.extensionId === extensionId)[0];
									if (!recommendation) {
										recommendation = { extensionId, sources: [] };
										this.allWorkspaceRecommendedExtensions.push(recommendation);
									}
									if (recommendation.sources.indexOf(contentsBySource.source) === -1) {
										recommendation.sources.push(contentsBySource.source);
									}
								}
							}
						}
					}
					this.allIgnoredRecommendations = distinct([...this.globallyIgnoredRecommendations, ...this.workspaceIgnoredRecommendations]);
				}));
	}

	/**
	 * Parse all extensions.json files, fetch workspace recommendations
	 */
	private fetchExtensionRecommendationContents(): Promise<{ contents: IExtensionsConfigContent, source: ExtensionRecommendationSource }[]> {
		const workspace = this.contextService.getWorkspace();
		return Promise.all<{ contents: IExtensionsConfigContent, source: ExtensionRecommendationSource } | null>([
			this.resolveWorkspaceExtensionConfig(workspace).then(contents => contents ? { contents, source: workspace } : null),
			...workspace.folders.map(workspaceFolder => this.resolveWorkspaceFolderExtensionConfig(workspaceFolder).then(contents => contents ? { contents, source: workspaceFolder } : null))
		]).then(contents => coalesce(contents));
	}

	/**
	 * Parse the extensions.json file for given workspace and return the recommendations
	 */
	private resolveWorkspaceExtensionConfig(workspace: IWorkspace): Promise<IExtensionsConfigContent | null> {
		if (!workspace.configuration) {
			return Promise.resolve(null);
		}

		return Promise.resolve(this.fileService.readFile(workspace.configuration)
			.then(content => <IExtensionsConfigContent>(json.parse(content.value.toString())['extensions']), err => null));
	}

	/**
	 * Parse the extensions.json files for given workspace folder and return the recommendations
	 */
	private resolveWorkspaceFolderExtensionConfig(workspaceFolder: IWorkspaceFolder): Promise<IExtensionsConfigContent | null> {
		const extensionsJsonUri = workspaceFolder.toResource(EXTENSIONS_CONFIG);

		return Promise.resolve(this.fileService.resolve(extensionsJsonUri)
			.then(() => this.fileService.readFile(extensionsJsonUri))
			.then(content => <IExtensionsConfigContent>json.parse(content.value.toString()), err => null));
	}

	/**
	 * Validate the extensions.json file contents using regex and querying the gallery
	 */
	private async validateExtensions(contents: IExtensionsConfigContent[]): Promise<{ invalidExtensions: string[], message: string }> {
		const extensionsContent: IExtensionsConfigContent = {
			recommendations: distinct(flatten(contents.map(content => content.recommendations || []))),
			unwantedRecommendations: distinct(flatten(contents.map(content => content.unwantedRecommendations || [])))
		};

		const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);

		const invalidExtensions: string[] = [];
		let message = '';

		const regexFilter = (ids: string[]) => {
			return ids.filter((element, position) => {
				if (ids.indexOf(element) !== position) {
					// This is a duplicate entry, it doesn't hurt anybody
					// but it shouldn't be sent in the gallery query
					return false;
				} else if (!regEx.test(element)) {
					invalidExtensions.push(element.toLowerCase());
					message += `${element} (bad format) Expected: <provider>.<name>\n`;
					return false;
				}
				return true;
			});
		};

		const filteredWanted = regexFilter(extensionsContent.recommendations || []).map(x => x.toLowerCase());

		if (filteredWanted.length) {
			try {
				let validRecommendations = (await this.galleryService.query({ names: filteredWanted, pageSize: filteredWanted.length }, CancellationToken.None)).firstPage
					.map(extension => extension.identifier.id.toLowerCase());

				if (validRecommendations.length !== filteredWanted.length) {
					filteredWanted.forEach(element => {
						if (validRecommendations.indexOf(element.toLowerCase()) === -1) {
							invalidExtensions.push(element.toLowerCase());
							message += `${element} (not found in marketplace)\n`;
						}
					});
				}
			} catch (e) {
				console.warn('Error querying extensions gallery', e);
			}
		}
		return { invalidExtensions, message };
	}

	private onWorkspaceFoldersChanged(event: IWorkspaceFoldersChangeEvent): void {
		if (event.added.length) {
			const oldWorkspaceRecommended = this.allWorkspaceRecommendedExtensions;
			this.getWorkspaceRecommendations()
				.then(currentWorkspaceRecommended => {
					// Suggest only if at least one of the newly added recommendations was not suggested before
					if (currentWorkspaceRecommended.some(current => oldWorkspaceRecommended.every(old => current.extensionId !== old.extensionId))) {
						this.promptWorkspaceRecommendations();
					}
				});
		}
	}

	/**
	 * Prompt the user to install workspace recommendations if there are any not already installed
	 */
	private promptWorkspaceRecommendations(): void {
		const storageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
		const filteredRecs = this.allWorkspaceRecommendedExtensions.filter(rec => this.isExtensionAllowedToBeRecommended(rec.extensionId));

		if (filteredRecs.length === 0 || this.hasToIgnoreWorkspaceRecommendationNotifications()) {
			return;
		}

		this.extensionsService.getInstalled(ExtensionType.User).then(local => {
			local = local.filter(l => this.extensionEnablementService.getEnablementState(l) !== EnablementState.DisabledByExtensionKind); // Filter extensions disabled by kind
			const recommendations = filteredRecs.filter(({ extensionId }) => local.every(local => !areSameExtensions({ id: extensionId }, local.identifier)));

			if (!recommendations.length) {
				return Promise.resolve(undefined);
			}

			return new Promise<void>(c => {
				this.notificationService.prompt(
					Severity.Info,
					localize('workspaceRecommended', "This workspace has extension recommendations."),
					[{
						label: localize('installAll', "Install All"),
						run: () => {
							this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'install' });

							const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, localize('installAll', "Install All"), recommendations);
							installAllAction.run();
							installAllAction.dispose();

							c(undefined);
						}
					}, {
						label: localize('showRecommendations', "Show Recommendations"),
						run: () => {
							this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });

							const showAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
							showAction.run();
							showAction.dispose();

							c(undefined);
						}
					}, {
						label: choiceNever,
						isSecondary: true,
						run: () => {
							this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
							this.storageService.store(storageKey, true, StorageScope.WORKSPACE);

							c(undefined);
						}
					}],
					{
						sticky: true,
						onCancel: () => {
							this.telemetryService.publicLog2<{ userReaction: string }, ExtensionWorkspaceRecommendationsNotificationClassification>('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });
							c(undefined);
						}
					}
				);
			});
		});
	}

	//#endregion

	//#region fileBasedRecommendations

	getFileBasedRecommendations(): IExtensionRecommendation[] {
		return Object.keys(this.fileBasedRecommendations)
			.sort((a, b) => {
				if (this.fileBasedRecommendations[a].recommendedTime === this.fileBasedRecommendations[b].recommendedTime) {
					if (!this.productService.extensionImportantTips || caseInsensitiveGet(this.productService.extensionImportantTips, a)) {
						return -1;
					}
					if (caseInsensitiveGet(this.productService.extensionImportantTips, b)) {
						return 1;
					}
				}
				return this.fileBasedRecommendations[a].recommendedTime > this.fileBasedRecommendations[b].recommendedTime ? -1 : 1;
			})
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId))
			.map(extensionId => (<IExtensionRecommendation>{ extensionId, sources: this.fileBasedRecommendations[extensionId].sources }));
	}

	/**
	 * Parse all file based recommendations from this.productService.extensionTips
	 * Retire existing recommendations if they are older than a week or are not part of this.productService.extensionTips anymore
	 */
	private fetchFileBasedRecommendations() {
		const extensionTips = this.productService.extensionTips;
		if (!extensionTips) {
			return;
		}

		// group ids by pattern, like {**/*.md} -> [ext.foo1, ext.bar2]
		this.availableRecommendations = Object.create(null);
		forEach(extensionTips, entry => {
			let { key: id, value: pattern } = entry;
			let ids = this.availableRecommendations[pattern];
			if (!ids) {
				this.availableRecommendations[pattern] = [id.toLowerCase()];
			} else {
				ids.push(id.toLowerCase());
			}
		});

		if (this.productService.extensionImportantTips) {
			forEach(this.productService.extensionImportantTips, entry => {
				let { key: id, value } = entry;
				const { pattern } = value;
				let ids = this.availableRecommendations[pattern];
				if (!ids) {
					this.availableRecommendations[pattern] = [id.toLowerCase()];
				} else {
					ids.push(id.toLowerCase());
				}
			});
		}

		const allRecommendations: string[] = flatten((Object.keys(this.availableRecommendations).map(key => this.availableRecommendations[key])));

		// retrieve ids of previous recommendations
		const storedRecommendationsJson = JSON.parse(this.storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));

		if (Array.isArray<string>(storedRecommendationsJson)) {
			for (let id of <string[]>storedRecommendationsJson) {
				if (allRecommendations.indexOf(id) > -1) {
					this.fileBasedRecommendations[id.toLowerCase()] = { recommendedTime: Date.now(), sources: ['cached'] };
				}
			}
		} else {
			const now = Date.now();
			forEach(storedRecommendationsJson, entry => {
				if (typeof entry.value === 'number') {
					const diff = (now - entry.value) / milliSecondsInADay;
					if (diff <= 7 && allRecommendations.indexOf(entry.key) > -1) {
						this.fileBasedRecommendations[entry.key.toLowerCase()] = { recommendedTime: entry.value, sources: ['cached'] };
					}
				}
			});
		}
	}

	/**
	 * Prompt the user to either install the recommended extension for the file type in the current editor model
	 * or prompt to search the marketplace if it has extensions that can support the file type
	 */
	private promptFiletypeBasedRecommendations(model: ITextModel): void {
		const uri = model.uri;
		const supportedSchemes = [Schemas.untitled, Schemas.file, Schemas.vscodeRemote];
		if (!uri || supportedSchemes.indexOf(uri.scheme) === -1) {
			return;
		}

		let fileExtension = extname(uri);
		if (fileExtension) {
			if (processedFileExtensions.indexOf(fileExtension) > -1) {
				return;
			}
			processedFileExtensions.push(fileExtension);
		}

		// re-schedule this bit of the operation to be off the critical path - in case glob-match is slow
		setImmediate(async () => {

			let recommendationsToSuggest: string[] = [];
			const now = Date.now();
			forEach(this.availableRecommendations, entry => {
				let { key: pattern, value: ids } = entry;
				if (match(pattern, model.uri.toString())) {
					for (let id of ids) {
						if (this.productService.extensionImportantTips && caseInsensitiveGet(this.productService.extensionImportantTips, id)) {
							recommendationsToSuggest.push(id);
						}
						const filedBasedRecommendation = this.fileBasedRecommendations[id.toLowerCase()] || { recommendedTime: now, sources: [] };
						filedBasedRecommendation.recommendedTime = now;
						if (!filedBasedRecommendation.sources.some(s => s instanceof URI && s.toString() === model.uri.toString())) {
							filedBasedRecommendation.sources.push(model.uri);
						}
						this.fileBasedRecommendations[id.toLowerCase()] = filedBasedRecommendation;
					}
				}
			});

			this.storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(Object.keys(this.fileBasedRecommendations).reduce((result, key) => { result[key] = this.fileBasedRecommendations[key].recommendedTime; return result; }, {} as { [key: string]: any })),
				StorageScope.GLOBAL
			);

			const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
			if (config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand) {
				return;
			}

			const installed = await this.extensionManagementService.getInstalled(ExtensionType.User);
			if (await this.promptRecommendedExtensionForFileType(recommendationsToSuggest, installed)) {
				return;
			}

			if (fileExtension) {
				fileExtension = fileExtension.substr(1); // Strip the dot
			}
			if (!fileExtension) {
				return;
			}

			await this.extensionService.whenInstalledExtensionsRegistered();
			const mimeTypes = guessMimeTypes(uri);
			if (mimeTypes.length !== 1 || mimeTypes[0] !== MIME_UNKNOWN) {
				return;
			}

			this.promptRecommendedExtensionForFileExtension(fileExtension, installed);
		});
	}

	private async promptRecommendedExtensionForFileType(recommendationsToSuggest: string[], installed: ILocalExtension[]): Promise<boolean> {

		recommendationsToSuggest = this.filterIgnoredOrNotAllowed(recommendationsToSuggest);
		if (recommendationsToSuggest.length === 0) {
			return false;
		}

		recommendationsToSuggest = this.filterInstalled(recommendationsToSuggest, installed);
		if (recommendationsToSuggest.length === 0) {
			return false;
		}

		const extensionId = recommendationsToSuggest[0];
		const entry = this.productService.extensionImportantTips ? caseInsensitiveGet(this.productService.extensionImportantTips, extensionId) : undefined;
		if (!entry) {
			return false;
		}
		const extensionName = entry.name;
		let message = localize('reallyRecommended2', "The '{0}' extension is recommended for this file type.", extensionName);
		if (entry.isExtensionPack) {
			message = localize('reallyRecommendedExtensionPack', "The '{0}' extension pack is recommended for this file type.", extensionName);
		}

		this.promptExtensionInstallNotification(extensionId, message);
		return true;
	}

	private async promptRecommendedExtensionForFileExtension(fileExtension: string, installed: ILocalExtension[]): Promise<void> {
		const fileExtensionSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/fileExtensionsSuggestionIgnore', StorageScope.GLOBAL, '[]'));
		if (fileExtensionSuggestionIgnoreList.indexOf(fileExtension) > -1) {
			return;
		}

		const text = `ext:${fileExtension}`;
		const pager = await this.extensionWorkbenchService.queryGallery({ text, pageSize: 100 }, CancellationToken.None);
		if (pager.firstPage.length === 0) {
			return;
		}

		const installedExtensionsIds = installed.reduce((result, i) => { result.add(i.identifier.id.toLowerCase()); return result; }, new Set<string>());
		if (pager.firstPage.some(e => installedExtensionsIds.has(e.identifier.id.toLowerCase()))) {
			return;
		}

		this.notificationService.prompt(
			Severity.Info,
			localize('showLanguageExtensions', "The Marketplace has extensions that can help with '.{0}' files", fileExtension),
			[{
				label: searchMarketplace,
				run: () => {
					this.telemetryService.publicLog2<{ userReaction: string, fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'ok', fileExtension });
					this.viewletService.openViewlet('workbench.view.extensions', true)
						.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
						.then(viewlet => {
							viewlet.search(`ext:${fileExtension}`);
							viewlet.focus();
						});
				}
			}, {
				label: localize('dontShowAgainExtension', "Don't Show Again for '.{0}' files", fileExtension),
				run: () => {
					fileExtensionSuggestionIgnoreList.push(fileExtension);
					this.storageService.store(
						'extensionsAssistant/fileExtensionsSuggestionIgnore',
						JSON.stringify(fileExtensionSuggestionIgnoreList),
						StorageScope.GLOBAL
					);
					this.telemetryService.publicLog2<{ userReaction: string, fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'neverShowAgain', fileExtension });
				}
			}],
			{
				sticky: true,
				onCancel: () => {
					this.telemetryService.publicLog2<{ userReaction: string, fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'cancelled', fileExtension });
				}
			}
		);
	}

	private promptExtensionInstallNotification(extensionId: string, message: string): void {
		this.notificationService.prompt(Severity.Info, message,
			[{
				label: localize('install', 'Install'),
				run: () => {
					this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'install', extensionId });
					this.instantiationService.createInstance(InstallRecommendedExtensionAction, extensionId).run();
				}
			}, {
				label: localize('showRecommendations', "Show Recommendations"),
				run: () => {
					this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'show', extensionId });

					const recommendationsAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
					recommendationsAction.run();
					recommendationsAction.dispose();
				}
			}, {
				label: choiceNever,
				isSecondary: true,
				run: () => {
					this.addToImportantRecommendationsIgnore(extensionId);
					this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId });
					this.notificationService.prompt(
						Severity.Info,
						localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations?"),
						[{
							label: localize('ignoreAll', "Yes, Ignore All"),
							run: () => this.setIgnoreRecommendationsConfig(true)
						}, {
							label: localize('no', "No"),
							run: () => this.setIgnoreRecommendationsConfig(false)
						}]
					);
				}
			}],
			{
				sticky: true,
				onCancel: () => {
					this.telemetryService.publicLog2<{ userReaction: string, extensionId: string }, ExtensionRecommendationsNotificationClassification>('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId });
				}
			}
		);
	}

	private filterIgnoredOrNotAllowed(recommendationsToSuggest: string[]): string[] {
		const importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));
		return recommendationsToSuggest.filter(id => {
			if (importantRecommendationsIgnoreList.indexOf(id) !== -1) {
				return false;
			}
			if (!this.isExtensionAllowedToBeRecommended(id)) {
				return false;
			}
			return true;
		});
	}

	private filterInstalled(recommendationsToSuggest: string[], installed: ILocalExtension[]): string[] {
		const installedExtensionsIds = installed.reduce((result, i) => { result.add(i.identifier.id.toLowerCase()); return result; }, new Set<string>());
		return recommendationsToSuggest.filter(id => !installedExtensionsIds.has(id.toLowerCase()));
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

	private addToImportantRecommendationsIgnore(id: string) {
		const importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));
		importantRecommendationsIgnoreList.push(id);
		this.storageService.store(
			'extensionsAssistant/importantRecommendationsIgnore',
			JSON.stringify(importantRecommendationsIgnoreList),
			StorageScope.GLOBAL
		);
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
		if (configVal) {
			const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
			this.storageService.store(ignoreWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
		}
	}

	//#endregion

	//#region otherRecommendations

	async getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		const otherRecommendations = Object.keys(this.experimentalRecommendations)
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId))
			.map(extensionId => (<IExtensionRecommendation>{ extensionId, sources: [] }));
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

	/**
	 * Fetch extension recommendations from currently running experiments
	 */
	private fetchExperimentalRecommendations() {
		this.experimentService.getExperimentsByType(ExperimentActionType.AddToRecommendations).then(experiments => {
			(experiments || []).forEach(experiment => {
				const action = experiment.action;
				if (action && experiment.state === ExperimentState.Run && action.properties && Array.isArray(action.properties.recommendations) && action.properties.recommendationReason) {
					action.properties.recommendations.forEach((id: string) => {
						this.experimentalRecommendations[id] = action.properties.recommendationReason;
					});
				}
			});
		});
	}

	//#endregion

	//#region proactive recommendations - exe based and dynamic workspace recommendations

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

	//#endregion

	private isExtensionAllowedToBeRecommended(id: string): boolean {
		return this.allIgnoredRecommendations.indexOf(id.toLowerCase()) === -1;
	}

	private hasToIgnoreRecommendationNotifications(): boolean {
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
		return config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand;
	}

	private hasToIgnoreWorkspaceRecommendationNotifications(): boolean {
		return this.hasToIgnoreRecommendationNotifications() || this.storageService.getBoolean('extensionsAssistant/workspaceRecommendationsIgnore', StorageScope.WORKSPACE, false);
	}

}
