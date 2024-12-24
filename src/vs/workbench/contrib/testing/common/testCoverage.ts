/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { deepClone } from '../../../../base/common/objects.js';
import { ITransaction, observableSignal } from '../../../../base/common/observable.js';
import { IPrefixTreeNode, WellDefinedPrefixTree } from '../../../../base/common/prefixTree.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestId } from './testId.js';
import { LiveTestResult } from './testResult.js';
import { CoverageDetails, DetailType, ICoverageCount, IFileCoverage } from './testTypes.js';

export interface ICoverageAccessor {
	getCoverageDetails: (id: string, testId: string | undefined, token: CancellationToken) => Promise<CoverageDetails[]>;
}

let incId = 0;

/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
	private readonly fileCoverage = new ResourceMap<FileCoverage>();
	public readonly didAddCoverage = observableSignal<IPrefixTreeNode<AbstractFileCoverage>[]>(this);
	public readonly tree = new WellDefinedPrefixTree<AbstractFileCoverage>();
	public readonly associatedData = new Map<unknown, unknown>();

	constructor(
		public readonly result: LiveTestResult,
		public readonly fromTaskId: string,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly accessor: ICoverageAccessor,
	) { }

	/** Gets all test IDs that were included in this test run. */
	public *allPerTestIDs() {
		const seen = new Set<string>();
		for (const root of this.tree.nodes) {
			if (root.value && root.value.perTestData) {
				for (const id of root.value.perTestData) {
					if (!seen.has(id)) {
						seen.add(id);
						yield id;
					}
				}
			}
		}
	}

	public append(coverage: IFileCoverage, tx: ITransaction | undefined) {
		const previous = this.getComputedForUri(coverage.uri);
		const result = this.result;
		const applyDelta = (kind: 'statement' | 'branch' | 'declaration', node: ComputedFileCoverage) => {
			if (!node[kind]) {
				if (coverage[kind]) {
					node[kind] = { ...coverage[kind]! };
				}
			} else {
				node[kind]!.covered += (coverage[kind]?.covered || 0) - (previous?.[kind]?.covered || 0);
				node[kind]!.total += (coverage[kind]?.total || 0) - (previous?.[kind]?.total || 0);
			}
		};

		// We insert using the non-canonical path to normalize for casing differences
		// between URIs, but when inserting an intermediate node always use 'a' canonical
		// version.
		const canonical = [...this.treePathForUri(coverage.uri, /* canonical = */ true)];
		const chain: IPrefixTreeNode<AbstractFileCoverage>[] = [];

		this.tree.mutatePath(this.treePathForUri(coverage.uri, /* canonical = */ false), node => {
			chain.push(node);

			if (chain.length === canonical.length) {
				// we reached our destination node, apply the coverage as necessary:
				if (node.value) {
					const v = node.value;
					// if ID was generated from a test-specific coverage, reassign it to get its real ID in the extension host.
					v.id = coverage.id;
					v.statement = coverage.statement;
					v.branch = coverage.branch;
					v.declaration = coverage.declaration;
				} else {
					const v = node.value = new FileCoverage(coverage, result, this.accessor);
					this.fileCoverage.set(coverage.uri, v);
				}
			} else {
				// Otherwise, if this is not a partial per-test coverage, merge the
				// coverage changes into the chain. Per-test coverages are not complete
				// and we don't want to consider them for computation.
				if (!node.value) {
					// clone because later intersertions can modify the counts:
					const intermediate = deepClone(coverage);
					intermediate.id = String(incId++);
					intermediate.uri = this.treePathToUri(canonical.slice(0, chain.length));
					node.value = new ComputedFileCoverage(intermediate, result);
				} else {
					applyDelta('statement', node.value);
					applyDelta('branch', node.value);
					applyDelta('declaration', node.value);
					node.value.didChange.trigger(tx);
				}
			}

			if (coverage.testIds) {
				node.value!.perTestData ??= new Set();
				for (const id of coverage.testIds) {
					node.value!.perTestData.add(id);
				}
			}
		});

		if (chain) {
			this.didAddCoverage.trigger(tx, chain);
		}
	}

	/**
	 * Builds a new tree filtered to per-test coverage data for the given ID.
	 */
	public filterTreeForTest(testId: TestId) {
		const tree = new WellDefinedPrefixTree<AbstractFileCoverage>();
		for (const node of this.tree.values()) {
			if (node instanceof FileCoverage) {
				if (!node.perTestData?.has(testId.toString())) {
					continue;
				}

				const canonical = [...this.treePathForUri(node.uri, /* canonical = */ true)];
				const chain: IPrefixTreeNode<AbstractFileCoverage>[] = [];
				tree.mutatePath(this.treePathForUri(node.uri, /* canonical = */ false), n => {
					chain.push(n);
					n.value ??= new BypassedFileCoverage(this.treePathToUri(canonical.slice(0, chain.length)), node.fromResult);
				});
			}
		}

		return tree;
	}

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

