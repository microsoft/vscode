/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lightweight HTML-to-Markdown converter.
 *
 * Handles a small set of common inline and block elements so that content
 * pasted from web pages keeps its basic structure (headings, links, bold,
 * italic, code, lists) when inserted into a Markdown-aware surface such as
 * the chat input.
 */
export function convertHtmlToMarkdown(html: string): string {
	// Work on a mutable copy
	let md = html;

	// Normalise line endings
	md = md.replace(/\r\n?/g, '\n');

	// --- block elements ---------------------------------------------------

	// Headings
	md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, inner) => `\n# ${inlineClean(inner)}\n`);
	md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, inner) => `\n## ${inlineClean(inner)}\n`);
	md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, inner) => `\n### ${inlineClean(inner)}\n`);
	md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, inner) => `\n#### ${inlineClean(inner)}\n`);
	md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_m, inner) => `\n##### ${inlineClean(inner)}\n`);
	md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_m, inner) => `\n###### ${inlineClean(inner)}\n`);

	// Code blocks: <pre><code>…</code></pre>
	md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, inner) => `\n\`\`\`\n${decodeEntities(inner).trim()}\n\`\`\`\n`);

	// Standalone <pre> without <code>
	md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => `\n\`\`\`\n${decodeEntities(inner).trim()}\n\`\`\`\n`);

	// Blockquote
	md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
		const lines = inlineClean(inner).split('\n').map(l => `> ${l.trim()}`);
		return `\n${lines.join('\n')}\n`;
	});

	// List items - convert before stripping the list wrapper
	md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `- ${inlineClean(inner).trim()}\n`);
	md = md.replace(/<\/?[ou]l[^>]*>/gi, '\n');

	// Paragraphs and divs → double newline
	md = md.replace(/<\/p>/gi, '\n\n');
	md = md.replace(/<p[^>]*>/gi, '');
	md = md.replace(/<\/div>/gi, '\n');
	md = md.replace(/<div[^>]*>/gi, '');

	// Line breaks
	md = md.replace(/<br\s*\/?>/gi, '\n');

	// Horizontal rules
	md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

	// --- inline elements --------------------------------------------------

	// Links - must come before we strip remaining tags
	md = md.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => `[${inlineClean(text).trim()}](${href})`);

	// Images
	md = md.replace(/<img\s[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
	md = md.replace(/<img\s[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
	md = md.replace(/<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

	// Bold / strong
	md = md.replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `**${inlineClean(inner)}**`);

	// Italic / emphasis
	md = md.replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `*${inlineClean(inner)}*`);

	// Inline code
	md = md.replace(/<code(\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_m, _attrs, inner) => `\`${decodeEntities(inner)}\``);

	// Strikethrough
	md = md.replace(/<(del|s|strike)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `~~${inlineClean(inner)}~~`);

	// --- cleanup ----------------------------------------------------------

	// Strip any remaining HTML tags
	md = md.replace(/<[^>]+>/g, '');

	// Decode common HTML entities
	md = decodeEntities(md);

	// Collapse runs of 3+ newlines into 2
	md = md.replace(/\n{3,}/g, '\n\n');

	return md.trim();
}

/** Recursively strip tags for use inside an inline markdown construct. */
function inlineClean(html: string): string {
	// Process nested inline elements first
	let result = html;
	result = result.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => `[${inlineClean(text).trim()}](${href})`);
	result = result.replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `**${inlineClean(inner)}**`);
	result = result.replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `*${inlineClean(inner)}*`);
	result = result.replace(/<code(\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_m, _attrs, inner) => `\`${decodeEntities(inner)}\``);
	result = result.replace(/<(del|s|strike)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _tag, _attrs, inner) => `~~${inlineClean(inner)}~~`);
	result = result.replace(/<br\s*\/?>/gi, '\n');
	result = result.replace(/<[^>]+>/g, '');
	return decodeEntities(result);
}

/** Decode the most common HTML entities. */
function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, '\'')
		.replace(/&nbsp;/g, ' ');
}
