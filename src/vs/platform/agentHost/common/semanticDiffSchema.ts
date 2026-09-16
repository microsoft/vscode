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
	changeType: { enum: ['logic', 'test', 'supporting', 'generated'] },
	confidence: { enum: ['high', 'medium', 'low', null] },
	range: object({ start: reference('count'), count: reference('count') }),
	reviewRange: object({
		start: reference('count'),
		count: { type: 'integer', minimum: 1, maximum: 2147483647 }
	}),
	reviewFocus: {
		...object({
			oldRanges: {
				...array('reviewRange', 20),
				description: 'Absolute baseline ranges containing the changed lines that form the review focus. Use an empty array when the focus exists only on the modified side.',
			},
			newRanges: {
				...array('reviewRange', 20),
				description: 'Absolute modified-file ranges containing the changed lines that form the review focus. Use an empty array when the focus exists only on the baseline side.',
			},
			reason: {
				...text(160),
				description: 'A concise evidence-based explanation of why these changed lines are the best place to begin reviewing this hunk.',
			},
		}),
		description: 'Optional review focus for a narrower behavioral or contractual core within a Git hunk. Include only changed lines assigned to the hunk\'s primary change type and use absolute file coordinates. Split ranges around secondary-type or unchanged lines. This is a reading-order cue, not a safety, approval, risk, or confidence score.',
	},
	changeTypeRanges: {
		...object({
			changeType: {
				...nullable(reference('changeType')),
				description: 'Type of these changed lines, not inherited from the hunk primary type. Every changed import declaration line, including multi-line continuations, is supporting, never logic, test, or generated.',
			},
			oldRanges: {
				...array('reviewRange', 100),
				description: 'Absolute baseline ranges for every changed line assigned this type. Use an empty array when this type exists only on the modified side.',
			},
			newRanges: {
				...array('reviewRange', 100),
				description: 'Absolute modified-file ranges for every changed line assigned this type. Use an empty array when this type exists only on the baseline side.',
			},
		}),
		description: 'Exhaustive changed-line classification for one primary or secondary type. Ranges contain changed lines only, do not overlap another type, and use absolute file coordinates. Across all type entries, original range counts must total the hunk deletions and modified range counts must total the hunk additions. Changed imports belong exclusively to the supporting entry on each side; other entries must exclude them even in a primarily logic or test hunk.',
	},
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
				...nullable(reference('id')),
				description: 'The single group that owns this hunk. Choose the best-supported primary intent; never duplicate a hunk across groups. Null is a last resort after targeted investigation when no assignment is defensible.',
			},
			changeType: {
				...nullable(reference('changeType')),
				description: 'The best-supported primary change type. Import-only hunks are supporting, including imports in test or generated files. A bare constructor parameter or field that only makes a dependency available to behavior in another changed hunk is also supporting; it is logic when it changes a public or construction contract, default, optionality, ordering, or directly executes behavior. Changed imports mixed with non-import logic or test edits contribute supporting in secondaryChangeTypes while logic or test stays primary; their actual coordinates must also be assigned supporting in changeTypeRanges, never copied into a logic or test range. Unchanged imports in context do not count. Resolve ambiguous cases using relevant context and apply the documented priority for mixed types. Use low confidence for a defensible tentative assignment; null only when the type remains genuinely unresolved.',
			},
			secondaryChangeTypes: { ...array('changeType', 3), uniqueItems: true },
			summary: text(160), groupReason: reference('reason'), typeReason: reference('reason'),
			groupConfidence: reference('confidence'), typeConfidence: reference('confidence'),
			uncertainty: nullable(reference('reason'))
		}),
		allOf: [
			{
				if: { properties: { groupId: { type: 'null' } } },
				then: { properties: { groupConfidence: { type: 'null' } } },
				else: { properties: { groupConfidence: { enum: ['high', 'medium', 'low'] } } }
			},
			{
				if: { properties: { changeType: { type: 'null' } } },
				then: { properties: { typeConfidence: { type: 'null' }, secondaryChangeTypes: { maxItems: 0 } } },
				else: { properties: { typeConfidence: { enum: ['high', 'medium', 'low'] } } }
			},
			{
				if: {
					anyOf: [
						{ properties: { groupId: { type: 'null' } } },
						{ properties: { changeType: { type: 'null' } } },
						{ properties: { groupConfidence: { const: 'low' } } },
						{ properties: { typeConfidence: { const: 'low' } } }
					]
				},
				then: { properties: { uncertainty: reference('reason') } }
			}
		]
	},
	hunk: object({
		id: reference('id'), fileId: reference('id'), oldRange: reference('range'), newRange: reference('range'),
		additions: reference('count'), deletions: reference('count'), classification: reference('classification'),
		changeTypeRanges: {
			...array('changeTypeRanges', 4),
			description: 'One entry for the primary type followed by one entry for each secondary type. Together the ranges must classify every changed line on both sides exactly once: original range counts total deletions and modified range counts total additions. Put changed imports in supporting ranges even when the hunk primary is logic or test; listing supporting only as a secondary type is insufficient. A hunk with an unresolved primary type uses one null entry.',
		},
		reviewFocus: {
			...reference('reviewFocus'),
			description: 'Optional review focus for a narrower behavioral or contractual core within this Git hunk. Each focus range must be contained within a changed-line range for the hunk\'s primary change type. Split ranges around secondary-type or unchanged lines. For large or branch-heavy hunks, identify a narrower core when one exists; do not repeat nearly all primary-type ranges as focus. Omit this field when the whole hunk deserves equal attention or the evidence does not support a narrower focus. This is a reading-order cue, not a safety, approval, risk, or confidence score.',
		},
	}, ['changeTypeRanges', 'reviewFocus']),
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
			description: 'Every observed Git hunk exactly once. Do not copy a file/range under another ID or group. Revisit unresolved classifications before submission; preserve explicit uncertainty only where the available evidence cannot support an assignment.',
		},
		limitations: {
			...array('limitation', 200),
			description: 'Missing or constrained repository source evidence that limits this semantic classification. Do not include runtime, model, active skill or tool implementation, instruction provenance, checksum, or usage availability; record that operational metadata outside analysis. Every limitation makes the report partial.',
		}
	}),
	summary: object({
		groups: reference('count'), files: reference('count'), hunks: reference('count'),
		assignedHunks: reference('count'), unassignedHunks: reference('count'), untypedHunks: reference('count'),
		uncertainHunks: reference('count'), mixedTypeHunks: reference('count'),
		additions: reference('aggregateCount'), deletions: reference('aggregateCount'),
		byChangeType: object({
			logic: reference('count'), test: reference('count'), supporting: reference('count'),
			generated: reference('count'), unknown: reference('count')
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
const providerHunkSchema = providerAnalysisSchema.properties!.hunks.items as IJSONSchema;
providerHunkSchema.required = [...providerHunkSchema.required!, 'changeTypeRanges'];

export const semanticDiffSubmissionSchema: ObjectSchema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	...object({ schemaVersion: { const: 1, enum: [1] }, analysis: providerAnalysisSchema })
};

function inlineSchema(schema: IJSONSchema): IJSONSchema {
	if (schema.$ref) {
		return inlineSchema(definitions[schema.$ref.slice('#/$defs/'.length)]);
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
