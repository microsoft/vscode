/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';

/** A version token in a model id, e.g. the `5.6` in `example-5.6-sol`. */
const VERSION_TOKEN = /^v?(\d+(?:\.\d+)*)$/;

/** Where a model sits in its product line. */
export interface IModelLine {
	/** The line the model belongs to, e.g. `example-sol` for `example-5.6-sol`. */
	readonly line: string;
	/** The version within that line, most significant part first. */
	readonly version: readonly number[];
}

/**
 * Splits a model id into the product line and the version within it, by taking out
 * the one token that reads as a version:
 *
 * - `example-5.6-sol` is `example-sol` at 5.6
 * - `example-5.5` is `example` at 5.5
 * - `example-code-1.1-lite` is `example-code-lite` at 1.1
 *
 * An id with no version token is a line of its own, which is what keeps an id this
 * cannot read out of the way of the rule rather than buried by it.
 */
export function parseModelLine(id: string): IModelLine {
	const rest: string[] = [];
	let version: readonly number[] | undefined;
	for (const token of id.split('-')) {
		const match = !version ? VERSION_TOKEN.exec(token) : undefined;
		if (match) {
			version = match[1].split('.').map(Number);
		} else {
			rest.push(token);
		}
	}
	return { line: rest.join('-'), version: version ?? [] };
}

/**
 * Tokens in a model id that mark an early-access build. These come and go faster
 * than a list of them could be kept, so they are held out of the shortlist without
 * anyone naming them. They stay selectable further down.
 */
const EARLY_ACCESS_TOKENS: ReadonlySet<string> = new Set(['eap', 'experimental']);

/** Whether the id marks an early-access build, which never leads the list. */
export function isEarlyAccessModel(id: string): boolean {
	return id.split('-').some(token => EARLY_ACCESS_TOKENS.has(token));
}

/** Orders two versions, longer runs of equal parts counting as newer. */function compareVersions(left: readonly number[], right: readonly number[]): number {
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const difference = (left[i] ?? 0) - (right[i] ?? 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

/**
 * The newest model of each product line, which is the shortlist the picker leads with.
 *
 * Derived rather than listed, so a new version surfaces itself and the one it replaces
 * steps back without anyone editing a list. Models are grouped by vendor as well, since
 * two providers can ship the same line name.
 */
export function latestOfEachLine(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
): ILanguageModelChatMetadataAndIdentifier[] {
	const newest = new Map<string, { model: ILanguageModelChatMetadataAndIdentifier; version: readonly number[] }>();
	for (const model of models) {
		const { line, version } = parseModelLine(model.metadata.id);
		const key = `${model.metadata.vendor}/${line}`;
		const current = newest.get(key);
		if (!current || compareVersions(version, current.version) > 0) {
			newest.set(key, { model, version });
		}
	}
	return [...newest.values()].map(entry => entry.model);
}
