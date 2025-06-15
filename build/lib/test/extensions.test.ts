/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { translatePackageJSON } from '../extensions';

suite('Extension Package JSON Translation Tests', () => {
	let tempFiles: string[] = [];

	teardown(() => {
		// Clean up temp files
		tempFiles.forEach(file => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file);
			}
		});
		tempFiles = [];
	});

	function createTempNlsFile(data: any): string {
		const tempFile = path.join(__dirname, `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.nls.json`);
		fs.writeFileSync(tempFile, JSON.stringify(data));
		tempFiles.push(tempFile);
		return tempFile;
	}

	test('translatePackageJSON - string translation', () => {
		const nlsData = {
			'test.description': 'This is a test description'
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'test.prop': {
							description: '%test.description%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		assert.strictEqual(result.contributes.configuration.properties['test.prop'].description, 'This is a test description');
	});

	test('translatePackageJSON - array translation with newlines', () => {
		const nlsData = {
			'test.multiline': [
				'This is the first line',
				'This is the second line',
				'This is the third line'
			]
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'test.prop': {
							description: '%test.multiline%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		const expected = 'This is the first line\nThis is the second line\nThis is the third line';
		assert.strictEqual(result.contributes.configuration.properties['test.prop'].description, expected);
	});

	test('translatePackageJSON - complex object translation', () => {
		const nlsData = {
			'test.complex': {
				message: 'Complex message content',
				comment: ['This is a comment']
			}
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'test.prop': {
							description: '%test.complex%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		assert.strictEqual(result.contributes.configuration.properties['test.prop'].description, 'Complex message content');
	});

	test('translatePackageJSON - mixed types in same file', () => {
		const nlsData = {
			'simple.string': 'Simple string',
			'array.multiline': [
				'Line 1',
				'Line 2',
				'Line 3'
			],
			'complex.object': {
				message: 'Complex object message',
				comment: ['Comment']
			}
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'prop1': { description: '%simple.string%' },
						'prop2': { description: '%array.multiline%' },
						'prop3': { description: '%complex.object%' }
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		assert.strictEqual(result.contributes.configuration.properties.prop1.description, 'Simple string');
		assert.strictEqual(result.contributes.configuration.properties.prop2.description, 'Line 1\nLine 2\nLine 3');
		assert.strictEqual(result.contributes.configuration.properties.prop3.description, 'Complex object message');
	});

	test('translatePackageJSON - real-world markdown snippet example', () => {
		const nlsData = {
			'configuration.markdown.editor.filePaste.videoSnippet': [
				'Snippet used when adding videos to Markdown. This snippet can use the following variables:',
				'- `${src}` — The resolved path of the video file.',
				'- `${title}` — The title used for the video. A snippet placeholder will automatically be created for this variable.'
			]
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'markdown.editor.filePaste.videoSnippet': {
							type: 'string',
							default: 'video',
							markdownDescription: '%configuration.markdown.editor.filePaste.videoSnippet%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		const expected = 'Snippet used when adding videos to Markdown. This snippet can use the following variables:\n- `${src}` — The resolved path of the video file.\n- `${title}` — The title used for the video. A snippet placeholder will automatically be created for this variable.';
		assert.strictEqual(result.contributes.configuration.properties['markdown.editor.filePaste.videoSnippet'].markdownDescription, expected);
	});

	test('translatePackageJSON - non-existent key should remain unchanged', () => {
		const nlsData = {
			'existing.key': 'Existing value'
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'test.prop': {
							description: '%non.existent.key%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		assert.strictEqual(result.contributes.configuration.properties['test.prop'].description, '%non.existent.key%');
	});

	test('translatePackageJSON - empty array should result in empty string', () => {
		const nlsData = {
			'empty.array': []
		};
		const nlsPath = createTempNlsFile(nlsData);

		const packageJSON = {
			contributes: {
				configuration: {
					properties: {
						'test.prop': {
							description: '%empty.array%'
						}
					}
				}
			}
		};

		const result = translatePackageJSON(packageJSON, nlsPath);
		assert.strictEqual(result.contributes.configuration.properties['test.prop'].description, '');
	});
});