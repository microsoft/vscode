/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Gives subgraph titles, and class diagram namespace titles, their own band above the subgraph's
 * nodes, for Mermaid's `flowchart.subGraphTitleMargin`. Mermaid's dagre layout grows each subgraph by
 * these margins and moves the title down by `top`; ELK reserves a title band of its own that is tall
 * enough for `top`.
 */
export const subgraphTitleMargin: Readonly<{ top: number; bottom: number }> = { top: 8, bottom: 8 };

/**
 * Horizontal inset of a subgraph title from its subgraph's border. It is larger than the top margin
 * because the title's line height already adds space above the text.
 */
const titleInset = 12;

/** Smallest horizontal inset a title gets when a smaller inset is what keeps it clear of an edge. */
const minTitleInset = 4;

/** Space Mermaid leaves around flowcharts and class diagrams inside their viewBox. */
const diagramPadding = 8;

/** Clearance kept between a subgraph title and the edges and edge labels around it. */
const titleClearance = 4;

/**
 * How far outside a subgraph's side an edge may end and still count as attached to it. Mermaid ends
 * an edge short of its target by up to the length of its arrowhead.
 */
const edgeAttachDistance = 20;

/**
 * Space between a title's line box and its text, above and below. Edges that cannot avoid a title are
 * hidden over its line box less this.
 */
const titleLeading = 2;

/** Height assumed for each line of an SVG `<text>` title, which carries no size attributes. */
const textTitleLineHeight = 20;

/** Number of line segments used to approximate each curve of an edge path. */
const curveSegments = 8;

const svgNamespace = 'http://www.w3.org/2000/svg';

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
	readonly arrowheads: readonly Box[];
	/** Where edges start and end. */
	readonly endpoints: readonly Point[];
}

interface Cluster {
	readonly rect: Element;
	readonly label: Element;
	/** Offset of the cluster's coordinate space from the root SVG's. */
	readonly origin: Point;
	readonly labelPosition: Point;
	readonly title: { readonly width: number; readonly height: number };
	/** The box as Mermaid drew it, in root coordinates. */
	readonly drawn: Box;
	/** The box once it fits its title and nested subgraphs, in root coordinates. */
	box: Box;
}

/**
 * Applies {@link placeSubgraphTitles} to the Mermaid diagram rendered into `container`, if any. Call it
 * right after writing the diagram, before anything measures it.
 */
export function placeSubgraphTitlesIn(container: ParentNode): void {
	const svg = container.querySelector('svg');
	if (svg) {
		placeSubgraphTitles(svg);
	}
}

/**
 * Keeps the titles of flowchart subgraphs and class diagram namespaces at the top center of their box,
 * where Mermaid puts them, unless an edge or edge label crosses them there, as edges entering the box
 * usually do. Such a title moves to the top left, the top right, or into the closest gap between edges
 * instead. Edges that cross a title wherever it goes pass behind it, the way they pass behind edge
 * labels.
 *
 * Boxes too narrow to keep the title clear of their sides are widened first, unless edges attach to
 * those sides.
 *
 * Only reads SVG attributes, so it also works on detached markup that has not been laid out.
 *
 * @returns Whether the SVG changed.
 */
export function placeSubgraphTitles(svg: SVGSVGElement): boolean {
	if (!/^(flowchart|class)/.test(svg.getAttribute('aria-roledescription') ?? '')) {
		return false;
	}

	const clusters = collectClusters(svg);
	if (!clusters.length) {
		return false;
	}

	const obstacles = collectObstacles(svg);
	let changed = makeRoomForTitles(svg, clusters, obstacles.endpoints);
	const crossedTitles: Box[] = [];
	for (const { label, origin, labelPosition, title, box } of clusters) {
		let top = origin.y + labelPosition.y;
		const blocked = getBlockedRanges(obstacles, top, top + title.height);
		const { x, clear } = chooseTitleX({ start: box.left, end: box.right }, title.width, blocked);
		if (!clear) {
			// Edges will pass behind the title, so keep arrowheads just below it out of its line box.
			const below = obstacles.arrowheads.filter(arrowhead => arrowhead.left < x + title.width + titleClearance && arrowhead.right > x - titleClearance && arrowhead.bottom > top);
			top = Math.max(box.top, Math.min(top, ...below.map(arrowhead => arrowhead.top - title.height)));
			crossedTitles.push({ left: x - titleClearance, top: top + titleLeading, right: x + title.width + titleClearance, bottom: top + title.height - titleLeading });
		}
		if (Math.abs(x - origin.x - labelPosition.x) > 0.01 || Math.abs(top - origin.y - labelPosition.y) > 0.01) {
			label.setAttribute('transform', `translate(${x - origin.x}, ${top - origin.y})`);
			changed = true;
		}
	}
	return clipEdgesBehindTitles(svg, crossedTitles, obstacles.arrowheads) || changed;
}

