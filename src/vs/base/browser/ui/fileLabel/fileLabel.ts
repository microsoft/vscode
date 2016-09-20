/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./fileLabel';
import dom = require('vs/base/browser/dom');
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMatch } from 'vs/base/common/filters';
import {IWorkspaceProvider, getPathLabel} from 'vs/base/common/labels';

export class FileLabel {
	private domNode: HTMLElement;
	private labelNode: HighlightedLabel;
	private directoryNode: HTMLElement;
	private basepath: string;
	private path: string;
	private labelHighlights: IMatch[] = [];

	constructor(container: HTMLElement, arg2?: uri | string, arg3?: uri | string | IWorkspaceProvider) {
		this.domNode = dom.append(container, dom.$('.monaco-file-label'));
		this.labelNode = new HighlightedLabel(dom.append(this.domNode, dom.$('span.file-name')));
		this.directoryNode = dom.append(this.domNode, dom.$('span.file-path'));

		if (arg3) {
			this.basepath = getPath(arg3);
		}

		if (arg2) {
			this.setValue(arg2);
		}
	}

	public getHTMLElement(): HTMLElement {
		return this.domNode;
	}

	public setValue(arg1: uri | string, labelHighlights?: IMatch[]): void {
		const newPath = getPath(arg1);

		this.path = newPath;
		this.labelHighlights = labelHighlights;
		this.render();
	}

	private render(): void {
		this.domNode.title = this.path;
		this.labelNode.set(paths.basename(this.path), this.labelHighlights);

		const parent = paths.dirname(this.path);
		this.directoryNode.textContent = parent && parent !== '.' ? getPathLabel(parent, this.basepath) : '';
	}
}

function getPath(arg1: uri | string | IWorkspaceProvider): string {
	if (!arg1) {
		return null;
	}

	if (typeof arg1 === 'string') {
		return arg1;
	}

	if (types.isFunction((<IWorkspaceProvider>arg1).getWorkspace)) {
		const ws = (<IWorkspaceProvider>arg1).getWorkspace();
		return ws ? ws.resource.fsPath : void 0;
	}

	return (<uri>arg1).fsPath;
}

export function getFileIconClasses(arg1?: uri | string, getLanguageId?: (path: string) => string, isFolder?: boolean): string[] {
	let path: string;
	if (typeof arg1 === 'string') {
		path = arg1;
	} else if (arg1) {
		path = arg1.fsPath;
	}

	const classes = isFolder ? ['folder-icon'] : ['file-icon'];

	if (path) {
		const basename = paths.basename(path);
		const dotSegments = basename.split('.');

		const name = dotSegments[0]; // file.txt => "file", .dockerfile => "", file.some.txt => "file"
		if (name) {
			classes.push(`${cssEscape(name.toLowerCase())}-name-file-icon`);
		}

		const extensions = dotSegments.splice(1);
		if (extensions.length > 0) {
			for (let i = 0; i < extensions.length; i++) {
				classes.push(`${cssEscape(extensions.slice(i).join('.').toLowerCase())}-ext-file-icon`); // add each combination of all found extensions if more than one
			}
		}

		const langId = getLanguageId(path);
		if (langId) {
			classes.push(`${cssEscape(langId)}-lang-file-icon`);
		}
	}

	return classes;
}

function cssEscape(val: string): string {
	return val.replace(/\s/g, '\\$&'); // make sure to not introduce CSS classes from files that contain whitespace
}