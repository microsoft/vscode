/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { Schemas } from 'vs/base/common/network';
import { posix } from 'vs/base/common/path';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';

export enum ContributedEditorPriority {
	builtin = 'builtin',
	option = 'option',
	exclusive = 'exclusive',
	default = 'default'
}

export function priorityToRank(priority: ContributedEditorPriority): number {
	switch (priority) {
		case ContributedEditorPriority.exclusive:
			return 5;
		case ContributedEditorPriority.default:
			return 4;
		case ContributedEditorPriority.builtin:
			return 3;
		// Text editor is priority 2
		case ContributedEditorPriority.option:
		default:
			return 1;
	}
}

export function globMatchesResource(globPattern: string | glob.IRelativePattern, resource: URI): boolean {
	const excludedSchemes = new Set([
		Schemas.extension,
		Schemas.webviewPanel,
	]);
	// We want to say that the above schemes match no glob patterns
	if (excludedSchemes.has(resource.scheme)) {
		return false;
	}
	const matchOnPath = typeof globPattern === 'string' && globPattern.indexOf(posix.sep) >= 0;
	const target = matchOnPath ? resource.path : basename(resource);
	return glob.match(globPattern, target.toLowerCase());
}
