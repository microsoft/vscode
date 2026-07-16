/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Heap Snapshot Comparison
 *
 * Compares two V8 heap snapshots (before/after) and reports:
 * - Top object groups by size increase
 * - Top object groups by count increase
 * - New object groups (only in "after")
 * - VS Code-specific class changes
 */

import { parseSnapshot, collectNodeIds, type SnapshotData } from './parseSnapshot.ts';

export interface ComparisonGroup {
	key: string;
	type: string;
	name: string;
	beforeCount: number;
	afterCount: number;
	countDiff: number;
	beforeSize: number;
	afterSize: number;
	sizeDiff: number;
}

export interface ComparisonResult {
	summary: {
		beforeNodes: number;
		afterNodes: number;
		beforeSize: number;
		afterSize: number;
		nodeDelta: number;
		sizeDelta: number;
	};
	/** Top groups by size increase */
	topBySize: ComparisonGroup[];
	/** Top groups by count increase */
	topByCount: ComparisonGroup[];
	/** Groups that only exist in the "after" snapshot */
	newObjectGroups: ComparisonGroup[];
}

function groupByConstructor(data: SnapshotData, filterIds?: Set<number>) {
	const { meta, nodes, strings } = data;
	const nfc = meta.node_fields.length;
	const nodeTypes = meta.node_types[0];
	const typeIdx = meta.node_fields.indexOf('type');
	const nameIdx = meta.node_fields.indexOf('name');
	const idIdx = meta.node_fields.indexOf('id');
	const selfSizeIdx = meta.node_fields.indexOf('self_size');

	const groups = new Map<string, { type: string; name: string; count: number; totalSize: number }>();
	let totalSize = 0;

	for (let i = 0; i < nodes.length; i += nfc) {
		const id = nodes[i + idIdx];
		if (filterIds && !filterIds.has(id)) { continue; }

		const typeName = nodeTypes[nodes[i + typeIdx]];
		const name = strings[nodes[i + nameIdx]];
		const selfSize = nodes[i + selfSizeIdx];
		totalSize += selfSize;

		const key = `${typeName}::${name}`;
		let g = groups.get(key);
		if (!g) {
			g = { type: typeName, name, count: 0, totalSize: 0 };
			groups.set(key, g);
		}
		g.count++;
		g.totalSize += selfSize;
	}

	return { groups, totalSize, nodeCount: nodes.length / nfc };
}

/**
 * Compare two heap snapshots and return the differences.
 */
export function compareSnapshots(beforePath: string, afterPath: string, topN = 50): ComparisonResult {
	const beforeData = parseSnapshot(beforePath);
	const beforeResult = groupByConstructor(beforeData);
	const beforeIds = collectNodeIds(beforeData);
	// Free memory
	beforeData.nodes = null!;
	beforeData.edges = null!;

	const afterData = parseSnapshot(afterPath);
	const afterResult = groupByConstructor(afterData);
	const newIds = new Set<number>();
	{
		const nfc = afterData.meta.node_fields.length;
		const idIdx = afterData.meta.node_fields.indexOf('id');
		for (let i = 0; i < afterData.nodes.length; i += nfc) {
			const id = afterData.nodes[i + idIdx];
			if (!beforeIds.has(id)) { newIds.add(id); }
		}
	}
	const newObjectResult = groupByConstructor(afterData, newIds);
	afterData.nodes = null!;
	afterData.edges = null!;

	// Compute diffs
	const diffs: ComparisonGroup[] = [];
	for (const [key, afterGroup] of afterResult.groups) {
		const beforeGroup = beforeResult.groups.get(key);
		const beforeCount = beforeGroup?.count ?? 0;
		const beforeSize = beforeGroup?.totalSize ?? 0;
		const countDiff = afterGroup.count - beforeCount;
		const sizeDiff = afterGroup.totalSize - beforeSize;

		if (countDiff > 0 || sizeDiff > 1024) {
			diffs.push({
				key,
				type: afterGroup.type,
				name: afterGroup.name,
				beforeCount,
				afterCount: afterGroup.count,
				countDiff,
				beforeSize,
				afterSize: afterGroup.totalSize,
				sizeDiff,
			});
		}
	}

	const topBySize = [...diffs].sort((a, b) => b.sizeDiff - a.sizeDiff).slice(0, topN);
	const topByCount = [...diffs].sort((a, b) => b.countDiff - a.countDiff).slice(0, topN);

	const newGroups = [...newObjectResult.groups.values()]
		.map(g => ({
			key: `${g.type}::${g.name}`,
			...g,
			beforeCount: 0,
			afterCount: g.count,
			countDiff: g.count,
			beforeSize: 0,
			afterSize: g.totalSize,
			sizeDiff: g.totalSize,
		}))
		.sort((a, b) => b.sizeDiff - a.sizeDiff)
		.slice(0, topN);

	return {
		summary: {
			beforeNodes: beforeResult.nodeCount,
			afterNodes: afterResult.nodeCount,
			beforeSize: beforeResult.totalSize,
			afterSize: afterResult.totalSize,
			nodeDelta: afterResult.nodeCount - beforeResult.nodeCount,
			sizeDelta: afterResult.totalSize - beforeResult.totalSize,
		},
		topBySize,
		topByCount,
		newObjectGroups: newGroups,
	};
}

export function formatBytes(bytes: number): string {
	if (Math.abs(bytes) < 1024) { return `${bytes} B`; }
	if (Math.abs(bytes) < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Print a comparison result to the console.
 */
function formatSigned(value: number, formatter: (v: number) => string): string {
	return `${value >= 0 ? '+' : ''}${formatter(value)}`;
}

export function printComparison(result: ComparisonResult): void {
	const s = result.summary;
	console.log(`\nBefore: ${s.beforeNodes} nodes, ${formatBytes(s.beforeSize)}`);
	console.log(`After:  ${s.afterNodes} nodes, ${formatBytes(s.afterSize)}`);
	console.log(`Delta:  ${formatSigned(s.nodeDelta, String)} nodes, ${formatSigned(s.sizeDelta, formatBytes)}\n`);

	console.log('=== TOP by SIZE increase ===');
	for (const d of result.topBySize.slice(0, 30)) {
		console.log(`  ${d.key}: ${d.beforeCount} → ${d.afterCount} (${formatSigned(d.countDiff, String)}) | ${formatSigned(d.sizeDiff, formatBytes)}`);
	}

	console.log('\n=== TOP by COUNT increase ===');
	for (const d of result.topByCount.slice(0, 30)) {
		console.log(`  ${d.key}: ${d.beforeCount} → ${d.afterCount} (${formatSigned(d.countDiff, String)}) | ${formatSigned(d.sizeDiff, formatBytes)}`);
	}
}
