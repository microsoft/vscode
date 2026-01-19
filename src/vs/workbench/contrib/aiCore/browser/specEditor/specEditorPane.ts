/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Kiro 风格 Spec 编辑器面板
// 显示 Requirements → Design → Task list 的完整工作流

import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { SpecEditorViewModel, SpecTab, renderSpecEditorHTML } from './specEditorView.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IWebviewService, IWebview, WebviewMessageReceivedEvent } from '../../../../contrib/webview/browser/webview.js';

export class SpecEditorPane extends Disposable {
	static readonly ID = 'workbench.panel.specEditor';

	private _webview: IWebview | undefined;
	private _viewModel: SpecEditorViewModel | undefined;
	private readonly _disposables = new DisposableStore();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.logService.info('[SpecEditorPane] Initializing...');
	}

	async createWebview(container: HTMLElement): Promise<void> {
		// 创建 ViewModel
		this._viewModel = this.instantiationService.createInstance(SpecEditorViewModel);

		// 创建 Webview
		this._webview = this.webviewService.createWebviewElement({
			providedViewType: 'specEditor',
			title: 'Spec Editor',
			options: {},
			contentOptions: {
				allowScripts: true
			},
			extension: undefined
		});

		// 获取 webview 的 DOM 元素并添加到容器
		const webviewElement = (this._webview as unknown as { container?: HTMLElement }).container;
		if (webviewElement) {
			container.appendChild(webviewElement);
		}

		// 初始渲染
		this.updateContent();

		// 监听状态变化
		this._disposables.add(this._viewModel.onDidChangeState(() => {
			this.updateContent();
		}));

		// 监听 webview 消息
		this._disposables.add(this._webview.onMessage(async (event: WebviewMessageReceivedEvent) => {
			const message = event.message as { type: string; tab?: SpecTab; action?: string; taskId?: string };
			await this.handleMessage(message);
		}));
	}

	private updateContent(): void {
		if (!this._webview || !this._viewModel) return;

		const html = renderSpecEditorHTML(this._viewModel.state);
		this._webview.setHtml(html);
	}

	private async handleMessage(message: { type: string; tab?: SpecTab; action?: string; taskId?: string }): Promise<void> {
		if (!this._viewModel) return;

		switch (message.type) {
			case 'tabChange':
				if (message.tab) {
					this._viewModel.setActiveTab(message.tab);
				}
				break;

			case 'taskAction':
				if (message.taskId && message.action) {
					switch (message.action) {
						case 'start':
							await this._viewModel.executeTask(message.taskId);
							break;
						case 'retry':
							await this._viewModel.retryTask(message.taskId);
							break;
						case 'view_changes':
							this.logService.info(`[SpecEditorPane] View changes for task ${message.taskId}`);
							// TODO: 打开 diff 视图
							break;
						case 'view_execution':
							this.logService.info(`[SpecEditorPane] View execution for task ${message.taskId}`);
							// TODO: 打开执行日志
							break;
					}
				}
				break;
		}
	}

	override dispose(): void {
		this._disposables.dispose();
		this._webview?.dispose();
		this._viewModel?.dispose();
		super.dispose();
	}
}