function collectClusters(svg: SVGSVGElement): Cluster[] {
	const clusters: Cluster[] = [];
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
		if (box && title) {
			const drawn = { left: origin.x + box.left, top: origin.y + box.top, right: origin.x + box.right, bottom: origin.y + box.bottom };
			clusters.push({ rect: rects[0], label, origin, labelPosition, title, drawn, box: drawn });
		}
	}
	return clusters;
}

/**
 * Widens subgraphs that are too narrow for their title and side insets, then the subgraphs around
 * them so they still contain them. Mermaid widens a subgraph for its title only after layout, so a
 * nested subgraph with a long title can otherwise stick out of its parent.
 *
 * A subgraph keeps its width when edges end on its left or right side, as edges to the subgraph
 * itself do in left-to-right layouts, since moving that side would leave the edges inside it. The
 * subgraphs nested in it widen only as far as it leaves room.
 *
 * @returns Whether any subgraph was widened.
 */
function makeRoomForTitles(svg: SVGSVGElement, clusters: readonly Cluster[], endpoints: readonly Point[]): boolean {
	const parents = new Map(clusters.map(cluster => [cluster, findParent(cluster, clusters)]));
	const height = (box: Box) => box.bottom - box.top;
	const isPinned = ({ drawn }: Cluster) => endpoints.some(({ x, y }) => y >= drawn.top - 1 && y <= drawn.bottom + 1
		&& (x >= drawn.left - edgeAttachDistance && x <= drawn.left + 1 || x >= drawn.right - 1 && x <= drawn.right + edgeAttachDistance));

	// Innermost first, so each subgraph is fitted around its nested subgraphs' final boxes.
	for (const cluster of [...clusters].sort((a, b) => height(a.drawn) - height(b.drawn))) {
		if (isPinned(cluster)) {
			continue;
		}
		let { left, right } = cluster.box;
		const missing = cluster.title.width + 2 * titleInset - (right - left);
		if (missing > 0) {
			left -= missing / 2;
			right += missing / 2;
		}
		for (const [child, parent] of parents) {
			if (parent === cluster) {
				left = Math.min(left, child.box.left - getNestedMargin(child.drawn.left - cluster.drawn.left));
				right = Math.max(right, child.box.right + getNestedMargin(cluster.drawn.right - child.drawn.right));
			}
		}
		cluster.box = { ...cluster.box, left, right };
	}

	// Outermost first, so subgraphs stay inside the ones around them that could not widen.
	for (const cluster of [...clusters].sort((a, b) => height(b.drawn) - height(a.drawn))) {
		const parent = parents.get(cluster);
		if (parent) {
			const left = Math.min(cluster.drawn.left, Math.max(cluster.box.left, parent.box.left + getNestedMargin(cluster.drawn.left - parent.drawn.left)));
			const right = Math.max(cluster.drawn.right, Math.min(cluster.box.right, parent.box.right - getNestedMargin(parent.drawn.right - cluster.drawn.right)));
			cluster.box = { ...cluster.box, left, right };
		}
	}

	const widened = clusters.filter(({ box, drawn }) => box.left < drawn.left || box.right > drawn.right);
	for (const { rect, origin, box } of widened) {
		rect.setAttribute('x', String(box.left - origin.x));
		rect.setAttribute('width', String(box.right - box.left));
	}
	growViewBox(svg, widened.map(cluster => cluster.box));
	return widened.length > 0;
}

/**
 * Finds the innermost subgraph around `cluster`: one that is taller and spans it vertically and
 * horizontally around its center. Subgraphs are not nested in the DOM, and a nested subgraph that
 * Mermaid widened for its title can be wider than its parent.
 */
