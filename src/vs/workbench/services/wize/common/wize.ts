/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IModel } from 'vs/editor/common/editorCommon';

export interface IBaselineResourceProvider {
	getBaselineResource(resource: URI): TPromise<URI>;
}

export const IWizeService = createDecorator<IWizeService>('wize');

export interface IWizeResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	strikeThrough?: boolean;
}

export interface IWizeResource {
	readonly resourceGroupId: string;
	readonly uri: URI;
	readonly decorations: IWizeResourceDecorations;
}

export interface IWizeResourceGroup {
	readonly id: string;
	readonly label: string;
	readonly resources: IWizeResource[];
}

export interface IWizeProvider extends IDisposable {
	readonly id: string;
	readonly label: string;
	readonly resources: IWizeResourceGroup[];
	readonly onDidChange: Event<IWizeResourceGroup[]>;
	readonly count?: number | undefined;

	open(uri: IWizeResource): TPromise<void>;
	drag(from: IWizeResource, to: IWizeResourceGroup): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface IWizeService {

	readonly _serviceBrand: any;
	readonly onDidChangeProvider: Event<IWizeProvider>;
	readonly providers: IWizeProvider[];
	activeProvider: IWizeProvider | undefined;
	readonly inputBoxModel: IModel;

	registerWizeProvider(provider: IWizeProvider): IDisposable;
}