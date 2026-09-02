/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { ChatDynamicVariableModel } from '../../../../workbench/contrib/chat/browser/attachments/chatDynamicVariables.js';
import { IChatPasteTarget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { isTerminalCommandPaste } from '../../../../workbench/contrib/chat/browser/chatTerminalCommandPaste.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../../../workbench/contrib/chat/common/attachments/chatVariables.js';
import { AgentHostInputCompletionHandler } from './agentHostInputCompletions.js';
import { INewChatAttachments } from './newChatContextAttachments.js';

type PasteCompletionHandler = Pick<AgentHostInputCompletionHandler, 'acceptCompletion' | 'forgetReference'>;

/** Adapts the Agents composer to the shared Chat paste providers. */
export class NewChatInputPasteTarget implements IChatPasteTarget {

	constructor(
		private readonly editor: ICodeEditor,
		private readonly contextAttachments: INewChatAttachments,
		private readonly completionHandler: PasteCompletionHandler,
		private readonly dynamicVariableModel: ChatDynamicVariableModel,
		private readonly getTerminalCommandPrefix: () => string | undefined,
		private readonly getSessionResource: () => URI | undefined,
		private readonly inputUri: URI,
	) { }

	get sessionResource(): URI {
		return this.getSessionResource() ?? this.inputUri;
	}

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this.contextAttachments.attachments;
	}

	get inlineReferences(): readonly IDynamicVariable[] {
		return this.dynamicVariableModel.variables;
	}

	addAttachments(entries: readonly IChatRequestVariableEntry[]): void {
		this.contextAttachments.addAttachments(...entries);
	}

	removeAttachments(ids: readonly string[]): void {
		for (const id of ids) {
			this.completionHandler.forgetReference(id);
			this.contextAttachments.removeAttachment(id);
		}
	}

	addInlineAttachment(entry: IChatRequestVariableEntry, text: string, range: IRange): void {
		const offsetRange = this.toOffsetRange(range, text.length);
		this.completionHandler.acceptCompletion({ ...entry, range: offsetRange }, text, offsetRange);
	}

	addInlineReference(reference: IDynamicVariable, expectedText?: string, expectedRangeOffset?: number): void {
		this.dynamicVariableModel.addReference(reference, expectedText, expectedRangeOffset);
	}

	removeInlineReference(reference: IDynamicVariable): void {
		this.dynamicVariableModel.removeReference(reference);
	}

	isTerminalCommandPaste(text: string, range: IRange): boolean {
		const model = this.editor.getModel();
		const prefix = this.getTerminalCommandPrefix();
		if (!model || !prefix) {
			return false;
		}
		return isTerminalCommandPaste({
			prefix,
			pastedText: text,
			currentValue: model.getValue(),
			selectionStartOffset: model.getOffsetAt(Range.getStartPosition(range)),
			selectionEndOffset: model.getOffsetAt(Range.getEndPosition(range)),
		});
	}

	private toOffsetRange(range: IRange, length: number): OffsetRange {
		const model = this.editor.getModel();
		const start = model ? model.getOffsetAt(Range.getStartPosition(range)) : 0;
		return new OffsetRange(start, start + length);
	}
}
