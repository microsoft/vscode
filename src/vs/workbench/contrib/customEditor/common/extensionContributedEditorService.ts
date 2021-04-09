/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		case ContributedEditorPriority.option:
		default:
			return 1;
	}
}
