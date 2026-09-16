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
	aggregateCount: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
	reason: text(400),
	changeType: { enum: ['logic', 'test', 'supporting'] },
	confidence: { enum: ['high', 'medium', 'low'] },
	range: object({ start: reference('count'), count: reference('count') }),
	reviewRange: object({
		start: reference('count'),
		count: { type: 'integer', minimum: 1, maximum: 2147483647 }
	}),
	attentionBlock: object({
		attention: {
			enum: ['hot', 'warm', 'cold'],
			description: 'Review attention within the hunk, independent of its change type and classification confidence. Hot: core behavior, contract, failure path, or distinguishing assertion. Warm: implementation needed to understand that core. Cold: accompanying wiring, formatting, generated output, or documentation. No level means safe or skippable.',
		},
		oldRanges: array('reviewRange', 100),
		newRanges: array('reviewRange', 100),
		reason: {
			...text(160),
			description: 'Concrete source-based reason for this block attention. Do not infer attention from an AST structural/code label alone.',
		},
	}),
	source: {
		...object({
			repositoryLabel: text(120),
			comparison: { enum: ['staged', 'workingTree', 'commitRange'] },
			baseRevision: reference('revision'),
			targetRevision: nullable(reference('revision')),
			diffFingerprint: nullable({ type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }),
			capturedAt: { type: 'string', format: 'date-time' },
			inventoryComplete: { type: 'boolean' }
		}),
		allOf: [{
			if: { properties: { comparison: { const: 'commitRange' } } },
			then: { properties: { targetRevision: reference('revision') } },
			else: { properties: { targetRevision: { type: 'null' } } }
		}]
	},
	group: object({
		id: reference('id'),
		title: text(100),
		description: {
			...text(600),
			description: 'A self-contained review brief of 2-3 sentences, at most 600 characters. Lead with the logical unit\'s purpose and resulting behavior or contract, explain how the related edits work together, and include an evidence-supported boundary case, compatibility constraint, dependency, or test coverage. Every behavioral or contractual claim must follow from inspected mechanics, an explicit contract, or a test; do not infer timing, replay, retention, loss, atomicity, durability, cleanup completion, event ordering, final state, or motivation from an operation name or familiar pattern. Focus on intent and impact, not a file/hunk inventory or a restatement of the title. Do not invent motivation or claim tests passed without evidence.',
		},
	}),
	file: {
		...object({
			id: reference('id'), path: reference('path'), oldPath: nullable(reference('path')),
			status: { enum: ['added', 'modified', 'deleted', 'renamed'] },
			contentKind: { enum: ['text', 'binary', 'metadata'] }
		}),
		allOf: [{
			if: { properties: { status: { const: 'renamed' } } },
			then: { properties: { oldPath: reference('path') } },
			else: { properties: { oldPath: { type: 'null' } } }
		}]
	},
	classification: {
		...object({
			groupId: {
				...reference('id'),
				description: 'The single group that owns this hunk. Choose the best-supported intent and never duplicate a hunk across groups.',
			},
			changeType: {
				...reference('changeType'),
				description: 'The single hunk-level change type that controls filtering. Use logic for production behavior or public contracts, test for hand-authored tests and fixtures, and supporting for import-only, comment-only, formatting-only, routine wiring, and generated-output hunks. For mixed hunks, choose by intent precedence: logic, then test, then supporting.',
			},
			summary: text(160), groupReason: reference('reason'), typeReason: reference('reason'),
			groupConfidence: reference('confidence'), typeConfidence: reference('confidence'),
			uncertainty: nullable(reference('reason'))
		}),
		allOf: [{
			if: {
				anyOf: [
					{ properties: { groupConfidence: { const: 'low' } } },
					{ properties: { typeConfidence: { const: 'low' } } }
				]
			},
			then: { properties: { uncertainty: reference('reason') } }
		}]
	},
	hunk: object({
		id: reference('id'), fileId: reference('id'), oldRange: reference('range'), newRange: reference('range'),
		additions: reference('count'), deletions: reference('count'), classification: reference('classification'),
		attentionBlocks: {
			...array('attentionBlock', 100),
			minItems: 1,
			description: 'Partition all changed lines into coherent blocks with hot, warm, or cold review attention. Use absolute baseline and modified coordinates, ordered non-overlapping ranges, and changed lines only. Cover every added and deleted line exactly once. Attention changes the hue of the hunk change-type color without changing filtering or badge counts.',
		},
	}),
	limitation: object({
		code: { enum: ['incompleteInventory', 'truncatedDiff', 'missingContext', 'nonTextChange', 'excludedContent', 'unsupportedChange', 'staleSource'] },
		message: reference('reason'), fileId: nullable(reference('id')), hunkId: nullable(reference('id'))
	}),
	analysis: object({
		source: reference('source'),
		groups: {
			...array('group', 100),
			description: 'Mutually exclusive semantic groups in recommended review order; cards render in exactly this array order. Each assigned hunk belongs to one group, although a file can contribute different hunks to different groups. Put prerequisite contracts and foundational behavior before their consumers, then prioritize higher-impact independent changes before routine cleanup. Do not sort by filename, title, diff size, or change type.',
		},
		files: array('file', 200),
		hunks: {
			...array('hunk', 500),
			description: 'Every classified Git hunk exactly once. Do not copy a file or range under another ID or group. If evidence cannot support a concrete group or change type, omit the unresolved hunk, mark the inventory incomplete, and record a limitation.',
		},
		limitations: {
			...array('limitation', 200),
			description: 'Missing or constrained repository source evidence that limits this semantic classification. Do not include runtime, model, active skill or tool implementation, instruction provenance, checksum, or usage availability; record that operational metadata outside analysis. Every limitation makes the report partial.',
		}
	}),
	summary: object({
		groups: reference('count'), files: reference('count'), hunks: reference('count'),
		uncertainHunks: reference('count'),
		additions: reference('aggregateCount'), deletions: reference('aggregateCount'),
		byChangeType: object({
			logic: reference('count'), test: reference('count'), supporting: reference('count')
		})
	})
};

export const semanticDiffValidationSubmissionSchema: IJSONSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	...object({ schemaVersion: { const: 1 }, analysis: reference('analysis') }),
	$defs: definitions
};

/** Provider schema bridges do not all resolve references or recognize const. */
const providerAnalysisSchema = inlineSchema(definitions.analysis);

export const semanticDiffSubmissionSchema: ObjectSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	...object({ schemaVersion: { const: 1, enum: [1] }, analysis: providerAnalysisSchema })
};

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
	for (const keyword of ['anyOf', 'allOf', 'oneOf'] as const) {
		if (schema[keyword]) {
			result[keyword] = schema[keyword].map(inlineSchema);
		}
	}
	for (const keyword of ['if', 'then', 'else'] as const) {
		if (schema[keyword]) {
			result[keyword] = inlineSchema(schema[keyword]);
		}
	}
	return result;
}

export const semanticDiffReportSchema: IJSONSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	...object({
		schemaVersion: { const: 1 }, kind: { const: 'semanticDiffClassification' },
		status: { enum: ['complete', 'partial'] }, sourceVerification: { const: 'agent-reported' },
		analysis: reference('analysis'), summary: reference('summary')
	}),
	$defs: definitions
};
