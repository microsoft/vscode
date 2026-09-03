/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../common/attachments/chatVariables.js';
import { IChatPasteTarget, IChatWidget } from '../chat.js';
import { ChatDynamicVariableModel } from './chatDynamicVariables.js';
import { getDynamicVariablesForWidget } from './chatVariables.js';

/** Exposes a {@link IChatWidget} to the shared chat paste pipeline. */
export class ChatWidgetPasteTarget implements IChatPasteTarget {

	constructor(private readonly widget: IChatWidget) { }

	get sessionResource(): URI {
		// Falls back to the input itself for a widget with no loaded session, so
		// associated resources still have a stable cleanup key.
		return this.widget.viewModel?.sessionResource ?? this.widget.input.inputUri;
	}

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this.widget.attachmentModel.attachments;
	}

	get inlineReferences(): readonly IDynamicVariable[] {
		return getDynamicVariablesForWidget(this.widget);
	}

	addAttachments(entries: readonly IChatRequestVariableEntry[]): void {
		this.widget.attachmentModel.addContext(...entries);
		this.widget.refreshParsedInput();
	}

	removeAttachments(ids: readonly string[]): void {
		this.widget.attachmentModel.delete(...ids);
		this.widget.refreshParsedInput();
	}

	addInlineAttachment(entry: IChatRequestVariableEntry, _text: string, range: IRange): void {
		this.widget.attachmentModel.addContext(entry);
		this.addInlineReference(toAttachedContextDynamicVariable(entry, range));
	}

	addInlineReference(reference: IDynamicVariable, expectedText?: string, expectedRangeOffset?: number): void {
		this.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(reference, expectedText, expectedRangeOffset);
		this.widget.refreshParsedInput();
	}

	removeInlineReference(reference: IDynamicVariable): void {
		this.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.removeReference(reference);
		this.widget.refreshParsedInput();
	}

	isTerminalCommandPaste(text: string, range: IRange): boolean {
		return this.widget.input.isTerminalCommandPaste(text, range);
	}
}
