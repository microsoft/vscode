/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeEditor';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IEditorContribution, IModel } from 'vs/editor/common/editorCommon';
import { registerEditorAction, ServicesAccessor, EditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { InternalEditorOptions, EDITOR_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

const transientWordWrapState = 'transientWordWrapState';
const isWordWrapMinifiedKey = 'isWordWrapMinified';
const isDominatedByLongLinesKey = 'isDominatedByLongLines';
const inDiffEditorKey = 'inDiffEditor';

/**
 * State written/read by the toggle word wrap action and associated with a particular model.
 */
interface IWordWrapTransientState {
	readonly forceWordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
	readonly forceWordWrapMinified: boolean;
}

interface IWordWrapState {
	readonly configuredWordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
	readonly configuredWordWrapMinified: boolean;
	readonly transientState: IWordWrapTransientState;
}

/**
 * Store (in memory) the word wrap state for a particular model.
 */
function writeTransientState(model: IModel, state: IWordWrapTransientState, codeEditorService: ICodeEditorService): void {
	codeEditorService.setTransientModelProperty(model, transientWordWrapState, state);
}

/**
 * Read (in memory) the word wrap state for a particular model.
 */
function readTransientState(model: IModel, codeEditorService: ICodeEditorService): IWordWrapTransientState {
	return codeEditorService.getTransientModelProperty(model, transientWordWrapState);
}

function readWordWrapState(model: IModel, configurationService: ITextResourceConfigurationService, codeEditorService: ICodeEditorService): IWordWrapState {
	const editorConfig = configurationService.getValue(model.uri, 'editor') as { wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded'; wordWrapMinified: boolean };
	let _configuredWordWrap = editorConfig && (typeof editorConfig.wordWrap === 'string' || typeof editorConfig.wordWrap === 'boolean') ? editorConfig.wordWrap : void 0;

	// Compatibility with old true or false values
	if (<any>_configuredWordWrap === true) {
		_configuredWordWrap = 'on';
	} else if (<any>_configuredWordWrap === false) {
		_configuredWordWrap = 'off';
	}

	const _configuredWordWrapMinified = editorConfig && typeof editorConfig.wordWrapMinified === 'boolean' ? editorConfig.wordWrapMinified : void 0;
	const _transientState = readTransientState(model, codeEditorService);
	return {
		configuredWordWrap: _configuredWordWrap,
		configuredWordWrapMinified: (typeof _configuredWordWrapMinified === 'boolean' ? _configuredWordWrapMinified : EDITOR_DEFAULTS.wordWrapMinified),
		transientState: _transientState
	};
}

function toggleWordWrap(editor: ICodeEditor, state: IWordWrapState): IWordWrapState {
	if (state.transientState) {
		// toggle off => go to null
		return {
			configuredWordWrap: state.configuredWordWrap,
			configuredWordWrapMinified: state.configuredWordWrapMinified,
			transientState: null
		};
	}

	const config = editor.getConfiguration();
	let transientState: IWordWrapTransientState;

	const actualWrappingInfo = config.wrappingInfo;
	if (actualWrappingInfo.isWordWrapMinified) {
		// => wrapping due to minified file
		transientState = {
			forceWordWrap: 'off',
			forceWordWrapMinified: false
		};
	} else if (state.configuredWordWrap !== 'off') {
		// => wrapping is configured to be on (or some variant)
		transientState = {
			forceWordWrap: 'off',
			forceWordWrapMinified: false
		};
	} else {
		// => wrapping is configured to be off
		transientState = {
			forceWordWrap: 'on',
			forceWordWrapMinified: state.configuredWordWrapMinified
		};
	}

	return {
		configuredWordWrap: state.configuredWordWrap,
		configuredWordWrapMinified: state.configuredWordWrapMinified,
		transientState: transientState
	};
}

function applyWordWrapState(editor: ICodeEditor, state: IWordWrapState): void {
	if (state.transientState) {
		// toggle is on
		editor.updateOptions({
			wordWrap: state.transientState.forceWordWrap,
			wordWrapMinified: state.transientState.forceWordWrapMinified
		});
		return;
	}

	// toggle is off
	editor.updateOptions({
		wordWrap: state.configuredWordWrap,
		wordWrapMinified: state.configuredWordWrapMinified
	});
}

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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const editorConfiguration = editor.getConfiguration();
		if (editorConfiguration.wrappingInfo.inDiffEditor) {
			// Cannot change wrapping settings inside the diff editor
			const messageService = accessor.get(IMessageService);
			messageService.show(Severity.Info, nls.localize('wordWrap.notInDiffEditor', "Cannot toggle word wrap in a diff editor."));
			return;
		}

		const textResourceConfigurationService = accessor.get(ITextResourceConfigurationService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const model = editor.getModel();

		if (!canToggleWordWrap(model.uri)) {
			return;
		}

		// Read the current state
		const currentState = readWordWrapState(model, textResourceConfigurationService, codeEditorService);
		// Compute the new state
		const newState = toggleWordWrap(editor, currentState);
		// Write the new state
		writeTransientState(model, newState.transientState, codeEditorService);
		// Apply the new state
		applyWordWrapState(editor, newState);
	}
}

class ToggleWordWrapController extends Disposable implements IEditorContribution {

	private static readonly _ID = 'editor.contrib.toggleWordWrapController';

	constructor(
		private readonly editor: ICodeEditor,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@ITextResourceConfigurationService readonly configurationService: ITextResourceConfigurationService,
		@ICodeEditorService readonly codeEditorService: ICodeEditorService
	) {
		super();

		const configuration = this.editor.getConfiguration();
		const isWordWrapMinified = this.contextKeyService.createKey(isWordWrapMinifiedKey, this._isWordWrapMinified(configuration));
		const isDominatedByLongLines = this.contextKeyService.createKey(isDominatedByLongLinesKey, this._isDominatedByLongLines(configuration));
		const inDiffEditor = this.contextKeyService.createKey(inDiffEditorKey, this._inDiffEditor(configuration));

		this._register(editor.onDidChangeConfiguration((e) => {
			if (!e.wrappingInfo) {
				return;
			}
			const configuration = this.editor.getConfiguration();
			isWordWrapMinified.set(this._isWordWrapMinified(configuration));
			isDominatedByLongLines.set(this._isDominatedByLongLines(configuration));
			inDiffEditor.set(this._inDiffEditor(configuration));
		}));

		this._register(editor.onDidChangeModel((e) => {
			// Ensure correct word wrap settings
			const newModel = this.editor.getModel();
			if (!newModel) {
				return;
			}

			const configuration = this.editor.getConfiguration();
			if (this._inDiffEditor(configuration)) {
				return;
			}

			if (!canToggleWordWrap(newModel.uri)) {
				return;
			}

			// Read current configured values and toggle state
			const desiredState = readWordWrapState(newModel, this.configurationService, this.codeEditorService);

			// Apply the state
			applyWordWrapState(editor, desiredState);
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

function canToggleWordWrap(uri: URI): boolean {
	if (!uri) {
		return false;
	}
	return (uri.scheme !== 'output' && uri.scheme !== 'vscode');
}


registerEditorContribution(ToggleWordWrapController);

registerEditorAction(ToggleWordWrapAction);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: 'editor.action.toggleWordWrap',
		title: nls.localize('unwrapMinified', "Disable wrapping for this file"),
		iconClass: 'toggle-word-wrap-action'
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.not(inDiffEditorKey),
		ContextKeyExpr.has(isDominatedByLongLinesKey),
		ContextKeyExpr.has(isWordWrapMinifiedKey)
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
		ContextKeyExpr.not(inDiffEditorKey),
		ContextKeyExpr.has(isDominatedByLongLinesKey),
		ContextKeyExpr.not(isWordWrapMinifiedKey)
	)
});
