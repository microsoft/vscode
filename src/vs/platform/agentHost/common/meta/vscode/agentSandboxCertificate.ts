/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const sandboxCertificateKey = 'vscode.sandboxCertificate';
export const sandboxCertificateInstallationCapability = 'vscode.sandboxCertificate.install';
export const sandboxCertificateRotationCapability = 'vscode.sandboxCertificate.rotate';
export const sandboxCertificateRemovalCapability = 'vscode.sandboxCertificate.remove';

/** Installation requires an explicit host capability, not just a status observation. */
export function supportsSandboxCertificateInstallation(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[sandboxCertificateInstallationCapability] === true;
}

export function supportsSandboxCertificateRotation(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[sandboxCertificateRotationCapability] === true;
}

export function supportsSandboxCertificateRemoval(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[sandboxCertificateRemovalCapability] === true;
}

/** A host-cached observation, not a requirement to install a certificate or disable sandboxing. */
export interface IAgentSandboxCertificateStatus {
	readonly scopeId: string;
	readonly state: 'notRequired' | 'unsupported' | 'notInstalled' | 'installed' | 'error';
	readonly canInstall: boolean;
	readonly requiresRotation: boolean;
	readonly detail?: string;
}

/** Each chat has its own applicability; chats using the same runtime share a scope ID. */
export function readAgentSandboxCertificate(source: { readonly _meta?: Record<string, unknown> } | undefined, chat: string): IAgentSandboxCertificateStatus | undefined {
	const entry = readEntries(source?._meta)?.[chat];
	if (!isObject(entry)) {
		return undefined;
	}
	const value = entry as Record<string, unknown>;
	if (typeof value.scopeId !== 'string' || !value.scopeId
		|| (value.state !== 'notRequired' && value.state !== 'unsupported' && value.state !== 'notInstalled' && value.state !== 'installed' && value.state !== 'error')
		|| typeof value.canInstall !== 'boolean'
		|| typeof value.requiresRotation !== 'boolean'
		|| (value.detail !== undefined && typeof value.detail !== 'string')) {
		return undefined;
	}
	return {
		scopeId: value.scopeId,
		state: value.state,
		canInstall: value.canInstall,
		requiresRotation: value.requiresRotation,
		...(value.detail !== undefined ? { detail: value.detail } : {}),
	};
}

export function withAgentSandboxCertificate(meta: Record<string, unknown> | undefined, chat: string, status: IAgentSandboxCertificateStatus | undefined): Record<string, unknown> {
	const chats = { ...readEntries(meta) };
	if (status) {
		chats[chat] = status;
	} else {
		delete chats[chat];
	}
	const result = { ...meta };
	if (Object.keys(chats).length) {
		result[sandboxCertificateKey] = { version: 1, chats };
	} else {
		delete result[sandboxCertificateKey];
	}
	return result;
}

function readEntries(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	const value = meta?.[sandboxCertificateKey];
	if (!isObject(value)) {
		return undefined;
	}
	const slot = value as Record<string, unknown>;
	return slot.version === 1 && isObject(slot.chats) ? slot.chats as Record<string, unknown> : undefined;
}
