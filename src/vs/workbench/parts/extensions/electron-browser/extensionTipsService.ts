/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { forEach } from 'vs/base/common/collections';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';
import * as json from 'vs/base/common/json';
import {
	IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, ExtensionRecommendationReason, LocalExtensionType, EXTENSION_IDENTIFIER_PATTERN,
	IExtensionsConfigContent, RecommendationChangeNotification, IExtensionRecommendation, ExtensionRecommendationSource, InstallOperation
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModel } from 'vs/editor/common/model';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import product from 'vs/platform/node/product';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction, InstallRecommendedExtensionAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionsConfiguration, ConfigurationKey, ShowRecommendationsOnlyOnDemandKey, IExtensionsViewlet, IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as pfs from 'vs/base/node/pfs';
import * as os from 'os';
import { flatten, distinct, shuffle, coalesce } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { guessMimeTypes, MIME_UNKNOWN } from 'vs/base/common/mime';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { getHashedRemotesFromUri } from 'vs/workbench/parts/stats/node/workspaceStats';
import { IRequestService } from 'vs/platform/request/node/request';
import { asJson } from 'vs/base/node/request';
import { isNumber } from 'vs/base/common/types';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Emitter, Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { areSameExtensions, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExperimentService, ExperimentActionType, ExperimentState } from 'vs/workbench/parts/experiments/node/experimentService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getKeywordsForExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsUtils';

const milliSecondsInADay = 1000 * 60 * 60 * 24;
const choiceNever = localize('neverShowAgain', "Don't Show Again");
const searchMarketplace = localize('searchMarketplace', "Search Marketplace");
const processedFileExtensions: string[] = [];

interface IDynamicWorkspaceRecommendations {
	remoteSet: string[];
	recommendations: string[];
}

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

export class ExtensionTipsService extends Disposable implements IExtensionTipsService {

	_serviceBrand: any;

