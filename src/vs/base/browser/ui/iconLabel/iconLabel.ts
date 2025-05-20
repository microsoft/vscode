/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './iconlabel.css';
import * as dom from '../../dom.js';
import * as css from '../../cssValue.js';
import { HighlightedLabel } from '../highlightedlabel/highlightedLabel.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { IMatch } from '../../../common/filters.js';
import { Disposable, IDisposable } from '../../../common/lifecycle.js';
import { equals } from '../../../common/objects.js';
import { Range } from '../../../common/range.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import type { IManagedHoverTooltipMarkdownString } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { isString } from '../../../common/types.js';
import { stripIcons } from '../../../common/iconLabels.js';
import { URI } from '../../../common/uri.js';

export interface IIconLabelCreationOptions {
	readonly supportHighlights?: boolean;
	readonly supportDescriptionHighlights?: boolean;
	readonly supportIcons?: boolean;
	readonly hoverDelegate?: IHoverDelegate;
	readonly hoverTargetOverride?: HTMLElement;
}

export interface IIconLabelValueOptions {
	title?: string | IManagedHoverTooltipMarkdownString;
	descriptionTitle?: string | IManagedHoverTooltipMarkdownString;
	suffix?: string;
	hideIcon?: boolean;
	extraClasses?: readonly string[];
	italic?: boolean;
	strikethrough?: boolean;
	matches?: readonly IMatch[];
	labelEscapeNewLines?: boolean;
	descriptionMatches?: readonly IMatch[];
	disabledCommand?: boolean;
	readonly separator?: string;
	readonly domId?: string;
	iconPath?: URI;
}

class FastLabelNode {
	private disposed: boolean | undefined;
	private _textContent: string | undefined;
	private _classNames: string[] | undefined;
	private _empty: boolean | undefined;

	constructor(private _element: HTMLElement) {
	}

	get element(): HTMLElement {
		return this._element;
	}

	set textContent(content: string) {
		if (this.disposed || content === this._textContent) {
			return;
		}

		this._textContent = content;
		this._element.textContent = content;
	}

	set classNames(classNames: string[]) {
		if (this.disposed || equals(classNames, this._classNames)) {
			return;
		}

		this._classNames = classNames;
		this._element.classList.value = '';
		this._element.classList.add(...classNames);
	}

	set empty(empty: boolean) {
		if (this.disposed || empty === this._empty) {
			return;
		}

		this._empty = empty;
		this._element.style.marginLeft = empty ? '0' : '';
	}

	dispose(): void {
		this.disposed = true;
	}
}

export class IconLabel extends Disposable {

	private readonly creationOptions?: IIconLabelCreationOptions;

	private readonly domNode: FastLabelNode;
	private readonly nameContainer: HTMLElement;
	private readonly nameNode: Label | LabelWithHighlights;

	private descriptionNode: FastLabelNode | HighlightedLabel | undefined;
	private suffixNode: FastLabelNode | undefined;

	private readonly labelContainer: HTMLElement;

	private readonly hoverDelegate: IHoverDelegate;
	private readonly customHovers: Map<HTMLElement, IDisposable> = new Map();

	constructor(container: HTMLElement, options?: IIconLabelCreationOptions) {
		super();
		this.creationOptions = options;

		this.domNode = this._register(new FastLabelNode(dom.append(container, dom.$('.monaco-icon-label'))));

		this.labelContainer = dom.append(this.domNode.element, dom.$('.monaco-icon-label-container'));

		this.nameContainer = dom.append(this.labelContainer, dom.$('span.monaco-icon-name-container'));

		if (options?.supportHighlights || options?.supportIcons) {
			this.nameNode = this._register(new LabelWithHighlights(this.nameContainer, !!options.supportIcons));
		} else {
			this.nameNode = new Label(this.nameContainer);
		}

		this.hoverDelegate = options?.hoverDelegate ?? getDefaultHoverDelegate('mouse');
	}

	get element(): HTMLElement {
		return this.domNode.element;
	}

