/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {EventProvider} from 'vs/base/common/eventProvider';
import URI from 'vs/base/common/uri';
import {URL} from 'vs/base/common/network';

export var IModelService = createDecorator<IModelService>('modelService');

export interface IModelService {
	serviceId: ServiceIdentifier<any>;

	createModel(value:string, modeOrPromise:TPromise<Modes.IMode>|Modes.IMode, resource: URL): EditorCommon.IModel;

	destroyModel(resource: URL): void;

	getModels(): EditorCommon.IModel[];

	getModel(resource: URI): EditorCommon.IModel;

	onModelAdded: EventProvider<(model: EditorCommon.IModel) => void>;

	onModelRemoved: EventProvider<(model: EditorCommon.IModel) => void>;

	onModelModeChanged: EventProvider<(model: EditorCommon.IModel, oldModeId:string) => void>;
}

