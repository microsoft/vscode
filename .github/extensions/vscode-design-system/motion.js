/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, card, sourceLink } from './ui.js';
import { motionReferences, motionTopics } from './motion-reference.mjs';
import { createMotionPreviews } from './motion-previews.js';

const matches = (value, query) => JSON.stringify(value).toLowerCase().includes(query.toLowerCase());
let previews;

export function disposeMotion() {
	previews?.dispose();
	previews = undefined;
}

export function renderMotion(content, system) {
	const intro = node('p', 'Try the examples below. Shared motion principles, tokens, and recipes are TBD; today the product implements motion in individual UI code.', 'muted');
	intro.classList.add('motion-intro');
	content.append(intro);

	const references = node('div', undefined, 'tools motion-references');
	for (const reference of motionReferences) {
		const link = node('a', reference.title);
		link.href = reference.url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		references.append(link);
	}
	const topics = motionTopics.filter(topic => matches(topic, system.view.query));
	const grid = node('div', undefined, 'grid motion-outline');
	for (const topic of topics) {
		const item = node('article', undefined, 'card motion-topic');
		item.id = `motion-${topic.id}`;
		item.tabIndex = -1;
		const heading = node('div', undefined, 'motion-topic-heading');
		heading.append(node('h3', topic.title), node('span', 'TBD', 'motion-placeholder'));
		item.append(heading, node('p', topic.description, 'muted'));
		grid.append(item);
	}
	content.append(grid);

	const showPreviews = matches('Visual motion examples: square easing, panel enter exit transitions, fade slide scale, duration comparison, reduced motion', system.view.query);
	if (showPreviews) {
		previews = createMotionPreviews();
		content.append(previews.element);
	}
	content.append(references);

	const samples = system.motion.filter(item => matches(item, system.view.query));
	const evidence = node('details', undefined, 'scope motion-current-code');
	evidence.id = 'motion-code';
	evidence.open = Boolean(system.view.query) && samples.length > 0;
	evidence.append(node('summary', `Current code samples (${samples.length} files): observed implementation, not standards`),
		node('p', 'This is a representative CSS sample, not a complete product audit. Timing literals below are observations, not proposed token values. JavaScript animation, asset playback, and cross-surface behavior still need inventory.', 'muted'));
	const implementations = node('div', undefined, 'grid');
	for (const motion of samples) {
		const item = card(motion.file.split('/').at(-1), `Local reduced-motion evidence: ${motion.reducedMotion}`);
		item.append(sourceLink({ file: motion.file }, 'Inspect implementation'));
		for (const declaration of motion.declarations) {
			const line = node('p');
			line.append(node('code', `${declaration.property}: ${declaration.value}`), node('br'),
				sourceLink(declaration.source, `Line ${declaration.source.line}`));
			item.append(line);
		}
		implementations.append(item);
	}
	evidence.append(implementations);
	content.append(evidence);
	return topics.length + samples.length + (showPreviews ? 1 : 0);
}
