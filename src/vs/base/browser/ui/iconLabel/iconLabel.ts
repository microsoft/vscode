/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./iconLabel';
import dom = require('vs/base/browser/dom');

export interface IIconLabelOptions {
	title?: string;
	extraClasses?: string[];
	italic?: boolean;
}

export class IconLabel {
	private domNode: HTMLElement;
	private labelNode: HTMLElement;
	private descriptionNode: HTMLElement;

	constructor(container: HTMLElement, label?: string, description?: string, options?: IIconLabelOptions) {
		this.domNode = dom.append(container, dom.$('.monaco-icon-label'));
		this.labelNode = dom.append(this.domNode, dom.$('a.label-name'));
		this.descriptionNode = dom.append(this.domNode, dom.$('span.label-description'));

		if (label) {
			this.setValue(label, description, options);
		}
	}

	public getHTMLElement(): HTMLElement {
		return this.domNode;
	}

	public setValue(label: string, description?: string, options?: IIconLabelOptions): void {
		this.labelNode.textContent = label || '';
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
}