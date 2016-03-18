/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import {toObject} from 'vs/base/common/objects';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {match} from 'vs/base/common/glob';
import {IGalleryService, IExtensionTipsService, IExtension} from 'vs/workbench/parts/extensions/common/extensions';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

interface ExtensionRecommendations {
	[id: string]: string;
}

export class ExtensionTipsService implements IExtensionTipsService {

	serviceId: any;
	private _recommendations: { [id: string]: boolean; };
	private _disposables: IDisposable[] = [];
	private _availableRecommendations: ExtensionRecommendations;

	constructor(
		@IGalleryService private _galleryService: IGalleryService,
		@IModelService private _modelService: IModelService,
		@IStorageService private _storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		if (!this._galleryService.isEnabled()) {
			return;
		}

		this._recommendations = toObject(JSON.parse(_storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]')), id => id, () => true);

		const extensionTips = contextService.getConfiguration().env.extensionTips;

		if (extensionTips) {
			this._availableRecommendations = extensionTips;
			this._disposables.push(this._modelService.onModelAdded(model => {
				this._suggest(model.getAssociatedResource());
			}));

			for (let model of this._modelService.getModels()) {
				this._suggest(model.getAssociatedResource());
			}
		}
	}

	getRecommendations(): Promise<IExtension[]> {
		return this._galleryService.query()
			.then(null, () => [])
			.then(available => toObject(available, ext => `${ext.publisher}.${ext.name}`))
			.then(available => {
				return Object.keys(this._recommendations)
					.map(id => available[id])
					.filter(i => !!i);
			});
	}

	private _suggest(uri: URI): Promise<any> {
		if (!uri) {
			return;
		}

		const ids = Object.keys(this._availableRecommendations);
		const recommendations = ids
			.filter(id => match(this._availableRecommendations[id], uri.fsPath));

		recommendations.forEach(r => this._recommendations[r] = true);

		this._storageService.store(
			'extensionsAssistant/recommendations',
			JSON.stringify(Object.keys(this._recommendations)),
			StorageScope.GLOBAL
		);
	}

	dispose() {
		this._disposables = disposeAll(this._disposables);
	}
}
