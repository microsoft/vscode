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
import { IWorkspaceFolderProvider, getPathLabel, IUserHomeProvider, getBaseLabel } from 'vs/base/common/labels';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';

export interface IIconLabelCreationOptions {
	supportHighlights?: boolean;
	supportDescriptionHighlights?: boolean;
}

export interface IIconLabelOptions {
	title?: string;
	extraClasses?: string[];
	italic?: boolean;
	matches?: IMatch[];
	descriptionMatches?: IMatch[];
}

class FastLabelNode {
	private disposed: boolean;
	private _textContent: string;
	private _className: string;
	private _title: string;
	private _empty: boolean;

	constructor(private _element: HTMLElement) {
	}

	public get element(): HTMLElement {
		return this._element;
	}

	public set textContent(content: string) {
		if (this.disposed || content === this._textContent) {
			return;
		}

		this._textContent = content;
		this._element.textContent = content;
	}

	public set className(className: string) {
		if (this.disposed || className === this._className) {
			return;
		}

		this._className = className;
		this._element.className = className;
	}

	public set title(title: string) {
		if (this.disposed || title === this._title) {
			return;
		}

		this._title = title;
		this._element.title = title;
	}

	public set empty(empty: boolean) {
		if (this.disposed || empty === this._empty) {
			return;
		}

		this._empty = empty;
		this._element.style.marginLeft = empty ? '0' : null;
	}

	public dispose(): void {
		this.disposed = true;
	}
}

export class IconLabel {
	private domNode: FastLabelNode;
	private labelNode: FastLabelNode | HighlightedLabel;
	private descriptionNode: FastLabelNode | HighlightedLabel;

	constructor(container: HTMLElement, options?: IIconLabelCreationOptions) {
		this.domNode = new FastLabelNode(dom.append(container, dom.$('.monaco-icon-label')));

		const labelDescriptionContainer = new FastLabelNode(dom.append(this.domNode.element, dom.$('.monaco-icon-label-description-container')));

		if (options && options.supportHighlights) {
			this.labelNode = new HighlightedLabel(dom.append(labelDescriptionContainer.element, dom.$('a.label-name')));
		} else {
			this.labelNode = new FastLabelNode(dom.append(labelDescriptionContainer.element, dom.$('a.label-name')));
		}

		if (options && options.supportDescriptionHighlights) {
			this.descriptionNode = new HighlightedLabel(dom.append(labelDescriptionContainer.element, dom.$('span.label-description')));
		} else {
			this.descriptionNode = new FastLabelNode(dom.append(labelDescriptionContainer.element, dom.$('span.label-description')));
		}
	}

	public get element(): HTMLElement {
		return this.domNode.element;
	}

	public onClick(callback: (event: MouseEvent) => void): IDisposable {
		return combinedDisposable([
			dom.addDisposableListener(this.labelNode.element, dom.EventType.CLICK, (e: MouseEvent) => callback(e)),
			dom.addDisposableListener(this.descriptionNode.element, dom.EventType.CLICK, (e: MouseEvent) => callback(e))
		]);
	}

	public setValue(label?: string, description?: string, options?: IIconLabelOptions): void {
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
		this.domNode.title = options && options.title ? options.title : '';

		const labelNode = this.labelNode;
		if (labelNode instanceof HighlightedLabel) {
			labelNode.set(label || '', options ? options.matches : void 0);
		} else {
			labelNode.textContent = label || '';
		}

		const descriptionNode = this.descriptionNode;
		if (descriptionNode instanceof HighlightedLabel) {
			descriptionNode.set(description || '', options ? options.descriptionMatches : void 0);
		} else {
			descriptionNode.textContent = description || '';
			descriptionNode.empty = !description;
		}
	}

	public dispose(): void {
		this.domNode.dispose();
		this.labelNode.dispose();
		this.descriptionNode.dispose();
	}
}

export class FileLabel extends IconLabel {

	constructor(container: HTMLElement, file: uri, provider: IWorkspaceFolderProvider, userHome?: IUserHomeProvider) {
		super(container);

		this.setFile(file, provider, userHome);
	}

	public setFile(file: uri, provider: IWorkspaceFolderProvider, userHome: IUserHomeProvider): void {
		const parent = paths.dirname(file.fsPath);

		this.setValue(getBaseLabel(file), parent && parent !== '.' ? getPathLabel(parent, provider, userHome) : '', { title: file.fsPath });
	}
}
