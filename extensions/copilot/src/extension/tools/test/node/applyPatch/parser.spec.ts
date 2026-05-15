/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { expect, it, suite } from 'vitest';
import { StringTextDocumentWithLanguageId } from '../../../../../platform/editing/common/abstractText';
import { findLast } from '../../../../../util/vs/base/common/arraysFind';
import { URI } from '../../../../../util/vs/base/common/uri';
import { patch_to_commit, replace_explicit_tabs, text_to_patch } from '../../../node/applyPatch/parser';

suite('applyPatch parser', () => {
	it('replace_explicit_tabs', () => {
		expect(replace_explicit_tabs('')).toBe('');
		expect(replace_explicit_tabs('foo')).toBe('foo');
		expect(replace_explicit_tabs('\\tfoo')).toBe('\tfoo');
		expect(replace_explicit_tabs('  \\tfoo')).toBe('  \tfoo');
		expect(replace_explicit_tabs('\\t\\tfoo')).toBe('\t\tfoo');
		expect(replace_explicit_tabs('\\tfoo\\tbar')).toBe('\tfoo\\tbar');
		expect(replace_explicit_tabs('  \\t\\tfoo')).toBe('  \t\tfoo');
		expect(replace_explicit_tabs('#\\tfoo')).toBe('#\tfoo');
		expect(replace_explicit_tabs('////\\tfoo')).toBe('////\tfoo');
		expect(replace_explicit_tabs('  #////\\tfoo')).toBe('  #////\tfoo');
		expect(replace_explicit_tabs('\\tfoo\n\\tbar')).toBe('\tfoo\n\tbar');
		expect(replace_explicit_tabs('  \\tfoo\n  \\tbar')).toBe('  \tfoo\n  \tbar');
		expect(replace_explicit_tabs('\\t\\tfoo\n  #\\tbar')).toBe('\t\tfoo\n  #\tbar');
		expect(replace_explicit_tabs('\\t\\tfoo\n\\tbar\n#\\tbaz')).toBe('\t\tfoo\n\tbar\n#\tbaz');
	});

	it('fixes an issue', () => {
		const input = `*** Begin Patch\n*** Update File: /path/to/file.ts\n@@section1\n-[old code1]\n+[new code1}\n@@section2\n-[old code2]\n+[new code2}\n*** End Patch`;

		expect(text_to_patch(input, {
			'/path/to/file.ts': new StringTextDocumentWithLanguageId('section1\n[old code1]\nsection2\n[old code2]', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "/path/to/file.ts": {
			        "chunks": [
			          {
			            "delLines": [
			              "[old code1]",
			            ],
			            "insLines": [
			              "[new code1}",
			            ],
			            "origIndex": 1,
			          },
			          {
			            "delLines": [
			              "[old code2]",
			            ],
			            "insLines": [
			              "[new code2}",
			            ],
			            "origIndex": 3,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  0,
			]
		`);
	});

	it('tolerates out-of-order patch sections', () => {
		const input = `*** Begin Patch\n*** Update File: a.txt\n@@\n-world\n+world hello\n@@\n-hello\n+hello world\n*** End Patch`;

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld', 'text/plain')
		})).toMatchObject([
			{
				actions: {
					'a.txt': {
						chunks: [
							{
								delLines: ['world'],
								insLines: ['world hello'],
								origIndex: 1,
							},
							{
								delLines: ['hello'],
								insLines: ['hello world'],
								origIndex: 0,
							},
						],
						type: 'update',
					}
				}
			},
			0
		]);
	});

	it('does not tolerate edit distance below threshold', () => {
		const input = [
			'*** Begin Patch',
			'*** Update File: a.txt',
			'@@',
			'-world!',
			'+everyone',
			'*** End Patch'
		].join('\n');
		expect(() => text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld', 'text/plain')
		})).toThrowErrorMatchingInlineSnapshot(`
			[Error: Invalid context at character 0:
			world!]
		`);
	});

	it('tolerates edit distance above threshold', () => {
		const input = [
			'*** Begin Patch',
			'*** Update File: a.txt',
			'@@',
			'-world!',
			'-lots',
			'-more',
			'-context',
			'+everyone',
			'*** End Patch'
		].join('\n');
		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld\nlots\nmore\ncontext\nhere\n', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "a.txt": {
			        "chunks": [
			          {
			            "delLines": [
			              "world!",
			              "lots",
			              "more",
			              "context",
			            ],
			            "insLines": [
			              "everyone",
			            ],
			            "origIndex": 1,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  26,
			]
		`);
	});

	it('tolerates missing patch end', () => {
		const input = `*** Begin Patch\n*** Update File: a.txt\n@@\n-world\n+world hello\n@@\n-hello\n+hello world`;

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld', 'text/plain')
		})).toMatchObject([
			{
				actions: {
					'a.txt': {
						chunks: [
							{
								delLines: ['world'],
								insLines: ['world hello'],
								origIndex: 1,
							},
							{
								delLines: ['hello'],
								insLines: ['hello world'],
								origIndex: 0,
							},
						],
						type: 'update',
					}
				}
			},
			0
		]);
	});

	it('tolerates missing hunk line addition', () => {
		// We observe that sometimes 4.1 omits the operation for outdented lines.
		// We attempt to fix this automatica,,y
		const input = [
			'*** Begin Patch',
			'*** Update File: a.txt',
			'@@',
			'-world',
			'+',
			'def greet():',
			'+  print("Hello, world!")',
			'*** End Patch'
		].join('\n');

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "a.txt": {
			        "chunks": [
			          {
			            "delLines": [
			              "world",
			            ],
			            "insLines": [
			              "",
			              "def greet():",
			              "	print("Hello, world!")",
			            ],
			            "origIndex": 1,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  64,
			]
		`);
	});

	it('tolerate to extra whitespace in delimited sections', () => {
		const input = `*** Begin Patch\n*** Update File: a.txt\n@@\n-world\n+world hello\n\n@@\n-hello\n+hello world\n*** End Patch`;

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello\nworld', 'text/plain')
		})).toMatchObject([
			{
				actions: {
					'a.txt': {
						chunks: [
							{
								delLines: ['world'],
								insLines: ['world hello'],
								origIndex: 1,
							},
							{
								delLines: ['hello'],
								insLines: ['hello world'],
								origIndex: 0,
							},
						],
						type: 'update',
					}
				}
			},
			0
		]);
	});

	it('matches explicit \\t tab chars', () => {
		// 4.1 likes to explicitly put tabs as `\\t` in its patches
		const input = `*** Begin Patch\n*** Update File: a.txt\n@@\n-\\t\\tworld\n+\\t\\tworld hello\n*** End Patch`;

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('\t\thello\n\t\tworld', 'text/plain')
		})).toMatchObject([
			{
				actions: {
					'a.txt': {
						chunks: [
							{
								delLines: ['\t\tworld'],
								insLines: ['\t\tworld hello'],
								origIndex: 1,
							}
						],
						type: 'update',
					}
				}
			},
			6
		]);
	});

	it('preserves tab chars in tex files', () => {
		const input = [
			'*** Begin Patch',
			'*** Update File: a.tex',
			'@@',
			'hello',
			'-\tworld',
			'+\t\\textbf{world}',
			'*** End Patch'
		].join('\n');

		expect(text_to_patch(input, {
			'a.tex': new StringTextDocumentWithLanguageId('prefix\nhello\n\tworld\nwoo\nsuffix', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "a.tex": {
			        "chunks": [
			          {
			            "delLines": [
			              "	world",
			            ],
			            "insLines": [
			              "	\\textbf{world}",
			            ],
			            "origIndex": 2,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  0,
			]
		`);
	});

	it('matches explicit \\n and \\t tab chars', () => {
		const input = [
			'*** Begin Patch',
			'*** Update File: a.txt',
			'@@',
			'-hello\\n\\tworld\\nwoo',
			'+hello\\n\\tcode!\\nwoo',
			'*** End Patch'
		].join('\n');

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('prefix\nhello\n\tworld\nwoo\nsuffix', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "a.txt": {
			        "chunks": [
			          {
			            "delLines": [
			              "hello
				world
			woo",
			            ],
			            "insLines": [
			              "hello
				code!
			woo",
			            ],
			            "origIndex": 1,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  134,
			]
		`);
	});

	it('always normalizes explicit \\t tab chars in replacement', () => {
		// 4.1 likes to explicitly put tabs as `\\t` in its patches
		const input = `*** Begin Patch\n*** Update File: a.txt\n@@\n-hello\n+\\t\\tworld\n*** End Patch`;

		expect(text_to_patch(input, {
			'a.txt': new StringTextDocumentWithLanguageId('hello', 'text/plain')
		})).toMatchInlineSnapshot(`
			[
			  {
			    "actions": {
			      "a.txt": {
			        "chunks": [
			          {
			            "delLines": [
			              "hello",
			            ],
			            "insLines": [
			              "		world",
			            ],
			            "origIndex": 0,
			          },
			        ],
			        "movePath": undefined,
			        "type": "update",
			      },
			    },
			  },
			  0,
			]
		`);
	});

	it('issue#262549', async () => {
		const input = await fs.readFile(`${__dirname}/corpus/262549-input.txt`, 'utf-8');
		const patchFmt = await fs.readFile(`${__dirname}/corpus/262549-call.txt`, 'utf-8');
		const patch = JSON.parse('"' + patchFmt.replaceAll('\n', '\\n').replaceAll('\t', '\\t') + '"');

		const docs = {
			'/Users/omitted/projects/flagship/edge-ai/scripts/Fix-VisuallySimilarUnicode.ps1': new StringTextDocumentWithLanguageId(input, 'text/plain')
		};
		const [parsed] = text_to_patch(patch, docs);
		const commit = patch_to_commit(parsed, docs);
		await expect(Object.values(commit.changes).at(0)?.newContent).toMatchFileSnapshot(`${__dirname}/corpus/262549-output.txt`);
	});

	it('reindents unindented code', async () => {
		const input = await fs.readFile(`${__dirname}/corpus/reindent-input.txt`, 'utf-8');
		const patch = await fs.readFile(`${__dirname}/corpus/reindent-call.txt`, 'utf-8');

		const docs = {
			'/Users/connor/Downloads/hello.yml': new StringTextDocumentWithLanguageId(input, 'text/plain')
		};
		const [parsed] = text_to_patch(patch, docs);
		const commit = patch_to_commit(parsed, docs);
		expect(Object.values(commit.changes).at(0)?.newContent).toMatchInlineSnapshot(`
			"- hello
			- world
			- list:
			    - item1
			    - item2
			    - item3
			    - item1a
			    - item2a
			    - item3a
			    - item1b
			    - item20b
			      - nested3
			      - nested2
			    - item3b
			    - item1c
			    - item2c
			    - item3c
			    - item1d
			    - item2d
			    - item3d
			"
		`);
	});

	it('issue#267547', async () => {
		const input = await fs.readFile(`${__dirname}/corpus/267547-input.txt`, 'utf-8');
		let patchFmt = await fs.readFile(`${__dirname}/corpus/267547-call.txt`, 'utf-8');
		patchFmt = patchFmt.replaceAll('\r\n', '\n');
		const expectedOutput = await fs.readFile(`${__dirname}/corpus/267547-output.txt`, 'utf-8');

		const docs = {
			'267547.txt': new StringTextDocumentWithLanguageId(input.replaceAll('\r\n', '\n'), 'text/plain')
		};
		const [parsed] = text_to_patch(patchFmt, docs);
		const commit = patch_to_commit(parsed, docs);
		const actualOutput = Object.values(commit.changes).at(0)?.newContent;

		// Normalize line endings for consistent comparison
		expect(actualOutput?.replaceAll('\r\n', '\n')).toBe(expectedOutput.replaceAll('\r\n', '\n'));
	});

	it('indent when multiple sections are updated', async () => {
		const input = await fs.readFile(`${__dirname}/corpus/multipleSections-input.txt`, 'utf-8');
		let patchFmt = await fs.readFile(`${__dirname}/corpus/multipleSections-call.txt`, 'utf-8');
		patchFmt = patchFmt.replaceAll('\r\n', '\n');
		const expectedOutput = await fs.readFile(`${__dirname}/corpus/multipleSections-output.txt`, 'utf-8');

		const docs = {
			'multipleSections.txt': new StringTextDocumentWithLanguageId(input.replaceAll('\r\n', '\n'), 'text/plain')
		};
		const [parsed] = text_to_patch(patchFmt, docs);
		const commit = patch_to_commit(parsed, docs);
		const actualOutput = Object.values(commit.changes).at(0)?.newContent;

		// Normalize line endings for consistent comparison
		expect(actualOutput?.replaceAll('\r\n', '\n')).toBe(expectedOutput.replaceAll('\r\n', '\n'));
	});

	it('multiple indented lines update', async () => {
		const input = await fs.readFile(`${__dirname}/corpus/multipleIndentedLines-input.txt`, 'utf-8');
		let patchFmt = await fs.readFile(`${__dirname}/corpus/multipleIndentedLines-call.txt`, 'utf-8');
		patchFmt = patchFmt.replaceAll('\r\n', '\n');
		const expectedOutput = await fs.readFile(`${__dirname}/corpus/multipleIndentedLines-output.txt`, 'utf-8');

		const docs = {
			'multipleIndentedLines.txt': new StringTextDocumentWithLanguageId(input.replaceAll('\r\n', '\n'), 'text/plain')
		};
		const [parsed] = text_to_patch(patchFmt, docs);
		const commit = patch_to_commit(parsed, docs);
		const actualOutput = Object.values(commit.changes).at(0)?.newContent;

		// Normalize line endings for consistent comparison
		expect(actualOutput?.replaceAll('\r\n', '\n')).toBe(expectedOutput.replaceAll('\r\n', '\n'));
	});

	suite('corpus', () => {
		const corpusPath = path.join(__dirname, 'corpus');
		it('applies corpus', async () => {
			const patches = (await fs.readdir(corpusPath)).filter(f => f.endsWith('.patch')).sort();
			for (const patchFile of patches) {
				const patchContent = await fs.readFile(path.join(corpusPath, patchFile), 'utf8');
				const { patch, original, expected, fpath, docs } = JSON.parse(patchContent);

				const inputDocs: Record<string, StringTextDocumentWithLanguageId> = {};
				if (original && fpath) {
					inputDocs[fpath] = new StringTextDocumentWithLanguageId(original, 'text/plain');
				} else {
					for (const [uri, text] of Object.entries(docs)) {
						inputDocs[URI.parse(uri).path] = new StringTextDocumentWithLanguageId(text as string, 'text/plain');
					}
				}
				try {
					const [parsed] = text_to_patch(patch, inputDocs);
					if (expected !== undefined) {
						const commit = patch_to_commit(parsed, inputDocs);
						expect(commit.changes[fpath].newContent).toEqual(expected);
					}
				} catch (e) {
					console.error(`Failed to apply patch from ${patchFile} (${e}):\n`, patch);
					const originalsPath = path.join(os.tmpdir(), patchFile);
					await fs.writeFile(originalsPath, Object.entries(inputDocs).map(([uri, doc]) => `// ${uri}\n${doc.getText()}`).join('\n\n'));
					console.error(`\nOriginals written to ${originalsPath}`);
					throw e;
				}
			}
		});

		// Unskip to generate a corpus of randomized patches for files in a sibling vscode repo
		it.skip('generate randomized corpus', async () => {
			const filesSampled = 50;
			const maxEditsPerFile = 3;
			const contextLines = 3;

			const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
			const src = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'vscode', 'src');
			const allFiles = [];
			for await (const file of fs.glob('**/*.ts', { cwd: src })) {
				allFiles.push(path.join(src, file));
			}

			await fs.mkdir(corpusPath, { recursive: true });

			let caseNo = 0;

			for (let i = 0; i < filesSampled; i++) {
				const file = allFiles[random(0, allFiles.length - 1)];
				const content = await fs.readFile(file, 'utf8');
				const lines = content.split('\n');
				if (lines.length < 10) {
					i--;
					continue; // Skip files that are too short
				}

				const fpath = '/' + path.relative(src, file).replaceAll('\\', '/');
				const patch = [
					'*** Begin Patch',
					`*** Update File: ${fpath}`,
					'@@',
				];

				const linesToModify: number[] = [];
				for (let i = random(1, maxEditsPerFile); linesToModify.length < i;) {
					const r = random(0, lines.length - 1);
					if (!linesToModify.includes(r)) {
						linesToModify.push(r);
					}
				}
				linesToModify.sort((a, b) => a - b);

				const modified: string[] = [];
				let wasEmittingContext = false;
				for (let ln = 0; ln < lines.length; ln++) {
					const nextToModify = linesToModify.find(l => l > ln);
					const prevModified = findLast(linesToModify, l => l <= ln);
					const emitContext =
						(nextToModify !== undefined && nextToModify - ln < contextLines) ||
						(prevModified !== undefined && ln - prevModified < contextLines);

					if (emitContext && !wasEmittingContext) {
						if (ln > 0) {
							patch.push('');
						}
						const currentIndent = lines[ln].match(/^\s*/)?.[0];
						const contextLine = currentIndent && findLast(lines, i => !i.startsWith(currentIndent), ln - 1);
						if (contextLine) {
							patch.push(`@@ ${contextLine.trim()}`);
						} else {
							patch.push('@@');
						}
					}
					wasEmittingContext = emitContext;

					if (prevModified === ln) {
						switch (random(0, 2)) {
							case 0: {//insert
								const insertText = `// Inserted line ${ln}`;
								modified.push(insertText, lines[ln]);
								patch.push(`+${insertText}`, lines[ln]);
								break;
							}
							case 1: {//delete
								patch.push(`-${lines[ln]}`);
								break;
							}
							case 2: {//replace
								const newText = `// Replaced line ${ln}`;
								patch.push(`-${lines[ln]}`);
								patch.push(`+${newText}`);
								modified.push(newText);
							}
						}
					} else {
						modified.push(lines[ln]);
						if (emitContext) {
							patch.push(`${lines[ln]}`);
						}
					}

				}

				patch.push('*** End Patch');

				await fs.writeFile(
					path.join(__dirname, 'corpus', `${caseNo++}.patch`),
					JSON.stringify({ patch: patch.join('\n'), original: content, expected: modified.join('\n'), fpath }, null, 2)
				);
			}
		});
	});
});
