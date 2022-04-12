/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneTheme';
import { ToggleHighContrastNLS } from 'vs/editor/common/standaloneStrings';

class ToggleHighContrast extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleHighContrast',
			label: ToggleHighContrastNLS.toggleHighContrast,
			alias: 'Toggle High Contrast Theme',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const standaloneThemeService = accessor.get(IStandaloneThemeService);
		standaloneThemeService.setForceHighContrast(!standaloneThemeService.isHighContrastEnabled());
	}
}

registerEditorAction(ToggleHighContrast);
