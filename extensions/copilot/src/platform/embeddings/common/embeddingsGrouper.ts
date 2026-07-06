/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Embedding, EmbeddingVector } from './embeddingsComputer';

export interface Node<T> {
	readonly value: T;
	readonly embedding: Embedding;
}

export interface Cluster<T> {
	readonly id: string;
	readonly nodes: readonly Node<T>[];
	readonly centroid: EmbeddingVector;
}

export interface GroupingOptions {
	/** Similarity threshold for clustering (0.0-1.0). Higher values create tighter clusters. Default: 0.9 */
	readonly eps?: number;
	/** Minimum cluster size. Smaller clusters become singletons. Default: 2 */
	readonly minClusterSize?: number;
	/** Threshold for inserting new nodes into existing clusters. Default: same as clustering threshold */
	readonly insertThreshold?: number;
}

/**
 * Groups embeddings using similarity-based clustering with cosine similarity.
 *
 * This approach finds cluster seeds (nodes with many similar neighbors) and builds
 * clusters around them. It avoids the transitive clustering issues of connected
 * components while being more suitable for cosine similarity than DBSCAN.
 */
export class EmbeddingsGrouper<T> {
	private nodes: Node<T>[] = [];
	private clusters: Cluster<T>[] = [];
	private nodeToClusterId = new Map<Node<T>, string>();
	private clusterCounter = 0;
	private normalizedEmbeddings = new Map<Node<T>, EmbeddingVector>();
	private cachedSimilarities: number[] | undefined;
	private readonly options: {
		eps: number;
		minClusterSize: number;
		insertThreshold?: number;
	};

	constructor(options?: GroupingOptions) {
		this.options = {
			eps: 0.9, // Higher similarity threshold for cosine similarity
			minClusterSize: 2,
			...options,
		};
	}

	/**
	 * Add a node to the grouper. Will attempt to assign to existing cluster
	 * or create a new singleton cluster.
	 */
	addNode(node: Node<T>): void {
		this.nodes.push(node);
		// Cache normalized embedding for this node
		this.normalizedEmbeddings.set(node, this.normalizeVector(node.embedding.value));
		// Invalidate cached similarities since we added a node
		this.cachedSimilarities = undefined;

		// If we have existing clusters, try to insert into the best matching one
		if (this.clusters.length > 0) {
			const insertThreshold = this.options.insertThreshold ?? this.lastUsedThreshold;
			const bestCluster = this.findBestClusterForNode(node, insertThreshold);

			if (bestCluster) {
				this.addNodeToCluster(node, bestCluster);
				return;
			}
		}

		// Create new singleton cluster
		this.createSingletonCluster(node);
	}

	/**
	 * Add multiple nodes efficiently in batch. This is much more efficient than
	 * calling addNode() multiple times as it defers clustering until all nodes are added.
	 *
	 * @param nodes Array of nodes to add
	 * @param reclusterAfter Whether to recluster after adding all nodes. Default: true
	 */
	addNodes(nodes: Node<T>[], reclusterAfter: boolean = true): void {
		if (nodes.length === 0) {
			return;
		}

		// Batch add all nodes and cache their normalized embeddings
		for (const node of nodes) {
			this.nodes.push(node);
		}
		// Invalidate cached similarities since we added nodes
		this.cachedSimilarities = undefined;

		if (reclusterAfter) {
			// Perform full reclustering which is more efficient for bulk operations
			this.recluster();
		} else {
			// Create singleton clusters for all new nodes (fast path when clustering is deferred)
			for (const node of nodes) {
				this.createSingletonCluster(node);
			}
		}
	}

	/**
	 * Remove a node from the grouper. May cause cluster splits or deletions.
	 */
	removeNode(node: Node<T>): boolean {
		const nodeIndex = this.nodes.indexOf(node);
		if (nodeIndex === -1) {
			return false;
		}

		this.nodes.splice(nodeIndex, 1);
		// Clean up cached normalized embedding
		this.normalizedEmbeddings.delete(node);
		// Invalidate cached similarities since we removed a node
		this.cachedSimilarities = undefined;

		const clusterId = this.nodeToClusterId.get(node);
		if (clusterId) {
			this.nodeToClusterId.delete(node);
			this.removeNodeFromCluster(node, clusterId);
		}

		return true;
	}

