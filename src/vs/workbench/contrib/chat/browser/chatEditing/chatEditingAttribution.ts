/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnnotatedStringEdit, AnnotatedStringReplacement, IEditData, StringEdit, StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAttributedRangeDTO, IModifiedEntryTelemetryInfo } from '../../common/chatEditingService.js';

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

/**
 * Result of rebasing attributed ranges when a file has changed externally.
 */
export interface IRebaseResult {
	/** Successfully rebased ranges */
	readonly ranges: IAttributedRangeDTO[];
	/** Ranges that conflicted and could not be rebased cleanly */
	readonly conflicts: IRebaseConflict[];
}

/**
 * Represents a conflict during rebasing where an attributed range
 * overlaps with external changes.
 */
export interface IRebaseConflict {
	/** The original range that conflicted */
	readonly originalRange: IAttributedRangeDTO;
	/** The content that was in the stored snapshot */
	readonly storedContent: string;
	/** The content that is now in the file at roughly this location */
	readonly currentContent: string;
	/** Approximate start offset in the current document */
	readonly approximateStart: number;
	/** Approximate end offset in the current document */
	readonly approximateEnd: number;
}

/**
 * Generates Git-style conflict markers for a rebase conflict.
 */
export function generateConflictMarkers(conflict: IRebaseConflict): string {
	const agentId = conflict.originalRange.telemetryInfo.agentId ?? 'AI';
	return [
		`<<<<<<< Current (External Changes)`,
		conflict.currentContent,
		`=======`,
		conflict.storedContent,
		`>>>>>>> ${agentId} (Session Edit)`,
	].join('\n');
}

/**
 * Filters attributed ranges to only include those from a specific session.
 */
export function filterRangesBySession(ranges: readonly IAttributedRangeDTO[], sessionResource: URI): IAttributedRangeDTO[] {
	return ranges.filter(range =>
		range.telemetryInfo.sessionResource.toString() === sessionResource.toString()
	);
}

/**
 * Rebases attributed ranges from stored content to current content.
 * When the file has changed externally between sessions, this adjusts
 * the offset-based ranges to account for insertions and deletions.
 *
 * @param ranges The attributed ranges from the stored snapshot
 * @param storedContent The content at the time the snapshot was saved
 * @param currentContent The current content of the file
 * @param externalEdit A StringEdit representing changes from stored to current content
 * @returns Rebased ranges and any conflicts that couldn't be resolved
 */
export function rebaseAttributedRanges(
	ranges: readonly IAttributedRangeDTO[],
	storedContent: string,
	currentContent: string,
	externalEdit: StringEdit,
): IRebaseResult {
	const rebasedRanges: IAttributedRangeDTO[] = [];
	const conflicts: IRebaseConflict[] = [];

	// Sort ranges by start offset
	const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);

	for (const range of sortedRanges) {
		const rangeEdit = new StringEdit([
			StringReplacement.replace(
				new OffsetRange(range.start, range.end),
				storedContent.substring(range.start, range.end)
			)
		]);

		// Try to rebase the range through the external edit
		const rebased = rangeEdit.tryRebase(externalEdit);

		if (rebased && rebased.replacements.length > 0) {
			// Successful rebase - update the range offsets
			const newRange = rebased.replacements[0].replaceRange;
			rebasedRanges.push({
				...range,
				start: newRange.start,
				end: newRange.endExclusive,
			});
		} else {
			// Conflict - the range overlaps with external changes
			// Find the approximate location after external changes
			let offset = 0;
			let approximateStart = range.start;

			for (const replacement of externalEdit.replacements) {
				if (replacement.replaceRange.start >= range.end) {
					break;
				}
				if (replacement.replaceRange.start < range.start) {
					offset += replacement.newText.length - replacement.replaceRange.length;
				}
			}

			approximateStart = Math.max(0, range.start + offset);
			const approximateEnd = Math.min(currentContent.length, approximateStart + (range.end - range.start));

			conflicts.push({
				originalRange: range,
				storedContent: storedContent.substring(range.start, range.end),
				currentContent: currentContent.substring(approximateStart, approximateEnd),
				approximateStart,
				approximateEnd,
			});
		}
	}

	return { ranges: rebasedRanges, conflicts };
}

/**
 * Converts IAttributedRangeDTO array to an AttributedStringEdit.
 * This allows restoring attribution tracking from a stored snapshot.
 *
 * @param ranges The attributed range DTOs from storage
 * @param originalContent The original document content (before edits)
 * @param currentContent The current document content (after edits)
 * @returns An AttributedStringEdit representing all the tracked edits
 */
export function attributedRangesDTOToEdit(
	ranges: readonly IAttributedRangeDTO[],
	originalContent: string,
	currentContent: string,
): AttributedStringEdit {
	// Sort ranges by start offset to process in order
	const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);

	const replacements: AnnotatedStringReplacement<CombinedAttribution>[] = [];

	// Track offset changes as we process ranges
	// Ranges in DTOs are in terms of the current/modified document
	// We need to map them back to original document offsets

	for (const range of sortedRanges) {
		const attribution = range.isUserEdit
			? new CombinedAttribution(UserEditAttribution.instance)
			: new CombinedAttribution(new AgentAttribution(
				range.telemetryInfo,
				range.requestId,
				range.undoStopId,
			));

		// The range.start/end are offsets in the current document
		// The newText is the content at that range in the current document
		const newText = currentContent.substring(range.start, range.end);

		// For now, assume the original range is the same size
		// This is a simplification - in practice we'd need more info
		// to accurately reconstruct the original ranges
		replacements.push(new AnnotatedStringReplacement(
			new OffsetRange(range.start, range.end),
			newText,
			attribution,
		));
	}

	return new AnnotatedStringEdit(replacements);
}
