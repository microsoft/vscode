// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface DependencyTraversalInput {
	file?: string;
	function?: string;
	depth?: number;
}

export interface DependencyNode {
	name: string;
	type: string;
	file: string;
	relationship: string;
	depth: number;
}

export interface DependencyTree {
	root: string;
	rootType: string;
	dependencies: DependencyNode[];
	warning?: string;
}

export async function dependencyTraversal(
	db: FalkorDBClient,
	input: DependencyTraversalInput
): Promise<DependencyTree> {
	const depth = Math.min(input.depth ?? 2, 5);

	if (input.function) {
		return traverseFromFunction(db, input.function, depth);
	}
	if (input.file) {
		return traverseFromFile(db, input.file, depth);
	}
	throw new Error('Either file or function must be provided');
}

async function traverseFromFunction(
	db: FalkorDBClient,
	functionName: string,
	depth: number
): Promise<DependencyTree> {
	const cypher = `
		MATCH (f:Function {name: $name})-[:CALLS*1..${depth}]->(dep:Function)
		RETURN DISTINCT dep.name AS name, labels(dep)[0] AS type,
		       dep.file AS file, 'CALLS' AS relationship,
		       length(shortestPath((f)-[:CALLS*]->(dep))) AS depth
		ORDER BY depth, dep.file, dep.name
		LIMIT 200
	`;

	const result = await db.query(cypher, { name: functionName });

	const dependencies: DependencyNode[] = result.rows.map(row => {
		const record = flattenRow(row);
		return {
			name: String(record.name ?? ''),
			type: String(record.type ?? 'Function'),
			file: String(record.file ?? ''),
			relationship: String(record.relationship ?? 'CALLS'),
			depth: Number(record.depth ?? 1),
		};
	});

	return {
		root: functionName,
		rootType: 'Function',
		dependencies,
		...(dependencies.length === 0 ? { warning: 'No dependencies found. The graph may be partially indexed.' } : {}),
	};
}

async function traverseFromFile(
	db: FalkorDBClient,
	filePath: string,
	depth: number
): Promise<DependencyTree> {
	const cypher = `
		MATCH (f:File {path: $path})-[:IMPORTS*1..${depth}]->(dep:File)
		RETURN DISTINCT dep.path AS name, 'File' AS type,
		       dep.path AS file, 'IMPORTS' AS relationship,
		       length(shortestPath((f)-[:IMPORTS*]->(dep))) AS depth
		ORDER BY depth, dep.path
		LIMIT 200
	`;

	const result = await db.query(cypher, { path: filePath });

	const dependencies: DependencyNode[] = result.rows.map(row => {
		const record = flattenRow(row);
		return {
			name: String(record.name ?? ''),
			type: String(record.type ?? 'File'),
			file: String(record.file ?? ''),
			relationship: String(record.relationship ?? 'IMPORTS'),
			depth: Number(record.depth ?? 1),
		};
	});

	return {
		root: filePath,
		rootType: 'File',
		dependencies,
		...(dependencies.length === 0 ? { warning: 'No dependencies found. The graph may be partially indexed.' } : {}),
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
