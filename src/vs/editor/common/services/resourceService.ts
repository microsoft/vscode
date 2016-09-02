/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IMirrorModel} from 'vs/editor/common/editorCommon';

// Resource Service

export let IResourceService = createDecorator<IResourceService>('resourceService');

export interface IResourceService {
	_serviceBrand: any;

	insert(url: URI, element: IMirrorModel): void;
	get(url: URI): IMirrorModel;
	remove(url: URI): void;
}
