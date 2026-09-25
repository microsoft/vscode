/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { z } from 'zod';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatImageGenerationProgressPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationProgressPart.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMotionAccessibilityService } from './chatFixtureUtils.js';
import './chatImageLoadingStudies.fixture.css';

const originalStudyIds = ['waves', 'ribbons', 'dot-tide', 'orbits', 'ripples', 'splash', 'liquid', 'islands', 'fireflies', 'constellation', 'ink', 'petals', 'silk', 'mosaic', 'brush', 'caustics'] as const;
const additionalStudyIds = ['dunes', 'rain', 'bubbles', 'vortex', 'magnet', 'aurora', 'feather', 'origami', 'seeds', 'loom', 'echoes', 'hatching', 'streamers', 'cells', 'horizon', 'sparks', 'strings', 'aperture', 'flow', 'helix'] as const;
const imageMakingStudyIds = ['exposure', 'silver-grain', 'focus-pull', 'prism', 'registration', 'proofs', 'daydream', 'wash', 'bristles', 'cyanotype', 'engraving', 'embroidery', 'paper-scene', 'stained-glass', 'porcelain', 'marbling', 'relief', 'tessellation', 'pixel-sort', 'raster', 'wireframe', 'dithering', 'frequencies', 'bezier'] as const;
const paintingStudyIds = ['graphite', 'pencil-sphere', 'leaf-study', 'dry-brush', 'watercolor-edge', 'wet-on-wet', 'capillary', 'charcoal', 'pastel', 'crosshatch', 'fountain-nib', 'working-brush', 'palette-knife', 'gouache', 'gesture', 'line-wash', 'chalk', 'stippling', 'eraser', 'calligraphy'] as const;
const pencilStudyIds = ['pencil-fill', 'pencil-loops', 'pencil-layers', 'pencil-tooth'] as const;
const binaryStudyIds = ['binary-tide'] as const;
const studyIds = [...originalStudyIds, ...additionalStudyIds, ...imageMakingStudyIds, ...paintingStudyIds, ...pencilStudyIds, ...binaryStudyIds] as const;
const studyCollections = { original: originalStudyIds, more: additionalStudyIds, 'image-making': imageMakingStudyIds, painting: paintingStudyIds, pencil: pencilStudyIds, comparison: ['waves', 'binary-tide'] as const, all: studyIds };
type StudyId = typeof studyIds[number];
type Point = readonly [number, number];

const studies: Record<StudyId, { name: string; description: string }> = {
	waves: {
		name: localize('imageStudy.waves', "Flowing waves"),
		description: localize('imageStudy.waves.description', "The previous chat loader. Open contour lines ripple in staggered phases."),
	},
	ribbons: {
		name: localize('imageStudy.ribbons', "Crossing ribbons"),
		description: localize('imageStudy.ribbons.description', "Two fine ribbons weave through one another without moving the whole field."),
	},
	'dot-tide': {
		name: localize('imageStudy.dotTide', "Dot tide"),
		description: localize('imageStudy.dotTide.description', "A rolling swell lifts a quiet field of dots, then lets them settle."),
	},
	orbits: {
		name: localize('imageStudy.orbits', "Particle orbits"),
		description: localize('imageStudy.orbits.description', "Small particle trails circulate on three flattened orbital paths."),
	},
	ripples: {
		name: localize('imageStudy.ripples', "Water rings"),
		description: localize('imageStudy.ripples.description', "Overlapping ripples expand and dissolve, like a drop on still water."),
	},
	splash: {
		name: localize('imageStudy.splash', "Little splash"),
		description: localize('imageStudy.splash.description', "Tiny droplets rise, fall, and meet a soft ring of surface ripples."),
	},
	liquid: {
		name: localize('imageStudy.liquid', "Liquid loops"),
		description: localize('imageStudy.liquid.description', "Nested, rounded loops gently change shape from within."),
	},
	islands: {
		name: localize('imageStudy.islands', "Contour islands"),
		description: localize('imageStudy.islands.description', "Two small islands continuously reshape their irregular contour lines."),
	},
	fireflies: {
		name: localize('imageStudy.fireflies', "Fireflies"),
		description: localize('imageStudy.fireflies.description', "Scattered points wander and brighten independently, without a rigid grid."),
	},
	constellation: {
		name: localize('imageStudy.constellation', "Constellation"),
		description: localize('imageStudy.constellation.description', "Light travels between a few connected points while the structure stays still."),
	},
	ink: {
		name: localize('imageStudy.ink', "Ink bloom"),
		description: localize('imageStudy.ink.description', "Translucent ink shapes slowly open into one another. No blur or background glow."),
	},
	petals: {
		name: localize('imageStudy.petals', "Petal drift"),
		description: localize('imageStudy.petals.description', "A loose rosette opens petal by petal rather than spinning as one object."),
	},
	silk: {
		name: localize('imageStudy.silk', "Silk threads"),
		description: localize('imageStudy.silk.description', "Fine strands carry a continuous traveling wave across an open canvas."),
	},
	mosaic: {
		name: localize('imageStudy.mosaic', "Focus mosaic"),
		description: localize('imageStudy.mosaic.description', "Small tiles gather and soften in a diagonal rhythm, without framing an image."),
	},
	brush: {
		name: localize('imageStudy.brush', "Brush passes"),
		description: localize('imageStudy.brush.description', "Short strokes follow long, curved paths, like repeated marks on a sketch."),
	},
	caustics: {
		name: localize('imageStudy.caustics', "Pool light"),
		description: localize('imageStudy.caustics.description', "An open mesh bends like light refracting through moving water."),
	},
	dunes: {
		name: localize('imageStudy.dunes', "Sifting dunes"),
		description: localize('imageStudy.dunes.description', "Little grains travel over low ridges, like wind moving across sand."),
	},
	rain: {
		name: localize('imageStudy.rain', "Rain garden"),
		description: localize('imageStudy.rain.description', "Fine drops land in different places, each leaving a small expanding ripple."),
	},
	bubbles: {
		name: localize('imageStudy.bubbles', "Bubble raft"),
		description: localize('imageStudy.bubbles.description', "Hollow bubbles drift and gently change their proportions, with tiny rim highlights."),
	},
	vortex: {
		name: localize('imageStudy.vortex', "Particle vortex"),
		description: localize('imageStudy.vortex.description', "Three trails of particles curl inward along long, open spirals."),
	},
	magnet: {
		name: localize('imageStudy.magnet', "Magnetic field"),
		description: localize('imageStudy.magnet.description', "Light follows curved field lines between two small, stationary poles."),
	},
	aurora: {
		name: localize('imageStudy.aurora', "Aurora folds"),
		description: localize('imageStudy.aurora.description', "A curtain of fine vertical lines folds and flows, without a painted glow."),
	},
	feather: {
		name: localize('imageStudy.feather', "Feather fan"),
		description: localize('imageStudy.feather.description', "A curved spine and delicate barbs flex together like a feather in a breeze."),
	},
	origami: {
		name: localize('imageStudy.origami', "Origami field"),
		description: localize('imageStudy.origami.description', "Connected triangular facets rise and settle in a traveling paper fold."),
	},
	seeds: {
		name: localize('imageStudy.seeds', "Floating seeds"),
		description: localize('imageStudy.seeds.description', "Small parachute seeds drift up and across the canvas at different moments."),
	},
	loom: {
		name: localize('imageStudy.loom', "Loop loom"),
		description: localize('imageStudy.loom.description', "Continuous threads weave a shifting, knotted shape without turning the whole mark."),
	},
	echoes: {
		name: localize('imageStudy.echoes', "Gentle echoes"),
		description: localize('imageStudy.echoes.description', "Open arcs draw and release in sequence, like a soft echo spreading outward."),
	},
	hatching: {
		name: localize('imageStudy.hatching', "Pencil hatch"),
		description: localize('imageStudy.hatching.description', "Short diagonal strokes sketch themselves in and out across a loose patch of texture."),
	},
	streamers: {
		name: localize('imageStudy.streamers', "Paper streamers"),
		description: localize('imageStudy.streamers.description', "Slim curled strips turn edge-on and open again, each following its own rhythm."),
	},
	cells: {
		name: localize('imageStudy.cells', "Cell garden"),
		description: localize('imageStudy.cells.description', "A field of rounded membranes expands and reshapes in a slow, organic rhythm."),
	},
	horizon: {
		name: localize('imageStudy.horizon', "Horizon tide"),
		description: localize('imageStudy.horizon.description', "Low wave fronts emerge from the distance and spread toward you."),
	},
	sparks: {
		name: localize('imageStudy.sparks', "Soft sparks"),
		description: localize('imageStudy.sparks.description', "Small four-point shapes open, turn, and dim independently. No sudden flashes."),
	},
	strings: {
		name: localize('imageStudy.strings', "Resonant strings"),
		description: localize('imageStudy.strings.description', "Fine standing waves bend between fixed endpoints, like a quietly resonating harp."),
	},
	aperture: {
		name: localize('imageStudy.aperture', "Aperture bloom"),
		description: localize('imageStudy.aperture.description', "Eight curved blades open and close around a shifting central aperture."),
	},
	flow: {
		name: localize('imageStudy.flow', "Flow field"),
		description: localize('imageStudy.flow.description', "A field of short marks turns to follow an invisible, wandering current."),
	},
	helix: {
		name: localize('imageStudy.helix', "Beaded helix"),
		description: localize('imageStudy.helix.description', "Two beaded strands trade depth as their waves pass through each other."),
	},
	exposure: {
		name: localize('imageStudy.exposure', "Latent exposure"),
		description: localize('imageStudy.exposure.description', "A darkroom moment: light passes over an invisible sketch and a little landscape develops."),
	},
	'silver-grain': {
		name: localize('imageStudy.silverGrain', "Silver-grain sunrise"),
		description: localize('imageStudy.silverGrain.description', "Photographic grains gather into a sun and hills, then loosen back into possibility."),
	},
	'focus-pull': {
		name: localize('imageStudy.focusPull', "Pulling focus"),
		description: localize('imageStudy.focusPull.description', "Three fine impressions converge into one sharp drawing. Optical focus without a blur filter."),
	},
	prism: {
		name: localize('imageStudy.prism', "Prism to picture"),
		description: localize('imageStudy.prism.description', "A strand of light enters a prism; separated rays begin drawing a picture on the other side."),
	},
	registration: {
		name: localize('imageStudy.registration', "Chromatic registration"),
		description: localize('imageStudy.registration.description', "Three offset color plates slide into register, like an illustration coming off a printing press."),
	},
	proofs: {
		name: localize('imageStudy.proofs', "Little proofs"),
		description: localize('imageStudy.proofs.description', "Three unframed thumbnail sketches take turns developing, like ideas on a photographer's light table."),
	},
	daydream: {
		name: localize('imageStudy.daydream', "One-line daydream"),
		description: localize('imageStudy.daydream.description', "A traveling point draws hills, a cloud, and a sun with one continuous, looping line."),
	},
	wash: {
		name: localize('imageStudy.wash', "Sketch to wash"),
		description: localize('imageStudy.wash.description', "A vase and a sprig sketch themselves first; translucent ink follows the drawing."),
	},
	bristles: {
		name: localize('imageStudy.bristles', "Bristle ballet"),
		description: localize('imageStudy.bristles.description', "Individual brush hairs paint a sweeping feather, leaving crisp, tapering trails."),
	},
	cyanotype: {
		name: localize('imageStudy.cyanotype', "Cyanotype garden"),
		description: localize('imageStudy.cyanotype.description', "A botanical contact print emerges leaf by leaf, with fine veins left visible in the ink."),
	},
	engraving: {
		name: localize('imageStudy.engraving', "Engraver's light"),
		description: localize('imageStudy.engraving.description', "Fine carved lines describe a small sunlit landscape, as if an engraving is finding its contours."),
	},
	embroidery: {
		name: localize('imageStudy.embroidery', "Thread sketch"),
		description: localize('imageStudy.embroidery.description', "A running stitch follows the petals of a flower, with a loose thread trailing from the drawing."),
	},
	'paper-scene': {
		name: localize('imageStudy.paperScene', "Paper landscape"),
		description: localize('imageStudy.paperScene.description', "Cut-paper hills lift into a layered little scene, then fold softly away."),
	},
	'stained-glass': {
		name: localize('imageStudy.stainedGlass', "Stained-glass wings"),
		description: localize('imageStudy.stainedGlass.description', "Loose translucent facets settle into a butterfly. Light, not a solid placeholder box."),
	},
	porcelain: {
		name: localize('imageStudy.porcelain', "Porcelain moon"),
		description: localize('imageStudy.porcelain.description', "Small curved pieces fit together into a crescent, while a few unfinished stars wait nearby."),
	},
	marbling: {
		name: localize('imageStudy.marbling', "Marbling bath"),
		description: localize('imageStudy.marbling.description', "Narrow ribbons of pigment curl and reshape inside an open pool, like a print before the paper touches it."),
	},
	relief: {
		name: localize('imageStudy.relief', "Light-field relief"),
		description: localize('imageStudy.relief.description', "Thin slices rise from a flat drawing into a miniature relief, with light tracing their edges."),
	},
	tessellation: {
		name: localize('imageStudy.tessellation', "Tessellated bloom"),
		description: localize('imageStudy.tessellation.description', "Folded triangular pieces open into an illustrated flower, one facet at a time."),
	},
	'pixel-sort': {
		name: localize('imageStudy.pixelSort', "Pixels find a picture"),
		description: localize('imageStudy.pixelSort.description', "Scattered pixels find their places in a tiny landscape, hold together, and scatter again."),
	},
	raster: {
		name: localize('imageStudy.raster', "Raster atelier"),
		description: localize('imageStudy.raster.description', "Fine scanlines extend into a picture in staggered passes, like a quiet, imaginary image decoder."),
	},
	wireframe: {
		name: localize('imageStudy.wireframe', "Wireframe to surface"),
		description: localize('imageStudy.wireframe.description', "An open mesh gains translucent planes, turning a construction drawing into a low-poly image."),
	},
	dithering: {
		name: localize('imageStudy.dithering', "Dither bird"),
		description: localize('imageStudy.dithering.description', "A cloud of tiny marks resolves into a hummingbird silhouette, then drifts apart without flashing."),
	},
	frequencies: {
		name: localize('imageStudy.frequencies', "Signal to scene"),
		description: localize('imageStudy.frequencies.description', "Fine wave signals become image contours: an abstract hint of pixels being decoded."),
	},
	bezier: {
		name: localize('imageStudy.bezier', "Bezier workshop"),
		description: localize('imageStudy.bezier.description', "Control handles gently reshape an illustrated leaf while a bright stroke explores its outline."),
	},
	graphite: {
		name: localize('imageStudy.graphite', "Graphite wander"),
		description: localize('imageStudy.graphite.description', "Three almost-overlapping pencil lines follow an unhurried curve, leaving a faint memory of each pass."),
	},
	'pencil-sphere': {
		name: localize('imageStudy.pencilSphere', "A pencil study"),
		description: localize('imageStudy.pencilSphere.description', "Short curved marks gradually shade a small sphere. A drawing exercise rather than a spinner."),
	},
	'leaf-study': {
		name: localize('imageStudy.leafStudy', "Quiet contour"),
		description: localize('imageStudy.leafStudy.description', "A single leaf is traced in a few light pencil passes, with its construction line barely visible."),
	},
	'dry-brush': {
		name: localize('imageStudy.dryBrush', "Dry-brush drift"),
		description: localize('imageStudy.dryBrush.description', "Fine, broken bristle marks pull across a short swatch. The gaps do as much work as the ink."),
	},
	'watercolor-edge': {
		name: localize('imageStudy.watercolorEdge', "Watercolor edge"),
		description: localize('imageStudy.watercolorEdge.description', "A small wash stays still while pigment gently gathers along its irregular edge. No blur or glow."),
	},
	'wet-on-wet': {
		name: localize('imageStudy.wetOnWet', "Wet on wet"),
		description: localize('imageStudy.wetOnWet.description', "Three very light pools of pigment meet and slowly change their seams, like wet paint touching paper."),
	},
	capillary: {
		name: localize('imageStudy.capillary', "Capillary ink"),
		description: localize('imageStudy.capillary.description', "Tiny branches carry ink away from a pen mark, suggesting paper fibers taking up a fresh stroke."),
	},
	charcoal: {
		name: localize('imageStudy.charcoal', "Charcoal turn"),
		description: localize('imageStudy.charcoal.description', "A crescent of small, broken marks picks up pressure and releases it without moving the whole drawing."),
	},
	pastel: {
		name: localize('imageStudy.pastel', "Pastel scumble"),
		description: localize('imageStudy.pastel.description', "Short rounded marks build a soft patch of texture. A little more pigment arrives, then rests."),
	},
	crosshatch: {
		name: localize('imageStudy.crosshatch', "Crosshatch pause"),
		description: localize('imageStudy.crosshatch.description', "Two sets of light, imperfect hatching take turns shading an open patch of paper."),
	},
	'fountain-nib': {
		name: localize('imageStudy.fountainNib', "Fountain-pen thought"),
		description: localize('imageStudy.fountainNib.description', "A tiny nib follows one easy line. The faint underdrawing remains while the pen lifts."),
	},
	'working-brush': {
		name: localize('imageStudy.workingBrush', "A single brushstroke"),
		description: localize('imageStudy.workingBrush.description', "A small brush moves through a restrained S-curve, leaving a few visible bristle trails."),
	},
	'palette-knife': {
		name: localize('imageStudy.paletteKnife', "Palette-knife skim"),
		description: localize('imageStudy.paletteKnife.description', "Thin ridges of paint appear in a flat, angled pass, with little highlights along the scraped edges."),
	},
	gouache: {
		name: localize('imageStudy.gouache', "Gouache layers"),
		description: localize('imageStudy.gouache.description', "Four small, uneven swatches settle onto one another. Muted pigment, no hard rectangle."),
	},
	gesture: {
		name: localize('imageStudy.gesture', "Gesture study"),
		description: localize('imageStudy.gesture.description', "A few long, loose lines search for a form without ever becoming a finished illustration."),
	},
	'line-wash': {
		name: localize('imageStudy.lineWash', "Line and wash"),
		description: localize('imageStudy.lineWash.description', "An airy petal outline appears first; a small watercolor mark quietly follows inside it."),
	},
	chalk: {
		name: localize('imageStudy.chalk', "Chalk horizon"),
		description: localize('imageStudy.chalk.description', "Broken chalk marks suggest a low horizon. Only small sections brighten as the drawing continues."),
	},
	stippling: {
		name: localize('imageStudy.stippling', "Stipple shading"),
		description: localize('imageStudy.stippling.description', "Tiny stationary ink dots accumulate in an organic patch, like patient shading with the tip of a pen."),
	},
	eraser: {
		name: localize('imageStudy.eraser', "The eraser pass"),
		description: localize('imageStudy.eraser.description', "A soft, narrow clearing travels across pencil texture, then the sketch quietly returns."),
	},
	calligraphy: {
		name: localize('imageStudy.calligraphy', "Calligraphic breath"),
		description: localize('imageStudy.calligraphy.description', "A thin-to-thick ink gesture grows across the paper, with a soft lift at either end."),
	},
	'pencil-fill': {
		name: localize('imageStudy.pencilFill', "Coloring in"),
		description: localize('imageStudy.pencilFill.description', "Soft, curved pencil sweeps fill a wide rectangle from top-left to bottom-right. Earlier marks stay in place."),
	},
	'pencil-loops': {
		name: localize('imageStudy.pencilLoops', "Little scribbles"),
		description: localize('imageStudy.pencilLoops.description', "Looser, looping pencil gestures fill the same wide area, with rounded turns and space between the marks."),
	},
	'pencil-layers': {
		name: localize('imageStudy.pencilLayers', "One more pass"),
		description: localize('imageStudy.pencilLayers.description', "Different curves, the same top-left-to-bottom-right sweep. The first pass finishes, then fades as the second is drawn."),
	},
	'pencil-tooth': {
		name: localize('imageStudy.pencilTooth', "Paper tooth"),
		description: localize('imageStudy.pencilTooth.description', "A grainier version of the curved shading, leaving flecks of paper in each mark."),
	},
	'binary-tide': {
		name: localize('imageStudy.binaryTide', "Binary tide"),
		description: localize('imageStudy.binaryTide.description', "The current chat loader. Swells roll through binary digits like water, after the 2025 website hero. Read as ASCII, the digits spell a greeting."),
	},
};

