/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EDITOR_DEFAULTS, InternalEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { DefaultSettingsEditorContribution } from 'vs/workbench/contrib/preferences/browser/preferencesEditor';

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
	readonly configuredWordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded' | undefined;
	readonly configuredWordWrapMinified: boolean;
	readonly transientState: IWordWrapTransientState | null;
}

/**
 * Store (in memory) the word wrap state for a particular model.
 */
export function writeTransientState(model: ITextModel, state: IWordWrapTransientState | null, codeEditorService: ICodeEditorService): void {
	codeEditorService.setTransientModelProperty(model, transientWordWrapState, state);
}

/**
 * Read (in memory) the word wrap state for a particular model.
 */
function readTransientState(model: ITextModel, codeEditorService: ICodeEditorService): IWordWrapTransientState {
	return codeEditorService.getTransientModelProperty(model, transientWordWrapState);
}

function readWordWrapState(model: ITextModel, configurationService: ITextResourceConfigurationService, codeEditorService: ICodeEditorService): IWordWrapState {
	const editorConfig = configurationService.getValue(model.uri, 'editor') as { wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded'; wordWrapMinified: boolean };
	let _configuredWordWrap = editorConfig && (typeof editorConfig.wordWrap === 'string' || typeof editorConfig.wordWrap === 'boolean') ? editorConfig.wordWrap : undefined;

	// Compatibility with old true or false values
	if (<any>_configuredWordWrap === true) {
		_configuredWordWrap = 'on';
	} else if (<any>_configuredWordWrap === false) {
		_configuredWordWrap = 'off';
	}

	const _configuredWordWrapMinified = editorConfig && typeof editorConfig.wordWrapMinified === 'boolean' ? editorConfig.wordWrapMinified : undefined;
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

const TOGGLE_WORD_WRAP_ID = 'editor.action.toggleWordWrap';
class ToggleWordWrapAction extends EditorAction {

	constructor() {
		super({
			id: TOGGLE_WORD_WRAP_ID,
			label: nls.localize('toggle.wordwrap', "View: Toggle Word Wrap"),
			alias: 'View: Toggle Word Wrap',
			precondition: undefined,
			kbOpts: {
				kbExpr: null,
				primary: KeyMod.Alt | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (editor.getContribution(DefaultSettingsEditorContribution.ID)) {
			// in the settings editor...
			return;
		}
		if (!editor.hasModel()) {
			return;
		}
		const editorConfiguration = editor.getConfiguration();
		if (editorConfiguration.wrappingInfo.inDiffEditor) {
			// Cannot change wrapping settings inside the diff editor
			const notificationService = accessor.get(INotificationService);
			notificationService.info(nls.localize('wordWrap.notInDiffEditor', "Cannot toggle word wrap in a diff editor."));
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
		// (this will cause an event and the controller will apply the state)
		writeTransientState(model, newState.transientState, codeEditorService);
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
		let currentlyApplyingEditorConfig = false;

		this._register(editor.onDidChangeConfiguration((e) => {
			if (!e.wrappingInfo) {
				return;
			}
			const configuration = this.editor.getConfiguration();
			isWordWrapMinified.set(this._isWordWrapMinified(configuration));
			isDominatedByLongLines.set(this._isDominatedByLongLines(configuration));
			inDiffEditor.set(this._inDiffEditor(configuration));
			if (!currentlyApplyingEditorConfig) {
				// I am not the cause of the word wrap getting changed
				ensureWordWrapSettings();
			}
		}));

		this._register(editor.onDidChangeModel((e) => {
			ensureWordWrapSettings();
		}));

		this._register(codeEditorService.onDidChangeTransientModelProperty(() => {
			ensureWordWrapSettings();
		}));

		const ensureWordWrapSettings = () => {
			if (this.editor.getContribution(DefaultSettingsEditorContribution.ID)) {
				// in the settings editor...
				return;
			}
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
			try {
				currentlyApplyingEditorConfig = true;
				this._applyWordWrapState(desiredState);
			} finally {
				currentlyApplyingEditorConfig = false;
			}
		};
	}

	private _applyWordWrapState(state: IWordWrapState): void {
		if (state.transientState) {
			// toggle is on
			this.editor.updateOptions({
				wordWrap: state.transientState.forceWordWrap,
				wordWrapMinified: state.transientState.forceWordWrapMinified
			});
			return;
		}

		// toggle is off
		this.editor.updateOptions({
			wordWrap: state.configuredWordWrap,
			wordWrapMinified: state.configuredWordWrapMinified
		});
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
	return (uri.scheme !== 'output');
}


registerEditorContribution(ToggleWordWrapController);

registerEditorAction(ToggleWordWrapAction);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize('unwrapMinified', "Disable wrapping for this file"),
		iconLocation: {
			dark: URI.parse(require.toUrl('vs/workbench/contrib/codeEditor/browser/word-wrap-dark.svg')),
			light: URI.parse(require.toUrl('vs/workbench/contrib/codeEditor/browser/word-wrap-light.svg'))
		}
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
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize('wrapMinified', "Enable wrapping for this file"),
		iconLocation: {
			dark: URI.parse(require.toUrl('vs/workbench/contrib/codeEditor/browser/word-wrap-dark.svg')),
			light: URI.parse(require.toUrl('vs/workbench/contrib/codeEditor/browser/word-wrap-light.svg'))
		}
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.not(inDiffEditorKey),
		ContextKeyExpr.has(isDominatedByLongLinesKey),
		ContextKeyExpr.not(isWordWrapMinifiedKey)
	)
});


// View menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '5_editor',
	command: {
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "Toggle &&Word Wrap")
	},
	order: 1
});
