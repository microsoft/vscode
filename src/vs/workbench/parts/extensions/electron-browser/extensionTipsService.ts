/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { forEach } from 'vs/base/common/collections';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';
import * as json from 'vs/base/common/json';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, LocalExtensionType, EXTENSION_IDENTIFIER_PATTERN } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModel } from 'vs/editor/common/editorCommon';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import product from 'vs/platform/node/product';
import { IChoiceService, IMessageService } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowRecommendedExtensionsAction, ShowWorkspaceRecommendedExtensionsAction } from 'vs/workbench/parts/extensions/browser/extensionsActions';
import Severity from 'vs/base/common/severity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IExtensionsConfiguration, ConfigurationKey } from 'vs/workbench/parts/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as cp from 'child_process';
import { distinct } from 'vs/base/common/arrays';

interface IExtensionsContent {
	recommendations: string[];
}

const empty: { [key: string]: any; } = Object.create(null);
const milliSecondsInADay = 1000 * 60 * 60 * 24;

export class ExtensionTipsService implements IExtensionTipsService {

	_serviceBrand: any;

	private _fileBasedRecommendations: { [id: string]: number; } = Object.create(null);
	private _exeBasedRecommendations: string[] = [];
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private importantRecommendations: { [id: string]: { name: string; pattern: string; } } = Object.create(null);
	private importantRecommendationsIgnoreList: string[];
	private _allRecommendations: string[];
	private _disposables: IDisposable[] = [];

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
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		if (!this._galleryService.isEnabled()) {
			return;
		}

		this._suggestTips();
		this._suggestWorkspaceRecommendations();
		this._suggestBasedOnExecutables();
	}

	getWorkspaceRecommendations(): TPromise<string[]> {
		if (!this.contextService.hasWorkspace()) {
			return TPromise.as([]);
		}
		return this.fileService.resolveContent(this.contextService.toResource(paths.join('.vscode', 'extensions.json'))).then(content => { //TODO@Sandeep (https://github.com/Microsoft/vscode/issues/29242)
			const extensionsContent = <IExtensionsContent>json.parse(content.value, []);
			if (extensionsContent.recommendations) {
				const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
				return extensionsContent.recommendations.filter((element, position) => {
					return extensionsContent.recommendations.indexOf(element) === position && regEx.test(element);
				});
			}
			return [];
		}, err => []);
	}

	getRecommendations(): string[] {
		const allRecomendations = this._getAllRecommendationsInProduct();
		const fileBased = Object.keys(this._fileBasedRecommendations)
			.filter(recommendation => allRecomendations.indexOf(recommendation) !== -1);

		const exeBased = distinct(this._exeBasedRecommendations);

		this.telemetryService.publicLog('extensionRecommendations:unfiltered', { fileBased, exeBased });

		return distinct([...fileBased, ...exeBased]);
	}

	getKeymapRecommendations(): string[] {
		return product.keymapExtensionTips || [];
	}

	private _getAllRecommendationsInProduct(): string[] {
		if (!this._allRecommendations) {
			this._allRecommendations = [...Object.keys(this.importantRecommendations)];
			forEach(this._availableRecommendations, ({ value: ids }) => {
				this._allRecommendations.push(...ids);
			});
		}
		return this._allRecommendations;
	}

	private _suggestTips() {
		const extensionTips = product.extensionTips;
		if (!extensionTips) {
			return;
		}
		this.importantRecommendations = product.extensionImportantTips || Object.create(null);
		this.importantRecommendationsIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));

		// retrieve ids of previous recommendations
		const storedRecommendationsJson = JSON.parse(this.storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));
		if (Array.isArray<string>(storedRecommendationsJson)) {
			for (let id of <string[]>storedRecommendationsJson) {
				this._fileBasedRecommendations[id] = Date.now();
			}
		} else {
			const now = Date.now();
			forEach(storedRecommendationsJson, entry => {
				if (typeof entry.value === 'number') {
					const diff = (now - entry.value) / milliSecondsInADay;
					if (diff > 7) {
						delete this._fileBasedRecommendations[entry.value];
					} else {
						this._fileBasedRecommendations[entry.key] = entry.value;
					}
				}
			});
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

		this._modelService.onModelAdded(this._suggest, this, this._disposables);
		this._modelService.getModels().forEach(model => this._suggest(model));
	}

	private _suggest(model: IModel): void {
		const uri = model.uri;

		if (!uri) {
			return;
		}

		if (uri.scheme === Schemas.inMemory || uri.scheme === Schemas.internal || uri.scheme === Schemas.vscode) {
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

			const config = this.configurationService.getConfiguration<IExtensionsConfiguration>(ConfigurationKey);

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

						const message = localize('reallyRecommended2', "The '{0}' extension is recommended for this file type.", name);
						const recommendationsAction = this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));
						const options = [
							recommendationsAction.label,
							localize('neverShowAgain', "Don't show again"),
							localize('close', "Close")
						];

						this.choiceService.choose(Severity.Info, message, options, 2).done(choice => {
							switch (choice) {
								case 0:
									this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'show' });
									return recommendationsAction.run();
								case 1: this.importantRecommendationsIgnoreList.push(id);
									this.storageService.store(
										'extensionsAssistant/importantRecommendationsIgnore',
										JSON.stringify(this.importantRecommendationsIgnoreList),
										StorageScope.GLOBAL
									);
									this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'neverShowAgain' });
									return this.ignoreExtensionRecommendations();
								case 2:
									this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'close' });
							}
						}, () => {
							this.telemetryService.publicLog('extensionRecommendations:popup', { userReaction: 'cancelled' });
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

		const config = this.configurationService.getConfiguration<IExtensionsConfiguration>(ConfigurationKey);

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
				const action = this.instantiationService.createInstance(ShowWorkspaceRecommendedExtensionsAction, ShowWorkspaceRecommendedExtensionsAction.ID, localize('showRecommendations', "Show Recommendations"));

				const options = [
					action.label,
					localize('neverShowAgain', "Don't show again"),
					localize('close', "Close")
				];

				this.choiceService.choose(Severity.Info, message, options, 2).done(choice => {
					switch (choice) {
						case 0:
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'show' });
							return action.run();
						case 1:
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'neverShowAgain' });
							return this.storageService.store(storageKey, true, StorageScope.WORKSPACE);
						case 2:
							this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'close' });
					}
				}, () => {
					this.telemetryService.publicLog('extensionWorkspaceRecommendations:popup', { userReaction: 'cancelled' });
				});
			});
		});
	}

	private ignoreExtensionRecommendations() {
		const message = localize('ignoreExtensionRecommendations', "Do you want to ignore all extension recommendations ?");
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

	private _suggestBasedOnExecutables() {
		const cmd = process.platform === 'win32' ? 'where' : 'which';
		forEach(product.exeBasedExtensionTips, entry => {
			cp.exec(`${cmd} ${entry.value.replace(/,/g, ' ')}`, (err, stdout, stderr) => {
				if (stdout) {
					this._exeBasedRecommendations.push(entry.key);
				}
			});
		});
	}

	private setIgnoreRecommendationsConfig(configVal: boolean) {
		let target = ConfigurationTarget.USER;
		const configKey = 'extensions.ignoreRecommendations';
		this.configurationEditingService.writeConfiguration(target, { key: configKey, value: configVal });
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
