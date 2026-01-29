/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AskQuestionsToolData } from '../../../../common/tools/builtinTools/askQuestionsTool.js';
import { IToolData } from '../../../../common/tools/languageModelToolsService.js';
import { IJSONSchema } from '../../../../../../../base/common/jsonSchema.js';

suite('AskQuestionsTool Schema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getQuestionItemSchema(toolData: IToolData): { properties: Record<string, IJSONSchema>; required: string[] } {
		assert.ok(toolData.inputSchema);
		const schema = toolData.inputSchema;
		const questionsItems = schema?.properties?.questions?.items as IJSONSchema | undefined;
		const properties = questionsItems?.properties as Record<string, IJSONSchema> | undefined;
		const required = questionsItems?.required;

		assert.ok(properties, 'Schema properties should be defined');
		assert.ok(required, 'Schema required fields should be defined');

		return { properties, required };
	}

	test('AskQuestionsToolData returns valid tool data with proper schema', () => {
		assert.ok(AskQuestionsToolData.id, 'Tool should have an id');
		assert.strictEqual(AskQuestionsToolData.id, 'ask_questions', 'Tool id should be ask_questions');
		assert.ok(AskQuestionsToolData.inputSchema, 'Tool should have an input schema');
		assert.strictEqual(AskQuestionsToolData.inputSchema?.type, 'object', 'Schema should be an object type');
	});

	test('AskQuestionsToolData schema has required questions field', () => {
		assert.ok(AskQuestionsToolData.inputSchema?.required?.includes('questions'), 'questions should be required');
		assert.ok(AskQuestionsToolData.inputSchema?.properties?.questions, 'questions property should exist');
	});

	test('AskQuestionsToolData questions array has correct constraints', () => {
		const questionsSchema = AskQuestionsToolData.inputSchema?.properties?.questions as IJSONSchema;
		assert.strictEqual(questionsSchema.type, 'array', 'questions should be an array');
		assert.strictEqual(questionsSchema.minItems, 1, 'questions should have minItems of 1');
		assert.strictEqual(questionsSchema.maxItems, 4, 'questions should have maxItems of 4');
	});

	test('AskQuestionsToolData question items have correct required fields', () => {
		const { properties, required } = getQuestionItemSchema(AskQuestionsToolData);

		assert.ok(properties['header'], 'Schema should have header property');
		assert.ok(properties['question'], 'Schema should have question property');
		assert.ok(properties['options'], 'Schema should have options property');
		assert.ok(properties['multiSelect'], 'Schema should have multiSelect property');
		assert.ok(properties['allowFreeformInput'], 'Schema should have allowFreeformInput property');
		assert.deepStrictEqual(required, ['header', 'question'], 'Required fields should be header, question');
	});

	test('AskQuestionsToolData options have correct schema', () => {
		const { properties } = getQuestionItemSchema(AskQuestionsToolData);
		const optionsSchema = properties['options'] as IJSONSchema;

		assert.strictEqual(optionsSchema.type, 'array', 'options should be an array');
		assert.strictEqual(optionsSchema.minItems, 0, 'options should have minItems of 0');
		assert.strictEqual(optionsSchema.maxItems, 6, 'options should have maxItems of 6');

		const optionItemSchema = optionsSchema.items as IJSONSchema;
		assert.ok(optionItemSchema.properties, 'option items should have properties');

		const optionProperties = optionItemSchema.properties as Record<string, IJSONSchema>;
		assert.ok(optionProperties['label'], 'option should have label property');
		assert.ok(optionProperties['description'], 'option should have description property');
		assert.ok(optionProperties['recommended'], 'option should have recommended property');
		assert.deepStrictEqual(optionItemSchema.required, ['label'], 'option required fields should be label');
	});

	test('AskQuestionsToolData header has maxLength constraint', () => {
		const { properties } = getQuestionItemSchema(AskQuestionsToolData);
		const headerSchema = properties['header'] as IJSONSchema;

		assert.strictEqual(headerSchema.maxLength, 12, 'header should have maxLength of 12');
	});

	test('AskQuestionsToolData multiSelect and allowFreeformInput have boolean type with defaults', () => {
		const { properties } = getQuestionItemSchema(AskQuestionsToolData);

		const multiSelectSchema = properties['multiSelect'] as IJSONSchema;
		assert.strictEqual(multiSelectSchema.type, 'boolean', 'multiSelect should be boolean');
		assert.strictEqual(multiSelectSchema.default, false, 'multiSelect default should be false');

		const allowFreeformInputSchema = properties['allowFreeformInput'] as IJSONSchema;
		assert.strictEqual(allowFreeformInputSchema.type, 'boolean', 'allowFreeformInput should be boolean');
		assert.strictEqual(allowFreeformInputSchema.default, false, 'allowFreeformInput default should be false');
	});
});
