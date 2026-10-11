/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { getErrorMessage } from '../../../../base/common/errors.js';
import type { ILogService } from '../../../log/common/log.js';

export const CopilotExtensionsReloadToolName = 'extensions_reload';

const extensionsReloadDescription = 'Reload all Copilot extensions in the current session after creating or modifying extension files. Do not use this merely to reopen an existing canvas when extension files are unchanged. Reloading stops and restarts every extension provider; open canvases become temporarily unavailable and are rehydrated when their providers reconnect. After this succeeds, call `list_canvas_capabilities` before `open_canvas` or `invoke_canvas_action`.';

export function createCopilotExtensionTools(enabled: boolean, reloadExtensions: () => Promise<void>, logService: ILogService): Tool<unknown>[] {
	if (!enabled) {
		return [];
	}
	return [{
		name: CopilotExtensionsReloadToolName,
		description: extensionsReloadDescription,
		parameters: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		overridesBuiltInTool: true,
		defer: 'never',
		metadata: {
			'github.com/copilot:safeForTelemetry': { name: true, inputsNames: false },
		},
		handler: async (): Promise<ToolResultObject> => {
			try {
				await reloadExtensions();
				return {
					textResultForLlm: 'Extensions reloaded. Re-check canvas capabilities before opening or invoking a canvas.',
					resultType: 'success',
				};
			} catch (error) {
				const message = getErrorMessage(error);
				logService.error(error, '[Copilot] Failed to reload extensions');
				return {
					textResultForLlm: `Failed to reload extensions: ${message}`,
					resultType: 'failure',
					error: message,
				};
			}
		},
	}];
}
