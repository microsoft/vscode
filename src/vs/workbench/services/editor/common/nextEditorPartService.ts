/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';

export const INextEditorPartService = createDecorator<INextEditorPartService>('nextEditorPartService');

export interface INextEditorPartService {

	_serviceBrand: ServiceIdentifier<any>;

	openEditor(input: EditorInput, options?: EditorOptions): TPromise<void>;
}