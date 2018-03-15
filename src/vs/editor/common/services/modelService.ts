/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Event } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel, ITextModelCreationOptions, ITextBufferFactory } from 'vs/editor/common/model';
import { IMode } from 'vs/editor/common/modes';

export const IModelService = createDecorator<IModelService>('modelService');

export interface IModelService {
	_serviceBrand: any;

	createModel(value: string | ITextBufferFactory, modeOrPromise: TPromise<IMode> | IMode, resource: URI): ITextModel;

	updateModel(model: ITextModel, value: string | ITextBufferFactory): void;

	setMode(model: ITextModel, modeOrPromise: TPromise<IMode> | IMode): void;

	destroyModel(resource: URI): void;

	getModels(): ITextModel[];

	getCreationOptions(language: string, resource: URI): ITextModelCreationOptions;

	getModel(resource: URI): ITextModel;

	onModelAdded: Event<ITextModel>;

	onModelRemoved: Event<ITextModel>;

	onModelModeChanged: Event<{ model: ITextModel; oldModeId: string; }>;
}
