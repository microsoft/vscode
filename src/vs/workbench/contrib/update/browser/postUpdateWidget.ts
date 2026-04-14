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
		const maxWidth = 550;
		const x = Math.max(clientWidth - maxWidth - 80, 16);

		this.hoverService.showInstantHover({
			content: this.buildContent(info, contentDisposables),
			target: {
				targetElements: [target],
				x,
				y: 40,
				dispose: () => contentDisposables.dispose()
			},
			persistence: { sticky: true },
			appearance: { showPointer: false, compact: true, maxHeightRatio: 0.8 },
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

	private buildContent({ markdown, buttons }: IParsedUpdateInfoInput, disposables: DisposableStore): HTMLElement {
		const container = dom.$('.post-update-widget');

		// Header
		const header = dom.append(container, dom.$('.header'));
		const title = dom.append(header, dom.$('.title'));
		title.textContent = localize('postUpdate.title', "New in {0}", this.productService.version);

		// Markdown
		const markdownContainer = dom.append(container, dom.$('.update-markdown'));
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

		// Buttons
		if (buttons?.length) {
			const buttonBar = dom.append(container, dom.$('.button-bar'));
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
