/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';

@editorAction
class ToggleWordWrapAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleWordWrap',
			label: nls.localize('toggle.wordwrap', "View: Toggle Word Wrap"),
			alias: 'View: Toggle Word Wrap',
			precondition: null,
			kbOpts: {
				kbExpr: null,
				primary: KeyMod.Alt | KeyCode.KEY_Z
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const configurationService = accessor.get(IConfigurationService);
		const model = editor.getModel();

		const _configuredWordWrap = configurationService.lookup<'on' | 'off' | 'wordWrapColumn' | 'bounded'>('editor.wordWrap', model.getLanguageIdentifier().language);
		const _configuredWordWrapMinified = configurationService.lookup<boolean>('editor.wordWrapMinified', model.getLanguageIdentifier().language);

		const configuredWordWrap = _configuredWordWrap.value;
		const configuredWordWrapMinified = (typeof _configuredWordWrapMinified.value === 'undefined' ? DefaultConfig.editor.wordWrapMinified : _configuredWordWrapMinified.value);

		const alreadyToggled = codeEditorService.getTransientModelProperty(model, 'toggleWordWrap');
		if (!alreadyToggled) {
			codeEditorService.setTransientModelProperty(model, 'toggleWordWrap', true);
			if (configuredWordWrap !== 'off') {
				editor.updateOptions({
					wordWrap: 'off',
					wordWrapMinified: false
				});
			} else {
				editor.updateOptions({
					wordWrap: 'on'
				});
			}
		} else {
			codeEditorService.setTransientModelProperty(model, 'toggleWordWrap', false);
			editor.updateOptions({
				wordWrap: configuredWordWrap,
				wordWrapMinified: configuredWordWrapMinified
			});
		}
	}
}
