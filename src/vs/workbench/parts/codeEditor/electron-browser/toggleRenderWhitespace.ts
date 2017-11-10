/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { registerEditorAction, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';

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
		const configurationService = accessor.get(IConfigurationService);

		let renderWhitespace = editor.getConfiguration().viewInfo.renderWhitespace;
		let newRenderWhitespace: string;
		if (renderWhitespace === 'none') {
			newRenderWhitespace = 'all';
		} else {
			newRenderWhitespace = 'none';
		}

		configurationService.updateValue('editor.renderWhitespace', newRenderWhitespace, ConfigurationTarget.USER);
	}
}

registerEditorAction(ToggleRenderWhitespaceAction);
