/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INativeComponentsDocument, NativeComponentsLimits } from '../../../common/nativeComponents/nativeComponents.js';
import { parseNativeComponents } from '../../../common/nativeComponents/nativeComponentsParser.js';
import { describeNativeComponents } from '../../../common/nativeComponents/nativeComponentsText.js';

suite('Native components parser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const catalogue = [
		'<Columns>',
		'  <Metric label="Full build" value="12.4 s" />',
		'  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive"></Metric>',
		'</Columns>',
		'<Stack>',
		'  <Text variant="heading">Build &amp; test</Text>',
		'  <Text>',
		'    Most of the improvement',
		'    comes from caching.',
		'  </Text>',
		'  <Badge tone="warning">Flaky</Badge>',
		'</Stack>',
		'<Table caption="Duration by target">',
		'  <Column>Target</Column>',
		'  <Column align="end">Seconds</Column>',
		'  <Row><Cell>Full</Cell><Cell>12.4</Cell></Row>',
		'  <Row><Cell>Incremental</Cell><Cell></Cell></Row>',
		'</Table>',
		'<BarChart title="Build duration" unit="s">',
		'  <Bar label="Full" value="12.4" />',
		'  <Bar label=\'Incremental\' value="1.80" />',
		'</BarChart>',
		'<Disclosure summary="Method">',
		'  <Text variant="caption">Median of five runs.</Text>',
		'</Disclosure>',
	].join('\n');

	const document: INativeComponentsDocument = {
		version: 1,
		children: [
			{
				type: 'columns', children: [
					{ type: 'metric', label: 'Full build', value: '12.4 s', delta: undefined, tone: 'neutral' },
					{ type: 'metric', label: 'Incremental build', value: '1.8 s', delta: '-85%', tone: 'positive' },
				]
			},
			{
				type: 'stack', children: [
					{ type: 'text', variant: 'heading', text: 'Build & test' },
					{ type: 'text', variant: 'body', text: 'Most of the improvement comes from caching.' },
					{ type: 'badge', text: 'Flaky', tone: 'warning' },
				]
			},
			{
				type: 'table', caption: 'Duration by target',
				columns: [{ header: 'Target', align: 'start' }, { header: 'Seconds', align: 'end' }],
				rows: [['Full', '12.4'], ['Incremental', '']],
			},
			{
				type: 'barChart', title: 'Build duration', unit: 's',
				bars: [{ label: 'Full', value: 12.4, valueText: '12.4' }, { label: 'Incremental', value: 1.8, valueText: '1.80' }],
			},
			{ type: 'disclosure', summary: 'Method', children: [{ type: 'text', variant: 'caption', text: 'Median of five runs.' }] },
		],
	};

	/** The outcome of parsing, reduced to what a failing block reports. */
	function failure(source: string, fenceInfo?: string): string {
		const { error } = parseNativeComponents(source, fenceInfo);
		return error ? `${error.line ?? '-'}: ${error.message}` : 'valid';
	}

	test('parses every component of the catalogue into a typed document', () => {
		assert.deepStrictEqual(parseNativeComponents(catalogue), { document });
	});

	test('describes a document as the text alternative of its visual', () => {
		assert.deepStrictEqual(describeNativeComponents(document).split('\n'), [
			'Full build: 12.4 s',
			'Incremental build: 1.8 s (-85%, Positive)',
			'Build & test',
			'Most of the improvement comes from caching.',
			'Flaky (Warning)',
			'Table: Duration by target',
			'Target | Seconds',
			'Full | 12.4',
			'Incremental | ',
			'Bar chart: Build duration',
			'Full: 12.4 s',
			'Incremental: 1.80 s',
			'Details: Method',
			'Median of five runs.',
		]);
	});

	test('keeps literals as text: decodes the supported entities and leaves everything else as written', () => {
		const result = parseNativeComponents('<Text>&lt;b&gt; &quot;R&D&quot; &apos;x&apos; &#123;a&#x7D; &nbsp; &#xD800; &#1114112;</Text><Metric label="{count} > 1" value="a&#10;b" />');
		assert.deepStrictEqual(result.document?.children, [
			{ type: 'text', variant: 'body', text: '<b> "R&D" \'x\' {a} &nbsp; &#xD800; &#1114112;' },
			{ type: 'metric', label: '{count} > 1', value: 'a b', delta: undefined, tone: 'neutral' },
		]);
	});

	test('collapses ordinary whitespace and keeps a non-breaking space as written', () => {
		const result = parseNativeComponents('<Stack>\u00a0\n<Text>  1.8&#160;s \n\t a\u202fb &#160;</Text><Metric label="Full  build" value="12.4&#xA0;s" /></Stack>');
		assert.deepStrictEqual(result.document?.children, [{
			type: 'stack', children: [
				{ type: 'text', variant: 'body', text: '1.8\u00a0s a\u202fb \u00a0' },
				{ type: 'metric', label: 'Full build', value: '12.4\u00a0s', delta: undefined, tone: 'neutral' },
			]
		}]);
	});

	test('rejects everything outside the catalogue, with the line and a reason', () => {
		assert.deepStrictEqual([
			'',
			'   \n  ',
			'<Chart />',
			'<div>Hello</div>',
			'<script>alert(1)</script>',
			'<Text>\n  <b>bold</b>\n</Text>',
			'<Metric label="A" value="1" style="color: red" />',
			'<Stack class="wide"><Text>A</Text></Stack>',
			'<Metric label="A" value="1" onClick="run()" />',
			'<Metric label="A" value={1} />',
			'<Metric label="A" value="1" {...props} />',
			'<Text>Total: {total}</Text>',
			'<Stack>\n  {/* note */}\n  <Text>A</Text>\n</Stack>',
			'<!-- note -->\n<Text>A</Text>',
			'import { Chart } from "charts";\n<Text>A</Text>',
			'<Text>A</Text>\nloose text',
			'<Stack>\n  loose text\n  <Text>A</Text>\n</Stack>',
			'<Text>a < b</Text>',
			'<Metric label="A" value=1 />',
			'<Metric label="A" value />',
			'<Metric label="A" value="1',
			'<Metric label="A" label="B" value="1" />',
			'<Metric label="A" />',
			'<Metric label="" value="1" />',
			'<Metric label="A" value="1" tone="green" />',
			'<Metric label="A" value="1">text</Metric>',
			'<Text variant="title">A</Text>',
			'<Text></Text>',
			'<Stack></Stack>',
			'<Stack>\n  <Text>A</Text>\n</Columns>',
			'<Stack>\n  <Text>A</Text>',
			'</Stack>',
			'<Bar label="A" value="1" />',
			'<Columns><Row><Cell>A</Cell></Row></Columns>',
			'<Table><Text>A</Text></Table>',
			'<Table><Row><Cell>A</Cell></Row></Table>',
			'<Table><Column>A</Column></Table>',
			'<Table><Column>A</Column><Row><Cell>1</Cell><Cell>2</Cell></Row></Table>',
			'<Table><Column>A</Column><Row><Cell>1</Cell></Row><Column>B</Column></Table>',
			'<Table><Column>A</Column><Row><Cell><Badge>1</Badge></Cell></Row></Table>',
			'<BarChart title="A"></BarChart>',
			'<BarChart><Bar label="A" value="1" /></BarChart>',
			'<BarChart title="A"><Bar label="A" value="-1" /></BarChart>',
			'<BarChart title="A"><Bar label="A" value="1.5 s" /></BarChart>',
			'<BarChart title="A"><Bar label="A" value="1,200" /></BarChart>',
			'<BarChart title="A"><Bar label="A" value="1e3" /></BarChart>',
			`<BarChart title="A"><Bar label="A" value="${'9'.repeat(400)}" /></BarChart>`,
			'<Disclosure><Text>A</Text></Disclosure>',
			'<constructor />',
		].map(source => failure(source)), [
			'-: The block has no components.',
			'-: The block has no components.',
			'1: Unknown component "Chart". Available here: Stack, Columns, Text, Metric, Badge, Table, BarChart, Disclosure.',
			'1: Unknown component "div". Available here: Stack, Columns, Text, Metric, Badge, Table, BarChart, Disclosure.',
			'1: Unknown component "script". Available here: Stack, Columns, Text, Metric, Badge, Table, BarChart, Disclosure.',
			'2: "Text" can only contain text, but contains "b".',
			'1: Unknown attribute "style" on "Metric". Allowed: label, value, delta, tone.',
			'1: Unknown attribute "class" on "Stack", which has no attributes.',
			'1: Unknown attribute "onClick" on "Metric". Allowed: label, value, delta, tone.',
			'1: Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as &#123; or &#125;.',
			'1: Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as &#123; or &#125;.',
			'1: Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as &#123; or &#125;.',
			'2: Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as &#123; or &#125;.',
			'1: Expected a component name after "<". Write a literal "<" in text as &lt;.',
			'1: Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as &#123; or &#125;.',
			'2: Text must be inside a component, such as "Text".',
			'2: "Stack" cannot contain text. Put text in a "Text" component.',
			'1: Expected a component name after "<". Write a literal "<" in text as &lt;.',
			'1: The "value" attribute of "Metric" needs a value in quotes.',
			'1: The "value" attribute of "Metric" needs a value in quotes.',
			'1: The "value" attribute of "Metric" needs a value in quotes.',
			'1: The "label" attribute of "Metric" is set more than once.',
			'1: "Metric" needs a "value" attribute.',
			'1: "Metric" needs a "label" attribute.',
			'1: "green" is not a valid "tone" for "Metric". Allowed: neutral, positive, negative, warning.',
			'1: "Metric" cannot have content. Set its attributes instead.',
			'1: "title" is not a valid "variant" for "Text". Allowed: body, heading, caption.',
			'1: "Text" needs text between its tags.',
			'1: "Stack" needs at least one component inside it.',
			'3: Expected </Stack> to close "Stack".',
			'2: "Stack" is not closed. Expected </Stack>.',
			'1: Unexpected closing tag </Stack>.',
			'1: "Bar" is only allowed directly inside "BarChart".',
			'1: "Row" is only allowed directly inside "Table".',
			'1: "Text" is not allowed inside "Table". Allowed: Column, Row.',
			'1: The number of cells in this row (1) does not match the number of columns (0).',
			'1: "Table" needs at least one "Row".',
			'1: The number of cells in this row (2) does not match the number of columns (1).',
			'1: Every "Column" of a "Table" must come before its first "Row".',
			'1: "Cell" can only contain text, but contains "Badge".',
			'1: "BarChart" needs at least one "Bar".',
			'1: "BarChart" needs a "title" attribute.',
			'1: The "value" of a "Bar" must be a number that is not negative, such as 12.5, without a unit or separators. Found "-1".',
			'1: The "value" of a "Bar" must be a number that is not negative, such as 12.5, without a unit or separators. Found "1.5 s".',
			'1: The "value" of a "Bar" must be a number that is not negative, such as 12.5, without a unit or separators. Found "1,200".',
			'1: The "value" of a "Bar" must be a number that is not negative, such as 12.5, without a unit or separators. Found "1e3".',
			`1: The "value" of a "Bar" must be a number that is not negative, such as 12.5, without a unit or separators. Found "${'9'.repeat(400)}".`,
			'1: "Disclosure" needs a "summary" attribute.',
			'1: Unknown component "constructor". Available here: Stack, Columns, Text, Metric, Badge, Table, BarChart, Disclosure.',
		]);
	});

	test('bounds the size, nesting, component count and datasets of a block', () => {
		const nested = (depth: number) => `${'<Stack>'.repeat(depth - 1)}<Text>A</Text>${'</Stack>'.repeat(depth - 1)}`;
		const texts = (count: number) => '<Text>A</Text>'.repeat(count);
		const table = (columns: number, rows: number) => `<Table>${'<Column>C</Column>'.repeat(columns)}${`<Row>${'<Cell>1</Cell>'.repeat(columns)}</Row>`.repeat(rows)}</Table>`;
		const chart = (bars: number) => `<BarChart title="A">${'<Bar label="A" value="1" />'.repeat(bars)}</BarChart>`;
		const padded = (length: number) => `<Text>${'a'.repeat(length - '<Text></Text>'.length)}</Text>`;
		assert.deepStrictEqual({
			sourceAtLimit: failure(padded(NativeComponentsLimits.sourceLength)),
			sourceOverLimit: failure(padded(NativeComponentsLimits.sourceLength + 1)),
			depthAtLimit: failure(nested(NativeComponentsLimits.depth)),
			depthOverLimit: failure(nested(NativeComponentsLimits.depth + 1)),
			componentsAtLimit: failure(texts(NativeComponentsLimits.components)),
			componentsOverLimit: failure(texts(NativeComponentsLimits.components + 1)),
			columnsAtLimit: failure(table(NativeComponentsLimits.tableColumns, 1)),
			columnsOverLimit: failure(table(NativeComponentsLimits.tableColumns + 1, 1)),
			rowsAtLimit: failure(table(1, NativeComponentsLimits.tableRows)),
			rowsOverLimit: failure(table(1, NativeComponentsLimits.tableRows + 1)),
			barsAtLimit: failure(chart(NativeComponentsLimits.bars)),
			barsOverLimit: failure(chart(NativeComponentsLimits.bars + 1)),
		}, {
			sourceAtLimit: 'valid',
			sourceOverLimit: '-: The block is longer than 32000 characters.',
			depthAtLimit: 'valid',
			depthOverLimit: '1: Components are nested more than 8 levels deep.',
			componentsAtLimit: 'valid',
			componentsOverLimit: '1: The block has more than 2000 components.',
			columnsAtLimit: 'valid',
			columnsOverLimit: '1: "Table" has 13 "Column" components, which is more than the limit of 12.',
			rowsAtLimit: 'valid',
			rowsOverLimit: '1: "Table" has 101 "Row" components, which is more than the limit of 100.',
			barsAtLimit: 'valid',
			barsOverLimit: '1: "BarChart" has 25 "Bar" components, which is more than the limit of 24.',
		});
	});

	test('accepts only its own schema version on the fence', () => {
		const source = '<Text>A</Text>';
		assert.deepStrictEqual([undefined, 'vscode-ui', 'VSCODE-UI', '  vscode-ui   v1 ', 'vscode-ui v2', 'vscode-ui v0', 'vscode-ui 1', 'vscode-ui v1 wide', 'vscode-ui title="A"', 'vscode-ui:v2', 'html-preview', ''].map(fenceInfo => failure(source, fenceInfo)), [
			'valid',
			'valid',
			'valid',
			'valid',
			'-: The block uses schema version 2, but this version of VS Code supports version 1.',
			'-: The block uses schema version 0, but this version of VS Code supports version 1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
			'-: The fence can only name the language vscode-ui, optionally followed by a schema version such as v1.',
		]);
	});
});
