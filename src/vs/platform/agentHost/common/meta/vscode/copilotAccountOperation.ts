/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { readCopilotAccountContextValue, type CopilotAccountContext } from '../../copilotAccountContext.js';

const key = 'vscode.copilot.accountOperation';

export type CopilotAccountOperation =
	| { readonly kind: 'discover'; readonly context?: CopilotAccountContext }
	| { readonly kind: 'useLegacy'; readonly context: CopilotAccountContext }
	| { readonly kind: 'select'; readonly discoveryId: string; readonly selectionId: string };

export function readCopilotAccountOperation(source: { readonly _meta?: Record<string, unknown> }): CopilotAccountOperation | undefined {
	const raw = source._meta?.[key];
	if (!isObject(raw)) {
		return undefined;
	}
	const value = raw as Record<string, unknown>;
	switch (value.kind) {
		case 'discover': {
			if (value.context === undefined) {
				return { kind: 'discover' };
			}
			const context = readCopilotAccountContextValue(value.context);
			return context ? { kind: 'discover', context } : undefined;
		}
		case 'useLegacy': {
			const context = readCopilotAccountContextValue(value.context);
			return context ? { kind: 'useLegacy', context } : undefined;
		}
		case 'select':
			return typeof value.discoveryId === 'string' && value.discoveryId
				&& typeof value.selectionId === 'string' && value.selectionId
				? { kind: 'select', discoveryId: value.discoveryId, selectionId: value.selectionId }
				: undefined;
		default:
			return undefined;
	}
}

export function copilotAccountOperationMeta(operation: CopilotAccountOperation): Record<string, unknown> {
	return { [key]: { ...operation } };
}
