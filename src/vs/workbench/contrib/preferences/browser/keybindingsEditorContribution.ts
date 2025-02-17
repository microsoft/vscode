/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SmartSnippetInserter } from '../common/smartSnippetInserter.js';
import { DefineKeybindingOverlayWidget } from './keybindingWidgets.js';
import { parseTree, Node } from '../../../../base/common/json.js';
import { WindowsNativeResolvedKeybinding } from '../../../services/keybinding/common/windowsKeyboardMapper.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeColor } from '../../../../base/common/themables.js';
import { overviewRulerInfo, overviewRulerError } from '../../../../editor/common/core/editorColorRegistry.js';
import { IModelDeltaDecoration, ITextModel, TrackedRangeStickiness, OverviewRulerLane } from '../../../../editor/common/model.js';
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, IDefineKeybindingEditorContribution } from '../../../services/preferences/common/preferences.js';

const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize('defineKeybinding.kbLayoutErrorMessage', "You won't be able to produce this key combination under your current keyboard layout.");

class DefineKeybindingEditorContribution extends Disposable implements IDefineKeybindingEditorContribution {

	private readonly _keybindingDecorationRenderer = this._register(new MutableDisposable<KeybindingEditorDecorationsRenderer>());

	private readonly _defineWidget: DefineKeybindingOverlayWidget;

	constructor(
		private _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService
	) {
		super();

		this._defineWidget = this._register(this._instantiationService.createInstance(DefineKeybindingOverlayWidget, this._editor));
		this._register(this._editor.onDidChangeModel(e => this._update()));
		this._update();
	}

	private _update(): void {
		this._keybindingDecorationRenderer.value = isInterestingEditorModel(this._editor, this._userDataProfileService)
			// Decorations are shown for the default keybindings.json **and** for the user keybindings.json
			? this._instantiationService.createInstance(KeybindingEditorDecorationsRenderer, this._editor)
			: undefined;
	}

	showDefineKeybindingWidget(): void {
		if (isInterestingEditorModel(this._editor, this._userDataProfileService)) {
			this._defineWidget.start().then(keybinding => this._onAccepted(keybinding));
		}
	}

	private _onAccepted(keybinding: string | null): void {
		this._editor.focus();
		if (keybinding && this._editor.hasModel()) {
			const regexp = new RegExp(/\\/g);
			const backslash = regexp.test(keybinding);
			if (backslash) {
				keybinding = keybinding.slice(0, -1) + '\\\\';
			}
			let snippetText = [
				'{',
				'\t"key": ' + JSON.stringify(keybinding) + ',',
				'\t"command": "${1:commandId}",',
				'\t"when": "${2:editorTextFocus}"',
				'}$0'
			].join('\n');

			const smartInsertInfo = SmartSnippetInserter.insertSnippet(this._editor.getModel(), this._editor.getPosition());
			snippetText = smartInsertInfo.prepend + snippetText + smartInsertInfo.append;
			this._editor.setPosition(smartInsertInfo.position);

			SnippetController2.get(this._editor)?.insert(snippetText, { overwriteBefore: 0, overwriteAfter: 0 });
		}
	}
}

export class KeybindingEditorDecorationsRenderer extends Disposable {

	private _updateDecorations: RunOnceScheduler;
	private readonly _dec = this._editor.createDecorationsCollection();

