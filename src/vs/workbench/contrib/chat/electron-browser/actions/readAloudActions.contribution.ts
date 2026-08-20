/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ReadChatResponseAloud, StopReadAloud, StopReadChatItemAloud } from './voiceChatActions.js';

/**
 * Registers reading chat responses aloud. Kept apart from the voice chat actions
 * so that windows which do not offer voice chat, such as the Agents window, can
 * still read responses aloud.
 */
export function registerReadAloudActions(): void {
	registerAction2(ReadChatResponseAloud);
	registerAction2(StopReadChatItemAloud);
	registerAction2(StopReadAloud);
}
