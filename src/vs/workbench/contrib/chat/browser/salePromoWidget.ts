/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import './media/salePromoWidget.css';

export const SHOW_SALE_PROMO_COMMAND_ID = '_chat.showSalePromo';
export const ARM_SALE_PROMO_COMMAND_ID = '_chat.armSalePromo';
export const DISARM_SALE_PROMO_COMMAND_ID = '_chat.disarmSalePromo';

const SALE_PROMO_PENDING_CLASS = 'sale-promo-pending';

interface ISalePromoFeature {
	readonly icon?: string;
	readonly title: string;
	readonly description: string;
}

interface ISalePromoButton {
	readonly label: string;
	readonly commandId: string;
	readonly args?: unknown[];
	readonly style?: 'primary' | 'secondary';
}

interface ISalePromoCardInput {
	readonly markdown?: string;
	readonly badge?: string;
	readonly title?: string;
	readonly subtitle?: string;
	readonly providerIcon?: string;
	readonly features?: readonly ISalePromoFeature[];
	readonly dismissCommandId?: string;
	readonly dismissArgs?: unknown[];
	readonly buttons?: readonly ISalePromoButton[];
}

/**
 * Sale promo card copied from the post-update widget so the treatment UI can
 * be iterated independently. Anchored to the Copilot status/title-bar icon.
 */
