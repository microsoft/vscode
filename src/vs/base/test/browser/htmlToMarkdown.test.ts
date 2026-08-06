/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { convertHtmlToMarkdown } from '../../browser/htmlToMarkdown.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('htmlToMarkdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts headings', () => {
		assert.strictEqual(convertHtmlToMarkdown('<h1>Title</h1>'), '# Title');
		assert.strictEqual(convertHtmlToMarkdown('<h2>Subtitle</h2>'), '## Subtitle');
		assert.strictEqual(convertHtmlToMarkdown('<h3>Section</h3>'), '### Section');
		assert.strictEqual(convertHtmlToMarkdown('<h4>Sub-section</h4>'), '#### Sub-section');
		assert.strictEqual(convertHtmlToMarkdown('<h5>Minor</h5>'), '##### Minor');
		assert.strictEqual(convertHtmlToMarkdown('<h6>Smallest</h6>'), '###### Smallest');
	});

	test('converts links', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<a href="https://example.com">Example</a>'),
			'[Example](https://example.com)'
		);
	});

	test('strips dangerous schemes from links', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<a href="javascript:alert(1)">click</a>'),
			'click'
		);
		assert.strictEqual(
			convertHtmlToMarkdown('<a href="vbscript:run">run</a>'),
			'run'
		);
		assert.strictEqual(
			convertHtmlToMarkdown('<a href="data:text/html,<h1>hi</h1>">data</a>'),
			'data'
		);
	});

	suite('internal links', () => {
		test('converts targets that only resolve in this window to inline code', () => {
			assert.deepStrictEqual(
				[
					convertHtmlToMarkdown('<a href="vscode-file://vscode-app/c:/Users/user/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html">foo-bar.md</a>'),
					convertHtmlToMarkdown('<a href="file:///home/user/project/DefaultMeshInterpolator.java#46,62">mx:text</a>'),
					convertHtmlToMarkdown('<a href="code-oss://file/c:/repo/src/config.ts">src/config.ts</a>'),
					convertHtmlToMarkdown('<a href="http://_vscodecontentref_/0">index.ts</a>'),
					// The agent host prompt asks models for bare absolute paths.
					convertHtmlToMarkdown('<a href="/Users/me/repo/src/a.ts">a.ts</a>'),
					convertHtmlToMarkdown('<a href="command:workbench.action.files.save">Save</a>'),
					convertHtmlToMarkdown('<img src="/Users/me/shot.png" alt="screenshot">'),
				],
				['`foo-bar.md`', '`mx:text`', '`src/config.ts`', '`index.ts`', '`a.ts`', '`Save`', '`screenshot`']);
		});

		test('prefers data-href only when href cannot be shared', () => {
			assert.deepStrictEqual(
				[
					convertHtmlToMarkdown('<a href="" data-href="file:///home/user/project/a.ts">a.ts</a>'),
					convertHtmlToMarkdown('<a href="vscode-file://vscode-app/resources/app/out/workbench.html" data-href="https://example.com">Example</a>'),
					// A page of unknown origin must not redirect a link it displayed as safe.
					convertHtmlToMarkdown('<a href="https://real.example" data-href="https://evil.example">docs</a>'),
				],
				['`a.ts`', '[Example](https://example.com)', '[docs](https://real.example)']);
		});

		test('uses the plain label when the target cannot be shared', () => {
			// Emphasis markers would be read literally inside a code span.
			assert.deepStrictEqual(
				[
					convertHtmlToMarkdown('<a href="file:///x"><strong>Foo</strong></a>'),
					convertHtmlToMarkdown('<a href="https://example.com"><strong>Kept</strong></a>'),
				],
				['`Foo`', '[**Kept**](https://example.com)']);
		});

		test('keeps internal links inside surrounding markdown formatting', () => {
			assert.strictEqual(
				convertHtmlToMarkdown('<p>This is <strong>inherited</strong> from the <a href="vscode-file://vscode-app/resources/app/out/workbench.html">FooBar</a> class.</p>'),
				'This is **inherited** from the `FooBar` class.'
			);
		});

		test('keeps document-relative links', () => {
			assert.deepStrictEqual(
				[
					convertHtmlToMarkdown('<a href="#details">details</a>'),
					convertHtmlToMarkdown('<a href="../CONTRIBUTING.md">guide</a>'),
				],
				['[details](#details)', '[guide](../CONTRIBUTING.md)']);
		});
	});

	test('converts bold and italic', () => {
		assert.strictEqual(convertHtmlToMarkdown('<strong>bold</strong>'), '**bold**');
		assert.strictEqual(convertHtmlToMarkdown('<b>bold</b>'), '**bold**');
		assert.strictEqual(convertHtmlToMarkdown('<em>italic</em>'), '*italic*');
		assert.strictEqual(convertHtmlToMarkdown('<i>italic</i>'), '*italic*');
	});

	test('converts inline code', () => {
		assert.strictEqual(convertHtmlToMarkdown('<code>foo()</code>'), '`foo()`');
	});

	test('preserves HTML tag names inside inline code', () => {
		assert.strictEqual(convertHtmlToMarkdown('<code>&lt;aside&gt;</code>'), '`<aside>`');
		assert.strictEqual(convertHtmlToMarkdown('<code>&lt;details&gt;</code>'), '`<details>`');
	});

	test('preserves HTML tag names inside inline code with nested tags', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<code><span class="hl">&lt;aside&gt;</span></code>'),
			'`<aside>`'
		);
	});

	test('preserves HTML tag names inside code blocks', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<pre><code>&lt;aside&gt;</code></pre>'),
			'```\n<aside>\n```'
		);
	});

	test('converts code blocks', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<pre><code>const x = 1;</code></pre>'),
			'```\nconst x = 1;\n```'
		);
	});

	test('converts syntax-highlighted code blocks by stripping inner tags', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<pre><code><span class="kw">const</span> x = <span class="num">1</span>;</code></pre>'),
			'```\nconst x = 1;\n```'
		);
	});

	test('preserves indentation in code blocks', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<pre><code>function foo() {\n  return 1;\n}</code></pre>'),
			'```\nfunction foo() {\n  return 1;\n}\n```'
		);
	});

	test('converts unordered lists', () => {
		const html = '<ul><li>one</li><li>two</li><li>three</li></ul>';
		assert.strictEqual(convertHtmlToMarkdown(html), '- one\n- two\n- three');
	});

	test('converts ordered lists to numbered items', () => {
		const html = '<ol><li>first</li><li>second</li></ol>';
		assert.strictEqual(convertHtmlToMarkdown(html), '1. first\n2. second');
	});

	test('converts line breaks', () => {
		assert.strictEqual(convertHtmlToMarkdown('hello<br>world'), 'hello\nworld');
		assert.strictEqual(convertHtmlToMarkdown('hello<br/>world'), 'hello\nworld');
	});

	test('converts horizontal rules', () => {
		assert.strictEqual(convertHtmlToMarkdown('above<hr>below'), 'above\n---\nbelow');
	});

	test('converts strikethrough', () => {
		assert.strictEqual(convertHtmlToMarkdown('<del>removed</del>'), '~~removed~~');
		assert.strictEqual(convertHtmlToMarkdown('<s>struck</s>'), '~~struck~~');
	});

	test('converts blockquotes', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<blockquote>quoted text</blockquote>'),
			'> quoted text'
		);
	});

	test('converts images', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<img src="https://example.com/img.png" alt="photo">'),
			'![photo](https://example.com/img.png)'
		);
	});

	test('decodes HTML entities', () => {
		assert.strictEqual(convertHtmlToMarkdown('&amp; &lt; &gt; &quot; &#39;'), '& < > " \'');
	});

	test('strips unknown tags', () => {
		assert.strictEqual(convertHtmlToMarkdown('<span class="x">hello</span>'), 'hello');
	});

	test('handles nested inline elements', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<strong><em>bold italic</em></strong>'),
			'***bold italic***'
		);
	});

	test('handles link with bold text inside', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<a href="https://example.com"><strong>click here</strong></a>'),
			'[**click here**](https://example.com)'
		);
	});

	test('handles heading with link inside', () => {
		assert.strictEqual(
			convertHtmlToMarkdown('<h2><a href="https://example.com">Title</a></h2>'),
			'## [Title](https://example.com)'
		);
	});

	test('collapses excessive newlines', () => {
		const html = '<p>one</p><p></p><p></p><p>two</p>';
		const result = convertHtmlToMarkdown(html);
		assert.ok(!result.includes('\n\n\n'), 'should not have 3+ consecutive newlines');
		assert.ok(result.includes('one'));
		assert.ok(result.includes('two'));
	});

	test('handles a realistic web page snippet', () => {
		const html = `
			<h1>Getting Started</h1>
			<p>Welcome to <strong>VS Code</strong>. Visit <a href="https://code.visualstudio.com">the website</a> for more info.</p>
			<ul>
				<li>Fast</li>
				<li>Extensible</li>
			</ul>
		`;
		const md = convertHtmlToMarkdown(html);
		assert.ok(md.includes('# Getting Started'));
		assert.ok(md.includes('**VS Code**'));
		assert.ok(md.includes('[the website](https://code.visualstudio.com)'));
		assert.ok(md.includes('- Fast'));
		assert.ok(md.includes('- Extensible'));
	});

	test('decodes numeric HTML entities', () => {
		assert.strictEqual(convertHtmlToMarkdown('&#60;tag&#62;'), '<tag>');
		assert.strictEqual(convertHtmlToMarkdown('&#x3C;tag&#x3E;'), '<tag>');
		assert.strictEqual(convertHtmlToMarkdown('&#8212;'), '—');
		assert.strictEqual(convertHtmlToMarkdown('&#x2014;'), '—');
	});

	test('falls back to tag-stripping for very large input', () => {
		const large = '<b>' + 'x'.repeat(200_001) + '</b>';
		const result = convertHtmlToMarkdown(large);
		// Should strip tags but NOT apply markdown bold formatting
		assert.ok(!result.includes('**'));
		assert.ok(!result.includes('<b>'));
	});
});