function smoothPath(points: readonly Point[], closed = false): string {
	const midpoint = (first: Point, second: Point): Point => [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
	const format = ([x, y]: Point) => `${x.toFixed(2)},${y.toFixed(2)}`;
	const start = closed ? midpoint(points[points.length - 1], points[0]) : points[0];
	return `M${format(start)}${points.map((point, index) => {
		const next = points[index + 1] ?? (closed ? points[0] : point);
		return `Q${format(point)} ${format(midpoint(point, next))}`;
	}).join('')}${closed ? 'Z' : ''}`;
}

function addShape(parent: SVGElement, tag: 'path' | 'circle' | 'ellipse' | 'rect' | 'g', attributes: Record<string, string>, motion: string, delay = 0, duration = 6): SVGElement {
	const shape = parent.appendChild(dom.$.SVG<SVGElement>(tag, {
		...attributes,
		class: 'image-loading-study-shape',
		'vector-effect': 'non-scaling-stroke',
	}));
	shape.style.setProperty('--image-study-motion', `image-study-${motion}`);
	shape.style.setProperty('--image-study-delay', `${-delay}s`);
	shape.style.setProperty('--image-study-duration', `${duration}s`);
	return shape;
}

function addMorph(parent: SVGElement, frame: (phase: number) => string, delay = 0, duration = 9): SVGElement {
	const frames = Array.from({ length: 4 }, (_, index) => frame(index * Math.PI / 2));
	const path = addShape(parent, 'path', { d: frames[0] }, 'morph', delay, duration);
	for (const [index, value] of frames.entries()) {
		path.style.setProperty(`--image-study-frame-${index}`, `path("${value}")`);
	}
	return path;
}

function loopPath(center: Point, radius: number, phase: number, lobes: number): string {
	return smoothPath(Array.from({ length: 40 }, (_, index): Point => {
		const angle = index / 40 * Math.PI * 2;
		const distance = radius * (1 + 0.17 * Math.sin(angle * lobes + phase) + 0.09 * Math.cos(angle * (lobes + 1) - phase));
		return [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance * 0.76];
	}), true);
}

function tintShape(shape: SVGElement, tone: number): SVGElement {
	shape.classList.add(`image-loading-study-tone-${tone % 4}`);
	return shape;
}

function addDrawnPath(parent: SVGElement, d: string, delay = 0, duration = 8): SVGElement {
	return addShape(parent, 'path', { d, pathLength: '100', 'stroke-dasharray': '100 100' }, 'draw', delay, duration);
}

function addLandscape(parent: SVGElement, variation = 0): void {
	parent.appendChild(dom.$.SVG('circle', { cx: `${275 - variation * 22}`, cy: '79', r: '18' }));
	parent.appendChild(dom.$.SVG('path', { d: `M82 169 L${173 + variation * 12} 83 L240 153 L278 115 L338 169` }));
	parent.appendChild(dom.$.SVG('path', { d: 'M81 180 Q141 150 211 174 T338 171', opacity: '.55' }));
	parent.appendChild(dom.$.SVG('path', { d: 'M127 126 Q151 115 173 128 L188 115 L213 125', opacity: '.55' }));
}

function addSketchPath(parent: SVGElement, d: string, delay = 0, duration = 12): SVGElement {
	parent.appendChild(dom.$.SVG('path', { d, class: 'image-loading-study-underdrawing' }));
	return addShape(parent, 'path', { d, pathLength: '100', 'stroke-dasharray': '100 100' }, 'sketch', delay, duration);
}

function pigmentPath(center: Point, radius: number, phase: number): string {
	return smoothPath(Array.from({ length: 48 }, (_, index): Point => {
		const angle = index / 48 * Math.PI * 2;
		const edge = radius * (1 + 0.07 * Math.sin(angle * 5 + phase) + 0.04 * Math.cos(angle * 7 - phase));
		return [center[0] + Math.cos(angle) * edge, center[1] + Math.sin(angle) * edge * 0.57];
	}), true);
}

function addDrawingTip(parent: SVGElement, path: string, kind: 'nib' | 'brush'): void {
	const tip = addShape(parent, 'g', {}, 'pen', 0, 12);
	tip.classList.add('image-loading-study-pen', 'image-loading-study-drawing-tip');
	tip.style.setProperty('--image-study-pen-path', `path("${path}")`);
	const tool = tip.appendChild(dom.$.SVG('g', { transform: 'rotate(28)' }));
	tool.appendChild(dom.$.SVG('path', {
		d: kind === 'nib'
			? 'M0 0 L-5 -13 L-1 -24 L5 -13 Z M0 -1 V-14'
			: 'M0 0 Q-7 -5 -5 -13 H4 Q5 -5 0 0Z M-4 -13 L-3 -31 Q0 -36 3 -31 L3 -13 M-4 -17 H3',
		class: 'image-loading-study-anchor',
	}));
	if (kind === 'nib') {
		tool.appendChild(dom.$.SVG('circle', { cx: '0', cy: '-15', r: '1.2' }));
	}
}

/**
 * The previous chat loader: open contour lines that ripple in staggered phases.
 */
function renderWaves(stage: HTMLElement): void {
	const contours = dom.append(stage, dom.$.SVG<SVGSVGElement>('svg', {
		class: 'image-loading-study-waves',
		viewBox: '0 0 420 315',
		preserveAspectRatio: 'none',
		fill: 'none',
		focusable: 'false',
	}));
	for (let index = 0; index < 19; index++) {
		const y = 22 + index * 15;
		const curve = Math.sin(index / 18 * Math.PI) * 72;
		const contour = contours.appendChild(dom.$.SVG<SVGPathElement>('path', {
			class: 'image-loading-study-wave',
			d: `M -40 ${y + 24} C 36 ${y + 24}, 52 ${y - curve}, 128 ${y - curve} S 244 ${y + curve * 0.55}, 300 ${y + curve * 0.55} S 408 ${y - 12}, 460 ${y - 12}`,
			'vector-effect': 'non-scaling-stroke',
		}));
		contour.style.animationDelay = `${-index * 0.18}s`;
	}
}

function renderArtwork(svg: SVGSVGElement, study: Exclude<StudyId, 'waves' | 'binary-tide'>): void {
	switch (study) {
		case 'ribbons':
		case 'silk':
			for (let index = 0; index < 18; index++) {
				addMorph(svg, phase => smoothPath(Array.from({ length: 33 }, (_, step): Point => {
					const x = -30 + step * 15;
					const ribbon = index < 9 ? 1 : -1;
					const spread = study === 'ribbons' ? (index % 9 - 4) * 5 : (index - 8.5) * 8;
					const wave = study === 'ribbons'
						? ribbon * 65 * Math.sin(x / 105 + phase)
						: 44 * Math.sin(x / 90 - phase + index * 0.09);
					return [x, 120 + spread + wave];
				})), 0, study === 'ribbons' ? 11 : 8);
			}
			return;
		case 'dot-tide':
		case 'mosaic':
			for (let row = 0; row < 8; row++) {
				for (let column = 0; column < 14; column++) {
					const x = 41 + column * 26;
					const y = 43 + row * 22;
					const shape = study === 'dot-tide'
						? addShape(svg, 'circle', { cx: `${x}`, cy: `${y}`, r: '1.8' }, 'dot-tide', column * 0.27 + row * 0.1, 5.5)
						: addShape(svg, 'rect', { x: `${x - 6}`, y: `${y - 6}`, width: '12', height: '12', rx: '2' }, 'mosaic', column * 0.24 + row * 0.18, 6.5);
					shape.classList.add(study === 'dot-tide' ? 'image-loading-study-dot' : 'image-loading-study-tile');
				}
			}
			return;
		case 'orbits': {
			const plane = svg.appendChild(dom.$.SVG('g', { transform: 'translate(210 120) rotate(-16) scale(1 .48) translate(-210 -120)' }));
			for (let orbit = 0; orbit < 3; orbit++) {
				const radius = 60 + orbit * 38;
				plane.appendChild(dom.$.SVG('circle', { cx: '210', cy: '120', r: `${radius}`, opacity: '.15' }));
				const group = addShape(plane, 'g', {}, 'orbit', orbit * 1.4, 8 + orbit * 3);
				group.classList.add('image-loading-study-orbit');
				for (let index = 0; index < 10; index++) {
					const angle = index * 0.14;
					group.appendChild(dom.$.SVG('circle', {
						class: 'image-loading-study-dot',
						cx: `${210 + Math.cos(angle) * radius}`,
						cy: `${120 + Math.sin(angle) * radius}`,
						r: `${1.1 + index * 0.18}`,
						opacity: `${0.15 + index * 0.085}`,
					}));
				}
			}
			return;
		}
		case 'ripples':
		case 'splash':
			for (let index = 0; index < 7; index++) {
				addShape(svg, 'ellipse', {
					cx: '210', cy: study === 'splash' ? '164' : '120',
					rx: `${38 + index * 13}`, ry: `${(38 + index * 13) * (study === 'splash' ? 0.28 : 0.56)}`,
				}, 'ripple', index * 0.85, 6);
			}
			if (study === 'splash') {
				for (let index = 0; index < 18; index++) {
					const angle = Math.PI * (1.1 + index / 17 * 0.8);
					const x = Math.cos(angle);
					const y = Math.sin(angle);
					const drop = addShape(svg, 'ellipse', { cx: `${210 + x * 38}`, cy: `${145 + y * 32}`, rx: '1.8', ry: '3.2' }, 'splash', index * 0.31, 4.8);
					drop.classList.add('image-loading-study-dot');
					drop.style.setProperty('--image-study-x', `${x * (45 + index % 4 * 15)}px`);
					drop.style.setProperty('--image-study-y', `${y * (48 + index % 3 * 18)}px`);
				}
			}
			return;
		case 'liquid':
		case 'islands':
			for (let island = 0; island < (study === 'islands' ? 2 : 1); island++) {
				for (let index = 0; index < 10; index++) {
					const center: Point = study === 'islands' ? [145 + island * 140, 110 + island * 25] : [210, 120];
					const radius = (study === 'islands' ? 14 : 25) + index * 8;
					addMorph(svg, phase => loopPath(center, radius, phase + index * 0.13 + island * 2, study === 'islands' ? 3 : 2), index * 0.12, 10 + island * 2);
				}
			}
			return;
		case 'fireflies':
			for (let index = 0; index < 42; index++) {
				const dot = addShape(svg, 'circle', {
					cx: `${55 + index * 73 % 310}`, cy: `${40 + index * 47 % 164}`, r: `${1.1 + index % 4 * 0.35}`,
				}, 'firefly', index * 0.43, 6 + index % 5);
				dot.classList.add('image-loading-study-dot');
				dot.style.setProperty('--image-study-x', `${Math.sin(index * 2.3) * 18}px`);
				dot.style.setProperty('--image-study-y', `${Math.cos(index * 1.7) * 14}px`);
			}
			return;
		case 'constellation': {
			const points: readonly Point[] = [[80, 122], [132, 76], [160, 155], [205, 106], [235, 65], [272, 151], [314, 94], [342, 143], [214, 186]];
			const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 8], [3, 4], [3, 5], [4, 6], [5, 6], [5, 8], [6, 7], [5, 7]];
			for (const [index, [from, to]] of edges.entries()) {
				const d = `M${points[from].join(',')} L${points[to].join(',')}`;
				svg.appendChild(dom.$.SVG('path', { d, opacity: '.15' }));
				const connection = addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': '18 82' }, 'trace', index * 0.47, 5);
				connection.classList.add('image-loading-study-trace');
			}
			for (const [index, [x, y]] of points.entries()) {
				addShape(svg, 'circle', { cx: `${x}`, cy: `${y}`, r: '2.5' }, 'twinkle', index * 0.5, 5).classList.add('image-loading-study-dot');
			}
			return;
		}
		case 'ink':
			for (let index = 0; index < 7; index++) {
				const center: Point = [210 + Math.cos(index * 2.4) * 37, 120 + Math.sin(index * 2.4) * 24];
				const ink = addShape(svg, 'path', { d: loopPath(center, 45 + index * 3, index, 3) }, 'bloom', index * 1.1, 9);
				ink.classList.add('image-loading-study-ink');
			}
			return;
		case 'petals':
			for (let index = 0; index < 12; index++) {
				const group = svg.appendChild(dom.$.SVG('g', { transform: `rotate(${index * 30} 210 120)` }));
				addShape(group, 'path', { d: 'M 215 116 C 232 81 278 66 291 85 C 287 110 245 128 215 116 Z' }, 'petal', index * 0.48, 7);
			}
			return;
		case 'brush':
			for (let index = 0; index < 10; index++) {
				const y = 55 + index * 14;
				const stroke = addShape(svg, 'path', {
					d: `M 50 ${y + 20} C 140 ${y - 55}, 243 ${y + 42}, 370 ${y - 8}`,
					pathLength: '100', 'stroke-dasharray': '30 70',
				}, 'trace', index * 0.5, 6);
				stroke.classList.add('image-loading-study-brush');
			}
			return;
		case 'caustics':
			for (const vertical of [false, true]) {
				for (let index = 0; index < (vertical ? 14 : 10); index++) {
					addMorph(svg, phase => smoothPath(Array.from({ length: 25 }, (_, step): Point => {
						const x = vertical ? -15 + index * 35 : -30 + step * 20;
						const y = vertical ? -20 + step * 12 : index * 27;
						return [x + 15 * Math.sin(y / 43 + phase) + 6 * Math.cos(x / 61 - phase), y + 13 * Math.sin(x / 54 - phase) + 5 * Math.cos(y / 37 + phase)];
					})), 0, 10);
				}
			}
			return;
		case 'dunes':
			for (let row = 0; row < 8; row++) {
				for (let column = 0; column < 15; column++) {
					const x = 47 + column * 23;
					const y = 55 + row * 18 + 20 * Math.sin(x / 75 + row * 0.24);
					addShape(svg, 'path', { d: `M${x} ${y} l4 -2` }, 'dune', column * 0.32 + row * 0.19, 7);
				}
			}
			return;
		case 'rain': {
			const centers: readonly Point[] = [[105, 142], [160, 98], [219, 163], [276, 117], [320, 171]];
			for (const [index, [x, y]] of centers.entries()) {
				addShape(svg, 'path', { d: `M${x} ${y - 30} v9` }, 'rain', index * 0.87, 4.8);
				for (let ring = 0; ring < 3; ring++) {
					addShape(svg, 'ellipse', { cx: `${x}`, cy: `${y}`, rx: `${12 + ring * 5}`, ry: `${5 + ring * 2}` }, 'rain-ring', index * 0.87 - ring * 0.14, 4.8);
				}
			}
			return;
		}
		case 'bubbles':
			for (let index = 0; index < 12; index++) {
				const x = 99 + index % 4 * 72 + Math.sin(index * 2) * 9;
				const y = 64 + Math.floor(index / 4) * 52;
				const radius = 14 + index * 7 % 19;
				const bubble = addShape(svg, 'g', {}, 'bubble', index * 0.53, 8 + index % 3);
				bubble.style.setProperty('--image-study-x', `${Math.sin(index) * 9}px`);
				bubble.style.setProperty('--image-study-y', `${Math.cos(index) * 8}px`);
				bubble.appendChild(dom.$.SVG('circle', { cx: `${x}`, cy: `${y}`, r: `${radius}` }));
				bubble.appendChild(dom.$.SVG('path', {
					d: `M${x - radius * 0.4} ${y - radius * 0.7} Q${x - radius * 0.75} ${y - radius * 0.6} ${x - radius * 0.7} ${y - radius * 0.15}`,
					opacity: '.5',
				}));
			}
			return;
		case 'vortex':
			for (let arm = 0; arm < 3; arm++) {
				const d = smoothPath(Array.from({ length: 80 }, (_, index): Point => {
					const progress = index / 79;
					const angle = progress * Math.PI * 2.3 + arm * Math.PI * 2 / 3;
					const radius = 135 * (1 - progress * 0.88);
					return [210 + Math.cos(angle) * radius, 120 + Math.sin(angle) * radius * 0.66];
				}));
				svg.appendChild(dom.$.SVG('path', { d, opacity: '.12' }));
				addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': '.1 4.9' }, 'trace', arm * 1.3, 12)
					.classList.add('image-loading-study-particles', 'image-loading-study-trace');
			}
			return;
		case 'magnet':
			for (const side of [-1, 1]) {
				for (let index = 0; index < 9; index++) {
					const bend = 16 + index * 7;
					const d = `M135 120 C${135 - bend} ${120 + side * bend * 1.55} ${285 + bend} ${120 + side * bend * 1.55} 285 120`;
					svg.appendChild(dom.$.SVG('path', { d, opacity: '.18' }));
					addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': '24 76' }, 'trace', index * 0.5 + side, 9 + index * 0.3)
						.classList.add('image-loading-study-trace');
				}
			}
			for (const x of [135, 285]) {
				svg.appendChild(dom.$.SVG('circle', { class: 'image-loading-study-dot', cx: `${x}`, cy: '120', r: '2.5', opacity: '.65' }));
			}
			return;
		case 'aurora':
			for (let index = 0; index < 20; index++) {
				addMorph(svg, phase => smoothPath(Array.from({ length: 30 }, (_, step): Point => {
					const y = 15 + step * 7.3;
					const fold = Math.sin(y / 51 + phase + index * 0.12) * (25 + index * 0.6);
					return [65 + index * 15 + fold + 11 * Math.cos(index / 4 - phase), y];
				})), 0, 12);
			}
			return;
		case 'feather': {
			const spine = (position: number, phase: number): Point => [
				90 + 245 * position,
				185 - 130 * position + 13 * Math.sin(phase + position * Math.PI) * Math.sin(position * Math.PI),
			];
			addMorph(svg, phase => smoothPath(Array.from({ length: 25 }, (_, index) => spine(index / 24, phase))), 0, 9);
			for (const side of [-1, 1]) {
				for (let index = 0; index < 19; index++) {
					addMorph(svg, phase => {
						const position = 0.06 + index * 0.045;
						const [x, y] = spine(position, phase);
						const [tipX, tipY] = spine(position + 0.1, phase);
						const width = (7 + 32 * Math.sin(position * Math.PI)) * (1 + 0.16 * Math.sin(phase + position * 2));
						return `M${x} ${y} Q${x + 12 + side * width * 0.6} ${y - 9 + side * width * 0.7} ${tipX + side * width * 0.5} ${tipY + side * width}`;
					}, 0, 9);
				}
			}
			return;
		}
		case 'origami': {
			const vertex = (column: number, row: number, phase: number): Point => [
				36 + column * 58 + 4 * Math.sin(row + phase),
				42 + row * 51 + 16 * Math.sin(column * 0.8 + row * 0.6 - phase),
			];
			for (let row = 0; row < 3; row++) {
				for (let column = 0; column < 6; column++) {
					for (const triangle of [
						[[column, row], [column + 1, row], [column, row + 1]],
						[[column + 1, row], [column + 1, row + 1], [column, row + 1]],
					]) {
						addMorph(svg, phase => `M${triangle.map(([x, y]) => vertex(x, y, phase).join(',')).join('L')}Z`, 0, 10)
							.classList.add('image-loading-study-facet');
					}
				}
			}
			return;
		}
		case 'seeds':
			for (let index = 0; index < 16; index++) {
				const x = 58 + index * 73 % 302;
				const y = 46 + index * 47 % 154;
				const seed = addShape(svg, 'g', {}, 'seed', index * 0.57, 8 + index % 3);
				seed.style.setProperty('--image-study-x', `${24 + index % 4 * 7}px`);
				seed.style.setProperty('--image-study-y', `${-28 - index % 3 * 9}px`);
				seed.appendChild(dom.$.SVG('path', { d: `M${x} ${y + 11} Q${x - 7} ${y + 3} ${x} ${y - 11}` }));
				for (const spread of [-9, -3, 3, 9]) {
					seed.appendChild(dom.$.SVG('path', { d: `M${x} ${y - 11} Q${x + spread * 0.4} ${y - 21} ${x + spread} ${y - 20}` }));
				}
				seed.appendChild(dom.$.SVG('circle', { class: 'image-loading-study-dot', cx: `${x}`, cy: `${y + 11}`, r: '1.5' }));
			}
			return;
		case 'loom':
			for (let index = 0; index < 6; index++) {
				addMorph(svg, phase => smoothPath(Array.from({ length: 80 }, (_, step): Point => {
					const angle = step / 80 * Math.PI * 2;
					return [
						210 + (112 + index * 3) * Math.sin(angle * 2 + 0.6 * Math.sin(phase) + index * 0.035),
						120 + (65 + index * 2) * Math.sin(angle * 3 + 0.45 * Math.cos(phase) + index * 0.065),
					];
				}), true), 0, 12);
			}
			return;
		case 'echoes':
			for (let index = 0; index < 13; index++) {
				const radius = 28 + index * 8;
				const d = smoothPath(Array.from({ length: 36 }, (_, step): Point => {
					const angle = Math.PI * (0.5 + step / 35 * 1.42) + index * 0.018;
					return [210 + Math.cos(angle) * radius, 120 + Math.sin(angle) * radius * 0.69];
				}));
				addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': '100 100' }, 'echo', index * 0.26, 7);
			}
			return;
		case 'hatching':
			for (let row = 0; row < 7; row++) {
				for (let column = 0; column < 12; column++) {
					const x = 67 + column * 26;
					const y = 56 + row * 21 + Math.sin(column * 0.5) * 9;
					addShape(svg, 'path', { d: `M${x - 6} ${y + 5} l12 -10`, pathLength: '100', 'stroke-dasharray': '100 100' }, 'hatch', column * 0.23 + row * 0.37, 6.5);
				}
			}
			return;
		case 'streamers':
			for (let index = 0; index < 9; index++) {
				const x = 77 + index * 34;
				const y = 58 + Math.sin(index * 1.4) * 26;
				const edge = (side: number) => Array.from({ length: 20 }, (_, step): Point => {
					const position = step / 19;
					return [x + 12 * Math.sin(position * Math.PI * 2) + side * 2.5, y + position * 85];
				});
				addShape(svg, 'path', { d: smoothPath([...edge(-1), ...edge(1).reverse()], true) }, 'streamer', index * 0.73, 8)
					.classList.add('image-loading-study-facet');
			}
			return;
		case 'cells':
			for (let row = 0; row < 4; row++) {
				for (let column = 0; column < 7; column++) {
					addMorph(svg, phase => smoothPath(Array.from({ length: 6 }, (_, corner): Point => {
						const angle = Math.PI / 6 + corner * Math.PI / 3;
						const radius = 23 * (1 + 0.13 * Math.sin(phase + column * 0.7 + row * 0.4) + 0.05 * Math.cos(angle * 2 - phase));
						return [64 + column * 44 + row % 2 * 22 + Math.cos(angle) * radius, 61 + row * 38 + Math.sin(angle) * radius];
					}), true), 0, 10).classList.add('image-loading-study-facet');
				}
			}
			return;
		case 'horizon':
			for (let index = 0; index < 12; index++) {
				const y = 92 + index * 7;
				addShape(svg, 'path', { d: `M${125 - index * 7} ${y + 4} Q210 ${y - 15} ${295 + index * 7} ${y + 4}` }, 'horizon', index * 0.65, 8)
					.classList.add('image-loading-study-horizon');
			}
			return;
		case 'sparks':
			for (let index = 0; index < 22; index++) {
				const x = 62 + index * 71 % 304;
				const y = 50 + index * 43 % 150;
				const radius = 3 + index % 4 * 1.4;
				addShape(svg, 'path', {
					d: `M${x} ${y - radius} Q${x + radius * 0.18} ${y - radius * 0.18} ${x + radius} ${y} Q${x + radius * 0.18} ${y + radius * 0.18} ${x} ${y + radius} Q${x - radius * 0.18} ${y + radius * 0.18} ${x - radius} ${y} Q${x - radius * 0.18} ${y - radius * 0.18} ${x} ${y - radius}Z`,
				}, 'spark', index * 0.45, 6 + index % 4).classList.add('image-loading-study-dot');
			}
			return;
		case 'strings':
			for (let index = 0; index < 20; index++) {
				addMorph(svg, phase => smoothPath(Array.from({ length: 33 }, (_, step): Point => {
					const position = step / 32;
					const vibration = 16 * Math.sin(position * Math.PI * 2) * Math.sin(phase + index * 0.32)
						+ 12 * Math.sin(position * Math.PI) * Math.cos(phase);
					return [42 + index * 18 + vibration, 20 + position * 200];
				})), 0, 8);
			}
			return;
		case 'aperture':
			for (let index = 0; index < 8; index++) {
				addMorph(svg, phase => {
					const angle = index * Math.PI / 4;
					const point = (radius: number, offset: number) => `${210 + Math.cos(angle + offset) * radius},${120 + Math.sin(angle + offset) * radius * 0.82}`;
					const opening = 28 + 14 * Math.sin(phase);
					return `M${point(100, 0)} Q${point(108, 0.4)} ${point(100, Math.PI / 4)} L${point(opening, 1.7 + 0.25 * Math.cos(phase))} Q${point(52, 1.15)} ${point(opening, 1)}Z`;
				}, 0, 10).classList.add('image-loading-study-facet');
			}
			return;
		case 'flow':
			for (let row = 0; row < 7; row++) {
				for (let column = 0; column < 12; column++) {
					const x = 67 + column * 26;
					const y = 45 + row * 25;
					addMorph(svg, phase => {
						const angle = Math.atan2(y - 120 - 20 * Math.sin(phase), x - 210 - 30 * Math.cos(phase)) + Math.PI / 2 + 0.25 * Math.sin(phase + column * 0.35);
						const dx = Math.cos(angle) * 6;
						const dy = Math.sin(angle) * 6;
						return `M${x - dx} ${y - dy} L${x + dx} ${y + dy}`;
					}, 0, 12);
				}
			}
			return;
		case 'helix':
			for (let strand = 0; strand < 2; strand++) {
				for (let index = 0; index < 16; index++) {
					addShape(svg, 'circle', {
						cx: `${48 + index * 21.5}`, cy: '120', r: '2.6',
						transform: `translate(0 ${Math.sin(index * 0.35 + strand * Math.PI) * 42})`,
					}, 'helix', index * 0.18 + strand * 3.2, 6.4).classList.add('image-loading-study-dot');
				}
			}
			return;
		case 'exposure': {
			const print = addShape(svg, 'g', {}, 'develop', 0, 8);
			addLandscape(print);
			for (let index = 0; index < 64; index++) {
				const x = 94 + index * 67 % 236;
				const y = 61 + index * 41 % 116;
				const grain = addShape(svg, 'circle', { cx: `${x}`, cy: `${y}`, r: '1' }, 'develop', index % 7 * 0.18, 8);
				grain.classList.add('image-loading-study-dot');
			}
			addShape(svg, 'path', { d: 'M78 68 Q210 56 342 68' }, 'expose', 0, 8);
			return;
		}
		case 'silver-grain':
			for (let row = 0; row < 12; row++) {
				for (let column = 0; column < 25; column++) {
					const sun = Math.hypot(column - 18, row - 2.7) < 2.4;
					const hill = row > 2.4 + Math.abs(column - 9) * 0.61;
					const foreground = row > 8 + Math.sin(column * 0.32) * 1.6;
					if (!sun && !hill && !foreground && (column * 7 + row * 13) % 11 !== 0) {
						continue;
					}
					const dot = tintShape(addShape(svg, 'circle', {
						cx: `${77 + column * 11}`, cy: `${58 + row * 11}`, r: sun || foreground ? '2.5' : hill ? '1.8' : '.7',
					}, 'grain', column * 0.08 + row * 0.06, 8), sun ? 2 : foreground ? 3 : 0);
					dot.classList.add('image-loading-study-dot');
					dot.style.setProperty('--image-study-x', `${Math.sin(column * 7 + row) * 12}px`);
					dot.style.setProperty('--image-study-y', `${Math.cos(column + row * 3) * 9}px`);
				}
			}
			return;
		case 'focus-pull':
		case 'registration':
			for (let plate = 0; plate < 3; plate++) {
				const group = addShape(svg, 'g', {}, study === 'focus-pull' ? 'focus' : 'register', 0, 8);
				group.style.setProperty('--image-study-x', `${Math.cos(plate * Math.PI * 2 / 3) * 18}px`);
				group.style.setProperty('--image-study-y', `${Math.sin(plate * Math.PI * 2 / 3) * 12}px`);
				if (study === 'registration') {
					tintShape(group, plate);
				}
				addLandscape(group);
			}
			svg.appendChild(dom.$.SVG('path', {
				d: study === 'focus-pull' ? 'M68 101 Q55 120 68 139 M352 101 Q365 120 352 139' : 'M82 65 v12 m-6 -6 h12 M336 179 v12 m-6 -6 h12',
				opacity: '.35',
			}));
			return;
		case 'prism': {
			addDrawnPath(svg, 'M47 112 H170', 0, 8);
			svg.appendChild(dom.$.SVG('path', { d: 'M180 62 L236 168 H125 Z', class: 'image-loading-study-paint' }));
			for (let ray = 0; ray < 4; ray++) {
				tintShape(addDrawnPath(svg, `M174 112 L${241 + ray * 6} ${92 + ray * 14} L360 ${55 + ray * 39}`, 0.8 + ray * 0.16, 8), ray);
			}
			const picture = svg.appendChild(dom.$.SVG('g', { transform: 'translate(195 61) scale(.42)' }));
			addLandscape(addShape(picture, 'g', {}, 'develop', 1.8, 8), 1);
			return;
		}
		case 'proofs':
			for (let proof = 0; proof < 3; proof++) {
				const size = proof === 1 ? 0.48 : 0.32;
				const position = svg.appendChild(dom.$.SVG('g', { transform: `translate(${101 + proof * 108 - 210 * size} ${proof === 1 ? 35 : 107}) scale(${size})` }));
				const picture = tintShape(addShape(position, 'g', {}, 'proof', proof * 2.7, 9), proof);
				addLandscape(picture, proof);
			}
			return;
		case 'daydream': {
			const d = 'M69 168 Q101 181 127 151 L169 105 L194 138 L211 123 L250 160 Q290 178 332 151 C363 129 321 118 300 101 C278 84 285 61 305 67 C330 76 307 111 280 100 C252 89 268 57 240 55 Q222 53 218 69 Q201 62 190 78 Q179 87 198 93 Q209 99 224 93';
			addDrawnPath(svg, d, 0, 9).classList.add('image-loading-study-strong-line');
			const pen = addShape(svg, 'circle', { cx: '0', cy: '0', r: '3.1' }, 'pen', 0, 9);
			pen.classList.add('image-loading-study-dot', 'image-loading-study-pen');
			pen.style.setProperty('--image-study-pen-path', `path("${d}")`);
			return;
		}
		case 'wash': {
			const vase = 'M169 139 Q182 151 168 169 Q150 199 210 203 Q269 199 251 169 Q238 151 250 139 Z';
			const fill = tintShape(addShape(svg, 'path', { d: vase }, 'wash', 1.8, 9), 1);
			fill.classList.add('image-loading-study-paint');
			addDrawnPath(svg, vase, 0, 9);
			addDrawnPath(svg, 'M210 151 Q215 101 237 47 M219 111 L180 86 M228 83 L265 66', 0.5, 9);
			for (const [index, d] of [
				'M218 112 Q176 116 163 75 Q200 72 218 112Z',
				'M228 86 Q218 46 254 35 Q263 65 228 86Z',
				'M228 88 Q244 55 283 63 Q271 95 228 88Z',
			].entries()) {
				tintShape(addShape(svg, 'path', { d }, 'wash', 2.2 + index * 0.3, 9), 3).classList.add('image-loading-study-paint');
				addDrawnPath(svg, d, 0.8 + index * 0.3, 9);
			}
			return;
		}
		case 'bristles':
			for (let index = 0; index < 15; index++) {
				const y = 76 + index * 6;
				const d = `M${76 + index * 3} ${y + 57} C${168 + index * 2} ${y - 67} ${245 + index * 3} ${y + 66} ${332 - index * 4} ${y - 9}`;
				const stroke = tintShape(addDrawnPath(svg, d, index * 0.12, 7.5), Math.floor(index / 4));
				stroke.classList.add('image-loading-study-bristle');
				stroke.style.strokeWidth = `${2 + Math.sin(index / 14 * Math.PI) * 3}px`;
			}
			return;
		case 'cyanotype':
			addDrawnPath(svg, 'M185 204 Q209 154 216 49', 0, 9);
			for (let index = 0; index < 6; index++) {
				for (const side of [-1, 1]) {
					const x = 192 + index * 4;
					const y = 177 - index * 22;
					const tipX = x + side * (59 - index * 6);
					const tipY = y - 38;
					const d = `M${x} ${y} Q${tipX - side * 17} ${y + 8} ${tipX} ${tipY} Q${x + side * 3} ${tipY - 6} ${x} ${y}Z`;
					tintShape(addShape(svg, 'path', { d }, 'contact', index * 0.35 + (side + 1) * 0.13, 9), index % 2 ? 0 : 3).classList.add('image-loading-study-paint');
					addDrawnPath(svg, `M${x} ${y} Q${x + side * 21} ${y - 8} ${tipX} ${tipY}`, index * 0.35, 9);
				}
			}
			return;
		case 'engraving':
			for (let row = 0; row < 26; row++) {
				const y = 51 + row * 5.5;
				const width = 132 * Math.sqrt(Math.max(0, 1 - ((y - 124) / 79) ** 2));
				const points = Array.from({ length: 35 }, (_, index): Point => {
					const x = 210 - width + index / 34 * width * 2;
					const ridge = Math.exp(-(((x - 190) / 46) ** 2)) * 30 * Math.sin(row / 26 * Math.PI);
					return [x, y - ridge + Math.sin(x / 27) * 2];
				});
				addDrawnPath(svg, smoothPath(points), row * 0.12, 9);
			}
			tintShape(addShape(svg, 'circle', { cx: '266', cy: '80', r: '19' }, 'develop', 1.5, 9), 2);
			return;
		case 'embroidery':
			for (let petal = 0; petal < 7; petal++) {
				const group = svg.appendChild(dom.$.SVG('g', { transform: `rotate(${petal * 360 / 7} 210 116)` }));
				tintShape(addShape(group, 'path', {
					d: 'M208 116 C160 94 183 38 207 50 C232 40 255 93 212 116',
					pathLength: '100', 'stroke-dasharray': '1.4 3.6',
				}, 'trace', petal * 0.32, 11), petal % 2).classList.add('image-loading-study-strong-line', 'image-loading-study-trace');
			}
			addDrawnPath(svg, 'M210 124 Q240 158 215 185 Q190 211 153 195 Q116 179 93 198', 1.5, 11);
			return;
		case 'paper-scene': {
			tintShape(addShape(svg, 'circle', { cx: '271', cy: '77', r: '21' }, 'paper', 0, 9), 2).classList.add('image-loading-study-paint');
			for (const [layer, d] of [
				'M74 181 L166 79 L250 172 L290 122 L350 183 Q235 204 74 181Z',
				'M76 183 L138 123 L197 167 L256 115 L346 184 Q210 210 76 183Z',
				'M79 185 Q140 147 208 178 T344 187 Q210 213 79 185Z',
			].entries()) {
				const hill = tintShape(addShape(svg, 'path', { d }, 'paper', 0.55 + layer * 0.35, 9), layer === 2 ? 3 : layer);
				hill.classList.add('image-loading-study-paper');
			}
			return;
		}
		case 'stained-glass':
			for (const side of [-1, 1]) {
				const wing = svg.appendChild(dom.$.SVG('g', { transform: `translate(210 122) scale(${side} 1)` }));
				const vertices: readonly Point[] = [[0, 0], [25, -34], [95, -68], [111, -17], [57, 10], [73, 61], [16, 57]];
				for (const [index, triangle] of [[0, 1, 4], [1, 2, 3], [1, 3, 4], [0, 4, 6], [4, 5, 6]].entries()) {
					const facet = tintShape(addShape(wing, 'path', { d: `M${triangle.map(vertex => vertices[vertex].join(',')).join('L')}Z` }, 'assemble', index * 0.14 + (side + 1) * 0.12, 8), index);
					facet.classList.add('image-loading-study-glass');
					facet.style.setProperty('--image-study-x', `${12 + index * 5}px`);
					facet.style.setProperty('--image-study-y', `${(index - 2) * 14}px`);
					facet.style.setProperty('--image-study-angle', `${index % 2 ? -15 : 15}deg`);
				}
			}
			addDrawnPath(svg, 'M210 156 V111 Q193 105 194 92 M210 111 Q227 105 226 92', 0.3, 8);
			return;
		case 'porcelain':
			for (let index = 0; index < 14; index++) {
				const top = index / 14;
				const bottom = (index + 1) / 14;
				const edge = (t: number, inner: boolean): Point => {
					const angle = -Math.PI / 2 - t * Math.PI;
					return [211 + Math.cos(angle) * (inner ? 27 : 75), 120 + Math.sin(angle) * 78];
				};
				const outerTop = edge(top, false);
				const outerBottom = edge(bottom, false);
				const innerTop = edge(top, true);
				const innerBottom = edge(bottom, true);
				const piece = tintShape(addShape(svg, 'path', {
					d: `M${outerTop} Q${edge((top + bottom) / 2, false)} ${outerBottom} L${innerBottom} Q${edge((top + bottom) / 2, true)} ${innerTop}Z`,
				}, 'assemble', index * 0.07, 9), index % 3 === 0 ? 2 : 0);
				piece.classList.add('image-loading-study-glass');
				piece.style.setProperty('--image-study-x', `${-16 - Math.sin(index) * 14}px`);
				piece.style.setProperty('--image-study-y', `${(index - 7) * 5}px`);
				piece.style.setProperty('--image-study-angle', `${(index - 7) * 3}deg`);
			}
			for (const [index, [x, y]] of ([[277, 75], [310, 135], [261, 175]] as const).entries()) {
				tintShape(addShape(svg, 'path', { d: `M${x - 5} ${y} h10 M${x} ${y - 5} v10` }, 'twinkle', index, 6), 2);
			}
			return;
		case 'marbling':
			for (let index = 0; index < 16; index++) {
				tintShape(addMorph(svg, phase => {
					const edge = (side: number) => Array.from({ length: 32 }, (_, step): Point => {
						const t = step / 31;
						const x = 74 + t * 274;
						const taper = Math.sin(t * Math.PI);
						const curl = Math.sin(t * Math.PI * 2 + index * 0.13 + phase) * 34 * taper;
						return [x, 120 + (index - 7.5) * 8 * taper + curl + Math.sin(t * 9 - phase) * 13 * taper + side * 2.2 * taper];
					});
					return smoothPath([...edge(-1), ...edge(1).reverse()], true);
				}, 0, 13), Math.floor(index / 4)).classList.add('image-loading-study-paint');
			}
			return;
		case 'relief':
			for (let layer = 0; layer < 14; layer++) {
				const radius = 110 - layer * 5.8;
				const path = smoothPath(Array.from({ length: 50 }, (_, index): Point => {
					const angle = index / 50 * Math.PI * 2;
					const distance = radius * (1 + Math.sin(angle * 3 + layer * 0.06) * 0.16);
					return [210 + Math.cos(angle) * distance, 167 - layer * 6 + Math.sin(angle) * distance * 0.28];
				}), true);
				tintShape(addShape(svg, 'path', { d: path }, 'relief', layer * 0.14, 10), Math.floor(layer / 5)).style.setProperty('--image-study-y', `${layer * 4 + 4}px`);
			}
			return;
		case 'tessellation':
			for (let petal = 0; petal < 8; petal++) {
				const group = svg.appendChild(dom.$.SVG('g', { transform: `rotate(${petal * 45} 210 120)` }));
				for (const [facet, d] of ['M210 117 L179 62 L211 34 Z', 'M210 117 L211 34 L241 65 Z'].entries()) {
					const shape = tintShape(addShape(group, 'path', { d }, 'fold', petal * 0.17 + facet * 0.08, 8), petal % 4);
					shape.classList.add('image-loading-study-glass');
				}
			}
			return;
		case 'pixel-sort':
			for (let row = 0; row < 12; row++) {
				for (let column = 0; column < 24; column++) {
					const sun = Math.hypot(column - 18, row - 2.7) < 2.2;
					const mountain = row > 2 + Math.abs(column - 8) * 0.7;
					const ground = row > 8 + Math.sin(column * 0.5) * 1.5;
					if (!sun && !mountain && !ground) {
						continue;
					}
					const pixel = tintShape(addShape(svg, 'rect', {
						x: `${79 + column * 11}`, y: `${58 + row * 11}`, width: '8', height: '8', rx: '1',
					}, 'assemble', (column + row) * 0.035, 8), sun ? 2 : ground ? 3 : 0);
					pixel.classList.add('image-loading-study-pixel');
					pixel.style.setProperty('--image-study-x', `${Math.sin(column * 5 + row * 11) * 43}px`);
					pixel.style.setProperty('--image-study-y', `${Math.cos(column * 13 + row * 3) * 37}px`);
					pixel.style.setProperty('--image-study-angle', `${(column % 3 - 1) * 30}deg`);
				}
			}
			return;
		case 'raster':
			for (let line = 0; line < 23; line++) {
				const y = 57 + line * 5.8;
				const segments: string[] = [];
				const sunWidth = Math.sqrt(Math.max(0, 19 ** 2 - (y - 78) ** 2));
				if (sunWidth > 0) {
					segments.push(`M${281 - sunWidth} ${y} h${sunWidth * 2}`);
				}
				if (y > 80) {
					const halfWidth = (y - 80) * 0.8;
					segments.push(`M${177 - halfWidth} ${y} H${177 + halfWidth}`);
				}
				if (y > 116) {
					segments.push(`M${283 - (y - 116)} ${y} H${283 + (y - 116)}`);
				}
				const stroke = tintShape(addShape(svg, 'path', { d: segments.join(' ') }, 'raster', line * 0.13, 8), line < 7 ? 2 : line < 15 ? 0 : 3);
				stroke.classList.add('image-loading-study-scanline');
			}
			return;
		case 'wireframe': {
			const vertex = (column: number, row: number): Point => [
				86 + column * 47 + row * 12,
				111 + row * 26 - Math.sin(column / 5 * Math.PI) * (65 - row * 12),
			];
			for (let row = 0; row < 3; row++) {
				for (let column = 0; column < 5; column++) {
					for (const [index, triangle] of [
						[[column, row], [column + 1, row], [column, row + 1]],
						[[column + 1, row], [column + 1, row + 1], [column, row + 1]],
					].entries()) {
						const d = `M${triangle.map(([x, y]) => vertex(x, y).join(',')).join('L')}Z`;
						svg.appendChild(dom.$.SVG('path', { d, opacity: '.12' }));
						tintShape(addShape(svg, 'path', { d }, 'surface', column * 0.18 + row * 0.25 + index * 0.1, 9), row).classList.add('image-loading-study-glass');
					}
				}
			}
			return;
		}
		case 'dithering':
			for (let row = 0; row < 20; row++) {
				for (let column = 0; column < 31; column++) {
					const x = 67 + column * 9;
					const y = 35 + row * 9;
					const body = ((x - 219) / 41) ** 2 + ((y - 121) / 19) ** 2 < 1;
					const wing = x >= 139 && x <= 226 && y > 48 + (x - 139) * 0.55 && y < 48 + (x - 139) * 1.05;
					const tail = x >= 141 && x < 205 && y > 169 - (x - 141) * 0.78 && y < 169 - (x - 141) * 0.51;
					const beak = x > 247 && x < 327 && Math.abs(y - 116 + (x - 247) * 0.27) < 3;
					if (!body && !wing && !tail && !beak) {
						continue;
					}
					const dot = tintShape(addShape(svg, 'circle', { cx: `${x}`, cy: `${y}`, r: wing || beak ? '1.7' : '2.4' }, 'grain', column * 0.035 + row * 0.025, 9), wing ? 0 : tail ? 1 : 3);
					dot.classList.add('image-loading-study-dot');
					dot.style.setProperty('--image-study-x', `${Math.sin(column * 3 + row) * 22}px`);
					dot.style.setProperty('--image-study-y', `${Math.cos(column + row * 7) * 20}px`);
				}
			}
			return;
		case 'frequencies': {
			for (let signal = 0; signal < 7; signal++) {
				const points = Array.from({ length: 40 }, (_, step): Point => {
					const t = step / 39;
					return [46 + t * 189, 86 + signal * 11 + Math.sin(t * Math.PI * 5 + signal * 0.4) * 17 * (1 - t)];
				});
				tintShape(addDrawnPath(svg, smoothPath(points), signal * 0.14, 7), signal % 2);
			}
			const picture = svg.appendChild(dom.$.SVG('g', { transform: 'translate(218 57) scale(.43)' }));
			addLandscape(tintShape(addShape(picture, 'g', {}, 'develop', 1.2, 7), 3));
			return;
		}
		case 'bezier': {
			const handle = (phase: number): Point => [169 + Math.sin(phase) * 29, 58 + Math.cos(phase) * 16];
			const tip: Point = [319, 75];
			for (const side of [0, 1]) {
				tintShape(addMorph(svg, phase => {
					const [x, y] = handle(phase);
					return side === 0 ? `M107 172 C${x} ${y} 233 51 ${tip}` : `M107 172 C${x + 43} ${y + 122} 322 146 ${tip}`;
				}, 0, 10), side);
			}
			addMorph(svg, phase => `M107 172 L${handle(phase)} M233 51 L${tip} M107 172 L${handle(phase)[0] + 43} ${handle(phase)[1] + 122} M322 146 L${tip}`, 0, 10)
				.classList.add('image-loading-study-handles');
			for (const [x, y] of [[107, 172], tip, [233, 51], [322, 146]]) {
				svg.appendChild(dom.$.SVG('rect', { x: `${x - 2.5}`, y: `${y - 2.5}`, width: '5', height: '5', class: 'image-loading-study-anchor' }));
			}
			addDrawnPath(svg, 'M96 180 Q211 133 309 84', 0, 10);
			return;
		}
		case 'graphite':
			for (let line = 0; line < 3; line++) {
				const d = `M83 ${145 + line * 2} C128 ${177 - line} 145 ${73 + line * 3} 204 ${105 + line} S284 ${170 + line * 2} 337 ${103 + line}`;
				addSketchPath(svg, d, line * 0.45, 13);
			}
			return;
		case 'pencil-sphere':
			for (let row = 0; row < 16; row++) {
				const y = 63 + row * 8;
				const width = Math.sqrt(Math.max(0, 62 ** 2 - (y - 123) ** 2));
				for (let column = 0; column < 8; column++) {
					const x = 210 - width + column / 8 * width * 2;
					const length = 3 + (column + 1) / 8 * 10;
					addSketchPath(svg, `M${x} ${y} q${length / 2} -5 ${length} -8`, row * 0.17 + column * 0.19, 13);
				}
			}
			return;
		case 'leaf-study':
			addSketchPath(svg, 'M112 174 Q172 93 294 66 Q289 154 198 166 Q151 171 112 174', 0, 13);
			addSketchPath(svg, 'M103 180 Q195 143 280 79', 0.8, 13);
			for (let vein = 0; vein < 5; vein++) {
				const x = 157 + vein * 23;
				const y = 157 - vein * 12;
				addSketchPath(svg, `M${x} ${y} q-3 -19 9 -31 M${x} ${y} q19 4 39 -7`, 1.2 + vein * 0.18, 13);
			}
			return;
		case 'dry-brush':
			for (let bristle = 0; bristle < 27; bristle++) {
				const y = 95 + bristle * 2.4;
				const d = `M${95 + bristle * 17 % 28} ${y + 14} Q194 ${y - 15} ${327 - bristle * 13 % 32} ${y - 8}`;
				const stroke = addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': `${11 + bristle % 4} ${1 + bristle % 3} ${8 + bristle % 5} 3` }, 'bristle-pass', bristle * 0.11, 12);
				stroke.style.strokeWidth = `${bristle % 3 === 0 ? 1.3 : 0.7}px`;
			}
			return;
		case 'watercolor-edge':
		case 'wet-on-wet': {
			const pools: readonly Point[] = study === 'watercolor-edge' ? [[210, 123]] : [[164, 126], [220, 111], [258, 136]];
			for (const [pool, center] of pools.entries()) {
				for (let edge = 0; edge < 4; edge++) {
					const radius = (study === 'watercolor-edge' ? 79 : 47) - edge * 2;
					const pigment = tintShape(addMorph(svg, phase => pigmentPath(center, radius, phase + pool * 1.5), edge * 0.14, 18), pool);
					pigment.classList.add('image-loading-study-pigment');
				}
			}
			return;
		}
		case 'capillary':
			for (let branch = 0; branch < 11; branch++) {
				const angle = branch / 11 * Math.PI * 2;
				const point = (distance: number, offset = 0): Point => [210 + Math.cos(angle + offset) * distance, 123 + Math.sin(angle + offset) * distance * 0.6];
				addSketchPath(svg, `M${point(7)} Q${point(45, 0.13)} ${point(86, -0.05)}`, branch * 0.26, 15);
				for (let twig = 0; twig < 3; twig++) {
					addSketchPath(svg, `M${point(34 + twig * 14)} Q${point(50 + twig * 13, 0.09)} ${point(67 + twig * 13, 0.23)}`, 1 + branch * 0.26 + twig * 0.2, 15);
				}
			}
			return;
		case 'charcoal':
			for (let mark = 0; mark < 116; mark++) {
				const t = (mark % 29) / 28;
				const radius = 56 + Math.floor(mark / 29) * 6 + Math.sin(mark * 7) * 2;
				const angle = Math.PI * (0.22 + t * 1.48);
				const x = 216 + Math.cos(angle) * radius * 1.55;
				const y = 122 + Math.sin(angle) * radius * 0.73;
				const stroke = addShape(svg, 'path', { d: `M${x} ${y} l${Math.cos(angle + 0.8) * 5} ${Math.sin(angle + 0.8) * 4}` }, 'pigment-pressure', t * 2.2 + mark % 4 * 0.13, 14);
				stroke.style.strokeWidth = `${1 + mark % 3 * 0.6}px`;
			}
			return;
		case 'pastel':
			for (let mark = 0; mark < 87; mark++) {
				const angle = mark * 2.39996;
				const radius = Math.sqrt(mark / 87);
				const x = 210 + Math.cos(angle) * radius * 113;
				const y = 120 + Math.sin(angle) * radius * 49;
				const stroke = tintShape(addShape(svg, 'path', { d: `M${x} ${y} l${4 + mark % 4} ${-2 - mark % 3}` }, 'pigment-pressure', mark * 0.041, 14), Math.floor(mark / 29));
				stroke.classList.add('image-loading-study-pastel');
			}
			return;
		case 'crosshatch':
		case 'eraser': {
			const patch = study === 'eraser' ? addShape(svg, 'g', {}, 'erase', 0, 14) : svg;
			if (study === 'eraser') {
				patch.classList.add('image-loading-study-erasure');
			}
			for (const direction of [-1, 1]) {
				for (let line = 0; line < 25; line++) {
					const x = 105 + line * 8.4;
					const height = Math.sin(line / 24 * Math.PI) * 42;
					const d = `M${x - direction * 17} ${124 - height} Q${x + direction * 4} 125 ${x + direction * 19} ${124 + height}`;
					if (study === 'eraser') {
						patch.appendChild(dom.$.SVG('path', { d, opacity: '.48' }));
					} else {
						addSketchPath(patch, d, line * 0.12 + (direction + 1) * 1.1, 14);
					}
				}
			}
			return;
		}
		case 'fountain-nib':
		case 'working-brush': {
			const d = study === 'fountain-nib'
				? 'M92 151 C136 173 147 82 197 106 S281 174 326 108'
				: 'M99 153 C153 75 199 157 238 116 S292 103 321 94';
			addSketchPath(svg, d);
			if (study === 'working-brush') {
				for (let bristle = 0; bristle < 7; bristle++) {
					const offset = (bristle - 3) * 1.7;
					const hair = svg.appendChild(dom.$.SVG('g', { transform: `translate(0 ${offset})` }));
					addSketchPath(hair, d, bristle * 0.015).classList.add('image-loading-study-fine-bristle');
				}
			}
			addDrawingTip(svg, d, study === 'fountain-nib' ? 'nib' : 'brush');
			return;
		}
		case 'palette-knife':
			for (let ridge = 0; ridge < 9; ridge++) {
				const y = 102 + ridge * 5;
				const start = 107 + ridge * 3;
				const end = 330 - ridge * 4;
				const d = `M${start} ${y + 6} L${end} ${y - 12} L${end - 11} ${y - 8} L${start + 4} ${y + 8}Z`;
				tintShape(addShape(svg, 'path', { d }, 'paint-laydown', ridge * 0.19, 14), Math.floor(ridge / 3)).classList.add('image-loading-study-knife');
			}
			return;
		case 'gouache':
			for (let layer = 0; layer < 4; layer++) {
				const y = 79 + layer * 22;
				const start = 121 - layer * 8;
				const end = 296 + layer * 4;
				const top = Array.from({ length: 22 }, (_, step): Point => [
					start + step / 21 * (end - start),
					y + Math.sin(step * 1.7 + layer) * 1.7 - step * 0.13,
				]);
				const bottom = top.map(([x, y], step): Point => [x + Math.sin(step) * 2, y + 20 + Math.cos(step * 2.1) * 2]).reverse();
				tintShape(addShape(svg, 'path', { d: smoothPath([...top, ...bottom], true) }, 'paint-laydown', layer * 0.75, 15), layer).classList.add('image-loading-study-gouache');
			}
			return;
		case 'gesture':
			for (let gesture = 0; gesture < 3; gesture++) {
				const points = Array.from({ length: 64 }, (_, index): Point => {
					const t = index / 63 * Math.PI * 2.1;
					return [210 + Math.sin(t * 1.15) * (66 + gesture * 4) + Math.cos(t) * 26, 120 + Math.cos(t * 1.6 + gesture * 0.07) * 58];
				});
				addSketchPath(svg, smoothPath(points), gesture * 0.85, 15);
			}
			return;
		case 'line-wash': {
			const petal = 'M150 165 C110 77 202 60 288 79 C289 154 218 183 150 165Z';
			addSketchPath(svg, petal, 0, 14);
			addSketchPath(svg, 'M126 184 Q194 120 269 91', 0.65, 14);
			const wash = tintShape(addShape(svg, 'path', { d: 'M155 156 Q153 94 222 89 Q258 92 255 113 Q225 159 155 156Z' }, 'pigment-pressure', 2.4, 14), 0);
			wash.classList.add('image-loading-study-gouache');
			return;
		}
		case 'chalk':
			for (let line = 0; line < 5; line++) {
				for (let mark = 0; mark < 34; mark++) {
					const x = 82 + mark * 7.6;
					const y = 108 + line * 8 + Math.sin(mark / 6 + line * 0.16) * 14;
					const stroke = addShape(svg, 'path', { d: `M${x} ${y} l${3 + (mark * 7 + line) % 4} ${Math.cos(mark / 6) * 1.8}` }, 'pigment-pressure', mark * 0.07 + line * 0.32, 15);
					stroke.style.strokeWidth = `${0.65 + (mark + line) % 3 * 0.35}px`;
				}
			}
			return;
		case 'stippling':
			for (let dot = 0; dot < 137; dot++) {
				const angle = dot * 2.39996;
				const radius = Math.sqrt(dot / 137);
				tintShape(addShape(svg, 'circle', {
					cx: `${210 + Math.cos(angle) * radius * 102}`, cy: `${124 + Math.sin(angle) * radius * 52}`,
					r: `${0.5 + (Math.cos(angle) + 1) * 0.45 + dot % 3 * 0.12}`,
				}, 'pigment-pressure', dot * 0.025, 14), 0).classList.add('image-loading-study-dot');
			}
			return;
		case 'calligraphy': {
			const edge = (side: number) => Array.from({ length: 60 }, (_, step): Point => {
				const t = step / 59;
				const width = Math.sin(t * Math.PI) * (2 + 4 * Math.sin(t * Math.PI * 2) ** 2);
				return [
					86 + t * 254 + Math.sin(t * Math.PI * 2) * 12,
					125 + Math.sin(t * Math.PI * 2 + 0.3) * 38 + side * width,
				];
			});
			addShape(svg, 'path', { d: smoothPath([...edge(-1), ...edge(1).reverse()], true) }, 'paint-laydown', 0, 14)
				.classList.add('image-loading-study-calligraphy');
			return;
		}
		case 'pencil-layers':
			for (let layer = 0; layer < 2; layer++) {
				const points: Point[] = [];
				for (let sweep = 0; sweep < 12; sweep++) {
					for (let step = 0; step < 24; step++) {
						const along = step / 23;
						const diagonal = (sweep + along) / 6;
						const startX = Math.max(0, diagonal - 1);
						const endX = Math.min(1, diagonal);
						const across = (1 - Math.cos(along * Math.PI)) / 2;
						const x = startX + (endX - startX) * ((sweep + layer) % 2 ? 1 - across : across);
						const y = diagonal - x;
						const bend = Math.sin(x * Math.PI) * (layer ? -1 : 1);
						points.push([30 + x * 360, 22 + (y + Math.sin(y * Math.PI) * bend * 0.06) * 196]);
					}
				}
				const mark = tintShape(addShape(svg, 'path', {
					d: smoothPath(points), pathLength: '100', 'stroke-dasharray': '100 100',
				}, 'pencil-layer', -layer * 8, 16), layer);
				mark.classList.add('image-loading-study-pencil-mark', 'image-loading-study-pencil-layer');
			}
			return;
		case 'pencil-fill':
		case 'pencil-loops':
		case 'pencil-tooth': {
			const looping = study === 'pencil-loops';
			const grain = study === 'pencil-tooth';
			const passes = looping ? 12 : grain ? 20 : 18;
			const steps = looping ? 28 : 24;
			for (let fiber = 0; fiber < (grain ? 2 : 1); fiber++) {
				const points: Point[] = [];
				for (let pass = 0; pass < passes; pass++) {
					for (let step = 0; step < steps; step++) {
						const along = step / (steps - 1);
						const progress = (pass + along) / passes;
						const diagonal = progress * 2;
						const startX = Math.max(0, diagonal - 1);
						const endX = Math.min(1, diagonal);
						const across = (1 - Math.cos(along * Math.PI)) / 2;
						const x = startX + (endX - startX) * (pass % 2 ? 1 - across : across);
						const y = diagonal - x;
						const bend = Math.sin(x * Math.PI * 2);
						const curvedX = x + Math.sin(x * Math.PI) * bend * 0.045;
						const curvedY = y + Math.sin(y * Math.PI) * bend * 0.18;
						const inset = Math.max(0, Math.min(1, Math.min(x, y, 1 - x, 1 - y) * 12));
						const wobble = Math.sin(pass * 2.71 + step * 0.73 + fiber * 2.1) * (grain ? 0.8 : 0.35);
						const curl = along * Math.PI * 4 + pass * 0.43;
						points.push([
							30 + curvedX * 360 + wobble + fiber * 0.65 + (looping ? Math.sin(curl) * 4.3 * inset : 0),
							22 + curvedY * 196 + Math.cos(pass * 1.83 + step * 0.53 + fiber) * 0.4 + (looping ? Math.cos(curl) * 3.5 * inset : 0),
						]);
					}
				}
				const d = smoothPath(points);
				const mark = tintShape(addShape(svg, 'path', { d, pathLength: '100', 'stroke-dasharray': '100 100' }, 'pencil-color', 0, 13), 0);
				mark.classList.add('image-loading-study-pencil-mark');
				mark.classList.toggle('image-loading-study-pencil-grain', grain);
				mark.style.strokeWidth = `${grain ? 1.1 + fiber * 0.2 : 1.7}px`;
			}
			return;
		}
	}
}

