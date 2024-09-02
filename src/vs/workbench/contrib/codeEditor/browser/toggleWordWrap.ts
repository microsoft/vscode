/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor, ICodeEditor, IDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, ServicesAccessor, registerDiffEditorContribution, registerEditorAction, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IDiffEditorContribution, IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ITextModel } from '../../../../editor/common/model.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

const transientWordWrapState = 'transientWordWrapState';
const isWordWrapMinifiedKey = 'isWordWrapMinified';
const isDominatedByLongLinesKey = 'isDominatedByLongLines';
const CAN_TOGGLE_WORD_WRAP = new RawContextKey<boolean>('canToggleWordWrap', false, true);
const EDITOR_WORD_WRAP = new RawContextKey<boolean>('editorWordWrap', false, nls.localize('editorWordWrap', 'Whether the editor is currently using word wrapping.'));

/**
 * State written/read by the toggle word wrap action and associated with a particular model.
 */
export interface IWordWrapTransientState {
	readonly wordWrapOverride: 'on' | 'off';
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
export function readTransientState(model: ITextModel, codeEditorService: ICodeEditorService): IWordWrapTransientState | null {
	return codeEditorService.getTransientModelProperty(model, transientWordWrapState);
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
				primary: KeyMod.Alt | KeyCode.KeyZ,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const codeEditorService = accessor.get(ICodeEditorService);

		if (!canToggleWordWrap(codeEditorService, editor)) {
			return;
		}

		const model = editor.getModel();

		// Read the current state
		const transientState = readTransientState(model, codeEditorService);

		// Compute the new state
		let newState: IWordWrapTransientState | null;
		if (transientState) {
			newState = null;
		} else {
			const actualWrappingInfo = editor.getOption(EditorOption.wrappingInfo);
			const wordWrapOverride = (actualWrappingInfo.wrappingColumn === -1 ? 'on' : 'off');
			newState = { wordWrapOverride };
		}

		// Write the new state
		// (this will cause an event and the controller will apply the state)
		writeTransientState(model, newState, codeEditorService);

		// if we are in a diff editor, update the other editor (if possible)
		const diffEditor = findDiffEditorContainingCodeEditor(editor, codeEditorService);
		if (diffEditor) {
			const originalEditor = diffEditor.getOriginalEditor();
			const modifiedEditor = diffEditor.getModifiedEditor();
			const otherEditor = (originalEditor === editor ? modifiedEditor : originalEditor);
			if (canToggleWordWrap(codeEditorService, otherEditor)) {
				writeTransientState(otherEditor.getModel(), newState, codeEditorService);
				diffEditor.updateOptions({});
			}
		}
	}
}

/**
 * If `editor` is the original or modified editor of a diff editor, it returns it.
 * It returns null otherwise.
 */
function findDiffEditorContainingCodeEditor(editor: ICodeEditor, codeEditorService: ICodeEditorService): IDiffEditor | null {
	if (!editor.getOption(EditorOption.inDiffEditor)) {
		return null;
	}
	for (const diffEditor of codeEditorService.listDiffEditors()) {
		const originalEditor = diffEditor.getOriginalEditor();
		const modifiedEditor = diffEditor.getModifiedEditor();
		if (originalEditor === editor || modifiedEditor === editor) {
			return diffEditor;
		}
	}
	return null;
}

class ToggleWordWrapController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.toggleWordWrapController';

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		const options = this._editor.getOptions();
		const wrappingInfo = options.get(EditorOption.wrappingInfo);
		const isWordWrapMinified = this._contextKeyService.createKey(isWordWrapMinifiedKey, wrappingInfo.isWordWrapMinified);
		const isDominatedByLongLines = this._contextKeyService.createKey(isDominatedByLongLinesKey, wrappingInfo.isDominatedByLongLines);
		let currentlyApplyingEditorConfig = false;

		this._register(_editor.onDidChangeConfiguration((e) => {
			if (!e.hasChanged(EditorOption.wrappingInfo)) {
				return;
			}
			const options = this._editor.getOptions();
			const wrappingInfo = options.get(EditorOption.wrappingInfo);
			isWordWrapMinified.set(wrappingInfo.isWordWrapMinified);
			isDominatedByLongLines.set(wrappingInfo.isDominatedByLongLines);
			if (!currentlyApplyingEditorConfig) {
				// I am not the cause of the word wrap getting changed
				ensureWordWrapSettings();
			}
		}));

		this._register(_editor.onDidChangeModel((e) => {
			ensureWordWrapSettings();
		}));

		this._register(_codeEditorService.onDidChangeTransientModelProperty(() => {
			ensureWordWrapSettings();
		}));

		const ensureWordWrapSettings = () => {
			if (!canToggleWordWrap(this._codeEditorService, this._editor)) {
				return;
			}

			const transientState = readTransientState(this._editor.getModel(), this._codeEditorService);

			// Apply the state
			try {
				currentlyApplyingEditorConfig = true;
				this._applyWordWrapState(transientState);
			} finally {
				currentlyApplyingEditorConfig = false;
			}
		};
	}

	private _applyWordWrapState(state: IWordWrapTransientState | null): void {
		const wordWrapOverride2 = state ? state.wordWrapOverride : 'inherit';
		this._editor.updateOptions({
			wordWrapOverride2: wordWrapOverride2
		});
	}
}

class DiffToggleWordWrapController extends Disposable implements IDiffEditorContribution {

	public static readonly ID = 'diffeditor.contrib.toggleWordWrapController';