	private _fileBasedRecommendations: { [id: string]: { recommendedTime: number, sources: ExtensionRecommendationSource[] }; } = Object.create(null);
	private _exeBasedRecommendations: { [id: string]: string; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private _allWorkspaceRecommendedExtensions: IExtensionRecommendation[] = [];
	private _dynamicWorkspaceRecommendations: string[] = [];
	private _experimentalRecommendations: { [id: string]: string } = Object.create(null);
	private _allIgnoredRecommendations: string[] = [];
	private _globallyIgnoredRecommendations: string[] = [];
	private _workspaceIgnoredRecommendations: string[] = [];
	private _extensionsRecommendationsUrl: string;
	private _disposables: IDisposable[] = [];
	public loadWorkspaceConfigPromise: Promise<any>;
	private proactiveRecommendationsFetched: boolean = false;

	private readonly _onRecommendationChange = new Emitter<RecommendationChangeNotification>();
	onRecommendationChange: Event<RecommendationChangeNotification> = this._onRecommendationChange.event;
	private sessionSeed: number;

	constructor(
		@IExtensionGalleryService private readonly _galleryService: IExtensionGalleryService,
		@IModelService private readonly _modelService: IModelService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionsService: IExtensionManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRequestService private readonly requestService: IRequestService,
		@IViewletService private readonly viewletService: IViewletService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExperimentService private readonly experimentService: IExperimentService,
	) {
		super();

		if (!this.isEnabled()) {
			return;
		}

		if (product.extensionsGallery && product.extensionsGallery.recommendationsUrl) {
			this._extensionsRecommendationsUrl = product.extensionsGallery.recommendationsUrl;
		}

		this.sessionSeed = +new Date();

		let globallyIgnored = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/ignored_recommendations', StorageScope.GLOBAL, '[]'));
		this._globallyIgnoredRecommendations = globallyIgnored.map(id => id.toLowerCase());

		this.fetchCachedDynamicWorkspaceRecommendations();
		this.fetchFileBasedRecommendations();
		this.fetchExperimentalRecommendations();
		if (!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
			this.fetchProactiveRecommendations(true);
		}

		this.loadWorkspaceConfigPromise = this.getWorkspaceRecommendations().then(() => {
			this.promptWorkspaceRecommendations();
			this._modelService.onModelAdded(this.promptFiletypeBasedRecommendations, this, this._disposables);
			this._modelService.getModels().forEach(model => this.promptFiletypeBasedRecommendations(model));
		});

		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!this.proactiveRecommendationsFetched && !this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
				this.fetchProactiveRecommendations();
			}
		}));
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
		return this._galleryService.isEnabled() && !this.environmentService.extensionDevelopmentLocationURI;
	}

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } {
		let output: { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } = Object.create(null);

		if (!this.proactiveRecommendationsFetched) {
			return output;
		}

		forEach(this._experimentalRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Experimental,
			reasonText: entry.value
		});

		if (this.contextService.getWorkspace().folders && this.contextService.getWorkspace().folders.length === 1) {
			const currentRepo = this.contextService.getWorkspace().folders[0].name;

			this._dynamicWorkspaceRecommendations.forEach(id => output[id.toLowerCase()] = {
				reasonId: ExtensionRecommendationReason.DynamicWorkspace,
				reasonText: localize('dynamicWorkspaceRecommendation', "This extension may interest you because it's popular among users of the {0} repository.", currentRepo)
			});
		}

		forEach(this._exeBasedRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Executable,
			reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", entry.value)
		});

		forEach(this._fileBasedRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.File,
			reasonText: localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened.")
		});

		this._allWorkspaceRecommendedExtensions.forEach(({ extensionId }) => output[extensionId.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Workspace,
			reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
		});

		for (const id of this._allIgnoredRecommendations) {
			delete output[id];
		}

		return output;
	}

	getAllIgnoredRecommendations(): { global: string[], workspace: string[] } {
		return {
			global: this._globallyIgnoredRecommendations,
			workspace: this._workspaceIgnoredRecommendations
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

		this._globallyIgnoredRecommendations = shouldIgnore ?
			distinct([...this._globallyIgnoredRecommendations, lowerId].map(id => id.toLowerCase())) :
			this._globallyIgnoredRecommendations.filter(id => id !== lowerId);

		this.storageService.store('extensionsAssistant/ignored_recommendations', JSON.stringify(this._globallyIgnoredRecommendations), StorageScope.GLOBAL);
		this._allIgnoredRecommendations = distinct([...this._globallyIgnoredRecommendations, ...this._workspaceIgnoredRecommendations]);

		this._onRecommendationChange.fire({ extensionId: extensionId, isRecommended: !shouldIgnore });
	}

	getKeymapRecommendations(): IExtensionRecommendation[] {
		return (product.keymapExtensionTips || [])
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId))
			.map(extensionId => (<IExtensionRecommendation>{ extensionId, sources: ['application'] }));
	}

	//#region workspaceRecommendations

	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]> {
		if (!this.isEnabled()) { return Promise.resolve([]); }
		return this.fetchWorkspaceRecommendations()
			.then(() => this._allWorkspaceRecommendedExtensions.filter(rec => this.isExtensionAllowedToBeRecommended(rec.extensionId)));
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

					this._allWorkspaceRecommendedExtensions = [];
					this._workspaceIgnoredRecommendations = [];

					for (const contentsBySource of result) {
						if (contentsBySource.contents.unwantedRecommendations) {
							for (const r of contentsBySource.contents.unwantedRecommendations) {
								const unwantedRecommendation = r.toLowerCase();
								if (!seenUnWantedRecommendations[unwantedRecommendation] && invalidExtensions.indexOf(unwantedRecommendation) === -1) {
									this._workspaceIgnoredRecommendations.push(unwantedRecommendation);
									seenUnWantedRecommendations[unwantedRecommendation] = true;
								}
							}
						}

						if (contentsBySource.contents.recommendations) {
							for (const r of contentsBySource.contents.recommendations) {
								const extensionId = r.toLowerCase();
								if (invalidExtensions.indexOf(extensionId) === -1) {
									let recommendation = this._allWorkspaceRecommendedExtensions.filter(r => r.extensionId === extensionId)[0];
									if (!recommendation) {
										recommendation = { extensionId, sources: [] };
										this._allWorkspaceRecommendedExtensions.push(recommendation);
									}
									if (recommendation.sources.indexOf(contentsBySource.source) === -1) {
										recommendation.sources.push(contentsBySource.source);
									}
								}
							}
						}
					}
					this._allIgnoredRecommendations = distinct([...this._globallyIgnoredRecommendations, ...this._workspaceIgnoredRecommendations]);
				}));
	}

	/**
	 * Parse all extensions.json files, fetch workspace recommendations
	 */
	private fetchExtensionRecommendationContents(): Promise<{ contents: IExtensionsConfigContent, source: ExtensionRecommendationSource }[]> {
		const workspace = this.contextService.getWorkspace();
		return Promise.all<{ contents: IExtensionsConfigContent, source: ExtensionRecommendationSource }>([
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

		return Promise.resolve(this.fileService.resolveContent(workspace.configuration)
			.then(content => <IExtensionsConfigContent>(json.parse(content.value)['extensions']), err => null));
	}

	/**
	 * Parse the extensions.json files for given workspace folder and return the recommendations
	 */
	private resolveWorkspaceFolderExtensionConfig(workspaceFolder: IWorkspaceFolder): Promise<IExtensionsConfigContent | null> {
		const extensionsJsonUri = workspaceFolder.toResource(paths.join('.vscode', 'extensions.json'));

		return Promise.resolve(this.fileService.resolveFile(extensionsJsonUri)
			.then(() => this.fileService.resolveContent(extensionsJsonUri))
			.then(content => <IExtensionsConfigContent>json.parse(content.value), err => null));
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
				let validRecommendations = (await this._galleryService.query({ names: filteredWanted, pageSize: filteredWanted.length })).firstPage
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
			const oldWorkspaceRecommended = this._allWorkspaceRecommendedExtensions;
			this.getWorkspaceRecommendations()
				.then(currentWorkspaceRecommended => {
					// Suggest only if at least one of the newly added recommendations was not suggested before
					if (currentWorkspaceRecommended.some(current => oldWorkspaceRecommended.every(old => current.extensionId !== old.extensionId))) {
						this.promptWorkspaceRecommendations();
					}
				});
		}
		this._dynamicWorkspaceRecommendations = [];
	}

	/**
	 * Prompt the user to install workspace recommendations if there are any not already installed
	 */
	private promptWorkspaceRecommendations(): void {
		const storageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
		const filteredRecs = this._allWorkspaceRecommendedExtensions.filter(rec => this.isExtensionAllowedToBeRecommended(rec.extensionId));

		if (filteredRecs.length === 0
			|| config.ignoreRecommendations
			|| config.showRecommendationsOnlyOnDemand
			|| this.storageService.getBoolean(storageKey, StorageScope.WORKSPACE, false)) {
			return;
		}

		this.extensionsService.getInstalled(LocalExtensionType.User).then(local => {
			const recommendations = filteredRecs.filter(({ extensionId }) => local.every(local => !areSameExtensions({ id: extensionId }, { id: getGalleryExtensionIdFromLocal(local) })));

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
							/* __GDPR__
							"extensionWorkspaceRecommendations:popup" : {
								"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'install' });

							const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, localize('installAll', "Install All"), recommendations);
							installAllAction.run();
							installAllAction.dispose();

							c(undefined);
						}
					}, {
						label: localize('showRecommendations', "Show Recommendations"),
						run: () => {
							/* __GDPR__
								"extensionWorkspaceRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });

							const showAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
							showAction.run();
							showAction.dispose();

							c(undefined);
						}
					}, {
						label: choiceNever,
						isSecondary: true,
						run: () => {
							/* __GDPR__
								"extensionWorkspaceRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
							this.storageService.store(storageKey, true, StorageScope.WORKSPACE);

							c(undefined);
						}
					}],
					{
						sticky: true,
						onCancel: () => {
							/* __GDPR__
								"extensionWorkspaceRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });

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
		return Object.keys(this._fileBasedRecommendations)
			.sort((a, b) => {
				if (this._fileBasedRecommendations[a].recommendedTime === this._fileBasedRecommendations[b].recommendedTime) {
					if (!product.extensionImportantTips || caseInsensitiveGet(product.extensionImportantTips, a)) {
						return -1;
					}
					if (caseInsensitiveGet(product.extensionImportantTips, b)) {
						return 1;
					}
				}
				return this._fileBasedRecommendations[a].recommendedTime > this._fileBasedRecommendations[b].recommendedTime ? -1 : 1;
			})
			.filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId))
			.map(extensionId => (<IExtensionRecommendation>{ extensionId, sources: this._fileBasedRecommendations[extensionId].sources }));
	}

	/**
	 * Parse all file based recommendations from product.extensionTips
	 * Retire existing recommendations if they are older than a week or are not part of product.extensionTips anymore
	 */
	private fetchFileBasedRecommendations() {
		const extensionTips = product.extensionTips;
		if (!extensionTips) {
			return;
		}

		// group ids by pattern, like {**/*.md} -> [ext.foo1, ext.bar2]
		this._availableRecommendations = Object.create(null);
		forEach(extensionTips, entry => {
			let { key: id, value: pattern } = entry;
			let ids = this._availableRecommendations[pattern];
			if (!ids) {
				this._availableRecommendations[pattern] = [id.toLowerCase()];
			} else {
				ids.push(id.toLowerCase());
			}
		});

		forEach(product.extensionImportantTips, entry => {
			let { key: id, value } = entry;
			const { pattern } = value;
			let ids = this._availableRecommendations[pattern];
			if (!ids) {
				this._availableRecommendations[pattern] = [id.toLowerCase()];
			} else {
				ids.push(id.toLowerCase());
			}
		});

		const allRecommendations: string[] = flatten((Object.keys(this._availableRecommendations).map(key => this._availableRecommendations[key])));

		// retrieve ids of previous recommendations
		const storedRecommendationsJson = JSON.parse(this.storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));

		if (Array.isArray<string>(storedRecommendationsJson)) {
			for (let id of <string[]>storedRecommendationsJson) {
				if (allRecommendations.indexOf(id) > -1) {
					this._fileBasedRecommendations[id.toLowerCase()] = { recommendedTime: Date.now(), sources: ['cached'] };
				}
			}
		} else {
			const now = Date.now();
			forEach(storedRecommendationsJson, entry => {
				if (typeof entry.value === 'number') {
					const diff = (now - entry.value) / milliSecondsInADay;
					if (diff <= 7 && allRecommendations.indexOf(entry.key) > -1) {
						this._fileBasedRecommendations[entry.key.toLowerCase()] = { recommendedTime: entry.value, sources: ['cached'] };
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
		let hasSuggestion = false;

		const uri = model.uri;
		if (!uri || !this.fileService.canHandleResource(uri)) {
			return;
		}

		let fileExtension = paths.extname(uri.path);
		if (fileExtension) {
			if (processedFileExtensions.indexOf(fileExtension) > -1) {
				return;
			}
			processedFileExtensions.push(fileExtension);
		}

		// re-schedule this bit of the operation to be off
		// the critical path - in case glob-match is slow
		setImmediate(() => {

			let recommendationsToSuggest: string[] = [];
			const now = Date.now();
			forEach(this._availableRecommendations, entry => {
				let { key: pattern, value: ids } = entry;
				if (match(pattern, uri.path)) {
					for (let id of ids) {
						if (caseInsensitiveGet(product.extensionImportantTips, id)) {
							recommendationsToSuggest.push(id);
						}
						const filedBasedRecommendation = this._fileBasedRecommendations[id.toLowerCase()] || { recommendedTime: now, sources: [] };
						filedBasedRecommendation.recommendedTime = now;
						if (!filedBasedRecommendation.sources.some(s => s instanceof URI && s.toString() === uri.toString())) {
							filedBasedRecommendation.sources.push(uri);
						}
						this._fileBasedRecommendations[id.toLowerCase()] = filedBasedRecommendation;
					}
				}
			});

			this.storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(Object.keys(this._fileBasedRecommendations).reduce((result, key) => { result[key] = this._fileBasedRecommendations[key].recommendedTime; return result; }, {})),
				StorageScope.GLOBAL
			);

			const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
			if (config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand) {
				return;
			}

			const importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));
			recommendationsToSuggest = recommendationsToSuggest.filter(id => importantRecommendationsIgnoreList.indexOf(id) === -1 && this.isExtensionAllowedToBeRecommended(id));

			const importantTipsPromise = recommendationsToSuggest.length === 0 ? Promise.resolve(null) : this.extensionWorkbenchService.queryLocal().then(local => {
				const localExtensions = local.map(e => e.identifier);
				recommendationsToSuggest = recommendationsToSuggest.filter(id => localExtensions.every(local => !areSameExtensions(local, { id })));
				if (!recommendationsToSuggest.length) {
					return;
				}
				const id = recommendationsToSuggest[0];
				const name = caseInsensitiveGet(product.extensionImportantTips, id)['name'];

				// Indicates we have a suggested extension via the whitelist
				hasSuggestion = true;

				let message = localize('reallyRecommended2', "The '{0}' extension is recommended for this file type.", name);
				// Temporary fix for the only extension pack we recommend. See https://github.com/Microsoft/vscode/issues/35364
				if (id === 'vscjava.vscode-java-pack') {
					message = localize('reallyRecommendedExtensionPack', "The '{0}' extension pack is recommended for this file type.", name);
				}

				const setIgnoreRecommendationsConfig = (configVal: boolean) => {
					this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
					if (configVal) {
						const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
						this.storageService.store(ignoreWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
					}
				};

				this.notificationService.prompt(Severity.Info, message,
					[{
						label: localize('install', 'Install'),
						run: () => {
							/* __GDPR__
							"extensionRecommendations:popup" : {
								"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
							}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'install', extensionId: name });
							this.instantiationService.createInstance(InstallRecommendedExtensionAction, id).run();
						}
					}, {
						label: localize('showRecommendations', "Show Recommendations"),
						run: () => {
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'show', extensionId: name });

							const recommendationsAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
							recommendationsAction.run();
							recommendationsAction.dispose();
						}
					}, {
						label: choiceNever,
						isSecondary: true,
						run: () => {
							importantRecommendationsIgnoreList.push(id);
							this.storageService.store(
								'extensionsAssistant/importantRecommendationsIgnore',
								JSON.stringify(importantRecommendationsIgnoreList),
								StorageScope.GLOBAL
							);
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'neverShowAgain', extensionId: name });
							this.notificationService.prompt(
								Severity.Info,
								localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations?"),
								[{
									label: localize('ignoreAll', "Yes, Ignore All"),
									run: () => setIgnoreRecommendationsConfig(true)
								}, {
									label: localize('no', "No"),
									run: () => setIgnoreRecommendationsConfig(false)
								}]
							);
						}
					}],
					{
						sticky: true,
						onCancel: () => {
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: name });
						}
					}
				);
			});

			const mimeTypesPromise = this.extensionService.whenInstalledExtensionsRegistered()
				.then(() => {
					return guessMimeTypes(uri.fsPath);
				});

			Promise.all([importantTipsPromise, mimeTypesPromise]).then(result => {

				const fileExtensionSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get
					('extensionsAssistant/fileExtensionsSuggestionIgnore', StorageScope.GLOBAL, '[]'));
				const mimeTypes = result[1];

				if (fileExtension) {
					fileExtension = fileExtension.substr(1); // Strip the dot
				}

				if (hasSuggestion ||
					!fileExtension ||
					mimeTypes.length !== 1 ||
					mimeTypes[0] !== MIME_UNKNOWN ||
					fileExtensionSuggestionIgnoreList.indexOf(fileExtension) > -1
				) {
					return;
				}

				const keywords = getKeywordsForExtension(fileExtension);
				this._galleryService.query({ text: `tag:"__ext_${fileExtension}" ${keywords.map(tag => `tag:"${tag}"`)}` }).then(pager => {
					if (!pager || !pager.firstPage || !pager.firstPage.length) {
						return;
					}

					this.notificationService.prompt(
						Severity.Info,
						localize('showLanguageExtensions', "The Marketplace has extensions that can help with '.{0}' files", fileExtension),
						[{
							label: searchMarketplace,
							run: () => {
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"fileExtension": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'ok', fileExtension: fileExtension });
								this.viewletService.openViewlet('workbench.view.extensions', true)
									.then(viewlet => viewlet as IExtensionsViewlet)
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
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"fileExtension": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'neverShowAgain', fileExtension: fileExtension });
							}
						}],
						{
							sticky: true,
							onCancel: () => {
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"fileExtension": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'cancelled', fileExtension: fileExtension });
							}
						}
					);
				});
			});
		});
	}

	//#endregion

	//#region otherRecommendations

	getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		return this.fetchProactiveRecommendations().then(() => {
			const others = distinct([
				...Object.keys(this._exeBasedRecommendations),
				...this._dynamicWorkspaceRecommendations,
				...Object.keys(this._experimentalRecommendations),
			]).filter(extensionId => this.isExtensionAllowedToBeRecommended(extensionId));
			shuffle(others, this.sessionSeed);
			return others.map(extensionId => {
				const sources: ExtensionRecommendationSource[] = [];
				if (this._exeBasedRecommendations[extensionId]) {
					sources.push('executable');
				}
				if (this._dynamicWorkspaceRecommendations.indexOf(extensionId) !== -1) {
					sources.push('dynamic');
				}
				return (<IExtensionRecommendation>{ extensionId, sources });
			});
		});
	}

	private fetchProactiveRecommendations(calledDuringStartup?: boolean): Promise<void> {
		let fetchPromise = Promise.resolve(null);
		if (!this.proactiveRecommendationsFetched) {
			this.proactiveRecommendationsFetched = true;

			// Executable based recommendations carry out a lot of file stats, so run them after 10 secs
			// So that the startup is not affected

			fetchPromise = new Promise((c, e) => {
				setTimeout(() => {
					Promise.all([this.fetchExecutableRecommendations(), this.fetchDynamicWorkspaceRecommendations()]).then(() => c(undefined));
				}, calledDuringStartup ? 10000 : 0);
			});

		}
		return fetchPromise;
	}

	/**
	 * If user has any of the tools listed in product.exeBasedExtensionTips, fetch corresponding recommendations
	 */
	private fetchExecutableRecommendations(): Promise<any> {
		const homeDir = os.homedir();
		let foundExecutables: Set<string> = new Set<string>();

		let findExecutable = (exeName: string, path: string) => {
			return pfs.fileExists(path).then(exists => {
				if (exists && !foundExecutables.has(exeName)) {
					foundExecutables.add(exeName);
					(product.exeBasedExtensionTips[exeName]['recommendations'] || [])
						.forEach(extensionId => {
							if (product.exeBasedExtensionTips[exeName]['friendlyName']) {
								this._exeBasedRecommendations[extensionId.toLowerCase()] = product.exeBasedExtensionTips[exeName]['friendlyName'];
							}
						});
				}
			});
		};

		let promises: Promise<any>[] = [];
		// Loop through recommended extensions
		forEach(product.exeBasedExtensionTips, entry => {
			if (typeof entry.value !== 'object' || !Array.isArray(entry.value['recommendations'])) {
				return;
			}

			let exeName = entry.key;
			if (process.platform === 'win32') {
				let windowsPath = entry.value['windowsPath'];
				if (!windowsPath || typeof windowsPath !== 'string') {
					return;
				}
				windowsPath = windowsPath.replace('%USERPROFILE%', process.env['USERPROFILE'])
					.replace('%ProgramFiles(x86)%', process.env['ProgramFiles(x86)'])
					.replace('%ProgramFiles%', process.env['ProgramFiles'])
					.replace('%APPDATA%', process.env['APPDATA']);
				promises.push(findExecutable(exeName, windowsPath));
			} else {
				promises.push(findExecutable(exeName, paths.join('/usr/local/bin', exeName)));
				promises.push(findExecutable(exeName, paths.join(homeDir, exeName)));
			}
		});

		return Promise.all(promises);
	}

	/**
	 * Fetch extensions used by others on the same workspace as recommendations from cache
	 */
	private fetchCachedDynamicWorkspaceRecommendations() {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
			return;
		}

		const storageKey = 'extensionsAssistant/dynamicWorkspaceRecommendations';
		let storedRecommendationsJson = {};
		try {
			storedRecommendationsJson = JSON.parse(this.storageService.get(storageKey, StorageScope.WORKSPACE, '{}'));
		} catch (e) {
			this.storageService.remove(storageKey, StorageScope.WORKSPACE);
		}

		if (Array.isArray(storedRecommendationsJson['recommendations'])
			&& isNumber(storedRecommendationsJson['timestamp'])
			&& storedRecommendationsJson['timestamp'] > 0
			&& (Date.now() - storedRecommendationsJson['timestamp']) / milliSecondsInADay < 14) {
			this._dynamicWorkspaceRecommendations = storedRecommendationsJson['recommendations'];
			/* __GDPR__
				"dynamicWorkspaceRecommendations" : {
					"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"cache" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('dynamicWorkspaceRecommendations', { count: this._dynamicWorkspaceRecommendations.length, cache: 1 });
		}
	}

	/**
	 * Fetch extensions used by others on the same workspace as recommendations from recommendation service
	 */
	private fetchDynamicWorkspaceRecommendations(): Promise<void> {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER
			|| !this.fileService.canHandleResource(this.contextService.getWorkspace().folders[0].uri)
			|| this._dynamicWorkspaceRecommendations.length
			|| !this._extensionsRecommendationsUrl) {
			return Promise.resolve(undefined);
		}

		const storageKey = 'extensionsAssistant/dynamicWorkspaceRecommendations';
		const workspaceUri = this.contextService.getWorkspace().folders[0].uri;
		return Promise.all([getHashedRemotesFromUri(workspaceUri, this.fileService, false), getHashedRemotesFromUri(workspaceUri, this.fileService, true)]).then(([hashedRemotes1, hashedRemotes2]) => {
			const hashedRemotes = (hashedRemotes1 || []).concat(hashedRemotes2 || []);
			if (!hashedRemotes.length) {
				return null;
			}

			return this.requestService.request({ type: 'GET', url: this._extensionsRecommendationsUrl }, CancellationToken.None).then(context => {
				if (context.res.statusCode !== 200) {
					return Promise.resolve(null);
				}
				return asJson(context).then((result) => {
					const allRecommendations: IDynamicWorkspaceRecommendations[] = Array.isArray(result['workspaceRecommendations']) ? result['workspaceRecommendations'] : [];
					if (!allRecommendations.length) {
						return;
					}

					let foundRemote = false;
					for (let i = 0; i < hashedRemotes.length && !foundRemote; i++) {
						for (let j = 0; j < allRecommendations.length && !foundRemote; j++) {
							if (Array.isArray(allRecommendations[j].remoteSet) && allRecommendations[j].remoteSet.indexOf(hashedRemotes[i]) > -1) {
								foundRemote = true;
								this._dynamicWorkspaceRecommendations = allRecommendations[j].recommendations.filter(id => this.isExtensionAllowedToBeRecommended(id)) || [];
								this.storageService.store(storageKey, JSON.stringify({
									recommendations: this._dynamicWorkspaceRecommendations,
									timestamp: Date.now()
								}), StorageScope.WORKSPACE);
								/* __GDPR__
									"dynamicWorkspaceRecommendations" : {
										"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"cache" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('dynamicWorkspaceRecommendations', { count: this._dynamicWorkspaceRecommendations.length, cache: 0 });
							}
						}
					}
				});
			});
		});
	}

	/**
	 * Fetch extension recommendations from currently running experiments
	 */
	private fetchExperimentalRecommendations() {
		this.experimentService.getExperimentsByType(ExperimentActionType.AddToRecommendations).then(experiments => {
			(experiments || []).forEach(experiment => {
				if (experiment.state === ExperimentState.Run && experiment.action.properties && Array.isArray(experiment.action.properties.recommendations) && experiment.action.properties.recommendationReason) {
					experiment.action.properties.recommendations.forEach(id => {
						this._experimentalRecommendations[id] = experiment.action.properties.recommendationReason;
					});
				}
			});
		});
	}

	//#endregion

	private isExtensionAllowedToBeRecommended(id: string): boolean {
		return this._allIgnoredRecommendations.indexOf(id.toLowerCase()) === -1;
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
