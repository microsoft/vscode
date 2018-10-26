/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfiguration } from 'vs/editor/common/editorCommon';
import { ViewEventDispatcher } from 'vs/editor/common/view/viewEventDispatcher';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IViewLayout, IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { ITheme } from 'vs/platform/theme/common/themeService';

export class ViewContext {

	public readonly configuration: IConfiguration;
	public readonly model: IViewModel;
	public readonly viewLayout: IViewLayout;
	public readonly privateViewEventBus: ViewEventDispatcher;

	public theme: ITheme; // will be updated

	constructor(
		configuration: IConfiguration,
		theme: ITheme,
		model: IViewModel,
		privateViewEventBus: ViewEventDispatcher
	) {
		this.configuration = configuration;
		this.theme = theme;
		this.model = model;
		this.viewLayout = model.viewLayout;
		this.privateViewEventBus = privateViewEventBus;
	}

	public addEventHandler(eventHandler: ViewEventHandler): void {
		this.privateViewEventBus.addEventHandler(eventHandler);
	}

	public removeEventHandler(eventHandler: ViewEventHandler): void {
		this.privateViewEventBus.removeEventHandler(eventHandler);
	}
}
