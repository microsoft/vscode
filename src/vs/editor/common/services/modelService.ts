/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';

export var IModelService = createDecorator<IModelService>('modelService');

export interface IModelService {
	serviceId: ServiceIdentifier<any>;

	createModel(value:string, modeOrPromise:TPromise<Modes.IMode>|Modes.IMode, resource: URI): EditorCommon.IModel;

	destroyModel(resource: URI): void;

	getModels(): EditorCommon.IModel[];

	getModel(resource: URI): EditorCommon.IModel;

	onModelAdded: Event<EditorCommon.IModel>;

	onModelRemoved: Event<EditorCommon.IModel>;

	onModelModeChanged: Event<{ model: EditorCommon.IModel; oldModeId: string; }>;
}

