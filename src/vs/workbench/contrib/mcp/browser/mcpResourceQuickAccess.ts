/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { DefaultQuickAccessFilterValue, IQuickAccessProvider, IQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../chat/browser/chatAttachmentResolveService.js';
import { IChatRequestVariableEntry } from '../../chat/common/chatVariableEntries.js';
import { IMcpResource, IMcpResourceTemplate, IMcpServer, IMcpService, isMcpResourceTemplate, McpCapability, McpConnectionState, McpResourceURI } from '../common/mcpTypes.js';
import { IUriTemplateVariable } from '../common/uriTemplate.js';
import { openPanelChatAndGetWidget } from './openPanelChatAndGetWidget.js';

export class McpResourcePickHelper {
	public static sep(server: IMcpServer): IQuickPickSeparator {
		return {
			id: server.definition.id,
			type: 'separator',
			label: server.definition.label,
		};
	}

	public static item(resource: IMcpResource | IMcpResourceTemplate): IQuickPickItem {
		const iconPath = resource.icons.getUrl(22);
		if (isMcpResourceTemplate(resource)) {
			return {
				id: resource.template.template,
				label: resource.title || resource.name,
				description: resource.description,
				detail: localize('mcp.resource.template', 'Resource template: {0}', resource.template.template),
				iconPath,
			};
		}

		return {
			id: resource.uri.toString(),
			label: resource.title || resource.name,
			description: resource.description,
			detail: resource.mcpUri + (resource.sizeInBytes !== undefined ? ' (' + ByteSize.formatSize(resource.sizeInBytes) + ')' : ''),
			iconPath,
		};
	}

	public hasServersWithResources = derived(reader => {
		let enabled = false;
		for (const server of this._mcpService.servers.read(reader)) {
			const cap = server.capabilities.read(undefined);
			if (cap === undefined) {
				enabled = true; // until we know more
			} else if (cap & McpCapability.Resources) {
				enabled = true;
				break;
			}
		}

		return enabled;
	});

	public explicitServers?: IMcpServer[];

	constructor(
		@IMcpService private readonly _mcpService: IMcpService,
		@IFileService private readonly _fileService: IFileService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IChatAttachmentResolveService private readonly _chatAttachmentResolveService: IChatAttachmentResolveService
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
			const maybeUri = await this._resourceTemplateToURI(resource);
			return maybeUri && await this._verifyUriIfNeeded(maybeUri);
		} else {
			return resource.uri;
		}
	}

	private async _resourceToAttachment(resource: { uri: URI; name: string; mimeType?: string }): Promise<IChatRequestVariableEntry | undefined> {
		const asImage = await this._chatAttachmentResolveService.resolveImageEditorAttachContext(resource.uri, undefined, resource.mimeType);
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
		const maybeUri = await this._resourceTemplateToURI(rt);
		const uri = maybeUri && await this._verifyUriIfNeeded(maybeUri);
		return uri && this._resourceToAttachment({
			uri,
			name: rt.name,
			mimeType: rt.mimeType,
		});
	}

	private async _verifyUriIfNeeded({ uri, needsVerification }: { uri: URI; needsVerification: boolean }): Promise<URI | undefined> {
		if (!needsVerification) {
			return uri;
		}

		const exists = await this._fileService.exists(uri);
		if (exists) {
			return uri;
		}

		this._notificationService.warn(localize('mcp.resource.template.notFound', "The resource {0} was not found.", McpResourceURI.toServer(uri).resourceURL.toString()));
		return undefined;
	}

	private async _resourceTemplateToURI(rt: IMcpResourceTemplate) {
		const todo = rt.template.components.flatMap(c => typeof c === 'object' ? c.variables : []);

		const quickInput = this._quickInputService.createQuickPick();
		const cts = new CancellationTokenSource();

		const vars: Record<string, string | string[]> = {};
		quickInput.totalSteps = todo.length;
		quickInput.ignoreFocusOut = true;
		let needsVerification = false;

		try {
			for (let i = 0; i < todo.length; i++) {
				const variable = todo[i];
				const resolved = await this._promptForTemplateValue(quickInput, variable, vars, rt);
				if (resolved === undefined) {
					return undefined;
				}
				// mark the URI as needing verification if any part was not a completion pick
				needsVerification ||= !resolved.completed;
				vars[todo[i].name] = variable.repeatable ? resolved.value.split('/') : resolved.value;
			}
			return { uri: rt.resolveURI(vars), needsVerification };
		} finally {
			cts.dispose(true);
			quickInput.dispose();
		}
	}

	private _promptForTemplateValue(input: IQuickPick<IQuickPickItem>, variable: IUriTemplateVariable, variablesSoFar: Record<string, string | string[]>, rt: IMcpResourceTemplate): Promise<{ value: string; completed: boolean } | undefined> {
		const store = new DisposableStore();
		const completions = new Map<string, Promise<string[]>>([]);

		const variablesWithPlaceholders = { ...variablesSoFar };
		for (const variable of rt.template.components.flatMap(c => typeof c === 'object' ? c.variables : [])) {
			if (!variablesWithPlaceholders.hasOwnProperty(variable.name)) {
				variablesWithPlaceholders[variable.name] = `$${variable.name.toUpperCase()}`;
			}
		}

		let placeholder = localize('mcp.resource.template.placeholder', "Value for ${0} in {1}", variable.name.toUpperCase(), rt.template.resolve(variablesWithPlaceholders).replaceAll('%24', '$'));
		if (variable.optional) {
			placeholder += ' (' + localize('mcp.resource.template.optional', "Optional") + ')';
		}

		input.placeholder = placeholder;
		input.value = '';
		input.items = [];
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
				promise = rt.complete(variable.name, inputValue, variablesSoFar, changeCancellation.token);
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

		return new Promise<{ value: string; completed: boolean } | undefined>(resolve => {
			store.add(input.onDidHide(() => resolve(undefined)));
			store.add(input.onDidAccept(() => {
				const item = input.selectedItems[0];
				if (item.id === currentID) {
					resolve({ value: input.value, completed: false });
				} else if (variable.explodable && item.label.endsWith('/') && item.label !== input.value) {
					// if navigating in a path structure, picking a `/` should let the user pick in a subdirectory
					input.value = item.label;
				} else {
					resolve({ value: item.label, completed: true });
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
		}).finally(() => store.dispose());
	}

	public getPicks(onChange: (value: Map<IMcpServer, (IMcpResourceTemplate | IMcpResource)[]>) => void, token?: CancellationToken) {
		const cts = new CancellationTokenSource(token);
		const store = new DisposableStore();
		store.add(toDisposable(() => cts.dispose(true)));

		// We try to show everything in-sequence to avoid flickering (#250411) as long as
		// it loads within 5 seconds. Otherwise we just show things as the load in parallel.
		let showInSequence = true;
		store.add(disposableTimeout(() => {
			showInSequence = false;
			publish();
		}, 5_000));

		const publish = () => {
			const output = new Map<IMcpServer, (IMcpResourceTemplate | IMcpResource)[]>();
			for (const [server, rec] of servers) {
				const r: (IMcpResourceTemplate | IMcpResource)[] = [];
				output.set(server, r);
				if (rec.templates.isResolved) {
					r.push(...rec.templates.value!);
				} else if (showInSequence) {
					break;
				}

				r.push(...rec.resourcesSoFar);
				if (!rec.resources.isSettled && showInSequence) {
					break;
				}
			}
			onChange(output);
		};

		type Rec = { templates: DeferredPromise<IMcpResourceTemplate[]>; resourcesSoFar: IMcpResource[]; resources: DeferredPromise<unknown> };

		const servers = new Map<IMcpServer, Rec>();
		// Enumerate servers and start servers that need to be started to get capabilities
		return Promise.all((this.explicitServers || this._mcpService.servers.get()).map(async server => {
			let cap = server.capabilities.get();
			const rec: Rec = {
				templates: new DeferredPromise(),
				resourcesSoFar: [],
				resources: new DeferredPromise(),
			};
			servers.set(server, rec); // always add it to retain order

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
				await Promise.all([
					rec.templates.settleWith(server.resourceTemplates(cts.token).catch(() => [])).finally(publish),
					rec.resources.settleWith((async () => {
						for await (const page of server.resources(cts.token)) {
							rec.resourcesSoFar = rec.resourcesSoFar.concat(page);
							publish();
						}
					})())
				]);
			} else {
				rec.templates.complete([]);
				rec.resources.complete([]);
			}
			publish();
		})).finally(() => {
			store.dispose();
		});
	}
}


export abstract class AbstractMcpResourceAccessPick {
	constructor(
		private readonly _scopeTo: IMcpServer | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService protected readonly _chatWidgetService: IChatWidgetService,
		@IViewsService private readonly _viewsService: IViewsService,
	) { }

	protected applyToPick(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions) {
		picker.canAcceptInBackground = true;
		picker.busy = true;
		picker.keepScrollPosition = true;

		type ResourceQuickPickItem = IQuickPickItem & { resource: IMcpResource | IMcpResourceTemplate };

		const attachButton = localize('mcp.quickaccess.attach', "Attach to chat");

		const helper = this._instantiationService.createInstance(McpResourcePickHelper);
		if (this._scopeTo) {
			helper.explicitServers = [this._scopeTo];
		}
		helper.getPicks(servers => {
			const items: (ResourceQuickPickItem | IQuickPickSeparator)[] = [];
			for (const [server, resources] of servers) {
				items.push(McpResourcePickHelper.sep(server));
				for (const resource of resources) {
					const pickItem = McpResourcePickHelper.item(resource);
					pickItem.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.attach), tooltip: attachButton }];
					items.push({ ...pickItem, resource });
				}
			}
			picker.items = items;
		}, token).finally(() => {
			picker.busy = false;
		});

		const store = new DisposableStore();
		store.add(picker.onDidTriggerItemButton(event => {
			if (event.button.tooltip === attachButton) {
				picker.busy = true;
				helper.toAttachment((event.item as ResourceQuickPickItem).resource).then(async a => {
					if (a) {
						const widget = await openPanelChatAndGetWidget(this._viewsService, this._chatWidgetService);
						widget?.attachmentModel.addContext(a);
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

export class McpResourceQuickPick extends AbstractMcpResourceAccessPick {
	constructor(
		scopeTo: IMcpServer | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IViewsService viewsService: IViewsService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super(scopeTo, instantiationService, editorService, chatWidgetService, viewsService);
	}

	public async pick(token = CancellationToken.None) {
		const store = new DisposableStore();
		const qp = store.add(this._quickInputService.createQuickPick({ useSeparators: true }));
		qp.placeholder = localize('mcp.quickaccess.placeholder', "Search for resources");
		store.add(this.applyToPick(qp, token));
		store.add(qp.onDidHide(() => store.dispose()));
		qp.show();
		await Event.toPromise(qp.onDidHide);
	}
}

export class McpResourceQuickAccess extends AbstractMcpResourceAccessPick implements IQuickAccessProvider {
	public static readonly PREFIX = 'mcpr ';

	defaultFilterValue = DefaultQuickAccessFilterValue.LAST;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IViewsService viewsService: IViewsService,
	) {
		super(undefined, instantiationService, editorService, chatWidgetService, viewsService);
	}

	provide(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		return this.applyToPick(picker, token, runOptions);
	}
}
