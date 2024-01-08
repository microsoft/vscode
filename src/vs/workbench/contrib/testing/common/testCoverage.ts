/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { IPrefixTreeNode, WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { CoverageDetails, ICoveredCount, IFileCoverage } from 'vs/workbench/contrib/testing/common/testTypes';

export interface ICoverageAccessor {
	provideFileCoverage: (token: CancellationToken) => Promise<IFileCoverage[]>;
	resolveFileCoverage: (fileIndex: number, token: CancellationToken) => Promise<CoverageDetails[]>;
}

/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
	private _tree?: WellDefinedPrefixTree<ComputedFileCoverage>;

	public static async load(taskId: string, accessor: ICoverageAccessor, uriIdentityService: IUriIdentityService, token: CancellationToken) {
		const files = await accessor.provideFileCoverage(token);
		const map = new ResourceMap<FileCoverage>();
		for (const [i, file] of files.entries()) {
			map.set(file.uri, new FileCoverage(file, i, accessor));
		}
		return new TestCoverage(taskId, map, uriIdentityService);
	}

	public get tree() {
		return this._tree ??= this.buildCoverageTree();
	}

	constructor(
		public readonly fromTaskId: string,
		private readonly fileCoverage: ResourceMap<FileCoverage>,
		private readonly uriIdentityService: IUriIdentityService,
	) { }

	/**
	 * Gets coverage information for all files.
	 */
	public getAllFiles() {
		return this.fileCoverage;
	}

	/**
	 * Gets coverage information for a specific file.
	 */
	public getUri(uri: URI) {
		return this.fileCoverage.get(uri);
	}

	/**
	 * Gets computed information for a file, including DFS-computed information
	 * from child tests.
	 */
	public getComputedForUri(uri: URI) {
		return this.tree.find(this.treePathForUri(uri, /* canonical = */ false));
	}

	private buildCoverageTree() {
		const tree = new WellDefinedPrefixTree<ComputedFileCoverage>();
		const nodeCanonicalSegments = new Map<IPrefixTreeNode<ComputedFileCoverage>, string>();

		// 1. Initial iteration. We insert based on the case-erased file path, and
		// then tag the nodes with their 'canonical' path segment preserving the
		// original casing we were given, to avoid #200604
		for (const file of this.fileCoverage.values()) {
			const keyPath = this.treePathForUri(file.uri, /* canonical = */ false);
			const canonicalPath = this.treePathForUri(file.uri, /* canonical = */  true);
			tree.insert(keyPath, file, node => {
				nodeCanonicalSegments.set(node, canonicalPath.next().value as string);
			});
		}

		// 2. Depth-first iteration to create computed nodes
		const calculateComputed = (path: string[], node: IPrefixTreeNode<ComputedFileCoverage | FileCoverage>): AbstractFileCoverage => {
			if (node.value) {
				return node.value;
			}

			const fileCoverage: IFileCoverage = {
				uri: this.treePathToUri(path),
				statement: ICoveredCount.empty(),
			};

			if (node.children) {
				for (const [prefix, child] of node.children) {
					path.push(nodeCanonicalSegments.get(child) || prefix);
					const v = calculateComputed(path, child);
					path.pop();

					ICoveredCount.sum(fileCoverage.statement, v.statement);
					if (v.branch) { ICoveredCount.sum(fileCoverage.branch ??= ICoveredCount.empty(), v.branch); }
					if (v.function) { ICoveredCount.sum(fileCoverage.function ??= ICoveredCount.empty(), v.function); }
				}
			}

			return node.value = new ComputedFileCoverage(fileCoverage);
		};

		for (const node of tree.nodes) {
			calculateComputed([], node);
		}

		return tree;
	}

	private *treePathForUri(uri: URI, canconicalPath: boolean) {
		yield uri.scheme;
		yield uri.authority;

		const path = !canconicalPath && this.uriIdentityService.extUri.ignorePathCasing(uri) ? uri.path.toLowerCase() : uri.path;
		yield* path.split('/');
	}

	private treePathToUri(path: string[]) {
		return URI.from({ scheme: path[0], authority: path[1], path: path.slice(2).join('/') });
	}
}

export const getTotalCoveragePercent = (statement: ICoveredCount, branch: ICoveredCount | undefined, function_: ICoveredCount | undefined) => {
	let numerator = statement.covered;
	let denominator = statement.total;

	if (branch) {
		numerator += branch.covered;
		denominator += branch.total;
	}

	if (function_) {
		numerator += function_.covered;
		denominator += function_.total;
	}

	return denominator === 0 ? 1 : numerator / denominator;
};

export abstract class AbstractFileCoverage {
	public readonly uri: URI;
	public readonly statement: ICoveredCount;
	public readonly branch?: ICoveredCount;
	public readonly function?: ICoveredCount;

	/**
	 * Gets the total coverage percent based on information provided.
	 * This is based on the Clover total coverage formula
	 */
	public get tpc() {
		return getTotalCoveragePercent(this.statement, this.branch, this.function);
	}

	constructor(coverage: IFileCoverage) {
		this.uri = coverage.uri;
		this.statement = coverage.statement;
		this.branch = coverage.branch;
		this.function = coverage.function;
	}
}

/**
 * File coverage info computed from children in the tree, not provided by the
 * extension.
 */
export class ComputedFileCoverage extends AbstractFileCoverage { }

export class FileCoverage extends AbstractFileCoverage {
	private _details?: CoverageDetails[] | Promise<CoverageDetails[]>;
	private resolved?: boolean;

	/** Gets whether details are synchronously available */
	public get hasSynchronousDetails() {
		return this._details instanceof Array || this.resolved;
	}

	constructor(coverage: IFileCoverage, private readonly index: number, private readonly accessor: ICoverageAccessor) {
		super(coverage);
		this._details = coverage.details;
	}

	/**
	 * Gets per-line coverage details.
	 */
	public async details(token = CancellationToken.None) {
		this._details ??= this.accessor.resolveFileCoverage(this.index, token);

		try {
			const d = await this._details;
			this.resolved = true;
			return d;
		} catch (e) {
			this._details = undefined;
			throw e;
		}
	}
}
