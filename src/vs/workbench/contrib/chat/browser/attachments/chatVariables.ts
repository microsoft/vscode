/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../../common/attachments/chatVariables.js';
import { ToolAndToolSetEnablementMap } from '../../common/tools/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatDynamicVariableModel } from './chatDynamicVariables.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * The references in the prompt that the widget's input represents, including
 * those of inline attachment pills. Their ranges are in the text that
 * {@link IChatWidget.getInput} returns.
 *
 * @param options.forModel Whether the references are parsed into the request
 * sent to the model, which reads each pill as the name and location of its
 * attachment rather than the text that the pill stands for.
 */
export function getDynamicVariablesForWidget(widget: IChatWidget, options?: { readonly forModel?: boolean }): ReadonlyArray<IDynamicVariable> {
	const references = getInputDynamicVariablesForWidget(widget);
	return widget.input.inlineAttachments?.project(references, options)?.references ?? references;
}

/**
 * The references in the widget's input editor, with ranges in the editor's
 * text. Unlike {@link getDynamicVariablesForWidget}, these exclude inline
 * attachment pills, which stand in for their text with a single character.
 */
export function getInputDynamicVariablesForWidget(widget: IChatWidget): ReadonlyArray<IDynamicVariable> {
	if (!widget.viewModel) {
		return [];
	}

	const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
	if (!model) {
		return [];
	}
	if (!widget.supportsFileReferences) {
		return model.variables.filter(variable => variable.isAttachmentReference);
	}

	// track for editing state
	if (widget.viewModel.editing && model.variables.length > 0) {
		return model.variables;
	}

	// Ranges of attachments are offsets in the prompt, which differs from the
	// input when inline attachment pills stand for text; the pills own those.
	if (widget.input.attachmentModel.attachments.length > 0 && widget.viewModel.editing && !widget.input.inlineAttachments?.isEnabled) {
		const references: IDynamicVariable[] = [];
		const editorModel = widget.inputEditor.getModel();
		const modelTextLength = editorModel?.getValueLength() ?? 0;
		for (const attachment of widget.input.attachmentModel.attachments) {
			// If the attachment has a range, it is a dynamic variable
			if (attachment.range) {
				if (attachment.range.start >= attachment.range.endExclusive) {
					continue;
				}

				if (attachment.range.start < 0 || attachment.range.endExclusive > modelTextLength) {
					continue;
				}

				if (!editorModel) {
					continue;
				}

				const startPos = editorModel.getPositionAt(attachment.range.start);
				const endPos = editorModel.getPositionAt(attachment.range.endExclusive);

				const referenceObj: IDynamicVariable = {
					id: attachment.id,
					fullName: attachment.name,
					modelDescription: attachment.modelDescription,
					range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
					icon: attachment.icon,
					isFile: attachment.kind === 'file',
					isDirectory: attachment.kind === 'directory',
					data: attachment.value
				};
				references.push(referenceObj);
			}
		}

		return references.length > 0 ? references : model.variables;
	}

	return model.variables;
}

export function getSelectedToolAndToolSetsForWidget(widget: IChatWidget): ToolAndToolSetEnablementMap {
	return widget.input.selectedToolsModel.entriesMap.get();
}

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) { }

	getDynamicVariables(sessionResource: URI): ReadonlyArray<IDynamicVariable> {
		const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return [];
		}
		// The request parser takes these to parse the request that is sent.
		return getDynamicVariablesForWidget(widget, { forModel: true });
	}

	getSelectedToolAndToolSets(sessionResource: URI): ToolAndToolSetEnablementMap {
		const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return ToolAndToolSetEnablementMap.fromEntries([]);
		}
		return getSelectedToolAndToolSetsForWidget(widget);
	}
}
