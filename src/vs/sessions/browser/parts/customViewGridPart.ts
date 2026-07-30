/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customViewGridPart.css';
import { $, size } from '../../../base/browser/dom.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { Part } from '../../../workbench/browser/part.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { ICustomViewDescriptor } from '../../services/customView/browser/customView.js';
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize } from './agentsPartCard.js';
import { CustomViewNode } from './customViewNode.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';

/**
 * Hosts the custom views that replace the sessions grid while one is shown. It
 * is a passive renderer: the workbench drives it from
 * `ICustomViewService.activeCustomView` via {@link setView}.
 *
 * Only a single view can be shown today; the part is structured as a grid of
 * {@link CustomViewNode} leaves so more can be added later.
 */
export class CustomViewGridPart extends Part {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	readonly priority = LayoutPriority.High;

	private _contentArea: HTMLElement | undefined;
	private readonly _node = this._register(new MutableDisposable<CustomViewNode>());
	private _descriptor: ICustomViewDescriptor | undefined;
	protected _lastContentSize: { readonly width: number; readonly height: number } | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IAgentWorkbenchLayoutService protected readonly agentWorkbenchLayoutService: IAgentWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(
			Parts.CUSTOM_VIEW_GRID_PART,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			agentWorkbenchLayoutService
		);
	}

	override create(parent: HTMLElement): void {
		this.element = parent;

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const contentArea = $('.custom-view-grid');
		parent.appendChild(contentArea);
		this._contentArea = contentArea;

		this._renderView();

		return contentArea;
	}

	/** Renders the given custom view, replacing (and disposing) the previous one. */
	setView(descriptor: ICustomViewDescriptor | undefined): void {
		if (this._descriptor === descriptor) {
			return;
		}

		this._descriptor = descriptor;
		this._renderView();
	}

	private _renderView(): void {
		if (!this._contentArea) {
			return;
		}

		this._node.clear();

		if (!this._descriptor) {
			return;
		}

		const node = this.instantiationService.createInstance(CustomViewNode, this._descriptor);
		this._node.value = node;
		this._contentArea.appendChild(node.element);

		if (this._lastContentSize) {
			this._layoutNode(this._lastContentSize.width, this._lastContentSize.height);
		}
	}

	focus(): void {
		this._node.value?.focus();
	}

	override updateStyles(): void {
		super.updateStyles();

		applyAgentsPartCardStyles(assertReturnsDefined(this.getContainer()), this.theme);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
			return;
		}

		const cardSize = getAgentsPartCardContentSize(width, height, this.agentWorkbenchLayoutService.isEditorPaneVisible());
		const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);
		this._layoutNode(contentSize.width, contentSize.height);

		super.layout(width, height, top, left);
	}

	protected _layoutNode(width: number, height: number): void {
		this._lastContentSize = { width, height };

		const node = this._node.value;
		if (!node) {
			return;
		}

		size(node.element, width, height);
		node.layout(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.CUSTOM_VIEW_GRID_PART
		};
	}
}
