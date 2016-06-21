/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import {forEach} from 'vs/base/common/collections';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {match} from 'vs/base/common/glob';
import {IExtensionGalleryService, IExtensionTipsService, ILocalExtension} from 'vs/platform/extensionManagement/common/extensionManagement';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class ExtensionTipsService implements IExtensionTipsService {

	serviceId = IExtensionTipsService;

	private _recommendations: { [id: string]: boolean; } = Object.create(null);
	private _availableRecommendations: { [pattern: string]: string[] } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		@IExtensionGalleryService private _galleryService: IExtensionGalleryService,
		@IModelService private _modelService: IModelService,
		@IStorageService private _storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		if (!this._galleryService.isEnabled()) {
			return;
		}

		const extensionTips = contextService.getConfiguration().env.extensionTips;
		if (!extensionTips) {
			return;
		}

		// retrieve ids of previous recommendations
		const storedRecommendations = <string[]>JSON.parse(_storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]'));
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

		this._disposables.push(this._modelService.onModelAdded(model => {
			this._suggest(model.uri);
		}));
		for (let model of this._modelService.getModels()) {
			this._suggest(model.uri);
		}
	}

	getRecommendations(): Promise<ILocalExtension[]> {
		const names = Object.keys(this._recommendations);

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

			this._storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(Object.keys(this._recommendations)),
				StorageScope.GLOBAL
			);
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
