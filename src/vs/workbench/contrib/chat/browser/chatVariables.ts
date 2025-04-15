/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatVariablesService, IDynamicVariable } from '../common/chatVariables.js';
import { IToolData } from '../common/languageModelToolsService.js';
import { IChatWidgetService } from './chat.js';
import { ChatDynamicVariableModel } from './contrib/chatDynamicVariables.js';

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) { }

	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		return model.variables;
	}

	getSelectedTools(sessionId: string): ReadonlyArray<IToolData> {
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget) {
			return [];
		}
		return widget.input.selectedToolsModel.tools.get();
	}

}
