/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';
import { IViewLayout, IViewModel } from 'vs/editor/common/viewModel';
import { IColorTheme } from 'vs/platform/theme/common/themeService';
import { EditorTheme } from 'vs/editor/common/editorTheme';

export class ViewContext {

	public readonly configuration: IEditorConfiguration;
	public readonly viewModel: IViewModel;
	public readonly viewLayout: IViewLayout;
	public readonly theme: EditorTheme;

	constructor(
		configuration: IEditorConfiguration,
		theme: IColorTheme,
		model: IViewModel
	) {
		this.configuration = configuration;
		this.theme = new EditorTheme(theme);
		this.viewModel = model;
		this.viewLayout = model.viewLayout;
	}

	public addEventHandler(eventHandler: ViewEventHandler): void {
		this.viewModel.addViewEventHandler(eventHandler);
	}

	public removeEventHandler(eventHandler: ViewEventHandler): void {
		this.viewModel.removeViewEventHandler(eventHandler);
	}
}
