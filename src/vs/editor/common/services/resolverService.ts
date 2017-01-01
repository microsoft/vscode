/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IModel } from 'vs/editor/common/editorCommon';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { IDisposable, IReference } from 'vs/base/common/lifecycle';

export const ITextModelResolverService = createDecorator<ITextModelResolverService>('textModelResolverService');

export interface ITextModelResolverService {
	_serviceBrand: any;

	/**
	 * Provided a resource URI, it will return a model reference
	 * which should be disposed once not needed anymore.
	 */
	createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>>;

	/**
	 * Registers a specific `scheme` content provider.
	 */
	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable;
}

export interface ITextModelContentProvider {

	/**
	 * Given a resource, return the content of the resource as IModel.
	 */
	provideTextContent(resource: URI): TPromise<IModel>;
}

export interface ITextEditorModel extends IEditorModel {

	/**
	 * Provides access to the underlying IModel.
	 */
	textEditorModel: IModel;
}