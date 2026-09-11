/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { CloseCanvasParams, InvokeCanvasActionParams, InvokeCanvasActionResult, ListCanvasTypesParams, ListCanvasTypesResult, OpenCanvasParams, OpenCanvasResult, ResolveCanvasSourceParams, ResolveCanvasSourceResult, RestartCanvasProviderParams } from './state/protocol/channels-canvas/commands.js';
import { CanvasSourceKind, CANVAS_IDENTITY_FIELD_MAX_LENGTH, CANVAS_REQUEST_ID_MAX_LENGTH, type CanvasIdentityKey, type CanvasSource, type CanvasState } from './state/protocol/channels-canvas/state.js';
import { JsonRpcErrorCodes, ProtocolError } from './state/sessionProtocol.js';
import { isAgentHostCanvasJson } from './agentHostCanvases.js';
import { ActionType, type StateAction } from './state/sessionActions.js';
import type { CanvasAction } from './state/protocol/action-origin.generated.js';
import type { Icon } from './state/protocol/common/state.js';

export const AgentHostCanvasScheme = 'ahp-canvas';

export function isCanvasAction(action: StateAction): action is CanvasAction {
	return action.type === ActionType.CanvasAvailabilityChanged || action.type === ActionType.CanvasIncarnationChanged
		|| action.type === ActionType.CanvasTitleChanged || action.type === ActionType.CanvasTrustChanged;
}

export interface IAgentHostCanvasProtocol {
	readonly supported: boolean;
	/** Negotiates execution support without creating or restoring a session. */
	initialize?(previewEnabled?: boolean): Promise<void>;
	listTypes(params: ListCanvasTypesParams): Promise<ListCanvasTypesResult>;
	open(clientId: string, params: OpenCanvasParams): Promise<OpenCanvasResult>;
	resolveSource(params: ResolveCanvasSourceParams): ResolveCanvasSourceResult;
	invokeAction(clientId: string, params: InvokeCanvasActionParams): Promise<InvokeCanvasActionResult>;
	restart(clientId: string, params: RestartCanvasProviderParams): Promise<void>;
	close(clientId: string, params: CloseCanvasParams): Promise<void>;
}

export interface IAgentHostCanvasProtocolClient {
	getState(resource: string): Promise<CanvasState>;
	listTypes(params: ListCanvasTypesParams): Promise<ListCanvasTypesResult>;
	open(params: OpenCanvasParams): Promise<OpenCanvasResult>;
	resolveSource(params: ResolveCanvasSourceParams): Promise<ResolveCanvasSourceResult>;
	invokeAction(params: InvokeCanvasActionParams): Promise<InvokeCanvasActionResult>;
	restart(params: RestartCanvasProviderParams): Promise<void>;
	close(params: CloseCanvasParams): Promise<void>;
}

export function isAgentHostCanvasUri(value: string): boolean {
	try {
		const uri = URI.parse(value, true);
		return uri.scheme === AgentHostCanvasScheme && !!uri.path && !uri.query && !uri.fragment && !uri.authority;
	} catch {
		return false;
	}
}

export function canvasSourceKey(source: CanvasSource): string {
	return source.kind === CanvasSourceKind.Extension ? `extension:${source.extensionId}` : `package:${source.sourceId}`;
}

export function canvasIdentityKey(identity: CanvasIdentityKey): string {
	return JSON.stringify([identity.chat, canvasSourceKey(identity.source), identity.canvasType, identity.instanceId]);
}

export function isCanvasIdentityKey(value: unknown): value is CanvasIdentityKey {
	if (!isRecord(value) || typeof value.chat !== 'string' || !isIdentityField(value.canvasType) || !isIdentityField(value.instanceId) || !isRecord(value.source)) {
		return false;
	}
	const source = value.source;
	return (source.version === undefined || typeof source.version === 'string' && source.version.length <= CANVAS_IDENTITY_FIELD_MAX_LENGTH)
		&& (source.kind === CanvasSourceKind.Extension ? isIdentityField(source.extensionId)
			: source.kind === CanvasSourceKind.Package && isIdentityField(source.sourceId) && typeof source.packageName === 'string' && source.packageName.length <= 512);
}

export function isCanvasIcon(value: unknown): value is Icon {
	return isRecord(value) && typeof value.src === 'string' && value.src.length > 0 && value.src.length <= 4096
		&& (value.contentType === undefined || typeof value.contentType === 'string' && value.contentType.length <= 128)
		&& (value.sizes === undefined || Array.isArray(value.sizes) && value.sizes.length <= 8 && value.sizes.every(size => typeof size === 'string' && size.length <= 32))
		&& (value.theme === undefined || value.theme === 'light' || value.theme === 'dark');
}

export function validateCanvasRequest(method: string, params: unknown): void {
	if (!isRecord(params) || typeof params.channel !== 'string' || params.channel.length > 8192) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A canvas request requires a bounded channel URI.');
	}
	if (method === 'listCanvasTypes' || method === 'resolveCanvasSource') {
		return;
	}
	if (typeof params.requestId !== 'string' || !params.requestId || params.requestId.length > CANVAS_REQUEST_ID_MAX_LENGTH
		|| (params.input !== undefined && !isAgentHostCanvasJson(params.input))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A canvas request requires a bounded request ID and JSON input.');
	}
	switch (method) {
		case 'openCanvas':
			if (typeof params.canvas !== 'string' || !isAgentHostCanvasUri(params.canvas) || !isCanvasIdentityKey(params.identity)
				|| typeof params.title !== 'string' || params.title.length > 512 || params.icon !== undefined && !isCanvasIcon(params.icon)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid canvas identity, title, or icon.');
			}
			break;
		case 'invokeCanvasAction':
			if (!isIdentityField(params.actionId)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A canvas action requires a bounded action ID.');
			}
		// The action and restart both require a non-reused endpoint generation.
		case 'restartCanvasProvider':
			if (!isIdentityField(params.incarnation)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A canvas operation requires its current incarnation.');
			}
			break;
		case 'closeCanvas':
			if (typeof params.revision !== 'number' || !Number.isSafeInteger(params.revision) || params.revision < 0) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Closing a canvas requires its current revision.');
			}
			break;
	}
}

function isIdentityField(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= CANVAS_IDENTITY_FIELD_MAX_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