const galleryInput = z.object({
	enableAnimations: z.boolean().default(true),
	reducedMotion: z.boolean().default(false),
	palette: z.enum(['Ink', 'Prism']).default('Prism'),
});
const previewInput = galleryInput.extend({ study: z.enum(studyIds).default('dot-tide') });
const imageMakingPreviewInput = galleryInput.extend({ study: z.enum(imageMakingStudyIds).default('daydream') });
const paintingInput = galleryInput.extend({ palette: z.enum(['Ink', 'Prism']).default('Ink') });
const paintingPreviewInput = paintingInput.extend({ study: z.enum(paintingStudyIds).default('working-brush') });
const pencilPreviewInput = galleryInput.extend({ study: z.enum(pencilStudyIds).default('pencil-layers') });

function renderStudy(context: ComponentFixtureContext, parent: HTMLElement, id: StudyId): void {
	const study = studies[id];
	const card = dom.append(parent, dom.$('section.image-loading-study', { 'data-study': id }));
	dom.append(card, dom.$('h3.image-loading-study-title', undefined, localize('imageStudy.numberedTitle', "{0}. {1}", `${studyIds.indexOf(id) + 1}`.padStart(2, '0'), study.name)));
	const stage = dom.append(card, dom.$('.image-loading-study-stage', { 'aria-hidden': 'true' }));
	if (id === 'binary-tide') {
		stage.classList.add('image-loading-study-chat-stage');
		const instantiationService = createEditorServices(context.disposableStore, {
			colorTheme: context.theme,
			additionalServices: registration => registration.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore, ['image-loading-studies-paused'])),
		});
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Generating image' },
			{ id: 'image_generation', displayName: 'Generate Image', modelDescription: 'Generate Image', source: ToolDataSource.Internal },
			'image-loading-study', undefined, {},
		);
		const placeholder = context.disposableStore.add(instantiationService.createInstance(ChatImageGenerationProgressPart, tool, false));
		stage.appendChild(placeholder.domNode);
	} else if (id === 'waves') {
		renderWaves(stage);
	} else {
		const handmade = paintingStudyIds.some(study => study === id);
		const pencil = pencilStudyIds.some(study => study === id);
		const illustration = pencil || handmade || imageMakingStudyIds.some(study => study === id);
		const svg = dom.append(stage, dom.$.SVG<SVGSVGElement>('svg', {
			class: illustration ? 'image-loading-study-artwork image-loading-study-illustration' : 'image-loading-study-artwork',
			viewBox: '0 0 420 240', preserveAspectRatio: illustration ? 'xMidYMid meet' : 'none', focusable: 'false',
		}));
		svg.classList.toggle('image-loading-study-handmade', handmade);
		svg.classList.toggle('image-loading-study-pencil', pencil);
		renderArtwork(svg, id);
	}
	dom.append(card, dom.$('p.image-loading-study-status', undefined, localize('imageStudy.generating', "Generating image")));
	dom.append(card, dom.$('p.image-loading-study-description', undefined, study.description));
}

