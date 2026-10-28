/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Gives flowchart subgraph titles their own band above the subgraph's nodes, for Mermaid's
 * `flowchart.subGraphTitleMargin`. Mermaid's dagre layout grows each subgraph by these margins and
 * moves the title down by `top`; ELK reserves a title band of its own that is tall enough for `top`.
 */
export const subgraphTitleMargin: Readonly<{ top: number; bottom: number }> = { top: 8, bottom: 8 };

/** Horizontal inset of a subgraph title from its subgraph's border. */
const titleInset = 8;

/** Clearance kept between a subgraph title and the edges and edge labels around it. */
const titleClearance = 4;

/** Height assumed for each line of an SVG `<text>` title, which carries no size attributes. */
const textTitleLineHeight = 20;

/** Number of line segments used to approximate each curve of an edge path. */
const curveSegments = 8;

interface Point {
	readonly x: number;
	readonly y: number;
}

interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

interface Range {
	readonly start: number;
	readonly end: number;
}

interface Obstacles {
	readonly edges: readonly (readonly Point[])[];
	readonly labels: readonly Box[];
}

/**
 * Applies {@link placeSubgraphTitles} to the SVG markup returned by `mermaid.render`.
 */
export function placeSubgraphTitlesInSvgMarkup(svgMarkup: string): string {
	if (!svgMarkup.includes('cluster-label')) {
		return svgMarkup;
	}

	const template = document.createElement('template');
	template.innerHTML = svgMarkup;
	const svg = template.content.querySelector('svg');
	if (!svg || !placeSubgraphTitles(svg)) {
		return svgMarkup;
	}
	return template.innerHTML;
}

/**
 * Moves flowchart subgraph titles from the top center of their subgraph, where edges entering the
 * subgraph usually cross them, to the top left. If an edge or edge label would still cross a title
 * there, the title is centered, right-aligned, or moved into the leftmost gap between edges instead,
 * whichever is clear first.
 *
 * Only reads SVG attributes, so it also works on detached markup that has not been laid out.
 *
 * @returns Whether any title moved.
 */
export function placeSubgraphTitles(svg: SVGSVGElement): boolean {
	if (!svg.getAttribute('aria-roledescription')?.startsWith('flowchart')) {
		return false;
	}

	let obstacles: Obstacles | undefined;
	let changed = false;
	for (const cluster of svg.querySelectorAll('g.cluster')) {
		// Subgraphs use Mermaid's `rect` cluster shape: a single rect plus a title translated to its top center.
		const rects = cluster.querySelectorAll(':scope > rect');
		const label = cluster.querySelector(':scope > g.cluster-label');
		const origin = getOrigin(cluster, svg);
		const labelPosition = parseTranslate(label?.getAttribute('transform'));
		if (rects.length !== 1 || rects[0].hasAttribute('transform') || !label || !origin || !labelPosition) {
			continue;
		}

		const box = readBox(rects[0]);
		const title = box && getTitleSize(label, box, labelPosition);
		if (!box || !title || title.width > box.right - box.left) {
			continue;
		}

		obstacles ??= collectObstacles(svg);
		const blocked = getBlockedRanges(obstacles, origin.y + labelPosition.y - titleClearance, origin.y + labelPosition.y + title.height + titleClearance);
		const x = chooseTitleX({ start: origin.x + box.left, end: origin.x + box.right }, title.width, blocked) - origin.x;
		if (Math.abs(x - labelPosition.x) > 0.01) {
			label.setAttribute('transform', `translate(${x}, ${labelPosition.y})`);
			changed = true;
		}
	}
	return changed;
}

/**
 * Picks the title's left x: left-aligned, centered, right-aligned, or the leftmost gap between
 * obstacles, whichever is clear first. Falls back to left-aligned when nothing is clear.
 */
