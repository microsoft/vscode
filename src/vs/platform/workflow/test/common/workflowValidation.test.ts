/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkflowDefinition, WorkflowSchemaFormat, WorkflowSnapshot } from '../../common/workflow.js';
import { getWorkflowCheckpointTypeReference, resolveWorkflowBindings, resolveWorkflowDefinition, validateWorkflowCheckpointType, validateWorkflowEvidence, validateWorkflowInputs, validateWorkflowInputSchema, validateWorkflowObject, validateWorkflowRun, validateWorkflowSchema, validateWorkflowSnapshot, validateWorkflowValue, WorkflowValidationError, workflowValidationLimits } from '../../common/workflowValidation.js';
import { makeSnapshot, makeType, proofSchema } from './workflowTestUtils.js';

suite('Workflow validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const definition: WorkflowDefinition = {
		id: 'test.workflow', version: 1, label: 'Workflow',
		checkpoints: [{ id: 'first', type: 'type@1' }],
	};

	test('historical GitHub proof state survives serialization without accepting states on other resources', () => {
		const evidence = [
			{ kind: 'pullRequest', uri: 'https://github.com/example/project/pull/1', label: 'Feature', state: 'draft' },
			{ kind: 'pullRequest', uri: 'https://github.com/example/project/pull/1', label: 'Feature', state: 'merged' },
			{ kind: 'issue', uri: 'https://github.com/example/project/issues/2', label: 'Follow-up', state: 'closed', stateReason: 'not_planned' },
			{ kind: 'file', uri: 'file:///workspace/plan.md', label: 'Plan' },
		];
		const restored: unknown = JSON.parse(JSON.stringify(evidence));
		validateWorkflowEvidence(restored);
		assert.deepStrictEqual(restored, evidence);
		for (const value of [
			{ ...evidence[0], state: 'pending' },
			{ ...evidence[0], stateReason: 'completed' },
			{ ...evidence[2], state: 'merged' },
			{ ...evidence[3], state: 'draft' },
		]) {
			assert.throws(() => validateWorkflowEvidence([value]), WorkflowValidationError);
		}
	});

	test('resolves an immutable snapshot and explicit local instructions', () => {
		const type = makeType('type');
		const snapshot = resolveWorkflowDefinition({ ...definition, checkpoints: [{ id: 'first', type: 'type@1', instructions: 'Local instructions' }] }, [type]);
		type.proofSchema.properties!.summary.minLength = 2;
		assert.deepStrictEqual({
			instructions: snapshot.checkpoints[0].instructions,
			minLength: snapshot.checkpoints[0].type.proofSchema.properties!.summary.minLength,
			frozen: Object.isFrozen(snapshot.checkpoints[0].type.proofSchema),
		}, { instructions: 'Local instructions', minLength: 1, frozen: true });
		type.proofSchema.properties!.summary.minLength = 1;
	});

	test('validates a standalone checkpoint type without inventing required input bindings', () => {
		const type = makeType('type', {
			inputSchema: {
				type: 'object', required: ['repository'], additionalProperties: false,
				properties: { repository: { type: 'string', format: 'uri' } },
			},
			startCondition: { check: 'test.release', inputs: { repository: { input: 'repository' } } },
		});
		const value: unknown = JSON.parse(JSON.stringify(type));
		validateWorkflowCheckpointType(value);
		assert.deepStrictEqual({ id: value.id, required: value.inputSchema?.required, frozen: Object.isFrozen(value) }, { id: 'type', required: ['repository'], frozen: false });
		assert.throws(() => resolveWorkflowDefinition(definition, [value]), WorkflowValidationError);
	});

	test('standalone checkpoint validation rejects malformed contracts and undeclared check inputs', () => {
		const type = makeType('type', { inputSchema: proofSchema });
		for (const value of [
			null, {}, { ...type, version: 0 }, { ...type, proofSchema: { type: 'string' } },
			{ ...type, completion: { kind: 'approval' } },
			{ ...type, startCondition: { check: 'test.check', inputs: { required: { input: 'missing' } } } },
			{ ...type, completion: { kind: 'checked', check: { check: 'test.check', inputs: { required: { input: 'missing' } } } } },
			{ ...type, $schema: 'vscode://schemas/workflow-checkpoint/v1' },
		]) {
			assert.throws(() => validateWorkflowCheckpointType(value), WorkflowValidationError);
		}
	});

	test('validates input schemas separately from the data they require', () => {
		const schema: unknown = {
			type: 'object', required: ['repository'], additionalProperties: false,
			properties: { repository: { type: 'string', format: 'uri' } },
		};
		validateWorkflowInputSchema(schema);
		assert.deepStrictEqual(schema.required, ['repository']);
		assert.throws(() => validateWorkflowObject({}, schema), WorkflowValidationError);
		validateWorkflowObject({ repository: 'https://example.org/repository' }, schema);
		for (const invalid of [undefined, [], { type: 'array' }, { type: 'string' }, { type: 'object', default: {} }]) {
			assert.throws(() => validateWorkflowInputSchema(invalid), WorkflowValidationError);
		}
		const propertySchema: unknown = { type: 'string', minLength: 1 };
		validateWorkflowSchema(propertySchema);
		assert.strictEqual(propertySchema.type, 'string');
	});

	test('partial workflow inputs validate supplied fields without weakening nested required properties', () => {
		const schema: IJSONSchema = {
			type: 'object',
			properties: { repository: { type: 'string', format: 'uri' }, config: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
			required: ['repository', 'config'], minProperties: 2, additionalProperties: false,
		};
		validateWorkflowInputs({}, schema);
		validateWorkflowInputs({ repository: 'https://github.com/example/project' }, schema);
		for (const invalid of [{ repository: 42 }, { config: {} }, { extra: true }, []]) {
			assert.throws(() => validateWorkflowInputs(invalid, schema), WorkflowValidationError);
		}
		assert.deepStrictEqual(schema.required, ['repository', 'config']);
	});

	test('partial input alternatives defer missing fields but preserve complete cross-field validation', () => {
		const schema: IJSONSchema = {
			type: 'object', properties: { mode: { type: 'string' }, repository: { type: 'string' } }, additionalProperties: false,
			oneOf: [
				{ required: ['mode', 'repository'], properties: { mode: { const: 'one' }, repository: { const: 'first' } } },
				{ required: ['mode', 'repository'], properties: { mode: { const: 'two' }, repository: { const: 'second' } } },
			],
		};
		validateWorkflowInputs({}, schema);
		validateWorkflowInputs({ mode: 'one' }, schema);
		validateWorkflowInputs({ mode: 'one', repository: 'first' }, schema);
		assert.throws(() => validateWorkflowInputs({ mode: 'one', repository: 'second' }, schema), WorkflowValidationError);
		assert.throws(() => validateWorkflowInputs({ mode: 'three' }, schema), WorkflowValidationError);
	});

	test('rejects unsupported schema keywords, references, defaults and malformed constraints', () => {
		const invalid: IJSONSchema[] = [
			{ type: 'object', $ref: 'https://example.org/schema' },
			{ $ref: '#/definitions/local', definitions: { local: {} } },
			{ type: 'string', pattern: '(a+)+$' },
			{ type: 'string', default: 'implicit' },
			{ type: 'string', format: 'email' },
			{ type: 'array', items: [{ type: 'string' }] },
			{ type: 'number', exclusiveMinimum: true },
			{ type: 'integer', minimum: Infinity },
			{ type: 'string', minLength: -1 },
			{ type: 'string', minLength: 2, maxLength: 1 },
			{ type: 'object', required: ['x', 'x'] },
			{ enum: ['x', 'x'] },
			{ anyOf: [] },
		];
		for (const schema of invalid) {
			assert.throws(() => validateWorkflowSchema(schema), WorkflowValidationError);
		}
	});

	test('validates the generic IANA timezone format without choosing a host default', () => {
		const schema: IJSONSchema = { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1, maxLength: 256 };
		validateWorkflowSchema(schema);
		for (const value of ['UTC', 'Europe/Zurich', 'America/Los_Angeles', 'Asia/Kathmandu', 'Australia/Lord_Howe']) {
			validateWorkflowValue(value, schema);
		}
		for (const value of [undefined, null, 0, '', '+02:00', 'GMT+02:00', 'Invalid/Zone', 'Europe/Zurich ', 'a'.repeat(257)]) {
			assert.throws(() => validateWorkflowValue(value, schema), WorkflowValidationError);
		}
		assert.deepStrictEqual(schema, { type: 'string', format: 'iana-time-zone', minLength: 1, maxLength: 256 });
	});

	test('preserves the timezone format and selected value through arbitrary-name bindings and snapshot serialization', () => {
		const zoneSchema: IJSONSchema = { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1, maxLength: 256 };
		const type = makeType('type', {
			inputSchema: { type: 'object', properties: { zone: zoneSchema }, required: ['zone'], additionalProperties: false },
		});
		const withCalendar: WorkflowDefinition = {
			...definition,
			inputSchema: { type: 'object', properties: { calendarZone: zoneSchema }, required: ['calendarZone'], additionalProperties: false },
			checkpoints: [{ id: 'first', type: 'type@1', inputs: { zone: { input: 'calendarZone' } } }],
		};
		const snapshot: WorkflowSnapshot = JSON.parse(JSON.stringify(resolveWorkflowDefinition(withCalendar, [type])));
		validateWorkflowSnapshot(snapshot);
		const inputs = { calendarZone: 'America/Los_Angeles' };
		validateWorkflowObject(inputs, snapshot.inputSchema);
		assert.deepStrictEqual({
			rootFormat: snapshot.inputSchema?.properties?.calendarZone.format,
			checkpointFormat: snapshot.checkpoints[0].type.inputSchema?.properties?.zone.format,
			bound: resolveWorkflowBindings(snapshot.checkpoints[0].inputs, inputs, []),
		}, {
			rootFormat: WorkflowSchemaFormat.IanaTimeZone, checkpointFormat: WorkflowSchemaFormat.IanaTimeZone,
			bound: { zone: 'America/Los_Angeles' },
		});
		assert.throws(() => validateWorkflowObject({}, snapshot.inputSchema), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition({
			...withCalendar,
			inputSchema: {
				type: 'object', properties: { calendarZone: { type: 'string', minLength: 1, maxLength: 256 } },
				required: ['calendarZone'], additionalProperties: false,
			},
		}, [type]), WorkflowValidationError);
	});

	test('validates the documented scalar, object, array and composition subset', () => {
		const schema: IJSONSchema = {
			type: 'object', required: ['items', 'uri', 'value'], additionalProperties: false,
			properties: {
				items: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 10 } },
				uri: { type: 'string', format: 'uri' },
				value: { oneOf: [{ const: 'done' }, { type: 'number', exclusiveMinimum: 0, multipleOf: 0.1 }] },
			},
		};
		validateWorkflowValue({ items: [1, 2], uri: 'https://example.org/path', value: 0.3 }, schema);
		for (const value of [
			{ items: [1, 1], uri: 'https://example.org', value: 'done' },
			{ items: [1.5], uri: 'https://example.org', value: 'done' },
			{ items: [1], uri: 'relative/path', value: 'done' },
			{ items: [1], uri: 'https://example.org', value: 0 },
			{ items: [1], uri: 'https://example.org', value: 'done', extra: true },
		]) {
			assert.throws(() => validateWorkflowValue(value, schema), WorkflowValidationError);
		}
	});

	test('rejects oversized, cyclic, non-JSON and deeply nested data', () => {
		const cyclic: { nested?: object } = {};
		cyclic.nested = cyclic;
		for (const value of [cyclic, undefined, NaN, new Date(), { value: undefined }, { value: 'x'.repeat(workflowValidationLimits.valueBytes) }, new Array(3)]) {
			assert.throws(() => validateWorkflowValue(value), WorkflowValidationError);
		}
		let schema: IJSONSchema = { type: 'string' };
		for (let depth = 0; depth < 20; depth++) {
			schema = { type: 'array', items: schema };
		}
		assert.throws(() => validateWorkflowSchema(schema), WorkflowValidationError);
		const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 'surprise' });
		const hidden = Object.defineProperty({}, 'value', { value: 'omitted' });
		for (const value of [accessor, hidden, { [Symbol('hidden')]: 'omitted' }, Object.assign(['valid'], { extra: true })]) {
			assert.throws(() => validateWorkflowValue(value), WorkflowValidationError);
		}
	});

	test('bounds schema evaluation work without treating an unexamined alternative as a mismatch', () => {
		const schema: IJSONSchema = { type: 'array', items: { oneOf: Array.from({ length: 100 }, (_value, index): IJSONSchema => ({ type: index === 0 ? 'integer' : 'string' })) } };
		validateWorkflowValue([1], schema);
		assert.throws(() => validateWorkflowValue(Array.from({ length: 2000 }, () => 1), schema), /complexity limit/);
		const expensive: IJSONSchema = { type: 'array', items: { allOf: Array.from({ length: 100 }, () => ({ type: 'integer' })) } };
		assert.throws(() => validateWorkflowValue(Array.from({ length: 2000 }, () => 1), expensive), /complexity limit/);
	});

	test('rejects duplicate, missing, forward and cyclic bindings', () => {
		const type = makeType('type', { inputSchema: proofSchema });
		const cases: WorkflowDefinition[] = [
			{ ...definition, checkpoints: [{ id: 'first', type: 'missing@1' }] },
			{ ...definition, checkpoints: [{ id: 'first', type: 'type@1' }, { id: 'first', type: 'type@1' }] },
			{ ...definition, checkpoints: [{ id: 'first', type: 'type@1', inputs: { summary: { checkpoint: 'missing', outputPointer: '/summary' } } }] },
			{ ...definition, checkpoints: [{ id: 'first', type: 'type@1', inputs: { summary: { checkpoint: 'first', outputPointer: '/summary' } } }] },
			{ ...definition, checkpoints: [
				{ id: 'first', type: 'type@1', inputs: { summary: { checkpoint: 'second', outputPointer: '/summary' } } },
				{ id: 'second', type: 'type@1', inputs: { summary: { checkpoint: 'first', outputPointer: '/summary' } } },
			] },
		];
		for (const candidate of cases) {
			assert.throws(() => resolveWorkflowDefinition(candidate, [type]), WorkflowValidationError);
		}
		assert.throws(() => resolveWorkflowDefinition(definition, [type, type]), WorkflowValidationError);
	});

	test('requires guaranteed and compatible bound values without substituting defaults', () => {
		const source = makeType('source');
		const target = makeType('target', { inputSchema: proofSchema });
		const create = (outputPointer: string): WorkflowDefinition => ({
			...definition,
			checkpoints: [
				{ id: 'first', type: 'source@1' },
				{ id: 'second', type: 'target@1', inputs: { summary: { checkpoint: 'first', outputPointer } } },
			],
		});
		resolveWorkflowDefinition(create('/summary'), [source, target]);
		for (const pointer of ['/missing', '/summary/other', '/bad~escape']) {
			assert.throws(() => resolveWorkflowDefinition(create(pointer), [source, target]), WorkflowValidationError);
		}
		assert.throws(() => resolveWorkflowDefinition(create('/summary'), [
			source, makeType('target', { inputSchema: { ...proofSchema, properties: { summary: { type: 'number' } } } }),
		]), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition(create('/summary'), [
			makeType('source', { proofSchema: { ...proofSchema, required: [] } }), target,
		]), WorkflowValidationError);
		assert.throws(() => resolveWorkflowBindings({ summary: { input: 'missing' } }, {}, []), WorkflowValidationError);
	});

	test('checked bindings use the canonical output schema, not submitted proof', () => {
		const source = makeType('source', {
			completion: { kind: 'checked', check: { check: 'test.check' } },
			outputSchema: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'], additionalProperties: false },
		});
		const target = makeType('target', { inputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'], additionalProperties: false } });
		const valid: WorkflowDefinition = {
			...definition, checkpoints: [
				{ id: 'first', type: 'source@1' },
				{ id: 'second', type: 'target@1', inputs: { count: { checkpoint: 'first', outputPointer: '/count' } } },
			],
		};
		resolveWorkflowDefinition(valid, [source, target]);
		assert.throws(() => resolveWorkflowDefinition(valid, [{ ...source, outputSchema: undefined }, target]), WorkflowValidationError);
	});

	test('whole-object bindings reject incompatible properties hidden by open source schemas', () => {
		const source = makeType('source', { proofSchema: { type: 'object' } });
		const target = makeType('target', {
			inputSchema: {
				type: 'object', required: ['data'], properties: { data: { type: 'object', properties: { name: { type: 'string' } } } },
			},
		});
		assert.throws(() => resolveWorkflowDefinition({
			...definition, checkpoints: [
				{ id: 'first', type: 'source@1' },
				{ id: 'second', type: 'target@1', inputs: { data: { checkpoint: 'first', outputPointer: '' } } },
			],
		}, [source, target]), WorkflowValidationError);
	});

	test('explicit versions and workflow-input bindings are validated before starting', () => {
		assert.throws(() => resolveWorkflowDefinition(definition, [makeType('type', { version: 2 })]), WorkflowValidationError);
		const bound: WorkflowDefinition = {
			...definition, inputSchema: proofSchema,
			checkpoints: [{ id: 'first', type: 'type@1', inputs: { summary: { input: 'summary' } } }],
		};
		resolveWorkflowDefinition(bound, [makeType('type', { inputSchema: proofSchema })]);
		assert.throws(() => resolveWorkflowDefinition({ ...bound, inputSchema: undefined }, [makeType('type', { inputSchema: proofSchema })]), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition({ ...bound, inputSchema: { ...proofSchema, required: [] } }, [makeType('type', { inputSchema: proofSchema })]), WorkflowValidationError);
	});

	test('version-qualified references resolve the declared base identifier and exact version', () => {
		const first = makeType('vscode.workflow/plan', { version: 1, instructions: 'Version one' });
		const second = makeType('vscode.workflow/plan', { version: 2, instructions: 'Version two' });
		const snapshot = resolveWorkflowDefinition({
			...definition,
			checkpoints: [
				{ id: 'first', type: 'vscode.workflow/plan@1' },
				{ id: 'second', type: 'vscode.workflow/plan@2' },
			],
		}, [second, first]);
		assert.deepStrictEqual(snapshot.checkpoints.map(checkpoint => ({
			id: checkpoint.type.id, version: checkpoint.type.version, instructions: checkpoint.instructions, reference: getWorkflowCheckpointTypeReference(checkpoint.type),
		})), [
			{ id: 'vscode.workflow/plan', version: 1, instructions: 'Version one', reference: 'vscode.workflow/plan@1' },
			{ id: 'vscode.workflow/plan', version: 2, instructions: 'Version two', reference: 'vscode.workflow/plan@2' },
		]);
	});

	test('duplicate composite identities and absent referenced versions are rejected', () => {
		const first = makeType('type', { version: 1 });
		const second = makeType('type', { version: 2 });
		assert.throws(() => resolveWorkflowDefinition(definition, [first, { ...first }]), /unique checkpoint type version/);
		assert.throws(() => resolveWorkflowDefinition(definition, [second]), /resolved checkpoint type/);
		assert.throws(() => resolveWorkflowDefinition({ ...definition, checkpoints: [{ id: 'first', type: 'type@3' }] }, [first, second]), /resolved checkpoint type/);
	});

	test('unqualified and noncanonical references never infer or normalize a version', () => {
		const first = makeType('type', { version: 1 });
		const second = makeType('type', { version: 2 });
		for (const types of [[first], [second, first]]) {
			for (const reference of ['type', 'type@01']) {
				assert.throws(() => resolveWorkflowDefinition({
					...definition, checkpoints: [{ id: 'first', type: reference }],
				}, types), /resolved checkpoint type/);
			}
		}
	});

	test('local checkpoint contracts must match the selected identifier and version', () => {
		const localType = makeType('type', { version: 2, instructions: 'Local version two' });
		const snapshot = resolveWorkflowDefinition({ ...definition, checkpoints: [{ id: 'first', type: 'type@2', localType }] }, []);
		assert.deepStrictEqual({ id: snapshot.checkpoints[0].type.id, version: snapshot.checkpoints[0].type.version }, { id: 'type', version: 2 });
		for (const reference of ['type', 'type@1', 'type@02']) {
			assert.throws(() => resolveWorkflowDefinition({
				...definition, checkpoints: [{ id: 'first', type: reference, localType }],
			}, [makeType('type')]), /matching local checkpoint type and version/);
		}
	});

	test('aggregate input constraints are checked even for later checkpoints', () => {
		const source = makeType('source');
		const target = makeType('target', { inputSchema: { ...proofSchema, minProperties: 2 } });
		assert.throws(() => resolveWorkflowDefinition({
			...definition, checkpoints: [
				{ id: 'first', type: 'source@1' },
				{ id: 'second', type: 'target@1', inputs: { summary: { checkpoint: 'first', outputPointer: '/summary' } } },
			],
		}, [source, target]), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition(definition, [makeType('type', { inputSchema: { type: 'object', minProperties: 1 } })]), WorkflowValidationError);
	});

	test('revalidates snapshots and rejects unknown authority fields', () => {
		const snapshot = makeSnapshot();
		const corrupt: WorkflowSnapshot = JSON.parse(JSON.stringify(snapshot));
		const invalid = { ...corrupt, checkpoints: [{ ...corrupt.checkpoints[0], inputs: { value: { checkpoint: 'third', outputPointer: '/summary' } } }] };
		assert.throws(() => validateWorkflowSnapshot(invalid), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition({ ...definition, actor: 'human' } as WorkflowDefinition, [makeType('type')]), WorkflowValidationError);
		assert.throws(() => resolveWorkflowDefinition({ ...definition, checkpoints: [{ id: 'first', type: 'type@1', instructions: 'x'.repeat(workflowValidationLimits.instructionLength + 1) }] }, [makeType('type')]), WorkflowValidationError);
	});

	test('narrows unknown stored JSON only after validating the complete run', () => {
		const value: unknown = {
			id: 'run', version: 1, revision: 0, session: 'session', chat: 'chat', task: 'Task', inputs: {},
			snapshot: makeSnapshot(), stopAfter: 'first', status: 'running', checkpointIndex: 0, receipts: [], firstTurns: {},
			createdAt: 1000, updatedAt: 1000, activityAt: 1000, nextWakeAt: 1000,
		};
		validateWorkflowRun(value);
		assert.deepStrictEqual({ id: value.id, revision: value.revision, activityAt: value.activityAt }, { id: 'run', revision: 0, activityAt: 1000 });
		for (const corrupt of [
			null, [], { ...value, version: '1' }, { ...value, revision: '0' }, { ...value, snapshot: null },
			{ ...value, receipts: {} }, { ...value, firstTurns: undefined }, { ...value, activityAt: undefined },
			{ ...value, pendingAssignment: {} }, { ...value, verification: null },
			{ ...value, startConditionReceipts: null },
			{
				...value,
				startConditionReceipts: [{ id: 'gate', checkpointId: 'first', assignmentId: 'assignment', checkId: 'test.release', output: {}, evidence: [], provenance: 'checked', observedAt: 1000 }],
			},
			{
				...value,
				assignment: { id: 'assignment', checkpointId: 'first', turnId: 'turn', attempt: 1, reason: 'start', inputs: {}, createdAt: 1000, delivery: 'running', missingProofReminders: null },
			},
			{
				...value, checkpointIndex: 1, status: 'stopped', nextWakeAt: undefined, firstTurns: { first: 'turn' },
				receipts: [{ id: 'receipt', checkpointId: 'first', assignmentId: 'assignment', turnId: 'turn', proof: { summary: 'Done' }, output: { summary: 'Done' }, evidence: [], provenance: 'reported', acceptedAt: 1000, checkId: 42 }],
			},
		]) {
			assert.throws(() => validateWorkflowRun(corrupt), WorkflowValidationError);
		}
	});
});
