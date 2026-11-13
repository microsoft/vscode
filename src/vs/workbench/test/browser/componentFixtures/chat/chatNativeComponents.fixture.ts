/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderNativeComponents } from '../../../../contrib/chat/browser/widget/chatContentParts/chatNativeComponentsRenderer.js';
import { parseNativeComponents } from '../../../../contrib/chat/common/nativeComponents/nativeComponentsParser.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

const catalogue = [
	'<Columns>',
	'  <Metric label="Full build" value="12.4 s" />',
	'  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />',
	'  <Metric label="Failing tests" value="3" delta="+2 since Monday" tone="negative" />',
	'  <Metric label="Flaky tests" value="7" tone="warning" />',
	'</Columns>',
	'<Badge>Draft</Badge>',
	'<Badge tone="positive">Passing</Badge>',
	'<Badge tone="negative">Blocked</Badge>',
	'<Badge tone="warning">Needs review</Badge>',
	'<BarChart title="Build duration by target" unit="s">',
	'  <Bar label="Full build" value="12.4" />',
	'  <Bar label="Incremental build after a one-line change" value="1.8" />',
	'  <Bar label="Cached" value="0" />',
	'</BarChart>',
	'<Table caption="Duration by target">',
	'  <Column>Target</Column>',
	'  <Column align="end">Before</Column>',
	'  <Column align="end">After</Column>',
	'  <Row><Cell>Full build</Cell><Cell>12.9 s</Cell><Cell>12.4 s</Cell></Row>',
	'  <Row><Cell>Incremental build</Cell><Cell>11.7 s</Cell><Cell>1.8 s</Cell></Row>',
	'</Table>',
	'<Text variant="heading">Notes</Text>',
	'<Text>Most of the improvement comes from caching the module graph between runs.</Text>',
	'<Text variant="caption">Measured on a warm cache.</Text>',
	'<Disclosure summary="How this was measured">',
	'  <Text>Median of five runs.</Text>',
	'</Disclosure>',
	'<Disclosure summary="Known limits">',
	'  <Text>The first build after a branch switch is not cached.</Text>',
	'</Disclosure>',
].join('\n');

/** Renders the catalogue inside the ancestors of a response's Markdown, so that the chat styles apply as they do in a transcript. */
function renderCatalogue({ container }: ComponentFixtureContext, width: number): void {
	const { document, error } = parseNativeComponents(catalogue);
	if (!document) {
		throw new Error(error.message);
	}
	const visual = renderNativeComponents(document);
	visual.disclosures[visual.disclosures.length - 1].open = true;

	container.style.width = `${width}px`;
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.classList.add('interactive-session');
	const part = dom.$('.chat-native-components', undefined, dom.$('.chat-native-components-visual', undefined, visual.element));
	const markdown = dom.$('.rendered-markdown', undefined, dom.$('div', { 'data-code': '0' }, part));
	container.appendChild(dom.$('.interactive-item-container.interactive-response', undefined, dom.$('.value', undefined, markdown)));
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Catalogue: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		render: context => renderCatalogue(context, 560),
	}),
	CatalogueInNarrowChat: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		labels: { kind: 'screenshot' },
		render: context => renderCatalogue(context, 260),
	}),
});
