/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IErdosRenderMessage, RendererMetadata, StaticPreloadMetadata } from '../../notebook/browser/view/renderers/webviewMessages.js';
import { preloadsScriptStr } from '../../notebook/browser/view/renderers/webviewPreloads.js';
import { INotebookRendererInfo, RENDERER_NOT_AVAILABLE, RendererMessagingSpec } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { NotebookOutputWebview } from './notebookOutputWebview.js';
import { INotebookOutputWebview, IErdosNotebookOutputWebviewService } from './notebookOutputWebviewService.js';
import { IWebviewService, WebviewInitInfo } from '../../webview/browser/webview.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { ILanguageRuntimeMessageWebOutput } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { dirname } from '../../../../base/common/resources.js';
import { INotebookRendererMessagingService } from '../../notebook/common/notebookRendererMessagingService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { webviewMessageCodeString } from '../../erdosWebviewPreloads/browser/notebookOutputUtils.js';

type MessageRenderInfo = {
	mimeType: string;
	renderer: INotebookRendererInfo;
	output: ILanguageRuntimeMessageWebOutput;
};

export class ErdosNotebookOutputWebviewService implements IErdosNotebookOutputWebviewService {

	readonly _serviceBrand: undefined;

	constructor(
		@IWebviewService private readonly _webviewService: IWebviewService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@INotebookRendererMessagingService private readonly _notebookRendererMessagingService: INotebookRendererMessagingService,
		@ILogService private _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
	}

	private _findRenderersForOutputs(outputs: ILanguageRuntimeMessageWebOutput[]): MessageRenderInfo[] {
		return outputs
			.map(output => {
				const info = this._findRendererForOutput(output);
				if (!info) {
					this._logService.warn(
						'Failed to find renderer for output with mime types: ' +
						Object.keys(output.data).join(', ') +
						'/nOutput will be ignored.'
					);
				}
				return info;
			})
			.filter((info): info is MessageRenderInfo => Boolean(info));
	}

	private _findRendererForOutput(output: ILanguageRuntimeMessageWebOutput, viewType?: string): MessageRenderInfo | undefined {
		const mimeTypes = this._notebookService.getMimeTypeInfo(
			viewType, undefined, Object.keys(output.data)
		);
		const pickedMimeType = mimeTypes.find(
			mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE && mimeType.isTrusted
		);
		if (!pickedMimeType) {
			return;
		}

		const renderer = this._notebookService.getRendererInfo(pickedMimeType.rendererId);
		if (!renderer) {
			return;
		}

		return { mimeType: pickedMimeType.mimeType, renderer, output };
	}

	async createMultiMessageWebview({
		runtimeId,
		preReqMessages,
		displayMessage,
		viewType
	}: {
		runtimeId: string;
		preReqMessages: ILanguageRuntimeMessageWebOutput[];
		displayMessage: ILanguageRuntimeMessageWebOutput;
		viewType?: string;
	}): Promise<INotebookOutputWebview | undefined> {

		const displayInfo = this._findRendererForOutput(displayMessage);
		if (!displayInfo) {
			this._logService.error(
				'Failed to find renderer for output message with mime types: ' +
				Object.keys(displayMessage.data).join(', ') +
				'.'
			);
			return undefined;
		}
		return this.createNotebookRenderOutput({
			id: displayMessage.id,
			runtimeId,
			displayMessageInfo: displayInfo,
			preReqMessagesInfo: this._findRenderersForOutputs(preReqMessages),
			viewType,
		});
	}

	async createNotebookOutputWebview(
		{ id, runtime, output, viewType }:
			{
				id: string;
				runtime: ILanguageRuntimeSession;
				output: ILanguageRuntimeMessageWebOutput;
				viewType?: string;
			}
	): Promise<INotebookOutputWebview | undefined> {
		for (const mimeType of Object.keys(output.data)) {
			if (mimeType === 'text/plain' ||
				mimeType === 'image/png') {
				continue;
			}

			const renderer = this._notebookService.getPreferredRenderer(mimeType);
			if (renderer) {
				return this.createNotebookRenderOutput({
					id,
					runtimeId: runtime.sessionId,
					displayMessageInfo: { mimeType, renderer, output },
					viewType,
				});
			}
		}

		return Promise.resolve(undefined);
	}

	private getRendererData(): RendererMetadata[] {
		return this._notebookService.getRenderers()
			.map((renderer): RendererMetadata => {
				const entrypoint = {
					extends: renderer.entrypoint.extends,
					path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
				};
				return {
					id: renderer.id,
					entrypoint,
					mimeTypes: renderer.mimeTypes,
					messaging: renderer.messaging !== RendererMessagingSpec.Never,
					isBuiltin: renderer.isBuiltin
				};
			});
	}

