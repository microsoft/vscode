/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IExternalEditorImportService = createDecorator<IExternalEditorImportService>('externalEditorImportService');

/**
 * A source editor (e.g. Cursor) whose customizations can be imported into VS Code.
 */
export interface IExternalEditorSource {
	/** Stable identifier, e.g. `cursor`. */
	readonly id: string;
	/** Human readable name, e.g. `Cursor`. */
	readonly label: string;
	/** The `User` folder of the source editor (contains settings.json, keybindings.json, snippets/). */
	readonly userDataUri: URI;
	/** Location of the source editor's extensions manifest, if known. */
	readonly extensionsManifestUri: URI | undefined;
	/** Whether a settings.json was found. */
	readonly hasSettings: boolean;
	/** Whether a keybindings.json was found. */
	readonly hasKeybindings: boolean;
	/** Whether any snippets were found. */
	readonly hasSnippets: boolean;
	/** Whether an extensions manifest was found. */
	readonly hasExtensions: boolean;
	/**
	 * The VS Code built-in color theme that most closely matches the source editor's currently
	 * selected theme (by kind: light, dark, or high contrast), or `undefined` when none could be
	 * determined. Applied during a settings import unless the user already chose a theme.
	 */
	readonly colorThemeId: string | undefined;
}

/**
 * Which categories of customizations to import.
 */
export interface IExternalEditorImportSelection {
	readonly settings?: boolean;
	readonly keybindings?: boolean;
	readonly snippets?: boolean;
	readonly extensions?: boolean;
}

/**
 * Summary of what an import applied.
 */
export interface IExternalEditorImportResult {
	readonly settingsImported: number;
	readonly settingsFailed: boolean;
	readonly keybindingsImported: boolean;
	readonly keybindingsFailed: boolean;
	readonly snippetsImported: number;
	readonly snippetsFailed: number;
	readonly extensionsInstalled: number;
	readonly extensionsFailed: number;
}

/**
 * A preview of the concrete items that an import would apply, after filtering out
 * items the user already has and source-specific items that are never imported.
 */
export interface IExternalEditorImportPreview {
	/** Setting keys that would be newly added. */
	readonly settings: readonly string[];
	/** Keyboard shortcut labels that would be newly added. */
	readonly keybindings: readonly string[];
	/** Snippet file names that would be newly added. */
	readonly snippets: readonly string[];
	/** Extension display names that would be newly installed. */
	readonly extensions: readonly string[];
}

export interface IExternalEditorImportService {
	readonly _serviceBrand: undefined;

	/**
	 * Detects source editors installed on this machine whose customizations can be imported.
	 * Returns an empty array in environments where local detection is not possible (e.g. web).
	 */
	detectSources(token?: CancellationToken): Promise<IExternalEditorSource[]>;

	/**
	 * Computes a preview of the concrete items that {@link import} would apply for the
	 * given source, without making any changes.
	 */
	preview(source: IExternalEditorSource, token?: CancellationToken): Promise<IExternalEditorImportPreview>;

	/**
	 * Imports the selected categories of customizations from the given source into the current profile.
	 */
	import(source: IExternalEditorSource, selection: IExternalEditorImportSelection, token?: CancellationToken): Promise<IExternalEditorImportResult>;
}
