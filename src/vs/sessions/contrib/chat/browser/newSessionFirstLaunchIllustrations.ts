/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { generateUuid } from '../../../../base/common/uuid.js';

/** Renders the supplied artwork inline so workbench theme and motion styles reach the SVG shapes. */
export function createFirstLaunchIllustration(kind: 'workspaces' | 'agents' | 'control'): SVGElement {
	const svg = dom.$.SVG('svg', {
		class: 'new-session-first-launch-illustration',
		viewBox: '0 0 180 112',
		fill: 'none',
		'stroke-width': '1.2',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'aria-hidden': 'true',
		focusable: 'false',
	});
	switch (kind) {
		case 'workspaces':
			renderWorkspaces(svg);
			break;
		case 'agents':
			renderAgents(svg);
			break;
		case 'control':
			renderControl(svg);
			break;
	}
	return svg;
}

function renderWorkspaces(svg: SVGElement): void {
	svg.appendChild(dom.$.SVG('path', { class: 'first-launch-frame', d: 'M150 4H10a6 6 0 0 0-6 6v92a6 6 0 0 0 6 6h140' }));
	const steps = [
		[dom.$.SVG('rect', { x: 16, y: 14, width: 12, height: 10, rx: 2 }), dom.$.SVG('path', { d: 'M36 19h44' })],
		[dom.$.SVG('circle', { class: 'first-launch-accent', cx: 38, cy: 32, r: 2.5 }), dom.$.SVG('path', { d: 'M46 32h63' })],
		[dom.$.SVG('circle', { cx: 38, cy: 44, r: 2.5 }), dom.$.SVG('path', { d: 'M46 44h52' })],
		[dom.$.SVG('rect', { x: 16, y: 56, width: 12, height: 10, rx: 2 }), dom.$.SVG('path', { d: 'M36 61h44' })],
		[dom.$.SVG('circle', { cx: 38, cy: 74, r: 2.5 }), dom.$.SVG('path', { d: 'M46 74h54' })],
		[dom.$.SVG('rect', { x: 16, y: 84, width: 12, height: 10, rx: 2 }), dom.$.SVG('path', { d: 'M36 89h44' })],
		[dom.$.SVG('circle', { cx: 38, cy: 102, r: 2.5 }), dom.$.SVG('path', { d: 'M46 102h56' })],
	];
	for (const [index, shapes] of steps.entries()) {
		const step = dom.$.SVG('g', { class: 'first-launch-step' }, ...shapes);
		step.style.animationDelay = `${index * 0.45}s`;
		svg.appendChild(step);
	}
}

function renderAgents(svg: SVGElement): void {
	const clipId = `first-launch-agents-${generateUuid()}`;
	const definitions = svg.appendChild(dom.$.SVG('defs'));
	svg.appendChild(dom.$.SVG('path', { class: 'first-launch-frame', d: 'M0 4H180M0 108H180' }));
	for (const [index, agent] of [
		{ x: 14, y: 16, duration: 5, delay: 0, user: 'M22 26h30M22 58h48', text: 'M22 34h44M22 42h22M22 50h38M22 66h26M22 74h40M22 82h34' },
		{ x: 98, y: 16, duration: 6.5, delay: -2.1, user: 'M106 26h38M106 58h34', text: 'M106 34h48M106 42h26M106 50h40M106 66h30M106 74h44M106 82h22' },
		{ x: 14, y: 62, duration: 4.5, delay: -3.4, user: 'M22 72h40M22 104h22', text: 'M22 80h34M22 88h30M22 96h44M22 112h38M22 120h48M22 128h26' },
		{ x: 98, y: 62, duration: 5.8, delay: -1, user: 'M106 72h44M106 104h26', text: 'M106 80h22M106 88h38M106 96h48M106 112h40M106 120h34M106 128h30' },
	].entries()) {
		const id = `${clipId}-${index}`;
		definitions.appendChild(dom.$.SVG('clipPath', { id }, dom.$.SVG('rect', { x: agent.x + 2, y: agent.y + 4, width: 72, height: 30 })));
		svg.appendChild(dom.$.SVG('rect', { x: agent.x, y: agent.y, width: 76, height: 38, rx: 5 }));
		const stream = dom.$.SVG('g', { class: 'first-launch-stream' },
			dom.$.SVG('path', { class: 'first-launch-user', d: agent.user }),
			dom.$.SVG('path', { d: agent.text }),
		);
		stream.style.animationDuration = `${agent.duration}s`;
		stream.style.animationDelay = `${agent.delay}s`;
		svg.appendChild(dom.$.SVG('g', { 'clip-path': `url(#${id})` }, stream));
	}
}

function renderControl(svg: SVGElement): void {
	svg.append(
		dom.$.SVG('path', { class: 'first-launch-frame', d: 'M30 4h140a6 6 0 0 1 6 6v92a6 6 0 0 1-6 6H30' }),
		dom.$.SVG('path', { d: 'M44 18h30M46 32h24' }),
		dom.$.SVG('rect', { class: 'first-launch-diff-add', x: 38, y: 39, width: 128, height: 9, rx: 2 }),
		dom.$.SVG('path', { class: 'first-launch-diff-line-add', d: 'M46 43h53' }),
		dom.$.SVG('path', { d: 'M46 54h42M46 65h31' }),
		dom.$.SVG('rect', { class: 'first-launch-diff-remove', x: 38, y: 72, width: 128, height: 9, rx: 2 }),
		dom.$.SVG('path', { class: 'first-launch-diff-line-remove', d: 'M46 76h60' }),
		dom.$.SVG('path', { d: 'M46 87h49' }),
		dom.$.SVG('rect', { class: 'first-launch-focus', x: 38, y: 28, width: 128, height: 9, rx: 2 }),
		dom.$.SVG('g', { class: 'first-launch-peek' },
			dom.$.SVG('rect', { x: 96, y: 58, width: 64, height: 34, rx: 5 }),
			dom.$.SVG('path', { d: 'M104 68h30M104 77h44M104 85h22' }),
		),
	);
}
