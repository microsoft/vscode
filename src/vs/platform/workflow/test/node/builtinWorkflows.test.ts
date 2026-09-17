/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFile } from 'fs/promises';
import { parse, ParseError } from '../../../../base/common/json.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { builtinWorkflowCheckpointTypes, builtinWorkflowDefinitions } from '../../common/builtinWorkflows.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSchemaFormat } from '../../common/workflow.js';
import { resolveWorkflowDefinition, validateWorkflowObject, validateWorkflowSnapshot, WorkflowValidationError } from '../../common/workflowValidation.js';

const extensionRoot = new URL('../../../../../../extensions/workflow-experiments/', import.meta.url);

interface ExperimentManifest {
	readonly main?: string;
	readonly browser?: string;
	readonly activationEvents?: readonly string[];
	readonly scripts?: object;
	readonly dependencies?: object;
	readonly contributes: {
		readonly workflowCheckpointTypes: readonly string[];
		readonly workflowTemplates: readonly string[];
	};
}

suite('BuiltinWorkflows', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ships checked core resource outcomes, reported implementation and reusable feature and bug-fix templates', () => {
		assert.deepStrictEqual({
			types: builtinWorkflowCheckpointTypes.map(type => [type.id, type.version, type.completion.kind]),
			definitions: builtinWorkflowDefinitions.map(definition => [definition.id, definition.checkpoints.length]),
			lastCheckpoints: builtinWorkflowDefinitions.map(definition => definition.checkpoints.at(-1)?.type),
			errors: builtinWorkflowDefinitions.flatMap(definition => bindingErrors(definition, builtinWorkflowCheckpointTypes)),
		}, {
			types: [
				['vscode.workflow/plan', 1, 'checked'],
				['vscode.workflow/implementation', 1, 'reported'],
				['vscode.workflow/draft-pr', 1, 'checked'],
				['vscode.workflow/draft-pr-ready', 1, 'checked'],
				['vscode.workflow/pr-open', 1, 'checked'],
				['vscode.workflow/pr-merged', 1, 'checked'],
				['vscode.workflow/pr-merged', 2, 'checked'],
			],
			definitions: [['vscode.workflow/feature', 6], ['vscode.workflow/bug-fix', 6]],
			lastCheckpoints: ['vscode.workflow/pr-merged@2', 'vscode.workflow/pr-merged@2'],
			errors: [],
		});
	});

	test('packages a declaration-only team extension and all eleven bound checkpoints', async () => {
		const manifest = await readJsonc<ExperimentManifest>('package.json');
		const types = await Promise.all(manifest.contributes.workflowCheckpointTypes.map(path => readJsonc<WorkflowCheckpointType>(path)));
		const definitions = await Promise.all(manifest.contributes.workflowTemplates.map(path => readJsonc<WorkflowDefinition>(path)));
		const definition = definitions[0];
		assert.deepStrictEqual({
			executable: [manifest.main, manifest.browser, manifest.activationEvents, manifest.scripts, manifest.dependencies].filter(value => value !== undefined),
			types: types.map(type => [type.id, type.completion.kind]),
			firstSix: definition.checkpoints.slice(0, 6),
			total: definition.checkpoints.length,
			definitions: definitions.length,
			errors: bindingErrors(definition, [...builtinWorkflowCheckpointTypes, ...types]),
		}, {
			executable: [],
			types: [
				['microsoft.vscode/test-plan-item', 'checked'],
				['microsoft.vscode/write-release-notes', 'reported'],
				['microsoft.exp/set-up', 'reported'],
				['microsoft.exp/started', 'reported'],
				['microsoft.exp/analysed', 'reported'],
			],
			firstSix: builtinWorkflowDefinitions[0].checkpoints,
			total: 11,
			definitions: 1,
			errors: [],
		});
	});

	test('resolves and validates the actual built-in and packaged ExP templates with the shared engine', async () => {
		const packaged = await readExperimentDeclarations();
		const definitions = [...builtinWorkflowDefinitions, ...packaged.definitions];
		const types = [...builtinWorkflowCheckpointTypes, ...packaged.checkpointTypes];
		const snapshots = definitions.map(definition => {
			const snapshot = resolveWorkflowDefinition(definition, types);
			validateWorkflowSnapshot(snapshot);
			return {
				id: snapshot.id,
				checkpoints: snapshot.checkpoints.map(checkpoint => `${checkpoint.type.id}@${checkpoint.type.version}`),
			};
		});
		assert.deepStrictEqual(snapshots, definitions.map(definition => ({
			id: definition.id,
			checkpoints: definition.checkpoints.map(checkpoint => checkpoint.type),
		})));
	});

	test('resolves exact declared versions and rejects incompatible or missing versions in the packaged template', async () => {
		const packaged = await readExperimentDeclarations();
		const definition = packaged.definitions[0];
		const implementation = builtinWorkflowCheckpointTypes.find(type => type.id === 'vscode.workflow/implementation')!;
		const incompatibleVersion: WorkflowCheckpointType = {
			...implementation,
			version: 2,
			inputSchema: {
				type: 'object',
				properties: { plan: { type: 'integer' } },
				additionalProperties: false,
			},
		};
		const shippedTypes = [...builtinWorkflowCheckpointTypes, ...packaged.checkpointTypes];
		const orders = [[incompatibleVersion, ...shippedTypes], [...shippedTypes, incompatibleVersion]];
		assert.deepStrictEqual(orders.map(types => {
			const snapshot = resolveWorkflowDefinition(definition, types);
			validateWorkflowSnapshot(snapshot);
			return snapshot.checkpoints.find(checkpoint => checkpoint.type.id === implementation.id)?.type.version;
		}), [1, 1]);

		const withVersion = (version: number): WorkflowDefinition => ({
			...definition,
			checkpoints: definition.checkpoints.map(checkpoint => checkpoint.type === `${implementation.id}@1`
				? { ...checkpoint, type: `${implementation.id}@${version}` }
				: checkpoint),
		});
		assert.throws(() => resolveWorkflowDefinition(withVersion(2), orders[0]),
			error => error instanceof WorkflowValidationError && error.path.endsWith('.inputs.plan'));
		assert.throws(() => resolveWorkflowDefinition(withVersion(3), orders[0]),
			error => error instanceof WorkflowValidationError && error.path.endsWith('.type'));
	});

	test('keeps the checked release start condition distinct from reported ExP completion', async () => {
		const started = await readJsonc<WorkflowCheckpointType>('checkpoints/started.checkpoint.jsonc');
		const definition = await readJsonc<WorkflowDefinition>('workflows/feature-with-experiment.workflow.jsonc');
		const instance = definition.checkpoints.find(checkpoint => checkpoint.type === 'microsoft.exp/started@1')!;
		assert.deepStrictEqual({
			condition: started.startCondition,
			completion: started.completion,
			repository: instance.inputs?.repository,
			commit: instance.inputs?.integratedCommit,
			setupIdentity: instance.inputs?.experimentId,
		}, {
			condition: {
				check: 'vscode.github/commit-in-release@1',
				inputs: { repository: { input: 'repository' }, commit: { input: 'integratedCommit' } },
				options: { release: 'published-stable' },
			},
			completion: { kind: 'reported' },
			repository: { checkpoint: 'pr-merged', outputPointer: '/repository' },
			commit: { checkpoint: 'pr-merged', outputPointer: '/integratedCommit' },
			setupIdentity: { checkpoint: 'experiment-set-up', outputPointer: '/experimentId' },
		});
	});

	test('binds team calendars to the checked merge timestamp and the same frozen user timezone', async () => {
		const packaged = await readExperimentDeclarations();
		const snapshot = resolveWorkflowDefinition(packaged.definitions[0], [...builtinWorkflowCheckpointTypes, ...packaged.checkpointTypes]);
		const scheduled = snapshot.checkpoints.filter(checkpoint => checkpoint.type.startCondition?.check === 'vscode.calendar/weekday-on-or-after@1');
		assert.deepStrictEqual({
			requiredInputs: snapshot.inputSchema?.required,
			timeZoneFormat: snapshot.inputSchema?.properties?.timeZone.format,
			scheduled: scheduled.map(checkpoint => ({
				id: checkpoint.id,
				anchor: checkpoint.inputs.mergedAt,
				timeZone: checkpoint.inputs.timeZone,
				timeZoneFormat: checkpoint.type.inputSchema?.properties?.timeZone.format,
				condition: checkpoint.type.startCondition,
			})),
		}, {
			requiredInputs: ['repository', 'timeZone'],
			timeZoneFormat: WorkflowSchemaFormat.IanaTimeZone,
			scheduled: ['test-plan-item', 'write-release-notes'].map((id, index) => ({
				id,
				anchor: { checkpoint: 'pr-merged', outputPointer: '/mergedAt' },
				timeZone: { input: 'timeZone' },
				timeZoneFormat: WorkflowSchemaFormat.IanaTimeZone,
				condition: {
					check: 'vscode.calendar/weekday-on-or-after@1',
					inputs: { anchor: { input: 'mergedAt' }, timeZone: { input: 'timeZone' } },
					options: { weekday: 5, hour: 9, minute: 0, offsetDays: index * 3 },
				},
			})),
		});
		assert.throws(() => validateWorkflowObject({ repository: 'https://github.com/microsoft/vscode' }, snapshot.inputSchema), WorkflowValidationError);
	});

	test('keeps test-plan issue existence checked and release-note content and publication reported', async () => {
		const { checkpointTypes } = await readExperimentDeclarations();
		const testPlan = checkpointTypes.find(type => type.id === 'microsoft.vscode/test-plan-item')!;
		const notes = checkpointTypes.find(type => type.id === 'microsoft.vscode/write-release-notes')!;
		assert.deepStrictEqual({
			testPlan: testPlan.completion,
			testPlanProof: testPlan.proofSchema.required,
			testPlanOutput: testPlan.outputSchema?.required,
			notes: notes.completion,
			notesProof: notes.proofSchema.required,
			notesOutput: notes.outputSchema,
		}, {
			testPlan: { kind: 'checked', check: { check: 'vscode.github/issue-exists@1', inputs: { repository: { input: 'repository' } } } },
			testPlanProof: ['uri'],
			testPlanOutput: ['repository', 'issue'],
			notes: { kind: 'reported' },
			notesProof: ['summary', 'uri'],
			notesOutput: undefined,
		});
		validateWorkflowObject({ uri: 'https://github.com/microsoft/vscode/issues/123' }, testPlan.proofSchema);
		validateWorkflowObject({ summary: 'Saved the feature notes.', uri: 'file:///workspace/release-notes.md' }, notes.proofSchema);
		assert.throws(() => validateWorkflowObject({ uri: 'file:///workspace/release-notes.md' }, notes.proofSchema), WorkflowValidationError);
		assert.throws(() => validateWorkflowObject({ uri: 'https://github.com/microsoft/vscode/issues/123', mergedAt: '2026-09-18T12:00:00Z' }, testPlan.proofSchema), WorkflowValidationError);
	});

	test('bounds all shipped proof schemas without permissive extra properties', async () => {
		const manifest = await readJsonc<ExperimentManifest>('package.json');
		const types = [...builtinWorkflowCheckpointTypes, ...await Promise.all(manifest.contributes.workflowCheckpointTypes.map(path => readJsonc<WorkflowCheckpointType>(path)))];
		const errors: string[] = [];
		for (const type of types) {
			checkBounds(type.proofSchema, type.id, errors);
		}
		assert.deepStrictEqual(errors, []);
	});
});

