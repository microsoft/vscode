/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { AskForApproval } from './protocol/generated/v2/AskForApproval.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';

export const enum CodexSessionConfigKey {
	ApprovalPolicy = 'codex.approvalPolicy',
	SandboxMode = 'codex.sandboxMode',
	AdditionalDirectories = 'codex.additionalDirectories',
	NetworkAccessEnabled = 'codex.networkAccessEnabled',
	WebSearchMode = 'codex.webSearchMode',
	ModelReasoningEffort = 'codex.modelReasoningEffort',
}

export type CodexApprovalPolicy = Extract<AskForApproval, 'never' | 'on-request' | 'on-failure' | 'untrusted'>;

export function isCodexSupportedModel(id: string, name?: string): boolean {
	if (id.toLowerCase() === 'auto') {
		return false;
	}
	return /^(gpt-5|codex)/i.test(id) || /codex/i.test(name ?? '');
}

export function normalizeCodexModelId(id: string): string | undefined {
	if (isCodexSupportedModel(id)) {
		return id;
	}
	const slashIndex = id.lastIndexOf('/');
	if (slashIndex === -1 || slashIndex === id.length - 1) {
		return undefined;
	}
	const rawId = id.substring(slashIndex + 1);
	return isCodexSupportedModel(rawId) ? rawId : undefined;
}

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
