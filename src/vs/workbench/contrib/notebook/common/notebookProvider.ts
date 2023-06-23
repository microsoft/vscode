/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { basename } from 'vs/base/common/path';
import { INotebookExclusiveDocumentFilter, isDocumentExcludePattern, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

type NotebookSelector = string | glob.IRelativePattern | INotebookExclusiveDocumentFilter;

export interface NotebookEditorDescriptor {
	readonly extension?: ExtensionIdentifier;
	readonly id: string;
	readonly displayName: string;
	readonly selectors: readonly { filenamePattern?: string; excludeFileNamePattern?: string }[];
	readonly priority: RegisteredEditorPriority;
	readonly providerDisplayName: string;
	readonly exclusive: boolean;
	readonly externalEditor?: boolean;
}

export class NotebookProviderInfo {

	readonly extension?: ExtensionIdentifier;
	readonly id: string;
	readonly displayName: string;
	readonly priority: RegisteredEditorPriority;
	readonly providerDisplayName: string;
	readonly exclusive: boolean;
	readonly externalEditor: boolean;

	private _selectors: NotebookSelector[];
	get selectors() {
		return this._selectors;
	}
	private _options: TransientOptions;
	get options() {
		return this._options;
	}

	constructor(descriptor: NotebookEditorDescriptor) {
		this.extension = descriptor.extension;
		this.id = descriptor.id;
		this.displayName = descriptor.displayName;
		this._selectors = descriptor.selectors?.map(selector => ({
			include: selector.filenamePattern,
			exclude: selector.excludeFileNamePattern || ''
		})) || [];
		this.priority = descriptor.priority;
		this.providerDisplayName = descriptor.providerDisplayName;
		this.exclusive = descriptor.exclusive;
		this._options = {
			transientCellMetadata: {},
			transientDocumentMetadata: {},
			transientOutputs: false,
			cellContentMetadata: {}
		};
		this.externalEditor = !!descriptor.externalEditor;
	}

	update(args: { selectors?: NotebookSelector[]; options?: TransientOptions }) {
		if (args.selectors) {
			this._selectors = args.selectors;
		}

		if (args.options) {
			this._options = args.options;
		}
	}

	matches(resource: URI): boolean {
		return this.selectors?.some(selector => NotebookProviderInfo.selectorMatches(selector, resource));
	}

	static selectorMatches(selector: NotebookSelector, resource: URI): boolean {
		if (typeof selector === 'string') {
			// filenamePattern
			if (glob.match(selector.toLowerCase(), basename(resource.fsPath).toLowerCase())) {
				return true;
			}
		}

		if (glob.isRelativePattern(selector)) {
			if (glob.match(selector, basename(resource.fsPath).toLowerCase())) {
				return true;
			}
		}

		if (!isDocumentExcludePattern(selector)) {
			return false;
		}

		const filenamePattern = selector.include;
		const excludeFilenamePattern = selector.exclude;

		if (glob.match(filenamePattern, basename(resource.fsPath).toLowerCase())) {
			if (excludeFilenamePattern) {
				if (glob.match(excludeFilenamePattern, basename(resource.fsPath).toLowerCase())) {
					return false;
				}
			}
			return true;
		}

		return false;
	}

	static possibleFileEnding(selectors: NotebookSelector[]): string | undefined {
		for (const selector of selectors) {
			const ending = NotebookProviderInfo._possibleFileEnding(selector);
			if (ending) {
				return ending;
			}
		}
		return undefined;
	}

	private static _possibleFileEnding(selector: NotebookSelector): string | undefined {

		const pattern = /^.*(\.[a-zA-Z0-9_-]+)$/;

		let candidate: string | undefined;

		if (typeof selector === 'string') {
			candidate = selector;
		} else if (glob.isRelativePattern(selector)) {
			candidate = selector.pattern;
		} else if (selector.include) {
			return NotebookProviderInfo._possibleFileEnding(selector.include);
		}

		if (candidate) {
			const match = pattern.exec(candidate);
			if (match) {
				return match[1];
			}
		}

		return undefined;
	}
}
