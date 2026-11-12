/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractPaneCompositePart } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { agentsDetailBackground } from '../../../workbench/contrib/sessions/common/theme.js';
import { asCssVariable } from '../../../platform/theme/common/colorUtils.js';
import { AuxiliaryBarPart } from './auxiliaryBarPart.js';
import { PaneComposite } from '../../../workbench/browser/panecomposite.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { ViewPaneContainer } from '../../../workbench/browser/parts/views/viewPaneContainer.js';

/**
 * Desktop variant of the auxiliary bar. In the desktop layout the
 * auxiliary bar is docked inside the editor part as a contextual detail panel:
 * it has no title/composite bar, uses the editor background by default, and
 * fills the exact rectangle the workbench positions it in.
 */
export class DesktopAuxiliaryBarPart extends AuxiliaryBarPart {
	private sizeToContent = false;
	private contentSizingContainer: ViewPaneContainer | undefined;
	private focusContainer: ViewPaneContainer | undefined;
	private readonly focusPreparation = this._register(new MutableDisposable());
	private readonly contentHeightListener = this._register(new MutableDisposable());
	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	setSizeToContent(enabled: boolean): void {
		this.sizeToContent = enabled;
		this.updateContentSizing();
	}

	getContentHeight(): number | undefined {
		return this.contentSizingContainer?.getOptimalHeight();
	}

	private updateContentSizing(): void {
		const composite = this.getActivePaneComposite();
		const activeContainer = composite instanceof PaneComposite ? composite.getViewPaneContainer() : undefined;
		if (activeContainer !== this.focusContainer) {
			this.focusPreparation.clear();
			this.focusContainer = activeContainer;
			this.focusPreparation.value = activeContainer?.setFocusPreparation(() => this.beforeFocus?.());
		}
		const container = this.sizeToContent ? activeContainer : undefined;
		if (container === this.contentSizingContainer) {
			return;
		}
		this.contentHeightListener.clear();
		this.contentSizingContainer?.setSizeToContent(false);
		this.contentSizingContainer = container;
		if (container) {
			this.contentHeightListener.value = container.onDidChangeOptimalHeight(() => this._onDidChangeContentHeight.fire());
			container.setSizeToContent(true);
		}
		this._onDidChangeContentHeight.fire();
	}

	/** Reveals floating content before a view tries to focus its hidden tree. */
	beforeFocus: (() => void) | undefined;

	override openPaneComposite(id?: string, focus?: boolean): Promise<PaneComposite | undefined> {
		if (focus) {
			this.beforeFocus?.();
		}
		return super.openPaneComposite(id, focus);
	}

	override create(parent: HTMLElement): void {
		// Clear `hasTitle` so PartLayout does not reserve title height (there is no title strip).
		this.options = { ...this.options, hasTitle: false };
		super.create(parent);
		this._register(Event.any(this.onDidPaneCompositeOpen, this.onDidPaneCompositeClose)(() => this.updateContentSizing()));
	}

	protected override shouldShowCompositeBar(): boolean {
		return false;
	}

	protected override getPartBackgroundColor(): string {
		return asCssVariable(agentsDetailBackground);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		// The workbench docks and sizes the aux bar to an exact rectangle (below the
		// editor tab strip); fill it directly without the card margins/border math.
		AbstractPaneCompositePart.prototype.layout.call(this, width, height, top, left);
	}

	override dispose(): void {
		this.setSizeToContent(false);
		super.dispose();
	}
}
