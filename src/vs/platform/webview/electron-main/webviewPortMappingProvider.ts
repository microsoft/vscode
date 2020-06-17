/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol, session } from 'electron';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IAddress } from 'vs/platform/remote/common/remoteAgentConnection';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { IWebviewPortMapping, WebviewPortMappingManager } from 'vs/platform/webview/common/webviewPortMapping';
import { webviewPartitionId } from 'vs/platform/webview/common/resourceLoader';

interface PortMappingData {
	readonly extensionLocation: URI | undefined;
	readonly mappings: readonly IWebviewPortMapping[];
	readonly resolvedAuthority: IAddress | null | undefined;
}

export class WebviewPortMappingProvider extends Disposable {

	private readonly _webviewData = new Map<string, {
		readonly webContentsId: number;
		readonly manager: WebviewPortMappingManager;
		metadata: PortMappingData;
	}>();

	private _webContentsIdsToWebviewIds = new Map<number, /* id */ string>();

	constructor(
		@ITunnelService private readonly _tunnelService: ITunnelService,
	) {
		super();

		const sess = session.fromPartition(webviewPartitionId);
		sess.webRequest.onBeforeRequest(async (details, callback) => {
			const webviewId = details.webContentsId && this._webContentsIdsToWebviewIds.get(details.webContentsId);
			if (!webviewId) {
				return callback({});
			}

			const entry = this._webviewData.get(webviewId);
			if (!entry || !entry.metadata.resolvedAuthority) {
				return callback({});
			}

			const redirect = await entry.manager.getRedirect(entry.metadata.resolvedAuthority, details.url);
			return callback(redirect ? { redirectURL: redirect } : {});
		});

		this._register(toDisposable(() => protocol.unregisterProtocol(Schemas.vscodeWebviewResource)));
	}

	public async registerWebview(id: string, webContentsId: number, metadata: PortMappingData): Promise<void> {
		const manager = new WebviewPortMappingManager(
			() => this._webviewData.get(id)?.metadata.extensionLocation,
			() => this._webviewData.get(id)?.metadata.mappings || [],
			this._tunnelService);

		this._webviewData.set(id, { webContentsId, metadata, manager });
		this._webContentsIdsToWebviewIds.set(webContentsId, id);
	}

	public unregisterWebview(id: string): void {
		const existing = this._webviewData.get(id);
		if (existing) {
			existing.manager.dispose();
			this._webviewData.delete(id);
			this._webContentsIdsToWebviewIds.delete(existing.webContentsId);
		}
	}

	public async updateWebviewMetadata(id: string, metadataDelta: Partial<PortMappingData>): Promise<void> {
		const entry = this._webviewData.get(id);
		if (entry) {
			this._webviewData.set(id, {
				...entry,
				...metadataDelta,
			});
		}
	}
}
