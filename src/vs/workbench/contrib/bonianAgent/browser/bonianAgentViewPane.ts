/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, findParentWithClass, getWindow } from '../../../../base/browser/dom.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IWebviewService, IOverlayWebview, WebviewContentPurpose } from '../../webview/browser/webview.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { BonianAgentController } from './bonianAgentController.js';

export class BonianAgentViewPane extends ViewPane {
	private container!: HTMLElement;
	private webview?: IOverlayWebview;
	private rootContainer?: HTMLElement;
	private readonly webviewDisposables = this._register(new DisposableStore());
	private readonly timeoutDisposables = this._register(new DisposableStore());
	private controller?: BonianAgentController;

	private isWebviewReady = false;
	private pendingUri?: string;
	private repositionTimeout?: Timeout;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWebviewService private readonly webviewService: IWebviewService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.onDidChangeBodyVisibility(() => this.updateWebviewVisibility()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = append(container, $('.bonian-agent-container'));
		this.container.style.height = '100%';
		this.container.style.width = '100%';
		this.container.style.position = 'relative';

		if (!this.webview) {
			this.webview = this.webviewService.createWebviewOverlay({
				title: 'Bonian Agent',
				providedViewType: this.id,
				options: {
					enableFindWidget: false,
					purpose: WebviewContentPurpose.WebviewView
				},
				contentOptions: { allowScripts: true, allowMultipleAPIAcquire: true },
				extension: undefined
			});

			this.webviewDisposables.add(this.webview.onMessage(e => {
				if (e.message.command === 'ready') {
					this.isWebviewReady = true;
					if (this.pendingUri) {
						this.startPipeline(this.pendingUri);
						this.pendingUri = undefined;
					}
				}
			}));

			this.webviewDisposables.add(toDisposable(() => {
				this.webview?.release(this);
			}));

			this.webview.setHtml(this.getHtml());
		}

		this.layoutWebview();
		this.updateWebviewVisibility();
	}

	public async startPipeline(uri: string) {
		if (!this.isWebviewReady) {
			this.pendingUri = uri;
			return;
		}

		if (!this.webview) {
			return;
		}

		this.webview.postMessage({ command: 'reset' });
		this.webview.postMessage({ command: 'setFile', file: uri });

		if (!this.controller) {
			this.controller = this._register(this.instantiationService.createInstance(BonianAgentController));
		}

		const parsedUri = URI.parse(uri);
		await this.controller.processImage(parsedUri, (stage, status) => {
			this.webview?.postMessage({ command: 'setStage', stage, status });
		});
	}

	override onDidScrollRoot(): void {
		this.layoutWebview();
	}

	private getHtml(): string {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<style>
				body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 20px; overflow-x: hidden; }
				.header { font-size: 1.2rem; font-weight: bold; margin-bottom: 5px; }
				.file-name { font-size: 0.85rem; opacity: 0.7; margin-bottom: 25px; word-break: break-all; }
				.stepper { display: flex; flex-direction: column; position: relative; }
				.stepper::before { content: ''; position: absolute; left: 11px; top: 10px; bottom: 20px; width: 2px; background-color: var(--vscode-panel-border); z-index: 1; }
				.step { display: flex; align-items: center; margin-bottom: 25px; position: relative; z-index: 2; }
				.step-icon { width: 24px; height: 24px; border-radius: 50%; background-color: var(--vscode-editor-background); border: 2px solid var(--vscode-panel-border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 15px; }
				.step-label { font-size: 0.95rem; opacity: 0.6; }
				.step.loading .step-icon { border-color: var(--vscode-progressBar-background); color: var(--vscode-progressBar-background); }
				.step.loading .step-label { opacity: 1; color: var(--vscode-progressBar-background); }
				.step.success .step-icon { border-color: var(--vscode-testing-iconPassed); background-color: var(--vscode-testing-iconPassed); color: white; }
				.step.success .step-label { opacity: 1; }
			</style>
		</head>
		<body>
			<div class="header">Pipeline Status</div>
			<div class="file-name" id="fileName">Waiting for image...</div>
			<div class="stepper">
				<div class="step" id="step-1"><div class="step-icon">1</div><div class="step-label">Image → Structured Data</div></div>
				<div class="step" id="step-2"><div class="step-icon">2</div><div class="step-label">Data → PlantUML</div></div>
				<div class="step" id="step-3"><div class="step-icon">3</div><div class="step-label">Normalization</div></div>
				<div class="step" id="step-4"><div class="step-icon">4</div><div class="step-label">Code Generation</div></div>
				<div class="step" id="step-5"><div class="step-icon">5</div><div class="step-label">File System Integration</div></div>
			</div>
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', event => {
					const msg = event.data;
					if (msg.command === 'reset') {
						document.querySelectorAll('.step').forEach((el, i) => { el.className = 'step'; el.querySelector('.step-icon').innerText = i+1; });
					} else if (msg.command === 'setFile') {
						const parts = msg.file.split(/[\\\\/]/);
						document.getElementById('fileName').innerText = decodeURIComponent(parts[parts.length-1]);
					} else if (msg.command === 'setStage') {
						const el = document.getElementById('step-' + msg.stage);
						if (el) {
							el.className = 'step ' + msg.status;
							if (msg.status === 'success') el.querySelector('.step-icon').innerHTML = '✓';
						}
					}
				});
				vscode.postMessage({ command: 'ready' });
			</script>
		</body>
		</html>`;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.container) {
			this.container.style.height = `${height}px`;
			this.container.style.width = `${width}px`;
		}

		this.layoutWebview(new Dimension(width, height));
	}

	private updateWebviewVisibility(): void {
		if (!this.webview) {
			return;
		}

		if (this.isBodyVisible()) {
			this.webview.claim(this, getWindow(this.element), undefined);
			this.layoutWebview();
		} else {
			this.webview.release(this);
		}
	}

	private doLayoutWebview(dimension?: Dimension): void {
		if (!this.webview || !this.container) {
			return;
		}

		if (!this.rootContainer || !this.rootContainer.isConnected) {
			this.rootContainer = findParentWithClass(this.container, 'monaco-scrollable-element') ?? undefined;
		}

		this.webview.layoutWebviewOverElement(this.container, dimension, this.rootContainer);
	}

	private layoutWebview(dimension?: Dimension): void {
		this.doLayoutWebview(dimension);
		clearTimeout(this.repositionTimeout);
		this.repositionTimeout = setTimeout(() => this.doLayoutWebview(dimension), 200);
	}

	override dispose() {
		clearTimeout(this.repositionTimeout);
		this.timeoutDisposables.dispose();
		this.webviewDisposables.dispose();
		this.webview?.dispose();
		super.dispose();
	}
}
