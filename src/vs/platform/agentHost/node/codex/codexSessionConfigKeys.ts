/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { ReasoningSummary } from './protocol/generated/ReasoningSummary.js';
import type { Personality } from './protocol/generated/Personality.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { AskForApproval } from './protocol/generated/v2/AskForApproval.js';
import type { ModeKind } from './protocol/generated/ModeKind.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';

export const enum CodexSessionConfigKey {
	ApprovalPolicy = 'codex.approvalPolicy',
	SandboxMode = 'codex.sandboxMode',
	AdditionalDirectories = 'codex.additionalDirectories',
	NetworkAccessEnabled = 'codex.networkAccessEnabled',
	WebSearchMode = 'codex.webSearchMode',
	ModelReasoningEffort = 'codex.modelReasoningEffort',
	Personality = 'codex.personality',
	ReasoningSummary = 'codex.reasoningSummary',
}

export type CodexApprovalPolicy = Extract<AskForApproval, 'never' | 'on-request' | 'on-failure' | 'untrusted'>;

export function narrowApprovalPolicy(value: unknown): CodexApprovalPolicy | undefined {
	switch (value) {
		case 'never':
		case 'on-request':
		case 'on-failure':
		case 'untrusted':
			return value;
		default:
			return undefined;
	}
}

export function narrowSandboxMode(value: unknown): SandboxMode | undefined {
	switch (value) {
		case 'read-only':
		case 'workspace-write':
		case 'danger-full-access':
			return value;
		default:
			return undefined;
	}
}

export function narrowAdditionalDirectories(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function narrowBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export function narrowWebSearchMode(value: unknown): WebSearchMode | undefined {
	switch (value) {
		case 'disabled':
		case 'cached':
		case 'live':
			return value;
		default:
			return undefined;
	}
}

export function narrowReasoningEffort(value: unknown): ReasoningEffort | undefined {
	switch (value) {
		case 'none':
		case 'minimal':
		case 'low':
		case 'medium':
		case 'high':
		case 'xhigh':
			return value;
		default:
			return undefined;
	}
}

export function narrowPersonality(value: unknown): Personality | undefined {
	switch (value) {
		case 'none':
		case 'friendly':
		case 'pragmatic':
			return value;
		default:
			return undefined;
	}
}

export function narrowReasoningSummary(value: unknown): ReasoningSummary | undefined {
	switch (value) {
		case 'auto':
		case 'concise':
		case 'detailed':
		case 'none':
			return value;
		default:
			return undefined;
	}
}

/**
 * Map the platform-generic {@link SessionMode} (Agent Mode) to codex's native
 * collaboration {@link ModeKind}: VS Code "Plan" → codex `plan`, "Interactive"
 * → codex `default`.
 */
export function collaborationModeKind(value: unknown): ModeKind {
	return value === 'plan' ? 'plan' : 'default';
}
