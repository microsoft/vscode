/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../widget/media/chatViewWelcome.css';
import { $, append, clearNode } from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { getManagedPluginBlockInfo, IManagedPluginAvailabilityService } from '../../common/plugins/managedPluginAvailability.js';
import { ChatViewWelcomePart } from './chatViewWelcomeController.js';

/** Explains required-plugin availability without creating a chat widget or session. */
export class ChatRequiredPluginsView extends ViewPane {
	private content: HTMLElement | undefined;
	private scrollable: DomScrollableElement | undefined;
	private readonly welcome = this._register(new MutableDisposable<ChatViewWelcomePart>());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IManagedPluginAvailabilityService private readonly availabilityService: IManagedPluginAvailabilityService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		parent.classList.add('chat-view-welcome-visible');
		const container = append(parent, $('.chat-view-welcome.chat-policy-blocked'));
		const content = this.content = $('.chat-policy-blocked-content', { tabIndex: 0, role: 'region' });
		const scrollable = this.scrollable = this._register(new DomScrollableElement(content, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		container.appendChild(scrollable.getDomNode());
		this._register(autorun(reader => {
			const hadFocus = content.contains(content.ownerDocument.activeElement);
			this.welcome.clear();
			clearNode(content);
			const state = this.availabilityService.state.read(reader);
			if (!state) {
				content.removeAttribute('aria-label');
				return;
			}
			const info = getManagedPluginBlockInfo(state);
			content.setAttribute('aria-label', info.title);
			const welcome = this.welcome.value = this.instantiationService.createInstance(ChatViewWelcomePart, {
				title: info.title,
				message: info.message,
				additionalMessage: info.detail,
				primaryAction: info.action,
			}, { location: ChatAgentLocation.Chat });
			content.appendChild(welcome.element);
			scrollable.scanDomNode();
			if (hadFocus) {
				content.focus();
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.content && this.scrollable) {
			this.content.style.height = `${height}px`;
			this.scrollable.getDomNode().style.height = `${height}px`;
			this.scrollable.scanDomNode();
		}
	}

	override focus(): void {
		super.focus();
		this.content?.focus();
	}
}
