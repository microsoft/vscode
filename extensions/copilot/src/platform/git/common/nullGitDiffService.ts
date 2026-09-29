/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, Uri } from 'vscode';
import { Change, Repository } from '../vscode/git';
import { Diff, IGitDiffService } from './gitDiffService';

export class NullGitDiffService implements IGitDiffService {
	declare readonly _serviceBrand: undefined;

	async getChangeDiffs(_repository: Repository | Uri, _changes: Change[], _token?: CancellationToken): Promise<Diff[]> {
		return [];
	}

	async getWorkingTreeDiffsFromRef(_repository: Repository | Uri, _changes: Change[], _ref: string, _token?: CancellationToken): Promise<Diff[]> {
		return [];
	}
}