export const getTotalCoveragePercent = (statement: ICoverageCount, branch: ICoverageCount | undefined, function_: ICoverageCount | undefined) => {
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
	public id: string;
	public readonly uri: URI;
	public statement: ICoverageCount;
	public branch?: ICoverageCount;
	public declaration?: ICoverageCount;
	public readonly didChange = observableSignal(this);

	/**
	 * Gets the total coverage percent based on information provided.
	 * This is based on the Clover total coverage formula
	 */
	public get tpc() {
		return getTotalCoveragePercent(this.statement, this.branch, this.declaration);
	}

	/**
	 * Per-test coverage data for this file, if available.
	 */
	public perTestData?: Set<string>;

	constructor(coverage: IFileCoverage, public readonly fromResult: LiveTestResult) {
		this.id = coverage.id;
		this.uri = coverage.uri;
		this.statement = coverage.statement;
		this.branch = coverage.branch;
		this.declaration = coverage.declaration;
	}
}

/**
 * File coverage info computed from children in the tree, not provided by the
 * extension.
 */
export class ComputedFileCoverage extends AbstractFileCoverage { }

/**
 * A virtual node that doesn't have any added coverage info.
 */
export class BypassedFileCoverage extends ComputedFileCoverage {
	constructor(uri: URI, result: LiveTestResult) {
		super({ id: String(incId++), uri, statement: { covered: 0, total: 0 } }, result);
	}
}

export class FileCoverage extends AbstractFileCoverage {
	private _details?: Promise<CoverageDetails[]>;
	private resolved?: boolean;
	private _detailsForTest?: Map<string, Promise<CoverageDetails[]>>;

	/** Gets whether details are synchronously available */
	public get hasSynchronousDetails() {
		return this._details instanceof Array || this.resolved;
	}

	constructor(coverage: IFileCoverage, fromResult: LiveTestResult, private readonly accessor: ICoverageAccessor) {
		super(coverage, fromResult);
	}

	/**
	 * Gets per-line coverage details.
	 */
	public async detailsForTest(_testId: TestId, token = CancellationToken.None) {
		this._detailsForTest ??= new Map();
		const testId = _testId.toString();
		const prev = this._detailsForTest.get(testId);
		if (prev) {
			return prev;
		}

		const promise = (async () => {
			try {
				return await this.accessor.getCoverageDetails(this.id, testId, token);
			} catch (e) {
				this._detailsForTest?.delete(testId);
				throw e;
			}
		})();

		this._detailsForTest.set(testId, promise);
		return promise;
	}

	/**
	 * Gets per-line coverage details.
	 */
	public async details(token = CancellationToken.None) {
		this._details ??= this.accessor.getCoverageDetails(this.id, undefined, token);

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

export const totalFromCoverageDetails = (uri: URI, details: CoverageDetails[]): IFileCoverage => {
	const fc: IFileCoverage = {
		id: '',
		uri,
		statement: ICoverageCount.empty(),
	};

	for (const detail of details) {
		if (detail.type === DetailType.Statement) {
			fc.statement.total++;
			fc.statement.total += detail.count ? 1 : 0;

			for (const branch of detail.branches || []) {
				fc.branch ??= ICoverageCount.empty();
				fc.branch.total++;
				fc.branch.covered += branch.count ? 1 : 0;
			}
		} else {
			fc.declaration ??= ICoverageCount.empty();
			fc.declaration.total++;
			fc.declaration.covered += detail.count ? 1 : 0;
		}
	}

	return fc;
};
