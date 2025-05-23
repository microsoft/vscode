/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DefaultQuickAccessFilterValue, IQuickAccessProvider, IQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { resolveImageEditorAttachContext } from '../../chat/browser/chatAttachmentResolve.js';
import { IChatRequestVariableEntry } from '../../chat/common/chatModel.js';
import { IMcpResource, IMcpResourceTemplate, IMcpServer, IMcpService, isMcpResourceTemplate, McpCapability, McpConnectionState } from '../common/mcpTypes.js';
import { IUriTemplateVariable } from '../common/uriTemplate.js';

export class McpResourcePickHelper {
	public static sep(server: IMcpServer): IQuickPickSeparator {
		return {
			id: server.definition.id,
			type: 'separator',
			label: server.definition.label,
		};
	}

	public static item(resource: IMcpResource | IMcpResourceTemplate): IQuickPickItem {
		if (isMcpResourceTemplate(resource)) {
			return {
				id: resource.template.template,
				label: resource.name,
				description: resource.description,
				detail: localize('mcp.resource.template', 'Resource template: {0}', resource.template.template),
			};
		}

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
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) { }

	public async toAttachment(resource: IMcpResource | IMcpResourceTemplate): Promise<IChatRequestVariableEntry | undefined> {
		if (isMcpResourceTemplate(resource)) {
			return this._resourceTemplateToAttachment(resource);
		} else {
			return this._resourceToAttachment(resource);
		}
	}

	public async toURI(resource: IMcpResource | IMcpResourceTemplate): Promise<URI | undefined> {
		if (isMcpResourceTemplate(resource)) {
			return this._resourceTemplateToURI(resource);
		} else {
			return resource.uri;
		}
	}

