/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './helpView.css';

import React from 'react';
import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../../base/browser/erdosReactRenderer.js';
import { IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { ErdosViewPane } from '../../../../browser/erdosViewPane/erdosViewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IErdosHelpService } from '../services/helpService.js';
import { IHelpEntry } from '../topicViewContract.js';
import { HelpToolbar } from '../components/HelpToolbar.js';
import { HomeScreen } from '../components/HomeScreen.js';

export class HelpView extends ErdosViewPane implements IReactComponentContainer {
	private dimensions = { width: 0, height: 0 };
	private containers = {
		main: DOM.$('.help-main-wrapper'),
		toolbar: DOM.$('.help-toolbar-wrapper'),
		content: DOM.$('.help-content-wrapper')
	};
	
	private renderers: {
		toolbar?: ErdosReactRenderer;
		welcome?: ErdosReactRenderer;
	} = {};
	
	private state = {
		activeEntry: undefined as IHelpEntry | undefined,
		displayingWelcome: false
	};

	private emitters = {
		sizeChanged: this._register(new Emitter<ISize>()),
		visibilityChanged: this._register(new Emitter<boolean>()),
		focused: this._register(new Emitter<void>()),
		scrollSave: new Emitter<void>(),
		scrollRestore: new Emitter<void>()
	};

	get width() { return this.dimensions.width; }
	get height() { return this.dimensions.height; }
	get containerVisible() { return this.isBodyVisible(); }
	
	takeFocus(): void { this.focus(); }

	readonly onSizeChanged: Event<ISize> = this.emitters.sizeChanged.event;
	readonly onVisibilityChanged: Event<boolean> = this.emitters.visibilityChanged.event;
	readonly onFocused: Event<void> = this.emitters.focused.event;
	readonly onSaveScrollPosition = this.emitters.scrollSave.event;
	readonly onRestoreScrollPosition = this.emitters.scrollRestore.event;

	constructor(
		options: IViewPaneOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IErdosHelpService private readonly _helpService: IErdosHelpService,
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

		this.containers.main.appendChild(this.containers.toolbar);
		this.containers.main.appendChild(this.containers.content);

		this._register(
			this._helpService.onDidChangeCurrentHelpEntry(entry => {
				this.handleEntryChange(entry);
			})
		);

		this._register(
			this.onDidChangeBodyVisibility(isVisible => {
				const entry = this.state.activeEntry;
				if (entry) {
					isVisible 
						? entry.displayContent(this.containers.content)
						: entry.hideContent(false);
				}
				this.emitters.visibilityChanged.fire(isVisible);
			})
		);
	}

	public override dispose(): void {
		this.state.activeEntry?.hideContent(false);
		super.dispose();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.appendChild(this.containers.main);

		this.renderers.toolbar = this._register(
			new ErdosReactRenderer(this.containers.toolbar)
		);
		this.renderers.toolbar.render(
			<HelpToolbar reactComponentContainer={this} />
		);

		this.handleEntryChange(this._helpService.currentHelpEntry);

		if (!this._helpService.currentHelpEntry) {
			this.state.displayingWelcome = true;
		}
		this.refreshContentDisplay();
	}

	override focus(): void {
		super.focus();
		this.emitters.focused.fire();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.dimensions.width = width;
		this.dimensions.height = height;

		this.emitters.sizeChanged.fire({ width, height });
		this.state.activeEntry?.displayContent(this.containers.content);
	}

	private handleEntryChange(entry?: IHelpEntry): void {
		const currentEntry = this.state.activeEntry;
		if (currentEntry === entry) return;
		
		currentEntry?.hideContent(true);
		this.state.activeEntry = entry;

		const welcomeRequired = !entry;
		const welcomeStateChanged = welcomeRequired !== this.state.displayingWelcome;
		
		if (welcomeStateChanged) {
			this.state.displayingWelcome = welcomeRequired;
			this.refreshContentDisplay();
		} else if (entry) {
			entry.displayContent(this.containers.content);
		}
	}

	private refreshContentDisplay(): void {
		if (this.state.displayingWelcome) {
			this.state.activeEntry?.hideContent(false);

			if (!this.renderers.welcome) {
				this.renderers.welcome = this._register(
					new ErdosReactRenderer(this.containers.content)
				);
			}

			this.renderers.welcome.render(
				<HomeScreen
					onTopicSelected={(topic, languageId) => {
						this._helpService.showHelpTopic(languageId, topic);
					}}
				/>
			);
		} else {
			if (this.renderers.welcome) {
				this.renderers.welcome.dispose();
				this.renderers.welcome = undefined;
			}

			this.state.activeEntry?.displayContent(this.containers.content);
		}
	}
}


