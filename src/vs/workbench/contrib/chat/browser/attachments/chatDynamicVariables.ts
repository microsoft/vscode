/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, dispose, isDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { Command, isLocation } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelContentChange } from '../../../../../editor/common/model/mirrorTextModel.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestVariableValue, IDynamicVariable, toAttachedContextDynamicVariable } from '../../common/attachments/chatVariables.js';
import { IChatWidget } from '../chat.js';
import { IChatWidgetContrib } from '../widget/chatWidget.js';

export const dynamicVariableDecorationType = 'chat-dynamic-variable';

const issueIconCharacter = '\ueb0c';
const pullRequestIconCharacter = '\uea64';

/** Editor and attachment surface required by the shared inline-reference model. */
export interface IChatDynamicVariableModelHost {
	readonly inputEditor: ICodeEditor;
	readonly attachments: readonly IChatRequestVariableEntry[];
	readonly onDidChangeActiveInputEditor: Event<void>;
	readonly onDidChangeAttachments: Event<unknown>;
	refreshParsedInput(): void;
}

export class ChatDynamicVariableModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicVariableModel';

	private _variables: IDynamicVariable[] = [];

	private readonly _onDidChangeReferences = this._register(new Emitter<void>());
	/**
	 * Fires whenever the set of dynamic-variable references changes (added,
	 * removed, moved, or restored). Consumers that render UI derived from the
	 * references should listen to this instead of relying on
	 * `onDidChangeParsedInput`, which does not fire when a reference is added
	 * without changing the parsed request (e.g. a `/command` reference that the
	 * parser resolves as a slash-prompt part).
	 */
	readonly onDidChangeReferences: Event<void> = this._onDidChangeReferences.event;

	get variables(): ReadonlyArray<IDynamicVariable> {
		return [...this._variables];
	}

	get id() {
		return ChatDynamicVariableModel.ID;
	}

	private decorationData: { id: string; text: string; rangeOffset: number; rangeLength: number; expectedRangeOffset?: number }[] = [];

	private readonly _editorListener = this._register(new MutableDisposable());
	private readonly host: IChatDynamicVariableModelHost;

	constructor(
		widgetOrHost: IChatWidget | IChatDynamicVariableModelHost,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this.host = isDynamicVariableModelHost(widgetOrHost) ? widgetOrHost : {
			get inputEditor() { return widgetOrHost.inputEditor; },
			get attachments() { return widgetOrHost.input.attachmentModel.attachments; },
			onDidChangeActiveInputEditor: widgetOrHost.onDidChangeActiveInputEditor,
			onDidChangeAttachments: widgetOrHost.input.attachmentModel.onDidChange,
			refreshParsedInput: () => widgetOrHost.refreshParsedInput(),
		};

		this._subscribeToEditor();
		this._register(this.host.onDidChangeActiveInputEditor(() => {
			this._subscribeToEditor();
			this.updateDecorations();
		}));
		this._register(this.host.onDidChangeAttachments(() => this.updateDecorations()));
	}

	private _subscribeToEditor(): void {
		this._editorListener.value = this.host.inputEditor.onDidChangeModelContent(e => {

			const removed: IDynamicVariable[] = [];
			let didChange = false;

			// Don't mutate entries in _variables, since they will be returned from the getter
			this._variables = coalesce(this._variables.map((ref, idx): IDynamicVariable | null => {
				const model = this.host.inputEditor.getModel();

				if (!model) {
					removed.push(ref);
					return null;
				}

				const data = this.decorationData[idx];
				if (!data) {
					removed.push(ref);
					return null;
				}
				const newRange = model.getDecorationRange(data.id);

				if (!newRange) {
					// gone
					removed.push(ref);
					return null;
				}

				const newText = model.getValueInRange(newRange);
				if (newText !== data.text) {
					const replacement = e.changes.find(change =>
						change.rangeOffset <= data.rangeOffset
						&& change.rangeOffset + change.rangeLength >= data.rangeOffset + data.rangeLength
					);
					const preservedRange = replacement && this.findReferenceRangeInReplacement(model, e.changes, replacement, data);
					if (preservedRange) {
						didChange = true;
						return { ...ref, range: preservedRange };
					}

					if (!replacement) {
						this.host.inputEditor.executeEdits(this.id, [{
							range: newRange,
							text: '',
						}]);
						this.host.refreshParsedInput();
					}

					removed.push(ref);
					return null;
				}

				if (newRange.equalsRange(ref.range)) {
					// all good
					return ref;
				}

				didChange = true;

				return { ...ref, range: newRange };
			}));

			// cleanup disposable variables
			dispose(removed.filter(isDisposable));

			if (didChange || removed.length > 0) {
				this.host.refreshParsedInput();
				this._onDidChangeReferences.fire();
			}

			this.updateDecorations();
		});
	}

	private findReferenceRangeInReplacement(
		model: ITextModel,
		changes: readonly IModelContentChange[],
		replacement: IModelContentChange,
		data: { text: string; rangeOffset: number; rangeLength: number; expectedRangeOffset?: number }
	): Range | undefined {
		if (!data.text) {
			return undefined;
		}

		const previousRelativeOffset = (data.expectedRangeOffset ?? data.rangeOffset) - replacement.rangeOffset;
		let matchOffset = replacement.text.indexOf(data.text);
		let closestMatchOffset = matchOffset;
		while (matchOffset !== -1) {
			if (Math.abs(matchOffset - previousRelativeOffset) < Math.abs(closestMatchOffset - previousRelativeOffset)) {
				closestMatchOffset = matchOffset;
			}
			matchOffset = replacement.text.indexOf(data.text, matchOffset + data.text.length);
		}

		if (closestMatchOffset === -1) {
			return undefined;
		}

		const precedingChangesDelta = changes.reduce((delta, change) =>
			change.rangeOffset < replacement.rangeOffset ? delta + change.text.length - change.rangeLength : delta, 0);
		const startOffset = replacement.rangeOffset + precedingChangesDelta + closestMatchOffset;
		const range = Range.fromPositions(
			model.getPositionAt(startOffset),
			model.getPositionAt(startOffset + data.text.length)
		);
		return model.getValueInRange(range) === data.text ? range : undefined;
	}

	getInputState(contrib: Record<string, unknown>): void {
		contrib[ChatDynamicVariableModel.ID] = [...this._variables];
	}

	setInputState(contrib: Readonly<Record<string, unknown>>): void {
		let s = contrib[ChatDynamicVariableModel.ID] as unknown[];
		if (!Array.isArray(s)) {
			s = [];
		}

		this.disposeVariables();
		this._variables = [];

		for (const variable of s) {
			if (!isDynamicVariable(variable)) {
				continue;
			}

			this.addReference(variable);
		}
	}

	addReference(ref: IDynamicVariable, expectedText?: string, expectedRangeOffset?: number): void {
		if (!isValidEditorRange(ref.range)) {
			return;
		}

		const existingAttachment = this.host.attachments.find(attachment => attachment.id === ref.id && !attachment.range);
		if (existingAttachment) {
			ref = toAttachedContextDynamicVariable(existingAttachment, ref.range);
		}

		this._variables.push(ref);
		this.updateDecorations();
		if (expectedText !== undefined || expectedRangeOffset !== undefined) {
			const addedDecoration = this.decorationData[this._variables.length - 1];
			if (addedDecoration) {
				addedDecoration.text = expectedText ?? addedDecoration.text;
				addedDecoration.expectedRangeOffset = expectedRangeOffset;
			}
		}
		this.host.refreshParsedInput();
		this._onDidChangeReferences.fire();
	}

	removeReference(reference: IDynamicVariable): void {
		const index = this._variables.findIndex(variable =>
			variable.id === reference.id && Range.equalsRange(variable.range, reference.range));
		if (index === -1) {
			return;
		}

		const [removed] = this._variables.splice(index, 1);
		if (isDisposable(removed)) {
			removed.dispose();
		}
		this.updateDecorations();
		this.host.refreshParsedInput();
		this._onDidChangeReferences.fire();
	}

	/** Replaces visible reference labels with their agent-facing prompt text. */
	getPromptText(text: string, textOffset = 0): string {
		const model = this.host.inputEditor.getModel();
		if (!model) {
			return text;
		}

		const replacements = this._variables
			.filter((variable): variable is IDynamicVariable & { promptText: string } => typeof variable.promptText === 'string')
			.map(variable => ({
				start: model.getOffsetAt(Range.getStartPosition(variable.range)) - textOffset,
				endExclusive: model.getOffsetAt(Range.getEndPosition(variable.range)) - textOffset,
				text: variable.promptText,
			}))
			.filter(replacement => replacement.start >= 0 && replacement.endExclusive <= text.length)
			.sort((a, b) => b.start - a.start);

		let result = text;
		for (const replacement of replacements) {
			result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.endExclusive);
		}
		return result;
	}

	private updateDecorations(): void {
		const model = this.host.inputEditor.getModel();
		if (!model) {
			this.decorationData = [];
			return;
		}

		const validVariables = this._variables.filter(v => isValidEditorRange(v.range));
		const decorationIds = this.host.inputEditor.setDecorationsByType('chat', dynamicVariableDecorationType, validVariables.map((r): IDecorationOptions => ({
			range: r.range,
			hoverMessage: this.getHoverForReference(r),
			renderOptions: getReferenceIconRenderOptions(r),
		})));

		this._variables = validVariables.slice(0, decorationIds.length);
		this.decorationData = [];
		for (let i = 0; i < decorationIds.length; i++) {
			const range = this._variables[i].range;
			const text = model.getValueInRange(range);
			this.decorationData.push({
				id: decorationIds[i],
				text,
				rangeOffset: model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }),
				rangeLength: text.length,
			});
		}
	}

	private getHoverForReference(ref: IDynamicVariable): IMarkdownString | undefined {
		const attachment = this.host.attachments.find(attachment => attachment.id === ref.id && !attachment.range);
		if (attachment) {
			return isImageVariableEntry(attachment) ? undefined : this.createAttachmentLabelHover(attachment);
		}

		const value = ref.data;
		if (URI.isUri(value)) {
			return new MarkdownString(this.labelService.getUriLabel(value, { relative: true }));
		} else if (isLocation(value)) {
			const prefix = ref.fullName ? ` ${ref.fullName}` : '';
			const rangeString = `#${value.range.startLineNumber}-${value.range.endLineNumber}`;
			return new MarkdownString(prefix + this.labelService.getUriLabel(value.uri, { relative: true }) + rangeString);
		} else {
			return undefined;
		}
	}

	private createAttachmentLabelHover(attachment: IChatRequestVariableEntry): IMarkdownString {
		const resource = IChatRequestVariableEntry.toUri(attachment) ?? attachment.references?.find(reference => URI.isUri(reference.reference))?.reference;
		const label = URI.isUri(resource)
			? this.labelService.getUriLabel(resource, { relative: true })
			: attachment.modelDescription ?? attachment.fullName ?? attachment.name;
		return new MarkdownString().appendText(label);
	}

	/**
	 * Dispose all existing variables.
	 */
	private disposeVariables(): void {
		for (const variable of this._variables) {
			if (isDisposable(variable)) {
				variable.dispose();
			}
		}
	}

	public override dispose() {
		this.disposeVariables();
		super.dispose();
	}
}

