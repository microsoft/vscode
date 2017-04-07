/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeEditor';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommonCodeEditor, IEditorContribution, InternalEditorOptions, IModel } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';

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

function readWordWrapState(model: IModel, configurationService: IConfigurationService, codeEditorService: ICodeEditorService): IWordWrapState {
	const _configuredWordWrap = configurationService.lookup<'on' | 'off' | 'wordWrapColumn' | 'bounded'>('editor.wordWrap', model.getLanguageIdentifier().language);
	const _configuredWordWrapMinified = configurationService.lookup<boolean>('editor.wordWrapMinified', model.getLanguageIdentifier().language);
	const _transientState = readTransientState(model, codeEditorService);
	return {
		configuredWordWrap: _configuredWordWrap.value,
		configuredWordWrapMinified: (typeof _configuredWordWrapMinified.value === 'undefined' ? DefaultConfig.editor.wordWrapMinified : _configuredWordWrapMinified.value),
		transientState: _transientState
	};
}

function toggleWordWrap(editor: ICommonCodeEditor, state: IWordWrapState): IWordWrapState {
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

function applyWordWrapState(editor: ICommonCodeEditor, state: IWordWrapState): void {
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

		const configurationService = accessor.get(IConfigurationService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const model = editor.getModel();

		if (!canToggleWordWrap(model.uri)) {
			return;
		}

		// Read the current state
		const currentState = readWordWrapState(model, configurationService, codeEditorService);
		// Compute the new state
		const newState = toggleWordWrap(editor, currentState);
		// Write the new state
		writeTransientState(model, newState.transientState, codeEditorService);
		// Apply the new state
		applyWordWrapState(editor, newState);
	}
}

@commonEditorContribution
class ToggleWordWrapController extends Disposable implements IEditorContribution {

	private static _ID = 'editor.contrib.toggleWordWrapController';

	constructor(
		private readonly editor: ICommonCodeEditor,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IConfigurationService readonly configurationService: IConfigurationService,
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
