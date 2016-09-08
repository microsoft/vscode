/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ITokenizedModel} from 'vs/editor/common/editorCommon';

export interface ICompatMirrorModel extends ITokenizedModel {
}

// Resource Service

export let IResourceService = createDecorator<IResourceService>('resourceService');

export interface IResourceService {
	_serviceBrand: any;

	insert(url: URI, element: ICompatMirrorModel): void;
	get(url: URI): ICompatMirrorModel;
	remove(url: URI): void;
}
