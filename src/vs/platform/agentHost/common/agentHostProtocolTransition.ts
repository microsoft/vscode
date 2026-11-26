/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import { vObj, vUnknown } from '../../../base/common/validation.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from './agentHostChannelTelemetry.js';
import { isNativeAgentHost } from './meta/agentHostSessionUrisMeta.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { ChannelReceiveLimits } from './state/protocol/common/state.js';
import { ChangesetFileStatus, type CanvasState, type ChangesetFile, type RootState, type SessionSummary } from './state/sessionState.js';

// Remove this compatibility layer soon after the pre-sync to released AHP 1.1 transition finishes.

const receiveLimitsValidator = vObj({ windowBytes: vUnknown(), maxFrameBytes: vUnknown(), maximumFrameBytes: vUnknown() });

export function withLegacyChannelReceiveLimits(limits: ChannelReceiveLimits): ChannelReceiveLimits & { maximumFrameBytes: number } {
	return { ...limits, maximumFrameBytes: limits.maxFrameBytes };
}

export function readChannelReceiveLimits(value: unknown): ChannelReceiveLimits {
	const result = receiveLimitsValidator.validate(value);
	if (!result.error && isObject(value)) {
		const windowBytes = result.content.windowBytes;
		const maxFrameBytes = Object.hasOwn(value, 'maxFrameBytes') ? result.content.maxFrameBytes : result.content.maximumFrameBytes;
		if (typeof windowBytes === 'number' && Number.isSafeInteger(windowBytes) && windowBytes > 0
			&& typeof maxFrameBytes === 'number' && Number.isSafeInteger(maxFrameBytes) && maxFrameBytes >= 1024) {
			return { windowBytes, maxFrameBytes };
		}
	}
	throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'Invalid channel receive limits');
}

export function getCanvasUri(canvas: CanvasState): string | undefined {
	const legacy: CanvasState & { url?: string } = canvas;
	return canvas.uri !== undefined ? canvas.uri : legacy.url;
}

export function withLegacyCanvasState(canvas: CanvasState): CanvasState & { url?: string } {
	const legacy: CanvasState & { url?: string } = canvas;
	const { url: _url, ...state } = legacy;
	return { ...state, ...(canvas.uri !== undefined ? { url: canvas.uri } : {}) };
}

export function getChangesetFileStatus(file: ChangesetFile): number {
	const legacy: ChangesetFile & { isEditing?: boolean } = file;
	return file.status !== undefined ? file.status : legacy.isEditing === true ? ChangesetFileStatus.Editing : 0;
}

export function withLegacyChangesetFile(file: ChangesetFile): ChangesetFile & { isEditing?: boolean } {
	return file.status === undefined ? file : { ...file, isEditing: !!(file.status & ChangesetFileStatus.Editing) };
}

export function getSessionAnnotationsResource(session: Pick<SessionSummary, 'annotations'>, sessionResource: string, host: InitializeResult | undefined, root?: RootState): string | undefined {
	// Only native hosts used the unadvertised suffix; conforming peers own their resource addresses.
	return session.annotations?.resource ?? (isNativeAgentHost(host, root) ? `${sessionResource}/annotations` : undefined);
}
