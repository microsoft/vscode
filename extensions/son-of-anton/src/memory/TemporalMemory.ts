/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TemporalMemory — Graphiti-pattern temporal knowledge graph for long-term agent memory.
 *
 * Persists across sessions and tracks how project knowledge evolves over time.
 * Uses FalkorDB (Redis-compatible) for graph storage with temporal tracking.
 *
 * Entity types: Decision, Convention, Warning, Preference
 * Each entity has validFrom/validUntil timestamps for temporal querying.
 */

export type MemoryEntityType = 'Decision' | 'Convention' | 'Warning' | 'Preference';

export type MemoryAccessRole = 'orchestrator' | 'human' | 'agent';

export interface TemporalMemoryEntry {
	/** Unique node ID in the graph */
	id: string;
	/** Type of memory entity */
	type: MemoryEntityType;
	/** The actual content/knowledge */
	content: string;
	/** Session or source that created this entry */
	source: string;
	/** When this entry was created */
	createdAt: number;
	/** When this knowledge became valid */
	validFrom: number;
	/** When this knowledge was superseded (null if still current) */
	validUntil: number | null;
	/** ID of the entry that superseded this one (null if still current) */
	supersededBy: string | null;
	/** Topic tags for categorization */
	topics: string[];
}

export interface MemoryQueryOptions {
	/** Filter by entity type */
	type?: MemoryEntityType;
	/** Search by keyword in content */
	keyword?: string;
	/** Filter by topic */
	topic?: string;
	/** Only return current (non-superseded) entries */
	currentOnly?: boolean;
	/** Filter by time range */
	since?: number;
	until?: number;
	/** Maximum results */
	limit?: number;
}

export interface MemoryHistoryEntry {
	entry: TemporalMemoryEntry;
	action: 'created' | 'superseded';
	timestamp: number;
}

export interface TemporalMemoryOptions {
	/** FalkorDB/Redis host */
	host: string;
	/** FalkorDB/Redis port */
	port: number;
	/** Graph name in FalkorDB */
	graphName?: string;
}

const DEFAULT_GRAPH_NAME = 'son-of-anton-memory';

/**
 * Temporal knowledge graph for long-term agent memory.
 * Implements the Graphiti pattern with FalkorDB as the backing store.
 *
 * In-memory implementation for initial development; graph queries
 * are structured to be directly translatable to Cypher.
 */
export class TemporalMemory {
	private readonly entries = new Map<string, TemporalMemoryEntry>();
	private readonly topicIndex = new Map<string, Set<string>>(); // topic -> entry IDs
	private readonly typeIndex = new Map<MemoryEntityType, Set<string>>(); // type -> entry IDs
	private nextId = 1;
	private readonly graphName: string;

	constructor(options: TemporalMemoryOptions) {
		this.graphName = options.graphName ?? DEFAULT_GRAPH_NAME;
	}

	/**
	 * Record a new memory entry.
	 * If this supersedes an existing entry on the same topic, mark the old one as superseded.
	 *
	 * Access control: only orchestrator and human can write.
	 */
	record(
		type: MemoryEntityType,
		content: string,
		source: string,
		topics: string[],
		role: MemoryAccessRole,
		supersedesId?: string,
	): TemporalMemoryEntry {
		if (role === 'agent') {
			throw new Error('Agents cannot write to temporal memory. Only orchestrator and human can write.');
		}

		const now = Date.now();
		const id = `mem-${this.nextId++}`;

		const entry: TemporalMemoryEntry = {
			id,
			type,
			content,
			source,
			createdAt: now,
			validFrom: now,
			validUntil: null,
			supersededBy: null,
			topics,
		};

		// If superseding an existing entry, mark the old one
		if (supersedesId) {
			const old = this.entries.get(supersedesId);
			if (old) {
				old.validUntil = now;
				old.supersededBy = id;
			}
		}

		// Store and index
		this.entries.set(id, entry);

		for (const topic of topics) {
			if (!this.topicIndex.has(topic)) {
				this.topicIndex.set(topic, new Set());
			}
			this.topicIndex.get(topic)!.add(id);
		}

		if (!this.typeIndex.has(type)) {
			this.typeIndex.set(type, new Set());
		}
		this.typeIndex.get(type)!.add(id);

		return entry;
	}

	/**
	 * Query memory entries with filtering.
	 * All agents can read.
	 *
	 * Equivalent Cypher:
	 * MATCH (e:{type}) WHERE e.content CONTAINS $keyword
	 *   AND e.validUntil IS NULL
	 *   AND e.createdAt >= $since
	 * RETURN e ORDER BY e.createdAt DESC LIMIT $limit
	 */
	query(options: MemoryQueryOptions = {}): TemporalMemoryEntry[] {
		let candidates: Set<string>;

		// Start with type filter if provided
		if (options.type && this.typeIndex.has(options.type)) {
			candidates = new Set(this.typeIndex.get(options.type)!);
		} else if (options.topic && this.topicIndex.has(options.topic)) {
			candidates = new Set(this.topicIndex.get(options.topic)!);
		} else {
			candidates = new Set(this.entries.keys());
		}

		// Apply further filters with topic intersection
		if (options.type && options.topic) {
			const topicIds = this.topicIndex.get(options.topic) ?? new Set();
			candidates = new Set([...candidates].filter(id => topicIds.has(id)));
		}

		let results: TemporalMemoryEntry[] = [];

		for (const id of candidates) {
			const entry = this.entries.get(id);
			if (!entry) {
				continue;
			}

			// Current-only filter
			if (options.currentOnly && entry.validUntil !== null) {
				continue;
			}

			// Keyword filter
			if (options.keyword && !entry.content.toLowerCase().includes(options.keyword.toLowerCase())) {
				continue;
			}

			// Time range filters
			if (options.since && entry.createdAt < options.since) {
				continue;
			}
			if (options.until && entry.createdAt > options.until) {
				continue;
			}

			results.push(entry);
		}

		// Sort by creation time, newest first
		results.sort((a, b) => b.createdAt - a.createdAt);

		// Apply limit
		if (options.limit) {
			results = results.slice(0, options.limit);
		}

		return results;
	}

