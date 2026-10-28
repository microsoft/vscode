/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import type { ProtectedResourceMetadata } from '../state/protocol/state.js';

export const NATIVE_LOKI_SCOPE = '42c8f7bd-c7a8-4ba9-bc1c-91edfb716247/.default';
export const NATIVE_EMU_SCOPE = '12f6db80-0741-4a7e-b9c5-b85d737b3a31/user_impersonation';
export const NATIVE_LOKI_AUTHORITY = 'https://login.microsoftonline.com/organizations';
export const NATIVE_LOKI_BASE_URLS = [
	'https://df.loki.delve.office.com/api/v1/llmapi',
	'https://msit.loki.delve.office.com/api/v1/llmapi',
] as const;
export const NATIVE_LOKI_PROTECTED_RESOURCE: ProtectedResourceMetadata = {
	resource: NATIVE_LOKI_BASE_URLS[0],
	resource_name: localize('nativeLoki.resource', "Microsoft 365 Copilot (Local Runtime)"),
	authorization_servers: [NATIVE_LOKI_AUTHORITY],
	scopes_supported: [NATIVE_LOKI_SCOPE],
	required: true,
};
export const NATIVE_EMU_PROTECTED_RESOURCE: ProtectedResourceMetadata = {
	resource: 'https://github.com/login/oauth/access_token',
	resource_name: localize('nativeEmu.resource', "GitHub Copilot via Microsoft (Local Runtime)"),
	authorization_servers: [NATIVE_LOKI_AUTHORITY],
	scopes_supported: [NATIVE_EMU_SCOPE],
	required: false,
};

const nativeLokiAuthenticationKey = 'vscode.nativeLokiAuthentication';
const nativeLokiActiveAccountKey = 'vscode.nativeLokiActiveAccountId';
const nativeCopilotModelProviderKey = 'vscode.nativeCopilotModelProvider';

/** Temporary VS Code-only metadata for the opt-in native-runtime experiment. */
export interface INativeLokiAuthentication {
	readonly accountId: string;
	readonly requestId?: string;
}

export interface INativeLokiProtectedResource extends ProtectedResourceMetadata {
	readonly _meta?: Record<string, unknown>;
}

export function nativeLokiAuthenticationMeta(authentication: INativeLokiAuthentication): Record<string, unknown> {
	return { [nativeLokiAuthenticationKey]: authentication };
}

/** The accepted account is separate from the configured account used to select a token. */
export function nativeLokiActiveAccountMeta(accountId: string): Record<string, unknown> {
	return { [nativeLokiActiveAccountKey]: accountId };
}

export function readNativeLokiActiveAccountId(value: INativeLokiProtectedResource | undefined): string | undefined {
	const accountId = value?._meta?.[nativeLokiActiveAccountKey];
	return typeof accountId === 'string' && accountId ? accountId : undefined;
}

export function nativeCopilotModelProviderMeta(providerId: string): Record<string, unknown> {
	return { [nativeCopilotModelProviderKey]: providerId };
}

export function readNativeCopilotModelProvider(value: { readonly _meta?: Record<string, unknown> } | undefined): string | undefined {
	const providerId = value?._meta?.[nativeCopilotModelProviderKey];
	return providerId === 'copilot' || providerId === 'loki'
		|| (typeof providerId === 'string' && providerId.startsWith('loki:') && providerId.length > 'loki:'.length)
		? providerId : undefined;
}

export function getNativeRawModelId(modelId: string): string {
	if (!modelId.startsWith('@native/')) {
		return modelId;
	}
	const separator = modelId.indexOf('/', '@native/'.length);
	if (separator < 0 || separator === modelId.length - 1) {
		throw new Error(localize('nativeLoki.invalidQualifiedModelId', "The native runtime returned an invalid model identifier."));
	}
	return modelId.slice(separator + 1);
}

export function readNativeLokiAuthentication(value: INativeLokiProtectedResource | undefined): INativeLokiAuthentication | undefined {
	const data = value?._meta?.[nativeLokiAuthenticationKey];
	if (!isObject(data)) {
		return undefined;
	}
	const { accountId, requestId } = data as Record<string, unknown>;
	if (typeof accountId !== 'string' || !accountId
		|| (requestId !== undefined && (typeof requestId !== 'string' || !requestId))) {
		return undefined;
	}
	return { accountId, ...(typeof requestId === 'string' ? { requestId } : {}) };
}

export function isNativeEntraTokenReply(value: { readonly resource: string; readonly _meta?: Record<string, unknown> }): boolean {
	return (isNativeLokiResource(value.resource) || isNativeEmuResource(value.resource))
		&& readNativeLokiAuthentication(value)?.requestId !== undefined;
}

export function isNativeLokiResource(resource: string): boolean {
	return NATIVE_LOKI_BASE_URLS.some(baseUrl => baseUrl === resource);
}

export function isNativeEmuResource(resource: string): boolean {
	return resource === NATIVE_EMU_PROTECTED_RESOURCE.resource;
}
