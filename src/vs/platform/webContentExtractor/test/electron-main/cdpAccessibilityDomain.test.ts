/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { AXNode, AXProperty, AXValueType, convertAXTreeToMarkdown } from '../../electron-main/cdpAccessibilityDomain.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('CDP Accessibility Domain', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const testUri = URI.parse('https://example.com/test');

	function createAXValue(type: AXValueType, value: any) {
		return { type, value };
	}

	function createAXProperty(name: string, value: any, type: AXValueType = 'string'): AXProperty {
		return {
			name: name as any,
			value: createAXValue(type, value)
		};
	}

	test('empty tree returns empty string', () => {
		const result = convertAXTreeToMarkdown(testUri, []);
		assert.strictEqual(result, '');
	});

	//#region Heading Tests

	test('simple heading conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				childIds: ['node2'],
				ignored: false,
				role: createAXValue('role', 'heading'),
				name: createAXValue('string', 'Test Heading'),
				properties: [
					createAXProperty('level', 2, 'integer')
				]
			},
			{
				nodeId: 'node2',
				childIds: [],
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Test Heading')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), '## Test Heading');
	});

	//#endregion

	//#region Paragraph Tests

	test('paragraph with text conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'paragraph'),
				childIds: ['node2']
			},
			{
				nodeId: 'node2',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'This is a paragraph of text.')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), 'This is a paragraph of text.');
	});

	test('really long paragraph should insert newlines at the space before 80 characters', () => {
		const longStr = [
			'This is a paragraph of text. It is really long. Like really really really really',
			'really really really really really really really long. That long.'
		];

		const nodes: AXNode[] = [
			{
				nodeId: 'node2',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', longStr.join(' '))
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), longStr.join('\n'));
	});

	//#endregion

	//#region List Tests

	test('list conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'list'),
				childIds: ['node2', 'node3']
			},
			{
				nodeId: 'node2',
				ignored: false,
				role: createAXValue('role', 'listitem'),
				childIds: ['node4', 'node6']
			},
			{
				nodeId: 'node3',
				ignored: false,
				role: createAXValue('role', 'listitem'),
				childIds: ['node5', 'node7']
			},
			{
				nodeId: 'node4',
				ignored: false,
				role: createAXValue('role', 'ListMarker'),
				name: createAXValue('string', '1. ')
			},
			{
				nodeId: 'node5',
				ignored: false,
				role: createAXValue('role', 'ListMarker'),
				name: createAXValue('string', '2. ')
			},
			{
				nodeId: 'node6',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Item 1')
			},
			{
				nodeId: 'node7',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Item 2')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		const expected =
			`
1. Item 1
2. Item 2

`;
		assert.strictEqual(result, expected);
	});

	test('nested list conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'list1',
				ignored: false,
				role: createAXValue('role', 'list'),
				childIds: ['item1', 'item2']
			},
			{
				nodeId: 'item1',
				ignored: false,
				role: createAXValue('role', 'listitem'),
				childIds: ['marker1', 'text1', 'nestedList'],
				properties: [
					createAXProperty('level', 1, 'integer')
				]
			},
			{
				nodeId: 'marker1',
				ignored: false,
				role: createAXValue('role', 'ListMarker'),
				name: createAXValue('string', '- ')
			},
			{
				nodeId: 'text1',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Item 1')
			},
			{
				nodeId: 'nestedList',
				ignored: false,
				role: createAXValue('role', 'list'),
				childIds: ['nestedItem']
			},
			{
				nodeId: 'nestedItem',
				ignored: false,
				role: createAXValue('role', 'listitem'),
				childIds: ['nestedMarker', 'nestedText'],
				properties: [
					createAXProperty('level', 2, 'integer')
				]
			},
			{
				nodeId: 'nestedMarker',
				ignored: false,
				role: createAXValue('role', 'ListMarker'),
				name: createAXValue('string', '- ')
			},
			{
				nodeId: 'nestedText',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Item 1a')
			},
			{
				nodeId: 'item2',
				ignored: false,
				role: createAXValue('role', 'listitem'),
				childIds: ['marker2', 'text2'],
				properties: [
					createAXProperty('level', 1, 'integer')
				]
			},
			{
				nodeId: 'marker2',
				ignored: false,
				role: createAXValue('role', 'ListMarker'),
				name: createAXValue('string', '- ')
			},
			{
				nodeId: 'text2',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Item 2')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		const indent = '  ';
		const expected =
			`
- Item 1
${indent}- Item 1a
- Item 2

`;
		assert.strictEqual(result, expected);
	});

	//#endregion

	//#region Links Tests

	test('links conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'paragraph'),
				childIds: ['node2']
			},
			{
				nodeId: 'node2',
				ignored: false,
				role: createAXValue('role', 'link'),
				name: createAXValue('string', 'Test Link'),
				properties: [
					createAXProperty('url', 'https://test.com')
				]
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), '[Test Link](https://test.com)');
	});

	test('links to same page are not converted to markdown links', () => {
		const pageUri = URI.parse('https://example.com/page');
		const nodes: AXNode[] = [
			{
				nodeId: 'link',
				ignored: false,
				role: createAXValue('role', 'link'),
				name: createAXValue('string', 'Current page link'),
				properties: [createAXProperty('url', 'https://example.com/page?section=1#header')]
			}
		];

		const result = convertAXTreeToMarkdown(pageUri, nodes);
		assert.strictEqual(result.includes('Current page link'), true);
		assert.strictEqual(result.includes('[Current page link]'), false);
	});

	//#endregion

	//#region Image Tests

	test('image conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'image'),
				name: createAXValue('string', 'Alt text'),
				properties: [
					createAXProperty('url', 'https://test.com/image.png')
				]
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), '![Alt text](https://test.com/image.png)');
	});

	test('image without URL shows alt text', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'image'),
				name: createAXValue('string', 'Alt text')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.trim(), '[Image: Alt text]');
	});

	//#endregion

	//#region Description List Tests

	test('description list conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'dl',
				ignored: false,
				role: createAXValue('role', 'DescriptionList'),
				childIds: ['term1', 'def1', 'term2', 'def2']
			},
			{
				nodeId: 'term1',
				ignored: false,
				role: createAXValue('role', 'term'),
				childIds: ['termText1']
			},
			{
				nodeId: 'termText1',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Term 1')
			},
			{
				nodeId: 'def1',
				ignored: false,
				role: createAXValue('role', 'definition'),
				childIds: ['defText1']
			},
			{
				nodeId: 'defText1',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Definition 1')
			},
			{
				nodeId: 'term2',
				ignored: false,
				role: createAXValue('role', 'term'),
				childIds: ['termText2']
			},
			{
				nodeId: 'termText2',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Term 2')
			},
			{
				nodeId: 'def2',
				ignored: false,
				role: createAXValue('role', 'definition'),
				childIds: ['defText2']
			},
			{
				nodeId: 'defText2',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'Definition 2')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.includes('- **Term 1** Definition 1'), true);
		assert.strictEqual(result.includes('- **Term 2** Definition 2'), true);
	});

	//#endregion

	//#region Blockquote Tests

	test('blockquote conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'blockquote'),
				name: createAXValue('string', 'This is a blockquote\nWith multiple lines')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		const expected =
			`> This is a blockquote
> With multiple lines`;
		assert.strictEqual(result.trim(), expected);
	});

	//#endregion

	//#region Code Tests

	test('preformatted text conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: createAXValue('role', 'pre'),
				name: createAXValue('string', 'function test() {\n  return true;\n}')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		const expected =
			'```\nfunction test() {\n  return true;\n}\n```';
		assert.strictEqual(result.trim(), expected);
	});

	test('code block conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'code',
				ignored: false,
				role: createAXValue('role', 'code'),
				childIds: ['codeText']
			},
			{
				nodeId: 'codeText',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'const x = 42;\nconsole.log(x);')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.includes('```'), true);
		assert.strictEqual(result.includes('const x = 42;'), true);
		assert.strictEqual(result.includes('console.log(x);'), true);
	});

	test('inline code conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'code',
				ignored: false,
				role: createAXValue('role', 'code'),
				childIds: ['codeText']
			},
			{
				nodeId: 'codeText',
				ignored: false,
				role: createAXValue('role', 'StaticText'),
				name: createAXValue('string', 'const x = 42;')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		assert.strictEqual(result.includes('`const x = 42;`'), true);
	});

	//#endregion

	//#region Table Tests

	test('table conversion', () => {
		const nodes: AXNode[] = [
			{
				nodeId: 'table1',
				ignored: false,
				role: createAXValue('role', 'table'),
				childIds: ['row1', 'row2']
			},
			{
				nodeId: 'row1',
				ignored: false,
				role: createAXValue('role', 'row'),
				childIds: ['cell1', 'cell2']
			},
			{
				nodeId: 'row2',
				ignored: false,
				role: createAXValue('role', 'row'),
				childIds: ['cell3', 'cell4']
			},
			{
				nodeId: 'cell1',
				ignored: false,
				role: createAXValue('role', 'cell'),
				name: createAXValue('string', 'Header 1')
			},
			{
				nodeId: 'cell2',
				ignored: false,
				role: createAXValue('role', 'cell'),
				name: createAXValue('string', 'Header 2')
			},
			{
				nodeId: 'cell3',
				ignored: false,
				role: createAXValue('role', 'cell'),
				name: createAXValue('string', 'Data 1')
			},
			{
				nodeId: 'cell4',
				ignored: false,
				role: createAXValue('role', 'cell'),
				name: createAXValue('string', 'Data 2')
			}
		];

		const result = convertAXTreeToMarkdown(testUri, nodes);
		const expected =
			`
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
		assert.strictEqual(result.trim(), expected.trim());
	});

	//#endregion
});
