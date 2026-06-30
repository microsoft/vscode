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
 * Replayable transport state for a surface, kept alive independently of any
 * `ChatGenerativeUIInsetPart`.
 *
 * The chat list virtualizes rows: when an inset scrolls far enough offscreen
 * its content part (and webview) is DISPOSED, and scrolling back constructs a
 * fresh part with a brand-new webview. The live document state, however, only
 * ever lived inside that webview — the chat model carries just `initialDoc`,
 * and all post-render updates arrive as transient `STATE_DELTA` messages. So a
 * recreated (or reloaded) inset could previously only restore `initialDoc`,
 * losing every accumulated delta and rendering blank.
 *
 * We therefore record the minimal sequence needed to rebuild current state —
 * the latest full `RENDER` document plus the ordered `STATE_DELTA`s applied
 * since — and replay it whenever a webview (re)mounts. `RENDER` is a full
 * document render, so replaying `RENDER` then every delta is idempotent: it can
 * run on each READY without double-applying.
 */
interface IInsetSurfaceState {
	/** Latest full-render document for the surface, or `undefined` if none yet. */
	initialDoc: unknown | undefined;
	/** Ordered `STATE_DELTA` messages applied since the latest `RENDER`. */
	readonly deltas: HostToInsetMessage[];
}

const surfaceStates = new Map<string, IInsetSurfaceState>();

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
 *
 * Note: this deliberately does NOT drop the surface's replay state — that must
 * survive part disposal so the next part (after scroll-back) can rebuild. State
 * is cleared only on an explicit `DISPOSE` message (surface teardown).
 */
export function deregisterInset(surfaceId: string, inset: ChatGenerativeUIInsetPart): void {
	if (insets.get(surfaceId) === inset) {
		insets.delete(surfaceId);
	}
}

/**
 * Seed the initial document for a surface the first time a part renders it.
 * The part's own first `RENDER(initialDoc)` is posted directly to its webview
 * (not through {@link postToSurface}), so the registry would otherwise never
 * learn it. Does not clobber state already accumulated from earlier renders of
 * the same surface (e.g. a later push raced ahead of a scroll-back re-render).
 */
export function seedInsetInitialDoc(surfaceId: string, initialDoc: unknown): void {
	if (initialDoc === undefined) {
		return;
	}
	const state = surfaceStates.get(surfaceId);
	if (!state) {
		surfaceStates.set(surfaceId, { initialDoc, deltas: [] });
	} else if (state.initialDoc === undefined) {
		state.initialDoc = initialDoc;
	}
}

/**
 * The ordered messages a freshly-(re)mounted inset must replay to reach the
 * surface's current state: the latest `RENDER` (if any) followed by every
 * `STATE_DELTA` recorded since. Empty if the surface has no known state.
 */
export function getInsetReplay(surfaceId: string): HostToInsetMessage[] {
	const state = surfaceStates.get(surfaceId);
	if (!state) {
		return [];
	}
	const replay: HostToInsetMessage[] = [];
	if (state.initialDoc !== undefined) {
		replay.push({ type: 'RENDER', doc: state.initialDoc });
	}
	replay.push(...state.deltas);
	return replay;
}

/**
 * Fold a host→inset message into the surface's replay state. `RENDER` replaces
 * the document and drops superseded deltas (bounding growth); `STATE_DELTA`
 * appends; `DISPOSE` discards the surface entirely.
 */
function recordSurfaceMessage(surfaceId: string, msg: HostToInsetMessage): void {
	switch (msg.type) {
		case 'RENDER': {
			const state = surfaceStates.get(surfaceId);
			if (state) {
				state.initialDoc = msg.doc;
				state.deltas.length = 0;
			} else {
				surfaceStates.set(surfaceId, { initialDoc: msg.doc, deltas: [] });
			}
			break;
		}
		case 'STATE_DELTA': {
			let state = surfaceStates.get(surfaceId);
			if (!state) {
				state = { initialDoc: undefined, deltas: [] };
				surfaceStates.set(surfaceId, state);
			}
			state.deltas.push(msg);
			break;
		}
		case 'DISPOSE': {
			surfaceStates.delete(surfaceId);
			break;
		}
	}
}

/**
 * INTERNAL command (underscore = not in the command palette).
 *
 * Dumb pipe: record `msg` into the surface's replay state (so a part recreated
 * after scroll-out can rebuild) and forward it to the live inset (if any) via
 * `postToInset`. No A2UI logic lives here. Forwarding is a no-op if the surface
 * is offscreen/disposed, which is harmless — the recorded state carries it.
 */
CommandsRegistry.registerCommand('_a2ui.postToSurface', (_accessor, surfaceId: string, msg: HostToInsetMessage): void => {
	recordSurfaceMessage(surfaceId, msg);
	insets.get(surfaceId)?.postToInset(msg);
});
