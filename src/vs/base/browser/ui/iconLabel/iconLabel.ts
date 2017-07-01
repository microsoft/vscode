/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./iconlabel';
import dom = require('vs/base/browser/dom');
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IMatch } from 'vs/base/common/filters';
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { IRootProvider, getPathLabel, IUserHomeProvider } from 'vs/base/common/labels';

export interface IIconLabelCreationOptions {
	supportHighlights?: boolean;
}

export interface IIconLabelOptions {
	title?: string;
	extraClasses?: string[];
	italic?: boolean;
	matches?: IMatch[];
}

export class IconLabel {
	private domNode: HTMLElement;
	private labelNode: HTMLElement | HighlightedLabel;
	private descriptionNode: HTMLElement;

	constructor(container: HTMLElement, options?: IIconLabelCreationOptions) {
		this.domNode = dom.append(container, dom.$('.monaco-icon-label'));
		if (options && options.supportHighlights) {
			this.labelNode = new HighlightedLabel(dom.append(this.domNode, dom.$('a.label-name')));
		} else {
			this.labelNode = dom.append(this.domNode, dom.$('a.label-name'));
		}
		this.descriptionNode = dom.append(this.domNode, dom.$('span.label-description'));
	}

	public get element(): HTMLElement {
		return this.domNode;
	}

	public get labelElement(): HTMLElement {
		const labelNode = this.labelNode;
		if (labelNode instanceof HighlightedLabel) {
			return labelNode.element;
		} else {
			return labelNode;
		}
	}

	public get descriptionElement(): HTMLElement {
		return this.descriptionNode;
	}

	public setValue(label?: string, description?: string, options?: IIconLabelOptions): void {
		const labelNode = this.labelNode;
		if (labelNode instanceof HighlightedLabel) {
			labelNode.set(label || '', options ? options.matches : void 0);
		} else {
			labelNode.textContent = label || '';
		}

		this.descriptionNode.textContent = description || '';

		if (!description) {
			dom.addClass(this.descriptionNode, 'empty');
		} else {
			dom.removeClass(this.descriptionNode, 'empty');
		}

		this.domNode.title = options && options.title ? options.title : '';

		const classes = ['monaco-icon-label'];
		if (options) {
			if (options.extraClasses) {
				classes.push(...options.extraClasses);
			}

			if (options.italic) {
				classes.push('italic');
			}
		}

		this.domNode.className = classes.join(' ');
	}

	public dispose(): void {
		const labelNode = this.labelNode;
		if (labelNode instanceof HighlightedLabel) {
			labelNode.dispose();
		}
	}
}

export class FileLabel extends IconLabel {

	constructor(container: HTMLElement, file: uri, provider: IRootProvider, userHome?: IUserHomeProvider) {
		super(container);

		this.setFile(file, provider, userHome);
	}

	public setFile(file: uri, provider: IRootProvider, userHome: IUserHomeProvider): void {
		const parent = paths.dirname(file.fsPath);

		this.setValue(paths.basename(file.fsPath), parent && parent !== '.' ? getPathLabel(parent, provider, userHome) : '', { title: file.fsPath });
	}
}