	/**
	 * Perform full reclustering of all nodes using similarity-based clustering.
	 */
	recluster(): void {
		if (this.nodes.length === 0) {
			this.clusters = [];
			this.nodeToClusterId.clear();
			return;
		}

		// Clear existing clusters
		this.clusters = [];
		this.nodeToClusterId.clear();

		// Run similarity-based clustering that avoids transitive issues
		const clusterAssignments = this.runSimilarityBasedClustering(this.options.eps, this.options.minClusterSize);

		// Create clusters from results
		this.createClustersFromAssignments(clusterAssignments);
	}

	/**
	 * Get all current clusters
	 */
	getClusters(): readonly Cluster<T>[] {
		return this.clusters;
	}

	/**
	 * Get the cluster containing a specific node
	 */
	getClusterForNode(node: Node<T>): Cluster<T> | undefined {
		const clusterId = this.nodeToClusterId.get(node);
		return clusterId ? this.clusters.find(c => c.id === clusterId) : undefined;
	}

	private lastUsedThreshold = 0.9; // Fallback default

	/**
	 * Compute similarity threshold based on percentile.
	 * Higher percentiles result in stricter clustering (higher similarity required).
	 */
	private computeEpsFromPercentile(percentile: number): number {
		if (this.nodes.length < 2) {
			return 0.9; // High similarity for small datasets
		}

		const similarities = this.getSimilarities();
		if (similarities.length === 0) {
			return 0.9;
		}

		// Higher percentiles = higher similarity thresholds for tighter clusters
		const index = Math.floor((percentile / 100) * similarities.length);
		const threshold = similarities[Math.min(index, similarities.length - 1)];

		this.lastUsedThreshold = threshold;
		return threshold;
	}

	/**
	 * Run similarity-based clustering that avoids transitive clustering issues
	 * @param threshold Minimum similarity for nodes to be clustered together
	 * @param minClusterSize Minimum size for a valid cluster
	 * @returns Array where each index corresponds to a node and value is cluster ID (-1 for unassigned)
	 */
	private runSimilarityBasedClustering(threshold: number, minClusterSize: number): number[] {
		const assignments: number[] = new Array(this.nodes.length).fill(-1);
		const processed: boolean[] = new Array(this.nodes.length).fill(false);
		let clusterId = 0;

		// Find cluster seeds - nodes with high similarity to multiple others
		const seeds = this.findClusterSeeds(threshold, minClusterSize);

		// Assign nodes to clusters based on best similarity to seed
		for (const seed of seeds) {
			if (processed[seed]) {
				continue;
			}

			const cluster = this.buildClusterAroundSeed(seed, threshold, processed);
			if (cluster.length >= minClusterSize) {
				for (const nodeIndex of cluster) {
					assignments[nodeIndex] = clusterId;
					processed[nodeIndex] = true;
				}
				clusterId++;
			}
		}

		return assignments;
	}

	/**
	 * Find potential cluster seeds - nodes that are similar to many others
	 */
	private findClusterSeeds(threshold: number, minClusterSize: number): number[] {
		const seeds: number[] = [];
		const similarityCounts: number[] = new Array(this.nodes.length).fill(0);

		// Count how many nodes each node is similar to
		for (let i = 0; i < this.nodes.length; i++) {
			for (let j = i + 1; j < this.nodes.length; j++) {
				const similarity = this.cachedCosineSimilarity(this.nodes[i], this.nodes[j]);
				if (similarity >= threshold) {
					similarityCounts[i]++;
					similarityCounts[j]++;
				}
			}
		}

		// Select nodes that could form clusters as seeds
		for (let i = 0; i < this.nodes.length; i++) {
			if (similarityCounts[i] >= minClusterSize - 1) {
				seeds.push(i);
			}
		}

		// Sort seeds by similarity count (most connected first)
		seeds.sort((a, b) => similarityCounts[b] - similarityCounts[a]);
		return seeds;
	}

