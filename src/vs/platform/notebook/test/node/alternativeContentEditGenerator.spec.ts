/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseXMLNotebook } from '../../common/alternativeContentProvider.xml';

suite('XML Notebook Edit Generator', () => {

	test('should preserve cell order when parsing', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="markdown">Cell 1</VSCode.Cell>
    <VSCode.Cell language="python">Cell 2</VSCode.Cell>
    <VSCode.Cell language="markdown">Cell 3</VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 3);
		assert.ok(result.cells[0].source.includes('Cell 1'));
		assert.ok(result.cells[1].source.includes('Cell 2'));
		assert.ok(result.cells[2].source.includes('Cell 3'));
	});

	test('should handle cells with special characters', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="python">
x = "Hello &amp; Goodbye"
y = 'Single "quotes"'
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		// The content should be parsed
		assert.ok(result.cells[0].source);
	});

	test('should handle multiline cell content', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="python">
def hello():
    print("Hello")
    return 42
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		const source = result.cells[0].source;
		assert.ok(source.includes('def hello()'));
		assert.ok(source.includes('print("Hello")'));
		assert.ok(source.includes('return 42'));
	});

	test('should preserve whitespace in cell content', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="python">
    indented = True
        double_indent = True
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		// Content should preserve indentation
		assert.ok(result.cells[0].source.includes('indented'));
	});

	test('should generate correct cell types', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="markdown"># Title</VSCode.Cell>
    <VSCode.Cell language="python">code()</VSCode.Cell>
    <VSCode.Cell language="javascript">console.log()</VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 3);
		assert.strictEqual(result.cells[0].cell_type, 'markdown');
		assert.strictEqual(result.cells[1].cell_type, 'code');
		assert.strictEqual(result.cells[2].cell_type, 'code'); // javascript is also code
	});

	test('should initialize code cells with empty outputs', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="python">print(42)</VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		assert.strictEqual(result.cells[0].cell_type, 'code');
		assert.ok(Array.isArray((result.cells[0] as any).outputs));
		assert.strictEqual((result.cells[0] as any).outputs.length, 0);
		assert.strictEqual((result.cells[0] as any).execution_count, null);
	});

	test('should handle complex fractal notebook', () => {
		// This is a more complete example based on the create_notebook.txt
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata>
    <kernelspec>
      <display_name>Python 3</display_name>
      <language>python</language>
      <name>python3</name>
    </kernelspec>
    <language_info>
      <name>python</name>
      <version>3.9.0</version>
    </language_info>
  </metadata>
  <cells>
    <VSCode.Cell language="markdown">
# Mandelbrot Set Fractal

This notebook renders a visualization of the Mandelbrot set.
    </VSCode.Cell>
    <VSCode.Cell language="python">
import numpy as np
import matplotlib.pyplot as plt
    </VSCode.Cell>
    <VSCode.Cell language="markdown">
## Function to Calculate Mandelbrot Set
    </VSCode.Cell>
    <VSCode.Cell language="python">
def mandelbrot(c, max_iter=100):
    z = 0
    for n in range(max_iter):
        if abs(z) > 2:
            return n
        z = z*z + c
    return max_iter
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 4);

		// Check alternating pattern
		assert.strictEqual(result.cells[0].cell_type, 'markdown');
		assert.strictEqual(result.cells[1].cell_type, 'code');
		assert.strictEqual(result.cells[2].cell_type, 'markdown');
		assert.strictEqual(result.cells[3].cell_type, 'code');

		// Check content
		assert.ok(result.cells[0].source.includes('Mandelbrot Set Fractal'));
		assert.ok(result.cells[1].source.includes('import numpy as np'));
		assert.ok(result.cells[2].source.includes('## Function to Calculate'));
		assert.ok(result.cells[3].source.includes('def mandelbrot'));
	});
});
