/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import type { ChatGenerativeUIInsetPart } from './chatGenerativeUIInsetPart.js';

// Wire-protocol message shape (mirrors the HostToInsetMessage in chatGenerativeUIInsetPart.ts
// and @copilot/a2ui-runtime/src/protocol.ts; core must not import the runtime package).
type HostToInsetMessage = { type: 'RENDER' | 'STATE_DELTA' | 'DISPOSE';[k: string]: unknown };

/**
 * Module-level registry of live generative-UI insets, keyed by `surfaceId`.
 *
 * This is the cross-fork transport target: the extension pushes post-render
 * messages (STATE_DELTA / DISPOSE) to a SPECIFIC already-rendered inset by
 * invoking the `_a2ui.postToSurface` command (below), which looks the inset up
 * here and forwards the message.
 *
 * A module map (rather than a workbench service) mirrors the existing
 * `_chat.resizeImage` pattern in `chatImageUtils.ts` and is the simplest
 * dispose-safe option: each `ChatGenerativeUIInsetPart` registers itself on
 * construction and deregisters on dispose.
 */
const insets = new Map<string, ChatGenerativeUIInsetPart>();

/**
 * Register an inset under its `surfaceId`. Last writer wins: if a surface with
 * the same id is already registered (e.g. a re-render before the prior part was
 * disposed), the new part replaces it. Deregistration is guarded so a stale
 * part disposing later cannot evict a newer part registered under the same id.
 */
export function registerInset(surfaceId: string, inset: ChatGenerativeUIInsetPart): void {
	insets.set(surfaceId, inset);
}

/**
 * Deregister an inset. No-op unless the currently-registered part for
 * `surfaceId` is exactly `inset` — this makes "last wins" safe against a stale
 * part disposing after a newer part has taken over the same surfaceId.
 */
export function deregisterInset(surfaceId: string, inset: ChatGenerativeUIInsetPart): void {
	if (insets.get(surfaceId) === inset) {
		insets.delete(surfaceId);
	}
}

/**
 * INTERNAL command (underscore = not in the command palette).
 *
 * Dumb pipe: look up the inset registered for `surfaceId` and forward `msg` to
 * it via `postToInset`. No A2UI logic lives here. No-op if the surface is gone
 * (the inset was disposed) so a late push after teardown is harmless.
 */
CommandsRegistry.registerCommand('_a2ui.postToSurface', (_accessor, surfaceId: string, msg: HostToInsetMessage): void => {
	insets.get(surfaceId)?.postToInset(msg);
});
