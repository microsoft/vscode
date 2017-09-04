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
export class ToggleMinimapAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleMinimap',
			label: nls.localize('toggleMinimap', "View: Toggle Minimap"),
			alias: 'View: Toggle Minimap',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const configurationEditingService = accessor.get(IConfigurationEditingService);

		const newValue = !editor.getConfiguration().viewInfo.minimap.enabled;

		configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'editor.minimap.enabled', value: newValue });
	}
}
