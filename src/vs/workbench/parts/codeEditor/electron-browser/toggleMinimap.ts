/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { registerEditorAction, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class ToggleMinimapAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleMinimap',
			label: nls.localize('toggleMinimap', "View: Toggle Minimap"),
			alias: 'View: Toggle Minimap',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const configurationService = accessor.get(IConfigurationService);

		const newValue = !editor.getConfiguration().viewInfo.minimap.enabled;

		configurationService.updateValue('editor.minimap.enabled', newValue, ConfigurationTarget.USER);
	}
}

registerEditorAction(ToggleMinimapAction);
