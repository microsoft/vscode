/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const os = require('os');

/**
 * @typedef {Object} SnippetConfig
 * @property {string} template
 * @property {string} language
 * @property {string[]} requires
 * @property {Object.<string, string>} [links]
 * @property {Object.<string, string>} [platformSpecific]
 */

/**
 * Generates a snippet from a template configuration
 * @param {string} topic - The topic identifier
 * @param {SnippetConfig} config - Snippet configuration from snippets.json
 * @returns {string} Generated snippet content
 */
function generateSnippet(topic, config) {
	let snippet = config.template;

	// Platform-specific adjustments (future enhancement)
	if (config.platformSpecific) {
		const platform = os.platform();
		if (config.platformSpecific[platform]) {
			snippet = config.platformSpecific[platform];
		}
	}

	return snippet;
}

module.exports = { generateSnippet };

