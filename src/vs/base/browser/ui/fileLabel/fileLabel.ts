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
	private labelHighlights: IMatch[]= [];

	constructor(container: HTMLElement, arg2?: uri | string, arg3?: uri | string | IWorkspaceProvider) {
		this.domNode = dom.append(container, dom.emmet('.monaco-file-label'));
		this.labelNode= new HighlightedLabel(dom.append(this.domNode, dom.emmet('span.file-name')));
		this.directoryNode= dom.append(this.domNode, dom.emmet('span.file-path'));

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
		let newPath = getPath(arg1);
		this.path = newPath;
		this.labelHighlights= labelHighlights;
		this.render();
	}

	private render(): void {
		this.domNode.title = this.path;
		this.labelNode.set(paths.basename(this.path), this.labelHighlights);
		let parent = paths.dirname(this.path);
		this.directoryNode.textContent= parent && parent !== '.' ? getPathLabel(parent, this.basepath) : '';
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
		let ws = (<IWorkspaceProvider>arg1).getWorkspace();
		return ws ? ws.resource.fsPath : void 0;
	}

	return (<uri>arg1).fsPath;
}