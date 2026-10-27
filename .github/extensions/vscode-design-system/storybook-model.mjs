/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared by the Node story generator and the browser navigation bridge.
export const pages = [
	{ section: 'principles', title: 'Design Philosophy' },
	{ section: 'typography', title: 'Foundations/Typography' },
	{ section: 'spacing', title: 'Foundations/Spacing' },
	{ section: 'shape', title: 'Foundations/Shape' },
	{ section: 'size', title: 'Foundations/Size' },
	{ section: 'colors', title: 'Foundations/Colors' },
	{ section: 'theming', title: 'Foundations/Theming' },
	{ section: 'patterns', title: 'Guidance/Interaction patterns' },
	{ section: 'motion', title: 'Guidance/Motion' },
	{ section: 'iconography', title: 'Foundations/Iconography' },
	{ section: 'layout', title: 'Guidance/Layout' },
	{ section: 'accessibility', title: 'Guidance/Accessibility' },
	{ section: 'content', title: 'Guidance/Content' },
	{ section: 'tokens', title: 'Token lookup' },
];

export function titleId(title) {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function viewPath(view) {
	if (view.section === 'components') {
		return `/docs/components-${view.controlId}--docs`;
	}
	const page = pages.find(page => page.section === view.section);
	return `/docs/${titleId(page.title)}--docs`;
}
