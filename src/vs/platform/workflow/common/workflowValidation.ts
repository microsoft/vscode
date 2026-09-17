/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { getStructuralKey, structuralEquals } from '../../../base/common/equals.js';
import { IJSONSchema, JSONSchemaType } from '../../../base/common/jsonSchema.js';
import { deepFreeze } from '../../../base/common/objects.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ResolvedWorkflowCheckpoint, WorkflowCheckDefinition, WorkflowCheckpointType, WorkflowDefinition, WorkflowEvidence, WorkflowInputBinding, WorkflowObject, WorkflowReceipt, WorkflowRun, WorkflowSchemaFormat, WorkflowSnapshot, WorkflowValue } from './workflow.js';

export const workflowValidationLimits = Object.freeze({
	schemaDepth: 16,
	valueDepth: 32,
	schemaNodes: 2048,
	valueNodes: 16384,
	schemaBytes: 65536,
	valueBytes: 262144,
	snapshotBytes: 1048576,
	runBytes: 4194304,
	instructionLength: 65536,
	checkpoints: 128,
	validationSteps: 131072,
});

export class WorkflowValidationError extends Error {
	constructor(readonly path: string, detail: string) {
		super(localize('workflow.invalid', "Invalid workflow at '{0}': {1}", path, detail));
		this.name = 'WorkflowValidationError';
	}
}

class WorkflowValidationBudgetError extends WorkflowValidationError {
	constructor(path: string) {
		super(path, localize('workflow.validationComplexity', "The schema validation complexity limit was exceeded."));
	}
}

const schemaKeywords = new Set([
	'type', 'title', 'description', '$comment', 'properties', 'required', 'additionalProperties', 'minProperties', 'maxProperties',
	'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'format',
	'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'enum', 'const', 'allOf', 'anyOf', 'oneOf',
]);
const schemaTypes: readonly JSONSchemaType[] = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

function fail(path: string, detail: string): never {
	throw new WorkflowValidationError(path, detail);
}

function expect(condition: boolean, path: string, expected: string): asserts condition {
	if (!condition) {
		fail(path, localize('workflow.expected', "Expected {0}.", expected));
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function record(value: unknown, path: string): void {
	expect(isRecord(value), path, 'object');
}

function keys(value: object, allowed: readonly string[] | ReadonlySet<string>, path: string): void {
	for (const key of Object.keys(value)) {
		expect(!forbiddenKeys.has(key) && (Array.isArray(allowed) ? allowed.includes(key) : (allowed as ReadonlySet<string>).has(key)), `${path}.${key}`, 'a supported property');
	}
}

function text(value: unknown, path: string, maximum = 4096, nonEmpty = true): asserts value is string {
	expect(typeof value === 'string' && (!nonEmpty || value.trim().length > 0) && value.length <= maximum, path, `string (${nonEmpty ? 1 : 0}…${maximum})`);
}

function identifier(value: unknown, path: string): asserts value is string {
	text(value, path, 256);
	expect(/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]*$/.test(value), path, 'identifier');
}

function nonNegativeInteger(value: unknown, path: string): asserts value is number {
	expect(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, path, 'non-negative integer');
}

function serializable(value: unknown, maxBytes: number, allowUndefined = false, maxDepth: number = workflowValidationLimits.valueDepth, maxNodes: number = workflowValidationLimits.valueNodes): void {
	const ancestors = new Set<object>();
	let nodes = 0;
	let characters = 0;
	const visit = (item: unknown, path: string, depth: number): void => {
		expect(++nodes <= maxNodes && depth <= maxDepth, path, 'bounded JSON data');
		if (typeof item === 'string') {
			characters += item.length;
			expect(characters <= maxBytes, path, 'bounded JSON data');
		} else if (typeof item === 'number') {
			expect(Number.isFinite(item), path, 'finite number');
		} else if (item !== null && typeof item !== 'boolean') {
			expect(Array.isArray(item) || isRecord(item), path, 'JSON value');
			expect(!ancestors.has(item), path, 'acyclic JSON data');
			ancestors.add(item);
			for (const key of Reflect.ownKeys(item)) {
				if (Array.isArray(item) && key === 'length') {
					continue;
				}
				const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
				expect(typeof key === 'string' && descriptor.enumerable === true && Object.hasOwn(descriptor, 'value'), path, 'enumerable JSON data properties');
			}
			for (const [key, child] of Object.entries(item)) {
				expect(!forbiddenKeys.has(key), `${path}.${key}`, 'safe property name');
				characters += key.length;
				expect(characters <= maxBytes, path, 'bounded JSON data');
				if (Array.isArray(item)) {
					expect(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length, path, 'JSON array index');
				}
				if (child !== undefined || !allowUndefined || Array.isArray(item)) {
					visit(child, `${path}.${key}`, depth + 1);
				}
			}
			if (Array.isArray(item)) {
				expect(Object.keys(item).length === item.length, path, 'dense JSON array');
			}
			ancestors.delete(item);
		}
	};
	visit(value, '$', 0);
	expect(VSBuffer.fromString(JSON.stringify(value)).byteLength <= maxBytes, '$', `JSON data ≤ ${maxBytes} bytes`);
}

/** Supported keywords are explicit; references, defaults, patterns and unrecognized formats are rejected. */
export function validateWorkflowSchema(schema: unknown): asserts schema is IJSONSchema {
	serializable(schema, workflowValidationLimits.schemaBytes, false, workflowValidationLimits.schemaDepth * 3, workflowValidationLimits.schemaNodes);
	const visit = (node: IJSONSchema, path: string, depth: number): void => {
		record(node, path);
		expect(depth <= workflowValidationLimits.schemaDepth, path, 'bounded schema depth');
		keys(node, schemaKeywords, path);
		if (node.type !== undefined) {
			const types = Array.isArray(node.type) ? node.type : [node.type];
			expect(types.length > 0 && new Set(types).size === types.length && types.every(type => schemaTypes.includes(type)), `${path}.type`, 'JSON Schema type');
		}
		for (const key of ['title', 'description', '$comment'] as const) {
			if (node[key] !== undefined) {
				text(node[key], `${path}.${key}`, workflowValidationLimits.instructionLength, false);
			}
		}
		for (const key of ['minProperties', 'maxProperties', 'minItems', 'maxItems', 'minLength', 'maxLength'] as const) {
			if (node[key] !== undefined) {
				nonNegativeInteger(node[key], `${path}.${key}`);
			}
		}
		for (const [minimum, maximum] of [['minProperties', 'maxProperties'], ['minItems', 'maxItems'], ['minLength', 'maxLength']] as const) {
			expect(node[minimum] === undefined || node[maximum] === undefined || node[minimum]! <= node[maximum]!, path, `${minimum} ≤ ${maximum}`);
		}
		for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const) {
			const value = node[key];
			if (value !== undefined) {
				expect(typeof value === 'number' && Number.isFinite(value), `${path}.${key}`, 'finite number');
			}
		}
		expect(node.multipleOf === undefined || node.multipleOf > 0, `${path}.multipleOf`, 'positive number');
		expect(node.minimum === undefined || node.maximum === undefined || node.minimum <= node.maximum, path, 'minimum ≤ maximum');
		if (node.format !== undefined) {
			expect(node.format === WorkflowSchemaFormat.Uri || node.format === WorkflowSchemaFormat.IanaTimeZone, `${path}.format`, 'uri or iana-time-zone');
		}
		if (node.uniqueItems !== undefined) {
			expect(typeof node.uniqueItems === 'boolean', `${path}.uniqueItems`, 'boolean');
		}
		if (node.properties !== undefined) {
			record(node.properties, `${path}.properties`);
			for (const [name, property] of Object.entries(node.properties)) {
				visit(property, `${path}.properties.${name}`, depth + 1);
			}
		}
		if (node.required !== undefined) {
			expect(Array.isArray(node.required) && node.required.every(key => typeof key === 'string' && !forbiddenKeys.has(key)) && new Set(node.required).size === node.required.length, `${path}.required`, 'unique property names');
		}
		if (node.additionalProperties !== undefined && typeof node.additionalProperties !== 'boolean') {
			visit(node.additionalProperties, `${path}.additionalProperties`, depth + 1);
		}
		if (node.items !== undefined) {
			expect(!Array.isArray(node.items), `${path}.items`, 'one item schema (not a tuple)');
			visit(node.items, `${path}.items`, depth + 1);
		}
		if (node.enum !== undefined) {
			expect(Array.isArray(node.enum) && node.enum.length > 0, `${path}.enum`, 'non-empty enum');
			expect(new Set(node.enum.map(value => getStructuralKey(value))).size === node.enum.length, `${path}.enum`, 'unique enum values');
		}
		for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
			const alternatives = node[key];
			if (alternatives !== undefined) {
				expect(Array.isArray(alternatives) && alternatives.length > 0, `${path}.${key}`, 'non-empty schema array');
				for (const [index, alternative] of alternatives.entries()) {
					visit(alternative, `${path}.${key}[${index}]`, depth + 1);
				}
			}
		}
	};
	visit(schema as IJSONSchema, '$schema', 0);
}

