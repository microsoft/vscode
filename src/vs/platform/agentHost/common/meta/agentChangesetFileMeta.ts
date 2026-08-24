/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Mutable } from '../../../../base/common/types.js';
import { ChangesetFile } from '../state/sessionState.js';

interface IChangesetFileMeta {
	readonly reviewed?: boolean;
}

export function readChangesetFileMeta(source: ChangesetFile): IChangesetFileMeta | undefined {
	const meta = source._meta;
	if (!meta) {
		return undefined;
	}

	const result: Mutable<IChangesetFileMeta> = {};
	if (typeof meta['reviewed'] === 'boolean') { result.reviewed = meta['reviewed']; }

	return result;
}
