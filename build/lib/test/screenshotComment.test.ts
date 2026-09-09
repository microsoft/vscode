/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { COMMENT_MARKER, formatScreenshotComment } from '../screenshotComment.ts';

const options = {
	runUrl: 'https://example.com/actions/runs/1234',
	baseSha: '1'.repeat(40),
	currentSha: '2'.repeat(40),
};

const oversizedReportComment = [
	'<!-- screenshot-diff-report -->',
	'## Screenshot Changes',
	'',
	'**Base:** `11111111` **Current:** `22222222`',
	'',
	'The screenshot report exceeds GitHub\'s comment size limit. [View the full report in the workflow summary](https://example.com/actions/runs/1234).',
].join('\n');

suite('Screenshot comments', () => {
	test('preserves small reports and adds the comment marker', () => {
		const body = '### blocks-ci screenshots changed\n\n<details><summary>Patch</summary>\n\n```diff\n-before\n+after\n```\n</details>';

		assert.strictEqual(formatScreenshotComment(body, options), `${COMMENT_MARKER}\n${body}`);
	});

	test('does not duplicate an existing comment marker', () => {
		const body = `${COMMENT_MARKER}\n## Screenshot Changes\n\n### Changed (1)`;

		assert.strictEqual(formatScreenshotComment(body, options), body);
	});

	test('preserves reports at the limit including the marker', () => {
		const body = 'x'.repeat(65536 - COMMENT_MARKER.length - 1);
		const expected = `${COMMENT_MARKER}\n${body}`;

		assert.deepStrictEqual([
			formatScreenshotComment(body, options),
			formatScreenshotComment(expected, options),
		], [expected, expected]);
	});

	test('bounds reports one character over the limit including the marker', () => {
		const body = 'x'.repeat(65536 - COMMENT_MARKER.length);

		for (const report of [body, `${COMMENT_MARKER}\n${body}`]) {
			const comment = formatScreenshotComment(report, options);
			assert.ok(comment.length <= 65536, `Comment has ${comment.length} characters`);
			assert.strictEqual(comment, oversizedReportComment);
		}
	});

	test('bounds the combined diff, baseline contents and patch without cutting Markdown', () => {
		const body = [
			`${COMMENT_MARKER}\n## Screenshot Changes\n\n### Changed (100)`,
			'<details><summary>Screenshot diff</summary>\n\n' + '![after](https://example.com/images/hash)\n'.repeat(500) + '</details>',
			'### blocks-ci screenshots changed\n\n<details><summary>Updated blocks-ci-screenshots.md</summary>\n\n```md\n' + 'baseline\n'.repeat(4000) + '```\n</details>',
			'<details open><summary>Patch</summary>\n\n```diff\n' + '-before\n+after\n'.repeat(2000) + '```\n</details>',
		].join('\n\n');
		const comment = formatScreenshotComment(body, options);

		assert.ok(comment.length <= 65536, `Comment has ${comment.length} characters`);
		assert.strictEqual(comment, oversizedReportComment);
	});

	test('bounds oversized Unicode error reports', () => {
		const body = `## Screenshot Changes\n\n### Errored (1)\n\n<details><summary>Fixture failed</summary>\n\n\`\`\`\n${'\u{1F680}'.repeat(40000)}\n\`\`\`\n</details>`;
		const comment = formatScreenshotComment(body, options);

		assert.ok(comment.length <= 65536, `Comment has ${comment.length} characters`);
		assert.strictEqual(comment, oversizedReportComment);
	});

	test('preserves current commit metadata when the base is unavailable', () => {
		const comment = formatScreenshotComment('x'.repeat(65536), { ...options, baseSha: undefined });

		assert.ok(comment.length <= 65536, `Comment has ${comment.length} characters`);
		assert.strictEqual(comment, oversizedReportComment.replace('**Base:** `11111111` ', ''));
	});
});
