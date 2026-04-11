/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'vitest';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { PromptReference } from '../../../prompt/common/conversation';
import { LinkifyLocationAnchor } from '../../common/linkifiedText';
import { assertPartsEqual, createTestLinkifierService, linkify, workspaceFile } from './util';


suite('File Path Linkifier', () => {

	test(`Should create file links from Markdown links`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts'
		);

		assertPartsEqual(
			(await linkify(linkifier,
				'[file.ts](file.ts) [src/file.ts](src/file.ts)',
			)).parts,
			[
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				` `,
				new LinkifyLocationAnchor(workspaceFile('src/file.ts'))
			],
		);

		assertPartsEqual(
			(await linkify(linkifier,
				'[`file.ts`](file.ts) [`src/file.ts`](src/file.ts)',
			)).parts,
			[
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				` `,
				new LinkifyLocationAnchor(workspaceFile('src/file.ts'))
			]
		);
	});

	test(`Should create links for directories`, async () => {
		{
			const linkifier = createTestLinkifierService(
				'dir/'
			);
			assertPartsEqual(
				(await linkify(linkifier,
					'[dir](dir) [dir/](dir/)',
				)).parts,
				[
					new LinkifyLocationAnchor(workspaceFile('dir')),
					` `,
					new LinkifyLocationAnchor(workspaceFile('dir/'))
				]
			);
		}
		{
			const linkifier = createTestLinkifierService(
				'dir1/dir2/'
			);
			assertPartsEqual(
				(await linkify(linkifier,
					'[dir1/dir2](dir1/dir2) [dir1/dir2/](dir1/dir2/)',
				)).parts,
				[
					new LinkifyLocationAnchor(workspaceFile('dir1/dir2')),
					` `,
					new LinkifyLocationAnchor(workspaceFile('dir1/dir2/'))
				]
			);
		}
	});

	test(`Should create file links for file paths as inline code`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);
		assertPartsEqual(
			(await linkify(linkifier,
				'`file.ts` `src/file.ts`',
			)).parts,
			[
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				` `,
				new LinkifyLocationAnchor(workspaceFile('src/file.ts'))
			]
		);
	});

	test(`Should create file paths printed as plain text `, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);
		assertPartsEqual(
			(await linkify(linkifier,
				'file.ts src/file.ts'
			)).parts,
			[
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				` `,
				new LinkifyLocationAnchor(workspaceFile('src/file.ts'))
			]
		);
	});

	test(`Should de-linkify files that don't exist`, async () => {
		const linkifier = createTestLinkifierService();
		assertPartsEqual(
			(await linkify(linkifier,
				'[noSuchFile.ts](noSuchFile.ts) [src/noSuchFile.ts](src/noSuchFile.ts)',
			)).parts,
			[
				'noSuchFile.ts src/noSuchFile.ts'
			],
		);
	});

	test(`Should de-linkify bare file links that haven't been transformed`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts',
		);
		assertPartsEqual(
			(await linkify(linkifier,
				'[text](file.ts) [`symbol` foo](src/file.ts)'
			)).parts,
			[
				'text `symbol` foo',
			]
		);
	});

	test(`Should not create links for https links`, async () => {
		const linkifier = createTestLinkifierService();
		assertPartsEqual(
			(await linkify(linkifier,
				'[http://example.com](http://example.com)',
			)).parts,
			[
				'[http://example.com](http://example.com)',
			],
		);
	});

	test(`Should handle file paths with spaces in the name`, async () => {
		const linkifier = createTestLinkifierService(
			`space file.ts`,
			'sub space/space file.ts',
		);

		const result = await linkify(linkifier, [
			'[space file.ts](space%20file.ts)',
			'[sub space/space file.ts](sub%20space/space%20file.ts)',
			'[no such file.ts](no%20such%20file.ts)',
			'[also not.ts](no%20such%20file.ts)',
		].join('\n')
		);
		assertPartsEqual(
			result.parts,
			[
				new LinkifyLocationAnchor(workspaceFile('space file.ts')),
				`\n`,
				new LinkifyLocationAnchor(workspaceFile('sub space/space file.ts')),
				'\nno such file.ts\nalso not.ts',
			]
		);
	});

	test(`Should handle posix style absolute paths`, async () => {
		const isFile = URI.file(isWindows ? 'c:\\foo\\isfile.ts' : '/foo/isfile.ts');
		const noFile = URI.file(isWindows ? 'c:\\foo\\nofile.ts' : '/foo/nofile.ts');
		const linkifier = createTestLinkifierService(
			isFile
		);

		assertPartsEqual(
			(await linkify(linkifier, [
				`\`${isFile.fsPath}\``,
				`\`${noFile.fsPath}\``,
			].join('\n')
			)).parts,
			[
				new LinkifyLocationAnchor(isFile),
				`\n\`${noFile.fsPath}\``,
			]
		);
	});

	test(`Should not linkify some common ambagious short paths`, async () => {
		const linkifier = createTestLinkifierService();
		assertPartsEqual(
			(await linkify(linkifier, [
				'- `.`',
				'- `..`',
				'- `/.`',
				'- `\\.`',
				'- `/..`',
				'- `\\..`',
				'- `/`',
				'- `\\`',
				'- `/`',
				'- `//`',
				'- `///`',
			].join('\n')
			)).parts,
			[
				[
					'- `.`',
					'- `..`',
					'- `/.`',
					'- `\\.`',
					'- `/..`',
					'- `\\..`',
					'- `/`',
					'- `\\`',
					'- `/`',
					'- `//`',
					'- `///`',
				].join('\n')
			]
		);
	});

	test(`Should find file links in bold elements`, async () => {
		const linkifier = createTestLinkifierService(
			'file.ts',
			'src/file.ts'
		);

		assertPartsEqual(
			(await linkify(linkifier,
				'**file.ts**',
			)).parts,
			[
				`**`,
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				`**`,
			],
		);

		assertPartsEqual(
			(await linkify(linkifier,
				'**`file.ts`**',
			)).parts,
			[
				`**`,
				new LinkifyLocationAnchor(workspaceFile('file.ts')),
				`**`,
			],
		);
	});

	test(`Should NOT use reference fallback for paths with directory components`, async () => {
		// When text has a path like ./node_modules/playwright/cli.js, we should NOT
		// match it to a reference just because the basename (cli.js) matches.
		// This prevents linking to wrong files when the model mentions paths that don't exist.
		const linkifier = createTestLinkifierService();
		const references = [new PromptReference(URI.file('/workspace/src/cli.js'))];

		// Path with directories should NOT link to reference with matching basename
		const result = await linkify(linkifier,
			'./node_modules/playwright/cli.js',
			references
		);
		assertPartsEqual(result.parts, [
			'./node_modules/playwright/cli.js'  // Should remain as plain text
		]);
	});

	test(`Should use reference fallback for simple filenames`, async () => {
		// Simple filenames without directory components CAN use reference fallback
		const linkifier = createTestLinkifierService();
		const refUri = URI.file('/workspace/src/cli.js');
		const references = [new PromptReference(refUri)];

		// Simple filename should link to reference with matching basename
		const result = await linkify(linkifier,
			'cli.js',
			references
		);
		assertPartsEqual(result.parts, [
			new LinkifyLocationAnchor(refUri)
		]);
	});

	test(`Should NOT use reference fallback for text with code-like characters`, async () => {
		// Text containing $, {, }, (, ) are likely code snippets, not filenames
		const linkifier = createTestLinkifierService();
		const refUri = URI.file('/workspace/src/config.js');
		const references = [new PromptReference(refUri)];

		// Code-like text should NOT link to reference even if basename matches
		const result = await linkify(linkifier,
			'config.${TerminalSettingId',
			references
		);
		assertPartsEqual(result.parts, [
			'config.${TerminalSettingId'  // Should remain as plain text
		]);
	});
});
