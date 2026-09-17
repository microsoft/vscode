/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ChatWorkingLogo, ChatWorkingLogoMotion } from '../../../../contrib/chat/browser/widget/chatWorkingLogo.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import './chatWorkingLogo.fixture.css';

interface IMotionStudy {
	readonly motion: ChatWorkingLogoMotion;
	readonly name: string;
	readonly character: string;
	readonly description: string;
	readonly note: string;
}

const studies: readonly IMotionStudy[] = [
	{
		motion: 'fold',
		name: 'Ribbon fold',
		character: 'Calm',
		description: 'The two ribbons hinge around the spine and settle back into the mark.',
		note: 'A small, tactile movement with a long quiet hold.',
	},
	{
		motion: 'weave',
		name: 'Weave',
		character: 'Balanced',
		description: 'The first ribbon, second ribbon, and spine move in three quick beats.',
		note: 'Each piece holds until all three finish, then they reset together. A brief pause, then 1-2-3 again.',
	},
	{
		motion: 'weave-v',
		name: 'Weave V',
		character: 'Joined',
		description: 'The diagonals narrow and slide into a downward-pointing V while the spine keeps its third beat.',
		note: 'The same 1-2-3, hold, and shared reset as Weave. Only the diagonal poses change.',
	},
	{
		motion: 'draw',
		name: 'Draw',
		character: 'Constructive',
		description: 'Draw the right-slanting ribbon, climb the right edge, then draw the left-slanting ribbon.',
		note: 'Three 320ms beats build the mark. Hold for 480ms, then erase 1-2-3 in the same counterclockwise direction. No fade or backward retraction.',
	},
	{
		motion: 'relay',
		name: 'Relay',
		character: 'Subtle',
		description: 'One stroke moves at a time while the other two hold the identity.',
		note: 'The most restrained candidate for long-running work.',
	},
	{
		motion: 'stack',
		name: 'Stack and unfold',
		character: 'Expressive',
		description: 'The logo becomes three stacked lines, then unfolds into its familiar shape.',
		note: 'The biggest transformation. Judge the small version, too.',
	},
	{
		motion: 'orbit',
		name: 'Orbit and lock',
		character: 'Playful',
		description: 'The ribbons loop and the spine sways before the mark locks back together.',
		note: 'The diagonals stay inside the moving, rotating right edge.',
	},
	{
		motion: 'shutter',
		name: 'Paper wave',
		character: 'Tactile',
		description: 'The diagonals tuck in as a rolling fold passes through the moving spine.',
		note: 'The spine is free to fold; no diagonal tips emerge past it.',
	},
	{
		motion: 'aperture',
		name: 'Aperture',
		character: 'Tactile',
		description: 'The ribbons turn edge-on toward the spine, then peel open in sequence.',
		note: 'A dimensional fold rather than a spin. The right edge stays clean.',
	},
	{
		motion: 'accordion',
		name: 'Accordion',
		character: 'Playful',
		description: 'The diagonals concertina toward the center as the spine compresses, then the mark opens back up.',
		note: 'A compact close-and-open gesture. No bounce or elastic overshoot.',
	},
	{
		motion: 'dial',
		name: 'Dial',
		character: 'Energetic',
		description: 'The assembled mark makes three quick forward turns, then rests upright.',
		note: 'The most noticeable option. Short detents replace a continuous spinner; no reverse rewind.',
	},
	{
		motion: 'magnet',
		name: 'Magnet',
		character: 'Snappy',
		description: 'The three pieces pull apart, hover, then click back together.',
		note: 'A bigger assembly gesture, with a fast shared return and no overshoot.',
	},
	{
		motion: 'trace',
		name: 'Trace',
		character: 'Precise',
		description: 'The spine stays visible while the diagonals retract and draw themselves back out, one at a time.',
		note: 'A stroke-by-stroke rebuild using scale and opacity, not animated SVG paths.',
	},
	{
		motion: 'pendulum',
		name: 'Pendulum',
		character: 'Gentle',
		description: 'The assembled mark rocks left, then right, and comes to rest.',
		note: 'A quieter alternative to a full spin. The three pieces stay joined.',
	},
	{
		motion: 'prism',
		name: 'Prism',
		character: 'Dimensional',
		description: 'The mark tilts away and toward you, like a small solid object catching the light.',
		note: 'A shallow 3D turn with no gradients, lighting effects, or painted filters.',
	},
	{
		motion: 'ladder',
		name: 'Ladder',
		character: 'Architectural',
		description: 'The diagonals become two horizontal rails while the spine swings underneath as a third.',
		note: 'A three-bar stack, then a staged unfold back into the mark.',
	},
	{
		motion: 'carousel',
		name: 'Carousel',
		character: 'Lively',
		description: 'The diagonals trade upper and lower lanes, turning in opposite directions as the spine tracks beside them.',
		note: 'Each ribbon completes its own orbit. Nothing rewinds at the loop seam.',
	},
	{
		motion: 'piston',
		name: 'Piston',
		character: 'Mechanical',
		description: 'The ribbons retract and counter-slide while the spine drives inward, then pushes back out.',
		note: 'Compression and release, with three separate moving parts.',
	},
	{
		motion: 'bridge',
		name: 'Bridge',
		character: 'Constructive',
		description: 'The diagonals form a small roof while the spine rotates into a supporting base.',
		note: 'A different structure made from the same three ribbons, not a replacement glyph.',
	},
	{
		motion: 'fan',
		name: 'Fan',
		character: 'Airy',
		description: 'The diagonal tips fan apart around their right-hand joins as the spine steps outward.',
		note: 'Open, hold, close. The pieces keep their own pivots.',
	},
	{
		motion: 'comb',
		name: 'Comb',
		character: 'Ordered',
		description: 'The two diagonals turn upright beside the shortened spine, forming three vertical teeth.',
		note: 'A vertical counterpart to Stack, with an inset pose before unfolding.',
	},
	{
		motion: 'braid',
		name: 'Braid',
		character: 'Interwoven',
		description: 'The diagonals cross high and low lanes at different depths while the spine counter-steers.',
		note: 'A small depth change makes the two ribbon paths feel interleaved.',
	},
	{
		motion: 'sling',
		name: 'Sling',
		character: 'Buoyant',
		description: 'The diagonals follow different looping throws, then dock beside the wandering spine.',
		note: 'The most asymmetrical orbit study. Watch it at 12px as well as enlarged.',
	},
	{
		motion: 'folio',
		name: 'Folio',
		character: 'Papery',
		description: 'One ribbon folds, then the other, then the spine; all three open back up together.',
		note: 'A page-fold sequence, with each piece held until the last fold finishes.',
	},
	{
		motion: 'helix',
		name: 'Double helix',
		character: 'Fluid',
		description: 'The diagonals twist in opposite directions and exchange height while the spine changes its reach.',
		note: 'Three-dimensional ribbon movement rather than a whole-logo turn.',
	},
];

