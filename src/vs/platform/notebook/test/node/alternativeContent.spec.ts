/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseXMLNotebook, isXMLNotebook } from '../../common/alternativeContentProvider.xml';

suite('XML Notebook Parser', () => {

	test('should detect XML notebook format', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="markdown">Test</VSCode.Cell>
  </cells>
</notebook>`;

		assert.strictEqual(isXMLNotebook(xmlContent), true);
	});

	test('should not detect JSON as XML notebook', () => {
		const jsonContent = `{"cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5}`;
		assert.strictEqual(isXMLNotebook(jsonContent), false);
	});

	test('should parse basic XML notebook with metadata', () => {
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
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.strictEqual(result.nbformat, 4);
		assert.strictEqual(result.nbformat_minor, 5);
		assert.ok(result.metadata);
		assert.ok(result.metadata.kernelspec);
		assert.strictEqual(result.metadata.kernelspec.display_name, 'Python 3');
		assert.strictEqual(result.metadata.kernelspec.language, 'python');
		assert.strictEqual(result.metadata.kernelspec.name, 'python3');
		assert.ok(result.metadata.language_info);
		assert.strictEqual(result.metadata.language_info.name, 'python');
	});

	test('should parse XML notebook with markdown cell', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="markdown">
# Mandelbrot Set Fractal

This notebook renders a visualization of the Mandelbrot set.
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		assert.strictEqual(result.cells[0].cell_type, 'markdown');
		assert.ok(result.cells[0].source.includes('# Mandelbrot Set Fractal'));
	});

	test('should parse XML notebook with code cell', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="python">
import numpy as np
import matplotlib.pyplot as plt
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
		assert.strictEqual(result.cells[0].cell_type, 'code');
		assert.ok(result.cells[0].source.includes('import numpy as np'));
	});

	test('should parse XML notebook with multiple cells', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
    <VSCode.Cell language="markdown">
# Header
    </VSCode.Cell>
    <VSCode.Cell language="python">
print("Hello")
    </VSCode.Cell>
    <VSCode.Cell language="python">
x = 42
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 3);
		assert.strictEqual(result.cells[0].cell_type, 'markdown');
		assert.strictEqual(result.cells[1].cell_type, 'code');
		assert.strictEqual(result.cells[2].cell_type, 'code');
	});

	test('should parse the exact sample from create_notebook.txt', () => {
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
      <mimetype>text/x-python</mimetype>
      <codemirror_mode>
        <name>ipython</name>
        <version>3</version>
      </codemirror_mode>
      <pygments_lexer>ipython3</pygments_lexer>
      <nbconvert_exporter>python</nbconvert_exporter>
      <file_extension>.py</file_extension>
    </language_info>
  </metadata>
  <cells>
    <VSCode.Cell language="markdown">
# Mandelbrot Set Fractal

This notebook renders a visualization of the Mandelbrot set, a classic fractal that exhibits infinite complexity and self-similarity.
    </VSCode.Cell>
    <VSCode.Cell language="python">
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
    </VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		// Validate structure
		assert.strictEqual(result.nbformat, 4);
		assert.strictEqual(result.nbformat_minor, 5);

		// Validate metadata
		assert.ok(result.metadata);
		assert.ok(result.metadata.kernelspec);
		assert.strictEqual(result.metadata.kernelspec.display_name, 'Python 3');
		assert.strictEqual(result.metadata.kernelspec.language, 'python');
		assert.strictEqual(result.metadata.kernelspec.name, 'python3');

		assert.ok(result.metadata.language_info);
		assert.strictEqual(result.metadata.language_info.name, 'python');
		assert.strictEqual((result.metadata.language_info as any).version, '3.9.0');
		assert.strictEqual((result.metadata.language_info as any).mimetype, 'text/x-python');
		assert.strictEqual((result.metadata.language_info as any).file_extension, '.py');
		assert.strictEqual((result.metadata.language_info as any).pygments_lexer, 'ipython3');
		assert.strictEqual((result.metadata.language_info as any).nbconvert_exporter, 'python');

		// Validate codemirror_mode
		assert.ok((result.metadata.language_info as any).codemirror_mode);
		assert.strictEqual((result.metadata.language_info as any).codemirror_mode.name, 'ipython');
		assert.strictEqual((result.metadata.language_info as any).codemirror_mode.version, 3);

		// Validate cells
		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 2);

		// Validate first cell (markdown)
		assert.strictEqual(result.cells[0].cell_type, 'markdown');
		assert.ok(result.cells[0].source.includes('# Mandelbrot Set Fractal'));
		assert.ok(result.cells[0].source.includes('This notebook renders a visualization'));

		// Validate second cell (code)
		assert.strictEqual(result.cells[1].cell_type, 'code');
		assert.ok(result.cells[1].source.includes('import numpy as np'));
		assert.ok(result.cells[1].source.includes('import matplotlib.pyplot as plt'));
	});

	test('should handle empty cells section', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <metadata></metadata>
  <cells>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 0);
	});

	test('should handle missing metadata', () => {
		const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<notebook xmlns="http://www.w3.org/2005/xpath-functions" nbformat="4" nbformat_minor="5">
  <cells>
    <VSCode.Cell language="python">print("test")</VSCode.Cell>
  </cells>
</notebook>`;

		const result = parseXMLNotebook(xmlContent);

		assert.ok(result.metadata);
		assert.ok(result.cells);
		assert.strictEqual(result.cells.length, 1);
	});
});
