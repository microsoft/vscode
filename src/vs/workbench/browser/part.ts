/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/part';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {WorkbenchComponent} from 'vs/workbench/common/component';

/**
 * Parts are layed out in the workbench and have their own layout that arranges a title,
 * content and status area to show content.
 */
export abstract class Part extends WorkbenchComponent {
	private parent: Builder;
	private titleArea: Builder;
	private contentArea: Builder;
	private statusArea: Builder;
	private partLayout: PartLayout;

	constructor(id: string) {
		super(id);
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create title, content and status area of the part.
	 */
	public create(parent: Builder): void {
		this.parent = parent;
		this.titleArea = this.createTitleArea(parent);
		this.contentArea = this.createContentArea(parent);
		this.statusArea = this.createStatusArea(parent);

		this.partLayout = new PartLayout(this.parent, this.titleArea, this.contentArea, this.statusArea);
	}

	/**
	 * Returns the overall part container.
	 */
	public getContainer(): Builder {
		return this.parent;
	}

	/**
	 * Subclasses override to provide a title area implementation.
	 */
	public createTitleArea(parent: Builder): Builder {
		return null;
	}

	/**
	 * Returns the title area container.
	 */
	public getTitleArea(): Builder {
		return this.titleArea;
	}

	/**
	 * Subclasses override to provide a content area implementation.
	 */
	public createContentArea(parent: Builder): Builder {
		return null;
	}

	/**
	 * Returns the content area container.
	 */
	public getContentArea(): Builder {
		return this.contentArea;
	}

	/**
	 * Subclasses override to provide a status area implementation.
	 */
	public createStatusArea(parent: Builder): Builder {
		return null;
	}

	/**
	 * Returns the status area container.
	 */
	public getStatusArea(): Builder {
		return this.statusArea;
	}

	/**
	 * Layout title, content and status area in the given dimension.
	 */
	public layout(dimension: Dimension): Dimension[] {
		return this.partLayout.layout(dimension);
	}

	/**
	 * Returns the part layout implementation.
	 */
	public getLayout(): PartLayout {
		return this.partLayout;
	}
}

export class EmptyPart extends Part {
	constructor(id: string) {
		super(id);
	}
}

interface IContainerStyle {
	borderLeftWidth: number;
	borderRightWidth: number;
	borderTopWidth: number;
	borderBottomWidth: number;
}

interface ITitleStatusStyle {
	display: string;
	height: number;
}

export class PartLayout {
	private container: Builder;
	private titleArea: Builder;
	private contentArea: Builder;
	private statusArea: Builder;
	private titleStyle: ITitleStatusStyle;
	private containerStyle: IContainerStyle;
	private statusStyle: ITitleStatusStyle;

	constructor(container: Builder, titleArea: Builder, contentArea: Builder, statusArea: Builder) {
		this.container = container;
		this.titleArea = titleArea;
		this.contentArea = contentArea;
		this.statusArea = statusArea;
	}

	public computeStyle(): void {
		let containerStyle = this.container.getComputedStyle();
		this.containerStyle = {
			borderLeftWidth: parseInt(containerStyle.getPropertyValue('border-left-width'), 10),
			borderRightWidth: parseInt(containerStyle.getPropertyValue('border-right-width'), 10),
			borderTopWidth: parseInt(containerStyle.getPropertyValue('border-top-width'), 10),
			borderBottomWidth: parseInt(containerStyle.getPropertyValue('border-bottom-width'), 10)
		};

		if (this.titleArea) {
			let titleStyle = this.titleArea.getComputedStyle();
			this.titleStyle = {
				display: titleStyle.getPropertyValue('display'),
				height: this.titleArea.getTotalSize().height
			};
		}

		if (this.statusArea) {
			let statusStyle = this.statusArea.getComputedStyle();
			this.statusStyle = {
				display: statusStyle.getPropertyValue('display'),
				height: this.statusArea.getTotalSize().height
			};
		}
	}

	public layout(dimension: Dimension): Dimension[] {
		if (!this.containerStyle) {
			this.computeStyle();
		}

		let width = dimension.width - (this.containerStyle.borderLeftWidth + this.containerStyle.borderRightWidth);
		let height = dimension.height - (this.containerStyle.borderTopWidth + this.containerStyle.borderBottomWidth);

		// Return the applied sizes to title, content and status
		let sizes: Dimension[] = [];

		// Title Size: Width (Fill), Height (Variable)
		let titleSize: Dimension;
		if (this.titleArea && this.titleStyle.display !== 'none') {
			titleSize = new Dimension(width, Math.min(height, this.titleStyle.height));
		} else {
			titleSize = new Dimension(0, 0);
		}

		// Status Size: Width (Fill), Height (Variable)
		let statusSize: Dimension;
		if (this.statusArea && this.statusStyle.display !== 'none') {
			this.statusArea.getHTMLElement().style.height = this.statusArea.getHTMLElement().style.width = '';
			statusSize = new Dimension(width, Math.min(height - titleSize.height, this.statusStyle.height));
		} else {
			statusSize = new Dimension(0, 0);
		}

		// Content Size: Width (Fill), Height (Variable)
		let contentSize = new Dimension(width, height - titleSize.height - statusSize.height);

		sizes.push(titleSize);
		sizes.push(contentSize);
		sizes.push(statusSize);

		// Content
		if (this.contentArea) {
			this.contentArea.size(contentSize.width, contentSize.height);
		}

		return sizes;
	}
}