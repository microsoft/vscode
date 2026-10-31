/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { IRange, Range } from '../../../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { getCommandArgumentHint } from '../../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { getAgentHostCompletionReferenceKindFromValue } from '../../../../common/attachments/chatVariableEntries.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { IChatWidget } from '../../../chat.js';
import { ChatWidget } from '../../chatWidget.js';
import { getInputPlaceholderColor, getRangeForPlaceholder } from './chatInputPlaceholderDecoration.js';
import { registerChatInputReferenceDecorationType } from './chatInputReferenceDecorations.js';

const decorationDescription = 'chat';
const commandArgumentHintDecorationType = 'chat-command-argument-hint';
const localCommandPrefixDecorationType = 'chat-local-command-prefix';

interface ILocalCommandArgumentHint {
	readonly sessionResource: URI;
	readonly model: ITextModel;
	readonly range: Range;
	readonly prefix: string;
	readonly argumentHint: string;
}

/**
 * Renders hints for accepted Agent Host commands and skills, plus presentation-only hints and styling for local command prefixes.
 *
 * Reads the accepted references directly from {@link ChatDynamicVariableModel}
 * rather than the parsed input, because the chat request parser resolves a
 * leading `/command` as a slash-prompt part (which carries no `_meta`) before
 * dynamic-variable parsing runs.
 */
export class InputEditorCommandArgumentHint extends Disposable {

	public static readonly ID = 'inputEditorCommandArgumentHint';

	public readonly id = InputEditorCommandArgumentHint.ID;

	private readonly _editorListeners = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * Subscription to {@link ChatDynamicVariableModel.onDidChangeReferences}.
	 * Established lazily because that contribution may be constructed after this
	 * one; accepting a completion adds the reference via a command that runs
	 * after the insert, and it does not change the parsed input, so neither
	 * `onDidChangeModelContent` nor `onDidChangeParsedInput` re-fires with the
	 * reference present — this event is what triggers the hint on accept.
	 */
	private readonly _referencesListener = this._register(new MutableDisposable());
	private editor: ICodeEditor | undefined;
	private localHint: ILocalCommandArgumentHint | undefined;

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();

