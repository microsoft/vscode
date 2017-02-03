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

export interface IBaselineResourceProvider {
	getBaselineResource(resource: URI): TPromise<URI>;
}

export const ISCMService = createDecorator<ISCMService>('scm');

export interface ISCMResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	strikeThrough?: boolean;
}

export interface ISCMResource {
	readonly resourceGroupId: string;
	readonly uri: URI;
	readonly decorations: ISCMResourceDecorations;
}

export interface ISCMResourceGroup {
	readonly id: string;
	readonly label: string;
	readonly resources: ISCMResource[];
}

export interface ISCMProvider extends IDisposable {
	readonly id: string;
	readonly label: string;
	readonly resources: ISCMResourceGroup[];
	readonly onDidChange: Event<ISCMResourceGroup[]>;
	readonly count?: number | undefined;

	open(uri: ISCMResource): TPromise<void>;
	drag(from: ISCMResource, to: ISCMResourceGroup): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface ISCMService {

	readonly _serviceBrand: any;
	readonly onDidChangeProvider: Event<ISCMProvider>;
	readonly providers: ISCMProvider[];
	activeProvider: ISCMProvider | undefined;

	registerSCMProvider(provider: ISCMProvider): IDisposable;
}