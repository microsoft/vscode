/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { forEach } from 'vs/base/common/collections';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';
import * as json from 'vs/base/common/json';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, ExtensionRecommendationReason, LocalExtensionType, EXTENSION_IDENTIFIER_PATTERN } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModel } from 'vs/editor/common/model';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import product from 'vs/platform/node/product';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction, InstallRecommendedExtensionAction } from 'vs/workbench/parts/extensions/browser/extensionsActions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionsConfiguration, ConfigurationKey, ShowRecommendationsOnlyOnDemandKey, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as pfs from 'vs/base/node/pfs';
import * as os from 'os';
import { flatten, distinct, shuffle } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { guessMimeTypes, MIME_UNKNOWN } from 'vs/base/common/mime';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { getHashedRemotesFromUri } from 'vs/workbench/parts/stats/node/workspaceStats';
import { IRequestService } from 'vs/platform/request/node/request';
import { asJson } from 'vs/base/node/request';
import { isNumber } from 'vs/base/common/types';
import { language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { INotificationService } from 'vs/platform/notification/common/notification';

interface IExtensionsContent {
	recommendations: string[];
}

const empty: { [key: string]: any; } = Object.create(null);
const milliSecondsInADay = 1000 * 60 * 60 * 24;
const choiceNever = localize('neverShowAgain', "Don't Show Again");
const searchMarketplace = localize('searchMarketplace', "Search Marketplace");
const coreLanguages = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'tr', 'zh-cn', 'zh-tw'];

interface IDynamicWorkspaceRecommendations {
	remoteSet: string[];
	recommendations: string[];
}

export class ExtensionTipsService extends Disposable implements IExtensionTipsService {

	_serviceBrand: any;

