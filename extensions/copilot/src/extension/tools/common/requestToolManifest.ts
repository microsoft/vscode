/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CUSTOM_TOOL_SEARCH_NAME } from '../../../platform/networking/common/anthropic';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';

export interface IRequestToolManifest<TTool extends { name: string }> {
	readonly activeTools: readonly TTool[];
	readonly activeToolNames: readonly string[];
	readonly nonDeferredTools: readonly TTool[];
	readonly nonDeferredToolNames: readonly string[];
	readonly deferredTools: readonly TTool[];
	readonly deferredToolNames: readonly string[];
	readonly hasDeferredTools: boolean;
}

function isDeferredRequestTool(toolName: string, toolDeferralService: IToolDeferralService): boolean {
	return toolName !== CUSTOM_TOOL_SEARCH_NAME && !toolDeferralService.isNonDeferredTool(toolName);
}

export function createRequestToolManifest<TTool extends { name: string }>(activeTools: readonly TTool[], toolDeferralService: IToolDeferralService): IRequestToolManifest<TTool> {
	const activeToolNames: string[] = [];
	const nonDeferredTools: TTool[] = [];
	const nonDeferredToolNames: string[] = [];
	const deferredTools: TTool[] = [];
	const deferredToolNames: string[] = [];

	for (const tool of activeTools) {
		activeToolNames.push(tool.name);
		if (isDeferredRequestTool(tool.name, toolDeferralService)) {
			deferredTools.push(tool);
			deferredToolNames.push(tool.name);
		} else {
			nonDeferredTools.push(tool);
			nonDeferredToolNames.push(tool.name);
		}
	}

	return {
		activeTools,
		activeToolNames,
		nonDeferredTools,
		nonDeferredToolNames,
		deferredTools,
		deferredToolNames,
		hasDeferredTools: deferredTools.length > 0,
	};
}

export function pruneToolSearchWhenNoDeferredTools<TTool extends { name: string }>(activeTools: readonly TTool[], toolDeferralService: IToolDeferralService): TTool[] {
	const requestToolManifest = createRequestToolManifest(activeTools, toolDeferralService);
	if (requestToolManifest.hasDeferredTools) {
		return [...activeTools];
	}

	return activeTools.filter(tool => tool.name !== CUSTOM_TOOL_SEARCH_NAME);
}
