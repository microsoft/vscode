/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import type { CustomizationEnablementResolution, IAgentHostCustomizationEnablementService } from '../../node/agentHostCustomizationEnablementService.js';

/**
 * A permissive {@link IAgentHostCustomizationEnablementService} that resolves
 * every customization as enabled and never fires a change. Tests that do not
 * exercise scoped enablement use this so that constructing agent sessions does
 * not require the real storage-backed service.
 */
export function createNoopCustomizationEnablementService(): IAgentHostCustomizationEnablementService {
	const resolution: CustomizationEnablementResolution = {
		kind: 'resolved',
		enablement: [],
		enabled: true,
		workingDirectory: { kind: 'workspaceless' },
	};
	// Never settles the workspace MCP server class, so the contribution that mirrors
	// it into session `_meta` stays inert and `_meta` expectations stay unchanged.
	const pendingClass: CustomizationEnablementResolution = { kind: 'pending', reason: 'session' };
	return {
		_serviceBrand: undefined,
		onDidChange: Event.None,
		initializeSession: async () => { },
		getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
		resolve: () => resolution,
		resolveWorkspaceMcpServers: () => pendingClass,
		replaceWorkspaceMcpServersEnablement: () => pendingClass,
		adoptMcpServerOwnership: () => { },
		applyClientGlobalEnablement: () => resolution,
		replaceEnablement: () => resolution,
		setEnablement: () => resolution,
		whenIdle: async () => { },
	};
}
