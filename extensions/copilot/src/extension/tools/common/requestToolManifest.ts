/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function createRequestToolManifest<TTool extends { name: string }>(activeTools: readonly TTool[], toolDeferralService: IToolDeferralService): IRequestToolManifest<TTool> {
	const activeToolNames: string[] = [];
	const nonDeferredTools: TTool[] = [];
	const nonDeferredToolNames: string[] = [];
	const deferredTools: TTool[] = [];
	const deferredToolNames: string[] = [];

	for (const tool of activeTools) {
		activeToolNames.push(tool.name);
		if (toolDeferralService.isNonDeferredTool(tool.name)) {
			nonDeferredTools.push(tool);
			nonDeferredToolNames.push(tool.name);
		} else {
			deferredTools.push(tool);
			deferredToolNames.push(tool.name);
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
