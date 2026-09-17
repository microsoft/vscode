/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { builtinWorkflowCheckpointTypes, builtinWorkflowDefinitions } from '../../../../../platform/workflow/common/builtinWorkflows.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSchemaFormat, WorkflowSource } from '../../../../../platform/workflow/common/workflow.js';
import { resolveWorkflowDefinition } from '../../../../../platform/workflow/common/workflowValidation.js';
import { getWorkflowSourceCounts } from '../../common/workflowCatalog.js';
import { createWorkflowCatalog, getUsableCheckpointTypes, parseWorkflowDocument, WorkflowCatalogDocument, workflowCheckpointSchemaId, workflowSchemaId } from '../../common/workflowCatalogModel.js';
import { testCheckpointType, testWorkflowDefinition } from './workflowTestData.js';

suite('Workflow catalog model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const user: WorkflowSource = { kind: 'user', id: 'profile', label: 'Personal' };
	const workspace: WorkflowSource = { kind: 'workspace', id: 'project', label: 'Workspace' };

	function document(kind: 'workflow' | 'checkpoint', value: WorkflowDefinition | WorkflowCheckpointType, source = user): WorkflowCatalogDocument {
		return { kind, content: JSON.stringify(value), source, resource: URI.from({ scheme: 'workflow-test', path: `/${source.kind}/${value.id.replaceAll('/', '-')}.${kind}.jsonc` }) };
	}

	test('built-in templates resolve with their exact versioned contracts', () => {
		const catalog = createWorkflowCatalog([
			...builtinWorkflowCheckpointTypes.map(type => document('checkpoint', type, type.source!)),
			...builtinWorkflowDefinitions.map(definition => document('workflow', definition, definition.source!)),
		]);
		assert.deepStrictEqual({ diagnostics: catalog.diagnostics, templates: catalog.workflows.length, types: catalog.checkpointTypes.length }, { diagnostics: [], templates: 2, types: 7 });
	});

	test('JSONC metadata is stripped and provenance belongs to the discovered file', () => {
		const definition = { ...testWorkflowDefinition(), source: { kind: 'builtin', id: 'spoofed' } };
		const entry = parseWorkflowDocument({
			kind: 'workflow',
			content: `// Personal workflow\n${JSON.stringify({ $schema: workflowSchemaId, ...definition }).replace(/}$/, ',}')}`,
			source: user,
		});
		assert.deepStrictEqual({ source: entry.definition?.source, schema: Object.hasOwn(entry.definition!, '$schema'), diagnostics: entry.diagnostics, readOnly: entry.readOnly }, { source: user, schema: false, diagnostics: [], readOnly: false });
	});

	test('calendar input formats survive discovery and exact snapshot resolution', () => {
		const inputSchema = {
			type: 'object' as const,
			properties: { zone: { type: 'string' as const, format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1 } },
			required: ['zone'],
		};
		const catalog = createWorkflowCatalog([
			document('checkpoint', testCheckpointType()),
			document('workflow', { ...testWorkflowDefinition(), inputSchema }),
		]);
		const snapshot = resolveWorkflowDefinition(catalog.workflows[0].definition!, getUsableCheckpointTypes(catalog));
		assert.deepStrictEqual({ diagnostics: catalog.diagnostics, inputSchema: snapshot.inputSchema }, { diagnostics: [], inputSchema });
	});

	test('checkpoint document metadata is stripped without hiding nested schema metadata', () => {
		const definition = { ...testCheckpointType(), $schema: workflowCheckpointSchemaId };
		const root = parseWorkflowDocument(document('checkpoint', definition));
		const nested = ['inputSchema', 'proofSchema', 'outputSchema'].map(property => {
			const value = { ...definition, [property]: { ...definition.proofSchema, $schema: workflowCheckpointSchemaId } };
			const entry = parseWorkflowDocument(document('checkpoint', value));
			return { property, definition: entry.definition, codes: entry.diagnostics.map(diagnostic => diagnostic.code) };
		});
		assert.deepStrictEqual({
			root: { id: root.definition?.id, schema: Object.hasOwn(root.definition!, '$schema'), codes: root.diagnostics.map(diagnostic => diagnostic.code) },
			nested,
		}, {
			root: { id: 'test/summary', schema: false, codes: [] },
			nested: [
				{ property: 'inputSchema', definition: undefined, codes: ['source'] },
				{ property: 'proofSchema', definition: undefined, codes: ['source'] },
				{ property: 'outputSchema', definition: undefined, codes: ['source'] },
			],
		});
	});

	test('conflicts are diagnosed on every source instead of silently overriding', () => {
		const catalog = createWorkflowCatalog([
			document('checkpoint', testCheckpointType(), user),
			document('checkpoint', testCheckpointType(), workspace),
			document('workflow', testWorkflowDefinition()),
		]);
		assert.deepStrictEqual({
			contracts: catalog.checkpointTypes.map(entry => entry.diagnostics.map(diagnostic => diagnostic.code)),
			workflows: catalog.workflows.map(entry => entry.diagnostics.map(diagnostic => diagnostic.code)),
			usable: getUsableCheckpointTypes(catalog).length,
		}, { contracts: [['conflict'], ['conflict']], workflows: [['unresolved']], usable: 0 });
	});

	test('different versions coexist and snapshots pin the requested contract', () => {
		const catalog = createWorkflowCatalog([
			document('checkpoint', testCheckpointType('test/summary', 1)),
			document('checkpoint', { ...testCheckpointType('test/summary', 2), instructions: 'Version two instructions.' }, workspace),
			document('workflow', testWorkflowDefinition()),
		]);
		const snapshot = resolveWorkflowDefinition(catalog.workflows[0].definition!, getUsableCheckpointTypes(catalog));
		assert.deepStrictEqual({ diagnostics: catalog.diagnostics, versions: snapshot.checkpoints.map(checkpoint => checkpoint.type.version), frozen: Object.isFrozen(snapshot.checkpoints[0].type) }, { diagnostics: [], versions: [1, 1], frozen: true });
	});

	test('invalid and remote schema documents remain visible but unusable', () => {
		const catalog = createWorkflowCatalog([
			{ kind: 'workflow', content: '{ invalid', source: user },
			document('checkpoint', { ...testCheckpointType(), proofSchema: { type: 'object', $ref: 'https://example.invalid/schema' } }),
			document('workflow', { ...testWorkflowDefinition(), version: 0 }, workspace),
		]);
		assert.deepStrictEqual(catalog.diagnostics.map(diagnostic => diagnostic.code).sort(), ['parse', 'source', 'version']);
	});

	test('a local contract is not attributed to the shared library after editing', () => {
		const definition = { ...testWorkflowDefinition(), checkpoints: [{ id: 'plan', type: 'test/summary@1', localType: { ...testCheckpointType(), source: { kind: 'builtin' as const, id: 'vscode' } } }] };
		const catalog = createWorkflowCatalog([document('workflow', definition)]);
		assert.deepStrictEqual({ source: catalog.workflows[0].definition?.checkpoints[0].localType?.source, diagnostics: catalog.diagnostics }, { source: user, diagnostics: [] });
	});

	test('literal input data does not get interpreted as a schema reference', () => {
		const entry = parseWorkflowDocument({
			kind: 'workflow',
			content: JSON.stringify({
				...testWorkflowDefinition(),
				checkpoints: [{ id: 'plan', type: 'test/summary@1', inputs: { document: { value: { $ref: 'https://example.invalid/document' } } } }],
			}),
			source: user,
		});
		assert.deepStrictEqual(entry.diagnostics, []);
	});

	test('all source counts use the same catalog entries including invalid files', () => {
		const catalog = createWorkflowCatalog([
			document('workflow', testWorkflowDefinition(), workspace),
			document('workflow', { ...testWorkflowDefinition(), id: 'test/personal' }, user),
			{ kind: 'workflow', content: '{ invalid', source: { kind: 'extension', id: 'example.extension' } },
		]);
		assert.deepStrictEqual(getWorkflowSourceCounts(catalog), { workspace: 1, user: 1, extension: 1, builtin: 0 });
	});

	test('malformed checkpoint array items never reach form rendering', () => {
		const entry = parseWorkflowDocument({ kind: 'workflow', content: '{"id":"test","version":1,"label":"Broken","checkpoints":[null]}', source: user });
		assert.deepStrictEqual({ definition: entry.definition, codes: entry.diagnostics.map(diagnostic => diagnostic.code) }, { definition: undefined, codes: ['invalid'] });
	});

	test('unexpected workflow fields on a checkpoint contract cannot crash discovery', () => {
		const malformed = { ...testCheckpointType(), checkpoints: [null] };
		const catalog = createWorkflowCatalog([document('checkpoint', malformed)]);
		assert.deepStrictEqual(catalog.checkpointTypes[0].diagnostics.map(diagnostic => diagnostic.code), ['invalid']);
	});

	test('excessively nested malformed documents cannot stop discovery', () => {
		const entry = parseWorkflowDocument({ kind: 'workflow', content: `${'['.repeat(20_000)}0${']'.repeat(20_000)}`, source: user });
		assert.deepStrictEqual(entry.diagnostics.map(diagnostic => diagnostic.code), ['parse']);
	});

	test('unreadable files retain their source, identity, and count', () => {
		const resource = URI.parse('workflow-test://host/unreadable.workflow.jsonc');
		const catalog = createWorkflowCatalog([{ kind: 'workflow', content: '', resource, source: user, readError: 'Access denied' }]);
		assert.deepStrictEqual({ key: catalog.workflows[0].key, codes: catalog.workflows[0].diagnostics.map(diagnostic => diagnostic.code), count: getWorkflowSourceCounts(catalog).user }, { key: resource.toString(), codes: ['source'], count: 1 });
	});

	test('definitions are frozen without freezing URI formatting caches', () => {
		const catalog = createWorkflowCatalog([document('checkpoint', testCheckpointType()), document('workflow', testWorkflowDefinition())]);
		const entry = catalog.workflows[0];
		assert.deepStrictEqual({ definitionFrozen: Object.isFrozen(entry.definition), resourceFrozen: Object.isFrozen(entry.resource), filePath: typeof entry.resource!.fsPath }, { definitionFrozen: true, resourceFrozen: false, filePath: 'string' });
	});
});
