class Slice implements ISequence {
	private readonly elements: number[] = [];
	private readonly firstCharOnLineOffsets: number[] = [];
	private readonly trimStartLength: number[] = [];

	constructor(public readonly lines: string[], public readonly lineRange: OffsetRange, public readonly considerWhitespaceChanges: boolean) {
		for (let i = lineRange.start; i < lineRange.endExclusive; i++) {
			const l = lines[i];
			const l1 = considerWhitespaceChanges ? l : l.trimStart();
			const line = considerWhitespaceChanges ? l1 : l1.trimEnd();
			this.trimStartLength.push(l.length - l1.length);

			for (let i = 0; i < line.length; i++) {
				this.elements.push(line.charCodeAt(i));
			}
			if (i < lines.length - 1) {
				this.elements.push('\n'.charCodeAt(0));
			}

			this.firstCharOnLineOffsets[i - lineRange.start] = this.elements.length;
		}
	}
}