function findParent(cluster: Cluster, clusters: readonly Cluster[]): Cluster | undefined {
	const { left, top, right, bottom } = cluster.drawn;
	const center = (left + right) / 2;
	let parent: Cluster | undefined;
	for (const candidate of clusters) {
		const box = candidate.drawn;
		if (box.top <= top && box.bottom >= bottom && box.bottom - box.top > bottom - top && box.left < center && center < box.right
			&& (!parent || box.bottom - box.top < parent.drawn.bottom - parent.drawn.top)) {
			parent = candidate;
		}
	}
	return parent;
}

/**
 * Space to keep between a nested subgraph and its parent's border, given the space Mermaid left:
 * up to the title inset, and the title inset where the nested subgraph stuck out.
 */
function getNestedMargin(drawnMargin: number): number {
	return drawnMargin < 0 ? titleInset : Math.min(drawnMargin, titleInset);
}

/**
 * Grows the SVG's viewBox, and the size Mermaid derived from it, so that `boxes` keep the diagram's
 * padding.
 */
function growViewBox(svg: SVGSVGElement, boxes: readonly Box[]): void {
	const viewBox = readViewBox(svg);
	if (!boxes.length || !viewBox) {
		return;
	}

	const { x, y, width, height } = viewBox;
	const left = Math.min(x, ...boxes.map(box => box.left - diagramPadding));
	const right = Math.max(x + width, ...boxes.map(box => box.right + diagramPadding));
	const growth = right - left - width;
	if (growth <= 0) {
		return;
	}

	svg.setAttribute('viewBox', `${left} ${y} ${right - left} ${height}`);
	const maxWidth = parseFloat(svg.style.maxWidth);
	if (Number.isFinite(maxWidth)) {
		svg.style.maxWidth = `${maxWidth + growth}px`;
	}
	const widthAttribute = svg.getAttribute('width');
	if (widthAttribute && !widthAttribute.endsWith('%') && Number.isFinite(parseFloat(widthAttribute))) {
		svg.setAttribute('width', String(parseFloat(widthAttribute) + growth));
	}
}

function readViewBox(element: Element): { x: number; y: number; width: number; height: number } | undefined {
	const values = element.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(parseFloat);
	if (values?.length !== 4 || !values.every(Number.isFinite)) {
		return undefined;
	}
	const [x, y, width, height] = values;
	return { x, y, width, height };
}

/**
 * Hides edges where they pass behind `titles`, boxes in root coordinates, by clipping each group of
 * edges to everything but those boxes. Arrowheads stay whole even where they reach into a box.
 *
 * @returns Whether any edges were clipped.
 */
function clipEdgesBehindTitles(svg: SVGSVGElement, titles: readonly Box[], arrowheads: readonly Box[]): boolean {
	const viewBox = readViewBox(svg);
	if (!titles.length || !viewBox || !/^[\w-]+$/.test(svg.id)) {
		return false;
	}

	// Generously covers the diagram, so that only the holes for the titles clip anything.
	const area: Box = { left: viewBox.x - viewBox.width, top: viewBox.y - viewBox.height, right: viewBox.x + 2 * viewBox.width, bottom: viewBox.y + 2 * viewBox.height };
	const kept = arrowheads.filter(arrowhead => titles.some(title => arrowhead.left < title.right && arrowhead.right > title.left && arrowhead.top < title.bottom && arrowhead.bottom > title.top));
	let clipped = false;
	svg.querySelectorAll('.edgePaths').forEach((group, index) => {
		const origin = getOrigin(group, svg);
		if (!origin || group.hasAttribute('clip-path')) {
			return;
		}

		// Under the nonzero rule, the counterclockwise holes cancel the clockwise area, and the clockwise
		// arrowheads restore it.
		const clockwise = ({ left, top, right, bottom }: Box) => `M${left - origin.x},${top - origin.y}H${right - origin.x}V${bottom - origin.y}H${left - origin.x}Z`;
		const counterclockwise = ({ left, top, right, bottom }: Box) => `M${left - origin.x},${top - origin.y}V${bottom - origin.y}H${right - origin.x}V${top - origin.y}Z`;
		const path = svg.ownerDocument.createElementNS(svgNamespace, 'path');
		path.setAttribute('d', [clockwise(area), ...titles.map(counterclockwise), ...kept.map(clockwise)].join(''));
		const clipPath = svg.ownerDocument.createElementNS(svgNamespace, 'clipPath');
		clipPath.id = `${svg.id}-subgraph-titles-${index}`;
		clipPath.append(path);
		group.before(clipPath);
		group.setAttribute('clip-path', `url(#${clipPath.id})`);
		clipped = true;
	});
	return clipped;
}