async function readJsonc<T>(path: string): Promise<T> {
	const errors: ParseError[] = [];
	const value = parse(await readFile(new URL(path, extensionRoot), 'utf8'), errors);
	assert.deepStrictEqual(errors, [], path);
	return value;
}

async function readExperimentDeclarations() {
	const manifest = await readJsonc<ExperimentManifest>('package.json');
	const [checkpointTypes, definitions] = await Promise.all([
		Promise.all(manifest.contributes.workflowCheckpointTypes.map(path => readPackagedDeclaration<WorkflowCheckpointType>(path))),
		Promise.all(manifest.contributes.workflowTemplates.map(path => readPackagedDeclaration<WorkflowDefinition>(path))),
	]);
	return { checkpointTypes, definitions };
}

async function readPackagedDeclaration<T extends object>(path: string): Promise<T> {
	const declaration = await readJsonc<T>(path);
	Reflect.deleteProperty(declaration, '$schema');
	return declaration;
}

function bindingErrors(definition: WorkflowDefinition, types: readonly WorkflowCheckpointType[]): readonly string[] {
	const errors: string[] = [];
	const seen = new Map<string, WorkflowCheckpointType>();
	const byId = new Map(types.map(type => [`${type.id}@${type.version}`, type]));
	for (const checkpoint of definition.checkpoints) {
		const type = byId.get(checkpoint.type);
		if (!type) {
			errors.push(`Unknown type ${checkpoint.type}`);
			continue;
		}
		for (const [key, binding] of Object.entries(checkpoint.inputs ?? {})) {
			const target = type.inputSchema?.properties?.[key];
			let source: IJSONSchema | undefined;
			if (hasKey(binding, { input: true })) {
				source = definition.inputSchema?.properties?.[binding.input];
			} else if (hasKey(binding, { checkpoint: true })) {
				const earlier = seen.get(binding.checkpoint);
				source = (earlier?.outputSchema ?? earlier?.proofSchema)?.properties?.[binding.outputPointer.slice(1)];
				if (['repository', 'pullRequest', 'integratedCommit', 'mergedAt'].includes(key) && earlier?.completion.kind !== 'checked') {
					errors.push(`Unchecked identity binding ${checkpoint.id}.${key}`);
				}
			}
			if (!source || !target || source.type !== target.type) {
				errors.push(`Incompatible binding ${checkpoint.id}.${key}`);
			}
		}
		seen.set(checkpoint.id, type);
	}
	return errors;
}

function checkBounds(schema: IJSONSchema, path: string, errors: string[]): void {
	if (schema.type === 'object') {
		if (schema.additionalProperties !== false) {
			errors.push(`${path} permits unbounded extra properties`);
		}
		for (const [key, child] of Object.entries(schema.properties ?? {})) {
			checkBounds(child, `${path}.${key}`, errors);
		}
	} else if (schema.type === 'array') {
		if (!schema.maxItems || !schema.items || Array.isArray(schema.items)) {
			errors.push(`${path} permits an unbounded array`);
		} else {
			checkBounds(schema.items, `${path}[]`, errors);
		}
	} else if (schema.type === 'string' && !schema.maxLength && !schema.enum) {
		errors.push(`${path} permits an unbounded string`);
	}
}
