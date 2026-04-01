/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Formats snippet content as a Markdown fenced code block
 * @param {string} content - The snippet content
 * @param {string} [language] - Language identifier for syntax highlighting
 * @returns {string} Formatted Markdown code block
 */
function formatMarkdown(content, language = 'bash') {
	// Ensure language is valid (fallback to 'text' if invalid)
	const validLanguages = ['bash', 'sh', 'powershell', 'cmd', 'json', 'yaml', 'text'];
	const lang = validLanguages.includes(language) ? language : 'text';

	// Format as fenced code block
	return `\`\`\`${lang}\n${content}\n\`\`\``;
}

module.exports = { formatMarkdown };