	constructor(
		private readonly _diffEditor: IDiffEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		this._register(this._diffEditor.onDidChangeModel(() => {
			this._ensureSyncedWordWrapToggle();
		}));
	}

	private _ensureSyncedWordWrapToggle(): void {
		const originalEditor = this._diffEditor.getOriginalEditor();
		const modifiedEditor = this._diffEditor.getModifiedEditor();

		if (!originalEditor.hasModel() || !modifiedEditor.hasModel()) {
			return;
		}

		const originalTransientState = readTransientState(originalEditor.getModel(), this._codeEditorService);
		const modifiedTransientState = readTransientState(modifiedEditor.getModel(), this._codeEditorService);

		if (originalTransientState && !modifiedTransientState && canToggleWordWrap(this._codeEditorService, originalEditor)) {
			writeTransientState(modifiedEditor.getModel(), originalTransientState, this._codeEditorService);
			this._diffEditor.updateOptions({});
		}
		if (!originalTransientState && modifiedTransientState && canToggleWordWrap(this._codeEditorService, modifiedEditor)) {
			writeTransientState(originalEditor.getModel(), modifiedTransientState, this._codeEditorService);
			this._diffEditor.updateOptions({});
		}
	}
}

function canToggleWordWrap(codeEditorService: ICodeEditorService, editor: ICodeEditor | null): editor is IActiveCodeEditor {
	if (!editor) {
		return false;
	}
	if (editor.isSimpleWidget) {
		// in a simple widget...
		return false;
	}
	// Ensure correct word wrap settings
	const model = editor.getModel();
	if (!model) {
		return false;
	}
	if (editor.getOption(EditorOption.inDiffEditor)) {
		// this editor belongs to a diff editor
		for (const diffEditor of codeEditorService.listDiffEditors()) {
			if (diffEditor.getOriginalEditor() === editor && !diffEditor.renderSideBySide) {
				// this editor is the left side of an inline diff editor
				return false;
			}
		}
	}

	return true;
}

class EditorWordWrapContextKeyTracker extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorWordWrapContextKeyTracker';

	private readonly _canToggleWordWrap: IContextKey<boolean>;
	private readonly _editorWordWrap: IContextKey<boolean>;
	private _activeEditor: ICodeEditor | null;
	private readonly _activeEditorListener: DisposableStore;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IContextKeyService private readonly _contextService: IContextKeyService,
	) {
		super();
		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(addDisposableListener(window, 'focus', () => this._update(), true));
			disposables.add(addDisposableListener(window, 'blur', () => this._update(), true));
		}, { window: mainWindow, disposables: this._store }));
		this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
		this._canToggleWordWrap = CAN_TOGGLE_WORD_WRAP.bindTo(this._contextService);
		this._editorWordWrap = EDITOR_WORD_WRAP.bindTo(this._contextService);
		this._activeEditor = null;
		this._activeEditorListener = new DisposableStore();
		this._update();
	}

	private _update(): void {
		const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
		if (this._activeEditor === activeEditor) {
			// no change
			return;
		}
		this._activeEditorListener.clear();
		this._activeEditor = activeEditor;

		if (activeEditor) {
			this._activeEditorListener.add(activeEditor.onDidChangeModel(() => this._updateFromCodeEditor()));
			this._activeEditorListener.add(activeEditor.onDidChangeConfiguration((e) => {
				if (e.hasChanged(EditorOption.wrappingInfo)) {
					this._updateFromCodeEditor();
				}
			}));
			this._updateFromCodeEditor();
		}
	}

	private _updateFromCodeEditor(): void {
		if (!canToggleWordWrap(this._codeEditorService, this._activeEditor)) {
			return this._setValues(false, false);
		} else {
			const wrappingInfo = this._activeEditor.getOption(EditorOption.wrappingInfo);
			this._setValues(true, wrappingInfo.wrappingColumn !== -1);
		}
	}

	private _setValues(canToggleWordWrap: boolean, isWordWrap: boolean): void {
		this._canToggleWordWrap.set(canToggleWordWrap);
		this._editorWordWrap.set(isWordWrap);
	}
}

registerWorkbenchContribution2(EditorWordWrapContextKeyTracker.ID, EditorWordWrapContextKeyTracker, WorkbenchPhase.AfterRestored);

registerEditorContribution(ToggleWordWrapController.ID, ToggleWordWrapController, EditorContributionInstantiation.Eager); // eager because it needs to change the editor word wrap configuration
registerDiffEditorContribution(DiffToggleWordWrapController.ID, DiffToggleWordWrapController);
registerEditorAction(ToggleWordWrapAction);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize('unwrapMinified', "Disable wrapping for this file"),
		icon: Codicon.wordWrap
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has(isDominatedByLongLinesKey),
		ContextKeyExpr.has(isWordWrapMinifiedKey)
	)
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize('wrapMinified', "Enable wrapping for this file"),
		icon: Codicon.wordWrap
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(
		EditorContextKeys.inDiffEditor.negate(),
		ContextKeyExpr.has(isDominatedByLongLinesKey),
		ContextKeyExpr.not(isWordWrapMinifiedKey)
	)
});


// View menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	command: {
		id: TOGGLE_WORD_WRAP_ID,
		title: nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "&&Word Wrap"),
		toggled: EDITOR_WORD_WRAP,
		precondition: CAN_TOGGLE_WORD_WRAP
	},
	order: 1,
	group: '5_editor'
});
