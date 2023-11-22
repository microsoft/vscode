/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { CoverageDetails, ICoveredCount, IFileCoverage } from 'vs/workbench/contrib/testing/common/testTypes';

export interface ICoverageAccessor {
	provideFileCoverage: (token: CancellationToken) => Promise<IFileCoverage[]>;
	resolveFileCoverage: (fileIndex: number, token: CancellationToken) => Promise<CoverageDetails[]>;
}

/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
	public static async load(accessor: ICoverageAccessor, token: CancellationToken) {
		const files = await accessor.provideFileCoverage(token);
		const map = new ResourceMap<FileCoverage>();
		for (const [i, file] of files.entries()) {
			map.set(file.uri, new FileCoverage(file, i, accessor));
		}
		return new TestCoverage(map);
	}

	constructor(
		private readonly fileCoverage: ResourceMap<FileCoverage>,
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
}

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
		let numerator = this.statement.covered;
		let denominator = this.statement.total;

		if (this.branch) {
			numerator += this.branch.covered;
			denominator += this.branch.total;
		}

		if (this.function) {
			numerator += this.function.covered;
			denominator += this.function.total;
		}

		return denominator === 0 ? 1 : numerator / denominator;
	}

	constructor(coverage: IFileCoverage) {
		this.uri = URI.revive(coverage.uri);
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
			return await this._details;
		} catch (e) {
			this._details = undefined;
			throw e;
		}
	}
}