	setLabel(label: string | string[], description?: string, options?: IIconLabelValueOptions): void {
		const labelClasses = ['monaco-icon-label'];
		const containerClasses = ['monaco-icon-label-container'];
		let ariaLabel: string = '';
		if (options) {
			if (options.extraClasses) {
				labelClasses.push(...options.extraClasses);
			}

			if (options.italic) {
				labelClasses.push('italic');
			}

			if (options.strikethrough) {
				labelClasses.push('strikethrough');
			}

			if (options.disabledCommand) {
				containerClasses.push('disabled');
			}
			if (options.title) {
				if (typeof options.title === 'string') {
					ariaLabel += options.title;
				} else {
					ariaLabel += label;
				}
			}
		}

		const existingIconNode = this.domNode.element.querySelector('.monaco-icon-label-iconpath');
		if (options?.iconPath) {
			let iconNode;
			if (!existingIconNode || !(dom.isHTMLElement(existingIconNode))) {
				iconNode = dom.$('.monaco-icon-label-iconpath');
				this.domNode.element.prepend(iconNode);
			} else {
				iconNode = existingIconNode;
			}
			iconNode.style.backgroundImage = css.asCSSUrl(options?.iconPath);
			iconNode.style.backgroundRepeat = 'no-repeat';
			iconNode.style.backgroundPosition = 'center';
			iconNode.style.backgroundSize = 'contain';

		} else if (existingIconNode) {
			existingIconNode.remove();
		}

		this.domNode.classNames = labelClasses;
		this.domNode.element.setAttribute('aria-label', ariaLabel);
		this.labelContainer.classList.value = '';
		this.labelContainer.classList.add(...containerClasses);
		this.setupHover(options?.descriptionTitle ? this.labelContainer : this.element, options?.title);

		this.nameNode.setLabel(label, options);

		if (description || this.descriptionNode) {
			const descriptionNode = this.getOrCreateDescriptionNode();
			if (descriptionNode instanceof HighlightedLabel) {
				descriptionNode.set(description || '', options ? options.descriptionMatches : undefined, undefined, options?.labelEscapeNewLines);
				this.setupHover(descriptionNode.element, options?.descriptionTitle);
			} else {
				descriptionNode.textContent = description && options?.labelEscapeNewLines ? HighlightedLabel.escapeNewLines(description, []) : (description || '');
				this.setupHover(descriptionNode.element, options?.descriptionTitle || '');
				descriptionNode.empty = !description;
			}
		}

		if (options?.suffix || this.suffixNode) {
			const suffixNode = this.getOrCreateSuffixNode();
			suffixNode.textContent = options?.suffix ?? '';
		}
	}

	private setupHover(htmlElement: HTMLElement, tooltip: string | IManagedHoverTooltipMarkdownString | undefined): void {
		const previousCustomHover = this.customHovers.get(htmlElement);
		if (previousCustomHover) {
			previousCustomHover.dispose();
			this.customHovers.delete(htmlElement);
		}

		if (!tooltip) {
			htmlElement.removeAttribute('title');
			return;
		}

		let hoverTarget = htmlElement;
		if (this.creationOptions?.hoverTargetOverride) {
			if (!dom.isAncestor(htmlElement, this.creationOptions.hoverTargetOverride)) {
				throw new Error('hoverTargetOverrride must be an ancestor of the htmlElement');
			}
			hoverTarget = this.creationOptions.hoverTargetOverride;
		}

		if (this.hoverDelegate.showNativeHover) {
			function setupNativeHover(htmlElement: HTMLElement, tooltip: string | IManagedHoverTooltipMarkdownString | undefined): void {
				if (isString(tooltip)) {
					// Icons don't render in the native hover so we strip them out
					htmlElement.title = stripIcons(tooltip);
				} else if (tooltip?.markdownNotSupportedFallback) {
					htmlElement.title = tooltip.markdownNotSupportedFallback;
				} else {
					htmlElement.removeAttribute('title');
				}
			}
			setupNativeHover(hoverTarget, tooltip);
		} else {
			const hoverDisposable = getBaseLayerHoverDelegate().setupManagedHover(this.hoverDelegate, hoverTarget, tooltip);
			if (hoverDisposable) {
				this.customHovers.set(htmlElement, hoverDisposable);
			}
		}
	}

	public override dispose() {
		super.dispose();
		for (const disposable of this.customHovers.values()) {
			disposable.dispose();
		}
		this.customHovers.clear();
	}

	private getOrCreateSuffixNode() {
		if (!this.suffixNode) {
			const suffixContainer = this._register(new FastLabelNode(dom.after(this.nameContainer, dom.$('span.monaco-icon-suffix-container'))));
			this.suffixNode = this._register(new FastLabelNode(dom.append(suffixContainer.element, dom.$('span.label-suffix'))));
		}

		return this.suffixNode;
	}

