/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../common/chatVariables.js';
import { IToolAndToolSetEnablementMap } from '../common/languageModelToolsService.js';
import { IChatWidgetService } from './chat.js';
import { ChatDynamicVariableModel } from './contrib/chatDynamicVariables.js';
import { Range } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';

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

		if (widget.input.attachmentModel.attachments.length > 0 && widget.viewModel.editing) {
			const references: IDynamicVariable[] = [];
			for (const attachment of widget.input.attachmentModel.attachments) {
				// If the attachment has a range, it is a dynamic variable
				if (attachment.range) {
					const referenceObj: IDynamicVariable = {
						id: attachment.id,
						fullName: attachment.name,
						modelDescription: attachment.modelDescription,
						range: new Range(1, attachment.range.start + 1, 1, attachment.range.endExclusive + 1),
						icon: attachment.icon,
						isFile: attachment.kind === 'file',
						isDirectory: attachment.kind === 'directory',
						data: attachment.value
					};
					references.push(referenceObj);
				}
			}

			return [...model.variables, ...references];
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
