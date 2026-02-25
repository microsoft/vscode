/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { localize } from '../../../../../nls.js';
import { logBrowserOpen } from '../../../../../platform/browserView/common/browserViewTelemetry.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult } from './browserToolHelpers.js';
import { IOpenBrowserToolParams, OpenBrowserToolData } from './openBrowserTool.js';

export const OpenBrowserToolNonAgenticData: IToolData = {
	...OpenBrowserToolData,
	modelDescription: 'Open a new browser page in the integrated browser at the given URL.',
};

export class OpenBrowserToolNonAgentic implements IToolImpl {
	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IOpenBrowserToolParams;
		return {
			invocationMessage: localize('browser.open.nonAgentic.invocation', "Opening browser page at {0}", params.url ?? 'about:blank'),
			pastTenseMessage: localize('browser.open.nonAgentic.past', "Opened browser page at {0}", params.url ?? 'about:blank'),
			confirmationMessages: {
				title: localize('browser.open.nonAgentic.confirmTitle', 'Open Browser Page?'),
				message: localize('browser.open.nonAgentic.confirmMessage', 'This will open {0} in the integrated browser. The agent will not be able to read its contents.', params.url ?? 'about:blank'),
				allowAutoConfirm: true,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IOpenBrowserToolParams;

		if (!params.url) {
			return errorResult('The "url" parameter is required.');
		}

		logBrowserOpen(this.telemetryService, 'chatTool');

		const browserUri = BrowserViewUri.forUrl(params.url);
		await this.editorService.openEditor({ resource: browserUri, options: { pinned: true } });

		return {
			content: [{
				kind: 'text',
				value: `Page opened successfully. Note that you do not have access to the page contents unless the user enables agentic tools via the \`workbench.browser.enableChatTools\` setting.`,
			}]
		};
	}
}
