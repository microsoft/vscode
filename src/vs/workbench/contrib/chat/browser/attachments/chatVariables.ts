/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../../common/attachments/chatVariables.js';
import { IToolAndToolSetEnablementMap } from '../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatDynamicVariableModel } from './chatDynamicVariables.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { URI } from '../../../../../base/common/uri.js';

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) { }

	getDynamicVariables(sessionResource: URI): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		// track for editing state
		if (widget.viewModel.editing && model.variables.length > 0) {
			return model.variables;
		}

		if (widget.input.attachmentModel.attachments.length > 0 && widget.viewModel.editing) {
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

	getSelectedToolAndToolSets(sessionResource: URI): IToolAndToolSetEnablementMap {
		const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return new Map();
		}
		return widget.input.selectedToolsModel.entriesMap.get();

	}
}
