/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { registerEditorAction, EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneThemeService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

class ToggleHighContrast extends EditorAction {

	private _originalThemeName: string;

	constructor() {
		super({
			id: 'editor.action.toggleHighContrast',
			label: nls.localize('toggleHighContrast', "Toggle High Contrast Theme"),
			alias: 'Toggle High Contrast Theme',
			precondition: null
		});
		this._originalThemeName = null;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const standaloneThemeService = accessor.get(IStandaloneThemeService);
		if (this._originalThemeName) {
			// We must toggle back to the integrator's theme
			standaloneThemeService.setTheme(this._originalThemeName);
			this._originalThemeName = null;
		} else {
			this._originalThemeName = standaloneThemeService.getTheme().themeName;
			standaloneThemeService.setTheme('hc-black');
		}
	}
}

registerEditorAction(ToggleHighContrast);
