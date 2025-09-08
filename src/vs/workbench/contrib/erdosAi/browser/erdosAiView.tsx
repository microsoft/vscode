/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

import { Event, Emitter } from '../../../../base/common/event.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosAi, ErdosAiRef } from './erdosAiMain.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';
import { IErdosAiServiceCore } from '../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IErdosAiAuthService } from '../../../services/erdosAi/common/erdosAiAuthService.js';
import { IErdosAiAutomationService } from '../../../services/erdosAi/common/erdosAiAutomationService.js';
import { IErdosHelpSearchService } from '../../erdosHelp/browser/erdosHelpSearchService.js';
import { ErdosViewPane } from '../../../browser/erdosViewPane/erdosViewPane.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IErdosAiMarkdownRenderer } from '../../../services/erdosAiUtils/common/erdosAiMarkdownRenderer.js';
import { ICommonUtils } from '../../../services/erdosAiUtils/common/commonUtils.js';
import { IErdosAiSettingsService } from '../../../services/erdosAiSettings/common/settingsService.js';

/**
 * ErdosAi view pane container for the React UI component
 */
export class ErdosAiViewPane extends ErdosViewPane implements IReactComponentContainer {
	private _onSizeChangedEmitter = this._register(new Emitter<ISize>());

	private _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	private _onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	private _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	private _onFocusedEmitter = this._register(new Emitter<void>());

	private _erdosReactRenderer?: ErdosReactRenderer;

	private _erdosAiRef = React.createRef<ErdosAiRef>();

	private _conversationTitle: string | undefined;

	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;

	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;

	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;

	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;

	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	get width() {
		return this.element.clientWidth;
	}

	get height() {
		return this.element.clientHeight;
	}

	get containerVisible() {
		return this.isBodyVisible();
	}

	takeFocus() {
		this.focus();
	}

	constructor(
		options: IViewPaneOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IErdosAiServiceCore private readonly erdosAiService: IErdosAiServiceCore,
		@IErdosAiAuthService private readonly erdosAiAuthService: IErdosAiAuthService,
		@IErdosAiAutomationService private readonly erdosAiAutomationService: IErdosAiAutomationService,
		@IErdosHelpSearchService private readonly helpSearchService: IErdosHelpSearchService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IErdosAiMarkdownRenderer private readonly markdownRenderer: IErdosAiMarkdownRenderer,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@IErdosAiSettingsService private readonly erdosAiSettingsService: IErdosAiSettingsService
	) {
		super({
			...options,
			openFromCollapsedSize: 200,
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this._register(this.erdosAiService.onConversationLoaded((conversation) => {
			const title = conversation.info?.name || 'New conversation';
			this._conversationTitle = title;
			this.updateTitle(title);
		}));

		this._register(this.erdosAiService.onShowConversationHistory(() => {
			if (this._erdosAiRef.current) {
				this._erdosAiRef.current.showHistory();
			}
		}));

		this._register(this.erdosAiService.onShowSettings(() => {
			if (this._erdosAiRef.current) {
				this._erdosAiRef.current.showSettings();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._erdosReactRenderer = new ErdosReactRenderer(container);
		this._register(this._erdosReactRenderer);

		this._erdosReactRenderer.render(
			<ErdosAi
				ref={this._erdosAiRef}
				reactComponentContainer={this}
				erdosAiService={this.erdosAiService}
				erdosAiAuthService={this.erdosAiAuthService}
				erdosAiFullService={this.erdosAiService}
				erdosAiAutomationService={this.erdosAiAutomationService}
				helpSearchService={this.helpSearchService}
				fileService={this.fileService}
				fileDialogService={this.fileDialogService}
				textFileService={this.textFileService}
				textModelService={this.textModelService}
				markdownRenderer={this.markdownRenderer}
				commonUtils={this.commonUtils}
				erdosAiSettingsService={this.erdosAiSettingsService}
			/>
		);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this._onSizeChangedEmitter.fire({
			width,
			height: height
		});
	}

	override setExpanded(expanded: boolean): boolean {
		const result = super.setExpanded(expanded);

		this._onVisibilityChangedEmitter.fire(expanded && this.isBodyVisible());

		return result;
	}

	protected updateVisibility(visible: boolean): void {
		this._onVisibilityChangedEmitter.fire(visible && this.isExpanded());
	}

	override get title(): string {
		return this._conversationTitle || super.title;
	}

	protected override calculateTitle(title: string): string {
		return title;
	}

	override get singleViewPaneContainerTitle(): string | undefined {
		return this._conversationTitle;
	}

	override focus(): void {
		super.focus();

		this._onFocusedEmitter.fire();
	}

	override saveState(): void {
		this._onSaveScrollPositionEmitter.fire();

		super.saveState();
	}
}