import { randomBytes } from 'crypto';

/** Opening tag: <!-- forge-cmt:XXXXXXXX:start --> (8 hex chars) */
export const FORGE_CMT_START = /<!--\s*forge-cmt:([a-f0-9]{8}):start\s*-->/gi;

/** Closing tag: <!-- forge-cmt:XXXXXXXX:end --> */
export const FORGE_CMT_END = /<!--\s*forge-cmt:([a-f0-9]{8}):end\s*-->/gi;

export function newMarkerHexId(): string {
	return randomBytes(4).toString('hex');
}

export function threadIdForMarker(markerId: string): string {
	return `sc-${markerId}`;
}

export function markerIdFromThreadId(threadId: string): string | null {
	const m = /^sc-([a-f0-9]{8})$/i.exec(threadId);
	return m ? m[1]!.toLowerCase() : null;
}

export interface ParsedForgeRange {
	readonly markerId: string;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly quotedText: string;
	readonly startMarkerLine: number;
}

function lineOfOffset(source: string, offset: number): number {
	return source.slice(0, offset).split(/\r\n|\n|\r/).length - 1;
}

/**
 * All wrapped selection ranges in source (paired start/end tags and inner text).
 */
export function parseForgeMarkerRanges(source: string): ParsedForgeRange[] {
	const out: ParsedForgeRange[] = [];
	const starts = new Map<string, { idx: number; len: number; line: number }>();

	const startRe = new RegExp(FORGE_CMT_START.source, 'gi');
	let m: RegExpExecArray | null;
	while ((m = startRe.exec(source)) !== null) {
		const id = m[1]!.toLowerCase();
		starts.set(id, { idx: m.index, len: m[0].length, line: lineOfOffset(source, m.index) });
	}

	const endRe = new RegExp(FORGE_CMT_END.source, 'gi');
	while ((m = endRe.exec(source)) !== null) {
		const id = m[1]!.toLowerCase();
		const s = starts.get(id);
		if (!s) {
			continue;
		}
		const innerStart = s.idx + s.len;
		const innerEnd = m.index;
		out.push({
			markerId: id,
			startOffset: s.idx,
			endOffset: m.index + m[0].length,
			quotedText: source.slice(innerStart, innerEnd),
			startMarkerLine: s.line,
		});
		starts.delete(id);
	}

	return out;
}

/**
 * Remove one forge marker pair from source, leaving the inner (commented) text.
 * Returns null if the pair is not found or marker id is invalid.
 */
export function stripForgeMarkerPairByMarkerId(source: string, markerId: string): string | null {
	const mid = markerId.toLowerCase().replace(/[^a-f0-9]/g, '');
	if (mid.length !== 8) {
		return null;
	}
	const ranges = parseForgeMarkerRanges(source);
	const hit = ranges.find(r => r.markerId === mid);
	if (!hit) {
		return null;
	}
	return source.slice(0, hit.startOffset) + hit.quotedText + source.slice(hit.endOffset);
}
