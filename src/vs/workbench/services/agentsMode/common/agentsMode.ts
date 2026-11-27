/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAgentsModeService = createDecorator<IAgentsModeService>('agentsModeService');

/**
 * Agents mode of an editor window: an empty local editor window switches in place
 * onto the Agents window's workspace and configuration, without reloading.
 */
export interface IAgentsModeService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether this window can switch into Agents mode. Only local editor
	 * windows that opted in when they started can.
	 */
	readonly isSupported: boolean;

	/**
	 * The folders of the window's own workspace, which it shows outside the mode
	 * and gets back when it leaves the mode.
	 */
	readonly windowFolders: readonly URI[];

	/**
	 * Whether the window is in Agents mode.
	 */
	readonly isActive: boolean;

	/**
	 * Fires after the window entered or left Agents mode.
	 */
	readonly onDidChange: Event<boolean>;

	/**
	 * Enters or leaves Agents mode in place, and remembers it so that the window
	 * restores in the mode. Does nothing when the window doesn't support the mode.
	 */
	setActive(active: boolean): Promise<void>;
}
