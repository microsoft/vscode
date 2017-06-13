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
export class ToggleURLClickableAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.urlClickable',
			label: nls.localize('toggleURLClickable', "Controls whether the editor should underline any URL and make them clickable through CTRL-Left Click"),
			alias: 'Toggle clickable URLs',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const configurationEditingService = accessor.get(IConfigurationEditingService);

		let urlClickable = editor.getConfiguration().urlClickable;
		let newURLClickable: boolean;
		if (urlClickable === true) {
			newURLClickable = false;
		} else {
			newURLClickable = true;
		}

		configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'editor.urlClickable', value: newURLClickable });
	}
}
