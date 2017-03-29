/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeEditor';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor, IEditorContribution, InternalEditorOptions } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';

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
		const editorConfiguration = editor.getConfiguration();
		if (editorConfiguration.wrappingInfo.inDiffEditor) {
			// Cannot change wrapping settings inside the diff editor
			const messageService = accessor.get(IMessageService);
			messageService.show(Severity.Info, nls.localize('wordWrap.notInDiffEditor', "Cannot toggle word wrap in a diff editor."));
			return;
		}

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

			const actualWrappingInfo = editor.getConfiguration().wrappingInfo;

			if (actualWrappingInfo.isWordWrapMinified) {
				// => wrapping due to minified file
				editor.updateOptions({
					wordWrap: 'off',
					wordWrapMinified: false
				});
			} else if (configuredWordWrap !== 'off') {
				// => wrapping is configured to be on (or some variant)
				editor.updateOptions({
					wordWrap: 'off',
					wordWrapMinified: false
				});
			} else {
				// => wrapping is configured to be off
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

@commonEditorContribution
class ToggleWordWrapController extends Disposable implements IEditorContribution {

	private static _ID = 'editor.contrib.toggleWordWrapController';

	constructor(
		private readonly editor: ICommonCodeEditor,
		@IContextKeyService readonly contextKeyService: IContextKeyService
	) {
		super();

		const configuration = this.editor.getConfiguration();
		const isWordWrapMinified = this.contextKeyService.createKey('isWordWrapMinified', this._isWordWrapMinified(configuration));
		const isDominatedByLongLines = this.contextKeyService.createKey('isDominatedByLongLines', this._isDominatedByLongLines(configuration));
		const inDiffEditor = this.contextKeyService.createKey('inDiffEditor', this._inDiffEditor(configuration));

		this._register(editor.onDidChangeConfiguration((e) => {
			if (!e.wrappingInfo) {
				return;
			}
			const configuration = this.editor.getConfiguration();
			isWordWrapMinified.set(this._isWordWrapMinified(configuration));
			isDominatedByLongLines.set(this._isDominatedByLongLines(configuration));
			inDiffEditor.set(this._inDiffEditor(configuration));
		}));
	}

	private _isWordWrapMinified(config: InternalEditorOptions): boolean {
		return config.wrappingInfo.isWordWrapMinified;
	}

	private _isDominatedByLongLines(config: InternalEditorOptions): boolean {
		return config.wrappingInfo.isDominatedByLongLines;
	}

	private _inDiffEditor(config: InternalEditorOptions): boolean {
		return config.wrappingInfo.inDiffEditor;
	}

	public getId(): string {
		return ToggleWordWrapController._ID;
	}
}

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: 'editor.action.toggleWordWrap',
		title: nls.localize('unwrapMinified', "Disable wrapping for this file"),
		iconClass: 'toggle-word-wrap-action'
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.not('inDiffEditor'),
		ContextKeyExpr.has('isDominatedByLongLines'),
		ContextKeyExpr.has('isWordWrapMinified')
	)
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: 'editor.action.toggleWordWrap',
		title: nls.localize('wrapMinified', "Enable wrapping for this file"),
		iconClass: 'toggle-word-wrap-action'
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.not('inDiffEditor'),
		ContextKeyExpr.has('isDominatedByLongLines'),
		ContextKeyExpr.not('isWordWrapMinified')
	)
});
