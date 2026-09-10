/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICodexDelegation {
	readonly sourceThreadId: string;
	readonly input: string;
}

const CODEX_DELEGATION_PATTERN = /^\s*<codex_delegation>\s*<source_thread_id>\s*(?<sourceThreadId>[\s\S]*?)\s*<\/source_thread_id>\s*<input>\s*(?<input>[\s\S]*?)\s*<\/input>\s*<\/codex_delegation>\s*$/i;

/** Parses the private envelope used when one Codex thread sends a message to another. */
export function parseCodexDelegation(text: string): ICodexDelegation | undefined {
	const groups = CODEX_DELEGATION_PATTERN.exec(text)?.groups;
	if (!groups) {
		return undefined;
	}
	const sourceThreadId = decodeXmlText(groups['sourceThreadId']).trim();
	if (!sourceThreadId) {
		return undefined;
	}
	return {
		sourceThreadId,
		input: decodeXmlText(groups['input']).trim(),
	};
}

/** Returns text suitable for a thread title, hiding malformed private envelopes. */
export function codexDelegationDisplayText(text: string | null | undefined): string | undefined {
	if (!text) {
		return undefined;
	}
	const delegation = parseCodexDelegation(text);
	if (delegation) {
		return delegation.input || undefined;
	}
	return /^\s*<codex_delegation>/i.test(text) ? undefined : text;
}

function decodeXmlText(text: string): string {
	return text
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}
