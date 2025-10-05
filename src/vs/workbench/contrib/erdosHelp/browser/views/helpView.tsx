/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './helpView.css';

import React from 'react';
import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReactComponentContainer, ISize } from '../../../erdosConsole/browser/erdosConsoleView.js';
import { createRoot, Root } from 'react-dom/client';
import { IViewPaneOptions, ViewPaneShowActions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IContextKeyService, IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IErdosHelpService } from '../services/helpService.js';
import { IHelpEntry } from '../topicViewContract.js';
import { HomeScreen } from '../components/HomeScreen.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { TopicHistoryPanel } from '../components/TopicHistoryPanel.js';
import { TopicSearchInput } from '../components/TopicSearchInput.js';
import { ErdosHelpCanNavigateBackwardContext, ErdosHelpCanNavigateForwardContext } from '../../../../common/contextkeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';

const TOPIC_HISTORY_SELECTOR_ACTION_ID = 'workbench.action.erdosHelp.topicHistorySelector';
const TOPIC_SEARCH_ACTION_ID = 'workbench.action.erdosHelp.topicSearch';

export class HelpView extends ViewPane implements IReactComponentContainer {
	private dimensions = { width: 0, height: 0 };
	private containers = {
		main: DOM.$('.help-main-wrapper'),
		content: DOM.$('.help-content-wrapper')
	};
	
	private renderers: {
		welcome?: Root;
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

	private _canNavigateBackwardContext: IContextKey<boolean>;
	private _canNavigateForwardContext: IContextKey<boolean>;

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
		@IInstantiationService override instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IErdosHelpService private readonly _helpService: IErdosHelpService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService
	) {
		super(
			{ ...options, showActions: ViewPaneShowActions.Always, leftTitleMenuId: MenuId.ViewTitleLeft },
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

		this._canNavigateBackwardContext = ErdosHelpCanNavigateBackwardContext.bindTo(contextKeyService);
		this._canNavigateForwardContext = ErdosHelpCanNavigateForwardContext.bindTo(contextKeyService);

		this.containers.main.appendChild(this.containers.content);

		this._register(
			this._helpService.onDidChangeCurrentHelpEntry(entry => {
				this.handleEntryChange(entry);
				this._updateNavigationContext();
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

		this._updateNavigationContext();
	}

	public override dispose(): void {
		this.state.activeEntry?.hideContent(false);
		super.dispose();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.appendChild(this.containers.main);

		this.handleEntryChange(this._helpService.currentHelpEntry);

		if (!this._helpService.currentHelpEntry) {
			this.state.displayingWelcome = true;
		}
		this.refreshContentDisplay();
	}

	override createActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === TOPIC_HISTORY_SELECTOR_ACTION_ID) {
			return new TopicHistorySelectorViewItem(action);
		}
		if (action.id === TOPIC_SEARCH_ACTION_ID) {
			return new TopicSearchViewItem(action);
		}
		return super.createActionViewItem(action);
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
				this.renderers.welcome = createRoot(this.containers.content);
				this._register({ dispose: () => this.renderers.welcome?.unmount() });
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
				this.renderers.welcome.unmount();
				this.renderers.welcome = undefined;
			}

			this.state.activeEntry?.displayContent(this.containers.content);
		}
	}

	private _updateNavigationContext(): void {
		this._canNavigateBackwardContext.set(this._helpService.canNavigateBackward);
		this._canNavigateForwardContext.set(this._helpService.canNavigateForward);
	}
}

class TopicHistorySelectorViewItem extends BaseActionViewItem {
	private renderer?: Root;

	constructor(action: IAction) {
		super(null, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		
		const reactContainer = DOM.$('.topic-history-selector-container');
		container.appendChild(reactContainer);

		this.renderer = createRoot(reactContainer);
		this.renderer.render(
			<TopicHistoryPanel />
		);
	}

	override dispose(): void {
		if (this.renderer) {
			this.renderer.unmount();
			this.renderer = undefined;
		}
		super.dispose();
	}
}

class TopicSearchViewItem extends BaseActionViewItem {
	private renderer?: Root;

	constructor(action: IAction) {
		super(null, action);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		
		const reactContainer = DOM.$('.topic-search-container');
		container.appendChild(reactContainer);

		this.renderer = createRoot(reactContainer);
		this.renderer.render(
			<TopicSearchInput variant="actionbar" />
		);
	}

	override dispose(): void {
		if (this.renderer) {
			this.renderer.unmount();
			this.renderer = undefined;
		}
		super.dispose();
	}
}


