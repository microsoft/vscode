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
	readonly uri: URI;
	readonly resourceGroupId: string;
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

	commit(message: string): TPromise<void>;
	open(uri: ISCMResource): TPromise<void>;
	drag(from: ISCMResource, to: ISCMResource): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface ISCMService {

	readonly _serviceBrand: any;
	readonly activeProvider: ISCMProvider | undefined;
	readonly onDidChangeProvider: Event<ISCMProvider>;

	registerSCMProvider(provider: ISCMProvider): IDisposable;
}