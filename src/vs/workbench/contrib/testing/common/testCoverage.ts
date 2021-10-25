/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { IFileCoverage, CoverageDetails, ICoveredCount } from 'vs/workbench/contrib/testing/common/testCollection';

export interface ICoverageAccessor {
	provideFileCoverage: (token: CancellationToken) => Promise<IFileCoverage[]>,
	resolveFileCoverage: (fileIndex: number, token: CancellationToken) => Promise<CoverageDetails[]>,
}

/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
	private fileCoverage?: Promise<IFileCoverage[]>;

	constructor(private readonly accessor: ICoverageAccessor) { }

	/**
	 * Gets coverage information for all files.
	 */
	public async getAllFiles(token = CancellationToken.None) {
		if (!this.fileCoverage) {
			this.fileCoverage = this.accessor.provideFileCoverage(token);
		}

		try {
			return await this.fileCoverage;
		} catch (e) {
			this.fileCoverage = undefined;
			throw e;
		}
	}

	/**
	 * Gets coverage information for a specific file.
	 */
	public async getUri(uri: URI, token = CancellationToken.None) {
		const files = await this.getAllFiles(token);
		return files.find(f => f.uri.toString() === uri.toString());
	}
}

export class FileCoverage {
	private _details?: CoverageDetails[] | Promise<CoverageDetails[]>;
	public readonly uri: URI;
	public readonly statement: ICoveredCount;
	public readonly branch?: ICoveredCount;
	public readonly function?: ICoveredCount;

	/** Gets the total coverage percent based on information provided. */
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

	constructor(coverage: IFileCoverage, private readonly index: number, private readonly accessor: ICoverageAccessor) {
		this.uri = URI.revive(coverage.uri);
		this.statement = coverage.statement;
		this.branch = coverage.branch;
		this.function = coverage.branch;
		this._details = coverage.details;
	}

	/**
	 * Gets per-line coverage details.
	 */
	public async details(token = CancellationToken.None) {
		if (!this._details) {
			this._details = this.accessor.resolveFileCoverage(this.index, token);
		}

		try {
			return await this._details;
		} catch (e) {
			this._details = undefined;
			throw e;
		}
	}
}
