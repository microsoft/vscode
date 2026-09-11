/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../../base/browser/window.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentCanvas } from '../../../../../../platform/agentHost/common/meta/agentCanvasMeta.js';
import { BrowserViewStorageScope } from '../../../../../../platform/browserView/common/browserView.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';

/** Presents runtime-owned instances without giving Canvas pages a privileged client bridge. */
export class AgentHostCanvas extends Disposable {
	private _canvases = new Map<string, IAgentCanvas>();
	private readonly _seen = new Map<string, string | undefined>();
	private readonly _browsers = new Map<string, BrowserEditorInput>();
	private readonly _urls = new Map<string, string>();
	private _pending = Promise.resolve();

	constructor(
		private readonly _sessionResource: URI,
		private readonly _authority: string,
		private readonly _local: boolean,
		@IBrowserViewWorkbenchService private readonly _browserService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	get canvases(): readonly IAgentCanvas[] {
		return [...this._canvases.values()];
	}

	update(canvases: readonly IAgentCanvas[]): Promise<void> {
		this._canvases = new Map(canvases.map(canvas => [canvas.instanceId, canvas]));
		this._pending = this._pending.then(async () => {
			if (this._store.isDisposed) {
				return;
			}
			for (const id of this._seen.keys()) {
				if (!this._canvases.has(id)) {
					this._seen.delete(id);
				}
			}
			for (const [id, input] of this._browsers) {
				if (!this._canvases.has(id)) {
					input.dispose(true);
					this._browsers.delete(id);
					this._urls.delete(id);
					this._seen.delete(id);
				}
			}
			for (const canvas of this._canvases.values()) {
				if (!canvas.url || canvas.unavailable) {
					continue;
				}
				const first = !this._seen.has(canvas.instanceId) || this._seen.get(canvas.instanceId) !== canvas.revision;
				this._seen.set(canvas.instanceId, canvas.revision);
				const input = this._browsers.get(canvas.instanceId);
				if (first || (input && !input.isDisposed() && this._urls.get(canvas.instanceId) !== canvas.url)) {
					try {
						await this._open(canvas, false);
					} catch (error) {
						this._reportError(error);
					}
				}
			}
		}).catch(error => this._reportError(error));
		return this._pending;
	}

	open(instanceId: string): Promise<void> {
		this._pending = this._pending.then(async () => {
			const canvas = this._canvases.get(instanceId);
			if (!canvas || this._store.isDisposed) {
				throw new Error(localize('canvas.noLongerOpen', "This canvas is no longer open in the agent runtime."));
			}
			await this._open(canvas, true);
		}).catch(error => this._reportError(error));
		return this._pending;
	}

	private async _open(canvas: IAgentCanvas, reveal: boolean): Promise<void> {
		if (canvas.unavailable) {
			throw new Error(localize('canvas.unavailable', "The canvas provider is disconnected. Wait for it to reconnect before reopening the canvas."));
		}
		if (!this._local) {
			throw new Error(localize('canvas.remoteUnsupported', "Canvas rendering currently requires a local agent host. Remote Canvas URL forwarding is not yet supported."));
		}
		const url = canvas.url && URL.parse(canvas.url);
		if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
			throw new Error(localize('canvas.invalidUrl', "The canvas did not provide an HTTP or HTTPS URL."));
		}
		const id = `canvas-${encodeBase64(VSBuffer.fromString(JSON.stringify([mainWindow.vscodeWindowId, this._authority, canvas.chat, canvas.instanceId])), false, true)}`;
		let input = this._browsers.get(canvas.instanceId);
		if (!input || input.isDisposed()) {
			input = this._browserService.getKnownBrowserViews().get(id);
		}
		const existing = !!input;
		if (!input) {
			input = await this._browserService.createBrowserView({
				id,
				transient: true,
				owner: { type: 'agent', sessionId: this._sessionResource.toString() },
				session: { scope: BrowserViewStorageScope.Ephemeral },
			}, { preserveFocus: true });
			if (this._store.isDisposed || !this._canvases.has(canvas.instanceId)) {
				input.dispose(true);
				return;
			}
		}
		this._browsers.set(canvas.instanceId, input);
		if (!existing || this._urls.get(canvas.instanceId) !== canvas.url) {
			const model = await input.resolve();
			await model.loadURL(canvas.url!);
			if (this._store.isDisposed || !this._canvases.has(canvas.instanceId)) {
				return;
			}
			this._urls.set(canvas.instanceId, canvas.url!);
		}
		if (reveal) {
			await this._editorService.openEditor(input, { pinned: true }, await this._browserService.getPreferredGroup());
		}
	}

	private _reportError(error: unknown): void {
		this._logService.error('[AgentHostCanvas] Failed to render canvas', error);
		this._notificationService.error(localize('canvas.openFailed', "Unable to open the canvas in the Integrated Browser: {0}", error instanceof Error ? error.message : String(error)));
	}

	override dispose(): void {
		super.dispose();
		this._canvases.clear();
		this._browsers.clear();
		this._seen.clear();
		this._urls.clear();
	}
}