	/**
	 * Get the temporal history of a topic — how knowledge about it has changed over time.
	 *
	 * Equivalent Cypher:
	 * MATCH (e) WHERE $topic IN e.topics
	 * RETURN e ORDER BY e.createdAt ASC
	 */
	history(topic: string): MemoryHistoryEntry[] {
		const ids = this.topicIndex.get(topic);
		if (!ids) {
			return [];
		}

		const history: MemoryHistoryEntry[] = [];

		for (const id of ids) {
			const entry = this.entries.get(id);
			if (!entry) {
				continue;
			}

			history.push({
				entry,
				action: 'created',
				timestamp: entry.createdAt,
			});

			if (entry.validUntil !== null) {
				history.push({
					entry,
					action: 'superseded',
					timestamp: entry.validUntil,
				});
			}
		}

		// Sort chronologically
		history.sort((a, b) => a.timestamp - b.timestamp);
		return history;
	}

	/**
	 * Get the current (non-superseded) convention/decision for a topic.
	 */
	getCurrentForTopic(topic: string): TemporalMemoryEntry | undefined {
		const ids = this.topicIndex.get(topic);
		if (!ids) {
			return undefined;
		}

		for (const id of ids) {
			const entry = this.entries.get(id);
			if (entry && entry.validUntil === null) {
				return entry;
			}
		}

		return undefined;
	}

	/**
	 * Get all current entries for building the system context.
	 * Used to include relevant memory in LLM prompts.
	 */
	getSystemContext(): string {
		const current = this.query({ currentOnly: true });
		if (current.length === 0) {
			return '';
		}

		const sections: string[] = ['# Long-term Project Memory\n'];

		const grouped = new Map<MemoryEntityType, TemporalMemoryEntry[]>();
		for (const entry of current) {
			if (!grouped.has(entry.type)) {
				grouped.set(entry.type, []);
			}
			grouped.get(entry.type)!.push(entry);
		}

		for (const [type, entries] of grouped) {
			sections.push(`## ${type}s\n`);
			for (const entry of entries) {
				const topics = entry.topics.length > 0 ? ` [${entry.topics.join(', ')}]` : '';
				sections.push(`- ${entry.content}${topics}`);
			}
			sections.push('');
		}

		return sections.join('\n');
	}

	/**
	 * Export all entries for persistence.
	 * In production, this would sync to FalkorDB.
	 */
	exportAll(): TemporalMemoryEntry[] {
		return [...this.entries.values()];
	}

	/**
	 * Import entries (e.g., from a previous session or FalkorDB backup).
	 */
	importAll(entries: TemporalMemoryEntry[]): void {
		for (const entry of entries) {
			this.entries.set(entry.id, entry);

			// Rebuild indexes
			for (const topic of entry.topics) {
				if (!this.topicIndex.has(topic)) {
					this.topicIndex.set(topic, new Set());
				}
				this.topicIndex.get(topic)!.add(entry.id);
			}

			if (!this.typeIndex.has(entry.type)) {
				this.typeIndex.set(entry.type, new Set());
			}
			this.typeIndex.get(entry.type)!.add(entry.id);

			// Track next ID
			const idNum = parseInt(entry.id.replace('mem-', ''), 10);
			if (!isNaN(idNum) && idNum >= this.nextId) {
				this.nextId = idNum + 1;
			}
		}
	}

	/**
	 * Generate Cypher queries for syncing to FalkorDB.
	 * These can be executed against the graph database to persist the in-memory state.
	 */
	toCypherStatements(): string[] {
		const statements: string[] = [];

		for (const entry of this.entries.values()) {
			const validUntil = entry.validUntil !== null ? entry.validUntil : 'null';
			const supersededBy = entry.supersededBy !== null ? `'${entry.supersededBy}'` : 'null';
			const topics = entry.topics.map(t => `'${t}'`).join(', ');

			statements.push(
				`CREATE (:${entry.type} {` +
				`id: '${entry.id}', ` +
				`content: '${entry.content.replace(/'/g, "\\'")}', ` +
				`source: '${entry.source}', ` +
				`createdAt: ${entry.createdAt}, ` +
				`validFrom: ${entry.validFrom}, ` +
				`validUntil: ${validUntil}, ` +
				`supersededBy: ${supersededBy}, ` +
				`topics: [${topics}]` +
				`})`
			);
		}

		return statements;
	}
}
