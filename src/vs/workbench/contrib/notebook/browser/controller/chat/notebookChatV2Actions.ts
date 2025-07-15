/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../../nls.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InlineChatConfigKeys } from '../../../../inlineChat/common/inlineChat.js';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from './notebookChatContext.js';
import { NotebookChatController } from './notebookChatController.js';
import { INotebookActionContext, NotebookAction } from '../coreActions.js';

/**
 * Action to toggle notebook inline chat v2 feature
 */
registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.chat.toggleV2',
			title: localize2('notebook.chat.toggleV2', "Toggle Notebook Inline Chat v2"),
			f1: true,
			precondition: ContextKeyExpr.and(CTX_NOTEBOOK_CHAT_HAS_AGENT),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const configurationService = accessor.get(IConfigurationService);
		const currentValue = configurationService.getValue<boolean>(InlineChatConfigKeys.NotebookEnableV2);

		await configurationService.updateValue(InlineChatConfigKeys.NotebookEnableV2, !currentValue);

		// Log the change for user feedback
		const newValue = !currentValue;
		const message = newValue
			? localize('notebook.chat.v2.enabled', "Notebook Inline Chat v2 enabled")
			: localize('notebook.chat.v2.disabled', "Notebook Inline Chat v2 disabled");

		// You could show a notification here if needed
		console.log(message);
	}
});

/**
 * Action to test notebook chat with v2 support
 */
registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.chat.testV2',
			title: localize2('notebook.chat.testV2', "Test Notebook Chat (v2 support)"),
			f1: true,
			precondition: ContextKeyExpr.and(CTX_NOTEBOOK_CHAT_HAS_AGENT),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const controller = NotebookChatController.get(context.notebookEditor);
		if (!controller) {
			return;
		}

		// Test with the current selected cell or add a new one
		const focus = context.notebookEditor.getFocus();
		const cellIndex = focus.start;

		// Use the v2-aware run method
		await controller.runWithV2Support(cellIndex, 'Generate a hello world example', false);
	}
});

/**
 * Action to check notebook chat v2 status
 */
registerAction2(class extends NotebookAction {
	constructor() {
		super({
			id: 'notebook.chat.checkV2Status',
			title: localize2('notebook.chat.checkV2Status', "Check Notebook Chat v2 Status"),
			f1: true,
			precondition: ContextKeyExpr.and(CTX_NOTEBOOK_CHAT_HAS_AGENT),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const configurationService = accessor.get(IConfigurationService);
		const controller = NotebookChatController.get(context.notebookEditor);

		const isV2Enabled = configurationService.getValue<boolean>(InlineChatConfigKeys.NotebookEnableV2);
		const inlineChatV2Enabled = configurationService.getValue<boolean>(InlineChatConfigKeys.EnableV2);

		const status = {
			notebookV2: isV2Enabled,
			inlineChatV2: inlineChatV2Enabled,
			controllerExists: !!controller,
			hasV2Controller: controller && (controller as any)._v2Controller !== undefined
		};

		console.log('Notebook Chat v2 Status:', status);

		// You could show this in a dialog or notification if needed
		const message = [
			`Notebook Chat v2: ${status.notebookV2 ? 'Enabled' : 'Disabled'}`,
			`Inline Chat v2: ${status.inlineChatV2 ? 'Enabled' : 'Disabled'}`,
			`Controller: ${status.controllerExists ? 'Available' : 'Not available'}`,
			`V2 Controller: ${status.hasV2Controller ? 'Available' : 'Not available'}`
		].join('\n');

		console.log(message);
	}
});
