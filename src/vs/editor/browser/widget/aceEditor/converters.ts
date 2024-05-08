import IRange = monaco.IRange;
import {Ace} from './ace-editor';
import {IIdentifiedSingleEditOperation} from "vs/editor/common/model";

export function toAceRange(range: IRange): Ace.IRange | undefined {
	if (!range) {
		return;
	}
	return {
		start: {
			row: range.startLineNumber - 1,
			column: range.startColumn - 1
		},
		end: {
			row: range.endLineNumber - 1,
			column: range.endColumn - 1
		}

	};
}

export function fromAceRange(range: Ace.IRange): IRange {
	return {
		startLineNumber: range.start.row + 1,
		startColumn: range.start.column + 1,
		endLineNumber: range.end.row + 1,
		endColumn: range.end.column + 1
	};
}

export function fromAceDelta(delta: Ace.Delta, eol: string): IIdentifiedSingleEditOperation {
	const text = delta.lines.length > 1 ? delta.lines.join(eol) : delta.lines[0];
	return {
		range:
			delta.action === 'insert'
				? fromAceRange({start: delta.start, end: delta.start})
				: fromAceRange({start: delta.start, end: delta.end}),
		text: delta.action === 'insert' ? text : '',
	};
}
