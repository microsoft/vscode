/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { EventType as GestureEventType, Gesture } from '../../../../base/browser/touch.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import './media/salePromoWidget.css';

export const ARM_SALE_PROMO_COMMAND_ID = '_chat.armSalePromo';
export const DISARM_SALE_PROMO_COMMAND_ID = '_chat.disarmSalePromo';
export const CHAT_PROMO_TRY_MODEL_COMMAND_ID = '_chat.tryPromoModel';
export const CHAT_PROMO_DISMISS_COMMAND_ID = '_chat.dismissPromo';

interface ISalePromoCardInput {
	readonly title: string;
	readonly subtitle?: string;
	readonly promoId: string;
	readonly tryLabel: string;
	readonly modelIdentifier: string;
}

/**
 * Collapsed-chat Copilot-icon pip and sale card.
 */
export class SalePromoWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.salePromoWidget';

	private static idCounter = 0;

	private pendingPayload: string | undefined;
	private pipAnchor: HTMLElement | undefined;
	private readonly iconHoverBlock = this._register(new MutableDisposable());
	private readonly pipRetry = this._register(new MutableDisposable());
	private readonly pipObserver = this._register(new MutableDisposable());
	private readonly pipInput = this._register(new MutableDisposable());

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(ARM_SALE_PROMO_COMMAND_ID, (_accessor, payload?: string) => this.armSalePromo(payload)));
		this._register(CommandsRegistry.registerCommand(DISARM_SALE_PROMO_COMMAND_ID, () => this.disarmSalePromo()));
		this._register(dom.addDisposableListener(this.layoutService.mainContainer, 'click', e => this.onWorkbenchClick(e), true));
		this._register(dom.addDisposableListener(this.layoutService.mainContainer, 'keydown', e => this.onWorkbenchKeyDown(e), true));
	}

	private armSalePromo(payload?: string): void {
		if (typeof payload !== 'string' || !parseSalePromoPayload(payload)) {
			return;
		}
		this.pendingPayload = payload;
		this.hoverService.hideHover(true);
		this.blockIconHover();
		this.renderPip();
	}

	private disarmSalePromo(): void {
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

		const observer = new MutationObserver(() => {
			if (!this.pendingPayload) {
				return;
			}
			if (!this.pipAnchor?.isConnected) {
				this.renderPip();
				return;
			}
			this.applyPipIcon(this.pipAnchor);
		});
		observer.observe(anchor, { childList: true, subtree: true });
		this.pipObserver.value = toDisposable(() => observer.disconnect());

		const input = new DisposableStore();
		this.pipInput.value = input;
		input.add(Gesture.addTarget(anchor));
		input.add(dom.addDisposableListener(anchor, GestureEventType.Tap, e => this.onPipActivate(e), true));
	}

	private applyPipIcon(anchor: HTMLElement): void {
		const icon = findCopilotIcon(anchor);
		if (!(icon instanceof HTMLElement) || icon.classList.contains('codicon-copilot-dot')) {
			return;
		}
		if (!icon.dataset['salePromoBaseClass']) {
			icon.dataset['salePromoBaseClass'] = icon.className;
		}
		icon.classList.remove('codicon-copilot', 'codicon-copilot-warning', 'codicon-copilot-unavailable', 'codicon-copilot-snooze');
		for (const cls of ThemeIcon.asClassNameArray(Codicon.copilotDot)) {
			icon.classList.add(cls);
		}
	}

	private clearPip(): void {
		this.pipObserver.clear();
		if (this.pipAnchor) {
			const icon = findCopilotIcon(this.pipAnchor);
			if (icon instanceof HTMLElement) {
				const base = icon.dataset['salePromoBaseClass'];
				if (base) {
					icon.className = base;
					delete icon.dataset['salePromoBaseClass'];
				} else {
					icon.classList.remove(...ThemeIcon.asClassNameArray(Codicon.copilotDot));
				}
			}
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
		this.showSalePromo(this.pendingPayload);
	}

	private showSalePromo(payload?: string): void {
		const info = parseSalePromoPayload(payload);
		if (!info) {
			return;
		}
		this.clearPip();
		this.persistOnIconClick(info);

		const contentDisposables = new DisposableStore();
		const content = this.buildContent(info, contentDisposables);
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		const inStatusbar = !!anchor?.closest('.part.statusbar');

		this.hoverService.showInstantHover({
			content,
			target: {
				targetElements: [anchor ?? this.layoutService.mainContainer],
				dispose: () => contentDisposables.dispose()
			},
			additionalClasses: ['sale-promo-widget-hover'],
			persistence: { sticky: true },
			appearance: { showPointer: !!anchor, compact: true, maxHeightRatio: 1 },
			position: { hoverPosition: inStatusbar ? HoverPosition.ABOVE : HoverPosition.BELOW },
			trapFocus: true,
		}, true);
	}

	private persistOnIconClick(info: ISalePromoCardInput): void {
		this.disarmSalePromo();
		void this.commandService.executeCommand(CHAT_PROMO_DISMISS_COMMAND_ID, info.promoId);
	}

	private buildContent(info: ISalePromoCardInput, disposables: DisposableStore): HTMLElement {
		const container = dom.$('.sale-promo-widget');
		const titleId = `sale-promo-widget-title-${SalePromoWidgetContribution.idCounter++}`;
		container.setAttribute('role', 'dialog');
		container.setAttribute('aria-labelledby', titleId);

		const body = dom.append(container, dom.$('.body'));
		const header = dom.append(body, dom.$('.header'));
		const hero = dom.append(header, dom.$('.hero'));
		const iconEl = dom.append(hero, dom.$(ThemeIcon.asCSSSelector(Codicon.sparkle)));
		iconEl.classList.add('provider-icon');
		iconEl.setAttribute('aria-hidden', 'true');
		const copy = dom.append(hero, dom.$('.copy'));
		const titleRow = dom.append(copy, dom.$('.title-row'));
		const titleEl = dom.append(titleRow, dom.$('.title'));
		titleEl.id = titleId;
		titleEl.textContent = info.title;

		const closeButton = dom.append(titleRow, dom.$('button.close')) as HTMLButtonElement;
		closeButton.setAttribute('aria-label', localize('salePromo.close', "Close"));
		const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
		closeIcon.setAttribute('aria-hidden', 'true');
		disposables.add(dom.addDisposableListener(closeButton, 'click', () => {
			this.hoverService.hideHover(true);
		}));

		if (info.subtitle) {
			const subtitleEl = dom.append(copy, dom.$('.subtitle'));
			subtitleEl.textContent = info.subtitle;
		}

		const buttonBar = dom.append(body, dom.$('.button-bar'));
		const button = dom.append(buttonBar, dom.$('button.primary')) as HTMLButtonElement;
		button.textContent = info.tryLabel;
		disposables.add(dom.addDisposableListener(button, 'click', () => {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
				'workbenchActionExecuted',
				{ id: CHAT_PROMO_TRY_MODEL_COMMAND_ID, from: 'salePromoWidget' }
			);
			this.hoverService.hideHover(true);
			void this.commandService.executeCommand(CHAT_PROMO_TRY_MODEL_COMMAND_ID, info.modelIdentifier);
		}));

		return container;
	}
}

function findCopilotIcon(anchor: HTMLElement): Element | null {
	return anchor.querySelector('.codicon-copilot-dot, .codicon-copilot, .codicon-copilot-warning, .codicon-copilot-unavailable, .codicon-copilot-snooze');
}

function findChatIconAnchor(container: HTMLElement): HTMLElement | undefined {
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

function parseSalePromoPayload(payload?: string): ISalePromoCardInput | undefined {
	if (!payload) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(payload) as ISalePromoCardInput;
		if (parsed
			&& typeof parsed.title === 'string' && parsed.title
			&& typeof parsed.promoId === 'string' && parsed.promoId
			&& typeof parsed.tryLabel === 'string' && parsed.tryLabel
			&& typeof parsed.modelIdentifier === 'string' && parsed.modelIdentifier) {
			return parsed;
		}
	} catch {
		return undefined;
	}

	return undefined;
}