export class SalePromoWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.salePromoWidget';

	private static idCounter = 0;

	private pendingPayload: string | undefined;
	private pipEl: HTMLElement | undefined;
	private pipOriginalClass: string | undefined;
	private readonly iconHoverBlock = this._register(new MutableDisposable());

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._register(CommandsRegistry.registerCommand(SHOW_SALE_PROMO_COMMAND_ID, (_accessor, payload?: string) => this.showSalePromo(payload)));
		this._register(CommandsRegistry.registerCommand(ARM_SALE_PROMO_COMMAND_ID, (_accessor, payload?: string) => this.armSalePromo(payload)));
		this._register(CommandsRegistry.registerCommand(DISARM_SALE_PROMO_COMMAND_ID, () => this.disarmSalePromo()));
		this._register(dom.addDisposableListener(this.layoutService.mainContainer, 'click', e => this.onWorkbenchClick(e), true));
	}

	private armSalePromo(payload?: string): void {
		if (typeof payload !== 'string' || !parseSalePromoPayload(payload)) {
			return;
		}
		this.pendingPayload = payload;
		this.saleHost().classList.add(SALE_PROMO_PENDING_CLASS);
		this.hoverService.hideHover(true);
		this.blockIconHover();
		this.renderPip();
	}

	private disarmSalePromo(): void {
		this.pendingPayload = undefined;
		this.saleHost().classList.remove(SALE_PROMO_PENDING_CLASS);
		this.iconHoverBlock.clear();
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
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		if (!anchor) {
			const retry = this.layoutService.mainContainer.ownerDocument.defaultView?.setTimeout(() => {
				if (this.pendingPayload && !this.pipEl) {
					this.renderPip();
				}
			}, 250);
			if (typeof retry === 'number') {
				this._register(toDisposable(() => this.layoutService.mainContainer.ownerDocument.defaultView?.clearTimeout(retry)));
			}
			return;
		}
		const icon = anchor.querySelector('.codicon-copilot, .codicon-copilot-warning, .codicon-copilot-unavailable, .codicon-copilot-snooze');
		if (!(icon instanceof HTMLElement)) {
			return;
		}
		this.pipOriginalClass = icon.className;
		icon.classList.remove('codicon-copilot', 'codicon-copilot-warning', 'codicon-copilot-unavailable', 'codicon-copilot-snooze');
		for (const cls of ThemeIcon.asClassNameArray(Codicon.copilotDot)) {
			icon.classList.add(cls);
		}
		this.pipEl = icon;
	}

	private clearPip(): void {
		if (this.pipEl && this.pipOriginalClass) {
			this.pipEl.className = this.pipOriginalClass;
		}
		this.pipEl = undefined;
		this.pipOriginalClass = undefined;
	}

	private saleHost(): HTMLElement {
		return this.layoutService.mainContainer.closest('.monaco-workbench') ?? this.layoutService.mainContainer;
	}

	private onWorkbenchClick(e: MouseEvent): void {
		if (!this.pendingPayload) {
			return;
		}
		const target = e.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const anchor = findChatIconAnchor(this.layoutService.mainContainer);
		if (!anchor || !anchor.contains(target)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		this.showSalePromo(this.pendingPayload);
	}

	private hidePip(): void {
		this.saleHost().classList.remove(SALE_PROMO_PENDING_CLASS);
		this.clearPip();
	}

	private showSalePromo(payload?: string): void {
		const info = parseSalePromoPayload(payload);
		if (!info) {
			return;
		}
		this.hidePip();
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
		if (!info.dismissCommandId) {
			return;
		}
		void this.commandService.executeCommand(info.dismissCommandId, ...(info.dismissArgs ?? []));
	}

	private buildContent(info: ISalePromoCardInput, disposables: DisposableStore): HTMLElement {
		const { markdown, buttons, badge, title, subtitle, features, providerIcon } = info;
		const container = dom.$('.sale-promo-widget');
		const titleId = `sale-promo-widget-title-${SalePromoWidgetContribution.idCounter++}`;
		container.setAttribute('role', 'dialog');
		container.setAttribute('aria-labelledby', titleId);

		const body = dom.append(container, dom.$('.body'));
		const header = dom.append(body, dom.$('.header'));
		const hero = dom.append(header, dom.$('.hero'));
		const providerMark = resolveProviderMark(providerIcon);
		if (providerMark) {
			const iconEl = dom.append(hero, createProviderMark(providerMark));
			iconEl.classList.add('provider-icon');
			iconEl.style.width = '24px';
			iconEl.style.height = '24px';
			iconEl.style.fontSize = '24px';
			iconEl.style.lineHeight = '1';
			iconEl.setAttribute('aria-hidden', 'true');
		} else {
			dom.append(hero, dom.$('.provider-icon-spacer'));
		}
		const copy = dom.append(hero, dom.$('.copy'));
		const titleRow = dom.append(copy, dom.$('.title-row'));
		if (badge) {
			const badgeEl = dom.append(titleRow, dom.$('.badge'));
			badgeEl.textContent = badge;
		}
		const titleEl = dom.append(titleRow, dom.$('.title'));
		titleEl.id = titleId;
		titleEl.textContent = title ?? localize('salePromo.title', "Limited-time model offer");

		const closeButton = dom.append(titleRow, dom.$('button.close')) as HTMLButtonElement;
		closeButton.setAttribute('aria-label', localize('salePromo.close', "Close"));
		const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
		closeIcon.setAttribute('aria-hidden', 'true');
		disposables.add(dom.addDisposableListener(closeButton, 'click', () => {
			this.hoverService.hideHover(true);
		}));

		if (subtitle) {
			const subtitleEl = dom.append(copy, dom.$('.subtitle'));
			subtitleEl.textContent = subtitle;
		}

		if (features?.length) {
			const list = dom.append(body, dom.$('.features'));
			list.setAttribute('role', 'list');
			for (const feature of features) {
				const row = dom.append(list, dom.$('.feature'));
				row.setAttribute('role', 'listitem');
				const themeIcon = ThemeIcon.fromString(feature.icon ?? '') ?? ThemeIcon.fromId(feature.icon || Codicon.sparkle.id);
				const iconEl = dom.append(row, dom.$(ThemeIcon.asCSSSelector(themeIcon)));
				iconEl.classList.add('feature-icon');
				iconEl.setAttribute('aria-hidden', 'true');
				const text = dom.append(row, dom.$('.feature-text'));
				if (feature.title) {
					const featureTitle = dom.append(text, dom.$('.feature-title'));
					featureTitle.textContent = feature.title;
				}
				if (feature.description) {
					const featureDescription = dom.append(text, dom.$('.feature-description'));
					const rendered = disposables.add(this.markdownRendererService.render(
						new MarkdownString(feature.description, {
							isTrusted: true,
							supportThemeIcons: true,
						}),
						{
							actionHandler: (link, mdStr) => {
								openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
								this.hoverService.hideHover(true);
							},
						}));
					featureDescription.appendChild(rendered.element);
				}
			}
		} else if (markdown) {
			const markdownContainer = dom.append(body, dom.$('.update-markdown'));
			const rendered = disposables.add(this.markdownRendererService.render(
				new MarkdownString(markdown, {
					isTrusted: true,
					supportHtml: true,
					supportThemeIcons: true,
				}),
				{
					actionHandler: (link, mdStr) => {
						openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
						this.hoverService.hideHover(true);
					},
				}));
			markdownContainer.appendChild(rendered.element);
		}

		if (buttons?.length) {
			const buttonBar = dom.append(body, dom.$('.button-bar'));
			let seenSecondary = false;

			for (const { label, style, commandId, args } of buttons) {
				const button = dom.append(buttonBar, dom.$('button')) as HTMLButtonElement;
				button.textContent = label;

				if (style === 'secondary') {
					button.classList.add('update-button-secondary');
					if (!seenSecondary && buttons.length > 1) {
						button.classList.add('update-button-leading-secondary');
						seenSecondary = true;
					}
				} else {
					button.classList.add('update-button-primary');
				}

				disposables.add(dom.addDisposableListener(button, 'click', () => {
					this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
						'workbenchActionExecuted',
						{ id: commandId, from: 'salePromoWidget' }
					);

					this.hoverService.hideHover(true);
					void this.commandService.executeCommand(commandId, ...(args ?? []));
				}));
			}
		}

		return container;
	}
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
		if (parsed && (parsed.title || parsed.markdown || parsed.features?.length)) {
			return parsed;
		}
	} catch {
		return { markdown: payload };
	}

	return undefined;
}

