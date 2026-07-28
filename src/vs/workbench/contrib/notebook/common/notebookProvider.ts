/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from '../../../../base/common/glob.js';
import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/path.js';
import { INotebookExclusiveDocumentFilter, isDocumentExcludePattern, TransientOptions } from './notebookCommon.js';
import { RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

type NotebookSelector = string | glob.IRelativePattern | INotebookExclusiveDocumentFilter;

export interface NotebookEditorDescriptor {
	readonly extension?: ExtensionIdentifier;
	readonly id: string;
	readonly displayName: string;
	readonly selectors: readonly { filenamePattern?: string; excludeFileNamePattern?: string }[];
	readonly priority: RegisteredEditorPriority;
	readonly providerDisplayName: string;
}

interface INotebookEditorDescriptorDto {
	readonly _selectors: readonly NotebookSelector[];
}

export class NotebookProviderInfo {

	readonly extension?: ExtensionIdentifier;
	readonly id: string;
	readonly displayName: string;
	readonly priority: RegisteredEditorPriority;
	readonly providerDisplayName: string;

	public _selectors: NotebookSelector[];
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
		}))
			|| (descriptor as unknown as INotebookEditorDescriptorDto)._selectors
			|| [];
		this.priority = descriptor.priority;
		this.providerDisplayName = descriptor.providerDisplayName;
		this._options = {
			transientCellMetadata: {},
			transientDocumentMetadata: {},
			transientOutputs: false,
			cellContentMetadata: {}
		};
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
		if (typeof selector === 'string' || glob.isRelativePattern(selector)) {
			if (glob.match(selector, basename(resource.fsPath), { ignoreCase: true })) {
				return true;
			}
		}

		if (!isDocumentExcludePattern(selector)) {
			return false;
		}

		const filenamePattern = selector.include;
		const excludeFilenamePattern = selector.exclude;

		if (glob.match(filenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
			if (excludeFilenamePattern) {
				if (glob.match(excludeFilenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
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
