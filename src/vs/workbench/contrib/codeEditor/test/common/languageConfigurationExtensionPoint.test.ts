/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions, IJSONContributionRegistry } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
// Importing the contribution registers the `language-configuration` JSON schema as a side effect.
import '../../common/languageConfigurationExtensionPoint.js';

const LANGUAGE_CONFIGURATION_SCHEMA_ID = 'vscode://schemas/language-configuration';

suite('LanguageConfigurationExtensionPoint schema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getLineCommentSchema(): IJSONSchema {
		const schemas = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution).getSchemaContributions().schemas;
		const schema = schemas[LANGUAGE_CONFIGURATION_SCHEMA_ID];
		assert.ok(schema, 'the `language-configuration` JSON schema should be registered');
		const lineComment = schema.properties?.comments?.properties?.lineComment;
		assert.ok(lineComment, '`comments.lineComment` schema should be defined');
		return lineComment;
	}

	// https://github.com/microsoft/vscode/issues/285594
	// The language configuration API accepts both a string and an object for `lineComment`,
	// so the contributed JSON schema must accept both. Otherwise a plain string value is
	// incorrectly flagged with a validation warning in `language-configuration.json`.
	test('comments.lineComment accepts both a string and an object', () => {
		const lineComment = getLineCommentSchema();

		assert.ok(Array.isArray(lineComment.oneOf), '`lineComment` should be described with `oneOf`');

		const acceptsString = lineComment.oneOf!.some(s => s.type === 'string');
		const acceptsObject = lineComment.oneOf!.some(s => s.type === 'object');

		assert.strictEqual(acceptsString, true, '`lineComment` should accept a string value');
		assert.strictEqual(acceptsObject, true, '`lineComment` should accept an object value');
	});

	test('the lineComment object form still requires a `comment` string property', () => {
		const lineComment = getLineCommentSchema();
		const objectSchema = lineComment.oneOf!.find(s => s.type === 'object');

		assert.ok(objectSchema, '`lineComment` should still offer an object form');
		assert.deepStrictEqual(objectSchema!.required, ['comment'], 'the object form should require `comment`');
		assert.strictEqual(objectSchema!.properties?.comment?.type, 'string', '`comment` should be a string');
	});
});