	private asWebviewUri(uri: URI, fromExtension: URI | undefined) {
		return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : undefined);
	}

	private async getStaticPreloadsData(viewType: string | undefined):
		Promise<StaticPreloadMetadata[]> {
		if (!viewType) {
			return [];
		}
		const preloads = this._notebookService.getStaticPreloads(viewType);
		return Array.from(preloads, preload => {
			return {
				entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation)
					.toString()
					.toString()
			};
		});
	}

	private getResourceRoots(
		messages: ILanguageRuntimeMessageWebOutput[],
		viewType: string | undefined,
	): URI[] {

		const resourceRoots = new Array<URI>();

		for (const renderer of this._notebookService.getRenderers()) {
			resourceRoots.push(dirname(renderer.entrypoint.path));
		}

		if (viewType) {
			for (const preload of this._notebookService.getStaticPreloads(viewType)) {
				resourceRoots.push(dirname(preload.entrypoint));

				resourceRoots.push(...preload.localResourceRoots);
			}
		}

		for (const message of messages) {
			if (message.resource_roots) {
				for (const root of message.resource_roots) {
					resourceRoots.push(URI.revive(root));
				}
			}
		}
		return resourceRoots;
	}

	private async createNotebookRenderOutput({
		id,
		runtimeId,
		displayMessageInfo,
		preReqMessagesInfo,
		viewType
	}: {
		id: string;
		runtimeId: string;
		displayMessageInfo: MessageRenderInfo;
		preReqMessagesInfo?: MessageRenderInfo[];
		viewType?: string;
	}): Promise<INotebookOutputWebview> {

		const messagesInfo = [...preReqMessagesInfo ?? [], displayMessageInfo];

		const preloads = preloadsScriptStr({
			outputNodeLeftPadding: 0,
			outputNodePadding: 0,
			tokenizationCss: '',
		}, {
			dragAndDropEnabled: false
		}, {
			lineLimit: 1000,
			outputScrolling: true,
			outputWordWrap: false,
			linkifyFilePaths: false,
			minimalError: false,
		},
			this.getRendererData(),
			await this.getStaticPreloadsData(viewType),
			this._workspaceTrustManagementService.isWorkspaceTrusted(),
			id);

		const webviewInitInfo: WebviewInitInfo = {
			origin: DOM.getActiveWindow().origin,
			contentOptions: {
				allowScripts: true,
				allowMultipleAPIAcquire: true,
				localResourceRoots: this.getResourceRoots(messagesInfo.map(info => info.output), viewType),
			},
			extension: {
				id: displayMessageInfo.renderer.extensionId,
			},
			options: {
				retainContextWhenHidden: true,
			},
			title: '',
		};

		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);

		webview.setHtml(`
<head>
	<style nonce="${id}">
		#_defaultColorPalatte {
			color: var(--vscode-editor-findMatchHighlightBackground);
			background-color: var(--vscode-editor-findMatchBackground);
		}
	</style>
	${ErdosNotebookOutputWebviewService.CssAddons}
	<script>
		window.prompt = (message, _default) => {
			return _default ?? 'Untitled';
		};
		${webviewMessageCodeString}
	</script>
</head>
<body>
<div id='container'></div>
<div id="_defaultColorPalatte"></div>
<script type="module">${preloads}</script>
				</body>
					`);

		const scopedRendererMessaging = this._notebookRendererMessagingService.getScoped(id);

		const notebookOutputWebview = this._instantiationService.createInstance(
			NotebookOutputWebview,
			{
				id,
				sessionId: runtimeId,
				webview,
				rendererMessaging: scopedRendererMessaging
			},
		);

		notebookOutputWebview.onDidInitialize(() => {
			for (let i = 0; i < messagesInfo.length; i++) {
				const { output: message, mimeType, renderer } = messagesInfo[i];
				const data = message.data[mimeType];
				const valueBytes = typeof (data) === 'string' ? VSBuffer.fromString(data) :
					VSBuffer.fromString(JSON.stringify(data));
				const transfer: ArrayBuffer[] = [];
				const webviewMessage: IErdosRenderMessage = {
					type: 'erdosRender',
					outputId: message.id,
					elementId: `erdos-container-${i}`,
					rendererId: renderer.id,
					mimeType,
					metadata: message.metadata,
					valueBytes: valueBytes.buffer,
				};
				webview.postMessage(webviewMessage, transfer);
			}
		});

		return notebookOutputWebview;
	}

	static readonly CssAddons = `
<style>
	.vega-actions a:not([download]) {
		display: none;
	}

	div:has(> .bk-notebook-logo) {
		display: none;
	}
</style>`;
}
