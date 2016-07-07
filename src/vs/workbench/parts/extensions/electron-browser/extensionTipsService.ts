/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import {forEach} from 'vs/base/common/collections';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {match} from 'vs/base/common/glob';
import {IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, IGalleryExtension} from 'vs/platform/extensionManagement/common/extensionManagement';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import product from 'vs/platform/product';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShowExtensionRecommendationsAction } from './extensionsActions';
import Severity from 'vs/base/common/severity';

export class ExtensionTipsService implements IExtensionTipsService {

	_serviceBrand: any;

	private _recommendations: { [id: string]: boolean; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private importantRecommendations: { [pattern: string]: string[] };
	private importantRecommendationsIgnoreList: string[];
	private _disposables: IDisposable[] = [];

	constructor(
		@IExtensionGalleryService private _galleryService: IExtensionGalleryService,
		@IModelService private _modelService: IModelService,
		@IStorageService private storageService: IStorageService,
		@IMessageService private messageService: IMessageService,
		@IExtensionManagementService private extensionsService: IExtensionManagementService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		if (!this._galleryService.isEnabled()) {
			return;
		}

		const extensionTips = product.extensionTips;

		if (!extensionTips) {
			return;
		}

		this.importantRecommendations = product.extensionImportantTips || Object.create(null);
		this.importantRecommendationsIgnoreList = <string[]>JSON.parse(storageService.get('extensionsAssistant/importantRecommendationsIgnore', StorageScope.GLOBAL, '[]'));

		// retrieve ids of previous recommendations
		const storedRecommendations = <string[]>JSON.parse(storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));
		for (let id of storedRecommendations) {
			this._recommendations[id] = true;
		}

		// group ids by pattern, like {**/*.md} -> [ext.foo1, ext.bar2]
		this._availableRecommendations = Object.create(null);
		forEach(extensionTips, entry => {
			let {key: id, value: pattern} = entry;
			let ids = this._availableRecommendations[pattern];
			if (!ids) {
				this._availableRecommendations[pattern] = [id];
			} else {
				ids.push(id);
			}
		});

		this._disposables.push(this._modelService.onModelAdded(model => this._suggest(model.uri)));
		this._modelService.getModels().forEach(model => this._suggest(model.uri));
	}

	getRecommendations(): Promise<IGalleryExtension[]> {
		const names = Object.keys(this._recommendations);

		if (names.length === 0) {
			return Promise.as([]);
		}

		return this._galleryService.query({ names, pageSize: names.length })
			.then(result => result.firstPage, () => []);
	}

	private _suggest(uri: URI): Promise<any> {
		if (!uri) {
			return;
		}

		// re-schedule this bit of the operation to be off
		// the critical path - in case glob-match is slow
		setImmediate(() => {

			forEach(this._availableRecommendations, entry => {
				let {key: pattern, value: ids} = entry;
				if (match(pattern, uri.fsPath)) {
					for (let id of ids) {
						this._recommendations[id] = true;
					}
				}
			});

			this.storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(Object.keys(this._recommendations)),
				StorageScope.GLOBAL
			);

			this.extensionsService.getInstalled().done(local => {
				Object.keys(this.importantRecommendations)
					.filter(id => this.importantRecommendationsIgnoreList.indexOf(id) === -1)
					.filter(id => local.every(local => `${local.manifest.publisher}.${local.manifest.name}` !== id))
					.forEach(id => {
						const pattern = this.importantRecommendations[id];

						if (!match(pattern, uri.fsPath)) {
							return;
						}

						const message = localize('reallyRecommended', "It is recommended to install the '{0}' extension.", id);
						const neverAgainAction = new Action('neverShowAgain', localize('neverShowAgain', "Don't show again"), null, true, () => {
							this.importantRecommendationsIgnoreList.push(id);
							this.storageService.store(
								'extensionsAssistant/importantRecommendationsIgnore',
								JSON.stringify(this.importantRecommendationsIgnoreList),
								StorageScope.GLOBAL
							);
							return Promise.as(true);
						});
						const recommendationsAction = this.instantiationService.createInstance(ShowExtensionRecommendationsAction, ShowExtensionRecommendationsAction.ID, localize('showRecommendations', "Show Recommendations"));

						this.messageService.show(Severity.Info, {
							message,
							actions: [CloseAction, neverAgainAction, recommendationsAction]
						});
					});
			});
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
