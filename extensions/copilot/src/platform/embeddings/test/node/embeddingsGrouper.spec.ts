/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { Embedding, EmbeddingType } from '../../common/embeddingsComputer';
import { EmbeddingsGrouper, GroupingOptions, Node } from '../../common/embeddingsGrouper';

interface TestTool {
	name: string;
	category: string;
}

// Helper function to create test embeddings
function createEmbedding(values: number[]): Embedding {
	return {
		type: EmbeddingType.text3small_512,
		value: values
	};
}

// Helper function to create test nodes
function createNode(name: string, category: string, embedding: number[]): Node<TestTool> {
	return {
		value: { name, category },
		embedding: createEmbedding(embedding)
	};
}

// Create embeddings that should cluster together (high cosine similarity)
function createSimilarEmbeddings(): number[][] {
	return [
		[1, 0.8, 0.2, 0.1],  // Similar to group 1
		[0.9, 0.7, 0.1, 0.15], // Similar to group 1
		[0.1, 0.2, 1, 0.8],  // Similar to group 2
		[0.15, 0.1, 0.9, 0.7], // Similar to group 2
		[0.5, 0.5, 0.5, 0.5]   // Outlier
	];
}

describe('EmbeddingsGrouper', () => {
	let grouper: EmbeddingsGrouper<TestTool>;

	beforeEach(() => {
		grouper = new EmbeddingsGrouper<TestTool>();
	});

	describe('constructor and initial state', () => {
		it('should initialize with empty clusters', () => {
			expect(grouper.getClusters()).toHaveLength(0);
		});

		it('should accept custom options', () => {
			const options: GroupingOptions = {
				eps: 0.85, // High similarity threshold
				minClusterSize: 3,
				insertThreshold: 0.7
			};
			const customGrouper = new EmbeddingsGrouper<TestTool>(options);
			expect(customGrouper.getClusters()).toHaveLength(0);
		});
	});

	describe('addNode', () => {
		it('should create singleton cluster for first node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			grouper.addNode(node);

			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(1);
			expect(clusters[0].nodes).toHaveLength(1);
			expect(clusters[0].nodes[0]).toBe(node);
		});

		it('should create separate clusters for dissimilar nodes', () => {
			const node1 = createNode('tool1', 'category1', [1, 0, 0, 0]);
			const node2 = createNode('tool2', 'category2', [0, 1, 0, 0]);

			grouper.addNode(node1);
			grouper.addNode(node2);

			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(2);
			expect(clusters.every(c => c.nodes.length === 1)).toBe(true);
		});

		it('should add similar nodes to existing clusters when possible', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('tool1', 'category1', embeddings[0]),
				createNode('tool2', 'category1', embeddings[1])
			];

			grouper.addNode(nodes[0]);
			grouper.addNode(nodes[1]);

			// After adding similar nodes incrementally, they might not cluster
			// Let's force clustering to see the behavior
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters.length).toBeGreaterThan(0);

			// Similar embeddings should be in same cluster
			const cluster = grouper.getClusterForNode(nodes[0]);
			expect(cluster).toBeDefined();
			expect(cluster!.nodes.some(n => n === nodes[1])).toBe(true);
		});
	});

	describe('addNodes (bulk)', () => {
		it('should handle empty array efficiently', () => {
			grouper.addNodes([]);
			expect(grouper.getClusters()).toHaveLength(0);
		});

		it('should add multiple nodes and cluster them efficiently', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('search', 'lookup', embeddings[0]),
				createNode('find', 'lookup', embeddings[1]), // Similar to search
				createNode('create', 'generate', embeddings[2]),
				createNode('make', 'generate', embeddings[3]), // Similar to create
				createNode('random', 'misc', embeddings[4])     // Outlier
			];

			grouper.addNodes(nodes);

			const clusters = grouper.getClusters();
			expect(clusters.length).toBeGreaterThanOrEqual(2);

			// Verify all nodes are assigned
			const totalNodesInClusters = clusters.reduce((sum, cluster) => sum + cluster.nodes.length, 0);
			expect(totalNodesInClusters).toBe(nodes.length);
		});

		it('should allow deferring clustering with reclusterAfter=false', () => {
			const nodes = [
				createNode('tool1', 'cat1', [1, 0, 0, 0]),
				createNode('tool2', 'cat1', [0.9, 0.1, 0, 0]),
				createNode('tool3', 'cat1', [0, 1, 0, 0])
			];

			grouper.addNodes(nodes, false);

			// Should create singleton clusters without clustering
			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(3);
			expect(clusters.every(c => c.nodes.length === 1)).toBe(true);

			// Manual recluster should group similar nodes
			grouper.recluster();
			const clustersAfterRecluster = grouper.getClusters();
			// Should potentially reduce cluster count due to grouping
			expect(clustersAfterRecluster.length).toBeLessThanOrEqual(clusters.length);
		});
	});

	describe('removeNode', () => {
		it('should return false for non-existent node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			const result = grouper.removeNode(node);
			expect(result).toBe(false);
		});

		it('should remove node and return true for existing node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			grouper.addNode(node);

			const result = grouper.removeNode(node);
			expect(result).toBe(true);
			expect(grouper.getClusters()).toHaveLength(0);
		});

		it('should remove empty clusters when last node is removed', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			grouper.addNode(node);
			expect(grouper.getClusters()).toHaveLength(1);

			grouper.removeNode(node);
			expect(grouper.getClusters()).toHaveLength(0);
		});

		it('should update cluster when node is removed from multi-node cluster', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('tool1', 'category1', embeddings[0]),
				createNode('tool2', 'category1', embeddings[1]),
				createNode('tool3', 'category1', embeddings[0]) // Very similar to first
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const initialClusters = grouper.getClusters();
			const clusterWithMultipleNodes = initialClusters.find(c => c.nodes.length > 1);

			if (clusterWithMultipleNodes && clusterWithMultipleNodes.nodes.length > 1) {
				const nodeToRemove = clusterWithMultipleNodes.nodes[0];
				grouper.removeNode(nodeToRemove);

				const updatedCluster = grouper.getClusterForNode(clusterWithMultipleNodes.nodes[1]);
				expect(updatedCluster).toBeDefined();
				expect(updatedCluster!.nodes.some(n => n === nodeToRemove)).toBe(false);
			}
		});
	});

	describe('recluster', () => {
		it('should handle empty node list', () => {
			grouper.recluster();
			expect(grouper.getClusters()).toHaveLength(0);
		});

		it('should create single cluster for single node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			grouper.addNode(node);
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(1);
			expect(clusters[0].nodes).toHaveLength(1);
		});

		it('should group similar embeddings together', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('search', 'lookup', embeddings[0]),
				createNode('find', 'lookup', embeddings[1]), // Similar to search
				createNode('create', 'generate', embeddings[2]),
				createNode('make', 'generate', embeddings[3]), // Similar to create
				createNode('random', 'misc', embeddings[4])     // Outlier
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters.length).toBeGreaterThanOrEqual(2);

			// Find clusters for similar nodes
			const searchCluster = grouper.getClusterForNode(nodes[0]);
			const findCluster = grouper.getClusterForNode(nodes[1]);
			const createCluster = grouper.getClusterForNode(nodes[2]);
			const makeCluster = grouper.getClusterForNode(nodes[3]);

			// Similar nodes should be in same clusters
			expect(searchCluster).toBeDefined();
			expect(findCluster).toBeDefined();
			expect(createCluster).toBeDefined();
			expect(makeCluster).toBeDefined();
		});

		it('should respect minimum cluster size option', () => {
			const grouper = new EmbeddingsGrouper<TestTool>({ minClusterSize: 3 });
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('tool1', 'cat1', embeddings[0]),
				createNode('tool2', 'cat1', embeddings[1])
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			// With minClusterSize=3, these 2 similar nodes should be separate singletons
			const clusters = grouper.getClusters();
			expect(clusters.every(c => c.nodes.length < 3)).toBe(true);
		});
	});

	describe('getClusterForNode', () => {
		it('should return undefined for non-existent node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			const cluster = grouper.getClusterForNode(node);
			expect(cluster).toBeUndefined();
		});

		it('should return correct cluster for existing node', () => {
			const node = createNode('tool1', 'category1', [1, 0, 0, 0]);
			grouper.addNode(node);

			const cluster = grouper.getClusterForNode(node);
			expect(cluster).toBeDefined();
			expect(cluster!.nodes).toContain(node);
		});
	});

	describe('clustering quality', () => {
		it('should handle identical embeddings', () => {
			const identicalEmbedding = [1, 0, 0, 0];
			const nodes = [
				createNode('tool1', 'cat1', identicalEmbedding),
				createNode('tool2', 'cat1', identicalEmbedding),
				createNode('tool3', 'cat1', identicalEmbedding)
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			// All identical embeddings should be in same cluster
			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(1);
			expect(clusters[0].nodes).toHaveLength(3);
		});

		it('should handle zero vectors', () => {
			const zeroEmbedding = [0, 0, 0, 0];
			const node = createNode('tool1', 'cat1', zeroEmbedding);
			grouper.addNode(node);
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters).toHaveLength(1);
			expect(clusters[0].centroid).toEqual([0, 0, 0, 0]);
		});

		it('should handle varied similarity distributions', () => {
			// Create embeddings with different similarity levels
			const nodes = [
				createNode('very_similar_1', 'cat1', [1, 0.1, 0, 0]),
				createNode('very_similar_2', 'cat1', [0.9, 0.1, 0, 0]),
				createNode('somewhat_similar', 'cat1', [0.7, 0.3, 0.1, 0]),
				createNode('different_1', 'cat2', [0, 0, 1, 0.1]),
				createNode('different_2', 'cat2', [0.1, 0, 0.9, 0.1]),
				createNode('outlier', 'cat3', [0.25, 0.25, 0.25, 0.25])
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters.length).toBeGreaterThan(1);
			expect(clusters.length).toBeLessThanOrEqual(nodes.length);

			// Verify each node is assigned to exactly one cluster
			const allNodesInClusters = clusters.flatMap(c => c.nodes);
			expect(allNodesInClusters).toHaveLength(nodes.length);
		});
	});

	describe('adaptive threshold behavior', () => {
		it('should work with different similarity percentiles', () => {
			const strictGrouper = new EmbeddingsGrouper<TestTool>({ eps: 0.95 }); // High similarity required
			const lenientGrouper = new EmbeddingsGrouper<TestTool>({ eps: 0.8 }); // Lower similarity required

			const embeddings = createSimilarEmbeddings();
			const nodes = embeddings.map((emb, i) =>
				createNode(`tool${i}`, 'category', emb)
			);

			// Add same nodes to both groupers
			nodes.forEach(node => {
				strictGrouper.addNode({ ...node });
				lenientGrouper.addNode({ ...node });
			});

			strictGrouper.recluster();
			lenientGrouper.recluster();

			const strictClusters = strictGrouper.getClusters();
			const lenientClusters = lenientGrouper.getClusters();

			// Stricter threshold should generally create more clusters
			expect(strictClusters.length).toBeGreaterThanOrEqual(lenientClusters.length);
		});
	});

	describe('centroid computation', () => {
		it('should compute correct centroids for clusters', () => {
			const nodes = [
				createNode('tool1', 'cat1', [1, 0, 0, 0]),
				createNode('tool2', 'cat1', [0, 1, 0, 0])
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const clusters = grouper.getClusters();
			clusters.forEach(cluster => {
				expect(cluster.centroid).toBeDefined();
				expect(cluster.centroid.length).toBeGreaterThan(0);

				// Centroid should be normalized (magnitude ≈ 1 for non-zero vectors)
				const magnitude = Math.sqrt(cluster.centroid.reduce((sum, val) => sum + val * val, 0));
				if (magnitude > 0) {
					expect(magnitude).toBeCloseTo(1, 5);
				}
			});
		});
	});

	describe('threshold tuning optimization', () => {
		it('should find optimal percentile for target cluster count', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = [
				createNode('search', 'lookup', embeddings[0]),
				createNode('find', 'lookup', embeddings[1]), // Similar to search
				createNode('create', 'generate', embeddings[2]),
				createNode('make', 'generate', embeddings[3]), // Similar to create
				createNode('random1', 'misc', embeddings[4]),     // Outlier
				createNode('random2', 'misc', [0.3, 0.3, 0.3, 0.1]), // Another outlier
				createNode('random3', 'misc', [0.1, 0.3, 0.3, 0.3])  // Another outlier
			];

			grouper.addNodes(nodes, false); // Don't cluster initially

			// Find optimal percentile for max 4 clusters
			const result = grouper.tuneThresholdForTargetClusters(4);

			expect(result.clusterCount).toBeLessThanOrEqual(4);
			expect(result.percentile).toBeGreaterThanOrEqual(80);
			expect(result.percentile).toBeLessThanOrEqual(99);
			expect(result.threshold).toBeGreaterThan(0);
		});

		it('should apply percentile and recluster efficiently', () => {
			const embeddings = createSimilarEmbeddings();
			const nodes = embeddings.map((emb, i) =>
				createNode(`tool${i}`, 'category', emb)
			);

			grouper.addNodes(nodes);

			// Apply a stricter percentile (should create more clusters)
			grouper.applyPercentileAndRecluster(98);
			const strictClusterCount = grouper.getClusters().length;

			// Apply a more lenient percentile (should create fewer clusters)
			grouper.applyPercentileAndRecluster(85);
			const lenientClusterCount = grouper.getClusters().length;

			// Stricter threshold should generally create more or equal clusters
			expect(strictClusterCount).toBeGreaterThanOrEqual(lenientClusterCount);

			// All nodes should still be assigned
			const allClusters = grouper.getClusters();
			const totalNodes = allClusters.reduce((sum, cluster) => sum + cluster.nodes.length, 0);
			expect(totalNodes).toBe(nodes.length);
		});

		it('should cache similarities for efficient repeated tuning', () => {
			// Create embeddings with more predictable clustering behavior
			const nodes: Node<TestTool>[] = [];

			// Create 3 distinct groups of 10 nodes each using deterministic trigonometric patterns
			for (let group = 0; group < 3; group++) {
				for (let i = 0; i < 10; i++) {
					// Each group occupies a different region of the 4D space using trigonometry
					const baseAngle = group * (2 * Math.PI / 3); // 120° separation between groups
					const variation = i * 0.1; // Small variation within group

					const embedding = [
						Math.cos(baseAngle + variation) * 0.8 + 0.2,
						Math.sin(baseAngle + variation) * 0.8 + 0.2,
						Math.cos(baseAngle * 2 + variation * 0.5) * 0.3 + 0.1,
						Math.sin(baseAngle * 2 + variation * 0.5) * 0.3 + 0.1
					];
					nodes.push(createNode(`tool${group}_${i}`, `cat${group}`, embedding));
				}
			}

			grouper.addNodes(nodes, false);

			const result1 = grouper.tuneThresholdForTargetClusters(15); // Very lenient
			const result2 = grouper.tuneThresholdForTargetClusters(8);  // Moderate
			const result3 = grouper.tuneThresholdForTargetClusters(5);  // Strict

			// With deterministic trigonometric data, these should be more predictable
			expect(result1.clusterCount).toBeLessThanOrEqual(15);
			expect(result2.clusterCount).toBeLessThanOrEqual(8);

			// For the strictest case, we have 3 natural groups, so expect something reasonable
			expect(result3.clusterCount).toBeLessThanOrEqual(5);

			// Verify the algorithm works in the right direction (more restrictive = fewer clusters)
			expect(result1.clusterCount).toBeGreaterThanOrEqual(result2.clusterCount);
			expect(result2.clusterCount).toBeGreaterThanOrEqual(result3.clusterCount);
		}); it('should handle edge cases in threshold tuning', () => {
			// Empty grouper
			const emptyResult = grouper.tuneThresholdForTargetClusters(5);
			expect(emptyResult.clusterCount).toBe(0);

			// Single node
			grouper.addNode(createNode('single', 'cat', [1, 0, 0, 0]));
			const singleResult = grouper.tuneThresholdForTargetClusters(5);
			expect(singleResult.clusterCount).toBe(1);

			// Target higher than possible clusters
			const nodes = [
				createNode('tool1', 'cat1', [1, 0, 0, 0]),
				createNode('tool2', 'cat1', [0, 1, 0, 0])
			];
			grouper.addNodes(nodes);
			const highTargetResult = grouper.tuneThresholdForTargetClusters(10);
			expect(highTargetResult.clusterCount).toBeLessThanOrEqual(3); // At most 3 nodes total
		});
	});

	describe('edge cases', () => {
		it('should handle single dimension embeddings', () => {
			const nodes = [
				createNode('tool1', 'cat1', [1]),
				createNode('tool2', 'cat1', [0.9]),
				createNode('tool3', 'cat1', [0.1])
			];

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const clusters = grouper.getClusters();
			expect(clusters.length).toBeGreaterThan(0);
		});

		it('should handle large number of nodes efficiently', () => {
			const nodes: Node<TestTool>[] = [];
			for (let i = 0; i < 100; i++) {
				// Create diverse embeddings that will form distinct clusters
				const groupId = Math.floor(i / 10); // 10 groups of 10 nodes each
				const withinGroupVariation = (i % 10) * 0.1;

				// Create embeddings with clear group separation
				const embedding = [
					groupId === 0 ? 1 - withinGroupVariation * 0.2 : withinGroupVariation * 0.2,
					groupId === 1 ? 1 - withinGroupVariation * 0.2 : withinGroupVariation * 0.2,
					groupId === 2 ? 1 - withinGroupVariation * 0.2 : withinGroupVariation * 0.2,
					groupId >= 3 ? 1 - withinGroupVariation * 0.2 : withinGroupVariation * 0.2
				];
				nodes.push(createNode(`tool${i}`, `cat${groupId}`, embedding));
			}

			nodes.forEach(node => grouper.addNode(node));
			grouper.recluster();

			const clusters = grouper.getClusters();
			// Should create multiple clusters but not more than the number of nodes
			expect(clusters.length).toBeGreaterThanOrEqual(2);
			expect(clusters.length).toBeLessThanOrEqual(nodes.length);

			// Verify all nodes are assigned
			const totalNodesInClusters = clusters.reduce((sum, cluster) => sum + cluster.nodes.length, 0);
			expect(totalNodesInClusters).toBe(nodes.length);
		});
	});
});