type MotionCollection = 'all' | 'favorites' | 'explorations' | 'ribbons' | 'assembly' | 'orbital' | 'folding' | 'weave' | 'draw';

const collections: Record<MotionCollection, { title: string; description: string; motions?: readonly ChatWorkingLogoMotion[] }> = {
	all: {
		title: 'Three pieces. One familiar mark.',
		description: 'The Stable silhouette throughout. Compare the construction view with the real-size chat samples.',
	},
	weave: {
		title: 'Weave, with a V.',
		description: 'Original Weave on the left, V variant on the right. The timing and spine movement are identical; the two diagonals meet below instead of crossing.',
		motions: ['weave', 'weave-v'],
	},
	draw: {
		title: 'Move the mark, or build it.',
		description: 'Weave stays unchanged on the left. Draw and erase both travel counterclockwise: right slant, right edge, left slant. Compare the 12px working row as well as the enlarged mark.',
		motions: ['weave', 'draw'],
	},
	favorites: {
		title: 'Moving spine. Clean joins.',
		description: 'The right-hand stroke keeps its own movement. Both diagonals stay behind its current right edge throughout the cycle.',
		motions: ['weave', 'orbit', 'shutter'],
	},
	explorations: {
		title: 'Same mark. Different rhythms.',
		description: 'Weave remains unchanged. Stack and Orbit are back here as references; the ThreePieceStudies group contains ten more independent-ribbon designs.',
		motions: ['weave', 'stack', 'orbit', 'aperture', 'accordion', 'dial', 'magnet', 'trace', 'pendulum', 'prism'],
	},
	ribbons: {
		title: 'Ten ways to move three ribbons.',
		description: 'Ten new designs, with Weave, Stack and Orbit for comparison. Each new study gives all three pieces its own movement.',
		motions: ['weave', 'stack', 'orbit', 'ladder', 'carousel', 'piston', 'bridge', 'fan', 'comb', 'braid', 'sling', 'folio', 'helix'],
	},
	assembly: {
		title: 'Stack, dock, reassemble.',
		description: 'Stack is the reference. Four new studies turn the separate ribbons into rails, a roof, a comb, and a small mechanism.',
		motions: ['stack', 'ladder', 'piston', 'bridge', 'comb'],
	},
	orbital: {
		title: 'Independent paths. One mark.',
		description: 'Orbit and lock is the reference. Three new studies exchange lanes, interleave depth, and throw each ribbon along its own path.',
		motions: ['orbit', 'carousel', 'braid', 'sling'],
	},
	folding: {
		title: 'Hinge, fan, twist.',
		description: 'Paper wave is the reference. Three new studies explore separate pivots, sequential page folds, and opposing twists.',
		motions: ['shutter', 'fan', 'folio', 'helix'],
	},
};

