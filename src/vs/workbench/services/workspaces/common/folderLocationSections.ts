/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** What a folder that a picker offers is: a folder of the window, such as its primary checkout, or a worktree of it. */
export type FolderLocationKind = 'folder' | 'worktree';

/** A folder that a picker offers, with what it is and whether the window's folder is there now. */
export interface IFolderLocationPickerEntry<T> {
	readonly item: T;
	readonly kind: FolderLocationKind;
	readonly current: boolean;
}

/** A section of a folder picker: its title and its items, in the order they show. */
export interface IFolderLocationPickerSection<T> {
	readonly kind: FolderLocationKind;
	readonly title: string;
	readonly items: readonly T[];
}

/**
 * The sections of a picker that offers a window's folders and their worktrees, as every such picker shows them: after New
 * Worktree, which comes first, a Folder section (Folders with several) and a Worktrees section. Each lists the folder that
 * the window's folder is at now first, which shows {@link getCurrentFolderLocationDescription} as its description, and
 * then the others in their order. A section without items is left out.
 */
export function groupFolderLocations<T>(entries: readonly IFolderLocationPickerEntry<T>[]): IFolderLocationPickerSection<T>[] {
	const sections: IFolderLocationPickerSection<T>[] = [];
	const section = (kind: FolderLocationKind, title: (count: number) => string) => {
		const ofKind = entries.filter(entry => entry.kind === kind);
		if (ofKind.length) {
			sections.push({ kind, title: title(ofKind.length), items: [...ofKind.filter(entry => entry.current), ...ofKind.filter(entry => !entry.current)].map(entry => entry.item) });
		}
	};
	section('folder', count => count > 1 ? localize('folderLocations.folders', "Folders") : localize('folderLocations.folder', "Folder"));
	section('worktree', () => localize('folderLocations.worktrees', "Worktrees"));
	return sections;
}

/** The description of the folder that the window's folder is at now, in a picker of {@link groupFolderLocations}. */
export function getCurrentFolderLocationDescription(): string {
	return localize('folderLocations.current', "Current");
}

/** The label of the choice, first in a picker of {@link groupFolderLocations}, that starts a session in a new worktree. */
export function getNewWorktreeLabel(): string {
	return localize('folderLocations.newWorktree', "New Worktree");
}