function validateObjectSchema(schema: unknown, path: string): asserts schema is IJSONSchema {
	validateWorkflowSchema(schema);
	expect(schema.type === 'object', `${path}.type`, 'object');
}

/** Validates the input contract without requiring values for its required properties. */
export function validateWorkflowInputSchema(schema: unknown): asserts schema is IJSONSchema {
	validateObjectSchema(schema, '$schema');
}

function matchesType(value: WorkflowValue, type: JSONSchemaType): boolean {
	switch (type) {
		case 'object': return isRecord(value);
		case 'array': return Array.isArray(value);
		case 'integer': return typeof value === 'number' && Number.isInteger(value);
		case 'null': return value === null;
		default: return typeof value === type;
	}
}

function validateValue(value: WorkflowValue, schema: IJSONSchema, path: string, budget: { remaining: number } = { remaining: workflowValidationLimits.validationSteps }, partialInputs = false): void {
	if (--budget.remaining < 0) {
		throw new WorkflowValidationBudgetError(path);
	}
	if (schema.type !== undefined) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		expect(types.some(type => matchesType(value, type)), path, types.join(' | '));
	}
	if (Object.hasOwn(schema, 'const')) {
		expect(partialInputs && isRecord(value) && isRecord(schema.const)
			? Object.entries(value).every(([key, item]) => Object.hasOwn(schema.const, key) && structuralEquals(item, schema.const[key]))
			: structuralEquals(value, schema.const), path, 'const');
	}
	if (schema.enum) {
		expect(schema.enum.some(candidate => partialInputs && isRecord(value) && isRecord(candidate)
			? Object.entries(value).every(([key, item]) => Object.hasOwn(candidate, key) && structuralEquals(item, candidate[key]))
			: structuralEquals(value, candidate)), path, 'enum value');
	}
	for (const alternative of schema.allOf ?? []) {
		validateValue(value, alternative, path, budget, partialInputs);
	}
	for (const key of ['anyOf', 'oneOf'] as const) {
		if (schema[key]) {
			const count = schema[key].filter(alternative => {
				try {
					validateValue(value, alternative, path, budget, partialInputs);
					return true;
				} catch (error) {
					if (!(error instanceof WorkflowValidationError) || error instanceof WorkflowValidationBudgetError) {
						throw error;
					}
					return false;
				}
			}).length;
			expect(key === 'anyOf' || partialInputs ? count > 0 : count === 1, path, key);
		}
	}
	if (isRecord(value)) {
		for (const key of partialInputs ? [] : schema.required ?? []) {
			expect(Object.hasOwn(value, key), `${path}.${key}`, 'required property');
		}
		const entries = Object.entries(value);
		expect(entries.length >= (partialInputs ? 0 : schema.minProperties ?? 0) && entries.length <= (schema.maxProperties ?? Infinity), path, 'property count within schema bounds');
		for (const [key, item] of entries) {
			const property = schema.properties?.[key];
			expect(property !== undefined || schema.additionalProperties !== false, `${path}.${key}`, 'declared property');
			const itemSchema = property ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined);
			if (itemSchema) {
				validateValue(item, itemSchema, `${path}.${key}`, budget);
			}
		}
	} else if (Array.isArray(value)) {
		expect(value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity), path, 'array length within schema bounds');
		const seen = new Set<string>();
		for (const [index, item] of value.entries()) {
			if (schema.items) {
				validateValue(item, schema.items as IJSONSchema, `${path}[${index}]`, budget);
			}
			if (schema.uniqueItems) {
				const key = getStructuralKey(item);
				expect(!seen.has(key), `${path}[${index}]`, 'unique array item');
				seen.add(key);
			}
		}
	} else if (typeof value === 'string') {
		const length = Array.from(value).length;
		expect(length >= (schema.minLength ?? 0) && length <= (schema.maxLength ?? Infinity), path, 'string length within schema bounds');
		if (schema.format === WorkflowSchemaFormat.Uri) {
			try {
				expect(!/\s/.test(value), path, 'absolute URI');
				URI.parse(value, true);
			} catch {
				fail(path, localize('workflow.absoluteUri', "Expected an absolute URI. A URI does not grant access to its resource."));
			}
		} else if (schema.format === WorkflowSchemaFormat.IanaTimeZone) {
			expect(isWorkflowTimeZone(value), path, 'IANA timezone name');
		}
	} else if (typeof value === 'number') {
		expect(value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), path, 'number within schema bounds');
		expect(schema.exclusiveMinimum === undefined || value > (schema.exclusiveMinimum as number), path, 'exclusiveMinimum');
		expect(schema.exclusiveMaximum === undefined || value < (schema.exclusiveMaximum as number), path, 'exclusiveMaximum');
		if (schema.multipleOf !== undefined) {
			const quotient = value / schema.multipleOf;
			expect(Number.isFinite(quotient) && Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4, path, 'multipleOf');
		}
	}
}

