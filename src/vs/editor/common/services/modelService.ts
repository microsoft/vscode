/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IModel, ITextModelCreationOptions } from 'vs/editor/common/editorCommon';
import { IMode } from 'vs/editor/common/modes';
import { IRawTextSource } from 'vs/editor/common/model/textSource';

export var IModelService = createDecorator<IModelService>('modelService');

export interface IModelService {
	_serviceBrand: any;

	createModel(value: string | IRawTextSource, modeOrPromise: TPromise<IMode> | IMode, resource: URI): IModel;

	updateModel(model: IModel, value: string | IRawTextSource): void;

	setMode(model: IModel, modeOrPromise: TPromise<IMode> | IMode): void;

	destroyModel(resource: URI): void;

	getModels(): IModel[];

	getCreationOptions(language: string, resource: URI): ITextModelCreationOptions;

	getModel(resource: URI): IModel;

	onModelAdded: Event<IModel>;

	onModelRemoved: Event<IModel>;

	onModelModeChanged: Event<{ model: IModel; oldModeId: string; }>;
}

