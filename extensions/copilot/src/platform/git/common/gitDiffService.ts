/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
// eslint-disable-next-line local/code-layering -- Pre-existing layering violation found when the zone check started resolving extensionless imports.
import { Change, Repository } from '../vscode/git';

export const IGitDiffService = createServiceIdentifier<IGitDiffService>('IGitDiffService');

export interface IGitDiffService {
	readonly _serviceBrand: undefined;

	getChangeDiffs(repository: Repository | Uri, changes: Change[], token?: CancellationToken): Promise<Diff[]>;
	getWorkingTreeDiffsFromRef(repository: Repository | Uri, changes: Change[], ref: string, token?: CancellationToken): Promise<Diff[]>;
}

export interface Diff extends Change {
	readonly diff: string;
}