	private async _resourceToAttachment(resource: { uri: URI; name: string; mimeType?: string }): Promise<IChatRequestVariableEntry | undefined> {
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

	private async _resourceTemplateToAttachment(rt: IMcpResourceTemplate) {
		const uri = await this._resourceTemplateToURI(rt);
		return uri && this._resourceToAttachment({
			uri,
			name: rt.name,
			mimeType: rt.mimeType,
		});
	}

	private async _resourceTemplateToURI(rt: IMcpResourceTemplate) {
		const todo = rt.template.components.flatMap(c => typeof c === 'object' ? c.variables : []);

		const quickInput = this._quickInputService.createQuickPick();
		const cts = new CancellationTokenSource();

		const vars: Record<string, string | string[]> = {};
		for (const variable of todo) {
			vars[variable.name] = `$${variable.name.toUpperCase()}`;
		}

		quickInput.totalSteps = todo.length;
		quickInput.ignoreFocusOut = true;

		const initialCompletions = todo.map(variable => rt.complete(variable.name, '', cts.token));

		try {
			for (let i = 0; i < todo.length; i++) {
				const variable = todo[i];
				const resolved = await this._promptForTemplateValue(quickInput, variable, initialCompletions[i], rt.template.resolve(vars), rt);
				if (resolved === undefined) {
					return undefined;
				}
				vars[todo[i].name] = variable.repeatable ? resolved.split('/') : resolved;
			}
			return rt.resolveURI(vars);
		} finally {
			cts.dispose(true);
			quickInput.dispose();
		}
	}

	private _promptForTemplateValue(input: IQuickPick<IQuickPickItem>, variable: IUriTemplateVariable, initialCompletions: Promise<string[]>, uriSoFar: string, rt: IMcpResourceTemplate): Promise<string | undefined> {
		const store = new DisposableStore();
		const completions = new Map<string, Promise<string[]>>([['', initialCompletions]]);

		let placeholder = localize('mcp.resource.template.placeholder', "Value for ${0} in {1}", variable.name.toUpperCase(), uriSoFar.replaceAll('%24', '$'));
		if (variable.optional) {
			placeholder += ' (' + localize('mcp.resource.template.optional', "Optional") + ')';
		}

		input.placeholder = placeholder;
		input.value = '';
		input.show();

		const currentID = generateUuid();
		const setItems = (value: string, completed: string[] = []) => {
			const items = completed.filter(c => c !== value).map(c => ({ id: c, label: c }));
			if (value) {
				items.unshift({ id: currentID, label: value });
			} else if (variable.optional) {
				items.unshift({ id: currentID, label: localize('mcp.resource.template.empty', "<Empty>") });
			}

			input.items = items;
		};

		let changeCancellation = store.add(new CancellationTokenSource());
		const getCompletionItems = () => {
			const inputValue = input.value;
			let promise = completions.get(inputValue);
			if (!promise) {
				promise = rt.complete(variable.name, inputValue, changeCancellation.token);
				completions.set(inputValue, promise);
			}

			promise.then(values => {
				if (!changeCancellation.token.isCancellationRequested) {
					setItems(inputValue, values);
				}
			}).catch(() => {
				completions.delete(inputValue);
			}).finally(() => {
				if (!changeCancellation.token.isCancellationRequested) {
					input.busy = false;
				}
			});
		};

		const getCompletionItemsScheduler = store.add(new RunOnceScheduler(getCompletionItems, 300));

		return new Promise(resolve => {
			store.add(input.onDidHide(() => resolve(undefined)));
			store.add(input.onDidAccept(() => {
				const item = input.selectedItems[0];
				if (item.id === currentID) {
					resolve(input.value);
				} else {
					resolve(item.label);
				}
			}));
			store.add(input.onDidChangeValue(value => {
				input.busy = true;
				changeCancellation.dispose(true);
				store.delete(changeCancellation);
				changeCancellation = store.add(new CancellationTokenSource());
				getCompletionItemsScheduler.cancel();
				setItems(value);

				if (completions.has(input.value)) {
					getCompletionItems();
				} else {
					getCompletionItemsScheduler.schedule();
				}
			}));

			getCompletionItems();
		});
	}

	public getPicks(onChange: (value: Map<IMcpServer, (IMcpResourceTemplate | IMcpResource)[]>) => void, token?: CancellationToken) {
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(toDisposable(() => cts.dispose(true)));

		const servers = new Map<IMcpServer, (IMcpResourceTemplate | IMcpResource)[]>();
		const addServerResources = async (server: IMcpServer, writeInto: (IMcpResourceTemplate | IMcpResource)[]) => {
			return Promise.all([
				(async () => {
					for await (const page of server.resources(cts.token)) {
						for (const resource of page) {
							writeInto.push(resource);
						}
						onChange(servers);
					}
				})(),
				server.resourceTemplates(cts.token).then(templates => {
					writeInto.unshift(...templates);
				}).catch(() => {
					// no templat support, not rare
				}),
			]);
		};

		// Enumerate servers and start servers that need to be started to get capabilities
		return Promise.all(this._mcpService.servers.get().map(async server => {
			let cap = server.capabilities.get();
			const arr: (IMcpResourceTemplate | IMcpResource)[] = [];
			servers.set(server, arr); // always add it to retain order

			if (cap === undefined) {
				cap = await new Promise(resolve => {
					server.start().then(state => {
						if (state.state === McpConnectionState.Kind.Error || state.state === McpConnectionState.Kind.Stopped) {
							resolve(undefined);
						}
					});
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

		type ResourceQuickPickItem = IQuickPickItem & { resource: IMcpResource | IMcpResourceTemplate };

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
					if (a) {
						chatWidget.attachmentModel.addContext(a);
					}
					picker.hide();
				});
			}
		}));

		store.add(picker.onDidAccept(async event => {
			if (!event.inBackground) {
				picker.hide(); // hide picker unless we accept in background
			}

			if (runOptions?.handleAccept) {
				runOptions.handleAccept?.(picker.activeItems[0], event.inBackground);
			} else {
				const [item] = picker.selectedItems;
				const uri = await helper.toURI((item as ResourceQuickPickItem).resource);
				if (uri) {
					this._editorService.openEditor({ resource: uri, options: { preserveFocus: event.inBackground } });
				}
			}
		}));

		return store;
	}
}
