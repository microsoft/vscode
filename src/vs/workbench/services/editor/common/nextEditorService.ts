/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const INextEditorService = createDecorator<INextEditorService>('nextEditorService');

export interface INextEditorService {
	_serviceBrand: ServiceIdentifier<any>;
}