/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { motionTopics } from './motion-reference.mjs';

export function pageJumps(view) {
	const pairs = view.section === 'components'
		? [['component-example', 'Interactive example'], ['component-usage', 'Usage'], ['component-accessibility', 'Accessibility'], ['component-api', 'API and props']]
		: view.section === 'motion'
			? [...motionTopics.map(topic => [`motion-${topic.id}`, topic.title]), ['motion-previews', 'Visual examples'], ['motion-code', 'Current code samples']]
			: view.section === 'typography'
				? [['typography-families', 'Font families'], ['typography-styles', 'Type styles'], ['typography-emphasis', 'Weight and emphasis'],
					['typography-composition', 'Hierarchy and reading rhythm'], ['typography-colors', 'Text color and hierarchy'], ['typography-symbols', 'Icon font sizes'], ['typography-reference', 'Token reference']]
			: [];
	return pairs.map(([anchor, label]) => ({ anchor, label }));
}

export function buildNavigation(system) {
	return system.sections.map(section => {
		const children = section.id === 'components'
			? system.controls.map(control => ({ id: `component-${control.id}`, label: control.name, section: section.id, controlId: control.id }))
			: section.id === 'motion'
				? pageJumps({ section: 'motion' }).filter(item => item.anchor !== 'motion-code')
					.map(item => ({ id: `motion-section-${item.anchor}`, section: section.id, ...item }))
				: [];
		return { id: section.id, label: section.title, section: section.id, ...(children.length ? { children } : {}) };
	});
}

export function flattenNavigation(nodes) {
	return nodes.flatMap(node => [node, ...flattenNavigation(node.children ?? [])]);
}