	constructor(
		private _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._updateDecorations = this._register(new RunOnceScheduler(() => this._updateDecorationsNow(), 500));

		const model = assertIsDefined(this._editor.getModel());
		this._register(model.onDidChangeContent(() => this._updateDecorations.schedule()));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateDecorations.schedule()));
		this._register({
			dispose: () => {
				this._dec.clear();
				this._updateDecorations.cancel();
			}
		});
		this._updateDecorations.schedule();
	}

	private _updateDecorationsNow(): void {
		const model = assertIsDefined(this._editor.getModel());

		const newDecorations: IModelDeltaDecoration[] = [];

		const root = parseTree(model.getValue());
		if (root && Array.isArray(root.children)) {
			for (let i = 0, len = root.children.length; i < len; i++) {
				const entry = root.children[i];
				const dec = this._getDecorationForEntry(model, entry);
				if (dec !== null) {
					newDecorations.push(dec);
				}
			}
		}

		this._dec.set(newDecorations);
	}

	private _getDecorationForEntry(model: ITextModel, entry: Node): IModelDeltaDecoration | null {
		if (!Array.isArray(entry.children)) {
			return null;
		}
		for (let i = 0, len = entry.children.length; i < len; i++) {
			const prop = entry.children[i];
			if (prop.type !== 'property') {
				continue;
			}
			if (!Array.isArray(prop.children) || prop.children.length !== 2) {
				continue;
			}
			const key = prop.children[0];
			if (key.value !== 'key') {
				continue;
			}
			const value = prop.children[1];
			if (value.type !== 'string') {
				continue;
			}

			const resolvedKeybindings = this._keybindingService.resolveUserBinding(value.value);
			if (resolvedKeybindings.length === 0) {
				return this._createDecoration(true, null, null, model, value);
			}
			const resolvedKeybinding = resolvedKeybindings[0];
			let usLabel: string | null = null;
			if (resolvedKeybinding instanceof WindowsNativeResolvedKeybinding) {
				usLabel = resolvedKeybinding.getUSLabel();
			}
			if (!resolvedKeybinding.isWYSIWYG()) {
				const uiLabel = resolvedKeybinding.getLabel();
				if (typeof uiLabel === 'string' && value.value.toLowerCase() === uiLabel.toLowerCase()) {
					// coincidentally, this is actually WYSIWYG
					return null;
				}
				return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
			}
			if (/abnt_|oem_/.test(value.value)) {
				return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
			}
			const expectedUserSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
			if (typeof expectedUserSettingsLabel === 'string' && !KeybindingEditorDecorationsRenderer._userSettingsFuzzyEquals(value.value, expectedUserSettingsLabel)) {
				return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
			}
			return null;
		}
		return null;
	}

	static _userSettingsFuzzyEquals(a: string, b: string): boolean {
		a = a.trim().toLowerCase();
		b = b.trim().toLowerCase();

		if (a === b) {
			return true;
		}

		const aKeybinding = KeybindingParser.parseKeybinding(a);
		const bKeybinding = KeybindingParser.parseKeybinding(b);
		if (aKeybinding === null && bKeybinding === null) {
			return true;
		}
		if (!aKeybinding || !bKeybinding) {
			return false;
		}
		return aKeybinding.equals(bKeybinding);
	}

	private _createDecoration(isError: boolean, uiLabel: string | null, usLabel: string | null, model: ITextModel, keyNode: Node): IModelDeltaDecoration {
		let msg: MarkdownString;
		let className: string;
		let overviewRulerColor: ThemeColor;

		if (isError) {
			// this is the error case
			msg = new MarkdownString().appendText(NLS_KB_LAYOUT_ERROR_MESSAGE);
			className = 'keybindingError';
			overviewRulerColor = themeColorFromId(overviewRulerError);
		} else {
			// this is the info case
			if (usLabel && uiLabel !== usLabel) {
				msg = new MarkdownString(
					nls.localize({
						key: 'defineKeybinding.kbLayoutLocalAndUSMessage',
						comment: [
							'Please translate maintaining the stars (*) around the placeholders such that they will be rendered in bold.',
							'The placeholders will contain a keyboard combination e.g. Ctrl+Shift+/'
						]
					}, "**{0}** for your current keyboard layout (**{1}** for US standard).", uiLabel, usLabel)
				);
			} else {
				msg = new MarkdownString(
					nls.localize({
						key: 'defineKeybinding.kbLayoutLocalMessage',
						comment: [
							'Please translate maintaining the stars (*) around the placeholder such that it will be rendered in bold.',
							'The placeholder will contain a keyboard combination e.g. Ctrl+Shift+/'
						]
					}, "**{0}** for your current keyboard layout.", uiLabel)
				);
			}
			className = 'keybindingInfo';
			overviewRulerColor = themeColorFromId(overviewRulerInfo);
		}

		const startPosition = model.getPositionAt(keyNode.offset);
		const endPosition = model.getPositionAt(keyNode.offset + keyNode.length);
		const range = new Range(
			startPosition.lineNumber, startPosition.column,
			endPosition.lineNumber, endPosition.column
		);

		// icon + highlight + message decoration
		return {
			range: range,
			options: {
				description: 'keybindings-widget',
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: className,
				hoverMessage: msg,
				overviewRuler: {
					color: overviewRulerColor,
					position: OverviewRulerLane.Right
				}
			}
		};
	}

}

function isInterestingEditorModel(editor: ICodeEditor, userDataProfileService: IUserDataProfileService): boolean {
	const model = editor.getModel();
	if (!model) {
		return false;
	}
	return isEqual(model.uri, userDataProfileService.currentProfile.keybindingsResource);
}

registerEditorContribution(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, DefineKeybindingEditorContribution, EditorContributionInstantiation.AfterFirstRender);
