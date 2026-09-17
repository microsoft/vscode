/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { workflowCheckpointSchemaId, workflowSchemaId } from './workflowCatalogModel.js';

const identityProperties: IJSONSchema['properties'] = {
	id: { type: 'string', minLength: 1, description: localize('workflow.schema.id', "Stable, namespaced identifier. Different sources must not define the same id and version.") },
	version: { type: 'integer', minimum: 1 },
	label: { type: 'string', minLength: 1 },
	description: { type: 'string' },
};
const embeddedSchema: IJSONSchema = { type: 'object', description: localize('workflow.schema.embedded', "Embedded JSON schema using the supported runtime schema keywords. References are not supported and external schemas are never fetched.") };
const bindings: IJSONSchema = {
	type: 'object',
	additionalProperties: {
		oneOf: [
			{ type: 'object', required: ['value'], properties: { value: {} }, additionalProperties: false },
			{ type: 'object', required: ['input'], properties: { input: { type: 'string', minLength: 1 } }, additionalProperties: false },
			{ type: 'object', required: ['checkpoint', 'outputPointer'], properties: { checkpoint: { type: 'string', minLength: 1 }, outputPointer: { type: 'string', pattern: '^(/|$)' } }, additionalProperties: false },
		],
	},
};
const check: IJSONSchema = {
	type: 'object',
	required: ['check'],
	properties: {
		check: { type: 'string', pattern: '^.+@[1-9][0-9]*$', description: localize('workflow.schema.check', "Versioned, read-only check implemented by the owning runtime.") },
		inputs: bindings,
		options: { type: 'object' },
	},
	additionalProperties: false,
};

export const workflowCheckpointSchema: IJSONSchema = {
	$id: workflowCheckpointSchemaId,
	type: 'object',
	allowComments: true,
	allowTrailingCommas: true,
	required: ['id', 'version', 'label', 'instructions', 'proofSchema', 'completion'],
	properties: {
		$schema: { enum: [workflowCheckpointSchemaId] },
		...identityProperties,
		instructions: { type: 'string' },
		inputSchema: embeddedSchema,
		proofSchema: embeddedSchema,
		outputSchema: embeddedSchema,
		startCondition: check,
		completion: {
			oneOf: [
				{ type: 'object', required: ['kind'], properties: { kind: { const: 'reported' } }, additionalProperties: false },
				{ type: 'object', required: ['kind', 'check'], properties: { kind: { const: 'checked' }, check }, additionalProperties: false },
			],
		},
	},
	additionalProperties: false,
};

export const workflowSchema: IJSONSchema = {
	$id: workflowSchemaId,
	type: 'object',
	allowComments: true,
	allowTrailingCommas: true,
	required: ['id', 'version', 'label', 'checkpoints'],
	properties: {
		$schema: { enum: [workflowSchemaId] },
		...identityProperties,
		inputSchema: embeddedSchema,
		checkpoints: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['id', 'type'],
				properties: {
					id: { type: 'string', minLength: 1 },
					type: { type: 'string', pattern: '^.+@[1-9][0-9]*$' },
					label: { type: 'string', minLength: 1 },
					instructions: { type: 'string', description: localize('workflow.schema.instructions', "Overrides instructions for this workflow only.") },
					inputs: bindings,
					localType: { ...workflowCheckpointSchema, $id: undefined, description: localize('workflow.schema.localType', "A contract local to this workflow. Editing it never changes the library type.") },
					afterCompletion: {
						type: 'object',
						properties: { group: { type: 'string', minLength: 1, description: localize('workflow.schema.group', "Existing group id or planned group name. A planned group is created only when the completed checkpoint moves the session.") } },
						additionalProperties: false,
					},
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
};
