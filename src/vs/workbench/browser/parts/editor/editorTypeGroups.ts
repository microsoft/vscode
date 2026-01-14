/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

/**
 * Represents a group of editors of the same type that can be visually collapsed together.
 */
export interface IEditorTypeGroup {
	/**
	 * Unique identifier for the type group.
	 */
	readonly id: string;

	/**
	 * Localized display label for the type group (e.g., "Terminals", "Browsers").
	 */
	readonly label: string;

	/**
	 * Icon to display when the group is collapsed.
	 */
	readonly icon: ThemeIcon;

	/**
	 * Priority for ordering type groups. Lower numbers appear first.
	 */
	readonly priority: number;

	/**
	 * Array of editor typeId patterns that belong to this group.
	 * Can be exact matches or prefix patterns ending with '*'.
	 */
	readonly typeIdPatterns: string[];
}

export const IEditorTypeGroupRegistry = createDecorator<IEditorTypeGroupRegistry>('editorTypeGroupRegistry');

export interface IEditorTypeGroupRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when the type groups change.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Register a new editor type group.
	 * @param group The type group to register.
	 * @returns A disposable to unregister the type group.
	 */
	registerTypeGroup(group: IEditorTypeGroup): IDisposable;

	/**
	 * Get the type group that an editor belongs to.
	 * @param editor The editor input to check.
	 * @returns The type group, or the default "Text Editors" group if not matched.
	 */
	getTypeGroupForEditor(editor: EditorInput): IEditorTypeGroup;

	/**
	 * Get all registered type groups, sorted by priority.
	 */
	getTypeGroups(): readonly IEditorTypeGroup[];

	/**
	 * Get a type group by its ID.
	 * @param id The type group ID.
	 * @returns The type group, or undefined if not found.
	 */
	getTypeGroupById(id: string): IEditorTypeGroup | undefined;
}

/**
 * Default type group IDs for built-in editor types.
 */
export const EditorTypeGroupIds = {
	TextEditors: 'textEditors',
	Terminals: 'terminals',
	Browsers: 'browsers',
	Webviews: 'webviews',
	MultiDiff: 'multiDiff'
} as const;

/**
 * Default type group for text editors (fallback for unknown types).
 */
export const DEFAULT_TEXT_EDITORS_GROUP: IEditorTypeGroup = {
	id: EditorTypeGroupIds.TextEditors,
	label: localize('editorTypeGroup.textEditors', "Text Editors"),
	icon: Codicon.file,
	priority: 0,
	typeIdPatterns: [] // Fallback group, matches all unmatched editors
};

/**
 * Default type group definitions for built-in editor types.
 */
const DEFAULT_TYPE_GROUPS: IEditorTypeGroup[] = [
	DEFAULT_TEXT_EDITORS_GROUP,
	{
		id: EditorTypeGroupIds.Terminals,
		label: localize('editorTypeGroup.terminals', "Terminals"),
		icon: Codicon.terminal,
		priority: 10,
		typeIdPatterns: ['workbench.editors.terminal']
	},
	{
		id: EditorTypeGroupIds.Browsers,
		label: localize('editorTypeGroup.browsers', "Browsers"),
		icon: Codicon.globe,
		priority: 20,
		typeIdPatterns: [
			'mainThreadWebview-simpleBrowser.view',
			'mainThreadWebview-browserPreview'
		]
	},
	{
		id: EditorTypeGroupIds.Webviews,
		label: localize('editorTypeGroup.webviews', "Webviews"),
		icon: Codicon.window,
		priority: 30,
		typeIdPatterns: ['workbench.editors.webviewEditor']
	},
	{
		id: EditorTypeGroupIds.MultiDiff,
		label: localize('editorTypeGroup.multiDiff', "Multi Diff"),
		icon: Codicon.diffMultiple,
		priority: 40,
		typeIdPatterns: ['multiDiffEditor']
	}
];

export class EditorTypeGroupRegistry extends Disposable implements IEditorTypeGroupRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly typeGroups: Map<string, IEditorTypeGroup> = new Map();
	private sortedTypeGroups: IEditorTypeGroup[] = [];

	constructor() {
		super();

		// Register default type groups
		for (const group of DEFAULT_TYPE_GROUPS) {
			this.typeGroups.set(group.id, group);
		}
		this.updateSortedGroups();
	}

	registerTypeGroup(group: IEditorTypeGroup): IDisposable {
		if (this.typeGroups.has(group.id)) {
			throw new Error(`Editor type group with id '${group.id}' is already registered.`);
		}

		this.typeGroups.set(group.id, group);
		this.updateSortedGroups();
		this._onDidChange.fire();

		return toDisposable(() => {
			if (this.typeGroups.delete(group.id)) {
				this.updateSortedGroups();
				this._onDidChange.fire();
			}
		});
	}

	getTypeGroupForEditor(editor: EditorInput): IEditorTypeGroup {
		const typeId = editor.typeId;
		const editorId = editor.editorId;

		// Check each group (except the fallback text editors group) for a match
		for (const group of this.sortedTypeGroups) {
			if (group.id === EditorTypeGroupIds.TextEditors) {
				continue; // Skip fallback group during matching
			}

			for (const pattern of group.typeIdPatterns) {
				if (pattern.endsWith('*')) {
					// Prefix match
					const prefix = pattern.slice(0, -1);
					if (typeId.startsWith(prefix) || (editorId && editorId.startsWith(prefix))) {
						return group;
					}
				} else {
					// Exact match
					if (typeId === pattern || editorId === pattern) {
						return group;
					}
				}
			}
		}

		// Return the default text editors group as fallback
		return this.typeGroups.get(EditorTypeGroupIds.TextEditors) ?? DEFAULT_TEXT_EDITORS_GROUP;
	}

	getTypeGroups(): readonly IEditorTypeGroup[] {
		return this.sortedTypeGroups;
	}

	getTypeGroupById(id: string): IEditorTypeGroup | undefined {
		return this.typeGroups.get(id);
	}

	private updateSortedGroups(): void {
		this.sortedTypeGroups = Array.from(this.typeGroups.values())
			.sort((a, b) => a.priority - b.priority);
	}
}
