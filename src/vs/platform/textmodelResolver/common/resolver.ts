/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IModel } from 'vs/editor/common/editorCommon';
import { ITextEditorModel } from 'vs/platform/editor/common/editor';
import { IDisposable } from 'vs/base/common/lifecycle';

export const ITextModelResolverService = createDecorator<ITextModelResolverService>('textModelResolverService');

export interface ITextModelResolverService {
	_serviceBrand: any;

	resolve(resource: URI): TPromise<ITextEditorModel>;

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable;
}

export interface ITextModelContentProvider {

	provideTextContent(resource: URI): TPromise<IModel>;
}