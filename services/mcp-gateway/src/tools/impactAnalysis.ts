// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface ImpactAnalysisInput {
	symbol: string;
	file?: string;
}

export interface ImpactEntry {
	name: string;
	type: string;
	file: string;
	relationship: string;
	category: 'direct' | 'transitive';
}

export interface ImpactAnalysisResult {
	symbol: string;
	directDependents: ImpactEntry[];
	transitiveDependents: ImpactEntry[];
	totalImpact: number;
	warning?: string;
}

export async function impactAnalysis(
	db: FalkorDBClient,
	input: ImpactAnalysisInput
): Promise<ImpactAnalysisResult> {
	const fileFilter = input.file ? ' AND s.file = $file' : '';
	const params: Record<string, unknown> = { name: input.symbol };
	if (input.file) {
		params.file = input.file;
	}

	// Direct dependents (depth 1): callers, importers, referencers
	const directCypher = `
		MATCH (dep)-[r]->(s)
		WHERE s.name = $name${fileFilter}
		  AND type(r) IN ['CALLS', 'IMPORTS', 'REFERENCES']
		RETURN DISTINCT dep.name AS name, labels(dep)[0] AS type,
		       dep.file AS file, type(r) AS relationship
		ORDER BY dep.file, dep.name
		LIMIT 100
	`;

	// Transitive dependents (depth 2+): callers of callers, etc.
	const transitiveCypher = `
		MATCH (dep)-[r1]->(mid)-[r2]->(s)
		WHERE s.name = $name${fileFilter}
		  AND type(r1) IN ['CALLS', 'IMPORTS', 'REFERENCES']
		  AND type(r2) IN ['CALLS', 'IMPORTS', 'REFERENCES']
		  AND dep <> s AND dep <> mid
		RETURN DISTINCT dep.name AS name, labels(dep)[0] AS type,
		       dep.file AS file, type(r1) AS relationship
		ORDER BY dep.file, dep.name
		LIMIT 100
	`;

	const [directResult, transitiveResult] = await Promise.all([
		db.query(directCypher, params),
		db.query(transitiveCypher, params),
	]);

	const directDependents = directResult.rows.map(row => toImpactEntry(row, 'direct'));
	const transitiveDependents = transitiveResult.rows.map(row => toImpactEntry(row, 'transitive'));

	// Deduplicate: remove transitive entries that also appear as direct
	const directKeys = new Set(directDependents.map(d => `${d.name}:${d.file}`));
	const uniqueTransitive = transitiveDependents.filter(d => !directKeys.has(`${d.name}:${d.file}`));

	const totalImpact = directDependents.length + uniqueTransitive.length;

	return {
		symbol: input.symbol,
		directDependents,
		transitiveDependents: uniqueTransitive,
		totalImpact,
		...(totalImpact === 0 ? { warning: 'No dependents found. The graph may be partially indexed or this symbol is unused.' } : {}),
	};
}

function toImpactEntry(row: Record<string, unknown>[], category: 'direct' | 'transitive'): ImpactEntry {
	const record = flattenRow(row);
	return {
		name: String(record.name ?? ''),
		type: String(record.type ?? 'unknown'),
		file: String(record.file ?? ''),
		relationship: String(record.relationship ?? ''),
		category,
	};
}

function flattenRow(row: Record<string, unknown>[]): Record<string, unknown> {
	const flat: Record<string, unknown> = {};
	for (const cell of row) {
		if (typeof cell === 'object' && cell !== null) {
			Object.assign(flat, cell);
		}
	}
	return flat;
}
