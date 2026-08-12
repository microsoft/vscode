/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { localize } from '../../../../../nls.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { getBrowserPagesContext } from './browserToolHelpers.js';

export const ListBrowserPagesToolData: IToolData = {
	id: 'list_browser_pages',
	displayName: localize('listBrowserPagesTool.displayName', 'List Browser Pages'),
	userDescription: localize('listBrowserPagesTool.userDescription', 'List browser pages that are shared with the agent'),
	modelDescription: 'Lists the browser pages that are currently shared with the agent.',
	source: ToolDataSource.Internal,

	// Note: this tool has no toolReferenceName and cannot be referenced in prompts.
	// It is not intended to be used by models directly since browser pages are supplied as context.
	canBeReferencedInPrompt: false,

	inputSchema: {
		type: 'object',
		properties: {},
	},
};

export class ListBrowserPagesTool implements IToolImpl {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IAgentNetworkFilterService private readonly agentNetworkFilterService: IAgentNetworkFilterService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const activeSessionId = invocation.context?.sessionResource.toString();
		const value = getBrowserPagesContext(
			this.editorService,
			this.browserViewService,
			this.agentNetworkFilterService,
			{
				activeSessionId,
				canPromptUser: activeSessionId !== undefined,
			},
		);
		return {
			content: [{
				kind: 'text',
				value: value ?? 'No browser pages are currently open.',
			}],
		};
	}
}
