/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const COMMENT_MARKER = '<!-- screenshot-diff-report -->';
const MAX_COMMENT_LENGTH = 65536;

interface ScreenshotCommentOptions {
	readonly runUrl: string;
	readonly baseSha?: string;
	readonly currentSha?: string;
}

export function formatScreenshotComment(body: string, options: ScreenshotCommentOptions): string {
	const comment = body.startsWith(COMMENT_MARKER) ? body : `${COMMENT_MARKER}\n${body}`;
	if (comment.length <= MAX_COMMENT_LENGTH) {
		return comment;
	}

	const commits = [
		options.baseSha ? `**Base:** \`${options.baseSha.slice(0, 8)}\`` : '',
		options.currentSha ? `**Current:** \`${options.currentSha.slice(0, 8)}\`` : '',
	].filter(Boolean).join(' ');

	return [
		COMMENT_MARKER,
		'## Screenshot Changes',
		'',
		...(commits ? [commits, ''] : []),
		`The screenshot report exceeds GitHub's comment size limit. [View the full report in the workflow summary](${options.runUrl}).`,
	].join('\n');
}