export function isWorkflowTimeZone(value: WorkflowValue | undefined): value is string {
	if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) {
		return false;
	}
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export function validateWorkflowValue(value: unknown, schema: IJSONSchema = {}): asserts value is WorkflowValue {
	validateWorkflowSchema(schema);
	serializable(value, workflowValidationLimits.valueBytes);
	validateValue(value as WorkflowValue, schema, '$value');
}

export function validateWorkflowObject(value: unknown, schema: IJSONSchema = {}): asserts value is WorkflowObject {
	record(value, '$value');
	validateWorkflowValue(value, schema);
}

/** Validates supplied workflow values; absent fields are requested by their first consuming checkpoint. */
export function validateWorkflowInputs(value: unknown, schema: IJSONSchema = {}): asserts value is WorkflowObject {
	record(value, '$value');
	validateWorkflowSchema(schema);
	serializable(value, workflowValidationLimits.valueBytes);
	const fields = new Set<string>();
	const collectFields = (schema: IJSONSchema): void => {
		for (const key of [...Object.keys(schema.properties ?? {}), ...schema.required ?? []]) {
			fields.add(key);
		}
		for (const alternative of [...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []]) {
			collectFields(alternative);
		}
	};
	collectFields(schema);
	validateValue(value as WorkflowObject, schema, '$value', undefined, [...fields].some(key => !Object.hasOwn(value as WorkflowObject, key)));
}

export function getMissingWorkflowInputs(run: Pick<WorkflowRun, 'snapshot' | 'checkpointIndex' | 'inputs'>): readonly string[] {
	const checkpoint = run.snapshot.checkpoints[run.checkpointIndex];
	return [...new Set(Object.values(checkpoint?.inputs ?? {}).flatMap(binding =>
		hasKey(binding, { input: true }) && !Object.hasOwn(run.inputs, binding.input) ? [binding.input] : [],
	))];
}

export function validateWorkflowEvidence(value: unknown): asserts value is readonly WorkflowEvidence[] {
	validateWorkflowValue(value, {
		type: 'array', maxItems: 128,
		items: {
			type: 'object', required: ['kind', 'uri', 'label'], additionalProperties: false,
			properties: {
				kind: { enum: ['file', 'pullRequest', 'issue', 'link'] },
				uri: { type: 'string', format: 'uri' },
				label: { type: 'string', minLength: 1, maxLength: 4096 },
				state: { enum: ['open', 'closed', 'merged', 'draft'] },
				stateReason: { enum: ['completed', 'not_planned', 'duplicate', 'reopened'] },
			},
		},
	});
	expect(Array.isArray(value), '$value', 'array');
	for (const [index, evidence] of value.entries()) {
		expect(isRecord(evidence), `$value[${index}]`, 'object');
		if (evidence.state !== undefined) {
			expect(evidence.kind === 'pullRequest' || (evidence.kind === 'issue' && (evidence.state === 'open' || evidence.state === 'closed')), `$value[${index}].state`, 'a state for this GitHub resource kind');
		}
		if (evidence.stateReason !== undefined) {
			expect(evidence.kind === 'issue', `$value[${index}].stateReason`, 'an issue state reason');
		}
	}
}

function validateSource(source: WorkflowSnapshot['source'], path: string): void {
	if (source === undefined) {
		return;
	}
	record(source, path);
	keys(source, ['kind', 'id', 'label', 'uri'], path);
	expect(['builtin', 'extension', 'workspace', 'user'].includes(source.kind), `${path}.kind`, 'source kind');
	text(source.id, `${path}.id`);
	if (source.label !== undefined) {
		text(source.label, `${path}.label`);
	}
	if (source.uri !== undefined) {
		validateValue(source.uri, { type: 'string', format: 'uri' }, `${path}.uri`);
	}
}

function validateBindingsShape(bindings: Readonly<Record<string, WorkflowInputBinding>>, path: string): void {
	record(bindings, path);
	for (const [key, binding] of Object.entries(bindings)) {
		text(key, path, 256);
		record(binding, `${path}.${key}`);
		if (hasKey(binding, { value: true })) {
			keys(binding, ['value'], `${path}.${key}`);
			validateWorkflowValue(binding.value);
		} else if (hasKey(binding, { input: true })) {
			keys(binding, ['input'], `${path}.${key}`);
			text(binding.input, `${path}.${key}.input`, 256);
		} else {
			keys(binding, ['checkpoint', 'outputPointer'], `${path}.${key}`);
			identifier(binding.checkpoint, `${path}.${key}.checkpoint`);
			pointerSegments(binding.outputPointer);
		}
	}
}

