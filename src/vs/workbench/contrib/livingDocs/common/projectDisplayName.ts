/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// (plan 33 iter 2, leak L5) The truthful project name shown on Home, the topbar crumb and the ALL PROJECTS
// tiles. The open folder IS the project (decision #39), so the name is the folder's - EXCEPT in the web
// build, where the sample is mounted into memfs and the workbench labels the workspace folder "mount" (or
// "static"), which is a mount-point artefact, not a project name. This pure helper resolves a display name
// from the signals the service already has, and NEVER fabricates: a mount stub is only overridden by a real
// marker the sample itself ships (a `.abstract-name` file); any other folder shows its real basename.

// Mount-point folder labels the web/memfs workbench produces that are NOT real project names.
// These are the only names the marker file is allowed to override.
const MOUNT_STUBS = new Set(['mount', 'static', 'sample-folder']);

export interface IProjectNameSignals {
	/** The workspace folder's display name (IWorkspaceContextService folder `name`). May be a mount stub on web. */
	readonly folderName?: string;
	/** The folder's basename (last path segment). Used when the folder name is absent. */
	readonly basename?: string;
	/** Contents of a `.abstract-name` marker file in the folder, if the folder ships one. Undefined otherwise. */
	readonly markerContent?: string;
}

/**
 * The truthful display name for a project folder.
 *
 * Resolution order:
 *  1. If the folder name is a web/memfs mount stub (`mount`/`static`/`sample-folder`) AND the folder ships a
 *     non-empty `.abstract-name` marker, use the marker's first non-empty line (the sample's own name).
 *  2. Otherwise the workspace folder display name, when set and non-empty.
 *  3. Otherwise the folder basename, when set and non-empty.
 *  4. Otherwise `undefined` (the caller shows its own neutral fallback, e.g. "Workspace").
 *
 * Never invents a name: an arbitrary folder that happens to be called "mount" but ships no marker still
 * shows "mount" - that is its real basename and the honest thing to show.
 */
export function projectDisplayName(signals: IProjectNameSignals): string | undefined {
	const folderName = signals.folderName?.trim();
	const basename = signals.basename?.trim();

	// A mount stub is only ever overridden by a real marker the sample ships. The marker's first non-empty
	// line is the name (keeps a trailing newline or a comment line from leaking in).
	if (folderName && MOUNT_STUBS.has(folderName.toLowerCase())) {
		const marker = markerName(signals.markerContent);
		if (marker) {
			return marker;
		}
	}

	if (folderName) {
		return folderName;
	}
	if (basename) {
		return basename;
	}
	return undefined;
}

/** The first non-empty, non-comment line of a `.abstract-name` marker, trimmed. Undefined when empty. */
function markerName(content: string | undefined): string | undefined {
	if (!content) {
		return undefined;
	}
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.length > 0 && !trimmed.startsWith('#')) {
			return trimmed;
		}
	}
	return undefined;
}
