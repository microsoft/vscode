/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const path = require('path');
const fs = require('fs');

/** @type {any} */
const generator = require('./onboarding-snippet/generator.cjs');
/** @type {any} */
const validator = require('./onboarding-snippet/validator.cjs');
/** @type {any} */
const formatter = require('./onboarding-snippet/formatter.cjs');

const { generateSnippet } = generator;
const { validateEnvironment } = validator;
const { formatMarkdown } = formatter;

const TOPICS_DIR = path.join(__dirname, 'onboarding-snippet');
const SNIPPETS_FILE = path.join(TOPICS_DIR, 'snippets.json');

function log(message) {
	if (process.stdout.isTTY) {
		console.log(`\x1b[34m[onboarding-snippet]\x1b[0m`, message);
	} else {
		console.log(`[onboarding-snippet]`, message);
	}
}

function printUsage() {
	console.error('Usage: npm run onboarding:snippet <topic>');
	console.error('');
	console.error('Supported topics:');
	console.error('  env     - Environment setup (Node.js version, dependencies)');
	console.error('  docker  - Docker setup and run commands');
	console.error('  wsl     - Windows Subsystem for Linux setup notes');
	console.error('  lint    - Linting workflow');
	console.error('  test    - Running tests');
	console.error('  build   - Build workflow');
}

async function main() {
	const topic = process.argv[2];

	if (!topic) {
		console.error('\x1b[1;31m*** Error: Topic argument required\x1b[0;0m');
		printUsage();
		process.exit(1);
	}

	try {
		// Load snippets configuration
		if (!fs.existsSync(SNIPPETS_FILE)) {
			console.error(`\x1b[1;31m*** Error: Snippets file not found: ${SNIPPETS_FILE}\x1b[0;0m`);
			process.exit(1);
		}

		const snippetsConfig = JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf8'));

		if (!snippetsConfig[topic]) {
			console.error(`\x1b[1;31m*** Error: Unknown topic "${topic}"\x1b[0;0m`);
			console.error('');
			printUsage();
			process.exit(1);
		}

		// Validate environment (non-blocking, shows warnings)
		const validationResult = await validateEnvironment(topic, snippetsConfig[topic]);
		if (validationResult.warnings.length > 0) {
			for (const warning of validationResult.warnings) {
				log(`\x1b[33m${warning}\x1b[0m`);
			}
		}

		// Generate snippet
		const snippet = generateSnippet(topic, snippetsConfig[topic]);

		// Format and output
		const formatted = formatMarkdown(snippet, snippetsConfig[topic].language);
		console.log(formatted);

	} catch (error) {
		const message = error && error.message ? error.message : String(error);
		console.error(`\x1b[1;31m*** Error: ${message}\x1b[0;0m`);
		if (error && error.stack && process.env['VSCODE_DEBUG']) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch(err => {
		const message = err && err.message ? err.message : String(err);
		console.error(`\x1b[1;31m*** Fatal error: ${message}\x1b[0;0m`);
		process.exit(1);
	});
}

module.exports = { main };

