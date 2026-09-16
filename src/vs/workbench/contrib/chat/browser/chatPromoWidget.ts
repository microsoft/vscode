/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { EventType as GestureEventType, Gesture } from '../../../../base/browser/touch.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localChatSessionType } from '../common/chatSessionsService.js';
import { ChatClosedPromoNotification } from '../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../common/languageModels.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from './chat.js';
import { ChatClosedPromo, CHAT_CLOSED_PROMO_TREATMENT } from './chatClosedPromo.js';
import { DISMISSED_PROMOS_STORAGE_KEY } from './chatPromoNotification.js';
import { addDismissedNotificationId } from './widget/input/chatInputNotificationService.js';
import { getModelProviderIcon } from './widget/input/modelPicker/modelProviderIcons.js';
import './media/chatPromoWidget.css';

export { CHAT_CLOSED_PROMO_TREATMENT };

export const CHAT_PROMO_TRY_MODEL_COMMAND_ID = '_chat.tryPromoModel';
export const CHAT_PROMO_DISMISS_COMMAND_ID = '_chat.dismissPromo';

type ChatPromoWidgetTelemetryEvent = {
	promoId: string;
};

type ChatPromoWidgetTelemetryClassification = {
	promoId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the model promo shown on the collapsed-chat card.' };
	owner: 'rfeltis';
	comment: 'Tracks collapsed-chat promo card visibility and user dismissals.';
};

type ChatPromoWidgetActionTelemetryEvent = ChatPromoWidgetTelemetryEvent & {
	action: 'tryModel';
};

type ChatPromoWidgetActionTelemetryClassification = {
	promoId: ChatPromoWidgetTelemetryClassification['promoId'];
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken on the collapsed-chat promo card.' };
	owner: 'rfeltis';
	comment: 'Tracks actions taken from the collapsed-chat promo card.';
};

interface IChatPromoCardInput {
	readonly title: string;
	readonly subtitle?: string;
	readonly promoId: string;
	readonly tryLabel: string;
	readonly modelIdentifier: string;
	readonly providerIcon?: string;
}

/**
 * Collapsed-chat Copilot-icon pip and promo card.
 */
