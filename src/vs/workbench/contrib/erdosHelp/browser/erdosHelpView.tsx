/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosHelpView.css';

import React from 'react';

import { IHelpEntry } from './helpEntry.js';
import * as DOM from '../../../../base/browser/dom.js';
import { ActionBars } from './components/actionBars.js';
import { HelpWelcomePage } from './components/helpWelcomePage.js';
import { IErdosHelpService } from './erdosHelpService.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ErdosViewPane } from '../../../browser/erdosViewPane/erdosViewPane.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';

export class ErdosHelpView extends ErdosViewPane implements IReactComponentContainer {
	private _width = 0;

	private _height = 0;

	private erdosHelpContainer: HTMLElement;

	private helpActionBarsContainer: HTMLElement;

	private erdosReactRendererHelpActionBars?: ErdosReactRenderer;

	private erdosReactRendererWelcomePage?: ErdosReactRenderer;

	private helpViewContainer: HTMLElement;

	private onSizeChangedEmitter = this._register(new Emitter<ISize>());

	private onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	private onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	private onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	private onFocusedEmitter = this._register(new Emitter<void>());

	private currentHelpEntry?: IHelpEntry;

	private showWelcomePage = false;

	get width() {
		return this._width;
	}

	get height() {
		return this._height;
	}

	get containerVisible() {
		return this.isBodyVisible();
	}

	takeFocus(): void {
		this.focus();
	}

	readonly onSizeChanged: Event<ISize> = this.onSizeChangedEmitter.event;

	readonly onVisibilityChanged: Event<boolean> = this.onVisibilityChangedEmitter.event;

	readonly onSaveScrollPosition: Event<void> = this.onSaveScrollPositionEmitter.event;

	readonly onRestoreScrollPosition: Event<void> = this.onRestoreScrollPositionEmitter.event;

	readonly onFocused: Event<void> = this.onFocusedEmitter.event;

	constructor(
		options: IViewPaneOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IErdosHelpService private readonly erdosHelpService: IErdosHelpService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService
	) {

		super(
			{ ...options, openFromCollapsedSize: '50%' },
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		this.erdosHelpContainer = DOM.$('.erdos-help-container');
		this.helpActionBarsContainer = DOM.$('.help-action-bars-container');
		this.helpViewContainer = DOM.$('.erdos-help-view-container');

		this.erdosHelpContainer.appendChild(this.helpActionBarsContainer);
		this.erdosHelpContainer.appendChild(this.helpViewContainer);

		this._register(this.erdosHelpService.onDidChangeCurrentHelpEntry(currentHelpEntry => {
			this.updateCurrentHelpEntry(currentHelpEntry);
		}));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (this.currentHelpEntry) {
				if (!visible) {
					this.currentHelpEntry.hideHelpOverlayWebview(false);
				} else {
					this.currentHelpEntry.showHelpOverlayWebview(this.helpViewContainer);
				}
			}

			this.onVisibilityChangedEmitter.fire(visible);
		}));
	}

	public override dispose(): void {
		this.currentHelpEntry?.hideHelpOverlayWebview(false);

		super.dispose();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.appendChild(this.erdosHelpContainer);

		const homeHandler = () => {
			this.erdosHelpService.showWelcomePage();
		};

		this.erdosReactRendererHelpActionBars = this._register(new ErdosReactRenderer(this.helpActionBarsContainer));
		this._register(this.erdosReactRendererHelpActionBars);

		this.erdosReactRendererHelpActionBars.render(
			<ActionBars reactComponentContainer={this} onHome={homeHandler} />
		);

		this.updateCurrentHelpEntry(this.erdosHelpService.currentHelpEntry);
		
		if (!this.erdosHelpService.currentHelpEntry) {
			this.showWelcomePage = true;
		}
		this.renderContent();
	}

	override focus(): void {
		super.focus();

		this.onFocusedEmitter.fire();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.onSizeChangedEmitter.fire({
			width,
			height
		});

		this.currentHelpEntry?.showHelpOverlayWebview(this.helpViewContainer);
	}

	private updateCurrentHelpEntry(currentHelpEntry?: IHelpEntry) {
		if (this.currentHelpEntry !== currentHelpEntry) {
			this.currentHelpEntry?.hideHelpOverlayWebview(true);
			this.currentHelpEntry = currentHelpEntry;
			
			const shouldShowWelcome = !currentHelpEntry;
			
			if (shouldShowWelcome !== this.showWelcomePage) {
				this.showWelcomePage = shouldShowWelcome;
				this.renderContent();
			} else if (!shouldShowWelcome) {
				this.currentHelpEntry?.showHelpOverlayWebview(this.helpViewContainer);
			}
		}
	}

	private renderContent() {
		if (this.showWelcomePage) {
			this.currentHelpEntry?.hideHelpOverlayWebview(false);
			
			if (!this.erdosReactRendererWelcomePage) {
				this.erdosReactRendererWelcomePage = this._register(new ErdosReactRenderer(this.helpViewContainer));
			}
			
			this.erdosReactRendererWelcomePage.render(
				<HelpWelcomePage 
					onTopicSelected={(topic, languageId) => {
						this.erdosHelpService.showHelpTopic(languageId, topic);
					}}
				/>
			);
		} else {
			if (this.erdosReactRendererWelcomePage) {
				this.erdosReactRendererWelcomePage.dispose();
				this.erdosReactRendererWelcomePage = undefined;
			}
			
			this.currentHelpEntry?.showHelpOverlayWebview(this.helpViewContainer);
		}
	}
}

