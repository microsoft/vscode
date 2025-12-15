/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, dispose, isDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { Command, isLocation } from '../../../../../editor/common/languages.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IChatRequestVariableValue, IDynamicVariable } from '../../common/chatVariables.js';
import { IChatWidget } from '../chat.js';
import { IChatWidgetContrib } from '../chatWidget.js';

export const dynamicVariableDecorationType = 'chat-dynamic-variable';



export class ChatDynamicVariableModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicVariableModel';

	private _variables: IDynamicVariable[] = [];

	get variables(): ReadonlyArray<IDynamicVariable> {
		return [...this._variables];
	}

	get id() {
		return ChatDynamicVariableModel.ID;
	}

	private decorationData: { id: string; text: string }[] = [];

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._register(widget.inputEditor.onDidChangeModelContent(e => {

			const removed: IDynamicVariable[] = [];
			let didChange = false;

			// Don't mutate entries in _variables, since they will be returned from the getter
			this._variables = coalesce(this._variables.map((ref, idx): IDynamicVariable | null => {
				const model = widget.inputEditor.getModel();

				if (!model) {
					removed.push(ref);
					return null;
				}

				const data = this.decorationData[idx];
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
			}

			this.updateDecorations();
		}));
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
		this._variables.push(ref);
		this.updateDecorations();
		this.widget.refreshParsedInput();
	}

	private updateDecorations(): void {

		const decorationIds = this.widget.inputEditor.setDecorationsByType('chat', dynamicVariableDecorationType, this._variables.map((r): IDecorationOptions => ({
			range: r.range,
			hoverMessage: this.getHoverForReference(r)
		})));

		this.decorationData = [];
		for (let i = 0; i < decorationIds.length; i++) {
			this.decorationData.push({
				id: decorationIds[i],
				text: this.widget.inputEditor.getModel()!.getValueInRange(this._variables[i].range)
			});
		}
	}

	private getHoverForReference(ref: IDynamicVariable): IMarkdownString | undefined {
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
		'data' in obj;
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
