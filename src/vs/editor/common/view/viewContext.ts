/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IConfiguration } from 'vs/editor/common/editorCommon';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { ViewEventDispatcher } from 'vs/editor/common/view/viewEventDispatcher';

export class ViewContext {

	public readonly configuration: IConfiguration;
	public readonly model: IViewModel;
	public readonly privateViewEventBus: ViewEventDispatcher;

	constructor(
		configuration: IConfiguration,
		model: IViewModel,
		privateViewEventBus: ViewEventDispatcher
	) {
		this.configuration = configuration;
		this.model = model;
		this.privateViewEventBus = privateViewEventBus;
	}

	public addEventHandler(eventHandler: ViewEventHandler): void {
		this.privateViewEventBus.addEventHandler(eventHandler);
	}

	public removeEventHandler(eventHandler: ViewEventHandler): void {
		this.privateViewEventBus.removeEventHandler(eventHandler);
	}
}
