/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/welcomeWidget';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { $, append, hide } from 'vs/base/browser/dom'; import { RunOnceScheduler } from 'vs/base/common/async';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { defaultButtonStyles, defaultDialogStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Action, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { localize } from 'vs/nls';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { LinkedText, parseLinkedText } from 'vs/base/common/linkedText';
import { Link } from 'vs/platform/opener/browser/link';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { generateUuid } from 'vs/base/common/uuid';
import { GettingStartedDetailsRenderer } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer';
import { FileAccess } from 'vs/base/common/network';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';

export class WelcomeWidget extends Disposable implements IOverlayWidget {

	private static readonly WIDGET_TIMEOUT: number = 15000;
	private static readonly WELCOME_MEDIA_PATH = 'vs/workbench/contrib/welcomeGettingStarted/common/media/';

	private readonly _rootDomNode: HTMLElement;
	private readonly element: HTMLElement;
	private readonly messageContainer: HTMLElement;
	private readonly markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly instantiationService: IInstantiationService,
		private readonly commandService: ICommandService,
		private readonly telemetryService: ITelemetryService,
		private readonly openerService: IOpenerService,
		private readonly webviewService: IWebviewService,
		private readonly detailsRenderer: GettingStartedDetailsRenderer
	) {
		super();
		this._rootDomNode = document.createElement('div');
		this._rootDomNode.className = 'welcome-widget';

		this.element = this._rootDomNode.appendChild($('.monaco-dialog-box'));
		this.element.setAttribute('role', 'dialog');

		hide(this._rootDomNode);

		this.messageContainer = this.element.appendChild($('.dialog-message-container'));
	}

	async executeCommand(commandId: string, ...args: string[]) {
		try {
			await this.commandService.executeCommand(commandId, ...args);
			this._hide(false);
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: commandId,
				from: 'welcomeWidget'
			});
		}
		catch (ex) {
		}
	}

	public async render(title: string, message: string, buttonText: string, buttonAction: string, media: { altText: string; path: string }) {
		if (!this._editor._getViewModel()) {
			return;
		}

		await this.buildWidgetContent(title, message, buttonText, buttonAction, media);
		this._editor.addOverlayWidget(this);
		this._revealTemporarily();
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: 'welcomeWidgetRendered',
			from: 'welcomeWidget'
		});
	}

	private async buildWidgetContent(title: string, message: string, buttonText: string, buttonAction: string, media: { altText: string; path: string }) {

		const actionBar = this._register(new ActionBar(this.element, {}));

		const action = this._register(new Action('dialog.close', localize('dialogClose', "Close Dialog"), ThemeIcon.asClassName(Codicon.dialogClose), true, async () => {
			this._hide(true);
		}));
		actionBar.push(action, { icon: true, label: false });

		if (media) {
			await this.buildSVGMediaComponent(media.path);
		}

		const renderBody = (message: string): MarkdownString => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown(message);
			return mds;
		};

		const titleElement = this.messageContainer.appendChild($('#monaco-dialog-message-detail.dialog-message-detail-title'));
		const titleElementMdt = this.markdownRenderer.render(renderBody(title));
		titleElement.appendChild(titleElementMdt.element);

		this.buildStepMarkdownDescription(this.messageContainer, message.split('\n').filter(x => x).map(text => parseLinkedText(text)));

		const buttonsRowElement = this.messageContainer.appendChild($('.dialog-buttons-row'));
		const buttonContainer = buttonsRowElement.appendChild($('.dialog-buttons'));

		const buttonBar = this._register(new ButtonBar(buttonContainer));
		const primaryButton = this._register(buttonBar.addButtonWithDescription({ title: true, secondary: false, ...defaultButtonStyles }));
		primaryButton.label = mnemonicButtonLabel(buttonText, true);

		this._register(primaryButton.onDidClick(async () => {
			await this.executeCommand(buttonAction);
		}));

		buttonBar.buttons[0].focus();
		this.applyStyles();
	}

	private buildStepMarkdownDescription(container: HTMLElement, text: LinkedText[]) {
		for (const linkedText of text) {
			const p = append(container, $('p'));
			for (const node of linkedText.nodes) {
				if (typeof node === 'string') {
					const labelWithIcon = renderLabelWithIcons(node);
					for (const element of labelWithIcon) {
						if (typeof element === 'string') {
							p.appendChild(renderFormattedText(element, { inline: true, renderCodeSegments: true }));
						} else {
							p.appendChild(element);
						}
					}
				} else {
					const link = this.instantiationService.createInstance(Link, p, node, {
						opener: (href: string) => {
							this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
								id: 'welcomeWidetLinkAction',
								from: 'welcomeWidget'
							});
							this.openerService.open(href, { allowCommands: true });
						}
					});
					this._register(link);
				}
			}
		}
		return container;
	}

	private async buildSVGMediaComponent(path: string) {

		const mediaContainer = this.messageContainer.appendChild($('.dialog-image-container'));
		mediaContainer.id = generateUuid();

		const webview = this._register(this.webviewService.createWebviewElement({ title: undefined, options: {}, contentOptions: {}, extension: undefined }));
		webview.mountTo(mediaContainer);

		const body = await this.detailsRenderer.renderSVG(FileAccess.asFileUri(`${WelcomeWidget.WELCOME_MEDIA_PATH}${path}`));
		webview.setHtml(body);
	}

	getId(): string {
		return 'editor.contrib.welcomeWidget';
	}

	getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
		};
	}

	private _hideSoon = this._register(new RunOnceScheduler(() => this._hide(false), WelcomeWidget.WIDGET_TIMEOUT));
	private _isVisible: boolean = false;

	private _revealTemporarily(): void {
		this._show();
		this._hideSoon.schedule();
	}

	private _show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._rootDomNode.style.display = 'block';
	}

	private _hide(isUserDismissed: boolean): void {
		if (!this._isVisible) {
			return;
		}

		this._isVisible = false;
		this._rootDomNode.style.display = 'none';
		this._editor.removeOverlayWidget(this);
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: isUserDismissed ? 'welcomeWidgetDismissed' : 'welcomeWidgetHidden',
			from: 'welcomeWidget'
		});
	}

	private applyStyles(): void {
		const style = defaultDialogStyles;

		const fgColor = style.dialogForeground;
		const bgColor = style.dialogBackground;
		const shadowColor = style.dialogShadow ? `0 0px 8px ${style.dialogShadow}` : '';
		const border = style.dialogBorder ? `1px solid ${style.dialogBorder}` : '';

		this._rootDomNode.style.boxShadow = shadowColor;

		this._rootDomNode.style.color = fgColor ?? '';
		this._rootDomNode.style.backgroundColor = bgColor ?? '';
		this._rootDomNode.style.border = border;
	}
}
