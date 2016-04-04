/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IModel, ITextModelCreationOptions} from 'vs/editor/common/editorCommon';
import {IMode} from 'vs/editor/common/modes';

export var IModelService = createDecorator<IModelService>('modelService');

export interface IModelService {
	serviceId: ServiceIdentifier<any>;

	createModel(value:string, modeOrPromise:TPromise<IMode>|IMode, resource: URI): IModel;

	destroyModel(resource: URI): void;

	getModels(): IModel[];

	getCreationOptions(): ITextModelCreationOptions;

	getModel(resource: URI): IModel;

	onModelAdded: Event<IModel>;

	onModelRemoved: Event<IModel>;

	onModelModeChanged: Event<{ model: IModel; oldModeId: string; }>;
}