function createLogo(context: ComponentFixtureContext, motion: ChatWorkingLogoMotion, quality: 'stable' | 'insider', size: number): ChatWorkingLogo {
	const logo = context.disposableStore.add(new ChatWorkingLogo(motion, quality));
	if (size === 12) {
		logo.domNode.classList.add('chat-working-logo-compact');
	} else if (size !== 16) {
		logo.domNode.style.width = `${size}px`;
		logo.domNode.style.height = `${size}px`;
	}
	return logo;
}

function renderStudy(context: ComponentFixtureContext, study: IMotionStudy, parent: HTMLElement): void {
	const card = dom.append(parent, dom.$('article.chat-logo-motion-card', { 'data-motion': study.motion }));
	const header = dom.append(card, dom.$('.chat-logo-motion-card-header'));
	dom.append(header, dom.$('h3', undefined, study.name));
	dom.append(header, dom.$('span.chat-logo-motion-character', undefined, study.character));

	const stage = dom.append(card, dom.$('.chat-logo-motion-stage'));
	const construction = dom.append(stage, dom.$('.chat-logo-motion-construction'));
	const hero = createLogo(context, study.motion, 'stable', 64);
	construction.appendChild(hero.domNode);

	dom.append(card, dom.$('p.chat-logo-motion-description', undefined, study.description));
	const samples = dom.append(card, dom.$('.chat-logo-motion-samples'));
	for (const sample of [
		{ size: 12, quality: 'stable' as const, text: 'Working', label: '12px / chat' },
		{ size: 16, quality: 'insider' as const, text: 'Thinking', label: '16px / green tint' },
	]) {
		const row = dom.append(samples, dom.$('.chat-logo-motion-sample'));
		const logo = createLogo(context, study.motion, sample.quality, sample.size);
		row.appendChild(logo.domNode);
		dom.append(row, dom.$('span.chat-logo-motion-label', undefined, sample.text));
		dom.append(row, dom.$('span.chat-logo-motion-size', undefined, sample.label));
	}
	dom.append(card, dom.$('p.chat-logo-motion-note', undefined, study.note));
	dom.append(card, dom.$('span.chat-logo-motion-cycle', undefined, `${hero.durationMs / 1000}s loop / ${study.motion === 'draw' ? '1-2-3 draw and undraw' : 'transform + opacity'}`));
}

function renderGallery(context: ComponentFixtureContext, options: { reducedMotion?: boolean; collection?: MotionCollection } = {}): void {
	const collectionName = options.collection ?? 'all';
	const collection = collections[collectionName];
	context.container.classList.add('chat-logo-motion-gallery');
	context.container.dataset.collection = collectionName;
	context.container.classList.toggle('monaco-reduce-motion', !!options.reducedMotion);
	context.container.classList.toggle('chat-logo-motion-favorites', options.collection === 'favorites');
	context.container.classList.toggle('chat-logo-motion-explorations', options.collection === 'explorations');
	const header = dom.append(context.container, dom.$('header.chat-logo-motion-gallery-header'));
	dom.append(header, dom.$('span.chat-logo-motion-eyebrow', undefined, 'VS CODE / MOTION STUDIES'));
	dom.append(header, dom.$('h2', undefined, collection.title));
	dom.append(header, dom.$('p', undefined, options.reducedMotion
		? 'Reduced motion: every study resolves to the same solid Stable logo.'
		: collection.description));
	const grid = dom.append(context.container, dom.$('.chat-logo-motion-grid'));
	const selectedStudies = studies.filter(study => !collection.motions || collection.motions.includes(study.motion));
	for (const study of selectedStudies) {
		renderStudy(context, study, grid);
	}
	dom.append(context.container, dom.$('p.chat-logo-motion-footer', undefined, 'Fixed SVG geometry inside three HTML wrappers. No frame loop, animated layout, blur, or path morphing. Use Enable Animations in Props to play or pause.'));
}

