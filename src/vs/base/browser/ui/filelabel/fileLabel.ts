/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./filelabel';
import dom = require('vs/base/browser/dom');
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import {IWorkspaceProvider, getPathLabel} from 'vs/base/common/labels';

export class FileLabel {

	private domNode: HTMLElement;
	private basepath: string;
	private path: string;
	private renderedOnce: boolean;

	constructor(container: HTMLElement, arg2?: uri | string, arg3?: uri | string | IWorkspaceProvider) {
		this.domNode = document.createElement('span');
		this.domNode.className = 'monaco-file-label';
		container.appendChild(this.domNode);

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

	public setValue(arg1: uri | string): void {
		let newPath = getPath(arg1);

		if (this.renderedOnce && this.path === newPath) {
			// don't render again if nothing has changed
			return;
		}

		this.path = newPath;
		this.render();
		this.renderedOnce = true;
	}

	private render(): void {
		dom.clearNode(this.domNode);

		let htmlContent: string[] = [];

		htmlContent.push('<span class="file-name">');
		htmlContent.push(paths.basename(this.path));
		htmlContent.push('</span>');

		let parent = paths.dirname(this.path);
		if (parent && parent !== '.') {
			let pathLabel = getPathLabel(parent, this.basepath);
			htmlContent.push('<span class="file-path" title="' + pathLabel + '">');
			htmlContent.push(pathLabel);
			htmlContent.push('</span>');
		}

		this.domNode.innerHTML = htmlContent.join('');
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