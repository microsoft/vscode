/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWebUIService } from '../../../../platform/webui/common/webuiService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { WebUIWorkbenchService } from './webuiWorkbenchService.js';
import { registerWorkbenchContribution2, IWorkbenchContribution } from '../../../common/contributions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { WebUIEditorInput } from './webuiEditorInput.js';

// Register service with exact decorator name and eager instantiation
registerSingleton(IWebUIService, WebUIWorkbenchService, InstantiationType.Eager);

class OpenWebUIAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.webui.open',
			title: {
				value: localize('openAIChat', "Open AI Chat"),
				original: 'Open AI Chat'
			},
			category: 'Developer',
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const logService = accessor.get(ILogService);
		const webUIService = accessor.get(IWebUIService);

		logService.info('[WebUI] Action triggered');
		try {
			await webUIService.openChat();
			logService.info('[WebUI] Chat opened successfully');
		} catch (error) {
			logService.error('[WebUI] Failed to open chat:', error);
		}
	}
}

registerAction2(OpenWebUIAction);

// Register as workbench contribution
class WebUIContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.webui';

	constructor(
	) { }
}

registerWorkbenchContribution2(WebUIContribution.ID, WebUIContribution, {
	lazy: true
});

// Register webview editor
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(
		'webui.chat',
		WebUIEditorInput
	);
