/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type Point = [number, number];
export type ChatWorkingLogoRibbonBand = 'leg1' | 'leg3' | 'bar';

export interface IChatWorkingLogoRibbonFrame {
	readonly paths: Readonly<Record<ChatWorkingLogoRibbonBand, string>>;
	readonly tail: number;
	readonly head: number;
}

interface ICrossSection {
	readonly a: Point;
	readonly b: Point;
}

interface IFoldBand {
	readonly splitAt: number;
	readonly before: ChatWorkingLogoRibbonBand;
	readonly after: ChatWorkingLogoRibbonBand;
}

type SpanBand = ChatWorkingLogoRibbonBand | IFoldBand;
type RibbonMark = [number, number, ChatWorkingLogoRibbonBand];

const point = (x: number, y: number): Point => [x, y];

const P = {
	V1: point(70.9119, 99.3171),
	V2: point(75.8725, 99.1264),
	V3: point(96.4608, 89.2197),
	V4: point(100, 83.5872),
	V5: point(100, 16.4133),
	V6: point(96.4609, 10.7808),
	V7: point(75.8725, 0.873756),
	V8: point(69.5135, 1.44695),
	V9: point(68.769, 2.08341),
	V11: point(12.1872, 25.0096),
	V14: point(1.35853, 36.417),
	V16: point(1.35853, 63.5832),
	V17: point(1.36303, 69.7453),
	V18: point(6.86933, 74.7541),
	V19: point(12.1872, 74.9905),
	V21: point(68.769, 97.9167),
	H1: point(75.0152, 27.2989),
	H3: point(75.0152, 72.7012),
};

export const CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER: readonly ChatWorkingLogoRibbonBand[] = ['leg1', 'leg3', 'bar'];

const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const multiply = (value: Point, scalar: number): Point => [value[0] * scalar, value[1] * scalar];
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const length = (value: Point): number => Math.hypot(value[0], value[1]);
const normalize = (value: Point): Point => {
	const valueLength = length(value) || 1;
	return [value[0] / valueLength, value[1] / valueLength];
};
const interpolate = (a: Point, b: Point, amount: number): Point => [
	a[0] + (b[0] - a[0]) * amount,
	a[1] + (b[1] - a[1]) * amount,
];
const clamp = (value: number): number => value < 0 ? 0 : value > 1 ? 1 : value;
const crossSectionMidpoint = (section: ICrossSection): Point => midpoint(section.a, section.b);

const drawEnd = 0.42;
const holdEnd = 0.5;
const eraseEnd = 0.92;
const arrivalSlope = 1.35;

function arriveAtRest(value: number): number {
	const amount = clamp(value);
	const squared = amount * amount;
	return (arrivalSlope - 2) * squared * amount + (3 - 2 * arrivalSlope) * squared + arrivalSlope * amount;
}

function departFromRest(value: number): number {
	return 1 - arriveAtRest(1 - clamp(value));
}

function cubicAt(p0: Point, c0: Point, c1: Point, p1: Point, amount: number): Point {
	const inverse = 1 - amount;
	const a = inverse * inverse * inverse;
	const b = 3 * inverse * inverse * amount;
	const c = 3 * inverse * amount * amount;
	const d = amount * amount * amount;
	return [
		a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0],
		a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1],
	];
}

function flattenCubic(p0: Point, c0: Point, c1: Point, p1: Point, steps: number): Point[] {
	const result: Point[] = [];
	for (let index = 1; index <= steps; index++) {
		result.push(cubicAt(p0, c0, c1, p1, index / steps));
	}
	return result;
}

function binarySearch(values: readonly number[], target: number): number {
	let low = 0;
	let high = values.length - 2;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (values[middle] <= target) {
			low = middle;
		} else {
			high = middle - 1;
		}
	}
	return low;
}

class Chain {
	readonly cumulative: number[] = [0];
	readonly length: number;

	constructor(readonly points: readonly Point[]) {
		for (let index = 1; index < points.length; index++) {
			this.cumulative.push(this.cumulative[index - 1] + length(subtract(points[index], points[index - 1])));
		}
		this.length = this.cumulative[this.cumulative.length - 1];
	}

	vertexFractions(): number[] {
		return this.length === 0 ? [] : this.cumulative.slice(1, -1).map(value => value / this.length);
	}

