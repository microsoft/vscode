export class LineRange {

}

export class RangeMapping {

}

/**
 * Maps a line range in the original text model to a line range in the modified text model.
 */
export class LineRangeMapping {
	/**
	 * The line range in the original text model.
	 */
	public readonly originalRange: LineRange;

	/**
	 * The line range in the modified text model.
	 */
	public readonly modifiedRange: LineRange;

	/**
	 * If inner changes have not been computed, this is set to undefined.
	 * Otherwise, it represents the character-level diff in this line range.
	 * The original range of each range mapping should be contained in the original line range (same for modified).
	 * Must not be an empty array.
	 */
	public readonly innerChanges: RangeMapping[];

	constructor(
		originalRange: LineRange,
		modifiedRange: LineRange,
		innerChanges: RangeMapping[] | undefined,
	) {
		this.originalRange = originalRange;
		this.modifiedRange = modifiedRange;
		this.innerChanges = innerChanges;
	}

	public toString(): string {
		return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
	}
}
