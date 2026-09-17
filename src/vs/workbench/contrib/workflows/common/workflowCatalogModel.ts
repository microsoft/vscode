/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, ParseError } from '../../../../base/common/json.js';
import { deepFreeze } from '../../../../base/common/objects.js';
import { basename } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { getWorkflowCheckpointTypeReference, resolveWorkflowDefinition, validateWorkflowCheckpointType } from '../../../../platform/workflow/common/workflowValidation.js';
import { WorkflowCatalog, WorkflowCatalogDiagnostic, WorkflowCatalogEntry, WorkflowCheckpointEntry, WorkflowTemplateEntry } from './workflowCatalog.js';

export const workflowSchemaId = 'vscode://schemas/workflow/v1';
export const workflowCheckpointSchemaId = 'vscode://schemas/workflow-checkpoint/v1';

export interface WorkflowCatalogDocument {
	readonly kind: 'workflow' | 'checkpoint';
	readonly content: string;
	readonly resource?: URI;
	readonly source: WorkflowSource;
	readonly readError?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCheckpointTypeShape(value: Record<string, unknown>): boolean {
	const completion = value.completion;
	return typeof value.label === 'string' && typeof value.instructions === 'string' && isRecord(value.proofSchema)
		&& isRecord(completion) && (completion.kind === 'reported' || completion.kind === 'checked' && isRecord(completion.check) && typeof completion.check.check === 'string')
		&& (value.startCondition === undefined || isRecord(value.startCondition) && typeof value.startCondition.check === 'string');
}

function hasCheckpointShape(value: unknown): boolean {
	return isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string'
		&& (value.label === undefined || typeof value.label === 'string')
		&& (value.instructions === undefined || typeof value.instructions === 'string')
		&& (value.afterCompletion === undefined || isRecord(value.afterCompletion) && (value.afterCompletion.group === undefined || typeof value.afterCompletion.group === 'string'))
		&& (value.localType === undefined || isRecord(value.localType) && hasCheckpointTypeShape(value.localType));
}

/** Discovery never resolves a schema over the network. */
function hasRemoteSchema(value: unknown): boolean {
	if (!isRecord(value)) {
		return false;
	}
	const contracts = [value, ...(Array.isArray(value.checkpoints) ? value.checkpoints.flatMap(checkpoint => isRecord(checkpoint) && isRecord(checkpoint.localType) ? [checkpoint.localType] : []) : [])];
	if (contracts.some(contract => typeof contract.$schema === 'string' && ![workflowSchemaId, workflowCheckpointSchemaId].includes(contract.$schema))) {
		return true;
	}
	const pending: unknown[] = contracts.flatMap(contract => [contract.inputSchema, contract.proofSchema, contract.outputSchema]);
	while (pending.length) {
		const current = pending.pop();
		if (!isRecord(current)) {
			continue;
		}
		if (typeof current.$ref === 'string' && !current.$ref.startsWith('#') || typeof current.$schema === 'string') {
			return true;
		}
		for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) {
			if (isRecord(current[key])) {
				pending.push(...Object.values(current[key]));
			}
		}
		for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
			if (Array.isArray(current[key])) {
				pending.push(...current[key]);
			}
		}
		pending.push(current.items, current.additionalProperties, current.not, current.if, current.then, current.else);
	}
	return false;
}

export function parseWorkflowDocument(document: WorkflowCatalogDocument & { readonly kind: 'workflow' }): WorkflowTemplateEntry;
export function parseWorkflowDocument(document: WorkflowCatalogDocument & { readonly kind: 'checkpoint' }): WorkflowCheckpointEntry;
export function parseWorkflowDocument(document: WorkflowCatalogDocument): WorkflowCatalogEntry<WorkflowDefinition | WorkflowCheckpointType>;
export function parseWorkflowDocument(document: WorkflowCatalogDocument): WorkflowCatalogEntry<WorkflowDefinition | WorkflowCheckpointType> {
	const diagnostics: WorkflowCatalogDiagnostic[] = [];
	const error = (code: WorkflowCatalogDiagnostic['code'], message: string) => diagnostics.push({ severity: 'error', code, message, resource: document.resource });
	const errors: ParseError[] = [];
	let value: unknown;
	let parseFailed = false;
	try {
		value = document.content.length <= 1_048_576 ? parse(document.content, errors) : undefined;
	} catch {
		parseFailed = true;
	}
	let definition: WorkflowDefinition | WorkflowCheckpointType | undefined;
	if (document.readError) {
		error('source', document.readError);
	} else if (document.content.length > 1_048_576) {
		error('parse', localize('workflow.fileTooLarge', "Workflow files must be smaller than 1 MB."));
	} else if (parseFailed || errors.length || !isRecord(value)) {
		error('parse', localize('workflow.invalidJson', "Expected a JSON object. Correct the JSONC syntax before using this file."));
	} else if (typeof value.id !== 'string' || !value.id.trim() || typeof value.label !== 'string' || !value.label.trim()) {
		error('invalid', localize('workflow.missingIdentity', "A workflow or checkpoint needs a non-empty id and label."));
	} else if (!Number.isSafeInteger(value.version) || (value.version as number) < 1) {
		error('version', localize('workflow.invalidVersion', "The version must be a positive integer. Checkpoint references must name that exact version."));
	} else if (value.description !== undefined && typeof value.description !== 'string') {
		error('invalid', localize('workflow.invalidDescription', "The description must be a string."));
	} else if (hasRemoteSchema(value)) {
		error('source', localize('workflow.remoteSchema', "Schemas must be embedded in the workflow. External schemas are never fetched."));
	} else if (document.kind === 'workflow' && (!Array.isArray(value.checkpoints) || !value.checkpoints.every(hasCheckpointShape))) {
		error('invalid', localize('workflow.missingCheckpoints', "A workflow must contain an ordered array of checkpoint objects with valid labels, instructions, and local contracts."));
	} else if (document.kind === 'checkpoint' && !hasCheckpointTypeShape(value)) {
		error('invalid', localize('workflow.missingContract', "A checkpoint needs instructions, a proofSchema object, and a completion rule."));
	} else {
		const { $schema: _schema, source: _source, ...body } = value;
		const parsed = body as unknown as WorkflowDefinition | WorkflowCheckpointType;
		definition = { ...parsed, source: document.source };
		if (document.kind === 'workflow' && hasKey(definition, { checkpoints: true })) {
			definition = {
				...definition,
				checkpoints: definition.checkpoints.map(checkpoint => {
					if (!checkpoint.localType || !isRecord(checkpoint.localType)) {
						return checkpoint;
					}
					const { $schema: _schema, ...localType } = checkpoint.localType;
					return { ...checkpoint, localType: { ...localType, source: document.source } };
				}),
			};
		}
	}
	return {
		key: document.resource?.toString() ?? `${document.source.kind}:${document.source.id}:${definition?.id ?? 'invalid'}@${definition?.version ?? 0}`,
		label: definition?.label ?? (document.resource ? basename(document.resource) : document.source.label ?? document.source.id),
		resource: document.resource,
		source: document.source,
		readOnly: document.source.kind === 'builtin' || document.source.kind === 'extension',
		definition,
		diagnostics,
	};
}

