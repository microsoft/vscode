/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DefaultQuickAccessFilterValue, IQuickAccessProvider, IQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickPick, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { resolveImageEditorAttachContext } from '../../chat/browser/chatAttachmentResolve.js';
import { IChatRequestVariableEntry } from '../../chat/common/chatModel.js';
import { IMcpResource, IMcpServer, IMcpService, McpCapability } from '../common/mcpTypes.js';

export class McpResourcePickHelper {
	public static sep(server: IMcpServer): IQuickPickSeparator {
		return {
			id: server.definition.id,
			type: 'separator',
			label: server.definition.label,
		};
	}

	public static item(resource: IMcpResource): IQuickPickItem {
		return {
			id: resource.uri.toString(),
			label: resource.name,
			description: resource.description,
			detail: resource.mcpUri + (resource.sizeInBytes !== undefined ? ' (' + ByteSize.formatSize(resource.sizeInBytes) + ')' : ''),
		};
	}

	public hasServersWithResources = derived(reader => {
		let enabled = false;
		for (const server of this._mcpService.servers.read(reader)) {
			const cap = server.capabilities.get();
			if (cap === undefined) {
				enabled = true; // until we know more
			} else if (cap & McpCapability.Resources) {
				enabled = true;
				break;
			}
		}

		return enabled;
	});

	constructor(
		@IMcpService private readonly _mcpService: IMcpService,
		@IFileService private readonly _fileService: IFileService,
		@IDialogService private readonly _dialogService: IDialogService,
	) { }

	public async toAttachment(resource: IMcpResource): Promise<IChatRequestVariableEntry> {
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

	public getPicks(onChange: (value: Map<IMcpServer, IMcpResource[]>) => void, token?: CancellationToken) {
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(toDisposable(() => cts.dispose(true)));

		const servers = new Map<IMcpServer, IMcpResource[]>();
		const addServerResources = async (server: IMcpServer, writeInto: IMcpResource[]) => {
			for await (const page of server.resources(cts.token)) {
				for (const resource of page) {
					writeInto.push(resource);
				}
				onChange(servers);
			}
		};

		// Enumerate servers and start servers that need to be started to get capabilities
		return Promise.all(this._mcpService.servers.get().map(async server => {
			let cap = server.capabilities.get();
			const arr: IMcpResource[] = [];
			servers.set(server, arr); // always add it to retain order

			if (cap === undefined) {
				cap = await new Promise(resolve => {
					server.start();
					store.add(cts.token.onCancellationRequested(() => resolve(undefined)));
					store.add(autorun(reader => {
						const cap2 = server.capabilities.read(reader);
						if (cap2 !== undefined) {
							resolve(cap2);
						}
					}));
				});
			}

			if (cap && (cap & McpCapability.Resources)) {
				await addServerResources(server, arr);
			}
		})).finally(() => {
			store.dispose();
		});
	}
}

export class McpResourceQuickAccess implements IQuickAccessProvider {
	public static readonly PREFIX = 'mcpr';

	defaultFilterValue = DefaultQuickAccessFilterValue.LAST;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) { }

	provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		picker.canAcceptInBackground = true;
		picker.busy = true;

		type ResourceQuickPickItem = IQuickPickItem & { resource: IMcpResource };

		const chatWidget = this._chatWidgetService.lastFocusedWidget;
		const attachButton = localize('mcp.quickaccess.attach', "Attach to chat");

		const helper = this._instantiationService.createInstance(McpResourcePickHelper);
		helper.getPicks(servers => {
			const items: (ResourceQuickPickItem | IQuickPickSeparator)[] = [];
			for (const [server, resources] of servers) {
				items.push(McpResourcePickHelper.sep(server));
				for (const resource of resources) {
					const pickItem = McpResourcePickHelper.item(resource);
					if (chatWidget) {
						pickItem.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.attach), tooltip: attachButton }];
					}
					items.push({ ...pickItem, resource });
				}
			}
			picker.items = items;
		}, token).finally(() => {
			picker.busy = false;
		});

		const store = new DisposableStore();
		store.add(picker.onDidTriggerItemButton(event => {
			if (event.button.tooltip === attachButton && chatWidget) {
				picker.busy = true;
				helper.toAttachment((event.item as ResourceQuickPickItem).resource).then(a => {
					chatWidget.attachmentModel.addContext(a);
					picker.hide();
				});
			}
		}));

		store.add(picker.onDidAccept(event => {
			if (!event.inBackground) {
				picker.hide(); // hide picker unless we accept in background
			}

			if (runOptions?.handleAccept) {
				runOptions.handleAccept?.(picker.activeItems[0], event.inBackground);
			} else {
				const [item] = picker.selectedItems;
				this._editorService.openEditor({ resource: URI.parse(item.id!), options: { preserveFocus: event.inBackground } });
			}
		}));

		return store;
	}
}