function getReferenceIconRenderOptions(reference: IDynamicVariable): IDecorationOptions['renderOptions'] {
	const contentText = reference.icon?.id === Codicon.issues.id
		? issueIconCharacter
		: reference.icon?.id === Codicon.gitPullRequest.id
			? pullRequestIconCharacter
			: undefined;
	return contentText ? {
		before: {
			contentText,
			fontFamily: 'codicon',
			margin: '0 2px 0 0',
			verticalAlign: 'middle',
		},
	} : undefined;
}

/**
 * Loose check to filter objects that are obviously missing data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDynamicVariable(obj: any): obj is IDynamicVariable {
	return obj &&
		typeof obj.id === 'string' &&
		Range.isIRange(obj.range) &&
		isValidEditorRange(obj.range) &&
		'data' in obj;
}

function isValidEditorRange(range: IRange): boolean {
	if (range.startLineNumber < 1 || range.endLineNumber < 1 || range.startColumn < 1 || range.endColumn < 1) {
		return false;
	}

	if (range.startLineNumber > range.endLineNumber) {
		return false;
	}

	if (range.startLineNumber === range.endLineNumber && range.startColumn >= range.endColumn) {
		return false;
	}

	return true;
}

function isDynamicVariableModelHost(source: IChatWidget | IChatDynamicVariableModelHost): source is IChatDynamicVariableModelHost {
	return 'attachments' in source;
}



export interface IAddDynamicVariableContext {
	id: string;
	widget: IChatWidget;
	range: IRange;
	variableData: IChatRequestVariableValue;
	command?: Command;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAddDynamicVariableContext(context: any): context is IAddDynamicVariableContext {
	return 'widget' in context &&
		'range' in context &&
		'variableData' in context;
}

export class AddDynamicVariableAction extends Action2 {
	static readonly ID = 'workbench.action.chat.addDynamicVariable';

	constructor() {
		super({
			id: AddDynamicVariableAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0];
		if (!isAddDynamicVariableContext(context)) {
			return;
		}

		let range = context.range;
		const variableData = context.variableData;

		const doCleanup = () => {
			// Failed, remove the dangling variable prefix
			context.widget.inputEditor.executeEdits('chatInsertDynamicVariableWithArguments', [{ range: context.range, text: `` }]);
		};

		// If this completion item has no command, return it directly
		if (context.command) {
			// Invoke the command on this completion item along with its args and return the result
			const commandService = accessor.get(ICommandService);
			const selection: string | undefined = await commandService.executeCommand(context.command.id, ...(context.command.arguments ?? []));
			if (!selection) {
				doCleanup();
				return;
			}

			// Compute new range and variableData
			const insertText = ':' + selection;
			const insertRange = new Range(range.startLineNumber, range.endColumn, range.endLineNumber, range.endColumn + insertText.length);
			range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + insertText.length);
			const editor = context.widget.inputEditor;
			const success = editor.executeEdits('chatInsertDynamicVariableWithArguments', [{ range: insertRange, text: insertText + ' ' }]);
			if (!success) {
				doCleanup();
				return;
			}
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: context.id,
			range: range,
			isFile: true,
			data: variableData
		});
	}
}
registerAction2(AddDynamicVariableAction);