function renderGallery(context: ComponentFixtureContext, options: { reducedMotion?: boolean; narrow?: boolean; study?: StudyId; collection?: keyof typeof studyCollections } = {}): void {
	const painting = options.collection === 'painting' || paintingStudyIds.some(study => study === options.study);
	const pencil = options.collection === 'pencil' || pencilStudyIds.some(study => study === options.study);
	const comparison = options.collection === 'comparison';
	const { reducedMotion, palette, enableAnimations } = (painting ? paintingInput : galleryInput).parse(context.input);
	context.container.classList.add('image-loading-studies', 'monaco-enable-motion');
	context.container.classList.toggle('monaco-reduce-motion', reducedMotion || !!options.reducedMotion);
	context.container.classList.toggle('image-loading-studies-narrow', !!options.narrow);
	context.container.classList.toggle('image-loading-studies-single', !!options.study);
	context.container.classList.toggle('image-loading-studies-pencil', pencil);
	context.container.classList.toggle('image-loading-studies-comparison', comparison);
	context.container.classList.toggle('image-loading-studies-prism', palette === 'Prism');
	const selectedStudies = options.study ? [options.study] : studyCollections[options.collection ?? 'original'];
	const showControls = selectedStudies.some(id => imageMakingStudyIds.some(study => study === id) || paintingStudyIds.some(study => study === id) || pencilStudyIds.some(study => study === id));
	const header = dom.append(context.container, dom.$('header.image-loading-studies-header'));
	let title = localize('imageStudy.galleryTitle', "Image generation, taking shape");
	if (pencil) {
		title = localize('imageStudy.pencilTitle', "Like coloring with a pencil");
	} else if (painting) {
		title = localize('imageStudy.paintingTitle', "A quieter kind of making");
	} else if (options.collection === 'image-making') {
		title = localize('imageStudy.imageMakingTitle', "Twenty-four ways to make an image");
	} else if (options.collection === 'more') {
		title = localize('imageStudy.moreTitle', "Twenty more ways to take shape");
	} else if (comparison) {
		title = localize('imageStudy.comparisonTitle', "Flowing waves and binary tide");
	}
	dom.append(header, dom.$('h2', undefined, title));
	let description = localize('imageStudy.collectionDescription', "{0} motion studies. Binary tide is used in chat. These are not progress estimates.", selectedStudies.length);
	if (options.study) {
		description = localize('imageStudy.singleDescription', "A closer look at one motion study. This is a visual experiment, not a progress estimate.");
	} else if (comparison) {
		description = localize('imageStudy.comparisonDescription', "The previous chat loader beside the current one, each at the size chat shows it. These are not progress estimates.");
	}
	dom.append(header, dom.$('p', undefined, description));
	if (showControls) {
		dom.append(header, dom.$('p', undefined, pencil
			? localize('imageStudy.pencilDescription', "Curved pencil sweeps fill a wide rectangle. In the double pass, each completed layer fades as the next one is drawn.")
			: painting
				? localize('imageStudy.paintingDescription', "Pencil, brush, pigment, and paper. Small working gestures, monochrome by default. Symbolic marks, not a preview of the result.")
				: localize('imageStudy.imageMakingDescription', "Photography, drawing, materials, and pixels. The small illustrations are symbolic, not previews of your generated image.")));
		const controls = dom.append(header, dom.$('.image-loading-studies-controls'));
		const pauseButton = context.disposableStore.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		let paused = false;
		pauseButton.label = localize('imageStudy.pause', "Pause Animations");
		pauseButton.enabled = enableAnimations && !reducedMotion && !options.reducedMotion;
		pauseButton.element.setAttribute('aria-pressed', 'false');
		context.disposableStore.add(pauseButton.onDidClick(() => {
			paused = !paused;
			context.container.classList.toggle('image-loading-studies-paused', paused);
			pauseButton.element.setAttribute('aria-pressed', String(paused));
			pauseButton.label = paused ? localize('imageStudy.resume', "Resume Animations") : localize('imageStudy.pause', "Pause Animations");
		}));
		const paletteButton = context.disposableStore.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		const updatePaletteLabel = () => {
			paletteButton.label = context.container.classList.contains('image-loading-studies-prism')
				? localize('imageStudy.monochrome', "Use Monochrome")
				: localize('imageStudy.color', "Use Color");
		};
		updatePaletteLabel();
		context.disposableStore.add(paletteButton.onDidClick(() => {
			context.container.classList.toggle('image-loading-studies-prism');
			updatePaletteLabel();
		}));
	}
	const grid = dom.append(context.container, dom.$('.image-loading-studies-grid'));
	for (const id of selectedStudies) {
		renderStudy(context, grid, id);
	}
	dom.append(context.container, dom.$('p.image-loading-studies-footer', undefined, showControls
		? localize('imageStudy.controlsFooter', "Chat uses the binary tide; the other studies remain experiments. Pause to inspect a mark or switch between color and monochrome. Reduced motion keeps a still composition.")
		: localize('imageStudy.galleryFooter', "Open edges, no background haze, no implied image size. Use Enable Animations in Props to pause; reduced motion shows a still composition.")));
}

