/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';

/**
 * Registers native-only commands used by the agents voice window service.
 * These bridge the browser-layer AgentsVoiceWindowService to electron-only
 * INativeHostService methods without violating the layering rules.
 */

CommandsRegistry.registerCommand('_agentsVoice.setWindowAlwaysOnTop', async (accessor, alwaysOnTop: boolean, targetWindowId: number) => {
	const nativeHostService = accessor.get(INativeHostService);
	await nativeHostService.setWindowAlwaysOnTop(alwaysOnTop, { targetWindowId });
});

CommandsRegistry.registerCommand('_agentsVoice.minimizeWindow', async (accessor, targetWindowId: number) => {
	const nativeHostService = accessor.get(INativeHostService);
	await nativeHostService.minimizeWindow({ targetWindowId });
});