function chooseTitleX(cluster: Range, titleWidth: number, blocked: readonly Range[]): number {
	const inset = Math.max(0, Math.min(titleInset, (cluster.end - cluster.start - titleWidth) / 2));
	const left = cluster.start + inset;
	const right = cluster.end - inset - titleWidth;
	const isClear = (x: number) => blocked.every(range => range.end <= x - titleClearance || range.start >= x + titleWidth + titleClearance);

	for (const x of [left, (cluster.start + cluster.end - titleWidth) / 2, right]) {
		if (isClear(x)) {
			return x;
		}
	}

	let x = left;
	for (const range of [...blocked].sort((a, b) => a.start - b.start)) {
		if (range.start >= x + titleWidth + titleClearance) {
			break;
		}
		x = Math.max(x, range.end + titleClearance);
	}
	return x <= right ? x : left;
}

/**
 * Collects the horizontal ranges that edges and edge labels occupy between `top` and `bottom`.
 */
function getBlockedRanges(obstacles: Obstacles, top: number, bottom: number): Range[] {
	const ranges: Range[] = [];
	for (const edge of obstacles.edges) {
		for (let i = 1; i < edge.length; i++) {
			const range = clipSegmentToBand(edge[i - 1], edge[i], top, bottom);
			if (range) {
				ranges.push(range);
			}
		}
	}
	for (const label of obstacles.labels) {
		if (label.top < bottom && label.bottom > top) {
			ranges.push({ start: label.left, end: label.right });
		}
	}
	return ranges;
}

function clipSegmentToBand(a: Point, b: Point, top: number, bottom: number): Range | undefined {
	if ((a.y < top && b.y < top) || (a.y > bottom && b.y > bottom)) {
		return undefined;
	}
	const xAt = (y: number) => a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
	const x1 = a.y < top ? xAt(top) : a.y > bottom ? xAt(bottom) : a.x;
	const x2 = b.y < top ? xAt(top) : b.y > bottom ? xAt(bottom) : b.x;
	return { start: Math.min(x1, x2), end: Math.max(x1, x2) };
}

/**
 * Collects every edge as polylines and every HTML edge label as a box, in the root SVG's coordinates.
 */
function collectObstacles(svg: SVGSVGElement): Obstacles {
	const edges: Point[][] = [];
	for (const path of svg.querySelectorAll('.edgePaths path')) {
		const origin = getOrigin(path, svg);
		const data = path.getAttribute('d');
		if (origin && data) {
			edges.push(...flattenPathData(data, origin));
		}
	}

	const labels: Box[] = [];
	for (const label of svg.querySelectorAll('.edgeLabel foreignObject')) {
		const origin = getOrigin(label, svg);
		const width = readNumber(label, 'width');
		const height = readNumber(label, 'height');
		if (origin && width && height && width > 0 && height > 0) {
			labels.push({ left: origin.x, top: origin.y, right: origin.x + width, bottom: origin.y + height });
		}
	}
	return { edges, labels };
}

/**
 * Approximates SVG path data as polylines, one per subpath, offset by `origin`.
 */