	pointAt(fraction: number): Point {
		if (this.length === 0) {
			return [...this.points[0]];
		}
		const target = clamp(fraction) * this.length;
		const index = binarySearch(this.cumulative, target);
		const segmentLength = this.cumulative[index + 1] - this.cumulative[index];
		return interpolate(this.points[index], this.points[index + 1], segmentLength > 0 ? (target - this.cumulative[index]) / segmentLength : 0);
	}
}

class Span {
	private sectionLengths: number[] = [];
	sLength = 0;

	constructor(
		readonly sideA: Chain,
		readonly sideB: Chain,
		readonly band: SpanBand,
	) {
		this.measure();
	}

	crossSection(amount: number): ICrossSection {
		return { a: this.sideA.pointAt(amount), b: this.sideB.pointAt(amount) };
	}

	breaks(start: number, end: number): number[] {
		const low = Math.min(start, end);
		const high = Math.max(start, end);
		const values = this.sideA.vertexFractions().concat(this.sideB.vertexFractions())
			.filter(value => value > low + 1e-9 && value < high - 1e-9)
			.sort((a, b) => a - b);
		const result: number[] = [];
		for (const value of values) {
			if (!result.length || value - result[result.length - 1] > 1e-6) {
				result.push(value);
			}
		}
		return result;
	}

	private measure(): void {
		const steps = 200;
		const lengths = [0];
		let previous = crossSectionMidpoint(this.crossSection(0));
		for (let index = 1; index <= steps; index++) {
			const current = crossSectionMidpoint(this.crossSection(index / steps));
			lengths.push(lengths[index - 1] + length(subtract(current, previous)));
			previous = current;
		}
		this.sectionLengths = lengths;
		this.sLength = lengths[steps];
	}

	tOfS(localLength: number): number {
		if (this.sLength === 0) {
			return 0;
		}
		const count = this.sectionLengths.length - 1;
		const target = Math.min(Math.max(localLength, 0), this.sLength);
		const index = binarySearch(this.sectionLengths, target);
		const segmentLength = this.sectionLengths[index + 1] - this.sectionLengths[index];
		return (index + (segmentLength > 0 ? (target - this.sectionLengths[index]) / segmentLength : 0)) / count;
	}

	sOfT(amount: number): number {
		const count = this.sectionLengths.length - 1;
		const scaled = clamp(amount) * count;
		const index = Math.min(Math.floor(scaled), count - 1);
		return this.sectionLengths[index] + (this.sectionLengths[index + 1] - this.sectionLengths[index]) * (scaled - index);
	}
}

const cornerSteps = 32;

function buildLogoSpans(): Span[] {
	const { V1, V2, V3, V4, V5, V6, V7, V8, V9, V11, V14, V16, V19, V21, H1, H3 } = P;
	const firstFold: Point[] = [V9];
	firstFold.push(...flattenCubic(V9, point(69.0028, 1.84943), point(69.252, 1.63711), V8, cornerSteps));
	firstFold.push(...flattenCubic(V8, point(71.3446, 0.11576), point(73.7862, -0.130129), V7, cornerSteps));
	firstFold.push(V6);
	firstFold.push(...flattenCubic(V6, point(98.6243, 11.8218), point(100, 14.0113), V5, cornerSteps));

	const secondFold: Point[] = [V4];
	secondFold.push(...flattenCubic(V4, point(100, 85.9892), point(98.6242, 88.1787), V3, cornerSteps));
	secondFold.push(V2);
	secondFold.push(...flattenCubic(V2, point(74.2828, 99.8914), point(72.4869, 99.9307), V1, cornerSteps));
	secondFold.push(...flattenCubic(V1, point(70.1246, 99.0104), point(69.3925, 98.5406), V21, cornerSteps));

	return [
		new Span(new Chain([V19, H1]), new Chain([V16, V9]), 'leg1'),
		new Span(new Chain([H1]), new Chain(firstFold), { splitAt: 75, before: 'leg1', after: 'bar' }),
		new Span(new Chain([H1, H3]), new Chain([V5, V4]), 'bar'),
		new Span(new Chain([H3]), new Chain(secondFold), { splitAt: 75, before: 'bar', after: 'leg3' }),
		new Span(new Chain([H3, V11]), new Chain([V21, V14]), 'leg3'),
	];
}

