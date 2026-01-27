/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const assert = require('assert');
const path = require('path');
const fs = require('fs');

/** @type {any} */
const generatorModule = require('../generator.cjs');
/** @type {any} */
const validatorModule = require('../validator.cjs');
/** @type {any} */
const formatterModule = require('../formatter.cjs');

const { generateSnippet } = generatorModule;
const { validateEnvironment } = validatorModule;
const { formatMarkdown } = formatterModule;

describe('Onboarding Snippet Generator', () => {

	describe('generator.cjs', () => {

		it('should generate snippet from template', () => {
			const config = {
				template: 'npm install',
				language: 'bash',
				requires: ['node']
			};
			const result = generateSnippet('env', config);
			assert.strictEqual(result, 'npm install');
		});

		it('should handle platform-specific templates', () => {
			const config = {
				template: 'default command',
				language: 'bash',
				requires: [],
				platformSpecific: {
					win32: 'windows command',
					darwin: 'mac command',
					linux: 'linux command'
				}
			};
			const result = generateSnippet('test', config);
			// Should return platform-specific or default
			assert.ok(result.length > 0);
		});

		it('should return template when no platform-specific config exists', () => {
			const config = {
				template: 'npm test',
				language: 'bash',
				requires: []
			};
			const result = generateSnippet('test', config);
			assert.strictEqual(result, 'npm test');
		});

	});

	describe('validator.cjs', () => {

		it('should validate Node.js version requirement', async () => {
			const config = {
				template: 'npm install',
				language: 'bash',
				requires: ['node']
			};
			const result = await validateEnvironment('env', config);
			assert.ok(result);
			assert.ok(Array.isArray(result.warnings));
			assert.strictEqual(typeof result.valid, 'boolean');
		});

		it('should check for Docker when required', async () => {
			const config = {
				template: 'docker build',
				language: 'bash',
				requires: ['docker']
			};
			const result = await validateEnvironment('docker', config);
			assert.ok(result);
			assert.ok(Array.isArray(result.warnings));
		});

		it('should check for WSL when required', async () => {
			const config = {
				template: 'wsl --version',
				language: 'bash',
				requires: ['wsl']
			};
			const result = await validateEnvironment('wsl', config);
			assert.ok(result);
			assert.ok(Array.isArray(result.warnings));
		});

		it('should handle empty requires array', async () => {
			const config = {
				template: 'echo test',
				language: 'bash',
				requires: []
			};
			const result = await validateEnvironment('test', config);
			assert.ok(result);
			assert.strictEqual(result.warnings.length, 0);
			assert.strictEqual(result.valid, true);
		});

		it('should handle missing requires property', async () => {
			const config = {
				template: 'echo test',
				language: 'bash'
			};
			const result = await validateEnvironment('test', config);
			assert.ok(result);
			assert.strictEqual(result.warnings.length, 0);
		});

	});

	describe('formatter.cjs', () => {

		it('should format content as Markdown code block', () => {
			const content = 'npm install';
			const result = formatMarkdown(content, 'bash');
			assert.strictEqual(result, '```bash\nnpm install\n```');
		});

		it('should use default language when not specified', () => {
			const content = 'npm test';
			const result = formatMarkdown(content);
			assert.strictEqual(result, '```bash\nnpm test\n```');
		});

		it('should fallback to text for invalid language', () => {
			const content = 'some content';
			const result = formatMarkdown(content, 'invalid-lang');
			assert.strictEqual(result, '```text\nsome content\n```');
		});

		it('should support all valid languages', () => {
			const validLanguages = ['bash', 'sh', 'powershell', 'cmd', 'json', 'yaml', 'text'];
			validLanguages.forEach(lang => {
				const result = formatMarkdown('test', lang);
				assert.ok(result.includes('```' + lang));
			});
		});

	});

	describe('snippets.json', () => {

		it('should exist and be valid JSON', () => {
			const snippetsPath = path.join(__dirname, '..', 'snippets.json');
			assert.ok(fs.existsSync(snippetsPath), 'snippets.json should exist');
			const content = fs.readFileSync(snippetsPath, 'utf8');
			const snippets = JSON.parse(content);
			assert.ok(snippets);
		});

		it('should contain all required topics', () => {
			const snippetsPath = path.join(__dirname, '..', 'snippets.json');
			const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf8'));
			const requiredTopics = ['env', 'docker', 'wsl', 'lint', 'test', 'build'];
			requiredTopics.forEach(topic => {
				assert.ok(snippets[topic], `Topic "${topic}" should exist`);
			});
		});

		it('should have valid structure for each topic', () => {
			const snippetsPath = path.join(__dirname, '..', 'snippets.json');
			const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf8'));
			Object.keys(snippets).forEach(topic => {
				const config = snippets[topic];
				assert.ok(config.template, `${topic} should have template`);
				assert.ok(config.language, `${topic} should have language`);
				assert.ok(Array.isArray(config.requires), `${topic} should have requires array`);
			});
		});

		it('should have links for each topic', () => {
			const snippetsPath = path.join(__dirname, '..', 'snippets.json');
			const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf8'));
			Object.keys(snippets).forEach(topic => {
				const config = snippets[topic];
				assert.ok(config.links, `${topic} should have links`);
				assert.ok(typeof config.links === 'object', `${topic} links should be an object`);
			});
		});

		it('should not have missing config properties', () => {
			const snippetsPath = path.join(__dirname, '..', 'snippets.json');
			const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf8'));
			Object.keys(snippets).forEach(topic => {
				const config = snippets[topic];
				assert.ok(config.template !== undefined, `${topic} template should not be undefined`);
				assert.ok(config.language !== undefined, `${topic} language should not be undefined`);
				assert.ok(config.requires !== undefined, `${topic} requires should not be undefined`);
			});
		});

	});

	describe('main entry point', () => {

		it('should export main function', () => {
			/** @type {any} */
			const mainModule = require('../../onboarding-snippet.cjs');
			const { main } = mainModule;
			assert.ok(typeof main === 'function', 'main should be a function');
		});

	});

});

