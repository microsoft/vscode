/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../../base/common/observable.js';

/**
 * Pure helpers for computing and mutating tool / tool-set enablement with tri-state semantics.
 *
 * The state shape mirrors {@link ChatSelectedTools} storage: a `toolSets` map and a `tools`
 * map, both keyed by id, where a missing entry means "enabled" (default-on, inverted storage).
 *
 * Read semantics (consistent with `ChatSelectedTools.entriesMap`): a tool that belongs to a
 * tool set is enabled when the tool set is enabled OR the tool itself is explicitly enabled.
 * This lets a tool set be turned off while individual member tools remain on (the "mixed"
 * tri-state), and is collapsed back to a single tool-set flag when all members are on.
 */
export interface IToolEnablementState {
	readonly toolSets: ReadonlyMap<string, boolean>;
	readonly tools: ReadonlyMap<string, boolean>;
}

export type TriState = boolean | 'mixed';

/** Whether a tool, considered as a member of `toolSetId`, is effectively enabled. */
export function isToolEnabledInSet(state: IToolEnablementState, toolSetId: string, toolId: string): boolean {
	const toolSetEnabled = state.toolSets.get(toolSetId) !== false;
	return toolSetEnabled || state.tools.get(toolId) === true;
}

/** Aggregate tri-state of a tool set computed from the effective state of its member tools. */
export function getToolSetTriState(state: IToolEnablementState, toolSetId: string, toolIds: readonly string[]): TriState {
	let anyOn = false;
	let anyOff = false;
	for (const toolId of toolIds) {
		if (isToolEnabledInSet(state, toolSetId, toolId)) {
			anyOn = true;
		} else {
			anyOff = true;
		}
		if (anyOn && anyOff) {
			return 'mixed';
		}
	}
	return anyOn;
}

/**
 * Counts the individual tools that are effectively enabled across the given tool sets.
 * `sets` should already be filtered to the tool sets surfaced to the user (e.g. via
 * `deprecated`).
 */
export function countEnabledTools(state: IToolEnablementState, sets: Iterable<{ readonly id: string; readonly toolIds: Iterable<string> }>): number {
	let count = 0;
	for (const set of sets) {
		for (const toolId of set.toolIds) {
			if (isToolEnabledInSet(state, set.id, toolId)) {
				count++;
			}
		}
	}
	return count;
}

/**
 * The subset of a tool set needed to count its enabled tools in the Chat Customizations surface.
 * {@link IToolSet} satisfies this shape.
 */
export interface ICountableToolSet {
	readonly id: string;
	readonly deprecated?: boolean;
	getTools(reader?: IReader): Iterable<{ readonly id: string }>;
}

/**
 * Counts the individual enabled tools across the tool sets surfaced as rows in the Chat
 * Customizations → Tools section: sets shown there (`!deprecated`) that currently expose at least
 * one tool.
 */
export function countEnabledCustomizationTools(toolSets: Iterable<ICountableToolSet>, state: IToolEnablementState, reader?: IReader): number {
	const sets: { id: string; toolIds: Iterable<string> }[] = [];
	for (const ts of toolSets) {
		if (ts.deprecated) {
			continue;
		}
		const toolIds = Array.from(ts.getTools(reader), t => t.id);
		if (toolIds.length === 0) {
			continue;
		}
		sets.push({ id: ts.id, toolIds });
	}
	return countEnabledTools(state, sets);
}

/** Returns a new state with every member tool of `toolSetId` set to `enabled`. */
export function setToolSetEnabled(state: IToolEnablementState, toolSetId: string, toolIds: readonly string[], enabled: boolean): IToolEnablementState {
	const toolSets = new Map(state.toolSets);
	const tools = new Map(state.tools);
	if (enabled) {
		// Default is enabled, so clearing the tool-set flag (and any per-tool overrides) enables all.
		toolSets.delete(toolSetId);
	} else {
		toolSets.set(toolSetId, false);
	}
	for (const toolId of toolIds) {
		tools.delete(toolId);
	}
	return { toolSets, tools };
}

/** Returns a new state with `toolId` (as a member of `toolSetId`) set to `enabled`. */
export function setToolEnabled(state: IToolEnablementState, toolSetId: string, toolIds: readonly string[], toolId: string, enabled: boolean): IToolEnablementState {
	const toolSets = new Map(state.toolSets);
	const tools = new Map(state.tools);

	if (toolSets.get(toolSetId) !== false) {
		// The tool set is currently enabled (all members on). To toggle a single member we must
		// "explode" into the mixed representation: disable the tool set and materialize an
		// explicit `true` for every member that should stay on.
		toolSets.set(toolSetId, false);
		for (const id of toolIds) {
			if (id === toolId) {
				if (enabled) {
					tools.set(id, true);
				} else {
					tools.delete(id);
				}
			} else {
				tools.set(id, true);
			}
		}
	} else {
		// Already mixed/off — just flip this one tool.
		if (enabled) {
			tools.set(toolId, true);
		} else {
			tools.delete(toolId);
		}
	}

	// Collapse back to a single enabled tool-set flag when all members are on again.
	const allOn = toolIds.every(id => tools.get(id) === true);
	if (allOn) {
		toolSets.delete(toolSetId);
		for (const id of toolIds) {
			tools.delete(id);
		}
	}

	return { toolSets, tools };
}
