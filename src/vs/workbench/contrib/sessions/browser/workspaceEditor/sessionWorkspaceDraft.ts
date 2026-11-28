/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISessionWorkspaceUpdate } from '../../common/sessionWorkspaces.js';

/** A workspace as the Workspace editor edits it. */
export interface ISessionWorkspaceDraft {
	readonly name: string;
	/** The default folder is first. */
	readonly folders: readonly URI[];
	/** The ID of the icon, or `undefined` for the default icon. */
	readonly icon?: string;
	/** A theme color ID or a `#rrggbb` color, or `undefined` for the default color. */
	readonly color?: string;
}

/**
 * The workspace being created or edited. Until the user types a name, the name follows the default folder's name.
 */
export class SessionWorkspaceDraftModel {

	private _name: string;
	private _nameEdited: boolean;
	private _folders: URI[];
	private _icon: string | undefined;
	private _color: string | undefined;

	constructor(initial: ISessionWorkspaceDraft, nameEdited: boolean, private readonly isEqual: (a: URI, b: URI) => boolean) {
		this._name = initial.name;
		this._nameEdited = nameEdited;
		this._folders = [...initial.folders];
		this._icon = initial.icon;
		this._color = initial.color;
	}

	get name(): string { return this._nameEdited ? this._name : this._folders.length ? basename(this._folders[0]) : ''; }
	get nameEdited(): boolean { return this._nameEdited; }
	get folders(): readonly URI[] { return this._folders; }
	get icon(): string | undefined { return this._icon; }
	get color(): string | undefined { return this._color; }

	/** Whether the workspace can be saved: it has a name and a folder. */
	get isValid(): boolean { return this.name.trim().length > 0 && this._folders.length > 0; }

	get draft(): ISessionWorkspaceDraft {
		return { name: this.name.trim(), folders: [...this._folders], icon: this._icon, color: this._color };
	}

	setName(name: string): void {
		this._name = name;
		this._nameEdited = true;
	}

	/** Sets the icon, or the default icon with `undefined`. */
	setIcon(icon: string | undefined): void {
		this._icon = icon;
	}

	/** Sets the color, or the default color with `undefined`. */
	setColor(color: string | undefined): void {
		this._color = color;
	}

	/** Adds the folders that the workspace does not have yet, after its folders, and returns them. */
	addFolders(folders: readonly URI[]): URI[] {
		const added: URI[] = [];
		for (const folder of folders) {
			if (![...this._folders, ...added].some(existing => this.isEqual(existing, folder))) {
				added.push(folder);
			}
		}
		this._folders.push(...added);
		return added;
	}

	/** Removes the folder. Removing the default folder makes the next one the default. */
	removeFolder(folder: URI): void {
		this._folders = this._folders.filter(candidate => !this.isEqual(candidate, folder));
	}

	/** Makes the folder the default folder: the first. */
	setDefaultFolder(folder: URI): void {
		const index = this._folders.findIndex(candidate => this.isEqual(candidate, folder));
		if (index > 0) {
			this._folders.unshift(...this._folders.splice(index, 1));
		}
	}

	/** The update that turns `applied` into this draft, or `undefined` when they are the same. */
	getUpdate(applied: ISessionWorkspaceDraft): ISessionWorkspaceUpdate | undefined {
		const draft = this.draft;
		const nameChanged = draft.name !== applied.name;
		const foldersChanged = draft.folders.length !== applied.folders.length || draft.folders.some((folder, index) => !this.isEqual(folder, applied.folders[index]));
		const iconChanged = draft.icon !== applied.icon;
		const colorChanged = draft.color !== applied.color;
		if (!nameChanged && !foldersChanged && !iconChanged && !colorChanged) {
			return undefined;
		}
		return {
			name: nameChanged ? draft.name : undefined,
			folders: foldersChanged ? draft.folders : undefined,
			icon: iconChanged ? draft.icon ?? null : undefined,
			color: colorChanged ? draft.color ?? null : undefined,
		};
	}
}
