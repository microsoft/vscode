/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionRecommendationReason } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';

export type GalleryExtensionRecommendation = {
	readonly extension: string;
	readonly reason: IExtensionRecommendationReason;
};

export type ResourceExtensionRecommendation = {
	readonly extension: URI;
	readonly reason: IExtensionRecommendationReason;
};

export type ExtensionRecommendation = GalleryExtensionRecommendation | ResourceExtensionRecommendation;

export abstract class ExtensionRecommendations extends Disposable {

	readonly abstract recommendations: ReadonlyArray<ExtensionRecommendation>;
	protected abstract doActivate(): Promise<void>;

	private _activationPromise: Promise<void> | null = null;
	get activated(): boolean { return this._activationPromise !== null; }
	activate(): Promise<void> {
		if (!this._activationPromise) {
			this._activationPromise = this.doActivate();
		}
		return this._activationPromise;
	}

}