function validateCheck(check: WorkflowCheckDefinition, path: string, inputSchema: IJSONSchema | undefined): void {
	record(check, path);
	keys(check, ['check', 'inputs', 'options'], path);
	identifier(check.check, `${path}.check`);
	if (check.inputs !== undefined) {
		validateBindingsShape(check.inputs, `${path}.inputs`);
		for (const [name, binding] of Object.entries(check.inputs)) {
			if (hasKey(binding, { input: true })) {
				propertySchema(inputSchema, binding.input, `${path}.inputs.${name}`);
			}
		}
	}
	if (check.options !== undefined) {
		validateWorkflowObject(check.options);
	}
}

export function validateWorkflowCheckpointType(value: unknown): asserts value is WorkflowCheckpointType {
	serializable(value, workflowValidationLimits.snapshotBytes, true);
	validateType(value as WorkflowCheckpointType, '$type');
}

/** Returns the exact reference from the stable identifier and separately declared version. */
export function getWorkflowCheckpointTypeReference(type: Pick<WorkflowCheckpointType, 'id' | 'version'>): string {
	return `${type.id}@${type.version}`;
}

function validateType(type: WorkflowCheckpointType, path: string): void {
	record(type, path);
	keys(type, ['id', 'version', 'label', 'description', 'instructions', 'inputSchema', 'proofSchema', 'outputSchema', 'startCondition', 'completion', 'source'], path);
	identifier(type.id, `${path}.id`);
	nonNegativeInteger(type.version, `${path}.version`);
	expect(type.version > 0, `${path}.version`, 'positive version');
	text(type.label, `${path}.label`);
	text(type.instructions, `${path}.instructions`, workflowValidationLimits.instructionLength);
	if (type.description !== undefined) {
		text(type.description, `${path}.description`);
	}
	for (const name of ['inputSchema', 'proofSchema', 'outputSchema'] as const) {
		const schema = type[name];
		if (name === 'proofSchema' || schema !== undefined) {
			validateObjectSchema(schema, `${path}.${name}`);
		}
	}
	if (type.startCondition !== undefined) {
		validateCheck(type.startCondition, `${path}.startCondition`, type.inputSchema);
	}
	record(type.completion, `${path}.completion`);
	if (type.completion.kind === 'reported') {
		keys(type.completion, ['kind'], `${path}.completion`);
		if (type.outputSchema) {
			expect(schemaAssignable(type.proofSchema, type.outputSchema), `${path}.outputSchema`, 'schema compatible with reported proof');
		}
	} else {
		keys(type.completion, ['kind', 'check'], `${path}.completion`);
		expect(type.completion.kind === 'checked', `${path}.completion.kind`, 'reported | checked');
		validateCheck(type.completion.check, `${path}.completion.check`, type.inputSchema);
	}
	validateSource(type.source, `${path}.source`);
}

function validateHeader(definition: WorkflowDefinition | WorkflowSnapshot): void {
	identifier(definition.id, '$.id');
	nonNegativeInteger(definition.version, '$.version');
	expect(definition.version > 0, '$.version', 'positive version');
	text(definition.label, '$.label');
	if (definition.description !== undefined) {
		text(definition.description, '$.description');
	}
	if (definition.inputSchema !== undefined) {
		validateObjectSchema(definition.inputSchema, '$.inputSchema');
	}
	expect(Array.isArray(definition.checkpoints) && definition.checkpoints.length > 0 && definition.checkpoints.length <= workflowValidationLimits.checkpoints, '$.checkpoints', `1…${workflowValidationLimits.checkpoints} checkpoints`);
	validateSource(definition.source, '$.source');
}

export function resolveWorkflowDefinition(definition: WorkflowDefinition, checkpointTypes: readonly WorkflowCheckpointType[]): WorkflowSnapshot {
	serializable(definition, workflowValidationLimits.snapshotBytes, true);
	record(definition, '$');
	keys(definition, ['id', 'version', 'label', 'description', 'inputSchema', 'checkpoints', 'source'], '$');
	validateHeader(definition);
	const types = new Map<string, WorkflowCheckpointType>();
	for (const type of checkpointTypes) {
		validateType(type, `$types.${type.id}`);
		const reference = getWorkflowCheckpointTypeReference(type);
		expect(!types.has(reference), `$types.${reference}`, 'unique checkpoint type version');
		types.set(reference, type);
	}
	const checkpoints = definition.checkpoints.map((checkpoint, index): ResolvedWorkflowCheckpoint => {
		const path = `$.checkpoints[${index}]`;
		record(checkpoint, path);
		keys(checkpoint, ['id', 'type', 'label', 'instructions', 'inputs', 'localType', 'afterCompletion'], path);
		identifier(checkpoint.type, `${path}.type`);
		if (checkpoint.label !== undefined) {
			text(checkpoint.label, `${path}.label`);
		}
		if (checkpoint.instructions !== undefined) {
			text(checkpoint.instructions, `${path}.instructions`, workflowValidationLimits.instructionLength);
		}
		if (checkpoint.inputs !== undefined) {
			validateBindingsShape(checkpoint.inputs, `${path}.inputs`);
		}
		let type: WorkflowCheckpointType | undefined;
		if (checkpoint.localType !== undefined) {
			validateType(checkpoint.localType, `${path}.localType`);
			type = checkpoint.localType;
			expect(getWorkflowCheckpointTypeReference(type) === checkpoint.type, `${path}.type`, 'matching local checkpoint type and version');
		} else {
			type = types.get(checkpoint.type);
		}
		expect(type !== undefined, `${path}.type`, 'resolved checkpoint type');
		return {
			id: checkpoint.id,
			type,
			label: checkpoint.label ?? type.label,
			instructions: checkpoint.instructions ?? type.instructions,
			inputs: checkpoint.inputs ?? {},
			afterCompletion: checkpoint.afterCompletion,
		};
	});
	const snapshot: WorkflowSnapshot = { ...definition, checkpoints };
	validateWorkflowSnapshot(snapshot);
	return deepFreeze(JSON.parse(JSON.stringify(snapshot)) as WorkflowSnapshot);
}