		this._register(this.codeEditorService.registerDecorationType(decorationDescription, commandArgumentHintDecorationType, {}));
		this._register(registerChatInputReferenceDecorationType(this.codeEditorService, localCommandPrefixDecorationType));
		this._register(this.widget.onDidChangeParsedInput(() => this.update()));
		this._register(this.widget.onDidChangeViewModel(() => this.clearLocalHint()));
		this._register(this.widget.onDidChangeActiveInputEditor(() => {
			this.localHint = undefined;
			this.rebindEditor();
		}));
		this.rebindEditor();
	}

	override dispose(): void {
		this.clearDecorations(this.editor);
		super.dispose();
	}

	showLocalHint(sessionResource: URI, model: ITextModel, range: IRange, prefix: string, argumentHint: string): void {
		const editor = this.editor;
		const widgetSessionResource = this.widget.viewModel?.model.sessionResource;
		if (!editor || editor.getModel() !== model || !widgetSessionResource || !isEqual(widgetSessionResource, sessionResource)) {
			return;
		}

		this.localHint = {
			sessionResource,
			model,
			range: Range.lift(range),
			prefix,
			argumentHint,
		};
		this.update();
	}

	private rebindEditor(): void {
		this.clearDecorations(this.editor);
		this.editor = this.widget.inputEditor;
		const editorListeners = new DisposableStore();
		this._editorListeners.value = editorListeners;
		editorListeners.add(this.editor.onDidChangeModelContent(e => {
			if (e.isFlush || e.changes.some(change => this.doesChangeTouchLocalHint(change.range))) {
				this.localHint = undefined;
			}
			this.update();
		}));
		editorListeners.add(this.editor.onDidChangeModel(() => {
			this.localHint = undefined;
			this.update();
		}));
		this.update();
	}

	private clearLocalHint(): void {
		this.localHint = undefined;
		this.update();
	}

	private update(): void {
		this._ensureSubscribedToReferences();
		const editor = this.editor;
		if (!editor || !editor.hasModel()) {
			return;
		}

		const decoration = this.getArgumentHintDecoration(editor.getModel()!);
		editor.setDecorationsByType(decorationDescription, commandArgumentHintDecorationType, decoration ? [decoration] : []);
		editor.setDecorationsByType(decorationDescription, localCommandPrefixDecorationType, this.localHint ? [{ range: this.localHint.range }] : []);
	}

	private clearDecorations(editor: ICodeEditor | undefined): void {
		if (editor?.hasModel()) {
			editor.setDecorationsByType(decorationDescription, commandArgumentHintDecorationType, []);
			editor.setDecorationsByType(decorationDescription, localCommandPrefixDecorationType, []);
		}
	}

	private doesChangeTouchLocalHint(range: IRange): boolean {
		const localHint = this.localHint;
		return !!localHint && Range.intersectRanges(range, localHint.range) !== null;
	}

	private _ensureSubscribedToReferences(): void {
		if (this._referencesListener.value) {
			return;
		}
		const dynamicVariableModel = this.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (dynamicVariableModel) {
			this._referencesListener.value = dynamicVariableModel.onDidChangeReferences(() => this.update());
		}
	}

	private getArgumentHintDecoration(model: ITextModel): IDecorationOptions | undefined {
		const localHint = this.localHint;
		if (localHint) {
			const localDecoration = this.getLocalHintDecoration(model, localHint);
			if (localDecoration === undefined && this.localHint === localHint) {
				return undefined;
			}
			if (localDecoration) {
				return localDecoration;
			}
		}

		const dynamicVariableModel = this.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!dynamicVariableModel) {
			return undefined;
		}

		// Find an agent-host command or skill reference that carries an argument hint.
		for (const ref of dynamicVariableModel.variables) {
			if (getAgentHostCompletionReferenceKindFromValue(ref.data) === undefined) {
				continue;
			}
			const argumentHint = getCommandArgumentHint(ref._meta);
			if (!argumentHint) {
				continue;
			}

			// Only show the hint while the command is the sole content followed by exactly
			// one trailing space (i.e. no argument has been typed yet).
			if (!this.isCommandOnlyContent(model, ref.range)) {
				return undefined;
			}

			return this.createDecoration(ref.range, argumentHint);
		}

		return undefined;
	}

	private getLocalHintDecoration(model: ITextModel, hint: ILocalCommandArgumentHint): IDecorationOptions | undefined {
		const sessionResource = this.widget.viewModel?.model.sessionResource;
		if (model !== hint.model || !sessionResource || !isEqual(sessionResource, hint.sessionResource) || model.getValueInRange(hint.range) !== hint.prefix) {
			this.localHint = undefined;
			return undefined;
		}

		const beforeRange = new Range(1, 1, hint.range.startLineNumber, hint.range.startColumn);
		if (model.getValueInRange(beforeRange).trim().length > 0) {
			this.localHint = undefined;
			return undefined;
		}

		const fullRange = model.getFullModelRange();
		const afterRange = new Range(hint.range.endLineNumber, hint.range.endColumn, fullRange.endLineNumber, fullRange.endColumn);
		const textAfterPrefix = model.getValueInRange(afterRange);
		if (!textAfterPrefix.startsWith(' ')) {
			this.localHint = undefined;
			return undefined;
		}

		return textAfterPrefix === ' ' ? this.createDecoration(hint.range, hint.argumentHint) : undefined;
	}

	private createDecoration(range: IRange, argumentHint: string): IDecorationOptions {
		return {
			range: getRangeForPlaceholder(range),
			renderOptions: {
				after: {
					contentText: argumentHint,
					color: getInputPlaceholderColor(this.themeService),
				}
			}
		};
	}

	private isCommandOnlyContent(model: ITextModel, range: IRange): boolean {
		// Nothing meaningful before the command reference.
		const beforeRange = new Range(1, 1, range.startLineNumber, range.startColumn);
		if (model.getValueInRange(beforeRange).trim().length > 0) {
			return false;
		}

		// Exactly one space after the command reference and nothing else.
		const fullRange = model.getFullModelRange();
		const afterRange = new Range(range.endLineNumber, range.endColumn, fullRange.endLineNumber, fullRange.endColumn);
		return model.getValueInRange(afterRange) === ' ';
	}
}

ChatWidget.CONTRIBS.push(InputEditorCommandArgumentHint);
