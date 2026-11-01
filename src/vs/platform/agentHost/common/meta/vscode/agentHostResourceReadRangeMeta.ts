/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vNumber, vObj, vOptionalProp } from '../../../../../base/common/validation.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';

/**
 * Initialize capability: the host honors {@link AgentHostResourceReadRangeMetaKey} on `resourceRead` for every
 * resource it can read. Interim until the protocol has typed ranges (microsoft/agent-host-protocol#554).
 */
export const AgentHostResourceReadRangesCapabilityMetaKey = 'vscode.resourceReadRanges';

/** `resourceRead` request `_meta` key carrying the byte range to read. */
export const AgentHostResourceReadRangeMetaKey = 'vscode.range';

/** A byte range of a resource: `length` bytes from `position`, or everything from `position` when `length` is absent. */
export interface IAgentHostResourceReadRange {
	readonly position: number;
	readonly length?: number;
}

const resourceReadRangeValidator = vObj({
	position: vNumber(),
	length: vOptionalProp(vNumber()),
});

/** Whether the host reads byte ranges for `resourceRead` (see {@link AgentHostResourceReadRangesCapabilityMetaKey}). */
export function supportsAgentHostResourceReadRanges(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostResourceReadRangesCapabilityMetaKey] === true;
}

/**
 * Reads the byte range of a `resourceRead` request: `undefined` when the request carries none (read everything),
 * `'invalid'` when the value is present but is not non-negative safe integers.
 */
export function readAgentHostResourceReadRange(params: { readonly _meta?: Readonly<Record<string, unknown>> }): IAgentHostResourceReadRange | undefined | 'invalid' {
	const value = params._meta?.[AgentHostResourceReadRangeMetaKey];
	if (value === undefined) {
		return undefined;
	}
	const { content, error } = resourceReadRangeValidator.validate(value);
	if (error || !isByteCount(content.position) || (content.length !== undefined && !isByteCount(content.length))) {
		return 'invalid';
	}
	return content.length === undefined ? { position: content.position } : { position: content.position, length: content.length };
}

/** Returns request metadata carrying {@link range}, preserving unrelated keys. */
export function withAgentHostResourceReadRange(meta: Readonly<Record<string, unknown>> | undefined, range: IAgentHostResourceReadRange): Record<string, unknown> {
	return { ...meta, [AgentHostResourceReadRangeMetaKey]: range.length === undefined ? { position: range.position } : { position: range.position, length: range.length } };
}

function isByteCount(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}
