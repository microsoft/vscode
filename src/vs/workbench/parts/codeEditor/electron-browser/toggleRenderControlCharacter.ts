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
export class ToggleRenderControlCharacterAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderControlCharacter',
			label: nls.localize('toggleRenderControlCharacters', "View: Toggle Control Characters"),
			alias: 'View: Toggle Control Characters',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const configurationEditingService = accessor.get(IConfigurationEditingService);

		let newRenderControlCharacters = !editor.getConfiguration().viewInfo.renderControlCharacters;

		configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'editor.renderControlCharacters', value: newRenderControlCharacters });
	}
}