export function validateWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
	serializable(snapshot, workflowValidationLimits.snapshotBytes, true);
	record(snapshot, '$');
	keys(snapshot, ['id', 'version', 'label', 'description', 'inputSchema', 'checkpoints', 'source'], '$');
	validateHeader(snapshot);
	const ids = new Set<string>();
	for (const [index, checkpoint] of snapshot.checkpoints.entries()) {
		const path = `$.checkpoints[${index}]`;
		record(checkpoint, path);
		keys(checkpoint, ['id', 'type', 'label', 'instructions', 'inputs', 'afterCompletion'], path);
		identifier(checkpoint.id, `${path}.id`);
		expect(!ids.has(checkpoint.id), `${path}.id`, 'unique checkpoint identifier');
		ids.add(checkpoint.id);
		validateType(checkpoint.type, `${path}.type`);
		text(checkpoint.label, `${path}.label`);
		text(checkpoint.instructions, `${path}.instructions`, workflowValidationLimits.instructionLength);
		validateBindingsShape(checkpoint.inputs, `${path}.inputs`);
		if (checkpoint.afterCompletion !== undefined) {
			record(checkpoint.afterCompletion, `${path}.afterCompletion`);
			keys(checkpoint.afterCompletion, ['group'], `${path}.afterCompletion`);
			if (checkpoint.afterCompletion.group !== undefined) {
				text(checkpoint.afterCompletion.group, `${path}.afterCompletion.group`, 256);
			}
		}
		validateBindings(snapshot, index, checkpoint.inputs, snapshot.inputSchema, checkpoint.type.inputSchema, `${path}.inputs`);
		for (const check of [checkpoint.type.startCondition, checkpoint.type.completion.kind === 'checked' ? checkpoint.type.completion.check : undefined]) {
			if (check?.inputs) {
				validateBindings(snapshot, index, check.inputs, checkpoint.type.inputSchema, undefined, `${path}.check.inputs`);
			}
		}
	}
}

function pointerSegments(pointer: string): string[] {
	text(pointer, '$pointer', 4096, false);
	expect(pointer === '' || pointer.startsWith('/'), '$pointer', 'JSON Pointer');
	if (!pointer) {
		return [];
	}
	return pointer.slice(1).split('/').map(segment => {
		expect(!/~(?:[^01]|$)/.test(segment), '$pointer', 'JSON Pointer escape');
		const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
		expect(!forbiddenKeys.has(decoded), '$pointer', 'safe property name');
		return decoded;
	});
}

function propertySchema(schema: IJSONSchema | undefined, name: string, path: string): IJSONSchema {
	expect(schema?.type === 'object' && schema.required?.includes(name) === true && schema.properties?.[name] !== undefined, path, 'declared, required source property');
	return schema.properties[name];
}

function bindingSchema(snapshot: WorkflowSnapshot, index: number, binding: Exclude<WorkflowInputBinding, { readonly value: WorkflowValue }>, inputs: IJSONSchema | undefined, path: string): IJSONSchema {
	if (hasKey(binding, { input: true })) {
		return propertySchema(inputs, binding.input, path);
	}
	const sourceIndex = snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === binding.checkpoint);
	expect(sourceIndex >= 0 && sourceIndex < index, path, 'earlier checkpoint (no missing, forward or cyclic bindings)');
	const type = snapshot.checkpoints[sourceIndex].type;
	let schema = type.completion.kind === 'reported' ? type.proofSchema : type.outputSchema;
	expect(schema !== undefined, path, 'declared checked output schema');
	for (const segment of pointerSegments(binding.outputPointer)) {
		if (schema.type === 'array') {
			expect(/^(0|[1-9][0-9]*)$/.test(segment) && Number(segment) < (schema.minItems ?? 0) && schema.items !== undefined && !Array.isArray(schema.items), path, 'guaranteed array item');
			schema = schema.items;
		} else {
			schema = propertySchema(schema, segment, path);
		}
	}
	return schema;
}

function validateBindings(snapshot: WorkflowSnapshot, index: number, bindings: Readonly<Record<string, WorkflowInputBinding>>, inputSchema: IJSONSchema | undefined, target: IJSONSchema | undefined, path: string): void {
	const properties: Record<string, IJSONSchema> = {};
	const literals: Record<string, WorkflowValue> = {};
	let allLiteral = true;
	for (const name of target?.required ?? []) {
		expect(Object.hasOwn(bindings, name), `${path}.${name}`, 'binding for required input');
	}
	for (const [name, binding] of Object.entries(bindings)) {
		const destination = target?.properties?.[name] ?? (typeof target?.additionalProperties === 'object' ? target.additionalProperties : undefined);
		expect(destination !== undefined || target?.additionalProperties !== false, `${path}.${name}`, 'declared input');
		if (hasKey(binding, { value: true })) {
			properties[name] = { const: binding.value };
			literals[name] = binding.value;
			if (destination) {
				validateValue(binding.value, destination, `${path}.${name}`);
			}
		} else {
			const source = bindingSchema(snapshot, index, binding, inputSchema, `${path}.${name}`);
			properties[name] = source;
			allLiteral = false;
			expect(!destination || schemaAssignable(source, destination), `${path}.${name}`, 'compatible input and output schemas');
		}
	}
	if (target) {
		if (allLiteral) {
			validateValue(literals, target, path);
		} else {
			expect(schemaAssignable({ type: 'object', properties, required: Object.keys(bindings), additionalProperties: false }, target), path, 'compatible bound input object');
		}
	}
}

function boundsAssignable(source: IJSONSchema, target: IJSONSchema, minimum: 'minItems' | 'minLength' | 'minProperties', maximum: 'maxItems' | 'maxLength' | 'maxProperties'): boolean {
	return (source[minimum] ?? (minimum === 'minProperties' ? source.required?.length ?? 0 : 0)) >= (target[minimum] ?? 0)
		&& (source[maximum] ?? (maximum === 'maxProperties' && source.additionalProperties === false ? Object.keys(source.properties ?? {}).length : Infinity)) <= (target[maximum] ?? Infinity);
}

