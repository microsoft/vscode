/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IURLHandler, IURLService } from '../../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { AICustomizationManagementCommands, AICustomizationManagementOpenEditorTarget } from './aiCustomizationManagement.js';

const pageTargets: Readonly<Record<string, AICustomizationManagementOpenEditorTarget>> = {
	discover: { showDiscover: true },
	agents: AICustomizationManagementSection.Agents,
	skills: AICustomizationManagementSection.Skills,
	instructions: AICustomizationManagementSection.Instructions,
	hooks: AICustomizationManagementSection.Hooks,
	'mcp-server': AICustomizationManagementSection.McpServers,
	'mcp-servers': AICustomizationManagementSection.McpServers,
	plugins: AICustomizationManagementSection.Plugins,
	tools: AICustomizationManagementSection.Tools,
	migrations: { migration: true },
};

export function parseChatCustomizationsUrl(uri: URI): AICustomizationManagementOpenEditorTarget | undefined {
	if (uri.authority !== 'chat-customizations' || uri.path !== '/open') {
		return undefined;
	}

	const params = new URLSearchParams(uri.query);
	const page = params.get('page');
	if (!page) {
		return undefined;
	}

	const pageId = page.trim().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
	const target = pageTargets[pageId];
	if (!target) {
		return undefined;
	}

	const searchQuery = params.has('search') ? params.get('search') ?? '' : undefined;
	return typeof target === 'string'
		? { section: target, searchQuery }
		: { ...target, searchQuery };
}

export class AIChatCustomizationsUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.aiChatCustomizationsUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== 'chat-customizations' || uri.path !== '/open') {
			return false;
		}

		const target = parseChatCustomizationsUrl(uri);
		if (!target) {
			this.logService.warn(`[AIChatCustomizationsUrlHandler] Invalid customizations URL: ${uri.toString()}`);
			return true;
		}

		await this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, target);
		return true;
	}
}
