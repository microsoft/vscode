/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

@editorAction
export class ToggleRenderControlCharacterAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderControlCharacter',
			label: nls.localize('toggleRenderControlCharacters', "Toggle Control Characters"),
			alias: 'Toggle Render Control Characters',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const configurationEditingService = accessor.get(IConfigurationEditingService);
		const messageService = accessor.get(IMessageService);

		let newRenderControlCharacters = !editor.getConfiguration().viewInfo.renderControlCharacters;

		configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'editor.renderControlCharacters', value: newRenderControlCharacters }).then(null, error => {
			messageService.show(Severity.Error, error);
		});
	}
}
