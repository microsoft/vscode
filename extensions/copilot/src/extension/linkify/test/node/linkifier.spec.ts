/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { coalesceParts, LinkifiedPart, LinkifyLocationAnchor } from '../../common/linkifiedText';
import { ILinkifier, LinkifierContext } from '../../common/linkifyService';
import { PromptReference } from '../../../prompt/common/conversation';
import { assertPartsEqual, createTestLinkifierService, workspaceFile } from './util';

const emptyContext: LinkifierContext = { requestId: undefined, references: [] };

suite('Stateful Linkifier', () => {

	async function runLinkifier(linkifier: ILinkifier, parts: readonly string[]): Promise<LinkifiedPart[]> {
		const out: LinkifiedPart[] = [];
		for (const part of parts) {
			out.push(...(await linkifier.append(part, CancellationToken.None)).parts);
		}

		out.push(...(await linkifier.flush(CancellationToken.None))?.parts ?? []);
		return coalesceParts(out);
	}

	test(`Should not linkify inside of markdown code blocks`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		).createLinkifier(emptyContext);

		const parts: string[] = [
			'[file.ts](file.ts)',
			'\n',
			'```',
			'\n',
			'[file.ts](file.ts)',
			'\n',
			'```',
			'\n',
			'[file.ts](file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('file.ts')),
			['\n',
				'```',
				'\n',
				'[file.ts](file.ts)', // no linkification here
				'\n',
				'```',
				'\n'
			].join(''),
			new LinkifyLocationAnchor(workspaceFile('file.ts'))
		]);
	});

	test(`Should handle link tokens`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		).createLinkifier(emptyContext);

		{
			// Tokens for `[file.ts](file.ts)`
			const parts: string[] = [
				'[file',
				'.ts',
				'](',
				'file',
				'.ts',
				')',
			];

			const result = await runLinkifier(linkifier, parts);
			assertPartsEqual(result, [
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
			]);
		}
		{
			// Another potential tokenization for `[file.ts](file.ts)`
			const parts: string[] = [
				'[',
				'file',
				'.ts',
				'](',
				'file',
				'.ts',
				')',
			];

			const result = await runLinkifier(linkifier, parts);
			assertPartsEqual(result, [
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
			]);
		}
		{
			// With leading space potential tokenization for `[file.ts](file.ts)`
			const parts: string[] = [
				' [',
				'file',
				'.ts',
				'](',
				'file',
				'.ts',
				')',
			];

			const result = await runLinkifier(linkifier, parts);
			assertPartsEqual(result, [
				' ',
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
			]);
		}
	});

	test(`Should handle inline code with spaces`, async () => {
		const linkText = 'LINK';

		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		).createLinkifier(emptyContext, [
			{
				create: () => ({
					async linkify(newText) {
						if (/\s*`[^`]+`\s*/.test(newText)) {
							return { parts: [linkText] };
						}
						return;
					},
				})
			}
		]);

		const parts: string[] = [
			'`code ',
			' more`',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			linkText
		]);
	});

	test(`Should not linkify inside of markdown fenced code block containing fenced code blocks (#5708)`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
		).createLinkifier(emptyContext);

		const parts: string[] = [
			'[file.ts](file.ts)',
			'\n',
			'```md',
			'\n',
			'[file.ts](file.ts)',
			'\n',
			'\t```ts',
			'\n',
			`\t1 + 1`,
			'\n',
			'\t[file.ts](file.ts)',
			'\n',
			'\t```',
			'\n',
			'[file.ts](file.ts)',
			'\n',
			'```',
			'\n',
			'[file.ts](file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('file.ts')),
			[
				'\n',
				'```md',
				'\n',
				'[file.ts](file.ts)', // No linkification
				'\n',
				'\t```ts',
				'\n',
				`\t1 + 1`,
				'\n',
				'\t[file.ts](file.ts)', // No linkification
				'\n',
				'\t```',
				'\n',
				'[file.ts](file.ts)', // No linkification
				'\n',
				'```',
				'\n',
			].join(''),
			new LinkifyLocationAnchor(workspaceFile('file.ts'))
		]);
	});

	test(`Should not linkify inside tilde markdown code blocks`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
		).createLinkifier(emptyContext);

		const parts: string[] = [
			'[file.ts](file.ts)',
			'\n',
			'~~~',
			'\n',
			'[file.ts](file.ts)',
			'\n',
			'~~~',
			'\n',
			'[file.ts](file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('file.ts')),
			[
				'\n',
				'~~~',
				'\n',
				'[file.ts](file.ts)', // no linkification here
				'\n',
				'~~~',
				'\n',
			].join(''),
			new LinkifyLocationAnchor(workspaceFile('file.ts'))
		]);
	});

	test(`Should correctly handle fenced code blocks split over multiple parts`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
		).createLinkifier(emptyContext);

		const parts: string[] = [
			'[file.ts](file.ts)',
			'\n',
			'```ts',
			'\n',
			'[file.ts](file.ts)',
			'\n``', // Split ending backtick
			'`',
			'\n',
			'[file.ts](file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('file.ts')),
			[
				'\n',
				'```ts',
				'\n',
				'[file.ts](file.ts)', // no linkification here
				'\n',
				'```',
				'\n',
			].join(''),
			new LinkifyLocationAnchor(workspaceFile('file.ts'))
		]);
	});

	test(`Should correctly handle fenced code blocks when opening fence is split`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
		).createLinkifier(emptyContext);

		const parts: string[] = [
			'[file.ts](file.ts)',
			'\n',
			'``', // Split opening backticks
			'`ts',
			'\n',
			'[file.ts](file.ts)',
			'\n``', // Split ending backtick
			'`',
			'\n',
			'[file.ts](file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('file.ts')),
			[
				'\n',
				'```ts',
				'\n',
				'[file.ts](file.ts)', // no linkification here
				'\n',
				'```',
				'\n',
			].join(''),
			new LinkifyLocationAnchor(workspaceFile('file.ts'))
		]);
	});

	test(`Should de-linkify links without schemes`, async () => {
		const linkifier = createTestLinkifierService().createLinkifier(emptyContext);

		const parts: string[] = [
			'[text](file.ts) [`text`](/file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			'text `text`'
		]);
	});

	test(`Should de-linkify Windows absolute paths with drive letters`, async () => {
		const linkifier = createTestLinkifierService().createLinkifier(emptyContext);

		const parts: string[] = [
			'[text](c:\\src\\file.ts)',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			'text'
		]);
	});

	test(`Should not unlinkify text inside of code blocks`, async () => {
		const linkifier = createTestLinkifierService().createLinkifier(emptyContext);

		const parts: string[] = [
			'```md\n',
			`[g](x)\n`,
			'```',
		];

		const result = await runLinkifier(linkifier, parts);
		assertPartsEqual(result, [
			[
				'```md\n',
				`[g](x)\n`,
				'```'
			].join('')
		]);
	});

	test(`Should not unlikify text inside of inline code`, async () => {
		{
			const linkifier = createTestLinkifierService().createLinkifier(emptyContext);
			const result = await runLinkifier(linkifier, [
				'a `J[g](x)` b',
			]);
			assertPartsEqual(result, [
				'a `J[g](x)` b'
			]);
		}
		{
			const linkifier = createTestLinkifierService().createLinkifier(emptyContext);
			const result = await runLinkifier(linkifier, [
				'a `b [c](d) e` f',
			]);
			assertPartsEqual(result, [
				'a `b [c](d) e` f'
			]);
		}
	});

	test(`Should not unlikify text inside of math blocks code`, async () => {
		{
			const linkifier = createTestLinkifierService(
				'file1.ts',
				'file2.ts',
			).createLinkifier(emptyContext);

			const result = await runLinkifier(linkifier, [
				'[file1.ts](file1.ts)\n',
				'$$\n',
				`J[g](x)\n`,
				'$$\n',
				'[file2.ts](file2.ts)'
			]);
			assertPartsEqual(result, [
				new LinkifyLocationAnchor(workspaceFile('file1.ts')),
				[
					'',
					'$$',
					'J[g](x)',
					'$$',
					'',
				].join('\n'),
				new LinkifyLocationAnchor(workspaceFile('file2.ts')),
			]);
		}
	});

	test(`Should not touch code inside of inline math equations`, async () => {
		{
			const linkifier = createTestLinkifierService().createLinkifier(emptyContext);

			const result = await runLinkifier(linkifier, [
				'a $J[g](x)$ b',
			]);
			assertPartsEqual(result, [
				'a $J[g](x)$ b'
			]);
		}
		{
			const linkifier = createTestLinkifierService().createLinkifier(emptyContext);

			const result = await runLinkifier(linkifier, [
				'a $c [g](x) d$ x',
			]);
			assertPartsEqual(result, [
				'a $c [g](x) d$ x',
			]);
		}
	});

	test(`Should not linkify multi-token inline code with non-existent paths`, async () => {
		// Inline code like `./scripts/test.sh src/vs/...` should be treated as one path
		// and not linkified when the whole path doesn't exist
		const linkifier = createTestLinkifierService(
			'scripts/test.sh',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`./scripts/test.sh src/vs/editor/test/common/model.test.ts src/vs/editor/test/common/range.test.ts`',
		]);
		assertPartsEqual(result, [
			'`./scripts/test.sh src/vs/editor/test/common/model.test.ts src/vs/editor/test/common/range.test.ts`',
		]);
	});

	test(`Should linkify inline code when the whole path exists`, async () => {
		const linkifier = createTestLinkifierService(
			'src/vs/editor/test/common/model.test.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`src/vs/editor/test/common/model.test.ts`',
		]);
		assertPartsEqual(result, [
			new LinkifyLocationAnchor(workspaceFile('src/vs/editor/test/common/model.test.ts')),
		]);
	});

	test(`Should handle multi-token inline code split across parts`, async () => {
		// Simulate streaming where inline code is split across multiple append calls
		const linkifier = createTestLinkifierService(
			'scripts/test.sh',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`./scripts/test.sh ',
			'src/vs/editor/test/common/model.test.ts ',
			'src/vs/editor/test/common/range.test.ts`',
		]);
		assertPartsEqual(result, [
			'`./scripts/test.sh src/vs/editor/test/common/model.test.ts src/vs/editor/test/common/range.test.ts`',
		]);
	});

	test(`Should not linkify plain text paths after inline code block`, async () => {
		// Ensure that paths after inline code are still linkified normally
		const linkifier = createTestLinkifierService(
			'scripts/test.sh',
			'src/file.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`./scripts/test.sh src/vs/editor/test/common/model.test.ts` ',
			'src/file.ts',
		]);
		assertPartsEqual(result, [
			'`./scripts/test.sh src/vs/editor/test/common/model.test.ts` ',
			new LinkifyLocationAnchor(workspaceFile('src/file.ts')),
		]);
	});

	test(`Should not linkify inline code with space-containing path that exists in workspace`, async () => {
		// Multi-token inline code preserves backticks in the accumulated text.
		// resolvePathText receives the text with backtick characters, which won't
		// match any real file, so it remains unchanged.
		const linkifier = createTestLinkifierService(
			'space file.ts',
			'sub space/space file.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`space file.ts`',
		]);
		assertPartsEqual(result, [
			'`space file.ts`',
		]);
	});

	test(`Should not linkify inline code with space-containing directory path`, async () => {
		const linkifier = createTestLinkifierService(
			'sub space/space file.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`sub space/space file.ts`',
		]);
		assertPartsEqual(result, [
			'`sub space/space file.ts`',
		]);
	});

	test(`Should not linkify inline code with space-containing path split across stream parts`, async () => {
		const linkifier = createTestLinkifierService(
			'space file.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`space ',
			'file.ts`',
		]);
		assertPartsEqual(result, [
			'`space file.ts`',
		]);
	});

	test(`Should not linkify words inside inline code even if a word matches a workspace file`, async () => {
		// `cancels mid-stream` should not linkify `stream` even though stream.ts exists
		const linkifier = createTestLinkifierService(
			'stream.ts',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`cancels mid-stream`',
		]);
		assertPartsEqual(result, [
			'`cancels mid-stream`',
		]);
	});

	test(`Should not linkify words inside inline code even if a word matches a reference`, async () => {
		// `cancels mid-stream` should not linkify `stream` even though
		// stream.ts is in the conversation references
		const references = [new PromptReference(workspaceFile('stream.ts'))];
		const context: LinkifierContext = { requestId: undefined, references };
		const linkifier = createTestLinkifierService(
			'stream.ts',
		).createLinkifier(context);

		const result = await runLinkifier(linkifier, [
			'`cancels mid-stream`',
		]);
		assertPartsEqual(result, [
			'`cancels mid-stream`',
		]);
	});

	test(`Should not linkify command inline code even if a path arg exists in workspace`, async () => {
		// `node ./node_modules/playwright-core/cli.js install-deps` should not linkify
		// `./node_modules/playwright-core/cli.js` even though that file exists
		const linkifier = createTestLinkifierService(
			'node_modules/playwright-core/cli.js',
		).createLinkifier(emptyContext);

		const result = await runLinkifier(linkifier, [
			'`node ./node_modules/playwright-core/cli.js install-deps`',
		]);
		assertPartsEqual(result, [
			'`node ./node_modules/playwright-core/cli.js install-deps`',
		]);
	});
});