export default defineThemedFixtureGroup({ path: 'chat/imageLoadingStudies/' }, {
	Comparison: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Two studies side by side, each at the size chat shows its loader: 01, Flowing waves, the previous loader, where fine open contour lines ripple in staggered phases across a wide area; and 85, Binary tide, the current loader, where swells of denser accent-colored glyphs roll like water through faint binary digits in an area a little wider than tall.',
			'Both have open, softly faded edges without a panel fill, border, or glow, and each has a Generating image label and description below it. Reduced motion and high contrast show both as still compositions.',
		],
		render: context => renderGallery(context, { collection: 'comparison' }),
	}),
	ComparisonReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'comparison', reducedMotion: true }),
	}),
	BinaryTide: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Study 85, Binary tide, fills an area as tall as a generated image and a little wider than tall with small monospace binary digits in the description color. Long swells of denser, accent-colored glyphs roll through the digits like water, bending and crossing, without a panel fill, border, or glow.',
			'The field fills the area almost to its edges, which fade out unevenly with a slight grain rather than along a ruled line or an oval. It shows no letters: read as 8-bit ASCII, each row of digits spells HAPPY_CODING! over and over. Reduced motion and high contrast hold one still composition in solid theme colors.',
		],
		render: context => renderGallery(context, { study: 'binary-tide' }),
	}),
	BinaryTideReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { study: 'binary-tide', reducedMotion: true }),
	}),
	BinaryTideNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { study: 'binary-tide', narrow: true }),
	}),
	Pencil: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Four focused colored-pencil studies numbered 81 through 84. A small number of curved pencil sweeps progressively shade a wide rectangular area, with rounded turns rather than sharp zigzags. The first pass advances from the top-left toward the bottom-right.',
			'In One more pass, both layers advance from top-left to bottom-right. The second uses staggered strokes with a different gentle bend, not the same path or a mirrored sweep. The first layer finishes before the second starts, then gradually fades without moving or being undrawn. The layers continue alternating without a blank reset.',
			'The unframed artwork fills the usual wide image area, with softened rectangular edges and no background haze or claimed completion percentage. Generating image labels and pause/monochrome controls remain readable. Reduced motion shows completed pencil textures.',
		],
		render: context => renderGallery(context, { collection: 'pencil' }),
	}),
	PencilPreview: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: pencilPreviewInput,
		render: context => renderGallery(context, { study: pencilPreviewInput.parse(context.input).study }),
	}),
	PencilReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'pencil', reducedMotion: true }),
	}),
	PencilNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'pencil', narrow: true }),
	}),
	Painting: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: paintingInput,
		expectedVisualDescriptions: [
			'Twenty subtle painting and drawing studies numbered 61 through 80. Fine monochrome marks, generous unframed space, readable Generating image labels, and pause/color controls.',
			'Studies include pencil curves, a hatched sphere, a leaf, dry bristles, localized watercolor edges, overlapping pigment, ink fibers, charcoal marks, pastel texture, crosshatching, a moving nib and brush, scraped paint, gouache, gesture lines, chalk, stippling, an eraser pass, and a calligraphic stroke.',
			'No filled image-sized box, spinning artwork, haze, or percentage claims. Reduced motion and high contrast retain static artwork; decorative SVGs are hidden from assistive technology.',
		],
		render: context => renderGallery(context, { collection: 'painting' }),
	}),
	PaintingPreview: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: paintingPreviewInput,
		render: context => renderGallery(context, { study: paintingPreviewInput.parse(context.input).study }),
	}),
	PaintingReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: paintingInput,
		render: context => renderGallery(context, { collection: 'painting', reducedMotion: true }),
	}),
	PaintingNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: paintingInput,
		render: context => renderGallery(context, { collection: 'painting', narrow: true }),
	}),
	ImageMaking: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Twenty-four image-making motion studies numbered 37 through 60, with readable titles, Generating image labels, and explanatory descriptions. Pause and monochrome controls appear above the responsive grid.',
			'Distinct open illustrations include photographic landscapes, a prism, a continuous drawing, a vase, a botanical print, stitches, cut-paper hills, a butterfly, a crescent, pigment ribbons, folded petals, pixel art, scanlines, a hummingbird, and Bezier handles. There is no output-sized placeholder frame or background haze.',
			'Color accents are theme-aware. High contrast and reduced motion retain visible still illustrations; the artwork is decorative and the text conveys the loading purpose.',
		],
		render: context => renderGallery(context, { collection: 'image-making' }),
	}),
	ImageMakingPreview: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: imageMakingPreviewInput,
		render: context => renderGallery(context, { study: imageMakingPreviewInput.parse(context.input).study }),
	}),
	ImageMakingReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'image-making', reducedMotion: true }),
	}),
	ImageMakingNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'image-making', narrow: true }),
	}),
	More: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Twenty additional, individually labeled image-generation motion studies numbered 17 through 36. Open edges and a consistent quiet theme palette, without framed image placeholders or background glow.',
			'Distinct compositions include grains on dunes, rain and local ripples, highlighted bubbles, a particle vortex, magnetic lines, an aurora curtain, a feather, folded facets, floating seeds, knotted threads, open echo arcs, hatching, curled paper, rounded cells, a receding tide, small sparks, standing waves, an aperture, short vector marks, and beaded strands.',
		],
		render: context => renderGallery(context, { collection: 'more' }),
	}),
	All: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'all' }),
	}),
	MoreReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'more', reducedMotion: true }),
	}),
	MoreNarrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { collection: 'more', narrow: true }),
	}),
	Gallery: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		expectedVisualDescriptions: [
			'Sixteen numbered, labeled image-generation motion studies on the editor background, arranged in a responsive grid. Every artwork has open, softly fading edges without a panel fill or glow.',
			'The first study is the previous flowing-wave placeholder. The alternatives include dots, orbital trails, water rings and droplets, liquid contours, scattered particles, a constellation, ink shapes, petals, silk, tiles, brush strokes, and a refracting mesh.',
		],
		render: context => renderGallery(context),
	}),
	ReducedMotion: defineComponentFixture({
		virtualTime: { enabled: false },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { reducedMotion: true }),
	}),
	Narrow: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: galleryInput,
		render: context => renderGallery(context, { narrow: true }),
	}),
	Preview: defineComponentFixture({
		virtualTime: { enabled: false },
		labels: { kind: 'animated' },
		inputSchema: previewInput,
		render: context => renderGallery(context, { study: previewInput.parse(context.input).study }),
	}),
});
