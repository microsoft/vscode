/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NpmViewRecord, parseNpmViewOutput } from '../features/npmViewParser';

const npmViewOutput: NpmViewRecord = {
	description: 'React is a JavaScript library for building user interfaces.',
	'dist-tags.latest': '19.1.0',
	homepage: 'https://react.dev/',
	version: '19.1.0',
	time: {
		'19.1.0': '2025-05-20T20:58:48.397Z',
		'0.0.0-experimental-98e8ed76': '2026-07-25T21:39:01.123Z'
	}
};

suite('npmViewParser', () => {

	test('parses object output (npm <= 11)', () => {
		const info = parseNpmViewOutput(JSON.stringify(npmViewOutput));
		assert.ok(info);
		assert.strictEqual(info!.description, 'React is a JavaScript library for building user interfaces.');
		assert.strictEqual(info!.version, '19.1.0');
		assert.strictEqual(info!.time, '2025-05-20T20:58:48.397Z');
		assert.strictEqual(info!.homepage, 'https://react.dev/');
	});

	test('parses array output (npm 12+)', () => {
		const info = parseNpmViewOutput(JSON.stringify([npmViewOutput]));
		assert.ok(info);
		assert.strictEqual(info!.description, 'React is a JavaScript library for building user interfaces.');
		assert.strictEqual(info!.version, '19.1.0');
		assert.strictEqual(info!.time, '2025-05-20T20:58:48.397Z');
		assert.strictEqual(info!.homepage, 'https://react.dev/');
	});

	test('prefers dist-tags.latest over version', () => {
		const info = parseNpmViewOutput(JSON.stringify({
			'dist-tags.latest': '19.1.0',
			version: '0.0.0-experimental-98e8ed76',
			time: {
				'19.1.0': '2025-05-20T20:58:48.397Z',
				'0.0.0-experimental-98e8ed76': '2026-07-25T21:39:01.123Z'
			}
		}));
		assert.ok(info);
		assert.strictEqual(info!.version, '19.1.0');
		assert.strictEqual(info!.time, '2025-05-20T20:58:48.397Z');
		assert.notStrictEqual(info!.time, '2026-07-25T21:39:01.123Z');
	});

	test('uses the first element when the array contains multiple packages', () => {
		const first = { ...npmViewOutput, description: 'first package' };
		const second = { ...npmViewOutput, description: 'second package' };
		const info = parseNpmViewOutput(JSON.stringify([first, second]));
		assert.ok(info);
		assert.strictEqual(info!.description, 'first package');
	});

	test('falls back to the version field when dist-tags.latest is missing', () => {
		const info = parseNpmViewOutput(JSON.stringify([
			{ version: '0.0.0-experimental-98e8ed76', time: { '0.0.0-experimental-98e8ed76': '2026-07-25T21:39:01.123Z' } }
		]));
		assert.ok(info);
		assert.strictEqual(info!.version, '0.0.0-experimental-98e8ed76');
		assert.strictEqual(info!.time, '2026-07-25T21:39:01.123Z');
		assert.strictEqual(info!.description, '');
		assert.strictEqual(info!.homepage, undefined);
	});

	test('returns undefined version and time when neither field is present', () => {
		const info = parseNpmViewOutput(JSON.stringify({ description: 'React is a JavaScript library for building user interfaces.' }));
		assert.ok(info);
		assert.strictEqual(info!.version, undefined);
		assert.strictEqual(info!.time, undefined);
	});

	test('returns empty description when description is missing', () => {
		const info = parseNpmViewOutput(JSON.stringify({ 'dist-tags.latest': '19.1.0' }));
		assert.ok(info);
		assert.strictEqual(info!.description, '');
		assert.strictEqual(info!.version, '19.1.0');
	});

	test('returns undefined time when the resolved version has no matching time entry', () => {
		const info = parseNpmViewOutput(JSON.stringify({ 'dist-tags.latest': '19.1.0', time: { '18.3.1': '2024-04-26T09:39:52.159Z' } }));
		assert.ok(info);
		assert.strictEqual(info!.version, '19.1.0');
		assert.strictEqual(info!.time, undefined);
	});

	test('returns undefined for invalid JSON', () => {
		assert.strictEqual(parseNpmViewOutput('not json'), undefined);
		assert.strictEqual(parseNpmViewOutput('{'), undefined);
		assert.strictEqual(parseNpmViewOutput(''), undefined);
	});

	test('returns undefined for non-object output', () => {
		assert.strictEqual(parseNpmViewOutput('null'), undefined);
		assert.strictEqual(parseNpmViewOutput('[]'), undefined);
	});
});