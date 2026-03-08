// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { FalkorDBClient } from '../clients/falkordb';

const GRAPH_NAME = 'son-of-anton-memory';

export interface MemoryQueryParams {
	type?: string;
	keyword?: string;
	topic?: string;
	currentOnly?: boolean;
	since?: number;
	limit?: number;
}

export interface MemoryRecordParams {
	type: string;
	content: string;
	source: string;
	topics: string[];
	supersedesId?: string;
}

export interface MemoryHistoryParams {
	topic: string;
}

/**
 * Query long-term memory entries from the temporal knowledge graph.
 */
export async function memoryQuery(
	db: FalkorDBClient,
	params: MemoryQueryParams,
): Promise<unknown[]> {
	const conditions: string[] = [];
	const queryParams: Record<string, unknown> = {};

	if (params.type) {
		conditions.push(`e:${params.type}`);
	}

	if (params.currentOnly !== false) {
		conditions.push('e.validUntil IS NULL');
	}

	if (params.keyword) {
		conditions.push('e.content CONTAINS $keyword');
		queryParams.keyword = params.keyword;
	}

	if (params.topic) {
		conditions.push('$topic IN e.topics');
		queryParams.topic = params.topic;
	}

	if (params.since) {
		conditions.push('e.createdAt >= $since');
		queryParams.since = params.since;
	}

	const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
	const limitClause = params.limit ? `LIMIT ${params.limit}` : 'LIMIT 50';

	const query = `MATCH (e) ${whereClause} RETURN e ORDER BY e.createdAt DESC ${limitClause}`;

	const result = await db.query(query, queryParams);
	return result.rows;
}

/**
 * Record a new memory entry in the temporal knowledge graph.
 * Only orchestrator and human roles can write.
 */
export async function memoryRecord(
	db: FalkorDBClient,
	params: MemoryRecordParams,
): Promise<{ id: string; created: boolean }> {
	const now = Date.now();
	const id = `mem-${now}-${Math.random().toString(36).substring(2, 8)}`;

	// If superseding, mark old entry
	if (params.supersedesId) {
		const updateQuery = `MATCH (e {id: $oldId}) SET e.validUntil = $now, e.supersededBy = $newId`;
		await db.query(updateQuery, {
			oldId: params.supersedesId,
			now,
			newId: id,
		});
	}

const createQuery =
    `CREATE (:${params.type} {` +
    `id: '${id}', ` +
    `content: $content, ` +
    `source: $source, ` +
    `createdAt: ${now}, ` +
    `validFrom: ${now}, ` +
    `validUntil: null, ` +
    `supersededBy: null, ` +
    `topics: $topics` +
    `})`;

await db.query(createQuery, {
    content: params.content,
    source: params.source,
    topics: params.topics,
});
	const createQuery =
		`CREATE (:${params.type} {` +
		`id: '${id}', ` +
		`content: $content, ` +
		`source: $source, ` +
		`createdAt: ${now}, ` +
		`validFrom: ${now}, ` +
		`validUntil: null, ` +
		`supersededBy: null, ` +
		`topics: [${topics}]` +
		`})`;

	await db.query(createQuery, {
		content: params.content,
		source: params.source,
	});

	return { id, created: true };
}

/**
 * Get the temporal history of a topic — how knowledge has changed over time.
 */
export async function memoryHistory(
	db: FalkorDBClient,
	params: MemoryHistoryParams,
): Promise<unknown[]> {
	const query = `MATCH (e) WHERE $topic IN e.topics RETURN e ORDER BY e.createdAt ASC`;
	const result = await db.query(query, {
		topic: params.topic,
	});
	return result.rows;
}
