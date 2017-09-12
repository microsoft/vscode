/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';

@editorAction
export class ToggleRenderWhitespaceAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderWhitespace',
			label: nls.localize('toggleRenderWhitespace', "View: Toggle Render Whitespace"),
			alias: 'View: Toggle Render Whitespace',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const configurationEditingService = accessor.get(IConfigurationEditingService);

		let renderWhitespace = editor.getConfiguration().viewInfo.renderWhitespace;
		let newRenderWhitespace: string;
		if (renderWhitespace === 'none') {
			newRenderWhitespace = 'all';
		} else {
			newRenderWhitespace = 'none';
		}

		configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'editor.renderWhitespace', value: newRenderWhitespace });
	}
}