function buildCapProfile(): Point[] {
	const { V16, V17, V18, V19 } = P;
	const points: Point[] = [V16];
	points.push(...flattenCubic(V16, point(-0.454633, 65.2374), point(-0.452552, 68.0938), V17, cornerSteps));
	points.push(V18);
	points.push(...flattenCubic(V18, point(8.35363, 76.1043), point(10.589, 76.2037), V19, cornerSteps));
	const origin = midpoint(V16, V19);
	const halfWidth = length(subtract(V19, V16)) / 2;
	const across = normalize(subtract(V19, V16));
	const forward: Point = [across[1], -across[0]];
	return points.map(value => {
		const offset = subtract(value, origin);
		return [
			(offset[0] * across[0] + offset[1] * across[1]) / halfWidth,
			(offset[0] * forward[0] + offset[1] * forward[1]) / halfWidth,
		];
	});
}

/** Models the official mark as one arc-length-parameterized strip with smooth moving end caps. */
class Ribbon {
	readonly spans = buildLogoSpans();
	readonly spanStarts: number[] = [];
	readonly length: number;
	private readonly capProfile = buildCapProfile();
	private readonly marks: RibbonMark[];

	constructor(private readonly bleed = 0.35) {
		let totalLength = 0;
		for (const span of this.spans) {
			this.spanStarts.push(totalLength);
			totalLength += span.sLength;
		}
		this.length = totalLength;
		this.marks = this.buildMarks();
	}

	private locate(distance: number): { readonly index: number; readonly amount: number } {
		const clamped = Math.min(Math.max(distance, 0), this.length);
		let index = this.spans.length - 1;
		for (let candidate = 0; candidate < this.spans.length; candidate++) {
			if (clamped <= this.spanStarts[candidate] + this.spans[candidate].sLength) {
				index = candidate;
				break;
			}
		}
		return { index, amount: this.spans[index].tOfS(clamped - this.spanStarts[index]) };
	}

	private crossSection(distance: number): ICrossSection {
		const location = this.locate(distance);
		return this.spans[location.index].crossSection(location.amount);
	}

	private cap(distance: number, direction: -1 | 1): Point[] {
		if (distance > 1e-6 && Math.abs(distance - this.length) > 1e-6) {
			return this.travelCap(distance, direction);
		}
		const { a, b } = this.crossSection(distance);
		const origin = midpoint(a, b);
		const halfWidth = length(subtract(a, b)) / 2 || 1e-6;
		const across = normalize(subtract(a, b));
		const normal: Point = direction < 0 ? [across[1], -across[0]] : [-across[1], across[0]];
		const points = this.capProfile.map(([x, y]) => point(
			origin[0] + (across[0] * x + normal[0] * y) * halfWidth,
			origin[1] + (across[1] * x + normal[1] * y) * halfWidth,
		));
		return direction > 0 ? points.reverse() : points;
	}

	private travelCap(distance: number, direction: -1 | 1): Point[] {
		const { a, b } = this.crossSection(distance);
		const before = crossSectionMidpoint(this.crossSection(Math.max(0, distance - 0.15)));
		const after = crossSectionMidpoint(this.crossSection(Math.min(this.length, distance + 0.15)));
		let forward = normalize(subtract(after, before));
		if (direction < 0) {
			forward = multiply(forward, -1);
		}
		const start = direction > 0 ? a : b;
		const end = direction > 0 ? b : a;
		const width = length(subtract(a, b));
		const points: Point[] = [];
		for (let index = 0; index <= 16; index++) {
			const amount = index / 16;
			const bow = 4 * amount * (1 - amount) * width * 0.03;
			points.push(add(interpolate(start, end, amount), multiply(forward, bow)));
		}
		return points;
	}

	private sections(startDistance: number, endDistance: number): ICrossSection[] {
		const result: ICrossSection[] = [];
		const start = this.locate(startDistance);
		const total = endDistance - startDistance;
		let spanIndex = start.index;
		let amount = start.amount;
		let completed = 0;
		while (spanIndex < this.spans.length) {
			const span = this.spans[spanIndex];
			const currentLength = span.sOfT(amount);
			const endingLength = Math.min(currentLength + (total - completed), span.sLength);
			const endingAmount = span.tOfS(endingLength);
			result.push(span.crossSection(amount));
			for (const breakpoint of span.breaks(amount, endingAmount)) {
				result.push(span.crossSection(breakpoint));
			}
			result.push(span.crossSection(endingAmount));
			completed += endingLength - currentLength;
			if (completed >= total - 1e-9) {
				break;
			}
			spanIndex++;
			amount = 0;
		}
		return result;
	}

