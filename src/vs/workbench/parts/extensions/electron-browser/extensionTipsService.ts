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
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, LocalExtensionType, EXTENSION_IDENTIFIER_PATTERN } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModel } from 'vs/editor/common/model';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import product from 'vs/platform/node/product';
import { IChoiceService, IMessageService } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction, InstallRecommendedExtensionAction } from 'vs/workbench/parts/extensions/browser/extensionsActions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionsConfiguration, ConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as pfs from 'vs/base/node/pfs';
import * as os from 'os';
import { flatten, distinct } from 'vs/base/common/arrays';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { guessMimeTypes, MIME_UNKNOWN } from 'vs/base/common/mime';
import { ShowLanguageExtensionsAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

interface IExtensionsContent {
	recommendations: string[];
}

const empty: { [key: string]: any; } = Object.create(null);
const milliSecondsInADay = 1000 * 60 * 60 * 24;
const choiceNever = localize('neverShowAgain', "Don't show again");
const choiceClose = localize('close', "Close");

export class ExtensionTipsService extends Disposable implements IExtensionTipsService {

	_serviceBrand: any;

	private _fileBasedRecommendations: { [id: string]: number; } = Object.create(null);
	private _exeBasedRecommendations: { [id: string]: string; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private _disposables: IDisposable[] = [];

	private _allWorkspaceRecommendedExtensions: string[] = [];
	public promptWorkspaceRecommendationsPromise: TPromise<any>;

	constructor(
		@IExtensionGalleryService private _galleryService: IExtensionGalleryService,
		@IModelService private _modelService: IModelService,
		@IStorageService private storageService: IStorageService,
		@IChoiceService private choiceService: IChoiceService,
		@IExtensionManagementService private extensionsService: IExtensionManagementService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		super();

		if (!this._galleryService.isEnabled() || this.environmentService.extensionDevelopmentPath) {
			return;
		}

		this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
			this._suggestFileBasedRecommendations();
		});

		this.promptWorkspaceRecommendationsPromise = this._suggestWorkspaceRecommendations();

		// Executable based recommendations carry out a lot of file stats, so run them after 10 secs
		// So that the startup is not affected
		setTimeout(() => this._suggestBasedOnExecutables(this._exeBasedRecommendations), 10000);
		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
	}

	getAllRecommendationsWithReason(): { [id: string]: string; } {
		let output: { [id: string]: string; } = Object.create(null);
		this._allWorkspaceRecommendedExtensions.forEach(x => output[x.toLowerCase()] = localize('workspaceRecommendation', "This extension is recommended by users of the current workspace."));
		Object.keys(this._fileBasedRecommendations).forEach(x => output[x.toLowerCase()] = output[x.toLowerCase()] || localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened."));
		forEach(this._exeBasedRecommendations, entry => output[entry.key.toLowerCase()] = output[entry.key.toLowerCase()] || localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", entry.value));
		return output;
	}

	getWorkspaceRecommendations(): TPromise<string[]> {
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
		return this.fileService.resolveContent(workspaceFolder.toResource(paths.join('.vscode', 'extensions.json')))
			.then(content => this.processWorkspaceRecommendations(json.parse(content.value, [])), err => []);
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

				if (countBadRecommendations > 0) {
					console.log('The below ' +
						countBadRecommendations +
						' extension(s) in workspace recommendations have issues:\n' +
						badRecommendationsString);
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

	getOtherRecommendations(): string[] {
		return Object.keys(this._exeBasedRecommendations);
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

		const allRecommendations = [];
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
			if (config.ignoreRecommendations) {
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

				const recommendationsAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
				const installAction = this.instantiationService.createInstance(InstallRecommendedExtensionAction, id);
				const options = [
					localize('install', 'Install'),
					recommendationsAction.label,
					choiceNever,
					choiceClose
				];

				this.choiceService.choose(Severity.Info, message, options, 3).done(choice => {
					switch (choice) {
						case 0:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'install', extensionId: name });
							return installAction.run();
						case 1:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'show', extensionId: name });
							return recommendationsAction.run();
						case 2: importantRecommendationsIgnoreList.push(id);
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
							return this.ignoreExtensionRecommendations();
						case 3:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'close', extensionId: name });
					}
				}, () => {
					/* __GDPR__
						"extensionRecommendations:popup" : {
							"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'cancelled', extensionId: name });
				});
			});

			importantTipsPromise.then(() => {
				const fileExtensionSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get
					('extensionsAssistant/fileExtensionsSuggestionIgnore', StorageScope.GLOBAL, '[]'));
				let mimeTypes = guessMimeTypes(uri.fsPath);
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

					const message = localize('showLanguageExtensions', "The Marketplace has extensions that can help with '.{0}' files", fileExtension);

					const searchMarketplaceAction = this.instantiationService.createInstance(ShowLanguageExtensionsAction, fileExtension);

					const options = [
						localize('searchMarketplace', "Search Marketplace"),
						choiceNever,
						choiceClose
					];

					this.choiceService.choose(Severity.Info, message, options, 2).done(choice => {
						switch (choice) {
							case 0:
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'ok', fileExtension: fileExtension });
								searchMarketplaceAction.run();
								break;
							case 1:
								fileExtensionSuggestionIgnoreList.push(fileExtension);
								this.storageService.store(
									'extensionsAssistant/fileExtensionsSuggestionIgnore',
									JSON.stringify(fileExtensionSuggestionIgnoreList),
									StorageScope.GLOBAL
								);
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'neverShowAgain', fileExtension: fileExtension });
							case 2:
								/* __GDPR__
									"fileExtensionSuggestion:popup" : {
										"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'close', fileExtension: fileExtension });
								break;
						}
					}, () => {
						/* __GDPR__
							"fileExtensionSuggestion:popup" : {
								"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog('fileExtensionSuggestion:popup', { userReaction: 'cancelled', fileExtension: fileExtension });
					});
				});
			});
		});
	}

	private _suggestWorkspaceRecommendations(): TPromise<any> {
		const storageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);

		return this.getWorkspaceRecommendations().then(allRecommendations => {
			if (!allRecommendations.length || config.ignoreRecommendations || this.storageService.getBoolean(storageKey, StorageScope.WORKSPACE, false)) {
				return;
			}

			return this.extensionsService.getInstalled(LocalExtensionType.User).done(local => {
				const recommendations = allRecommendations
					.filter(id => local.every(local => `${local.manifest.publisher.toLowerCase()}.${local.manifest.name.toLowerCase()}` !== id));

				if (!recommendations.length) {
					return;
				}

				const message = localize('workspaceRecommended', "This workspace has extension recommendations.");
				const showAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
				const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, localize('installAll', "Install All"));

				const options = [
					installAllAction.label,
					showAction.label,
					choiceNever,
					choiceClose
				];

				return this.choiceService.choose(Severity.Info, message, options, 3).done(choice => {
					switch (choice) {
						case 0:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'install' });
							return installAllAction.run();
						case 1:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });
							return showAction.run();
						case 2:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
							return this.storageService.store(storageKey, true, StorageScope.WORKSPACE);
						case 3:
							/* __GDPR__
								"extensionRecommendations:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'close' });
					}
				}, () => {
					/* __GDPR__
						"extensionRecommendations:popup" : {
							"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });
				});
			});
		});
	}

	private ignoreExtensionRecommendations() {
		const message = localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations?");
		const options = [
			localize('ignoreAll', "Yes, Ignore All"),
			localize('no', "No"),
			localize('cancel', "Cancel")
		];

		this.choiceService.choose(Severity.Info, message, options, 2).done(choice => {
			switch (choice) {
				case 0:	// If the user ignores the current message and selects different file type
					// we should hide all the stacked up messages as he has selected Yes, Ignore All
					this.messageService.hideAll();
					return this.setIgnoreRecommendationsConfig(true);
				case 1: return this.setIgnoreRecommendationsConfig(false);
			}
		});
	}

	private _suggestBasedOnExecutables(recommendations: { [id: string]: string; }): void {
		const homeDir = os.homedir();
		let foundExecutables: Set<string> = new Set<string>();

		let findExecutable = (exeName, path) => {
			return pfs.fileExists(path).then(exists => {
				if (exists && !foundExecutables.has(exeName)) {
					foundExecutables.add(exeName);
					(product.exeBasedExtensionTips[exeName]['recommendations'] || [])
						.forEach(x => {
							if (product.exeBasedExtensionTips[exeName]['friendlyName']) {
								recommendations[x] = product.exeBasedExtensionTips[exeName]['friendlyName'];
							}
						});
				}
			});
		};

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
				findExecutable(exeName, windowsPath);
			} else {
				findExecutable(exeName, paths.join('/usr/local/bin', exeName));
				findExecutable(exeName, paths.join(homeDir, exeName));
			}
		});
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		this.configurationService.updateValue('extensions.ignoreRecommendations', configVal, ConfigurationTarget.USER);
		if (configVal) {
			const ignoreWorkspaceRecommendationsStorageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';
			this.storageService.store(ignoreWorkspaceRecommendationsStorageKey, true, StorageScope.WORKSPACE);
		}
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
