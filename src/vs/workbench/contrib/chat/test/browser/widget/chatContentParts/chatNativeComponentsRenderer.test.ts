/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { renderNativeComponents } from '../../../../browser/widget/chatContentParts/chatNativeComponentsRenderer.js';
import { parseNativeComponents } from '../../../../common/nativeComponents/nativeComponentsParser.js';

suite('Native components renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(source: string): HTMLElement {
		const { document, error } = parseNativeComponents(source);
		assert.ok(document, error?.message);
		const { element } = renderNativeComponents(document);
		mainWindow.document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		return element;
	}

	const labelledBy = (element: Element) => mainWindow.document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent;
	const texts = (elements: Iterable<Element>) => Array.from(elements, element => element.textContent);

	test('gives every component real semantics, and names what a tone or a bar conveys', () => {
		const element = render([
			'<Text variant="heading">Build</Text>',
			'<Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />',
			'<Metric label="Full build" value="12.4 s" />',
			'<Metric label="Flaky tests" value="7" tone="warning" />',
			'<Badge tone="warning">Flaky</Badge>',
			'<Badge>Draft</Badge>',
			'<Table caption="By target"><Column>Target</Column><Column align="end">Seconds</Column><Row><Cell>Full</Cell><Cell>12.4</Cell></Row></Table>',
			'<BarChart title="Duration" unit="s"><Bar label="Full" value="10" /><Bar label="Incremental" value="2.5" /><Bar label="Cached" value="0" /></BarChart>',
			'<Disclosure summary="Method"><Text>Median of five runs.</Text></Disclosure>',
		].join('\n'));

		const heading = element.querySelector('.chat-native-text.heading')!;
		const table = element.querySelector('table')!;
		const plot = element.querySelector('.chat-native-chart-plot')!;
		const details = element.querySelector('details')!;
		assert.deepStrictEqual({
			heading: { role: heading.getAttribute('role'), level: heading.getAttribute('aria-level'), text: heading.textContent },
			metrics: Array.from(element.querySelectorAll('.chat-native-metric'), metric => ({
				role: metric.getAttribute('role'),
				label: labelledBy(metric),
				value: metric.querySelector('.chat-native-metric-value')!.textContent,
				detail: metric.querySelector('.chat-native-metric-detail')?.textContent,
				tone: Array.from(metric.querySelectorAll('.chat-native-icon'), icon => `${icon.parentElement!.className} > ${icon.getAttribute('role')}: ${icon.getAttribute('aria-label')}`),
			})),
			badgesPerLine: Array.from(element.querySelectorAll('.chat-native-badges'), badges => badges.children.length),
			badge: {
				text: element.querySelector('.chat-native-badge')!.textContent,
				tone: Array.from(element.querySelectorAll('.chat-native-badge .chat-native-icon'), icon => `${icon.getAttribute('role')}: ${icon.getAttribute('aria-label')}`),
			},
			table: {
				caption: table.caption?.textContent,
				headers: Array.from(table.tHead!.rows[0].cells, cell => `${cell.tagName} ${cell.getAttribute('scope')} ${cell.textContent}${cell.classList.contains('align-end') ? ' (end)' : ''}`),
				rows: Array.from(table.tBodies[0].rows, row => Array.from(row.cells, cell => `${cell.tagName} ${cell.textContent}${cell.classList.contains('align-end') ? ' (end)' : ''}`)),
			},
			chart: {
				role: plot.getAttribute('role'),
				label: labelledBy(plot),
				rows: Array.from(plot.children, row => Array.from(row.children, cell => cell.getAttribute('aria-hidden') === 'true'
					? `decorative bar ${cell.querySelector<HTMLElement>('.chat-native-chart-bar')!.style.width}`
					: `${row.getAttribute('role')} > ${cell.getAttribute('role')}: ${cell.textContent}`)),
			},
			disclosure: {
				summary: details.querySelector('summary')!.textContent,
				chevronHidden: details.querySelector('summary .chat-native-icon')!.getAttribute('aria-hidden'),
				open: details.open,
				content: texts(details.querySelectorAll('.chat-native-disclosure-content > *')),
			},
		}, {
			heading: { role: 'heading', level: '3', text: 'Build' },
			metrics: [
				{ role: 'group', label: 'Incremental build', value: '1.8 s', detail: '-85%', tone: ['chat-native-metric-detail > img: Positive'] },
				{ role: 'group', label: 'Full build', value: '12.4 s', detail: undefined, tone: [] },
				{ role: 'group', label: 'Flaky tests', value: '7', detail: undefined, tone: ['chat-native-metric-value > img: Warning'] },
			],
			badgesPerLine: [2],
			badge: { text: 'Flaky', tone: ['img: Warning'] },
			table: {
				caption: 'By target',
				headers: ['TH col Target', 'TH col Seconds (end)'],
				rows: [['TD Full', 'TD 12.4 (end)']],
			},
			chart: {
				role: 'table',
				label: 'Duration',
				rows: [
					['row > rowheader: Full', 'decorative bar 100%', 'row > cell: 10 s'],
					['row > rowheader: Incremental', 'decorative bar 25%', 'row > cell: 2.5 s'],
					['row > rowheader: Cached', 'decorative bar 0%', 'row > cell: 0 s'],
				],
			},
			disclosure: { summary: 'Method', chevronHidden: 'true', open: false, content: ['Median of five runs.'] },
		});
	});

	test('sets authored strings as text, never as markup, classes or styles', () => {
		const markup = '<img src=x onerror=alert(1)><script>alert(1)</script><b style="color:red" class="x">bold</b>';
		const escaped = markup.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
		const element = render([
			`<Text>${escaped}</Text>`,
			`<Metric label="${escaped}" value="${escaped}" delta="${escaped}" />`,
			`<Badge>${escaped}</Badge>`,
			`<Table caption="${escaped}"><Column>${escaped}</Column><Row><Cell>${escaped}</Cell></Row></Table>`,
			`<BarChart title="${escaped}" unit="${escaped}"><Bar label="${escaped}" value="1" /></BarChart>`,
			`<Disclosure summary="${escaped}"><Text>A</Text></Disclosure>`,
		].join('\n'));
		const authoredText = '.chat-native-text, .chat-native-metric-label, .chat-native-metric-value, .chat-native-metric-detail, .chat-native-badge, caption, th, td, .chat-native-chart-title, .chat-native-chart-label, summary';
		assert.deepStrictEqual({
			activeOrAuthoredElements: element.querySelectorAll('img, script, b, [style*="color"], .x, [onerror]').length,
			texts: [...new Set(texts(element.querySelectorAll(authoredText)))],
			value: element.querySelector('.chat-native-chart-value')!.textContent,
		}, {
			activeOrAuthoredElements: 0,
			texts: [markup, 'A'],
			value: `1 ${markup}`,
		});
	});

	test('lays columns out side by side, and stacks them as the chat narrows', () => {
		const element = render('<Columns><Metric label="A" value="1" /><Metric label="B" value="2" /><Metric label="C" value="3" /></Columns>');
		element.style.fontSize = '13px';
		const columnsPerRow = (width: number) => {
			element.style.width = `${width}px`;
			const tops = Array.from(element.querySelectorAll('.chat-native-metric'), metric => Math.round(metric.getBoundingClientRect().top));
			return tops.filter(top => top === tops[0]).length;
		};
		assert.deepStrictEqual([600, 320, 200].map(columnsPerRow), [3, 2, 1]);
	});

	test('scrolls a wide table inside its own box instead of widening the response', () => {
		const element = render(`<Table>${'<Column>Column</Column>'.repeat(12)}<Row>${'<Cell>A&#160;long&#160;value&#160;that&#160;cannot&#160;wrap</Cell>'.repeat(12)}</Row></Table>`);
		element.style.width = '300px';
		const scroller = element.querySelector('.chat-native-table-scroll')!;
		assert.deepStrictEqual({
			responseWidth: element.getBoundingClientRect().width,
			scrollerWidth: scroller.getBoundingClientRect().width,
			scrolls: scroller.scrollWidth > scroller.clientWidth,
		}, { responseWidth: 300, scrollerWidth: 300, scrolls: true });
	});

	test('wraps long unbroken strings instead of widening a narrow chat', () => {
		const long = 'W'.repeat(60);
		const element = render([
			`<Text>${long}</Text>`,
			`<Metric label="${long}" value="${long}" delta="${long}" tone="positive" />`,
			`<Badge tone="warning">${long}</Badge>`,
			`<BarChart title="${long}" unit="${long}"><Bar label="${long}" value="1" /></BarChart>`,
			`<Disclosure summary="${long}"><Text>${long}</Text></Disclosure>`,
		].join('\n'));
		element.style.width = '240px';
		element.style.fontSize = '13px';
		element.querySelector('details')!.open = true;
		const overflowing = Array.from(element.querySelectorAll('*')).filter(child => child.scrollWidth > child.clientWidth + 1).map(child => child.className);
		assert.deepStrictEqual({ width: element.scrollWidth, overflowing: [...new Set(overflowing)] }, { width: 240, overflowing: [] });
	});
});