	private _fileBasedRecommendations: { [id: string]: number; } = Object.create(null);
	private _exeBasedRecommendations: { [id: string]: string; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private _allWorkspaceRecommendedExtensions: string[] = [];
	private _dynamicWorkspaceRecommendations: string[] = [];
	private _extensionsRecommendationsUrl: string;
	private _disposables: IDisposable[] = [];
	public promptWorkspaceRecommendationsPromise: TPromise<any>;
	private proactiveRecommendationsFetched: boolean = false;

	constructor(
		@IExtensionGalleryService private readonly _galleryService: IExtensionGalleryService,
		@IModelService private readonly _modelService: IModelService,
		@IStorageService private storageService: IStorageService,
		@IExtensionManagementService private extensionsService: IExtensionManagementService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionService private extensionService: IExtensionService,
		@IRequestService private requestService: IRequestService,
		@IViewletService private viewletService: IViewletService,
		@INotificationService private notificationService: INotificationService
	) {
		super();

		if (!this.isEnabled()) {
			return;
		}

		if (product.extensionsGallery && product.extensionsGallery.recommendationsUrl) {
			this._extensionsRecommendationsUrl = product.extensionsGallery.recommendationsUrl;
		}

		this.getLanguageExtensionRecommendations();
		this.getCachedDynamicWorkspaceRecommendations();
		this._suggestFileBasedRecommendations();
		this.promptWorkspaceRecommendationsPromise = this._suggestWorkspaceRecommendations();

		if (!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
			this.fetchProactiveRecommendations(true);
		}

		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!this.proactiveRecommendationsFetched && !this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey)) {
				this.fetchProactiveRecommendations();
			}
		}));
	}

	private fetchProactiveRecommendations(calledDuringStartup?: boolean): TPromise<void> {
		let fetchPromise = TPromise.as(null);
		if (!this.proactiveRecommendationsFetched) {
			this.proactiveRecommendationsFetched = true;

			// Executable based recommendations carry out a lot of file stats, so run them after 10 secs
			// So that the startup is not affected

			fetchPromise = new TPromise((c, e) => {
				setTimeout(() => {
					TPromise.join([this._suggestBasedOnExecutables(), this.getDynamicWorkspaceRecommendations()]).then(() => c(null));
				}, calledDuringStartup ? 10000 : 0);
			});

		}
		return fetchPromise;
	}

	private isEnabled(): boolean {
		return this._galleryService.isEnabled() && !this.environmentService.extensionDevelopmentPath;
	}

	private getLanguageExtensionRecommendations() {
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
		const languagePackSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get
			('extensionsAssistant/languagePackSuggestionIgnore', StorageScope.GLOBAL, '[]'));

		if (!language
			|| language === LANGUAGE_DEFAULT
			|| coreLanguages.some(x => language === x || language.indexOf(x + '-') === 0)
			|| config.ignoreRecommendations
			|| config.showRecommendationsOnlyOnDemand
			|| languagePackSuggestionIgnoreList.indexOf(language) > -1) {
			return;
		}

		this.extensionsService.getInstalled(LocalExtensionType.User).then(locals => {
			for (var i = 0; i < locals.length; i++) {
				if (locals[i].manifest
					&& locals[i].manifest.contributes
					&& Array.isArray(locals[i].manifest.contributes.localizations)
					&& locals[i].manifest.contributes.localizations.some(x => x.languageId === language)) {
					return;
				}
			}

			this._galleryService.query({ text: `tag:lp-${language}` }).then(pager => {
				if (!pager || !pager.firstPage || !pager.firstPage.length) {
					return;
				}

				this.notificationService.prompt(
					Severity.Info,
					localize('showLanguagePackExtensions', "The Marketplace has extensions that can help localizing VS Code to '{0}' locale", language),
					[{
						label: searchMarketplace,
						run: () => {
							/* __GDPR__
								"languagePackSuggestion:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('languagePackSuggestion:popup', { userReaction: 'ok', language });
							this.viewletService.openViewlet('workbench.view.extensions', true)
								.then(viewlet => viewlet as IExtensionsViewlet)
								.then(viewlet => {
									viewlet.search(`tag:lp-${language}`);
									viewlet.focus();
								});
						}
					},
					{
						label: choiceNever,
						isSecondary: true,
						run: () => {
							languagePackSuggestionIgnoreList.push(language);
							this.storageService.store(
								'extensionsAssistant/languagePackSuggestionIgnore',
								JSON.stringify(languagePackSuggestionIgnoreList),
								StorageScope.GLOBAL
							);
							/* __GDPR__
								"languagePackSuggestion:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('languagePackSuggestion:popup', { userReaction: 'neverShowAgain', language });
						}
					}],
					() => {
						/* __GDPR__
							"languagePackSuggestion:popup" : {
								"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"language": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog('languagePackSuggestion:popup', { userReaction: 'cancelled', language });
					}
				);
			});
		});
	}


	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } {
		let output: { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; } = Object.create(null);

		if (!this.proactiveRecommendationsFetched) {
			return output;
		}

		if (this.contextService.getWorkspace().folders && this.contextService.getWorkspace().folders.length === 1) {
			const currentRepo = this.contextService.getWorkspace().folders[0].name;
			this._dynamicWorkspaceRecommendations.forEach(x => output[x.toLowerCase()] = {
				reasonId: ExtensionRecommendationReason.DynamicWorkspace,
				reasonText: localize('dynamicWorkspaceRecommendation', "This extension may interest you because it's popular among users of the {0} repository.", currentRepo)
			});
		}

		forEach(this._exeBasedRecommendations, entry => output[entry.key.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Executable,
			reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", entry.value)
		});

		Object.keys(this._fileBasedRecommendations).forEach(x => output[x.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.File,
			reasonText: localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened.")
		});

		this._allWorkspaceRecommendedExtensions.forEach(x => output[x.toLowerCase()] = {
			reasonId: ExtensionRecommendationReason.Workspace,
			reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
		});

		return output;
	}

	getWorkspaceRecommendations(): TPromise<string[]> {
		if (!this.isEnabled()) {
			return TPromise.as([]);
		}
		const workspace = this.contextService.getWorkspace();
		return TPromise.join([this.resolveWorkspaceRecommendations(workspace), ...workspace.folders.map(workspaceFolder => this.resolveWorkspaceFolderRecommendations(workspaceFolder))])
			.then(recommendations => {
				this._allWorkspaceRecommendedExtensions = distinct(flatten(recommendations));
				return this._allWorkspaceRecommendedExtensions;
			});
	}

	private resolveWorkspaceRecommendations(workspace: IWorkspace): TPromise<string[]> {
		if (workspace.configuration) {
			return this.fileService.resolveContent(workspace.configuration)
				.then(content => this.processWorkspaceRecommendations(json.parse(content.value, [])['extensions']), err => []);
		}
		return TPromise.as([]);
	}

	private resolveWorkspaceFolderRecommendations(workspaceFolder: IWorkspaceFolder): TPromise<string[]> {
		const extensionsJsonUri = workspaceFolder.toResource(paths.join('.vscode', 'extensions.json'));
		return this.fileService.resolveFile(extensionsJsonUri).then(() => {
			return this.fileService.resolveContent(extensionsJsonUri)
				.then(content => this.processWorkspaceRecommendations(json.parse(content.value, [])), err => []);
		}, err => []);
	}

	private processWorkspaceRecommendations(extensionsContent: IExtensionsContent): TPromise<string[]> {
		const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);

		if (extensionsContent && extensionsContent.recommendations && extensionsContent.recommendations.length) {
			let countBadRecommendations = 0;
			let badRecommendationsString = '';
			let filteredRecommendations = extensionsContent.recommendations.filter((element, position) => {
				if (extensionsContent.recommendations.indexOf(element) !== position) {
					// This is a duplicate entry, it doesn't hurt anybody
					// but it shouldn't be sent in the gallery query
					return false;
				} else if (!regEx.test(element)) {
					countBadRecommendations++;
					badRecommendationsString += `${element} (bad format) Expected: <provider>.<name>\n`;
					return false;
				}

				return true;
			});

			return this._galleryService.query({ names: filteredRecommendations }).then(pager => {
				let page = pager.firstPage;
				let validRecommendations = page.map(extension => {
					return extension.identifier.id.toLowerCase();
				});

				if (validRecommendations.length !== filteredRecommendations.length) {
					filteredRecommendations.forEach(element => {
						if (validRecommendations.indexOf(element.toLowerCase()) === -1) {
							countBadRecommendations++;
							badRecommendationsString += `${element} (not found in marketplace)\n`;
						}
					});
				}

				if (countBadRecommendations > 0 && this.notificationService) {
					this.notificationService.warn(
						'The below ' +
						countBadRecommendations +
						' extension(s) in workspace recommendations have issues:\n' +
						badRecommendationsString
					);
				}

				return validRecommendations;
			});
		}

		return TPromise.as([]);

	}

	private onWorkspaceFoldersChanged(event: IWorkspaceFoldersChangeEvent): void {
		if (event.added.length) {
			TPromise.join(event.added.map(workspaceFolder => this.resolveWorkspaceFolderRecommendations(workspaceFolder)))
				.then(result => {
					const newRecommendations = flatten(result);
					// Suggest only if atleast one of the newly added recommendtations was not suggested before
					if (newRecommendations.some(e => this._allWorkspaceRecommendedExtensions.indexOf(e) === -1)) {
						this._suggestWorkspaceRecommendations();
					}
				});
		}
		this._dynamicWorkspaceRecommendations = [];
	}

	getFileBasedRecommendations(): string[] {
		const fileBased = Object.keys(this._fileBasedRecommendations)
			.sort((a, b) => {
				if (this._fileBasedRecommendations[a] === this._fileBasedRecommendations[b]) {
					if (!product.extensionImportantTips || product.extensionImportantTips[a]) {
						return -1;
					}
					if (product.extensionImportantTips[b]) {
						return 1;
					}
				}
				return this._fileBasedRecommendations[a] > this._fileBasedRecommendations[b] ? -1 : 1;
			});
		return fileBased;
	}

	getOtherRecommendations(): TPromise<string[]> {
		return this.fetchProactiveRecommendations().then(() => {
			const others = distinct([...Object.keys(this._exeBasedRecommendations), ...this._dynamicWorkspaceRecommendations]);
			shuffle(others);
			return others;
		});
	}

	getKeymapRecommendations(): string[] {
		return product.keymapExtensionTips || [];
	}

	private _suggestFileBasedRecommendations() {
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
				this._availableRecommendations[pattern] = [id];
			} else {
				ids.push(id);
			}
		});

		forEach(product.extensionImportantTips, entry => {
			let { key: id, value } = entry;
			const { pattern } = value;
			let ids = this._availableRecommendations[pattern];
			if (!ids) {
				this._availableRecommendations[pattern] = [id];
			} else {
				ids.push(id);
			}
		});

		const allRecommendations: string[] = [];
		forEach(this._availableRecommendations, ({ value: ids }) => {
			allRecommendations.push(...ids);
		});

		// retrieve ids of previous recommendations
		const storedRecommendationsJson = JSON.parse(this.storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));

		if (Array.isArray<string>(storedRecommendationsJson)) {
			for (let id of <string[]>storedRecommendationsJson) {
				if (allRecommendations.indexOf(id) > -1) {
					this._fileBasedRecommendations[id] = Date.now();
				}
			}
		} else {
			const now = Date.now();
			forEach(storedRecommendationsJson, entry => {
				if (typeof entry.value === 'number') {
					const diff = (now - entry.value) / milliSecondsInADay;
					if (diff <= 7 && allRecommendations.indexOf(entry.key) > -1) {
						this._fileBasedRecommendations[entry.key] = entry.value;
					}
				}
			});
		}

		this._modelService.onModelAdded(this._suggest, this, this._disposables);
		this._modelService.getModels().forEach(model => this._suggest(model));
	}

	private getMimeTypes(path: string): TPromise<string[]> {
		return this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			return guessMimeTypes(path);
		});
	}

	private _suggest(model: ITextModel): void {
		const uri = model.uri;
		let hasSuggestion = false;

		if (!uri || uri.scheme !== Schemas.file) {
			return;
		}

		// re-schedule this bit of the operation to be off
		// the critical path - in case glob-match is slow
		setImmediate(() => {

			const now = Date.now();
			forEach(this._availableRecommendations, entry => {
				let { key: pattern, value: ids } = entry;
				if (match(pattern, uri.fsPath)) {
					for (let id of ids) {
						this._fileBasedRecommendations[id] = now;
					}
				}
			});

			this.storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(this._fileBasedRecommendations),
				StorageScope.GLOBAL
			);

			const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);
			if (config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand) {
				return;
			}

			const importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));
			let recommendationsToSuggest = Object.keys(product.extensionImportantTips || [])
				.filter(id => importantRecommendationsIgnoreList.indexOf(id) === -1 && match(product.extensionImportantTips[id]['pattern'], uri.fsPath));

			const importantTipsPromise = recommendationsToSuggest.length === 0 ? TPromise.as(null) : this.extensionsService.getInstalled(LocalExtensionType.User).then(local => {
				recommendationsToSuggest = recommendationsToSuggest.filter(id => local.every(local => `${local.manifest.publisher}.${local.manifest.name}` !== id));
				if (!recommendationsToSuggest.length) {
					return;
				}
				const id = recommendationsToSuggest[0];
				const name = product.extensionImportantTips[id]['name'];

				// Indicates we have a suggested extension via the whitelist
				hasSuggestion = true;

				let message = localize('reallyRecommended2', "The '{0}' extension is recommended for this file type.", name);
				// Temporary fix for the only extension pack we recommend. See https://github.com/Microsoft/vscode/issues/35364
				if (id === 'vscjava.vscode-java-pack') {
					message = localize('reallyRecommendedExtensionPack', "The '{0}' extension pack is recommended for this file type.", name);
				}

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

							const installAction = this.instantiationService.createInstance(InstallRecommendedExtensionAction, id);
							installAction.run();
							installAction.dispose();
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
							this.ignoreExtensionRecommendations();
						}
					}],
					() => {
						/* __GDPR__
							"extensionRecommendations:popup" : {
								"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: name });
					}
				);
			});

			const mimeTypesPromise = this.getMimeTypes(uri.fsPath);
			TPromise.join([importantTipsPromise, mimeTypesPromise]).then(result => {

				const fileExtensionSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get
					('extensionsAssistant/fileExtensionsSuggestionIgnore', StorageScope.GLOBAL, '[]'));
				const mimeTypes = result[1];
				let fileExtension = paths.extname(uri.fsPath);
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

				const keywords = this.getKeywordsForExtension(fileExtension);
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
							label: choiceNever,
							isSecondary: true,
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
						() => {
							/* __GDPR__
								"fileExtensionSuggestion:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"fileExtension": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'cancelled', fileExtension: fileExtension });
						}
					);
				});
			});
		});
	}

	private _suggestWorkspaceRecommendations(): TPromise<any> {
		const storageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);

		return this.getWorkspaceRecommendations().then(allRecommendations => {
			if (!allRecommendations.length || config.ignoreRecommendations || config.showRecommendationsOnlyOnDemand || this.storageService.getBoolean(storageKey, StorageScope.WORKSPACE, false)) {
				return;
			}

			return this.extensionsService.getInstalled(LocalExtensionType.User).done(local => {
				const recommendations = allRecommendations
					.filter(id => local.every(local => `${local.manifest.publisher.toLowerCase()}.${local.manifest.name.toLowerCase()}` !== id));

				if (!recommendations.length) {
					return TPromise.as(void 0);
				}

				return new TPromise<void>(c => {
					this.notificationService.prompt(
						Severity.Info,
						localize('workspaceRecommended', "This workspace has extension recommendations."),
						[{
							label: localize('installAll', "Install All"),
							run: () => {
								/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
								*/
								this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'install' });

								const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, localize('installAll', "Install All"));
								installAllAction.run();
								installAllAction.dispose();

								c(void 0);
							}
						}, {
							label: localize('showRecommendations', "Show Recommendations"),
							run: () => {
								/* __GDPR__
									"extensionRecommendations:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });

								const showAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
								showAction.run();
								showAction.dispose();

								c(void 0);
							}
						}, {
							label: choiceNever,
							isSecondary: true,
							run: () => {
								/* __GDPR__
									"extensionRecommendations:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
								this.storageService.store(storageKey, true, StorageScope.WORKSPACE);

								c(void 0);
							}
						}],
						() => {
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });

							c(void 0);
						}
					);
				});
			});
		});
	}

	private ignoreExtensionRecommendations() {
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

	private _suggestBasedOnExecutables(): TPromise<any> {
		const homeDir = os.homedir();
		let foundExecutables: Set<string> = new Set<string>();

		let findExecutable = (exeName: string, path: string) => {
			return pfs.fileExists(path).then(exists => {
				if (exists && !foundExecutables.has(exeName)) {
					foundExecutables.add(exeName);
					(product.exeBasedExtensionTips[exeName]['recommendations'] || [])
						.forEach(x => {
							if (product.exeBasedExtensionTips[exeName]['friendlyName']) {
								this._exeBasedRecommendations[x] = product.exeBasedExtensionTips[exeName]['friendlyName'];
							}
						});
				}
			});
		};

		let promises: TPromise<any>[] = [];
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

		return TPromise.join(promises);
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
		if (configVal) {
			const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
			this.storageService.store(ignoreWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
		}
	}

	private getCachedDynamicWorkspaceRecommendations() {
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

	private getDynamicWorkspaceRecommendations(): TPromise<void> {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER
			|| this._dynamicWorkspaceRecommendations.length
			|| !this._extensionsRecommendationsUrl) {
			return TPromise.as(null);
		}

		const storageKey = 'extensionsAssistant/dynamicWorkspaceRecommendations';
		const workspaceUri = this.contextService.getWorkspace().folders[0].uri;
		return TPromise.join([getHashedRemotesFromUri(workspaceUri, this.fileService, false), getHashedRemotesFromUri(workspaceUri, this.fileService, true)]).then(([hashedRemotes1, hashedRemotes2]) => {
			const hashedRemotes = (hashedRemotes1 || []).concat(hashedRemotes2 || []);
			if (!hashedRemotes.length) {
				return null;
			}

			return this.requestService.request({ type: 'GET', url: this._extensionsRecommendationsUrl }).then(context => {
				if (context.res.statusCode !== 200) {
					return TPromise.as(null);
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
								this._dynamicWorkspaceRecommendations = allRecommendations[j].recommendations || [];
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

	getKeywordsForExtension(extension: string): string[] {
		const keywords = product.extensionKeywords || {};
		return keywords[extension] || [];
	}

	getRecommendationsForExtension(extension: string): string[] {
		const str = `.${extension}`;
		const result = Object.create(null);

		forEach(product.extensionTips || empty, entry => {
			let { key: id, value: pattern } = entry;

			if (match(pattern, str)) {
				result[id] = true;
			}
		});

		forEach(product.extensionImportantTips || empty, entry => {
			let { key: id, value } = entry;

			if (match(value.pattern, str)) {
				result[id] = true;
			}
		});

		return Object.keys(result);
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
