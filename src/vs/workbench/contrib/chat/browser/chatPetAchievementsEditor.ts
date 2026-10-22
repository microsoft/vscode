/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatPetAchievementsWidget } from './chatPetAchievementsWidget.js';
import { ChatPetAchievementsEditorInput, ChatPetCustomizationTab, IChatPetCustomizationEditorOptions } from './chatPetAchievementsEditorInput.js';
import { IChatPetService } from './chatPetService.js';
import { ChatPetColorsWidget } from './chatPetColorsWidget.js';

export const ChatPetAchievementsContextKeys = {
	focused: new RawContextKey<boolean>('chatPetAchievementsFocused', false, localize('chatPet.achievements.context.focused', "Whether the Blobby customization modal is focused")),
};

export class ChatPetAchievementsEditor extends EditorPane {

	static readonly ID = 'workbench.editor.chatPetAchievements';

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly focusedContextKey: IContextKey<boolean>;
	private container: HTMLElement | undefined;
	private readonly widget = this._register(new MutableDisposable<ChatPetAchievementsWidget | ChatPetColorsWidget>());
	private readonly tabs = new Map<ChatPetCustomizationTab, { readonly tab: HTMLElement; readonly panel: HTMLElement }>();
	private activeTab: ChatPetCustomizationTab = 'achievements';
	private tabBar: HTMLElement | undefined;
	private dimension: DOM.Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super(ChatPetAchievementsEditor.ID, group, telemetryService, themeService, storageService);
		this.focusedContextKey = ChatPetAchievementsContextKeys.focused.bindTo(contextKeyService);
		this._register(toDisposable(() => this.focusedContextKey.reset()));
		this._register(autorun(reader => {
			if ((!this.chatPetService.enabled.read(reader) || this.chatEntitlementService.sentimentObs.read(reader).hidden) && this.input) {
				void this.group.closeEditor(this.input);
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.widget.clear();
		this.editorDisposables.clear();
		this.tabs.clear();
		// Reuse the Modern UI editor tab hooks. The modal editor group is always the active group while open.
		this.container = DOM.append(parent, DOM.$('.chat-pet-achievements-editor.modern-ui-editor-tab-group.modern-ui-editor-tab-group-active', {
			role: 'group',
			tabindex: '-1',
			'aria-label': localize('chatPet.customization.label', "Customize Blobby"),
		}));
		const focusTracker = this.editorDisposables.add(DOM.trackFocus(this.container));
		this.editorDisposables.add(focusTracker.onDidFocus(() => this.focusedContextKey.set(true)));
		this.editorDisposables.add(focusTracker.onDidBlur(() => this.focusedContextKey.set(false)));
		this.tabBar = DOM.append(this.container, DOM.$('.chat-pet-customization-tabs.modern-ui-editor-tab-strip.modern-ui-editor-tab-list', {
			role: 'tablist',
			'aria-label': localize('chatPet.customization.tabs', "Blobby customization"),
		}));
		const tabIds: readonly ChatPetCustomizationTab[] = ['achievements', 'color'];
		const prefix = generateUuid();
		for (const [index, tab] of tabIds.entries()) {
			const tabElement = DOM.append(this.tabBar, DOM.$('.chat-pet-customization-tab.modern-ui-editor-tab', {
				role: 'tab',
				id: `${prefix}-${tab}`,
			}));
			DOM.append(tabElement, DOM.$('.chat-pet-customization-tab-fill.modern-ui-editor-tab-fill', { 'aria-hidden': 'true' }));
			DOM.append(tabElement, DOM.$('.tab-connected-edge', { 'aria-hidden': 'true' }));
			DOM.append(tabElement, DOM.$('.chat-pet-customization-tab-label.modern-ui-editor-tab-label')).textContent = tab === 'achievements'
				? localize('chatPet.customization.achievements', "Achievements")
				: localize('chatPet.customization.color', "Color");
			const panel = DOM.append(this.container, DOM.$('.chat-pet-customization-panel', {
				role: 'tabpanel',
				id: `${prefix}-${tab}-panel`,
				'aria-labelledby': tabElement.id,
			}));
			tabElement.setAttribute('aria-controls', panel.id);
			this.tabs.set(tab, { tab: tabElement, panel });
			this.editorDisposables.add(DOM.addDisposableListener(tabElement, DOM.EventType.CLICK, () => this.showTab(tab)));
			this.editorDisposables.add(DOM.addDisposableListener(tabElement, DOM.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Escape)) {
					DOM.EventHelper.stop(e, true);
					this.close();
					return;
				}
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					DOM.EventHelper.stop(e, true);
					this.showTab(tab);
					return;
				}
				const nextIndex = event.equals(KeyCode.LeftArrow)
					? (index + tabIds.length - 1) % tabIds.length
					: event.equals(KeyCode.RightArrow) ? (index + 1) % tabIds.length
						: event.equals(KeyCode.Home) ? 0
							: event.equals(KeyCode.End) ? tabIds.length - 1 : undefined;
				if (nextIndex !== undefined) {
					DOM.EventHelper.stop(e, true);
					const nextTab = tabIds[nextIndex];
					this.showTab(nextTab);
					this.tabs.get(nextTab)?.tab.focus();
				}
			}));
		}
		this.showTab(this.activeTab);
	}

	override async setInput(input: ChatPetAchievementsEditorInput, options: IChatPetCustomizationEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!this.chatPetService.enabled.get() || this.chatEntitlementService.sentiment.hidden) {
			await this.group.closeEditor(input);
			return;
		}
		this.showTab(options?.tab ?? 'achievements');
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override setOptions(options: IChatPetCustomizationEditorOptions | undefined): void {
		super.setOptions(options);
		if (options?.tab) {
			this.showTab(options.tab);
		}
	}

	private showTab(tab: ChatPetCustomizationTab): void {
		const previousPanel = this.tabs.get(this.activeTab)?.panel;
		const needsWidget = tab !== this.activeTab || !this.widget.value;
		this.activeTab = tab;
		for (const [id, entry] of this.tabs) {
			const selected = id === tab;
			entry.tab.classList.toggle('active', selected);
			entry.tab.setAttribute('aria-selected', String(selected));
			entry.tab.tabIndex = selected ? 0 : -1;
			entry.panel.hidden = !selected;
		}
		const panel = this.tabs.get(tab)?.panel;
		if (needsWidget && panel) {
			this.widget.clear();
			if (previousPanel) {
				DOM.clearNode(previousPanel);
			}
			this.widget.value = tab === 'color'
				? this.instantiationService.createInstance(ChatPetColorsWidget, panel, () => this.close())
				: this.instantiationService.createInstance(ChatPetAchievementsWidget, panel, () => this.close());
			if (this.dimension) {
				this.layout(this.dimension);
			}
		}
	}

	private close(): void {
		if (this.input) {
			void this.group.closeEditor(this.input);
		}
	}

	override clearInput(): void {
		this.focusedContextKey.set(false);
		this.widget.clear();
		for (const { panel } of this.tabs.values()) {
			DOM.clearNode(panel);
		}
		super.clearInput();
	}

	override layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
		this.widget.value?.layout(new DOM.Dimension(dimension.width, Math.max(0, dimension.height - (this.tabBar?.offsetHeight ?? 0))));
	}

	override focus(): void {
		super.focus();
		this.container?.focus();
	}
}