/**
 * Picks the title's left x: centered, left-aligned or right-aligned, whichever is clear first.
 * Otherwise the clear position closest to left-aligned, where the title may come as close as
 * {@link minTitleInset} to the border. When nothing is clear, the edges will pass behind the title, so
 * it goes where they cross it closest to one of its ends, preferring left-aligned. In a box narrower
 * than the title and both insets, the title stays centered.
 */
function chooseTitleX(cluster: Range, titleWidth: number, blocked: readonly Range[]): { x: number; clear: boolean } {
	const center = (cluster.start + cluster.end - titleWidth) / 2;
	const inset = Math.max(0, Math.min(titleInset, center - cluster.start));
	const left = cluster.start + inset;
	const right = cluster.end - inset - titleWidth;
	// How far obstacles reach into the title from its nearer end, including the clearance.
	const getIntrusion = (x: number) => Math.max(0, ...blocked.map(range => Math.min(range.end - x + titleClearance, x + titleWidth + titleClearance - range.start)));

	for (const x of [center, left, right]) {
		if (getIntrusion(x) <= 0) {
			return { x, clear: true };
		}
	}

	const gaps: Range[] = [];
	let start = cluster.start + Math.min(minTitleInset, inset);
	const end = cluster.end - Math.min(minTitleInset, inset) - titleWidth;
	for (const range of [...blocked].sort((a, b) => a.start - b.start)) {
		gaps.push({ start, end: Math.min(end, range.start - titleClearance - titleWidth) });
		start = Math.max(start, range.end + titleClearance);
	}
	gaps.push({ start, end });

	let closestClear: number | undefined;
	for (const gap of gaps.filter(gap => gap.start <= gap.end)) {
		const x = Math.min(Math.max(left, gap.start), gap.end);
		if (closestClear === undefined || Math.abs(x - left) < Math.abs(closestClear - left)) {
			closestClear = x;
		}
	}
	if (closestClear !== undefined) {
		return { x: closestClear, clear: true };
	}

	let x = left;
	for (const candidate of [center, right]) {
		if (getIntrusion(candidate) < getIntrusion(x) - 0.5) {
			x = candidate;
		}
	}
	return { x, clear: false };
}

/**
 * Collects the horizontal ranges blocked for a title whose line box spans `top` to `bottom`: by edges
 * and edge labels within the title clearance of it, and by arrowheads that reach its text.
 */