	private getOrCreateDescriptionNode() {
		if (!this.descriptionNode) {
			const descriptionContainer = this._register(new FastLabelNode(dom.append(this.labelContainer, dom.$('span.monaco-icon-description-container'))));
			if (this.creationOptions?.supportDescriptionHighlights) {
				this.descriptionNode = this._register(new HighlightedLabel(dom.append(descriptionContainer.element, dom.$('span.label-description')), { supportIcons: !!this.creationOptions.supportIcons }));
			} else {
				this.descriptionNode = this._register(new FastLabelNode(dom.append(descriptionContainer.element, dom.$('span.label-description'))));
			}
		}

		return this.descriptionNode;
	}
}

class Label {

	private label: string | string[] | undefined = undefined;
	private singleLabel: HTMLElement | undefined = undefined;
	private options: IIconLabelValueOptions | undefined;

	constructor(private container: HTMLElement) { }

	setLabel(label: string | string[], options?: IIconLabelValueOptions): void {
		if (this.label === label && equals(this.options, options)) {
			return;
		}

		this.label = label;
		this.options = options;

		if (typeof label === 'string') {
			if (!this.singleLabel) {
				this.container.innerText = '';
				this.container.classList.remove('multiple');
				this.singleLabel = dom.append(this.container, dom.$('a.label-name', { id: options?.domId }));
			}

			this.singleLabel.textContent = label;
		} else {
			this.container.innerText = '';
			this.container.classList.add('multiple');
			this.singleLabel = undefined;

			for (let i = 0; i < label.length; i++) {
				const l = label[i];
				const id = options?.domId && `${options?.domId}_${i}`;

				dom.append(this.container, dom.$('a.label-name', { id, 'data-icon-label-count': label.length, 'data-icon-label-index': i, 'role': 'treeitem' }, l));

				if (i < label.length - 1) {
					dom.append(this.container, dom.$('span.label-separator', undefined, options?.separator || '/'));
				}
			}
		}
	}
}

function splitMatches(labels: string[], separator: string, matches: readonly IMatch[] | undefined): IMatch[][] | undefined {
	if (!matches) {
		return undefined;
	}

	let labelStart = 0;

	return labels.map(label => {
		const labelRange = { start: labelStart, end: labelStart + label.length };

		const result = matches
			.map(match => Range.intersect(labelRange, match))
			.filter(range => !Range.isEmpty(range))
			.map(({ start, end }) => ({ start: start - labelStart, end: end - labelStart }));

		labelStart = labelRange.end + separator.length;
		return result;
	});
}

class LabelWithHighlights extends Disposable {

	private label: string | string[] | undefined = undefined;
	private singleLabel: HighlightedLabel | undefined = undefined;
	private options: IIconLabelValueOptions | undefined;

	constructor(private container: HTMLElement, private supportIcons: boolean) {
		super();
	}

	setLabel(label: string | string[], options?: IIconLabelValueOptions): void {
		if (this.label === label && equals(this.options, options)) {
			return;
		}

		this.label = label;
		this.options = options;

		if (typeof label === 'string') {
			if (!this.singleLabel) {
				this.container.innerText = '';
				this.container.classList.remove('multiple');
				this.singleLabel = this._register(new HighlightedLabel(dom.append(this.container, dom.$('a.label-name', { id: options?.domId })), { supportIcons: this.supportIcons }));
			}

			this.singleLabel.set(label, options?.matches, undefined, options?.labelEscapeNewLines);
		} else {
			this.container.innerText = '';
			this.container.classList.add('multiple');
			this.singleLabel = undefined;

			const separator = options?.separator || '/';
			const matches = splitMatches(label, separator, options?.matches);

			for (let i = 0; i < label.length; i++) {
				const l = label[i];
				const m = matches ? matches[i] : undefined;
				const id = options?.domId && `${options?.domId}_${i}`;

				const name = dom.$('a.label-name', { id, 'data-icon-label-count': label.length, 'data-icon-label-index': i, 'role': 'treeitem' });
				const highlightedLabel = this._register(new HighlightedLabel(dom.append(this.container, name), { supportIcons: this.supportIcons }));
				highlightedLabel.set(l, m, undefined, options?.labelEscapeNewLines);

				if (i < label.length - 1) {
					dom.append(name, dom.$('span.label-separator', undefined, separator));
				}
			}
		}
	}
}