function flattenPathData(data: string, origin: Point): Point[][] {
	const tokens = data.match(/[a-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
	const polylines: Point[][] = [];
	let polyline: Point[] = [];
	let current: Point = { x: 0, y: 0 };
	let subpathStart = current;
	let command = '';
	let i = 0;

	const isNumber = (token: string | undefined) => token !== undefined && !/^[a-z]$/i.test(token);
	const readPoint = (base: Point): Point => {
		const x = parseFloat(tokens[i++]);
		const y = parseFloat(tokens[i++]);
		return { x: base.x + x, y: base.y + y };
	};
	const addPoint = (point: Point) => {
		polyline.push({ x: origin.x + point.x, y: origin.y + point.y });
		current = point;
	};
	const addCubic = (c1: Point, c2: Point, end: Point) => {
		const start = current;
		for (let step = 1; step <= curveSegments; step++) {
			const t = step / curveSegments;
			const u = 1 - t;
			addPoint({
				x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
				y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
			});
		}
	};
	const addQuadratic = (control: Point, end: Point) => {
		const start = current;
		addCubic(
			{ x: start.x + 2 / 3 * (control.x - start.x), y: start.y + 2 / 3 * (control.y - start.y) },
			{ x: end.x + 2 / 3 * (control.x - end.x), y: end.y + 2 / 3 * (control.y - end.y) },
			end);
	};

	while (i < tokens.length) {
		if (!isNumber(tokens[i])) {
			command = tokens[i++];
		}
		const base = command === command.toLowerCase() ? current : { x: 0, y: 0 };
		switch (command.toUpperCase()) {
			case 'M':
				if (polyline.length > 1) {
					polylines.push(polyline);
				}
				polyline = [];
				addPoint(readPoint(base));
				subpathStart = current;
				// Further coordinate pairs after a moveto are implicit linetos.
				command = command === 'M' ? 'L' : 'l';
				break;
			case 'L':
				addPoint(readPoint(base));
				break;
			case 'H':
				addPoint({ x: base.x + parseFloat(tokens[i++]), y: current.y });
				break;
			case 'V':
				addPoint({ x: current.x, y: base.y + parseFloat(tokens[i++]) });
				break;
			case 'C':
				addCubic(readPoint(base), readPoint(base), readPoint(base));
				break;
			case 'S':
				addCubic(current, readPoint(base), readPoint(base));
				break;
			case 'Q':
				addQuadratic(readPoint(base), readPoint(base));
				break;
			case 'T':
				addPoint(readPoint(base));
				break;
			case 'A':
				i += 5;
				addPoint(readPoint(base));
				break;
			case 'Z':
				addPoint(subpathStart);
				command = '';
				break;
			default:
				// Unknown command or malformed data: keep what was parsed so far.
				i = tokens.length;
				break;
		}
	}
	if (polyline.length > 1) {
		polylines.push(polyline);
	}
	return polylines.filter(points => points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
}

function getTitleSize(label: Element, box: Box, position: Point): { width: number; height: number } | undefined {
	const foreignObject = label.querySelector('foreignObject');
	if (foreignObject) {
		const width = readNumber(foreignObject, 'width');
		const height = readNumber(foreignObject, 'height');
		return width && height && width > 0 && height > 0 ? { width, height } : undefined;
	}

	// SVG text titles have no size attributes; Mermaid centers them, so their width follows from the offset.
	const width = 2 * ((box.left + box.right) / 2 - position.x);
	const lines = Math.max(1, label.querySelectorAll('.text-outer-tspan').length);
	return width > 0 ? { width, height: lines * textTitleLineHeight } : undefined;
}

function readBox(rect: Element): Box | undefined {
	const x = readNumber(rect, 'x');
	const y = readNumber(rect, 'y');
	const width = readNumber(rect, 'width');
	const height = readNumber(rect, 'height');
	if (x === undefined || y === undefined || width === undefined || height === undefined) {
		return undefined;
	}
	return { left: x, top: y, right: x + width, bottom: y + height };
}

function readNumber(element: Element, attribute: string): number | undefined {
	const value = parseFloat(element.getAttribute(attribute) ?? '');
	return Number.isFinite(value) ? value : undefined;
}

/**
 * Sums the `translate` transforms of `element` and its ancestors up to `root`. Returns `undefined`
 * if any of them uses another kind of transform.
 */
function getOrigin(element: Element, root: Element): Point | undefined {
	let x = 0;
	let y = 0;
	for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
		const transform = current.getAttribute('transform');
		if (transform) {
			const translation = parseTranslate(transform);
			if (!translation) {
				return undefined;
			}
			x += translation.x;
			y += translation.y;
		}
	}
	return { x, y };
}

function parseTranslate(transform: string | null | undefined): Point | undefined {
	const match = transform?.match(/^\s*translate\(\s*(?<x>[-+.\de]+)(?:\s*,?\s*(?<y>[-+.\de]+))?\s*\)\s*$/i);
	if (!match?.groups) {
		return undefined;
	}
	const x = parseFloat(match.groups.x);
	const y = parseFloat(match.groups.y ?? '0');
	return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}
