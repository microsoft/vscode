/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, dispose, isDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { Command, isLocation } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { getImageAttachmentLimit, IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestVariableValue, IDynamicVariable } from '../../common/attachments/chatVariables.js';
import { IChatWidget } from '../chat.js';
import { IChatWidgetContrib } from '../widget/chatWidget.js';

export const dynamicVariableDecorationType = 'chat-dynamic-variable';
export const clickableDynamicVariableDecorationType = 'chat-clickable-dynamic-variable';



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

	private decorationData: { id: string; text: string }[] = [];

	private readonly _editorListener = this._register(new MutableDisposable());

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._subscribeToEditor();
		this._register(widget.onDidChangeActiveInputEditor(() => {
			this._subscribeToEditor();
			this.updateDecorations();
		}));
		const selectedLanguageModel = widget.input?.selectedLanguageModel;
		if (selectedLanguageModel) {
			this._register(autorun(reader => {
				selectedLanguageModel.read(reader);
				this.updateDecorations();
			}));
		}
	}

	private _subscribeToEditor(): void {
		this._editorListener.value = this.widget.inputEditor.onDidChangeModelContent(e => {

			const removed: IDynamicVariable[] = [];
			let didChange = false;

			// Don't mutate entries in _variables, since they will be returned from the getter
			this._variables = coalesce(this._variables.map((ref, idx): IDynamicVariable | null => {
				const model = this.widget.inputEditor.getModel();

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

					this.widget.inputEditor.executeEdits(this.id, [{
						range: newRange,
						text: '',
					}]);
					this.widget.refreshParsedInput();

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
				this.widget.refreshParsedInput();
				this._onDidChangeReferences.fire();
			}

			this.updateDecorations();
		});
	}

	getInputState(contrib: Record<string, unknown>): void {
		contrib[ChatDynamicVariableModel.ID] = this.variables;
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

	addReference(ref: IDynamicVariable): void {
		if (!isValidEditorRange(ref.range)) {
			return;
		}

		this._variables.push(ref);
		this.updateDecorations();
		this.widget.refreshParsedInput();
		this._onDidChangeReferences.fire();
	}

	getFileReferenceAtPosition(position: Position): IDynamicVariable | undefined {
		return this._variables.find(variable => {
			const range = Range.lift(variable.range);
			return (variable.isFile || variable.isDirectory) && range.containsPosition(position) && !position.equals(range.getEndPosition());
		});
	}

	/**
	 * Inserts file, folder, and file-selection entries into the prompt as inline references.
	 */
	insertFileReferences(entries: readonly IChatRequestVariableEntry[]): boolean {
		const editor = this.widget.inputEditor;
		const model = editor.getModel();
		const position = editor.getPosition();
		if (!model || !position || entries.length === 0) {
			return false;
		}

		const references = entries.map(entry => ({ entry, text: this.getFileReferenceText(entry) }));
		const offset = model.getOffsetAt(position);
		const value = model.getValue();
		const prefix = offset > 0 && !/\s/.test(value.charAt(offset - 1)) ? ' ' : '';
		const suffix = offset === value.length || (offset < value.length && !/\s/.test(value.charAt(offset))) ? ' ' : '';
		const insertedText = prefix + references.map(reference => reference.text).join(' ') + suffix;
		const insertionRange = Range.fromPositions(position);
		if (!editor.executeEdits(this.id, [{ range: insertionRange, text: insertedText }])) {
			return false;
		}

		let startColumn = position.column + prefix.length;
		for (const { entry, text } of references) {
			this.addReference({
				id: entry.id,
				fullName: entry.fullName ?? entry.name,
				modelDescription: entry.modelDescription,
				range: new Range(position.lineNumber, startColumn, position.lineNumber, startColumn + text.length),
				icon: entry.icon,
				isFile: entry.kind === 'file',
				isDirectory: entry.kind === 'directory',
				data: entry.value,
				references: entry.references,
				omittedState: entry.omittedState,
				imageCount: entry.kind === 'directory' ? entry.imageCount : undefined,
				_meta: entry._meta,
			});
			startColumn += text.length + 1;
		}

		editor.setPosition({ lineNumber: position.lineNumber, column: position.column + insertedText.length });
		return true;
	}

	private getFileReferenceText(entry: IChatRequestVariableEntry): string {
		if (entry.kind === 'file' && isLocation(entry.value)) {
			const { startLineNumber, endLineNumber } = entry.value.range;
			const lineRange = startLineNumber === endLineNumber ? `${startLineNumber}` : `${startLineNumber}-${endLineNumber}`;
			return `@${entry.name}:${lineRange}`;
		}
		return `@${entry.name}`;
	}

	private updateDecorations(): void {
		const model = this.widget.inputEditor.getModel();
		if (!model) {
			this.decorationData = [];
			return;
		}

		const validVariables = this._variables.filter(v => isValidEditorRange(v.range));
		const regularVariables = validVariables.map((variable, index) => ({ variable, index })).filter(({ variable }) => !variable.isFile && !variable.isDirectory);
		const clickableVariables = validVariables.map((variable, index) => ({ variable, index })).filter(({ variable }) => variable.isFile || variable.isDirectory);
		const toDecorationOptions = ({ variable }: { variable: IDynamicVariable }): IDecorationOptions => ({
			range: variable.range,
			hoverMessage: this.getHoverForReference(variable)
		});
		const regularDecorationIds = this.widget.inputEditor.setDecorationsByType('chat', dynamicVariableDecorationType, regularVariables.map(toDecorationOptions));
		const clickableDecorationIds = this.widget.inputEditor.setDecorationsByType('chat', clickableDynamicVariableDecorationType, clickableVariables.map(toDecorationOptions));
		const decorationIds = new Map<number, string>();
		regularDecorationIds.forEach((id, index) => decorationIds.set(regularVariables[index].index, id));
		clickableDecorationIds.forEach((id, index) => decorationIds.set(clickableVariables[index].index, id));

		this._variables = validVariables.filter((_, index) => decorationIds.has(index));
		this.decorationData = [];
		for (let i = 0; i < validVariables.length; i++) {
			const decorationId = decorationIds.get(i);
			if (!decorationId) {
				continue;
			}
			this.decorationData.push({
				id: decorationId,
				text: model.getValueInRange(validVariables[i].range)
			});
		}
	}

	private getHoverForReference(ref: IDynamicVariable): IMarkdownString | undefined {
		const value = ref.data;
		let label: string | undefined;
		if (URI.isUri(value)) {
			label = this.labelService.getUriLabel(value, { relative: true });
		} else if (isLocation(value)) {
			const rangeString = `#${value.range.startLineNumber}:${value.range.startColumn}-${value.range.endLineNumber}:${value.range.endColumn}`;
			label = this.labelService.getUriLabel(value.uri, { relative: true }) + rangeString;
		}
		if (!label) {
			return undefined;
		}

		const hover = new MarkdownString().appendText(label);
		const maxImagesPerRequest = getImageAttachmentLimit(this.widget.input?.selectedLanguageModel.get()?.metadata);
		if (ref.isDirectory && typeof ref.imageCount === 'number' && maxImagesPerRequest !== undefined && ref.imageCount > maxImagesPerRequest) {
			hover.appendMarkdown('\n\n');
			hover.appendText(localize(
				'chat.folderImageLimitExceededHover',
				'This folder contains {0} images, which exceeds the maximum of {1} images per request. Older images will not be sent.',
				ref.imageCount,
				maxImagesPerRequest,
			));
		}
		return hover;
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