function schemaAssignable(source: IJSONSchema, target: IJSONSchema): boolean {
	if (structuralEquals(source, target)) {
		return true;
	}
	const finiteValues: WorkflowValue[] | undefined = Object.hasOwn(source, 'const') ? [source.const] : source.enum;
	if (finiteValues) {
		return finiteValues.every(value => {
			try {
				validateValue(value, target, '$binding');
				return true;
			} catch {
				return false;
			}
		});
	}
	if (target.enum || Object.hasOwn(target, 'const') || source.anyOf || source.oneOf || source.allOf || target.anyOf || target.oneOf || target.allOf) {
		return false;
	}
	const targetTypes = target.type === undefined ? schemaTypes : Array.isArray(target.type) ? target.type : [target.type];
	const sourceTypes = source.type === undefined ? schemaTypes : Array.isArray(source.type) ? source.type : [source.type];
	if (!sourceTypes.every(type => targetTypes.includes(type) || type === 'integer' && targetTypes.includes('number'))) {
		return false;
	}
	if (sourceTypes.includes('object')) {
		if (!boundsAssignable(source, target, 'minProperties', 'maxProperties')) {
			return false;
		}
		for (const key of target.required ?? []) {
			if (!source.required?.includes(key) || !source.properties?.[key]) {
				return false;
			}
		}
		for (const [key, schema] of Object.entries(target.properties ?? {})) {
			if (!source.properties?.[key] && source.additionalProperties !== false
				&& !schemaAssignable(typeof source.additionalProperties === 'object' ? source.additionalProperties : {}, schema)) {
				return false;
			}
		}
		if (target.additionalProperties === false && source.additionalProperties !== false) {
			return false;
		}
		for (const [key, schema] of Object.entries(source.properties ?? {})) {
			const destination = target.properties?.[key] ?? target.additionalProperties;
			if (destination === false || typeof destination === 'object' && !schemaAssignable(schema, destination)) {
				return false;
			}
		}
		if (typeof target.additionalProperties === 'object' && (source.additionalProperties !== false && (typeof source.additionalProperties !== 'object' || !schemaAssignable(source.additionalProperties, target.additionalProperties)))) {
			return false;
		}
	}
	if (sourceTypes.includes('array')) {
		if (!boundsAssignable(source, target, 'minItems', 'maxItems') || target.uniqueItems && !source.uniqueItems) {
			return false;
		}
		if (target.items && (!source.items || !schemaAssignable(source.items as IJSONSchema, target.items as IJSONSchema))) {
			return false;
		}
	}
	if (sourceTypes.includes('string') && (!boundsAssignable(source, target, 'minLength', 'maxLength') || target.format !== undefined && source.format !== target.format)) {
		return false;
	}
	if (sourceTypes.includes('number') || sourceTypes.includes('integer')) {
		if ((source.minimum ?? -Infinity) < (target.minimum ?? -Infinity) || (source.maximum ?? Infinity) > (target.maximum ?? Infinity)) {
			return false;
		}
		if (target.exclusiveMinimum !== undefined && !(typeof source.exclusiveMinimum === 'number' && source.exclusiveMinimum >= (target.exclusiveMinimum as number))
			|| target.exclusiveMaximum !== undefined && !(typeof source.exclusiveMaximum === 'number' && source.exclusiveMaximum <= (target.exclusiveMaximum as number))
			|| target.multipleOf !== undefined && source.multipleOf !== target.multipleOf) {
			return false;
		}
	}
	return true;
}

export function resolveWorkflowBindings(bindings: Readonly<Record<string, WorkflowInputBinding>>, inputs: WorkflowObject, receipts: readonly WorkflowReceipt[]): WorkflowObject {
	return Object.fromEntries(Object.entries(bindings).map(([name, binding]) => {
		if (hasKey(binding, { value: true })) {
			return [name, binding.value];
		}
		if (hasKey(binding, { input: true })) {
			expect(Object.hasOwn(inputs, binding.input), name, 'bound workflow input');
			return [name, inputs[binding.input]];
		}
		const receipt = receipts.find(receipt => receipt.checkpointId === binding.checkpoint);
		expect(receipt !== undefined, name, 'accepted checkpoint output');
		let value: WorkflowValue = receipt.output;
		for (const segment of pointerSegments(binding.outputPointer)) {
			expect((isRecord(value) || Array.isArray(value)) && Object.hasOwn(value, segment), name, 'bound checkpoint output');
			value = Array.isArray(value) ? value[Number(segment)] : (value as WorkflowObject)[segment];
		}
		return [name, value];
	}));
}

/** Validates persisted JSON before narrowing its type; index consistency remains the store's responsibility. */
export function validateWorkflowRun(value: unknown): asserts value is WorkflowRun {
	serializable(value, workflowValidationLimits.runBytes, true);
	record(value, '$run');
	validateWorkflowRunData(value as WorkflowRun);
}

