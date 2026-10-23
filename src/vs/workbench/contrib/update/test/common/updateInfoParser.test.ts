/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseUpdateInfoInput } from '../../common/updateInfoParser.js';

suite('updateInfoParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseUpdateInfoInput', () => {

		test('plain markdown returns as-is with no buttons', () => {
			assert.deepStrictEqual(parseUpdateInfoInput('Hello **world**'), {
				markdown: 'Hello **world**',
			});
		});

		test('strips BOM prefix', () => {
			assert.deepStrictEqual(parseUpdateInfoInput('\uFEFFHello'), {
				markdown: 'Hello',
			});
		});

		test('JSON envelope with markdown and buttons', () => {
			const input = JSON.stringify({
				markdown: '$(info) New feature',
				buttons: [
					{ label: 'Release Notes', commandId: 'cmd.releaseNotes', style: 'secondary' },
					{ label: 'Try It', commandId: 'cmd.tryIt', style: 'primary', args: ['arg1'] },
				],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: '$(info) New feature',
				buttons: [
					{ label: 'Release Notes', commandId: 'cmd.releaseNotes', style: 'secondary', args: undefined },
					{ label: 'Try It', commandId: 'cmd.tryIt', style: 'primary', args: ['arg1'] },
				],
			});
		});

		test('JSON envelope without buttons', () => {
			const input = JSON.stringify({ markdown: 'Just text' });
			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'Just text',
				buttons: undefined,
			});
		});

		test('JSON envelope with invalid JSON falls back to plain markdown', () => {
			const input = '{ broken json';
			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: '{ broken json',
			});
		});

		test('JSON envelope without markdown property falls back to plain markdown', () => {
			const input = JSON.stringify({ buttons: [{ label: 'X', commandId: 'y' }] });
			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: input,
			});
		});

		test('block frontmatter with buttons', () => {
			const buttons = [{ label: 'Open', commandId: 'cmd.open' }];
			const input = `---\n${JSON.stringify({ buttons })}\n---\nBody text`;

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'Body text',
				buttons: [{ label: 'Open', commandId: 'cmd.open', style: undefined, args: undefined }],
			});
		});

		test('block frontmatter with no body', () => {
			const buttons = [{ label: 'Open', commandId: 'cmd.open' }];
			const input = `---\n${JSON.stringify({ buttons })}\n---`;

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: '',
				buttons: [{ label: 'Open', commandId: 'cmd.open', style: undefined, args: undefined }],
			});
		});

		test('inline frontmatter with buttons', () => {
			const buttons = [{ label: 'Go', commandId: 'cmd.go', style: 'primary' }];
			const input = `--- ${JSON.stringify({ buttons })} ---\nMarkdown here`;

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: '\nMarkdown here',
				buttons: [{ label: 'Go', commandId: 'cmd.go', style: 'primary', args: undefined }],
			});
		});

		test('inline frontmatter handles nested JSON with braces', () => {
			const buttons = [{ label: 'Open', commandId: 'cmd.open' }, { label: 'Try', commandId: 'cmd.try' }];
			const input = `--- ${JSON.stringify({ buttons })} ---\nBody`;

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: '\nBody',
				buttons: [
					{ label: 'Open', commandId: 'cmd.open', style: undefined, args: undefined },
					{ label: 'Try', commandId: 'cmd.try', style: undefined, args: undefined },
				],
			});
		});

		test('frontmatter with invalid JSON falls back to full text', () => {
			const input = '---\nnot json\n---\nBody';
			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: input,
			});
		});

		test('skips buttons with missing required properties', () => {
			const input = JSON.stringify({
				markdown: 'text',
				buttons: [
					{ label: 'Valid', commandId: 'cmd.valid' },
					{ label: 'MissingCmd' },
					{ commandId: 'cmd.missingLabel' },
					'not an object',
					null,
				],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: [{ label: 'Valid', commandId: 'cmd.valid', style: undefined, args: undefined }],
			});
		});

		test('returns undefined buttons when all buttons are invalid', () => {
			const input = JSON.stringify({
				markdown: 'text',
				buttons: [{ noLabel: true }],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: undefined,
			});
		});

		test('ignores invalid style values', () => {
			const input = JSON.stringify({
				markdown: 'text',
				buttons: [{ label: 'X', commandId: 'cmd', style: 'danger' }],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: [{ label: 'X', commandId: 'cmd', style: undefined, args: undefined }],
			});
		});

		test('JSON envelope with bannerImageUrl, badge, title, and features', () => {
			const input = JSON.stringify({
				markdown: 'Body',
				bannerImageUrl: 'https://example.com/banner.png',
				badge: 'New',
				title: 'What\'s New',
				features: [
					{ icon: '$(sparkle)', title: 'Feature A', description: 'Does A' },
					{ title: 'Feature B', description: 'Does B' },
				],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'Body',
				buttons: undefined,
				bannerImageUrl: 'https://example.com/banner.png',
				badge: 'New',
				title: 'What\'s New',
				features: [
					{ icon: '$(sparkle)', title: 'Feature A', description: 'Does A' },
					{ icon: undefined, title: 'Feature B', description: 'Does B' },
				],
			});
		});

		test('block frontmatter with bannerImageUrl, badge, title, and features', () => {
			const meta = {
				bannerImageUrl: 'https://example.com/banner.png',
				badge: 'Preview',
				title: 'Highlights',
				features: [{ title: 'Feature', description: 'Desc' }],
			};
			const input = `---\n${JSON.stringify(meta)}\n---\nBody text`;

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'Body text',
				buttons: undefined,
				bannerImageUrl: 'https://example.com/banner.png',
				badge: 'Preview',
				title: 'Highlights',
				features: [{ icon: undefined, title: 'Feature', description: 'Desc' }],
			});
		});

		test('ignores non-string bannerImageUrl, badge, and title', () => {
			const input = JSON.stringify({
				markdown: 'text',
				bannerImageUrl: 123,
				badge: { not: 'a string' },
				title: ['nope'],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: undefined,
			});
		});

		test('caps features at 5 entries and skips invalid ones', () => {
			const input = JSON.stringify({
				markdown: 'text',
				features: [
					{ title: 'F1', description: 'D1' },
					{ title: 'F2' }, // missing description
					'not an object',
					null,
					{ title: 'F3', description: 'D3', icon: '$(star)' },
					{ title: 'F4', description: 'D4' },
					{ title: 'F5', description: 'D5' },
					{ title: 'F6', description: 'D6' },
					{ title: 'F7', description: 'D7' }, // dropped (over cap)
				],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: undefined,
				features: [
					{ icon: undefined, title: 'F1', description: 'D1' },
					{ icon: '$(star)', title: 'F3', description: 'D3' },
					{ icon: undefined, title: 'F4', description: 'D4' },
					{ icon: undefined, title: 'F5', description: 'D5' },
					{ icon: undefined, title: 'F6', description: 'D6' },
				],
			});
		});

		test('returns undefined features when all features are invalid', () => {
			const input = JSON.stringify({
				markdown: 'text',
				features: [{ title: 'OnlyTitle' }, 'string', null],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: undefined,
			});
		});

		test('ignores non-string feature icon', () => {
			const input = JSON.stringify({
				markdown: 'text',
				features: [{ icon: 42, title: 'F', description: 'D' }],
			});

			assert.deepStrictEqual(parseUpdateInfoInput(input), {
				markdown: 'text',
				buttons: undefined,
				features: [{ icon: undefined, title: 'F', description: 'D' }],
			});
		});
	});
});
