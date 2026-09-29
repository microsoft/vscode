/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { coalesceParts, LinkifiedPart, LinkifyLocationAnchor } from '../../common/linkifiedText';
import { ILinkifier, LinkifierContext } from '../../common/linkifyService';
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
});
