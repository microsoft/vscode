/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./iconlabel';
import dom = require('vs/base/browser/dom');
import {HighlightedLabel} from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import {IMatch} from 'vs/base/common/filters';

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
	private labelNode: HTMLElement|HighlightedLabel;
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

	public getHTMLElement(): HTMLElement {
		return this.domNode;
	}

	public setValue(label?: string, description?: string, options?: IIconLabelOptions): void {
		const labelNode = this.labelNode;
		if (labelNode instanceof HighlightedLabel) {
			labelNode.set(label || '', options ? options.matches : void 0);
		} else {
			labelNode.textContent = label || '';
		}

		this.descriptionNode.textContent = description || '';

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