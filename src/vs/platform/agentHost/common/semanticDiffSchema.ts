/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../base/common/jsonSchema.js';

type ObjectSchema = IJSONSchema & { type: 'object'; properties: Record<string, IJSONSchema>; required: string[] };

const reference = (name: string): IJSONSchema => ({ $ref: `#/$defs/${name}` });
const nullable = (schema: IJSONSchema): IJSONSchema => ({ anyOf: [schema, { type: 'null' }] });
const text = (maxLength: number): IJSONSchema => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const object = (properties: Record<string, IJSONSchema>, optional: readonly string[] = []): ObjectSchema => ({
	type: 'object',
	additionalProperties: false,
	required: Object.keys(properties).filter(name => !optional.includes(name)),
	properties
});
const array = (name: string, maxItems: number): IJSONSchema => ({ type: 'array', maxItems, items: reference(name) });
const count: IJSONSchema = { type: 'integer', minimum: 0, maximum: 2147483647 };

const definitions: Record<string, IJSONSchema> = {
	id: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' },
	path: {
		type: 'string', minLength: 1, maxLength: 4096,
		pattern: '^(?!/)(?![A-Za-z]:)(?!.*\\\\)(?!.*\\u0000)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\/$).+$'
	},
	revision: { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' },
	count,
	reason: text(400),
	changeType: { enum: ['logic', 'test', 'supporting'] },
	confidence: { enum: ['high', 'medium', 'low'] },
	range: object({ start: reference('count'), count: reference('count') }),
	source: object({
		repositoryLabel: text(120),
		comparison: { enum: ['staged', 'workingTree', 'commitRange'] },
		baseRevision: reference('revision'),
		targetRevision: nullable(reference('revision')),
		diffFingerprint: nullable({ type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }),
		capturedAt: { type: 'string', format: 'date-time' },
		inventoryComplete: { type: 'boolean' }
	}),
	group: object({ id: reference('id'), title: text(100), description: text(600) }),
	file: object({
		id: reference('id'), path: reference('path'), oldPath: nullable(reference('path')),
		status: { enum: ['added', 'modified', 'deleted', 'renamed'] },
		contentKind: { enum: ['text', 'binary', 'metadata'] }
	}),
	classification: object({
		groupId: reference('id'), changeType: reference('changeType'),
		summary: text(160), groupReason: reference('reason'), typeReason: reference('reason'),
		groupConfidence: reference('confidence'), typeConfidence: reference('confidence'),
		uncertainty: nullable(reference('reason'))
	}),
	hunk: object({
		id: reference('id'), fileId: reference('id'), oldRange: reference('range'), newRange: reference('range'),
		additions: reference('count'), deletions: reference('count'), classification: reference('classification'),
	}),
	limitation: object({
		code: { enum: ['incompleteInventory', 'truncatedDiff', 'missingContext', 'nonTextChange', 'excludedContent', 'unsupportedChange', 'staleSource'] },
		message: reference('reason'), fileId: nullable(reference('id')), hunkId: nullable(reference('id'))
	}),
	analysis: object({
		source: reference('source'),
		groups: array('group', 100),
		files: array('file', 200),
		hunks: array('hunk', 500),
		limitations: array('limitation', 200),
	}),
};

export const semanticDiffValidationSubmissionSchema: IJSONSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	...object({ schemaVersion: { const: 1 }, analysis: reference('analysis') }),
	$defs: definitions
};

/** Provider schema bridges do not all resolve references or recognize const; cross-field rules live in the tool description. */
const providerAnalysisSchema = inlineSchema(definitions.analysis);

export const semanticDiffSubmissionSchema: ObjectSchema = object({ schemaVersion: { const: 1, enum: [1] }, analysis: providerAnalysisSchema });

function inlineSchema(schema: IJSONSchema): IJSONSchema {
	if (schema.$ref) {
		const { $ref, ...overrides } = schema;
		return inlineSchema({
			...inlineSchema(definitions[$ref.slice('#/$defs/'.length)]),
			...overrides,
		});
	}
	const result = { ...schema };
	if (schema.properties) {
		result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, inlineSchema(property)]));
	}
	if (schema.items) {
		result.items = Array.isArray(schema.items) ? schema.items.map(inlineSchema) : inlineSchema(schema.items);
	}
	if (schema.anyOf) {
		result.anyOf = schema.anyOf.map(inlineSchema);
	}
	return result;
}
