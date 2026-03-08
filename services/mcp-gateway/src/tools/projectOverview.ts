// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

export interface ProjectOverviewResult {
	totalFiles: number;
	totalFunctions: number;
	totalClasses: number;
	totalTypes: number;
	languageBreakdown: Record<string, number>;
	modules: ModuleSummary[];
	entryPoints: string[];
	keyAbstractions: KeyAbstraction[];
	warning?: string;
}

interface ModuleSummary {
	name: string;
	path: string;
	entryPoint?: string;
	fileCount: number;
}

interface KeyAbstraction {
	name: string;
	type: string;
	file: string;
	inDegree: number;
}

export async function projectOverview(
	db: FalkorDBClient
): Promise<ProjectOverviewResult> {
	const [
		countsResult,
		languageResult,
		modulesResult,
		entryPointsResult,
		keyAbstractionsResult,
	] = await Promise.all([
		db.query(`
			MATCH (f:File) WITH count(f) AS files
			MATCH (fn:Function) WITH files, count(fn) AS functions
			MATCH (c:Class) WITH files, functions, count(c) AS classes
			MATCH (t:Type) WITH files, functions, classes, count(t) AS types
			RETURN files, functions, classes, types
		`),
		db.query(`
			MATCH (f:File)
			RETURN f.language AS language, count(f) AS count
			ORDER BY count DESC
		`),
		db.query(`
			MATCH (m:Module)
			OPTIONAL MATCH (m)<-[:BELONGS_TO]-(f:File)
			RETURN m.name AS name, m.path AS path, m.entryPoint AS entryPoint,
			       count(f) AS fileCount
			ORDER BY fileCount DESC
			LIMIT 30
		`),
		db.query(`
			MATCH (f:File)
			WHERE f.path ENDS WITH '/index.ts' OR f.path ENDS WITH '/index.js'
			   OR f.path ENDS WITH '/main.ts' OR f.path ENDS WITH '/main.js'
			   OR f.path ENDS WITH '/app.ts' OR f.path ENDS WITH '/app.js'
			RETURN f.path AS path
			ORDER BY f.path
			LIMIT 20
		`),
		// Key abstractions: symbols with highest in-degree (most referenced)
		db.query(`
			MATCH (s)<-[r]-()
			WHERE s:Class OR s:Type OR s:Function
			WITH s, count(r) AS inDegree
			ORDER BY inDegree DESC
			LIMIT 20
			RETURN s.name AS name, labels(s)[0] AS type, s.file AS file, inDegree
		`),
	]);

	const counts = countsResult.rows.length > 0 ? flattenRow(countsResult.rows[0]) : {};

	const languageBreakdown: Record<string, number> = {};
	for (const row of languageResult.rows) {
		const record = flattenRow(row);
		const lang = String(record.language ?? 'unknown');
		languageBreakdown[lang] = Number(record.count ?? 0);
	}

	const modules: ModuleSummary[] = modulesResult.rows.map(row => {
		const record = flattenRow(row);
		return {
			name: String(record.name ?? ''),
			path: String(record.path ?? ''),
			entryPoint: record.entryPoint ? String(record.entryPoint) : undefined,
			fileCount: Number(record.fileCount ?? 0),
		};
	});

	const entryPoints = entryPointsResult.rows.map(row => {
		const record = flattenRow(row);
		return String(record.path ?? '');
	});

	const keyAbstractions: KeyAbstraction[] = keyAbstractionsResult.rows.map(row => {
		const record = flattenRow(row);
		return {
			name: String(record.name ?? ''),
			type: String(record.type ?? ''),
			file: String(record.file ?? ''),
			inDegree: Number(record.inDegree ?? 0),
		};
	});

	const totalFiles = Number(counts.files ?? 0);
	const hasData = totalFiles > 0;

	return {
		totalFiles,
		totalFunctions: Number(counts.functions ?? 0),
		totalClasses: Number(counts.classes ?? 0),
		totalTypes: Number(counts.types ?? 0),
		languageBreakdown,
		modules,
		entryPoints,
		keyAbstractions,
		...(!hasData ? { warning: 'The code graph appears empty. Run the indexer first.' } : {}),
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
