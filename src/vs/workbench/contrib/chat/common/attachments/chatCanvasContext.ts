/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCanvasContextReference, withCanvasContextReferences, type ICanvasContextReference } from '../../../../../platform/agentHost/common/agentHostCanvasContext.js';
import type { Message } from '../../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatRequestVariableEntry, IGenericChatRequestVariableEntry } from './chatVariableEntries.js';

export const CanvasContextVariableMid = 'sessionCanvasContext';

export interface ICanvasContextVariableValue extends ICanvasContextReference {
	readonly $mid: typeof CanvasContextVariableMid;
}

export function toCanvasContextVariableEntry(reference: ICanvasContextReference, name: string): IGenericChatRequestVariableEntry & { value: ICanvasContextVariableValue } {
	return {
		kind: 'generic',
		id: `session-canvas-context:${reference.resource}`,
		name,
		value: { $mid: CanvasContextVariableMid, resource: reference.resource, incarnation: reference.incarnation },
	};
}

export function getCanvasContextReference(entry: IChatRequestVariableEntry): ICanvasContextReference | undefined {
	const value = entry.value;
	if (entry.kind !== 'generic' || typeof value !== 'object' || value === null
		|| Object.getOwnPropertyDescriptor(value, '$mid')?.value !== CanvasContextVariableMid) {
		return undefined;
	}
	if (!isCanvasContextReference(value)) {
		throw new Error('Invalid canvas context attachment.');
	}
	return { resource: value.resource, incarnation: value.incarnation };
}

export function isCanvasContextVariableEntry(entry: IChatRequestVariableEntry): entry is IGenericChatRequestVariableEntry & { value: ICanvasContextVariableValue } {
	return getCanvasContextReference(entry) !== undefined;
}

export function collectCanvasContextReferences(entries: readonly IChatRequestVariableEntry[]): ICanvasContextReference[] {
	const references = new Map<string, ICanvasContextReference>();
	for (const entry of entries) {
		const reference = getCanvasContextReference(entry);
		if (reference) {
			const previous = references.get(reference.resource);
			if (previous && previous.incarnation !== reference.incarnation) {
				throw new Error('A canvas attachment contains conflicting incarnations.');
			}
			references.set(reference.resource, reference);
		}
	}
	return [...references.values()];
}

export function withCanvasVariableContext(message: Message, entries: readonly IChatRequestVariableEntry[]): Message {
	const references = collectCanvasContextReferences(entries);
	return references.length ? withCanvasContextReferences(message, references) : message;
}