export class ChatPromoWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPromoWidget';

	private static idCounter = 0;

	private pendingPayload: IChatPromoCardInput | undefined;
	private pipAnchor: HTMLElement | undefined;
	private readonly iconHoverBlock = this._register(new MutableDisposable());
	private readonly pipRetry = this._register(new MutableDisposable());
	private readonly pipObserver = this._register(new MutableDisposable());
	private readonly pipInput = this._register(new MutableDisposable());
	private readonly closedPromo: ChatClosedPromo;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.closedPromo = this._register(instantiationService.createInstance(ChatClosedPromo));

		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID, async (_accessor, modelIdentifier?: string) => {
			await this.openChatAndSwitchModel(typeof modelIdentifier === 'string' ? modelIdentifier : undefined);
		}));
		this._register(CommandsRegistry.registerCommand(CHAT_PROMO_DISMISS_COMMAND_ID, (_accessor, promoId?: string) => {
			this.disarmChatPromo();
			if (typeof promoId === 'string') {
				addDismissedNotificationId(this.storageService, DISMISSED_PROMOS_STORAGE_KEY, promoId);
			}
		}));
		this._register(dom.addDisposableListener(this.layoutService.mainContainer, 'click', e => this.onWorkbenchClick(e), true));
		this._register(dom.addDisposableListener(this.layoutService.mainContainer, 'keydown', e => this.onWorkbenchKeyDown(e), true));
		this._register(this.layoutService.onDidLayoutMainContainer(() => this.syncPip()));
		this._register(this.closedPromo.onDidChange(() => this.syncPip()));
		this.syncPip();
	}

	/**
	 * Arms a closed-Chat treatment from {@link ChatClosedPromo}. Additional
	 * treatments branch here once decided.
	 */
	private syncPip(): void {
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		const decision = this.closedPromo.getDecision(!!anchor?.getClientRects().length);
		if (!decision) {
			if (this.pendingPayload) {
				this.disarmChatPromo();
			}
			return;
		}

		// Branch on treatment as additional closed-Chat surfaces are added.
		let payload: IChatPromoCardInput | undefined;
		if (decision.treatment === ChatClosedPromoNotification.CopilotIconPopup) {
			payload = this.promoCardPayload(decision.model);
		}

		if (payload) {
			if (!equals(this.pendingPayload, payload)) {
				this.armChatPromo(payload);
			}
			return;
		}
		if (this.pendingPayload) {
			this.disarmChatPromo();
		}
	}

	private promoCardPayload(model: ILanguageModelChatMetadataAndIdentifier): IChatPromoCardInput | undefined {
		const promo = model.metadata.promo;
		if (!promo) {
			return undefined;
		}
		return {
			title: promo.message.replace(/\.+$/, ''),
			subtitle: ILanguageModelChatMetadata.getPromoEndsAtLabel(promo.endsAt)?.replace(/\.+$/, ''),
			promoId: promo.id,
			tryLabel: localize('chat.promo.tryModel', "Try {0}", model.metadata.name),
			modelIdentifier: model.identifier,
			providerIcon: getModelProviderIcon(model).id,
		};
	}

	private async openChatAndSwitchModel(modelIdentifier: string | undefined): Promise<void> {
		const targetHarness = this.targetHarnessForModel(modelIdentifier);
		await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
		let widget = await this.chatWidgetService.revealWidget();
		widget?.focusInput();
		if (widget) {
			await this.whenSessionResolved(widget);
		}
		const sessionResource = widget?.viewModel?.sessionResource;
		const currentHarness = sessionResource ? getChatSessionType(sessionResource) : undefined;
		if (currentHarness !== targetHarness) {
			await this.commandService.executeCommand(`workbench.action.chat.openNewChatSessionInPlace.${targetHarness}`, 'sidebar');
			widget = await this.chatWidgetService.revealWidget() ?? widget;
			widget?.focusInput();
		}
		if (!modelIdentifier || !widget) {
			return;
		}
		if (!widget.input.switchModelByIdentifier(modelIdentifier, true, true)) {
			await widget.input.requestModelByIdentifier(modelIdentifier);
		}
	}

	private async whenSessionResolved(widget: IChatWidget): Promise<void> {
		if (widget.viewModel?.sessionResource) {
			return;
		}
		const store = new DisposableStore();
		try {
			await new Promise<void>(resolve => {
				store.add(widget.onDidChangeViewModel(() => {
					if (widget.viewModel?.sessionResource) {
						resolve();
					}
				}));
				store.add(disposableTimeout(resolve, 2000));
			});
		} finally {
			store.dispose();
		}
	}

	private targetHarnessForModel(modelIdentifier: string | undefined): string {
		if (!modelIdentifier) {
			return localChatSessionType;
		}
		const meta = this.languageModelsService.lookupLanguageModel(modelIdentifier);
		return meta?.targetChatSessionType ?? localChatSessionType;
	}

	private armChatPromo(payload: IChatPromoCardInput): void {
		this.pendingPayload = payload;
		this.hoverService.hideHover(true);
		this.blockIconHover();
		this.renderPip();
	}

	private disarmChatPromo(): void {
		this.pendingPayload = undefined;
		this.iconHoverBlock.clear();
		this.pipRetry.clear();
		this.pipInput.clear();
		this.clearPip();
	}

	private blockIconHover(): void {
		const store = new DisposableStore();
		this.iconHoverBlock.value = store;
		const doc = this.layoutService.mainContainer.ownerDocument;
		const stopIfOnIcon = (e: Event) => {
			const anchor = findChatIconAnchor(this.layoutService.mainContainer);
			const target = e.target;
			if (!anchor || !(target instanceof Node) || !anchor.contains(target)) {
				return;
			}
			e.stopImmediatePropagation();
			this.hoverService.hideHover();
		};
		store.add(dom.addDisposableListener(doc, 'mouseover', stopIfOnIcon, true));
		store.add(dom.addDisposableListener(doc, 'mouseenter', stopIfOnIcon, true));
		store.add(dom.addDisposableListener(doc, 'pointerover', stopIfOnIcon, true));
	}

	private renderPip(): void {
		this.clearPip();
		this.pipRetry.clear();
		this.pipInput.clear();
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		if (!anchor) {
			const win = this.layoutService.mainContainer.ownerDocument.defaultView;
			if (!win) {
				return;
			}
			const retry = win.setTimeout(() => {
				if (this.pendingPayload && !this.pipAnchor) {
					this.renderPip();
				}
			}, 250);
			this.pipRetry.value = toDisposable(() => win.clearTimeout(retry));
			return;
		}

		this.pipAnchor = anchor;
		this.applyPipIcon(anchor);

		const observer = new (dom.getWindow(anchor).MutationObserver)(() => {
			if (!this.pendingPayload) {
				return;
			}
			if (!this.pipAnchor?.isConnected) {
				this.renderPip();
				return;
			}
			this.applyPipIcon(this.pipAnchor);
		});
		observer.observe(anchor.parentElement!, { childList: true, subtree: true });
		this.pipObserver.value = toDisposable(() => observer.disconnect());

		const input = new DisposableStore();
		this.pipInput.value = input;
		input.add(Gesture.addTarget(anchor));
		input.add(dom.addDisposableListener(anchor, GestureEventType.Tap, e => this.onPipActivate(e), true));
	}

	private applyPipIcon(anchor: HTMLElement): void {
		const icon = findCopilotIcon(anchor);
		if (icon instanceof HTMLElement && !icon.classList.contains('codicon-copilot-dot')) {
			if (!icon.dataset['chatPromoBaseClass']) {
				icon.dataset['chatPromoBaseClass'] = icon.className;
			}
			icon.classList.remove('codicon-copilot', 'codicon-copilot-warning', 'codicon-copilot-unavailable', 'codicon-copilot-snooze');
			for (const cls of ThemeIcon.asClassNameArray(Codicon.copilotDot)) {
				icon.classList.add(cls);
			}
		}
		this.applyPipAccessibleName(anchor);
	}

	private applyPipAccessibleName(anchor: HTMLElement): void {
		if (!this.pendingPayload) {
			return;
		}
		const promoLabel = localize('chat.promo.pipAria', "{0}. Open the sale offer.", this.pendingPayload.title);
		for (const el of [anchor, ...anchor.querySelectorAll<HTMLElement>('[aria-label]')]) {
			if (el.dataset['chatPromoBaseAriaLabel'] === undefined) {
				el.dataset['chatPromoBaseAriaLabel'] = el.getAttribute('aria-label') ?? '';
			}
			el.setAttribute('aria-label', promoLabel);
		}
	}

	private restorePipAccessibleName(anchor: HTMLElement): void {
		const restore = (el: HTMLElement) => {
			if (el.dataset['chatPromoBaseAriaLabel'] === undefined) {
				return;
			}
			const base = el.dataset['chatPromoBaseAriaLabel'];
			if (base) {
				el.setAttribute('aria-label', base);
			} else {
				el.removeAttribute('aria-label');
			}
			delete el.dataset['chatPromoBaseAriaLabel'];
		};
		restore(anchor);
		for (const el of anchor.querySelectorAll<HTMLElement>('[data-chat-promo-base-aria-label]')) {
			restore(el);
		}
	}

	private clearPip(): void {
		this.pipObserver.clear();
		if (this.pipAnchor) {
			const icon = findCopilotIcon(this.pipAnchor);
			if (icon instanceof HTMLElement) {
				const base = icon.dataset['chatPromoBaseClass'];
				if (base) {
					icon.className = base;
					delete icon.dataset['chatPromoBaseClass'];
				} else {
					icon.classList.remove(...ThemeIcon.asClassNameArray(Codicon.copilotDot));
				}
			}
			this.restorePipAccessibleName(this.pipAnchor);
		}
		this.pipAnchor = undefined;
	}

	private onWorkbenchClick(e: MouseEvent): void {
		this.onPipActivate(e);
	}

	private onWorkbenchKeyDown(e: KeyboardEvent): void {
		const keyEvent = new StandardKeyboardEvent(e);
		if (keyEvent.keyCode !== KeyCode.Enter && keyEvent.keyCode !== KeyCode.Space) {
			return;
		}
		this.onPipActivate(e);
	}

	private onPipActivate(e: Event): void {
		if (!this.pendingPayload) {
			return;
		}
		const target = e.target;
		if (!(target instanceof Node)) {
			return;
		}
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		if (!anchor || !anchor.contains(target)) {
			return;
		}
		dom.EventHelper.stop(e, true);
		this.showChatPromo(this.pendingPayload);
	}

	private showChatPromo(info: IChatPromoCardInput): void {
		const contentDisposables = new DisposableStore();
		const content = this.buildContent(info, contentDisposables);
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		const inStatusbar = !!anchor?.closest('.part.statusbar');

		const hover = this.hoverService.showInstantHover({
			content,
			target: {
				targetElements: [anchor ?? this.layoutService.mainContainer],
				dispose: () => contentDisposables.dispose()
			},
			additionalClasses: ['chat-promo-widget-hover'],
			persistence: { sticky: true },
			appearance: { showPointer: !!anchor, compact: true, maxHeightRatio: 1 },
			position: { hoverPosition: inStatusbar ? HoverPosition.ABOVE : HoverPosition.BELOW },
			trapFocus: true,
		}, true);
		if (!hover) {
			// Keep the pip armed so a locked/blocked hover does not permanently dismiss the sale.
			contentDisposables.dispose();
			return;
		}
		this.persistOnIconClick(info);
		this.telemetryService.publicLog2<ChatPromoWidgetTelemetryEvent, ChatPromoWidgetTelemetryClassification>('chatPromoWidgetShown', { promoId: info.promoId });
	}

	private persistOnIconClick(info: IChatPromoCardInput): void {
		this.disarmChatPromo();
		void this.commandService.executeCommand(CHAT_PROMO_DISMISS_COMMAND_ID, info.promoId);
	}

	private buildContent(info: IChatPromoCardInput, disposables: DisposableStore): HTMLElement {
		const container = dom.$('.chat-promo-widget');
		const titleId = `chat-promo-widget-title-${ChatPromoWidgetContribution.idCounter++}`;
		container.setAttribute('role', 'dialog');
		container.setAttribute('aria-labelledby', titleId);

		const body = dom.append(container, dom.$('.body'));
		const header = dom.append(body, dom.$('.header'));
		const hero = dom.append(header, dom.$('.hero'));
		const iconEl = dom.append(hero, dom.$(ThemeIcon.asCSSSelector(this.providerThemeIcon(info))));
		iconEl.classList.add('provider-icon');
		iconEl.setAttribute('aria-hidden', 'true');
		const copy = dom.append(hero, dom.$('.copy'));
		const titleRow = dom.append(copy, dom.$('.title-row'));
		const titleEl = dom.append(titleRow, dom.$('.title'));
		titleEl.id = titleId;
		titleEl.textContent = info.title;

		const closeButton = dom.append(titleRow, dom.$('button.close')) as HTMLButtonElement;
		closeButton.setAttribute('aria-label', localize('chatPromo.close', "Close"));
		const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
		closeIcon.setAttribute('aria-hidden', 'true');
		disposables.add(dom.addDisposableListener(closeButton, 'click', () => {
			this.telemetryService.publicLog2<ChatPromoWidgetTelemetryEvent, ChatPromoWidgetTelemetryClassification>('chatPromoWidgetDismissed', { promoId: info.promoId });
			this.hoverService.hideHover(true);
		}));

		if (info.subtitle) {
			const subtitleEl = dom.append(copy, dom.$('.subtitle'));
			subtitleEl.textContent = info.subtitle;
		}

		const buttonBar = dom.append(body, dom.$('.button-bar'));
		const button = disposables.add(new Button(buttonBar, { ...defaultButtonStyles }));
		button.label = info.tryLabel;
		disposables.add(button.onDidClick(() => {
			this.telemetryService.publicLog2<ChatPromoWidgetActionTelemetryEvent, ChatPromoWidgetActionTelemetryClassification>('chatPromoWidgetAction', {
				promoId: info.promoId,
				action: 'tryModel',
			});
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
				'workbenchActionExecuted',
				{ id: CHAT_PROMO_TRY_MODEL_COMMAND_ID, from: 'chatPromoWidget' }
			);
			this.hoverService.hideHover(true);
			void this.commandService.executeCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID, info.modelIdentifier);
		}));

		return container;
	}

	private providerThemeIcon(info: IChatPromoCardInput): ThemeIcon {
		return (info.providerIcon ? ThemeIcon.fromId(info.providerIcon) : undefined) ?? Codicon.sparkle;
	}

	override dispose(): void {
		this.disarmChatPromo();
		super.dispose();
	}
}

function findCopilotIcon(anchor: HTMLElement): Element | null {
	return anchor.querySelector('.codicon-copilot-dot, .codicon-copilot, .codicon-copilot-warning, .codicon-copilot-unavailable, .codicon-copilot-snooze');
}

export function findChatIconAnchor(container: HTMLElement): HTMLElement | undefined {
	const doc = container.ownerDocument;
	const statusEntry = doc.getElementById('chat.statusBarEntry') ?? doc.getElementById('status.chat.statusBarEntry');
	if (statusEntry instanceof HTMLElement) {
		return statusEntry;
	}

	const statusIcon = doc.querySelector('.part.statusbar .codicon-copilot, .part.statusbar .codicon-copilot-warning, .part.statusbar .codicon-copilot-unavailable');
	if (statusIcon instanceof HTMLElement) {
		return statusIcon.closest('.statusbar-item') instanceof HTMLElement
			? statusIcon.closest('.statusbar-item') as HTMLElement
			: statusIcon;
	}

	return undefined;
}