	/**
	 * Build a cluster around a seed node by finding all nodes similar to the seed
	 */
	private buildClusterAroundSeed(seed: number, threshold: number, processed: boolean[]): number[] {
		const cluster = [seed];

		for (let i = 0; i < this.nodes.length; i++) {
			if (i === seed || processed[i]) {
				continue;
			}

			const similarity = this.cachedCosineSimilarity(this.nodes[seed], this.nodes[i]);
			if (similarity >= threshold) {
				cluster.push(i);
			}
		}

		return cluster;
	}

	/**
	 * Create clusters from assignment results
	 */
	private createClustersFromAssignments(clusterAssignments: number[]): void {
		const clusterMap = new Map<number, Node<T>[]>();
		const unassigned: Node<T>[] = [];

		// Group nodes by cluster ID
		for (let i = 0; i < clusterAssignments.length; i++) {
			const clusterId = clusterAssignments[i];
			const node = this.nodes[i];

			if (clusterId === -1) {
				unassigned.push(node);
			} else {
				if (!clusterMap.has(clusterId)) {
					clusterMap.set(clusterId, []);
				}
				clusterMap.get(clusterId)!.push(node);
			}
		}

		// Create clusters from grouped nodes
		for (const [, nodes] of clusterMap) {
			if (nodes.length >= this.options.minClusterSize) {
				this.createCluster(nodes);
			} else {
				// Small clusters become singletons
				for (const node of nodes) {
					this.createSingletonCluster(node);
				}
			}
		}

		// Handle unassigned points as singletons
		for (const node of unassigned) {
			this.createSingletonCluster(node);
		}
	}

	/**
	 * Find the best existing cluster for a new node
	 */
	private findBestClusterForNode(node: Node<T>, threshold: number): Cluster<T> | undefined {
		let bestCluster: Cluster<T> | undefined;
		let bestSimilarity = -1;

		for (const cluster of this.clusters) {
			const similarity = this.dotProduct(
				this.getNormalizedEmbedding(node),
				cluster.centroid
			);
			if (similarity >= threshold && similarity > bestSimilarity) {
				bestSimilarity = similarity;
				bestCluster = cluster;
			}
		}

		return bestCluster;
	}

	/**
	 * Add node to existing cluster and update centroid
	 */
	private addNodeToCluster(node: Node<T>, cluster: Cluster<T>): void {
		const updatedNodes = [...cluster.nodes, node];
		const updatedCentroid = this.computeCentroid(updatedNodes.map(n => n.embedding.value));

		const updatedCluster: Cluster<T> = {
			...cluster,
			nodes: updatedNodes,
			centroid: updatedCentroid
		};

		// Update clusters array
		const clusterIndex = this.clusters.indexOf(cluster);
		this.clusters[clusterIndex] = updatedCluster;

		this.nodeToClusterId.set(node, cluster.id);
	}

	/**
	 * Remove node from cluster and handle potential cluster deletion
	 */
	private removeNodeFromCluster(node: Node<T>, clusterId: string): void {
		const clusterIndex = this.clusters.findIndex(c => c.id === clusterId);
		if (clusterIndex === -1) {
			return;
		}

		const cluster = this.clusters[clusterIndex];
		const updatedNodes = cluster.nodes.filter(n => n !== node);

		if (updatedNodes.length === 0) {
			// Remove empty cluster
			this.clusters.splice(clusterIndex, 1);
		} else {
			// Update cluster with remaining nodes
			const updatedCentroid = this.computeCentroid(updatedNodes.map(n => n.embedding.value));
			const updatedCluster: Cluster<T> = {
				...cluster,
				nodes: updatedNodes,
				centroid: updatedCentroid
			};
			this.clusters[clusterIndex] = updatedCluster;

			// Update node mappings for remaining nodes
			for (const remainingNode of updatedNodes) {
				this.nodeToClusterId.set(remainingNode, clusterId);
			}
		}
	}

	/**
	 * Create a new cluster from nodes
	 */
	private createCluster(nodes: Node<T>[]): void {
		const id = `cluster_${this.clusterCounter++}`;
		const centroid = this.computeCentroid(nodes.map(n => n.embedding.value));

		const cluster: Cluster<T> = {
			id,
			nodes,
			centroid
		};

		this.clusters.push(cluster);

		for (const node of nodes) {
			this.nodeToClusterId.set(node, id);
		}
	}

