/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { createBuildDocument, parseAdoPositiveInt, type IBuildEnv } from '../createBuild.ts';

const baseEnv: IBuildEnv = {
	quality: 'insider',
	commit: 'abc123',
	queuedBy: 'someone',
	sourceBranch: 'refs/heads/main',
	version: '1.99.0-insider',
	isPrivate: false,
	timestamp: 1700000000000,
};

suite('parseAdoPositiveInt', () => {
	test('parses positive integers', () => {
		assert.strictEqual(parseAdoPositiveInt('1'), 1);
		assert.strictEqual(parseAdoPositiveInt('12345'), 12345);
	});

	test('returns undefined for missing / empty / invalid values', () => {
		assert.strictEqual(parseAdoPositiveInt(undefined), undefined);
		assert.strictEqual(parseAdoPositiveInt(''), undefined);
		assert.strictEqual(parseAdoPositiveInt('0'), undefined);
		assert.strictEqual(parseAdoPositiveInt('-5'), undefined);
		assert.strictEqual(parseAdoPositiveInt('3.14'), undefined);
		assert.strictEqual(parseAdoPositiveInt('NaN'), undefined);
		assert.strictEqual(parseAdoPositiveInt('1e3'), undefined);
		assert.strictEqual(parseAdoPositiveInt(' 42 '), undefined);
		assert.strictEqual(parseAdoPositiveInt('not-a-number'), undefined);
	});
});

suite('createBuildDocument', () => {
	test('includes buildId and definitionId when provided', () => {
		const doc = createBuildDocument({ ...baseEnv, buildId: 98765, definitionId: 111 });

		assert.deepStrictEqual(doc, {
			id: 'abc123',
			timestamp: 1700000000000,
			version: '1.99.0-insider',
			isReleased: false,
			private: false,
			sourceBranch: 'refs/heads/main',
			queuedBy: 'someone',
			assets: [],
			updates: {},
			firstReleaseTimestamp: null,
			history: [{ event: 'created', timestamp: 1700000000000 }],
			buildId: 98765,
			definitionId: 111,
		});
	});

	test('omits buildId and definitionId when not provided (e.g. local dev runs)', () => {
		const doc = createBuildDocument(baseEnv);

		assert.ok(!('buildId' in doc), 'buildId should be omitted when undefined');
		assert.ok(!('definitionId' in doc), 'definitionId should be omitted when undefined');
	});

	test('omits buildId but keeps definitionId when only definitionId is provided', () => {
		const doc = createBuildDocument({ ...baseEnv, definitionId: 111 });

		assert.ok(!('buildId' in doc));
		assert.strictEqual(doc.definitionId, 111);
	});

	test('round-trips through parseAdoPositiveInt as used by the CLI entry point', () => {
		const buildId = parseAdoPositiveInt(process.env.BOGUS_UNSET);
		const definitionId = parseAdoPositiveInt('111');

		const doc = createBuildDocument({ ...baseEnv, buildId, definitionId });

		assert.ok(!('buildId' in doc));
		assert.strictEqual(doc.definitionId, 111);
	});
});
