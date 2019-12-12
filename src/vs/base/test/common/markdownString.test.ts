/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MarkdownString } from 'vs/base/common/htmlContent';

suite('MarkdownString', () => {

	test('escape', () => {

		const mds = new MarkdownString();

		mds.appendText('# foo\n*bar*');

		assert.equal(mds.value, '\\# foo\n\n\\*bar\\*');
	});

	suite('ThemeIcons', () => {

		test('escapeThemeIcons', () => {
			assert.equal(
				MarkdownString.escapeThemeIcons('$(zap) $(not an icon) foo$(bar)'),
				'\\$(zap) $(not an icon) foo\\$(bar)'
			);
		});

		suite('Support On', () => {

			test('appendText', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendText('$(zap)');

				assert.equal(mds.value, '$(zap)');
			});

			test('appendText escaped', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendText(MarkdownString.escapeThemeIcons('$(zap)'));

				assert.equal(mds.value, '\\\\$\\(zap\\)');
			});

			test('appendMarkdown', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendMarkdown('$(zap)');

				assert.equal(mds.value, '$(zap)');
			});

			test('appendMarkdown escaped', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendMarkdown(MarkdownString.escapeThemeIcons('$(zap)'));

				assert.equal(mds.value, '\\$(zap)');
			});
		});

		suite('Support Off', () => {

			test('appendText', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: false });
				mds.appendText('$(zap)');

				assert.equal(mds.value, '$\\(zap\\)');
			});

			test('appendMarkdown', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: false });
				mds.appendMarkdown('$(zap)');

				assert.equal(mds.value, '$(zap)');
			});
		});

	});
});
