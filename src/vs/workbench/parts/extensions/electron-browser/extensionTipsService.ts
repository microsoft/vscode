/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/text!vs/workbench/parts/extensions/electron-browser/extensionTips.json';
import URI from 'vs/base/common/uri';
import {toObject} from 'vs/base/common/objects';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {match} from 'vs/base/common/glob';
import {IGalleryService, IExtensionTipsService, IExtension} from 'vs/workbench/parts/extensions/common/extensions';
import {IModelService} from 'vs/editor/common/services/modelService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

interface ExtensionRecommendations {
	[id: string]: string;
}

export class ExtensionTipsService implements IExtensionTipsService {

	serviceId: any;
	private recommendations: { [id: string]: boolean; };
	private disposables: IDisposable[] = [];
	private availableRecommendations: Promise<ExtensionRecommendations>;

	constructor(
		@IGalleryService private galleryService: IGalleryService,
		@IModelService private modelService: IModelService,
		@IStorageService private storageService: IStorageService
	) {
		if (!this.galleryService.isEnabled()) {
			return;
		}

		this.recommendations = toObject(JSON.parse(storageService.get('extensionsAssistant/recommendations', StorageScope.GLOBAL, '[]')), id => id, () => true);

		this.availableRecommendations = new Promise((resolve, reject) => {
			require(['vs/text!vs/workbench/parts/extensions/electron-browser/extensionTips.json'],
				data => resolve(JSON.parse(data)),
				() => ({}));
		});

		this.disposables.push(this.modelService.onModelAdded(model => {
			this.suggest(model.getAssociatedResource());
		}));

		for (let model of this.modelService.getModels()) {
			this.suggest(model.getAssociatedResource());
		}
	}

	getRecommendations(): Promise<IExtension[]> {
		return this.galleryService.query()
			.then(null, () => [])
			.then(available => toObject(available, ext => `${ext.publisher}.${ext.name}`))
			.then(available => {
				return Object.keys(this.recommendations)
					.map(id => available[id])
					.filter(i => !!i);
			});
	}

	private suggest(uri: URI): Promise<any> {
		if (!uri) {
			return;
		}

		this.availableRecommendations.done(availableRecommendations => {
			const ids = Object.keys(availableRecommendations);
			const recommendations = ids
				.filter(id => match(availableRecommendations[id], uri.fsPath));

			recommendations.forEach(r => this.recommendations[r] = true);

			this.storageService.store(
				'extensionsAssistant/recommendations',
				JSON.stringify(Object.keys(this.recommendations)),
				StorageScope.GLOBAL
			);
		});
	}

	dispose() {
		this.disposables = disposeAll(this.disposables);
	}
}
