/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ChatWorkingLogo } from '../../../../contrib/chat/browser/widget/chatWorkingLogo.js';
import { ChatProgressAnimation } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import './chatWorkingLogo.fixture.css';

interface IProgressStyle {
	readonly animation: ChatProgressAnimation;
	readonly name: string;
	readonly description: string;
}

const styles: readonly IProgressStyle[] = [
	{
		animation: ChatProgressAnimation.Draw,
		name: 'Draw',
		description: 'Tie the exact VS Code mark with fast parabolic ribbon motion, hold it, then unravel it before a brief rest.',
	},
	{
		animation: ChatProgressAnimation.DrawMonochrome,
		name: 'Draw (Monochrome)',
		description: 'The same Draw animation, with the grayscale treatment of the VS Code icon in the Agents window.',
	},
	{
		animation: ChatProgressAnimation.DrawMonochromeNoIcon,
		name: 'Draw (Monochrome, No Icon)',
		description: 'Keep the working text and its alignment, without a visible or animated icon.',
	},
];

class FixtureChatWorkingLogo extends ChatWorkingLogo {
	refreshFixtureMotion(): void {
		this.refreshMotion();
	}
}

function createLogo(context: ComponentFixtureContext, animation: ChatProgressAnimation, quality: 'stable' | 'insider', size: number): FixtureChatWorkingLogo {
	const logo = context.disposableStore.add(new FixtureChatWorkingLogo(animation, quality, {
		isMotionReduced: () => context.container.classList.contains('disable-animations') || context.container.classList.contains('monaco-reduce-motion'),
	}));
	context.disposableStore.add(context.onDidChangeEnableAnimations(() => logo.refreshFixtureMotion()));
	if (size === 12) {
		logo.domNode.classList.add('chat-working-logo-compact');
	} else if (size !== 16) {
		logo.domNode.style.width = `${size}px`;
		logo.domNode.style.height = `${size}px`;
	}
	return logo;
}

function renderStyle(context: ComponentFixtureContext, style: IProgressStyle, parent: HTMLElement): void {
	const card = dom.append(parent, dom.$('article.chat-logo-motion-card', { 'data-animation': style.animation }));
	const header = dom.append(card, dom.$('.chat-logo-motion-card-header'));
	dom.append(header, dom.$('h3', undefined, style.name));

	const stage = dom.append(card, dom.$('.chat-logo-motion-stage'));
	const construction = dom.append(stage, dom.$('.chat-logo-motion-construction'));
	const hero = createLogo(context, style.animation, 'stable', 64);
	construction.appendChild(hero.domNode);

	dom.append(card, dom.$('p.chat-logo-motion-description', undefined, style.description));
	const samples = dom.append(card, dom.$('.chat-logo-motion-samples'));
	for (const sample of [
		{ size: 12, quality: 'stable' as const, text: 'Working', label: '12px / Stable' },
		{ size: 16, quality: 'insider' as const, text: 'Thinking', label: '16px / Insiders' },
	]) {
		const row = dom.append(samples, dom.$('.chat-logo-motion-sample'));
		const logo = createLogo(context, style.animation, sample.quality, sample.size);
		row.appendChild(logo.domNode);
		dom.append(row, dom.$('span.chat-logo-motion-label', undefined, sample.text));
		dom.append(row, dom.$('span.chat-logo-motion-size', undefined, sample.label));
	}
	dom.append(card, dom.$('p.chat-logo-motion-note', undefined, style.animation === ChatProgressAnimation.DrawMonochromeNoIcon
		? 'The hidden icon has no running animation. The text gutter stays aligned with thinking and tool rows.'
		: 'Mirrored cubic positions produce parabolic velocity while fixed product paths preserve crisp edges at every size.'));
}

function renderGallery(context: ComponentFixtureContext, reducedMotion = false): void {
	context.container.classList.add('chat-logo-motion-gallery');
	context.container.classList.toggle('monaco-reduce-motion', reducedMotion);
	const header = dom.append(context.container, dom.$('header.chat-logo-motion-gallery-header'));
	dom.append(header, dom.$('h2', undefined, 'Persistent progress logo styles'));
	dom.append(header, dom.$('p', undefined, reducedMotion
		? 'Reduced motion keeps visible logos assembled and the no-icon variant hidden.'
		: 'Compare colored, monochrome, and no-icon Draw variants.'));
	const grid = dom.append(context.container, dom.$('.chat-logo-motion-grid'));
	for (const style of styles) {
		renderStyle(context, style, grid);
	}
	dom.append(context.container, dom.$('p.chat-logo-motion-footer', undefined, 'All variants use fixed production SVG geometry. Use Enable Animations in Props to play or pause.'));
}

function renderSingleStyle(context: ComponentFixtureContext, animation: ChatProgressAnimation): void {
	const style = styles.find(style => style.animation === animation);
	if (!style) {
		throw new Error(`Unknown progress style: ${animation}`);
	}
	context.container.classList.add('chat-logo-motion-single');
	renderStyle(context, style, context.container);
}

function renderPerformanceProbe(context: ComponentFixtureContext, animation: ChatProgressAnimation, active = true): void {
	context.container.classList.add('chat-logo-motion-probe');
	const logo = createLogo(context, animation, 'stable', 16);
	logo.setActive(active);
	context.container.appendChild(logo.domNode);
}

export default defineThemedFixtureGroup({ path: 'chat/logoMotion/' }, {
	DrawComparison: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderGallery(context) }),
	DrawComparisonReducedMotion: defineComponentFixture({ render: context => renderGallery(context, true) }),
	Draw: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStyle(context, ChatProgressAnimation.Draw) }),
	DrawMonochrome: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderSingleStyle(context, ChatProgressAnimation.DrawMonochrome) }),
	DrawMonochromeNoIcon: defineComponentFixture({ render: context => renderSingleStyle(context, ChatProgressAnimation.DrawMonochromeNoIcon) }),
	Performance: defineThemedFixtureGroup({
		Idle: defineComponentFixture({ render: context => renderPerformanceProbe(context, ChatProgressAnimation.Draw, false) }),
		Draw: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, ChatProgressAnimation.Draw) }),
		DrawMonochrome: defineComponentFixture({ labels: { kind: 'animated' }, render: context => renderPerformanceProbe(context, ChatProgressAnimation.DrawMonochrome) }),
		DrawMonochromeNoIcon: defineComponentFixture({ render: context => renderPerformanceProbe(context, ChatProgressAnimation.DrawMonochromeNoIcon) }),
	}),
});