	private buildMarks(): RibbonMark[] {
		const marks: RibbonMark[] = [];
		for (let index = 0; index < this.spans.length; index++) {
			const span = this.spans[index];
			const start = this.spanStarts[index];
			if (typeof span.band === 'string') {
				marks.push([start, start + span.sLength, span.band]);
			} else {
				const cut = start + span.sOfT(findCrossing(span.sideB, span.band.splitAt));
				marks.push([start, cut, span.band.before]);
				marks.push([cut, start + span.sLength, span.band.after]);
			}
		}
		const merged: RibbonMark[] = [];
		for (const mark of marks) {
			const previous = merged[merged.length - 1];
			if (previous && previous[2] === mark[2] && Math.abs(previous[1] - mark[0]) < 1e-9) {
				previous[1] = mark[1];
			} else {
				merged.push([...mark]);
			}
		}
		const paintIndex = (band: ChatWorkingLogoRibbonBand): number => CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER.indexOf(band);
		for (let index = 0; index < merged.length - 1; index++) {
			if (paintIndex(merged[index][2]) < paintIndex(merged[index + 1][2])) {
				merged[index][1] += this.bleed;
			} else {
				merged[index + 1][0] -= this.bleed;
			}
		}
		return merged;
	}

	bands(start: number, end: number): Readonly<Record<ChatWorkingLogoRibbonBand, string>> {
		const buckets = new Map<ChatWorkingLogoRibbonBand, string[]>(
			CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER.map(band => [band, []]),
		);
		for (const [markStart, markEnd, band] of this.marks) {
			const low = Math.max(start, markStart);
			const high = Math.min(end, markEnd);
			if (high - low <= 1e-6) {
				continue;
			}
			buckets.get(band)!.push(this.strip(
				low,
				high,
				Math.abs(low - start) < 1e-9,
				Math.abs(high - end) < 1e-9,
			));
		}
		return {
			leg1: buckets.get('leg1')!.join(''),
			leg3: buckets.get('leg3')!.join(''),
			bar: buckets.get('bar')!.join(''),
		};
	}

	private strip(start: number, end: number, capStart: boolean, capEnd: boolean): string {
		const sections = this.sections(start, end);
		if (sections.length < 2) {
			return '';
		}
		const points: Point[] = [];
		if (capStart) {
			points.push(...this.cap(start, -1));
		} else {
			points.push(sections[0].b, sections[0].a);
		}
		for (let index = 1; index < sections.length; index++) {
			points.push(sections[index].a);
		}
		if (capEnd) {
			points.push(...this.cap(end, 1).slice(1));
		} else {
			points.push(sections[sections.length - 1].b);
		}
		for (let index = sections.length - 2; index >= 0; index--) {
			points.push(sections[index].b);
		}
		return toPath(points);
	}
}

function findCrossing(chain: Chain, x: number): number {
	const increasing = chain.pointAt(0)[0] < x;
	let low = 0;
	let high = 1;
	for (let index = 0; index < 50; index++) {
		const middle = (low + high) / 2;
		const before = increasing ? chain.pointAt(middle)[0] < x : chain.pointAt(middle)[0] > x;
		if (before) {
			low = middle;
		} else {
			high = middle;
		}
	}
	return (low + high) / 2;
}

function toPath(points: readonly Point[]): string {
	let path = `M${format(points[0][0])} ${format(points[0][1])}`;
	for (let index = 1; index < points.length; index++) {
		path += `L${format(points[index][0])} ${format(points[index][1])}`;
	}
	return `${path}Z`;
}

function format(value: number): string {
	const rounded = Math.round(value * 1000) / 1000;
	return Object.is(rounded, -0) ? '0' : String(rounded);
}

const ribbon = new Ribbon();
const emptyPaths = ribbon.bands(0, 0);
const tiedPaths = ribbon.bands(0, ribbon.length);

export function getChatWorkingLogoRibbonFrame(progress: number): IChatWorkingLogoRibbonFrame {
	const wrapped = progress >= 0 && progress < 1 ? progress : ((progress % 1) + 1) % 1;
	if (wrapped < drawEnd) {
		const head = ribbon.length * arriveAtRest(wrapped / drawEnd);
		return { paths: head > 0 ? ribbon.bands(0, head) : emptyPaths, tail: 0, head };
	}
	if (wrapped < holdEnd) {
		return { paths: tiedPaths, tail: 0, head: ribbon.length };
	}
	if (wrapped < eraseEnd) {
		const tail = ribbon.length * departFromRest((wrapped - holdEnd) / (eraseEnd - holdEnd));
		return { paths: ribbon.bands(tail, ribbon.length), tail, head: ribbon.length };
	}
	return { paths: emptyPaths, tail: ribbon.length, head: ribbon.length };
}