function diagnoseConflicts<T extends WorkflowDefinition | WorkflowCheckpointType>(entries: readonly WorkflowCatalogEntry<T>[], getReference: (definition: T) => string): WorkflowCatalogEntry<T>[] {
	const groups = new Map<string, WorkflowCatalogEntry<T>[]>();
	for (const entry of entries) {
		if (entry.definition) {
			const key = getReference(entry.definition);
			const group = groups.get(key) ?? [];
			group.push(entry);
			groups.set(key, group);
		}
	}
	return entries.map(entry => {
		const key = entry.definition && getReference(entry.definition);
		const group = key ? groups.get(key) : undefined;
		if (!group || group.length === 1) {
			return entry;
		}
		return {
			...entry,
			diagnostics: [...entry.diagnostics, {
				code: 'conflict',
				severity: 'error',
				resource: entry.resource,
				message: localize('workflow.conflictingSources', "'{0}' is defined by more than one source ({1}). Rename the local copy or remove the duplicate; no source silently overrides another.", key, group.map(candidate => candidate.source.label ?? candidate.source.id).join(', ')),
			}],
		};
	});
}

export function getUsableCheckpointTypes(catalog: Pick<WorkflowCatalog, 'checkpointTypes'>): readonly WorkflowCheckpointType[] {
	return catalog.checkpointTypes.flatMap(entry => entry.definition && !entry.diagnostics.some(diagnostic => diagnostic.severity === 'error') ? [entry.definition] : []);
}

export function createWorkflowCatalog(documents: readonly WorkflowCatalogDocument[], diagnostics: readonly WorkflowCatalogDiagnostic[] = []): WorkflowCatalog {
	const checkpoints: WorkflowCheckpointEntry[] = [];
	const workflows: WorkflowTemplateEntry[] = [];
	for (const document of documents) {
		const entry = parseWorkflowDocument(document);
		if (document.kind === 'checkpoint') {
			checkpoints.push(entry as WorkflowCheckpointEntry);
		} else {
			workflows.push(entry as WorkflowTemplateEntry);
		}
	}
	const checkpointTypes = diagnoseConflicts(checkpoints, getWorkflowCheckpointTypeReference).map(entry => {
		if (!entry.definition || entry.diagnostics.length) {
			return entry;
		}
		try {
			validateWorkflowCheckpointType(entry.definition);
			return entry;
		} catch (error) {
			return { ...entry, diagnostics: [...entry.diagnostics, { severity: 'error' as const, code: 'invalid' as const, message: String(error), resource: entry.resource }] };
		}
	});
	const types = getUsableCheckpointTypes({ checkpointTypes });
	const resolvedWorkflows = diagnoseConflicts(workflows, definition => `${definition.id}@${definition.version}`).map(entry => {
		if (!entry.definition || entry.diagnostics.length) {
			return entry;
		}
		try {
			resolveWorkflowDefinition(entry.definition, types);
			return entry;
		} catch (error) {
			return { ...entry, diagnostics: [...entry.diagnostics, { severity: 'error' as const, code: 'unresolved' as const, message: String(error), resource: entry.resource }] };
		}
	});
	// URI metadata keeps its lazy formatting caches; only the JSON definitions are frozen.
	for (const entry of [...resolvedWorkflows, ...checkpointTypes]) {
		if (entry.definition) {
			deepFreeze(entry.definition);
		}
	}
	return {
		workflows: resolvedWorkflows,
		checkpointTypes,
		diagnostics: [...diagnostics, ...resolvedWorkflows.flatMap(entry => entry.diagnostics), ...checkpointTypes.flatMap(entry => entry.diagnostics)],
	};
}