function validateWorkflowRunData(run: WorkflowRun): void {
	keys(run, ['id', 'version', 'revision', 'session', 'chat', 'workspace', 'task', 'inputs', 'snapshot', 'stopAfter', 'status', 'checkpointIndex', 'receipts', 'startConditionReceipts', 'firstTurns', 'assignment', 'pendingAssignment', 'inputRequest', 'wait', 'verification', 'lastProof', 'reason', 'createdAt', 'updatedAt', 'activityAt', 'nextWakeAt', 'origin'], '$run');
	expect(run.version === 1, '$run.version', '1');
	identifier(run.id, '$run.id');
	text(run.session, '$run.session');
	text(run.chat, '$run.chat');
	text(run.task, '$run.task', workflowValidationLimits.instructionLength);
	if (run.workspace !== undefined) {
		text(run.workspace, '$run.workspace', 8192);
	}
	if (run.reason !== undefined) {
		text(run.reason, '$run.reason');
	}
	nonNegativeInteger(run.revision, '$run.revision');
	nonNegativeInteger(run.checkpointIndex, '$run.checkpointIndex');
	validateWorkflowSnapshot(run.snapshot);
	expect(run.checkpointIndex <= run.snapshot.checkpoints.length, '$run.checkpointIndex', 'checkpoint index within snapshot');
	expect(run.snapshot.checkpoints.some(checkpoint => checkpoint.id === run.stopAfter), '$run.stopAfter', 'checkpoint in snapshot');
	expect(['running', 'waiting', 'stopped', 'paused', 'blocked', 'completed', 'cancelled'].includes(run.status), '$run.status', 'run status');
	validateWorkflowInputs(run.inputs, run.snapshot.inputSchema);
	expect(Array.isArray(run.receipts) && run.receipts.length === run.checkpointIndex, '$run.receipts', 'one ordered receipt per completed checkpoint');
	const assignments = new Set<string>();
	for (const [index, receipt] of run.receipts.entries()) {
		const checkpoint = run.snapshot.checkpoints[index];
		record(receipt, '$run.receipts');
		keys(receipt, ['id', 'checkpointId', 'assignmentId', 'turnId', 'proof', 'output', 'evidence', 'provenance', 'acceptedAt', 'checkId'], '$run.receipts');
		identifier(receipt.id, '$run.receipts.id');
		identifier(receipt.assignmentId, '$run.receipts.assignmentId');
		text(receipt.turnId, '$run.receipts.turnId', 256);
		nonNegativeInteger(receipt.acceptedAt, '$run.receipts.acceptedAt');
		validateWorkflowEvidence(receipt.evidence);
		expect(receipt.checkpointId === checkpoint.id && !assignments.has(receipt.assignmentId), '$run.receipts', 'unique ordered receipt');
		assignments.add(receipt.assignmentId);
		expect(receipt.provenance === checkpoint.type.completion.kind, '$run.receipts.provenance', 'snapshot completion mode');
		validateWorkflowObject(receipt.proof, checkpoint.type.proofSchema);
		validateWorkflowObject(receipt.output, checkpoint.type.outputSchema ?? (receipt.provenance === 'reported' ? checkpoint.type.proofSchema : undefined));
		if (receipt.provenance === 'reported') {
			expect(structuralEquals(receipt.proof, receipt.output), '$run.receipts.output', 'reported proof');
			expect(receipt.checkId === undefined, '$run.receipts.checkId', 'no check identity for reported proof');
		} else {
			expect(checkpoint.type.completion.kind === 'checked' && receipt.checkId === checkpoint.type.completion.check.check, '$run.receipts.checkId', 'snapshot check identity');
		}
	}
	if (run.startConditionReceipts !== undefined) {
		expect(Array.isArray(run.startConditionReceipts) && run.startConditionReceipts.length <= run.snapshot.checkpoints.length, '$run.startConditionReceipts', 'bounded start-condition receipts');
		const checkpoints = new Set<string>();
		for (const receipt of run.startConditionReceipts) {
			record(receipt, '$run.startConditionReceipts');
			keys(receipt, ['id', 'checkpointId', 'assignmentId', 'checkId', 'output', 'evidence', 'provenance', 'observedAt'], '$run.startConditionReceipts');
			identifier(receipt.id, '$run.startConditionReceipts.id');
			identifier(receipt.checkpointId, '$run.startConditionReceipts.checkpointId');
			identifier(receipt.assignmentId, '$run.startConditionReceipts.assignmentId');
			identifier(receipt.checkId, '$run.startConditionReceipts.checkId');
			const index = run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === receipt.checkpointId);
			expect(index >= 0 && index <= run.checkpointIndex && !checkpoints.has(receipt.checkpointId), '$run.startConditionReceipts', 'one observation per reached checkpoint');
			checkpoints.add(receipt.checkpointId);
			expect(run.snapshot.checkpoints[index].type.startCondition?.check === receipt.checkId, '$run.startConditionReceipts.checkId', 'snapshot start condition');
			expect(receipt.provenance === 'checked', '$run.startConditionReceipts.provenance', 'checked');
			nonNegativeInteger(receipt.observedAt, '$run.startConditionReceipts.observedAt');
			validateWorkflowObject(receipt.output);
			validateWorkflowEvidence(receipt.evidence);
		}
	}
	record(run.firstTurns, '$run.firstTurns');
	for (const [checkpointId, turnId] of Object.entries(run.firstTurns)) {
		expect(run.snapshot.checkpoints.some(checkpoint => checkpoint.id === checkpointId), '$run.firstTurns', 'checkpoint in snapshot');
		text(turnId, '$run.firstTurns.turnId', 256);
	}
	for (const assignment of [run.assignment, run.pendingAssignment]) {
		if (assignment !== undefined) {
			record(assignment, '$run.assignment');
			keys(assignment, ['id', 'checkpointId', 'turnId', 'attempt', 'reason', 'inputs', 'createdAt', 'delivery', 'diagnostics', 'revoked', 'missingProofReminders', 'repairAttempts'], '$run.assignment');
			identifier(assignment.id, '$run.assignment.id');
			text(assignment.turnId, '$run.assignment.turnId', 256);
			const checkpoint = run.snapshot.checkpoints.find(checkpoint => checkpoint.id === assignment.checkpointId);
			expect(checkpoint !== undefined, '$run.assignment.checkpointId', 'checkpoint in snapshot');
			validateWorkflowObject(assignment.inputs, checkpoint.type.inputSchema);
			expect(structuralEquals(assignment.inputs, resolveWorkflowBindings(checkpoint.inputs, run.inputs, run.receipts)), '$run.assignment.inputs', 'resolved immutable inputs');
			expect(['pending', 'dispatching', 'running', 'ended'].includes(assignment.delivery), '$run.assignment.delivery', 'delivery state');
			nonNegativeInteger(assignment.attempt, '$run.assignment.attempt');
			expect(assignment.attempt > 0, '$run.assignment.attempt', 'positive attempt');
			expect(['start', 'previous_completed', 'repair', 'resume', 'missing_proof', 'reconcile'].includes(assignment.reason), '$run.assignment.reason', 'assignment reason');
			expect(assignment.revoked === undefined || typeof assignment.revoked === 'boolean', '$run.assignment.revoked', 'boolean');
			nonNegativeInteger(assignment.createdAt, '$run.assignment.createdAt');
			if (assignment.diagnostics !== undefined) {
				text(assignment.diagnostics, '$run.assignment.diagnostics');
			}
			if (assignment.missingProofReminders !== undefined) {
				nonNegativeInteger(assignment.missingProofReminders, '$run.assignment.missingProofReminders');
			}
			if (assignment.repairAttempts !== undefined) {
				nonNegativeInteger(assignment.repairAttempts, '$run.assignment.repairAttempts');
			}
		}
	}
	if (run.pendingAssignment !== undefined) {
		expect(run.pendingAssignment.delivery === 'pending' && run.pendingAssignment.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id, '$run.pendingAssignment', 'pending current checkpoint');
	}
	if (run.inputRequest !== undefined) {
		record(run.inputRequest, '$run.inputRequest');
		keys(run.inputRequest, ['checkpointId', 'keys'], '$run.inputRequest');
		expect((run.status === 'blocked' || run.status === 'paused') && !run.pendingAssignment && !run.wait && !run.verification && run.nextWakeAt === undefined, '$run.inputRequest', 'an inactive checkpoint awaiting inputs');
		expect(run.inputRequest.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id, '$run.inputRequest.checkpointId', 'the current checkpoint');
		expect(Array.isArray(run.inputRequest.keys) && run.inputRequest.keys.length > 0 && structuralEquals<readonly string[]>(run.inputRequest.keys, getMissingWorkflowInputs(run)), '$run.inputRequest.keys', 'missing bound workflow inputs');
	}
	if (run.wait !== undefined) {
		record(run.wait, '$run.wait');
		keys(run.wait, ['kind', 'checkpointId', 'reason', 'nextCheckAt', 'state', 'proof', 'assignmentId', 'turnId'], '$run.wait');
		expect(run.wait.checkpointId === run.snapshot.checkpoints[run.checkpointIndex]?.id && ['startCondition', 'completion'].includes(run.wait.kind), '$run.wait', 'wait for current checkpoint');
		text(run.wait.reason, '$run.wait.reason');
		if (run.wait.kind === 'completion') {
			expect(run.assignment !== undefined && run.wait.assignmentId === run.assignment.id && run.wait.turnId === run.assignment.turnId && run.wait.proof !== undefined, '$run.wait', 'original completion identity and proof');
			expect(run.snapshot.checkpoints[run.checkpointIndex].type.completion.kind === 'checked', '$run.wait', 'checked completion');
			validateWorkflowObject(run.wait.proof, run.snapshot.checkpoints[run.checkpointIndex].type.proofSchema);
		} else {
			expect(run.snapshot.checkpoints[run.checkpointIndex]?.type.startCondition !== undefined, '$run.wait', 'declared start condition');
			expect(run.wait.assignmentId === undefined && run.wait.turnId === undefined && run.wait.proof === undefined, '$run.wait', 'start condition without a proof or turn identity');
		}
		if (run.wait.state !== undefined) {
			validateWorkflowObject(run.wait.state);
		}
		nonNegativeInteger(run.wait.nextCheckAt, '$run.wait.nextCheckAt');
	}
	if (run.verification !== undefined) {
		record(run.verification, '$run.verification');
		keys(run.verification, ['id', 'kind', 'checkpointId', 'invocation', 'proof'], '$run.verification');
		identifier(run.verification.id, '$run.verification.id');
		expect(run.wait?.kind === run.verification.kind && run.wait.checkpointId === run.verification.checkpointId, '$run.verification', 'matching durable wait');
		if (run.verification.kind === 'completion') {
			record(run.verification.invocation, '$run.verification.invocation');
			keys(run.verification.invocation!, ['runId', 'assignmentId', 'turnId'], '$run.verification.invocation');
			expect(run.verification.invocation?.runId === run.id && run.verification.invocation.assignmentId === run.wait.assignmentId
				&& run.verification.invocation.turnId === run.wait.turnId && structuralEquals(run.verification.proof, run.wait.proof), '$run.verification', 'original invocation and proof');
		} else {
			expect(run.verification.invocation === undefined && run.verification.proof === undefined, '$run.verification', 'start condition without a proof invocation');
		}
	}
	if (run.lastProof !== undefined) {
		record(run.lastProof, '$run.lastProof');
		keys(run.lastProof, ['invocation', 'proof', 'result'], '$run.lastProof');
		record(run.lastProof.invocation, '$run.lastProof.invocation');
		keys(run.lastProof.invocation, ['runId', 'assignmentId', 'turnId'], '$run.lastProof.invocation');
		record(run.lastProof.result, '$run.lastProof.result');
		keys(run.lastProof.result, ['kind', 'reason'], '$run.lastProof.result');
		expect(run.assignment !== undefined, '$run.lastProof', 'original assignment');
		expect(run.lastProof.invocation.runId === run.id && run.lastProof.invocation.assignmentId === run.assignment?.id && run.lastProof.invocation.turnId === run.assignment.turnId, '$run.lastProof', 'original invocation');
		validateWorkflowObject(run.lastProof.proof, run.snapshot.checkpoints.find(checkpoint => checkpoint.id === run.assignment?.checkpointId)?.type.proofSchema);
		expect(run.lastProof.result.kind === 'rejected' || run.lastProof.result.kind === 'blocked', '$run.lastProof.result', 'cached rejection or blocker');
		text(run.lastProof.result.reason, '$run.lastProof.result.reason');
	}
	for (const key of ['createdAt', 'updatedAt', 'activityAt'] as const) {
		nonNegativeInteger(run[key], `$run.${key}`);
	}
	if (run.nextWakeAt !== undefined) {
		nonNegativeInteger(run.nextWakeAt, '$run.nextWakeAt');
		expect(run.status === 'running' || run.status === 'waiting', '$run.nextWakeAt', 'wake for an active workflow');
	}
	if (run.status === 'waiting') {
		expect(run.wait !== undefined, '$run.wait', 'durable wait');
	}
	if (run.status === 'completed') {
		expect(run.checkpointIndex === run.snapshot.checkpoints.length, '$run.checkpointIndex', 'all checkpoints completed');
	}
	if (run.origin !== undefined) {
		record(run.origin, '$run.origin');
		keys(run.origin, ['runId', 'checkpointId'], '$run.origin');
		identifier(run.origin.runId, '$run.origin.runId');
		identifier(run.origin.checkpointId, '$run.origin.checkpointId');
	}
}
