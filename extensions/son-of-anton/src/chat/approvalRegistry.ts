/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ApprovalDecision, ApprovalRequest } from '../tools/registry';

/**
 * Module-level approval-callback registry. The chat panel registers its
 * `requestApproval` adapter when it opens and clears it on dispose; the
 * agent-stack tool context's `requestApproval` option consults the
 * registry on every call, delegating to the active panel when one is
 * registered and falling back to `defaultModalApproval` otherwise.
 *
 * Why a module-level slot rather than a constructor argument:
 *
 *  - The agent-stack tool context is built once at activation, before
 *    any chat panel exists. Threading a callback at construction would
 *    force per-turn context rebuilds or a reactive subscription wired
 *    through the AgentStack interface — both heavier than this slot.
 *  - At most one chat panel is "active" at a time on the IDE side; the
 *    sidebar provider re-uses the same panel instance.
 *  - Surfaces without a chat panel (palette `sota.openTaskBoard`,
 *    programmatic agent runs in tests) get the modal fallback so they
 *    never silently auto-approve writes / shell calls.
 *
 * The registry is intentionally minimal — no event subscription, no
 * priority ladder. If we ever need multiple concurrent surfaces with
 * different approval policies, this becomes a proper service with a
 * scoped resolver.
 */

let activeCallback: ((request: ApprovalRequest) => Promise<ApprovalDecision>) | undefined;

/**
 * Register `callback` as the active approval handler. Replaces any
 * existing registration. Typically called from
 * `ChatPanel.createOrShow` so the panel's webview-card flow handles
 * approvals while it's open.
 */
export function setActiveApproval(callback: (request: ApprovalRequest) => Promise<ApprovalDecision>): void {
	activeCallback = callback;
}

/**
 * Clear the active approval handler. Typically called from the chat
 * panel's `dispose` so the agent-stack context falls back to
 * `defaultModalApproval` when the panel closes.
 */
export function clearActiveApproval(): void {
	activeCallback = undefined;
}

/**
 * Look up the current active approval handler. Returns `undefined`
 * when no chat panel has registered one — callers fall back to the
 * exported `defaultModalApproval` from `tools/registry.ts`.
 */
export function getActiveApproval(): ((request: ApprovalRequest) => Promise<ApprovalDecision>) | undefined {
	return activeCallback;
}
