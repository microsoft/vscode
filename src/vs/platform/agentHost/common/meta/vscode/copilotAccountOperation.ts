/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const key = 'vscode.copilot.accountOperation';

export type CopilotAccountOperation =
	| { readonly kind: 'discover' }
	| { readonly kind: 'select'; readonly discoveryId: string; readonly selectionId: string };

export function readCopilotAccountOperation(source: { readonly _meta?: Record<string, unknown> }): CopilotAccountOperation | undefined {
	const raw = source._meta?.[key];
	if (!isObject(raw)) {
		return undefined;
	}
	const value = raw as Record<string, unknown>;
	if (value.kind === 'discover') {
		return { kind: 'discover' };
	}
	if (typeof value.discoveryId !== 'string' || !value.discoveryId) {
		return undefined;
	}
	return value.kind === 'select' && typeof value.selectionId === 'string' && value.selectionId
		? { kind: 'select', discoveryId: value.discoveryId, selectionId: value.selectionId }
		: undefined;
}

export function copilotAccountOperationMeta(operation: CopilotAccountOperation): Record<string, unknown> {
	return { [key]: { ...operation } };
}
