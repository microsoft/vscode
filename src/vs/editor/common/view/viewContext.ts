/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IConfiguration, IViewEventBus} from 'vs/editor/common/editorCommon';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IViewModel} from 'vs/editor/common/viewModel/viewModel';

export interface IViewEventHandler {
	handleEvents(events:IEmitterEvent[]): void;
}

export class ViewContext {

	public editorId:number;
	public configuration:IConfiguration;
	public model: IViewModel;
	public privateViewEventBus:IViewEventBus;
	public addEventHandler:(eventHandler:IViewEventHandler)=>void;
	public removeEventHandler:(eventHandler:IViewEventHandler)=>void;

	constructor(
		editorId:number,
		configuration:IConfiguration,
		model: IViewModel,
		privateViewEventBus:IViewEventBus,
		addEventHandler:(eventHandler:IViewEventHandler)=>void,
		removeEventHandler:(eventHandler:IViewEventHandler)=>void
	)
	{
		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this.privateViewEventBus = privateViewEventBus;
		this.addEventHandler = addEventHandler;
		this.removeEventHandler = removeEventHandler;
	}
}
