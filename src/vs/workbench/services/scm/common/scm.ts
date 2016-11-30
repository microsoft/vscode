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
}

export interface ISCMResourceGroup {
	readonly label: string;
	readonly onChange: Event<void>;
	set(...resources: ISCMResource[]): void;
	get(): ISCMResource[];
}

export interface ISCMProvider extends IDisposable {
	readonly id: string;
	readonly onChange: Event<void>;
	readonly resourceGroups: ISCMResourceGroup[];

	commit(message: string): TPromise<void>;
	open(uri: ISCMResource): TPromise<void>;
	drag(from: ISCMResource, to: ISCMResource): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface ISCMService {

	_serviceBrand: any;
	activeProvider: ISCMProvider | undefined;
	onDidChangeProvider: Event<ISCMProvider>;

	registerSCMProvider(provider: ISCMProvider): IDisposable;
}