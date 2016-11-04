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

	/**
	 * Given a resource, tries to resolve a ITextEditorModel out of it. Will support many schemes like file://, untitled://,
	 * inMemory:// and for anything else fall back to the model content provider registry.
	 */
	resolve(resource: URI): TPromise<ITextEditorModel>;

	/**
	 * For unknown resources, allows to register a content provider such as this service is able to resolve arbritrary
	 * resources to ITextEditorModels.
	 */
	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable;
}

export interface ITextModelContentProvider {

	/**
	 * Given a resource, return the content of the resource as IModel.
	 */
	provideTextContent(resource: URI): TPromise<IModel>;
}