/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ShowCurrentReleaseNotesActionId } from '../common/update.js';
import { IParsedUpdateInfoInput, parseUpdateInfoInput } from '../common/updateInfoParser.js';
import { getUpdateInfoUrl, isMajorMinorVersionChange } from '../common/updateUtils.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import './media/postUpdateWidget.css';

const LAST_KNOWN_VERSION_KEY = 'postUpdateWidget/lastKnownVersion';

interface ILastKnownVersion {
	readonly version: string;
	readonly commit: string | undefined;
	readonly timestamp: number;
}

/**
 * Displays post-update call-to-action widget after a version change is detected.
 */
export class PostUpdateWidgetContribution extends Disposable implements IWorkbenchContribution {

	private static idCounter = 0;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService private readonly hostService: IHostService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this._register(CommandsRegistry.registerCommand('_update.showUpdateInfo', (_accessor, markdown?: string) => this.showUpdateInfo(markdown)));
		void this.tryShowOnStartup();
	}

	private async tryShowOnStartup() {
		if (!await this.hostService.hadLastFocus()) {
			return;
		}

		if (!this.detectVersionChange()) {
			return;
		}

		if (this.configurationService.getValue<boolean>('update.showPostInstallInfo') === false) {
			return;
		}

		await this.showUpdateInfo();
	}

	private async showUpdateInfo(markdown?: string) {
		const info = await this.getUpdateInfo(markdown);
		if (!info) {
			return;
		}

		const contentDisposables = new DisposableStore();
		const target = this.layoutService.mainContainer;
		const { clientWidth } = target;
		const maxWidth = 420;
		const x = Math.max(clientWidth - maxWidth - 80, 16);

		this.hoverService.showInstantHover({
			content: this.buildContent(info, contentDisposables),
			target: {
				targetElements: [target],
				x,
				y: 40,
				dispose: () => contentDisposables.dispose()
			},
			additionalClasses: ['post-update-widget-hover'],
			persistence: { sticky: true },
			appearance: { showPointer: false, compact: true, maxHeightRatio: 1 },
			trapFocus: true,
		}, true);
	}

	private async getUpdateInfo(input?: string | null): Promise<IParsedUpdateInfoInput | undefined> {
		if (!input) {
			try {
				const url = getUpdateInfoUrl(this.productService.version);
				const context = await this.requestService.request({ url, callSite: 'postUpdateWidget' }, CancellationToken.None);
				input = await asTextOrError(context);
			} catch { }
		}

		if (!input) {
			return undefined;
		}

		let info = parseUpdateInfoInput(input);
		if (!info?.buttons?.length) {
			info = {
				...info, buttons: [{
					label: localize('postUpdate.releaseNotes', "Release Notes"),
					commandId: ShowCurrentReleaseNotesActionId,
					args: [this.productService.version],
					style: 'secondary'
				}]
			};
		}

		return info;
	}

	private buildContent(info: IParsedUpdateInfoInput, disposables: DisposableStore): HTMLElement {
		const { markdown, buttons, bannerImageUrl, badge, title, features } = info;
		const container = dom.$('.post-update-widget');
		const titleId = `post-update-widget-title-${PostUpdateWidgetContribution.idCounter++}`;
		container.setAttribute('role', 'dialog');
		container.setAttribute('aria-labelledby', titleId);
		// Escape-to-dismiss is handled by the hover widget itself (HoverWidget listens for Escape
		// on its container and disposes the hover).

		// Banner (decorative). Default is a CSS gradient; an image from the markdown frontmatter overrides it.
		const banner = dom.append(container, dom.$('.banner'));
		banner.setAttribute('aria-hidden', 'true');
		const safeBannerUrl = sanitizeBannerImageUrl(bannerImageUrl);
		if (safeBannerUrl) {
			// Use setProperty + JSON.stringify to safely quote the URL inside CSS without breaking out.
			banner.style.setProperty('background-image', `url(${JSON.stringify(safeBannerUrl)})`);
		}

		// Close button is a sibling of the banner so it isn't a focusable descendant of an aria-hidden region.
		const closeButton = dom.append(container, dom.$('button.banner-close')) as HTMLButtonElement;
		closeButton.setAttribute('aria-label', localize('postUpdate.close', "Close"));
		const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
		closeIcon.setAttribute('aria-hidden', 'true');
		disposables.add(dom.addDisposableListener(closeButton, 'click', () => {
			this.hoverService.hideHover(true);
		}));

		// Body
		const body = dom.append(container, dom.$('.body'));

		// Badge
		if (badge) {
			const badgeEl = dom.append(body, dom.$('.badge'));
			badgeEl.textContent = badge;
		}

		// Title
		const titleEl = dom.append(body, dom.$('.title'));
		titleEl.id = titleId;
		titleEl.textContent = title ?? localize('postUpdate.title', "New in {0}", this.productService.version);

		// Features (preferred) or markdown body
		if (features?.length) {
			const list = dom.append(body, dom.$('.features'));
			list.setAttribute('role', 'list');
			for (const feature of features) {
				const row = dom.append(list, dom.$('.feature'));
				row.setAttribute('role', 'listitem');
				const iconEl = dom.append(row, dom.$('.feature-icon'));
				const iconId = feature.icon ?? Codicon.sparkle.id;
				const themeIcon = ThemeIcon.fromId(iconId);
				iconEl.classList.add(...ThemeIcon.asClassNameArray(themeIcon));
				iconEl.setAttribute('aria-hidden', 'true');
				const text = dom.append(row, dom.$('.feature-text'));
				const featureTitle = dom.append(text, dom.$('.feature-title'));
				featureTitle.textContent = feature.title;
				const featureDescription = dom.append(text, dom.$('.feature-description'));
				// Render description as markdown so it can include inline links and emphasis.
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

		// Buttons
		if (buttons?.length) {
			const buttonBar = dom.append(body, dom.$('.button-bar'));
			const isSingleButton = buttons.length === 1;
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

				if (isSingleButton) {
					button.classList.add('update-button-full-width');
				}

				disposables.add(dom.addDisposableListener(button, 'click', () => {
					this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
						'workbenchActionExecuted',
						{ id: commandId, from: 'postUpdateWidget' }
					);

					void this.commandService.executeCommand(commandId, ...(args ?? []));
					this.hoverService.hideHover(true);
				}));
			}
		}

		return container;
	}

	private detectVersionChange(): boolean {
		let from: ILastKnownVersion | undefined;
		try {
			from = this.storageService.getObject(LAST_KNOWN_VERSION_KEY, StorageScope.APPLICATION);
		} catch { }

		const to: ILastKnownVersion = {
			version: this.productService.version,
			commit: this.productService.commit,
			timestamp: Date.now(),
		};

		if (from?.commit === to.commit) {
			return false;
		}

		this.storageService.store(LAST_KNOWN_VERSION_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);

		if (from) {
			return isMajorMinorVersionChange(from.version, to.version);
		}

		return false;
	}
}

/**
 * Validates a banner image URL from update info. Only `https:` and `data:image/*` schemes are
 * allowed to prevent CSS-injection or unexpected protocol handlers being invoked from the markdown payload.
 */
function sanitizeBannerImageUrl(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const uri = URI.parse(value, true);
		if (uri.scheme === 'https') {
			return uri.toString(true);
		}
		if (uri.scheme === 'data' && /^image\//i.test(uri.path)) {
			return uri.toString(true);
		}
	} catch {
		// fall through
	}
	return undefined;
}
