/**
 * Represents a gap (before the first child, between two children, or after the last child) in a `LinkedOverlayNode`.
 */
class LinkedOverlayNodeGap {

	constructor(
		private readonly _originalText: string,
		private readonly _parent: LinkedOverlayNode,
		public readonly startIndex: number,
		public readonly endIndex: number,
		public readonly gapIndex: number,
	) { }
	public get range(): OffsetRange {
		return new OffsetRange(this.startIndex, this.endIndex);
	}
	public get isFirstGapInParent(): boolean {
		return this.gapIndex === 0;
	}
	public get isLastGapInParent(): boolean {
		return this.gapIndex === this._parent.children.length;
	}
	public toString(): string {
		return `NodeGap (${this.startIndex}-${this.endIndex} :: ${this._originalText.substring(this.startIndex, this.endIndex)})`;
	}
	public get text(): string {
		return this._originalText.substring(this.startIndex, this.endIndex);
	}
	public get firstNonWhitespaceIndex(): number {
		let index = this.startIndex;
		while (index < this.endIndex) {
			const charCode = this._originalText.charCodeAt(index);
			if (charCode !== CharCode.Tab && charCode !== CharCode.Space && charCode !== CharCode.LineFeed) {
				return index;
			}
			index++;
		}
		return this.endIndex;
	}

	public get lastNonWhitespaceIndex(): number {
		
	}

	public get nextLeaf(): LinkedOverlayNode | null {
		const nextSibling = this._parent.childAt(this.gapIndex);
		return nextSibling ? nextSibling.leftMostLeafChild : this._parent.nextLeaf;
	}
}

