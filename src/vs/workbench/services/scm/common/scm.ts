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

export interface ISCMResource {
	uri: URI;
}

export interface ISCMResourceGroup {
	onChange: Event<void>;
	set(...resources: ISCMResource[]): void;
	get(): ISCMResource[];
}

export interface ISCMProvider extends IDisposable {
	onChange: Event<void>;
	resourceGroups: ISCMResourceGroup[];

	commit(message: string): TPromise<void>;
	click(uri: URI): TPromise<void>;
	drag(from: URI, to: URI): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface ISCMService {

	_serviceBrand: any;
	activeProvider: ISCMProvider;

	getBaselineResource(resource: URI): TPromise<URI>;
	registerBaselineResourceProvider(provider: IBaselineResourceProvider): IDisposable;
}