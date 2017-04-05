/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/part';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { Component } from 'vs/workbench/common/component';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';

export interface IPartOptions {
	hasTitle?: boolean;
}

/**
 * Parts are layed out in the workbench and have their own layout that arranges an optional title
 * and mandatory content area to show content.
 */
export abstract class Part extends Component {
	private parent: Builder;
	private titleArea: Builder;
	private contentArea: Builder;
	private partLayout: PartLayout;

	constructor(
		id: string,
		private options: IPartOptions,
		themeService: IThemeService
	) {
		super(id, themeService);
	}

	protected onThemeChange(theme: ITheme): void {

		// only call if our create() method has been called
		if (this.parent) {
			super.onThemeChange(theme);
		}
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create title and content area of the part.
	 */
	public create(parent: Builder): void {
		this.parent = parent;
		this.titleArea = this.createTitleArea(parent);
		this.contentArea = this.createContentArea(parent);

		this.partLayout = new PartLayout(this.parent, this.options, this.titleArea, this.contentArea);

		this.updateStyles();
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
	protected createTitleArea(parent: Builder): Builder {
		return null;
	}

	/**
	 * Returns the title area container.
	 */
	protected getTitleArea(): Builder {
		return this.titleArea;
	}

	/**
	 * Subclasses override to provide a content area implementation.
	 */
	protected createContentArea(parent: Builder): Builder {
		return null;
	}

	/**
	 * Returns the content area container.
	 */
	protected getContentArea(): Builder {
		return this.contentArea;
	}

	/**
	 * Layout title and content area in the given dimension.
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

const TITLE_HEIGHT = 35;

export class PartLayout {

	constructor(private container: Builder, private options: IPartOptions, private titleArea: Builder, private contentArea: Builder) {
	}

	public layout(dimension: Dimension): Dimension[] {
		const {width, height} = dimension;

		// Return the applied sizes to title and content
		const sizes: Dimension[] = [];

		// Title Size: Width (Fill), Height (Variable)
		let titleSize: Dimension;
		if (this.options && this.options.hasTitle) {
			titleSize = new Dimension(width, Math.min(height, TITLE_HEIGHT));
		} else {
			titleSize = new Dimension(0, 0);
		}

		// Content Size: Width (Fill), Height (Variable)
		const contentSize = new Dimension(width, height - titleSize.height);

		sizes.push(titleSize);
		sizes.push(contentSize);

		// Content
		if (this.contentArea) {
			this.contentArea.size(contentSize.width, contentSize.height);
		}

		return sizes;
	}
}