type SaleProviderMark = 'microsoft' | 'openai' | 'claude' | 'gemini' | 'kimi' | 'xai' | 'copilot';

function resolveProviderMark(providerIcon: string | undefined): SaleProviderMark | undefined {
	const value = (providerIcon ?? '').toLowerCase();
	if (value.includes('microsoft') || value.includes('mai')) {
		return 'microsoft';
	}
	if (value.includes('openai') || value.includes('gpt')) {
		return 'openai';
	}
	if (value.includes('claude') || value.includes('anthropic')) {
		return 'claude';
	}
	if (value.includes('gemini') || value.includes('google')) {
		return 'gemini';
	}
	if (value.includes('kimi') || value.includes('moonshot')) {
		return 'kimi';
	}
	if (value.includes('xai') || value.includes('grok')) {
		return 'xai';
	}
	if (value.includes('copilot')) {
		return 'copilot';
	}
	return undefined;
}

function createProviderMark(mark: SaleProviderMark): HTMLElement {
	if (mark === 'microsoft') {
		return createMicrosoftMark();
	}
	const iconName = mark === 'gemini' ? 'google-gemini' : mark === 'copilot' ? 'copilot-compact' : mark;
	const icon = ThemeIcon.fromString(`$(${iconName})`) ?? Codicon.sparkle;
	return dom.$(ThemeIcon.asCSSSelector(icon));
}

function createMicrosoftMark(): HTMLElement {
	const wrap = document.createElement('span');
	wrap.classList.add('microsoft-mark');
	for (const fill of ['#F25022', '#7FBA00', '#00A4EF', '#FFB900']) {
		const tile = document.createElement('span');
		tile.classList.add('microsoft-mark-tile');
		tile.style.backgroundColor = fill;
		wrap.appendChild(tile);
	}
	return wrap;
}
