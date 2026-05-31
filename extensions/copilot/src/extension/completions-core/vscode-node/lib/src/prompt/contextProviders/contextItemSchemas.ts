/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic } from 'vscode';
import { URI } from '../../../../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import {
	CodeSnippet,
	ContextItemOrigin,
	DiagnosticBag,
	SupportedContextItem,
	SupportedContextItemType,
	Trait,
} from '../../../../types/src';
import { ICompletionsLogTargetService, logger } from '../../logger';
import { ResolvedContextItem } from '../contextProviderRegistry';

namespace ContextItemSchema {
	export function is(item: SupportedContextItem): boolean {
		if (item.importance !== undefined) {
			if (typeof item.importance !== 'number' || !Number.isInteger(item.importance) || item.importance < 0 || item.importance > 100) {
				return false;
			}
		}
		if (item.id !== undefined) {
			if (typeof item.id !== 'string') {
				return false;
			}
		}
		if (item.origin !== undefined) {
			if (!ContextItemOrigin.is(item.origin)) {
				return false;
			}
		}
		return true;
	}
}

namespace TraitSchema {
	export function is(item: SupportedContextItem): item is Trait {
		if (!ContextItemSchema.is(item)) {
			return false;
		}
		const candidate = item as Trait;
		return typeof candidate.name === 'string' && typeof candidate.value === 'string';
	}
}

namespace CodeSnippetSchema {
	export function is(item: SupportedContextItem): item is CodeSnippet {
		if (!ContextItemSchema.is(item)) {
			return false;
		}
		const candidate = item as CodeSnippet;
		if (typeof candidate.uri !== 'string' || typeof candidate.value !== 'string') {
			return false;
		}
		if (candidate.additionalUris === undefined) {
			return true;
		}
		if (!Array.isArray(candidate.additionalUris)) {
			return false;
		}
		for (const uri of candidate.additionalUris) {
			if (typeof uri !== 'string') {
				return false;
			}
		}
		return true;
	}
}

namespace DiagnosticBagSchema {
	export function is(item: SupportedContextItem): item is DiagnosticBag {
		if (!ContextItemSchema.is(item)) {
			return false;
		}
		const candidate = item as DiagnosticBag;
		if (!(URI.isUri(candidate.uri))) {
			return false;
		}
		if (!Array.isArray(candidate.values)) {
			return false;
		}
		for (const diagnostic of candidate.values) {
			if (!(diagnostic instanceof Diagnostic)) {
				return false;
			}
		}
		return true;
	}
}

namespace SupportedContextItemSchema {
	export function is(item: SupportedContextItem): SupportedContextItemType | undefined {
		if (TraitSchema.is(item)) {
			return 'Trait';
		} else if (CodeSnippetSchema.is(item)) {
			return 'CodeSnippet';
		} else if (DiagnosticBagSchema.is(item)) {
			return 'DiagnosticBag';
		}
		return undefined;
	}
}

/**
 *
 * Internal types and validation functions for context items
 */

/**
 * Construct the final types, which may include required properties that the base types do not have.
 */

export type TraitWithId = Trait & { id: string; type: 'Trait' };
export type CodeSnippetWithId = CodeSnippet & { id: string; type: 'CodeSnippet' };
export type DiagnosticBagWithId = DiagnosticBag & { id: string; type: 'DiagnosticBag' };
export type SupportedContextItemWithId = TraitWithId | CodeSnippetWithId | DiagnosticBagWithId;

export function filterContextItemsByType<S extends SupportedContextItemType>(
	resolvedContextItems: ResolvedContextItem[],
	type: S
): ResolvedContextItem<Extract<SupportedContextItemWithId, { type: S }>>[] {
	return resolvedContextItems
		.map(item => {
			const filteredData = item.data.filter(data => data.type === type) as Extract<
				SupportedContextItemWithId,
				{ type: S }
			>[];

			return filteredData.length > 0 ? { ...item, data: filteredData } : undefined;
		})
		.filter(r => r !== undefined) as ResolvedContextItem<Extract<SupportedContextItemWithId, { type: S }>>[];
}

type SupportedContextItemWithType = SupportedContextItem & { type: SupportedContextItemType };

export function filterSupportedContextItems(
	contextItems: SupportedContextItem[]
): [SupportedContextItemWithType[], number] {
	const filteredItems: SupportedContextItemWithType[] = [];
	let invalidItemsCounter = 0;

	contextItems.forEach(item => {
		const type = SupportedContextItemSchema.is(item);
		if (type !== undefined) {
			filteredItems.push({
				...item,
				type,
			});
		} else {
			invalidItemsCounter++;
		}
	});

	return [filteredItems, invalidItemsCounter];
}

/**
 *
 * Only allow alphanumeric characters and hyphens to remove symbols that could
 * be problematic when used as prompt components keys.
 */
function validateContextItemId(id: string): boolean {
	return id.length > 0 && id.replaceAll(/[^a-zA-Z0-9-]/g, '').length === id.length;
}

/**
 * Assigns a random ID if it wasn't assigned by the context provider.
 * Invalid or duplicate IDs are replaced with valid ones and logged to avoid dropping the context
 * and worsen the user experience.
 */
export function addOrValidateContextItemsIDs(
	accessor: ServicesAccessor,
	contextItems: SupportedContextItemWithType[]
): SupportedContextItemWithId[] {
	const seenIds = new Set<string>();
	const logTarget = accessor.get(ICompletionsLogTargetService);

	const contextItemsWithId: SupportedContextItemWithId[] = [];
	for (const item of contextItems) {
		let id = item.id ?? generateUuid();
		if (!validateContextItemId(id)) {
			const newID = generateUuid();
			logger.error(logTarget, `Invalid context item ID ${id}, replacing with ${newID}`);
			id = newID;
		}
		if (seenIds.has(id)) {
			const newID = generateUuid();
			logger.error(logTarget, `Duplicate context item ID ${id}, replacing with ${newID}`);
			id = newID;
		}
		seenIds.add(id);
		contextItemsWithId.push({ ...item, id } as SupportedContextItemWithId);
	}
	return contextItemsWithId;
}
