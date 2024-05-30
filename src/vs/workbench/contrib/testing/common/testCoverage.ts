/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'vs/base/common/assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { deepClone } from 'vs/base/common/objects';
import { ITransaction, observableSignal } from 'vs/base/common/observable';
import { IPrefixTreeNode, WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { CoverageDetails, ICoverageCount, IFileCoverage } from 'vs/workbench/contrib/testing/common/testTypes';

export interface ICoverageAccessor {
	getCoverageDetails: (id: string, token: CancellationToken) => Promise<CoverageDetails[]>;
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

	/** Test IDs that have per-test coverage in this output. */
	public readonly perTestCoverageIDs = new Set<string>();

	constructor(
		public readonly result: LiveTestResult,
		public readonly fromTaskId: string,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly accessor: ICoverageAccessor,
	) { }

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
		const isPerTestCoverage = !!coverage.testId;
		if (coverage.testId) {
			this.perTestCoverageIDs.add(coverage.testId.toString());
		}
		this.tree.mutatePath(this.treePathForUri(coverage.uri, /* canonical = */ false), node => {
			chain.push(node);

			if (chain.length === canonical.length) {
				// we reached our destination node, apply the coverage as necessary:
				if (isPerTestCoverage) {
					const v = node.value ??= new FileCoverage(IFileCoverage.empty(String(incId++), coverage.uri), result, this.accessor);
					assert(v instanceof FileCoverage, 'coverage is unexpectedly computed');
					v.perTestData ??= new Map();
					const perTest = new FileCoverage(coverage, result, this.accessor);
					perTest.isForTest = { id: coverage.testId!, parent: v };
					v.perTestData.set(coverage.testId!.toString(), perTest);
					this.fileCoverage.set(coverage.uri, v);
				} else if (node.value) {
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
			} else if (!isPerTestCoverage) {
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
		});

		if (chain && !isPerTestCoverage) {
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
				const fileData = node.perTestData?.get(testId.toString());
				if (!fileData) {
					continue;
				}

				const canonical = [...this.treePathForUri(fileData.uri, /* canonical = */ true)];
				const chain: IPrefixTreeNode<AbstractFileCoverage>[] = [];
				tree.mutatePath(this.treePathForUri(fileData.uri, /* canonical = */ false), node => {
					chain.push(node);

					if (chain.length === canonical.length) {
						node.value = fileData;
					} else {
						node.value ??= new BypassedFileCoverage(this.treePathToUri(canonical.slice(0, chain.length)), fileData.fromResult);
					}
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

	/** Gets whether details are synchronously available */
	public get hasSynchronousDetails() {
		return this._details instanceof Array || this.resolved;
	}

	/**
	 * Per-test coverage data for this file, if available.
	 */
	public perTestData?: Map<string, FileCoverage>;

	/**
	 * If this is for a single test item, gets the test item.
	 */
	public isForTest?: { id: TestId; parent: FileCoverage };

	constructor(coverage: IFileCoverage, fromResult: LiveTestResult, private readonly accessor: ICoverageAccessor) {
		super(coverage, fromResult);
	}

	/**
	 * Gets per-line coverage details.
	 */
	public async details(token = CancellationToken.None) {
		this._details ??= this.accessor.getCoverageDetails(this.id, token);

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