	/**
	 * Create a singleton cluster for a single node
	 */
	private createSingletonCluster(node: Node<T>): void {
		this.createCluster([node]);
	}

	/**
	 * Compute centroid (mean) of embedding vectors
	 */
	private computeCentroid(embeddings: EmbeddingVector[]): EmbeddingVector {
		if (embeddings.length === 0) {
			return [];
		}

		if (embeddings.length === 1) {
			return [...embeddings[0]]; // Copy to avoid mutations
		}

		const dimensions = embeddings[0].length;
		const centroid = new Array(dimensions).fill(0);

		// Sum all embeddings
		for (const embedding of embeddings) {
			for (let i = 0; i < dimensions; i++) {
				centroid[i] += embedding[i];
			}
		}

		// Divide by count to get mean
		for (let i = 0; i < dimensions; i++) {
			centroid[i] /= embeddings.length;
		}

		// L2 normalize the centroid
		return this.normalizeVector(centroid);
	}

	/**
	 * Gets the sorted list of pairwise similarities between all nodes.
	 * The returned list is ordered by similarity, NOT in any particular node order.
	 */
	private getSimilarities() {
		if (this.cachedSimilarities) {
			return this.cachedSimilarities;
		}

		const similarities: number[] = [];

		// Compute all pairwise similarities (upper triangle only)
		for (let i = 0; i < this.nodes.length; i++) {
			for (let j = i + 1; j < this.nodes.length; j++) {
				const sim = this.cachedCosineSimilarity(this.nodes[i], this.nodes[j]);
				similarities.push(sim);
			}
		}

		// Sort for efficient percentile lookups
		similarities.sort((a, b) => a - b);
		this.cachedSimilarities = similarities;
		return this.cachedSimilarities;
	}

	/**
	 * Optimize clustering by finding the best similarity threshold that results in
	 * a target number of clusters or fewer, aiming for the highest cluster count
	 * that doesn't exceed the maximum. Includes a "cliff effect" to avoid over-clustering.
	 *
	 * @param maxClusters Maximum desired number of clusters
	 * @param minThreshold Minimum similarity threshold to try (default: 0.7 - loose clustering)
	 * @param maxThreshold Maximum similarity threshold to try (default: 0.99 - very strict)
	 * @param precision How precise the search should be (default: 0.02)
	 * @param cliffThreshold Fraction of maxClusters that triggers cliff effect (default: 2/3)
	 * @param cliffGain Minimum additional clusters needed to continue past cliff (default: 20% of maxClusters)
	 * @returns The optimal threshold found and resulting cluster count
	 */
	tuneThresholdForTargetClusters(
		maxClusters: number,
		minThreshold: number = 0.7,
		maxThreshold: number = 0.99,
		precision: number = 0.02,
		cliffThreshold: number = 2 / 3,
		cliffGain: number = 0.2
	): { percentile: number; clusterCount: number; threshold: number } {
		if (this.nodes.length === 0) {
			return { percentile: 90, clusterCount: 0, threshold: 0.9 };
		}

		const cliffPoint = Math.floor(maxClusters * cliffThreshold);
		const minGainAfterCliff = Math.max(1, Math.floor(maxClusters * cliffGain));

		let bestThreshold = maxThreshold;
		let bestClusterCount = 1; // Start with worst case (very few clusters)
		let cliffReached = false;

		// Binary search for optimal threshold that maximizes clusters while staying under limit
		let low = minThreshold;
		let high = maxThreshold;

		while (high - low > precision) {
			const mid = (low + high) / 2;
			const clusterCount = this.countClustersForThreshold(mid, this.options.minClusterSize);

			if (clusterCount <= maxClusters) {
				// Check if this is a meaningful improvement
				let shouldUpdate = false;

				if (!cliffReached && clusterCount >= cliffPoint) {
					// We've reached the cliff point - this is good enough
					cliffReached = true;
					shouldUpdate = clusterCount > bestClusterCount;
				} else if (cliffReached) {
					// Past cliff - only update if we get significant additional clusters
					shouldUpdate = clusterCount >= bestClusterCount + minGainAfterCliff;
				} else {
					// Before cliff - any improvement is good
					shouldUpdate = clusterCount > bestClusterCount;
				}

				if (shouldUpdate) {
					bestThreshold = mid;
					bestClusterCount = clusterCount;
				}

				// Try going to lower threshold for potentially more clusters
				low = mid + precision;
			} else {
				// Too many clusters, need higher threshold (stricter clustering)
				high = mid - precision;
			}
		}

		// Convert threshold to approximate percentile for compatibility
		const similarities = this.getSimilarities();
		let approximatePercentile = 90;
		if (similarities.length > 0) {
			const position = similarities.findIndex(s => s >= bestThreshold);
			if (position >= 0) {
				approximatePercentile = Math.round((position / similarities.length) * 100);
			}
		}

		return {
			percentile: approximatePercentile,
			clusterCount: bestClusterCount,
			threshold: bestThreshold
		};
	}

