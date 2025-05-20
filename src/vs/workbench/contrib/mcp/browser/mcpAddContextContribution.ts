/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { resolveImageEditorAttachContext } from '../../chat/browser/chatAttachmentResolve.js';
import { ChatContextPick, IChatContextPickService } from '../../chat/browser/chatContextPickService.js';
import { IChatRequestVariableEntry } from '../../chat/common/chatModel.js';
import { IMcpResource, IMcpServer, IMcpService, McpCapability } from '../common/mcpTypes.js';

export class McpAddContextContribution extends Disposable implements IWorkbenchContribution {
	private readonly _addContextMenu = this._register(new MutableDisposable());
	constructor(
		@IMcpService private readonly _mcpService: IMcpService,
		@IChatContextPickService private readonly _chatContextPickService: IChatContextPickService,
		@IFileService private readonly _fileService: IFileService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();


		this._register(autorun(reader => {
			let enabled = false;
			for (const server of _mcpService.servers.read(reader)) {
				const cap = server.capabilities.get();
				if (cap === undefined) {
					enabled = true; // until we know more
				} else if (cap & McpCapability.Resources) {
					enabled = true;
					break;
				}
			}

			if (enabled && !this._addContextMenu.value) {
				this._registerAddContextMenu();
			} else {
				this._addContextMenu.clear();
			}
		}));
	}

	private _registerAddContextMenu() {
		this._addContextMenu.value = this._chatContextPickService.registerChatContextItem({
			type: 'pickerPick',
			label: localize('mcp.addContext', "MCP Resources..."),
			icon: Codicon.tools, // todo@hawkticehurst/connor4312: use MCP icon when we get one
			asPicker: (widget) => ({
				placeholder: localize('mcp.addContext.placeholder', "Select MCP Resource..."),
				picks: this._getResourcePicks(),
			}),
		});
	}

	private _getResourcePicks() {
		const cts = new CancellationTokenSource();
		const store = new DisposableStore();
		store.add(toDisposable(() => cts.dispose(true)));

		return new AsyncIterableObject<ChatContextPick[]>(publish => {
			const servers = new Map<IMcpServer, IMcpResource[]>();
			const addServerResources = async (server: IMcpServer, writeInto: IMcpResource[]) => {
				for await (const page of server.resources(cts.token)) {
					for (const resource of page) {
						writeInto.push(resource);
					}
					publishContextPick();
				}
			};

			const publishContextPick = () => {
				const picks: ChatContextPick[] = [];
				for (const [server, resources] of servers) {
					if (resources.length === 0) {
						continue;
					}

					picks.push({
						id: server.definition.id,
						type: 'separator',
						label: server.definition.label,
					});

					for (const resource of resources) {
						picks.push({
							id: resource.uri.toString(),
							label: resource.name,
							description: resource.description,
							detail: resource.mcpUri + (resource.sizeInBytes !== undefined ? ' (' + ByteSize.formatSize(resource.sizeInBytes) + ')' : ''),
							asAttachment: () => this._mcpResourceToAttachment(resource),
						});
					}
				}
				publish.emitOne(picks);
			};

			// Enumerate servers and start servers that need to be started to get capabilities
			return Promise.all(this._mcpService.servers.get().map(async server => {
				let cap = server.capabilities.get();
				const arr: IMcpResource[] = [];
				servers.set(server, arr); // always add it to retain order

				if (cap === undefined) {
					await server.start();
					cap = server.capabilities.get();
				}

				if (cap && (cap & McpCapability.Resources)) {
					await addServerResources(server, arr);
				}
			}));
		}, () => store.dispose());
	}

	private async _mcpResourceToAttachment(resource: IMcpResource): Promise<IChatRequestVariableEntry> {
		const asImage = await resolveImageEditorAttachContext(this._fileService, this._dialogService, resource.uri, undefined, resource.mimeType);
		if (asImage) {
			return asImage;
		}

		return {
			id: resource.uri.toString(),
			kind: 'file',
			name: resource.name,
			value: resource.uri,
		};
	}
}
