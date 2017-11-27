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
import { IModel } from 'vs/editor/common/editorCommon';
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

interface IExtensionsContent {
	recommendations: string[];
}

const empty: { [key: string]: any; } = Object.create(null);
const milliSecondsInADay = 1000 * 60 * 60 * 24;

export class ExtensionTipsService extends Disposable implements IExtensionTipsService {

	_serviceBrand: any;

	private _fileBasedRecommendations: { [id: string]: number; } = Object.create(null);
	private _exeBasedRecommendations: { [id: string]: string; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private importantRecommendations: { [id: string]: { name: string; pattern: string; } } = Object.create(null);
	private importantRecommendationsIgnoreList: string[];
	private _allRecommendations: string[] = [];
	private _disposables: IDisposable[] = [];

	private _allWorkspaceRecommendedExtensions: string[] = [];

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
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();

		if (!this._galleryService.isEnabled()) {
			return;
		}


		this._suggestTips();
		this._suggestWorkspaceRecommendations();

		// Executable based recommendations carry out a lot of file stats, so run them after 10 secs
		// So that the startup is not affected
		setTimeout(() => this._suggestBasedOnExecutables(this._exeBasedRecommendations), 10000);
		this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
	}

	getAllRecommendationsWithReason(): { [id: string]: string; } {
		let output: { [id: string]: string; } = Object.create(null);
		Object.keys(this._fileBasedRecommendations).forEach(x => output[x.toLowerCase()] = localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened."));
		this._allWorkspaceRecommendedExtensions.forEach(x => output[x.toLowerCase()] = localize('workspaceRecommendation', "This extension is recommended by users of the current workspace."));
		forEach(this._exeBasedRecommendations, entry => output[entry.key.toLowerCase()] = localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", entry.value));
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

	private processWorkspaceRecommendations(extensionsContent: IExtensionsContent): string[] {
		if (extensionsContent && extensionsContent.recommendations) {
			const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
			return extensionsContent.recommendations.filter((element, position) => {
				return extensionsContent.recommendations.indexOf(element) === position && regEx.test(element);
			});
		}
		return [];
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
					if (product.extensionImportantTips[a]) {
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

	private _suggestTips() {
		const extensionTips = product.extensionTips;
		if (!extensionTips) {
			return;
		}
		this.importantRecommendations = product.extensionImportantTips || Object.create(null);
		this.importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));

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

		forEach(this._availableRecommendations, ({ value: ids }) => {
			this._allRecommendations.push(...ids);
		});

		// retrieve ids of previous recommendations
		const storedRecommendationsJson = JSON.parse(this.storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));

		if (Array.isArray<string>(storedRecommendationsJson)) {
			for (let id of <string[]>storedRecommendationsJson) {
				if (this._allRecommendations.indexOf(id) > -1) {
					this._fileBasedRecommendations[id] = Date.now();
				}
			}
		} else {
			const now = Date.now();
			forEach(storedRecommendationsJson, entry => {
				if (typeof entry.value === 'number') {
					const diff = (now - entry.value) / milliSecondsInADay;
					if (diff <= 7 && this._allRecommendations.indexOf(entry.key) > -1) {
						this._fileBasedRecommendations[entry.key] = entry.value;
					}
				}
			});
		}

		this._modelService.onModelAdded(this._suggest, this, this._disposables);
		this._modelService.getModels().forEach(model => this._suggest(model));
	}

	private _suggest(model: IModel): void {
		const uri = model.uri;

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

			this.extensionsService.getInstalled(LocalExtensionType.User).done(local => {
				Object.keys(this.importantRecommendations)
					.filter(id => this.importantRecommendationsIgnoreList.indexOf(id) === -1)
					.filter(id => local.every(local => `${local.manifest.publisher}.${local.manifest.name}` !== id))
					.forEach(id => {
						const { pattern, name } = this.importantRecommendations[id];

						if (!match(pattern, uri.fsPath)) {
							return;
						}

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
							localize('neverShowAgain', "Don't show again"),
							localize('close', "Close")
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
								case 2: this.importantRecommendationsIgnoreList.push(id);
									this.storageService.store(
										'extensionsAssistant/importantRecommendationsIgnore',
										JSON.stringify(this.importantRecommendationsIgnoreList),
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
			});
		});
	}

	private _suggestWorkspaceRecommendations() {
		const storageKey = 'extensionsAssistant/workspaceRecommendationsIgnore';

		if (this.storageService.getBoolean(storageKey, StorageScope.WORKSPACE, false)) {
			return;
		}

		const config = this.configurationService.getValue<IExtensionsConfiguration>(ConfigurationKey);

		if (config.ignoreRecommendations) {
			return;
		}
		this.getWorkspaceRecommendations().done(allRecommendations => {
			if (!allRecommendations.length) {
				return;
			}

			this.extensionsService.getInstalled(LocalExtensionType.User).done(local => {
				const recommendations = allRecommendations
					.filter(id => local.every(local => `${local.manifest.publisher}.${local.manifest.name}` !== id));

				if (!recommendations.length) {
					return;
				}

				const message = localize('workspaceRecommended', "This workspace has extension recommendations.");
				const showAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
				const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, localize('installAll', "Install All"));

				const options = [
					installAllAction.label,
					showAction.label,
					localize('neverShowAgain', "Don't show again"),
					localize('close', "Close")
				];

				this.choiceService.choose(Severity.Info, message, options, 3).done(choice => {
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