	/**
	 * Apply a specific similarity threshold and recluster
	 *
	 * @param percentile The similarity percentile to convert to threshold
	 */
	applyPercentileAndRecluster(percentile: number): void {
		// Convert percentile to similarity threshold
		const eps = this.computeEpsFromPercentile(percentile);
		// Temporarily override the eps option
		const originalEps = this.options.eps;
		(this.options as any).eps = eps;

		try {
			this.recluster();
		} finally {
			// Restore original eps
			(this.options as any).eps = originalEps;
		}
	}

	/**
	 * Count how many clusters would result from a given similarity threshold without actually clustering
	 */
	private countClustersForThreshold(threshold: number, minClusterSize: number): number {
		if (this.nodes.length === 0) {
			return 0;
		}

		// Run clustering with given parameters
		const clusterAssignments = this.runSimilarityBasedClustering(threshold, minClusterSize);

		// Count unique cluster IDs (excluding -1 which is unassigned)
		const clusterIds = new Set<number>();
		for (const clusterId of clusterAssignments) {
			if (clusterId !== -1) {
				clusterIds.add(clusterId);
			}
		}

		// Add singleton clusters for unassigned points and small clusters
		const clusterSizes = new Map<number, number>();
		let unassignedCount = 0;

		for (const clusterId of clusterAssignments) {
			if (clusterId === -1) {
				unassignedCount++;
			} else {
				clusterSizes.set(clusterId, (clusterSizes.get(clusterId) || 0) + 1);
			}
		}

		// Count valid clusters (meeting minClusterSize) and singletons
		let validClusters = 0;
		let singletons = unassignedCount; // Unassigned points become singletons

		for (const [, size] of clusterSizes) {
			if (size >= minClusterSize) {
				validClusters++;
			} else {
				singletons += size;
			}
		}

		return validClusters + singletons;
	}

	/**
	 * Get cached normalized embedding for a node
	 */
	private getNormalizedEmbedding(node: Node<T>): EmbeddingVector {
		let normalized = this.normalizedEmbeddings.get(node);
		if (!normalized) {
			normalized = this.normalizeVector(node.embedding.value);
			this.normalizedEmbeddings.set(node, normalized);
		}
		return normalized;
	}

	/**
	 * Compute cosine similarity using cached normalized embeddings
	 */
	private cachedCosineSimilarity(nodeA: Node<T>, nodeB: Node<T>): number {
		const normA = this.getNormalizedEmbedding(nodeA);
		const normB = this.getNormalizedEmbedding(nodeB);
		return this.dotProduct(normA, normB);
	}

	/**
	 * Optimized dot product computation
	 */
	private dotProduct(a: EmbeddingVector, b: EmbeddingVector): number {
		let dotProduct = 0;
		const len = Math.min(a.length, b.length);
		// Unroll loop for better performance on small vectors
		let i = 0;
		for (; i < len - 3; i += 4) {
			dotProduct += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3];
		}
		// Handle remaining elements
		for (; i < len; i++) {
			dotProduct += a[i] * b[i];
		}
		return dotProduct;
	}

	/**
	 * L2 normalize a vector
	 */
	private normalizeVector(vector: EmbeddingVector): EmbeddingVector {
		const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

		if (magnitude === 0) {
			return vector.slice(); // Return copy of zero vector
		}

		return vector.map(val => val / magnitude);
	}
}
