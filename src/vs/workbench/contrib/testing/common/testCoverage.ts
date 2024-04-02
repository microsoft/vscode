/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { deepClone } from 'vs/base/common/objects';
import { ITransaction, observableSignal } from 'vs/base/common/observable';
import { IPrefixTreeNode, WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
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

	constructor(
		public readonly fromTaskId: string,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly accessor: ICoverageAccessor,
	) { }

	public append(rawCoverage: IFileCoverage, tx: ITransaction | undefined) {
		const coverage = new FileCoverage(rawCoverage, this.accessor);
		const previous = this.getComputedForUri(coverage.uri);
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
		this.tree.insert(this.treePathForUri(coverage.uri, /* canonical = */ false), coverage, node => {
			chain.push(node);

			if (chain.length === canonical.length) {
				node.value = coverage;
			} else if (!node.value) {
				// clone because later intersertions can modify the counts:
				const intermediate = deepClone(rawCoverage);
				intermediate.id = String(incId++);
				intermediate.uri = this.treePathToUri(canonical.slice(0, chain.length));
				node.value = new ComputedFileCoverage(intermediate);
			} else {
				applyDelta('statement', node.value);
				applyDelta('branch', node.value);
				applyDelta('declaration', node.value);
				node.value.didChange.trigger(tx);
			}
		});

		this.fileCoverage.set(coverage.uri, coverage);
		if (chain) {
			this.didAddCoverage.trigger(tx, chain);
		}
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
	public readonly id: string;
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

	constructor(coverage: IFileCoverage) {
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

export class FileCoverage extends AbstractFileCoverage {
	private _details?: Promise<CoverageDetails[]>;
	private resolved?: boolean;

	/** Gets whether details are synchronously available */
	public get hasSynchronousDetails() {
		return this._details instanceof Array || this.resolved;
	}

	constructor(coverage: IFileCoverage, private readonly accessor: ICoverageAccessor) {
		super(coverage);
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