function renderSingleStudy(context: ComponentFixtureContext, motion: ChatWorkingLogoMotion): void {
	const study = studies.find(study => study.motion === motion);
	if (!study) {
		throw new Error(`Unknown logo motion: ${motion}`);
	}
	context.container.classList.add('chat-logo-motion-single');
	renderStudy(context, study, context.container);
}

function renderPerformanceProbe(context: ComponentFixtureContext, motion: ChatWorkingLogoMotion, active = true): void {
	context.container.classList.add('chat-logo-motion-probe');
	const logo = createLogo(context, motion, 'stable', 16);
	logo.setActive(active);
	context.container.appendChild(logo.domNode);
}

export default defineThemedFixtureGroup({ path: 'chat/logoMotion/' }, {
	DrawComparison: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'draw' }) }),
	DrawComparisonReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { collection: 'draw', reducedMotion: true }) }),
	Draw: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'draw') }),
	WeaveComparison: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'weave' }) }),
	WeaveComparisonReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { collection: 'weave', reducedMotion: true }) }),
	ThreePieceStudies: defineThemedFixtureGroup({
		Assembly: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'assembly' }) }),
		Orbital: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'orbital' }) }),
		Folding: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'folding' }) }),
		All: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'ribbons' }) }),
		ReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { collection: 'ribbons', reducedMotion: true }) }),
	}),
	Explorations: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'explorations' }) }),
	Favorites: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context, { collection: 'favorites' }) }),
	Gallery: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context) }),
	RibbonFold: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'fold') }),
	Weave: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'weave') }),
	WeaveV: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'weave-v') }),
	Relay: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'relay') }),
	StackAndUnfold: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'stack') }),
	OrbitAndLock: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'orbit') }),
	PaperWave: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'shutter') }),
	Aperture: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'aperture') }),
	Accordion: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'accordion') }),
	Dial: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'dial') }),
	Magnet: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'magnet') }),
	Trace: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'trace') }),
	Pendulum: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'pendulum') }),
	Prism: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'prism') }),
	Ladder: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'ladder') }),
	Carousel: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'carousel') }),
	Piston: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'piston') }),
	Bridge: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'bridge') }),
	Fan: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'fan') }),
	Comb: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'comb') }),
	Braid: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'braid') }),
	Sling: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'sling') }),
	Folio: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'folio') }),
	Helix: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStudy(context, 'helix') }),
	ReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { reducedMotion: true }) }),
	FavoritesReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { collection: 'favorites', reducedMotion: true }) }),
	ExplorationsReducedMotion: defineComponentFixture({ render: context => renderGallery(context, { collection: 'explorations', reducedMotion: true }) }),
	Performance: defineThemedFixtureGroup({
		Idle: defineComponentFixture({ render: context => renderPerformanceProbe(context, 'relay', false) }),
		Fold: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'fold') }),
		Weave: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'weave') }),
		Draw: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'draw') }),
		WeaveV: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'weave-v') }),
		Relay: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'relay') }),
		Stack: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'stack') }),
		Orbit: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'orbit') }),
		Shutter: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'shutter') }),
		Aperture: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'aperture') }),
		Accordion: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'accordion') }),
		Dial: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'dial') }),
		Magnet: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'magnet') }),
		Trace: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'trace') }),
		Pendulum: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'pendulum') }),
		Prism: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'prism') }),
		Ladder: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'ladder') }),
		Carousel: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'carousel') }),
		Piston: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'piston') }),
		Bridge: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'bridge') }),
		Fan: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'fan') }),
		Comb: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'comb') }),
		Braid: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'braid') }),
		Sling: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'sling') }),
		Folio: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'folio') }),
		Helix: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, 'helix') }),
	}),
});