function getBlockedRanges(obstacles: Obstacles, top: number, bottom: number): Range[] {
	const ranges: Range[] = [];
	for (const edge of obstacles.edges) {
		for (let i = 1; i < edge.length; i++) {
			const range = clipSegmentToBand(edge[i - 1], edge[i], top - titleClearance, bottom + titleClearance);
			if (range) {
				ranges.push(range);
			}
		}
	}
	for (const label of obstacles.labels) {
		if (label.top < bottom + titleClearance && label.bottom > top - titleClearance) {
			ranges.push({ start: label.left, end: label.right });
		}
	}
	for (const arrowhead of obstacles.arrowheads) {
		if (arrowhead.top < bottom - titleLeading && arrowhead.bottom > top + titleLeading) {
			ranges.push({ start: arrowhead.left, end: arrowhead.right });
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
 * Collects every edge as polylines, and every edge label and every arrowhead as a box, in the root
 * SVG's coordinates.
 */
function collectObstacles(svg: SVGSVGElement): Obstacles {
	const edges: Point[][] = [];
	const arrowheads: Box[] = [];
	const endpoints: Point[] = [];
	for (const path of svg.querySelectorAll('.edgePaths path')) {
		const origin = getOrigin(path, svg);
		const data = path.getAttribute('d');
		const polylines = origin && data ? flattenPathData(data, origin) : [];
		edges.push(...polylines);

		const first = polylines[0];
		const last = polylines[polylines.length - 1];
		if (first && last) {
			endpoints.push(first[0], last[last.length - 1]);
		}
		const start = first && getMarkerBox(svg, path, 'marker-start', first[0], getDirection(first[0], first.slice(1)));
		const end = last && getMarkerBox(svg, path, 'marker-end', last[last.length - 1], getDirection(last[last.length - 1], last.slice(0, -1).reverse(), -1));
		arrowheads.push(...[start, end].filter(box => box !== undefined));
	}

	// HTML edge labels are sized foreign objects; SVG text edge labels (`htmlLabels: false`) have a sized
	// background rect behind their text.
	const labels: Box[] = [];
	for (const label of svg.querySelectorAll('.edgeLabel foreignObject, .edgeLabel rect.background')) {
		const origin = getOrigin(label, svg);
		const box = readBox(label);
		if (origin && box && box.right > box.left && box.bottom > box.top) {
			labels.push({ left: origin.x + box.left, top: origin.y + box.top, right: origin.x + box.right, bottom: origin.y + box.bottom });
		}
	}
	return { edges, labels, arrowheads, endpoints };
}

/**
 * The unit direction from `vertex` to the first of `points` apart from it, times `sign`.
 */
function getDirection(vertex: Point, points: readonly Point[], sign = 1): Point | undefined {
	for (const point of points) {
		const length = Math.hypot(point.x - vertex.x, point.y - vertex.y);
		if (length > 0.01) {
			return { x: sign * (point.x - vertex.x) / length, y: sign * (point.y - vertex.y) / length };
		}
	}
	return undefined;
}

/**
 * The box covered by the marker that `path` draws at `vertex`, where the path runs along `direction`.
 * Mermaid's class diagram markers have viewports far larger than their shapes, so the box follows
 * the marker's shapes.
 */
function getMarkerBox(svg: SVGSVGElement, path: Element, attribute: 'marker-start' | 'marker-end', vertex: Point, direction: Point | undefined): Box | undefined {
	const id = path.getAttribute(attribute)?.match(/^url\(#(?<id>[\w-]+)\)$/)?.groups?.id;
	const marker = id ? svg.querySelector(`marker[id="${id}"]`) : null;
	const content = marker && getShapesBox(marker);
	if (!marker || !content || !direction) {
		return undefined;
	}

	const viewBox = readViewBox(marker);
	const width = readNumber(marker, 'markerWidth') ?? 3;
	const height = readNumber(marker, 'markerHeight') ?? 3;
	const scale = viewBox && viewBox.width > 0 && viewBox.height > 0 ? Math.min(width / viewBox.width, height / viewBox.height) : 1;
	const refX = readNumber(marker, 'refX') ?? 0;
	const refY = readNumber(marker, 'refY') ?? 0;
	const orient = marker.getAttribute('orient') ?? '0';
	const angle = orient === 'auto' ? Math.atan2(direction.y, direction.x)
		: orient === 'auto-start-reverse' ? Math.atan2(direction.y, direction.x) + (attribute === 'marker-start' ? Math.PI : 0)
			: (parseFloat(orient) || 0) * Math.PI / 180;

	const xs: number[] = [];
	const ys: number[] = [];
	for (const x of [content.left, content.right]) {
		for (const y of [content.top, content.bottom]) {
			const along = (x - refX) * scale;
			const across = (y - refY) * scale;
			xs.push(vertex.x + along * Math.cos(angle) - across * Math.sin(angle));
			ys.push(vertex.y + along * Math.sin(angle) + across * Math.cos(angle));
		}
	}
	return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * The box around the paths, polygons and circles in `element`, in its own coordinates.
 */
function getShapesBox(element: Element): Box | undefined {
	const points: Point[] = [];
	for (const shape of element.querySelectorAll('path, polygon, polyline, circle')) {
		if (shape.localName === 'path') {
			points.push(...flattenPathData(shape.getAttribute('d') ?? '', { x: 0, y: 0 }).flat());
		} else if (shape.localName === 'circle') {
			const cx = readNumber(shape, 'cx') ?? 0;
			const cy = readNumber(shape, 'cy') ?? 0;
			const r = readNumber(shape, 'r') ?? 0;
			points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
		} else {
			const values = (shape.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(parseFloat);
			for (let i = 0; i + 1 < values.length; i += 2) {
				points.push({ x: values[i], y: values[i + 1] });
			}
		}
	}

	const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
	if (!valid.length) {
		return undefined;
	}
	return {
		left: Math.min(...valid.map(point => point.x)),
		top: Math.min(...valid.map(point => point.y)),
		right: Math.max(...valid.map(point => point.x)),
		bottom: Math.max(...valid.map(point => point.y)),
	};
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
	const x = readNumber(rect, 'x') ?? 0;
	const y = readNumber(rect, 'y') ?? 0;
	const width = readNumber(rect, 'width');
	const height = readNumber(rect, 'height');
	if (width === undefined || height === undefined) {
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
