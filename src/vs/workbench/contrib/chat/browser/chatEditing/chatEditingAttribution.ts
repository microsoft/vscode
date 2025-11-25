/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnnotatedStringEdit, AnnotatedStringReplacement, IEditData, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { IModifiedEntryTelemetryInfo } from '../../common/chatEditingService.js';

/**
 * Attribution data for a single edit region, implementing IEditData to work with AnnotatedStringEdit.
 *
 * The `join` method determines when adjacent edits can be merged:
 * - Same agent and request: merge (return this)
 * - Different agent or request: don't merge (return undefined)
 *
 * This allows tracking which agent made which edits at a fine-grained level,
 * and survives document changes through the edit composition/rebasing operations.
 */
export class AgentAttribution implements IEditData<AgentAttribution> {
	constructor(
		public readonly telemetryInfo: IModifiedEntryTelemetryInfo,
		public readonly requestId: string,
		public readonly undoStopId: string | undefined,
	) { }

	/**
	 * Attempts to join with another attribution when edits are adjacent.
	 * Only joins if both attributions are from the same request (same agent operation).
	 */
	join(other: AgentAttribution): AgentAttribution | undefined {
		if (this.requestId === other.requestId) {
			return this;
		}
		return undefined;
	}

	/**
	 * Creates a string key for identifying this attribution.
	 */
	toKey(): string {
		return `${this.telemetryInfo.sessionResource.toString()}::${this.requestId}`;
	}
}

/**
 * Special attribution for user edits that don't come from an agent.
 */
export class UserEditAttribution implements IEditData<UserEditAttribution> {
	public static readonly instance = new UserEditAttribution();

	private constructor() { }

	join(other: UserEditAttribution): UserEditAttribution | undefined {
		return this;
	}
}

/**
 * Union type for all edit attributions.
 */
export type EditAttribution = AgentAttribution | UserEditAttribution;

/**
 * Combined attribution that can represent either agent or user edits.
 * This allows the AnnotatedStringEdit to work with a single type while still
 * distinguishing between agent and user edits.
 */
export class CombinedAttribution implements IEditData<CombinedAttribution> {
	constructor(
		public readonly attribution: EditAttribution
	) { }

	join(other: CombinedAttribution): CombinedAttribution | undefined {
		if (this.attribution instanceof AgentAttribution && other.attribution instanceof AgentAttribution) {
			const joined = this.attribution.join(other.attribution);
			return joined ? new CombinedAttribution(joined) : undefined;
		}
		if (this.attribution instanceof UserEditAttribution && other.attribution instanceof UserEditAttribution) {
			return this;
		}
		// Don't join agent and user edits
		return undefined;
	}

	get isAgentEdit(): boolean {
		return this.attribution instanceof AgentAttribution;
	}

	get isUserEdit(): boolean {
		return this.attribution instanceof UserEditAttribution;
	}

	get agentAttribution(): AgentAttribution | undefined {
		return this.attribution instanceof AgentAttribution ? this.attribution : undefined;
	}
}

export type AttributedStringEdit = AnnotatedStringEdit<CombinedAttribution>;
export type AttributedStringReplacement = AnnotatedStringReplacement<CombinedAttribution>;

/**
 * Helper functions for creating attributed edits
 */
export const AttributedEdits = {
	empty: AnnotatedStringEdit.empty as AttributedStringEdit,

	fromAgentEdit(edit: StringEdit, attribution: AgentAttribution): AttributedStringEdit {
		const combined = new CombinedAttribution(attribution);
		return edit.mapData(() => combined);
	},

	fromUserEdit(edit: StringEdit): AttributedStringEdit {
		const combined = new CombinedAttribution(UserEditAttribution.instance);
		return edit.mapData(() => combined);
	},

	replace(range: OffsetRange, text: string, attribution: CombinedAttribution): AttributedStringEdit {
		return AnnotatedStringEdit.replace(range, text, attribution);
	},

	insert(offset: number, text: string, attribution: CombinedAttribution): AttributedStringEdit {
		return AnnotatedStringEdit.insert(offset, text, attribution);
	},
};

/**
 * Represents the attribution for a specific range in the current document.
 * This is used when mapping tracked edits to diff hunks.
 */
export interface AttributedRange {
	/**
	 * The range in the current (modified) document
	 */
	readonly range: OffsetRange;
	/**
	 * The original range that was replaced
	 */
	readonly originalRange: OffsetRange;
	/**
	 * The attribution for this range
	 */
	readonly attribution: CombinedAttribution;
}

/**
 * Extracts attributed ranges from an AnnotatedStringEdit.
 * These represent the current positions of all tracked edit regions in the document.
 */
export function getAttributedRanges(edit: AttributedStringEdit): AttributedRange[] {
	const newRanges = edit.getNewRanges();
	return edit.replacements.map((r, idx) => ({
		range: newRanges[idx],
		originalRange: r.replaceRange,
		attribution: r.data,
	}));
}

/**
 * Finds attribution for a specific offset in the document.
 * Returns the attribution if the offset falls within a tracked edit region, otherwise undefined.
 */
export function getAttributionAtOffset(edit: AttributedStringEdit, offset: number): CombinedAttribution | undefined {
	const ranges = getAttributedRanges(edit);
	for (const { range, attribution } of ranges) {
		if (range.contains(offset)) {
			return attribution;
		}
	}
	return undefined;
}

/**
 * Gets all unique agent attributions from the edit, useful for determining
 * which agents have made edits to a document.
 */
export function getUniqueAgentAttributions(edit: AttributedStringEdit): AgentAttribution[] {
	const seen = new Set<string>();
	const result: AgentAttribution[] = [];

	for (const r of edit.replacements) {
		const agent = r.data.agentAttribution;
		if (agent) {
			const key = agent.toKey();
			if (!seen.has(key)) {
				seen.add(key);
				result.push(agent);
			}
		}
	}

	return result;
}
