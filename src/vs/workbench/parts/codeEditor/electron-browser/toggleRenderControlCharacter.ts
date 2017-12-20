/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { registerEditorAction, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class ToggleRenderControlCharacterAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderControlCharacter',
			label: nls.localize('toggleRenderControlCharacters', "View: Toggle Control Characters"),
			alias: 'View: Toggle Control Characters',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const configurationService = accessor.get(IConfigurationService);

		let newRenderControlCharacters = !editor.getConfiguration().viewInfo.renderControlCharacters;

		configurationService.updateValue('editor.renderControlCharacters', newRenderControlCharacters, ConfigurationTarget.USER);
	}
}

registerEditorAction(ToggleRenderControlCharacterAction);
