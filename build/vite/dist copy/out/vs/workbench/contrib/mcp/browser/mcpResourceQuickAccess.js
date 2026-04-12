/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DeferredPromise, disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { DefaultQuickAccessFilterValue } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../chat/browser/attachments/chatAttachmentResolveService.js';
import { IMcpService, isMcpResourceTemplate, McpResourceURI } from '../common/mcpTypes.js';
import { McpIcons } from '../common/mcpIcons.js';
import { openPanelChatAndGetWidget } from './openPanelChatAndGetWidget.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { asArray } from '../../../../base/common/arrays.js';
let McpResourcePickHelper = class McpResourcePickHelper extends Disposable {
    static sep(server) {
        return {
            id: server.definition.id,
            type: 'separator',
            label: server.definition.label,
        };
    }
    addCurrentMCPQuickPickItemLevel(server, resources) {
        let isValidPush = false;
        isValidPush = this._pickItemsStack.isEmpty();
        if (!isValidPush) {
            const stackedItem = this._pickItemsStack.peek();
            if (stackedItem?.server === server && stackedItem.resources === resources) {
                isValidPush = false;
            }
            else {
                isValidPush = true;
            }
        }
        if (isValidPush) {
            this._pickItemsStack.push({ server, resources });
        }
    }
    navigateBack() {
        const items = this._pickItemsStack.pop();
        if (items) {
            this._inDirectory.set({ server: items.server, resources: items.resources }, undefined);
            return true;
        }
        else {
            return false;
        }
    }
    static item(resource) {
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
    constructor(_mcpService, _fileService, _quickInputService, _notificationService, _chatAttachmentResolveService) {
        super();
        this._mcpService = _mcpService;
        this._fileService = _fileService;
        this._quickInputService = _quickInputService;
        this._notificationService = _notificationService;
        this._chatAttachmentResolveService = _chatAttachmentResolveService;
        this._resources = observableValue(this, { picks: new Map(), isBusy: true });
        this._pickItemsStack = new LinkedList();
        this._inDirectory = observableValue(this, undefined);
        this.hasServersWithResources = derived(reader => {
            let enabled = false;
            for (const server of this._mcpService.servers.read(reader)) {
                const cap = server.capabilities.read(undefined);
                if (cap === undefined) {
                    enabled = true; // until we know more
                }
                else if (cap & 16 /* McpCapability.Resources */) {
                    enabled = true;
                    break;
                }
            }
            return enabled;
        });
        this.checkIfNestedResources = () => !this._pickItemsStack.isEmpty();
    }
    /**
     * Navigate to a resource if it's a directory.
     * Returns true if the resource is a directory with children (navigation succeeded).
     * Returns false if the resource is a leaf file (no navigation).
     * When returning true, statefully updates the picker state to display directory contents.
     */
    async navigate(resource, server) {
        if (isMcpResourceTemplate(resource)) {
            return false;
        }
        const uri = resource.uri;
        let stat = undefined;
        try {
            stat = await this._fileService.resolve(uri, { resolveMetadata: false });
        }
        catch (e) {
            return false;
        }
        if (stat && this._isDirectoryResource(resource) && (stat.children?.length ?? 0) > 0) {
            // Save current state to stack before navigating
            const currentResources = this._resources.get().picks.get(server);
            if (currentResources) {
                this.addCurrentMCPQuickPickItemLevel(server, currentResources);
            }
            // Convert all the children to IMcpResource objects
            const childResources = stat.children.map(child => {
                const mcpUri = McpResourceURI.fromServer(server.definition, child.resource.toString());
                return {
                    uri: mcpUri,
                    mcpUri: child.resource.path,
                    name: child.name,
                    title: child.name,
                    description: resource.description,
                    mimeType: undefined,
                    sizeInBytes: child.size,
                    icons: McpIcons.fromParsed(undefined)
                };
            });
            this._inDirectory.set({ server, resources: childResources }, undefined);
            return true;
        }
        return false;
    }
    toAttachment(resource, server) {
        const noop = 'noop';
        if (this._isDirectoryResource(resource)) {
            //Check if directory
            this.checkIfDirectoryAndPopulate(resource, server);
            return noop;
        }
        if (isMcpResourceTemplate(resource)) {
            return this._resourceTemplateToAttachment(resource).then(val => val || noop);
        }
        else {
            return this._resourceToAttachment(resource).then(val => val || noop);
        }
    }
    async checkIfDirectoryAndPopulate(resource, server) {
        try {
            return !await this.navigate(resource, server);
        }
        catch (error) {
            return false;
        }
    }
    async toURI(resource) {
        if (isMcpResourceTemplate(resource)) {
            const maybeUri = await this._resourceTemplateToURI(resource);
            return maybeUri && await this._verifyUriIfNeeded(maybeUri);
        }
        else {
            return resource.uri;
        }
    }
    async _resourceToAttachment(resource) {
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
    async _resourceTemplateToAttachment(rt) {
        const maybeUri = await this._resourceTemplateToURI(rt);
        const uri = maybeUri && await this._verifyUriIfNeeded(maybeUri);
        return uri && this._resourceToAttachment({
            uri,
            name: rt.name,
            mimeType: rt.mimeType,
        });
    }
    async _verifyUriIfNeeded({ uri, needsVerification }) {
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
    async _resourceTemplateToURI(rt) {
        const todo = rt.template.components.flatMap(c => typeof c === 'object' ? c.variables : []);
        const quickInput = this._quickInputService.createQuickPick();
        const cts = new CancellationTokenSource();
        const vars = {};
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
        }
        finally {
            cts.dispose(true);
            quickInput.dispose();
        }
    }
    _promptForTemplateValue(input, variable, variablesSoFar, rt) {
        const store = new DisposableStore();
        const completions = new Map([]);
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
        const setItems = (value, completed = []) => {
            const items = completed.filter(c => c !== value).map(c => ({ id: c, label: c }));
            if (value) {
                items.unshift({ id: currentID, label: value });
            }
            else if (variable.optional) {
                items.unshift({ id: currentID, label: localize('mcp.resource.template.empty', "<Empty>") });
            }
            input.items = items;
        };
        let changeCancellation = new CancellationTokenSource();
        store.add(toDisposable(() => changeCancellation.dispose(true)));
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
        return new Promise(resolve => {
            store.add(input.onDidHide(() => resolve(undefined)));
            store.add(input.onDidAccept(() => {
                const item = input.selectedItems[0];
                if (item.id === currentID) {
                    resolve({ value: input.value, completed: false });
                }
                else if (variable.explodable && item.label.endsWith('/') && item.label !== input.value) {
                    // if navigating in a path structure, picking a `/` should let the user pick in a subdirectory
                    input.value = item.label;
                }
                else {
                    resolve({ value: item.label, completed: true });
                }
            }));
            store.add(input.onDidChangeValue(value => {
                input.busy = true;
                changeCancellation.dispose(true);
                changeCancellation = new CancellationTokenSource();
                getCompletionItemsScheduler.cancel();
                setItems(value);
                if (completions.has(input.value)) {
                    getCompletionItems();
                }
                else {
                    getCompletionItemsScheduler.schedule();
                }
            }));
            getCompletionItems();
        }).finally(() => store.dispose());
    }
    _isDirectoryResource(resource) {
        if (resource.mimeType && resource.mimeType === 'inode/directory') {
            return true;
        }
        else if (isMcpResourceTemplate(resource)) {
            return resource.template.template.endsWith('/');
        }
        else {
            return resource.uri.path.endsWith('/');
        }
    }
    getPicks(token) {
        const cts = new CancellationTokenSource(token);
        let isBusyLoadingPicks = true;
        this._register(toDisposable(() => cts.dispose(true)));
        // We try to show everything in-sequence to avoid flickering (#250411) as long as
        // it loads within 5 seconds. Otherwise we just show things as the load in parallel.
        let showInSequence = true;
        this._register(disposableTimeout(() => {
            showInSequence = false;
            publish();
        }, 5_000));
        const publish = () => {
            const output = new Map();
            for (const [server, rec] of servers) {
                const r = [];
                output.set(server, r);
                if (rec.templates.isResolved) {
                    r.push(...rec.templates.value);
                }
                else if (showInSequence) {
                    break;
                }
                r.push(...rec.resourcesSoFar);
                if (!rec.resources.isSettled && showInSequence) {
                    break;
                }
            }
            this._resources.set({ picks: output, isBusy: isBusyLoadingPicks }, undefined);
        };
        const servers = new Map();
        // Enumerate servers and start servers that need to be started to get capabilities
        Promise.all((this.explicitServers || this._mcpService.servers.get()).map(async (server) => {
            let cap = server.capabilities.get();
            const rec = {
                templates: new DeferredPromise(),
                resourcesSoFar: [],
                resources: new DeferredPromise(),
            };
            servers.set(server, rec); // always add it to retain order
            if (cap === undefined) {
                cap = await new Promise(resolve => {
                    server.start().then(state => {
                        if (state.state === 3 /* McpConnectionState.Kind.Error */ || state.state === 0 /* McpConnectionState.Kind.Stopped */) {
                            resolve(undefined);
                        }
                    });
                    this._register(cts.token.onCancellationRequested(() => resolve(undefined)));
                    this._register(autorun(reader => {
                        const cap2 = server.capabilities.read(reader);
                        if (cap2 !== undefined) {
                            resolve(cap2);
                        }
                    }));
                });
            }
            if (cap && (cap & 16 /* McpCapability.Resources */)) {
                await Promise.all([
                    rec.templates.settleWith(server.resourceTemplates(cts.token).catch(() => [])).finally(publish),
                    rec.resources.settleWith((async () => {
                        for await (const page of server.resources(cts.token)) {
                            rec.resourcesSoFar = rec.resourcesSoFar.concat(page);
                            publish();
                        }
                    })())
                ]);
            }
            else {
                rec.templates.complete([]);
                rec.resources.complete([]);
            }
        })).finally(() => {
            isBusyLoadingPicks = false;
            publish();
        });
        // Use derived to compute the appropriate resource map based on directory navigation state
        return derived(this, reader => {
            const directoryResource = this._inDirectory.read(reader);
            return directoryResource
                ? { picks: new Map([[directoryResource.server, directoryResource.resources]]), isBusy: false }
                : this._resources.read(reader);
        });
    }
};
McpResourcePickHelper = __decorate([
    __param(0, IMcpService),
    __param(1, IFileService),
    __param(2, IQuickInputService),
    __param(3, INotificationService),
    __param(4, IChatAttachmentResolveService)
], McpResourcePickHelper);
export { McpResourcePickHelper };
let AbstractMcpResourceAccessPick = class AbstractMcpResourceAccessPick {
    constructor(_scopeTo, _instantiationService, _editorService, _chatWidgetService, _viewsService) {
        this._scopeTo = _scopeTo;
        this._instantiationService = _instantiationService;
        this._editorService = _editorService;
        this._chatWidgetService = _chatWidgetService;
        this._viewsService = _viewsService;
    }
    applyToPick(picker, token, runOptions) {
        picker.canAcceptInBackground = true;
        picker.busy = true;
        picker.keepScrollPosition = true;
        const store = new DisposableStore();
        const goBackId = '_goback_';
        const attachButton = localize('mcp.quickaccess.attach', "Attach to chat");
        const helper = store.add(this._instantiationService.createInstance(McpResourcePickHelper));
        if (this._scopeTo) {
            helper.explicitServers = [this._scopeTo];
        }
        const picksObservable = helper.getPicks(token);
        store.add(autorun(reader => {
            const pickItems = picksObservable.read(reader);
            const isBusy = pickItems.isBusy;
            const items = [];
            for (const [server, resources] of pickItems.picks) {
                items.push(McpResourcePickHelper.sep(server));
                for (const resource of resources) {
                    const pickItem = McpResourcePickHelper.item(resource);
                    pickItem.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.attach), tooltip: attachButton }];
                    items.push({ ...pickItem, resource, server });
                }
            }
            if (helper.checkIfNestedResources()) {
                // Add go back item
                const goBackItem = {
                    id: goBackId,
                    label: localize('goBack', 'Go back ↩'),
                    alwaysShow: true
                };
                items.push(goBackItem);
            }
            picker.items = items;
            picker.busy = isBusy;
        }));
        store.add(picker.onDidTriggerItemButton(event => {
            if (event.button.tooltip === attachButton) {
                picker.busy = true;
                const resourceItem = event.item;
                const attachment = helper.toAttachment(resourceItem.resource, resourceItem.server);
                if (attachment instanceof Promise) {
                    attachment.then(async (a) => {
                        if (a !== 'noop') {
                            const widget = await openPanelChatAndGetWidget(this._viewsService, this._chatWidgetService);
                            widget?.attachmentModel.addContext(...asArray(a));
                        }
                        picker.hide();
                    });
                }
            }
        }));
        store.add(picker.onDidHide(() => {
            helper.dispose();
        }));
        store.add(picker.onDidAccept(async (event) => {
            try {
                picker.busy = true;
                const [item] = picker.selectedItems;
                // Check if go back item was selected
                if (item.id === goBackId) {
                    helper.navigateBack();
                    picker.busy = false;
                    return;
                }
                const resourceItem = item;
                const resource = resourceItem.resource;
                // Try to navigate into the resource if it's a directory
                const isNested = await helper.navigate(resource, resourceItem.server);
                if (!isNested) {
                    const uri = await helper.toURI(resource);
                    if (uri) {
                        picker.hide();
                        this._editorService.openEditor({ resource: uri, options: { preserveFocus: event.inBackground } });
                    }
                }
            }
            finally {
                picker.busy = false;
            }
        }));
        return store;
    }
};
AbstractMcpResourceAccessPick = __decorate([
    __param(1, IInstantiationService),
    __param(2, IEditorService),
    __param(3, IChatWidgetService),
    __param(4, IViewsService)
], AbstractMcpResourceAccessPick);
export { AbstractMcpResourceAccessPick };
let McpResourceQuickPick = class McpResourceQuickPick extends AbstractMcpResourceAccessPick {
    constructor(scopeTo, instantiationService, editorService, chatWidgetService, viewsService, _quickInputService) {
        super(scopeTo, instantiationService, editorService, chatWidgetService, viewsService);
        this._quickInputService = _quickInputService;
    }
    async pick(token = CancellationToken.None) {
        const store = new DisposableStore();
        const qp = store.add(this._quickInputService.createQuickPick({ useSeparators: true }));
        qp.placeholder = localize('mcp.quickaccess.placeholder', "Search for resources");
        store.add(this.applyToPick(qp, token));
        store.add(qp.onDidHide(() => store.dispose()));
        qp.show();
        await Event.toPromise(qp.onDidHide);
    }
};
McpResourceQuickPick = __decorate([
    __param(1, IInstantiationService),
    __param(2, IEditorService),
    __param(3, IChatWidgetService),
    __param(4, IViewsService),
    __param(5, IQuickInputService)
], McpResourceQuickPick);
export { McpResourceQuickPick };
let McpResourceQuickAccess = class McpResourceQuickAccess extends AbstractMcpResourceAccessPick {
    static { this.PREFIX = 'mcpr '; }
    constructor(instantiationService, editorService, chatWidgetService, viewsService) {
        super(undefined, instantiationService, editorService, chatWidgetService, viewsService);
        this.defaultFilterValue = DefaultQuickAccessFilterValue.LAST;
    }
    provide(picker, token, runOptions) {
        return this.applyToPick(picker, token, runOptions);
    }
};
McpResourceQuickAccess = __decorate([
    __param(0, IInstantiationService),
    __param(1, IEditorService),
    __param(2, IChatWidgetService),
    __param(3, IViewsService)
], McpResourceQuickAccess);
export { McpResourceQuickAccess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVzb3VyY2VRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFJlc291cmNlUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sdUNBQXVDLENBQUM7QUFDdkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQWEsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsNkJBQTZCLEVBQXdELE1BQU0sdURBQXVELENBQUM7QUFDNUosT0FBTyxFQUFFLGtCQUFrQixFQUFtRCxNQUFNLHNEQUFzRCxDQUFDO0FBQzNJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDaEUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFFL0csT0FBTyxFQUFrRCxXQUFXLEVBQUUscUJBQXFCLEVBQXFDLGNBQWMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzlLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXJELElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsVUFBVTtJQUk3QyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQWtCO1FBQ25DLE9BQU87WUFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQ3hCLElBQUksRUFBRSxXQUFXO1lBQ2pCLEtBQUssRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUs7U0FDOUIsQ0FBQztJQUNILENBQUM7SUFFTSwrQkFBK0IsQ0FBQyxNQUFrQixFQUFFLFNBQWtEO1FBQzVHLElBQUksV0FBVyxHQUFZLEtBQUssQ0FBQztRQUNqQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoRCxJQUFJLFdBQVcsRUFBRSxNQUFNLEtBQUssTUFBTSxJQUFJLFdBQVcsQ0FBQyxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzNFLFdBQVcsR0FBRyxLQUFLLENBQUM7WUFDckIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDcEIsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUVGLENBQUM7SUFFTSxZQUFZO1FBQ2xCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN2RixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0YsQ0FBQztJQUVNLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBNkM7UUFDL0QsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0MsSUFBSSxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU87Z0JBQ04sRUFBRSxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUTtnQkFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLLElBQUksUUFBUSxDQUFDLElBQUk7Z0JBQ3RDLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVztnQkFDakMsTUFBTSxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSx3QkFBd0IsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDL0YsUUFBUTthQUNSLENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTztZQUNOLEVBQUUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRTtZQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssSUFBSSxRQUFRLENBQUMsSUFBSTtZQUN0QyxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVc7WUFDakMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzVILFFBQVE7U0FDUixDQUFDO0lBQ0gsQ0FBQztJQW1CRCxZQUNjLFdBQXlDLEVBQ3hDLFlBQTJDLEVBQ3JDLGtCQUF1RCxFQUNyRCxvQkFBMkQsRUFDbEQsNkJBQTZFO1FBRTVHLEtBQUssRUFBRSxDQUFDO1FBTnNCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ3ZCLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQ3BCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDcEMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFzQjtRQUNqQyxrQ0FBNkIsR0FBN0IsNkJBQTZCLENBQStCO1FBakZyRyxlQUFVLEdBQUcsZUFBZSxDQUF1RixJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM3SixvQkFBZSxHQUEyRixJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNILGlCQUFZLEdBQUcsZUFBZSxDQUF5RixJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUF5RHpJLDRCQUF1QixHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNqRCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ2hELElBQUksR0FBRyxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUN2QixPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUMscUJBQXFCO2dCQUN0QyxDQUFDO3FCQUFNLElBQUksR0FBRyxtQ0FBMEIsRUFBRSxDQUFDO29CQUMxQyxPQUFPLEdBQUcsSUFBSSxDQUFDO29CQUNmLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7WUFFRCxPQUFPLE9BQU8sQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztRQTJGSSwyQkFBc0IsR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUM7SUEvRXRFLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBNkMsRUFBRSxNQUFrQjtRQUN0RixJQUFJLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDckMsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUN6QixJQUFJLElBQUksR0FBMEIsU0FBUyxDQUFDO1FBQzVDLElBQUksQ0FBQztZQUNKLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckYsZ0RBQWdEO1lBQ2hELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pFLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLCtCQUErQixDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7WUFFRCxtREFBbUQ7WUFDbkQsTUFBTSxjQUFjLEdBQW1CLElBQUksQ0FBQyxRQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUNqRSxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RixPQUFPO29CQUNOLEdBQUcsRUFBRSxNQUFNO29CQUNYLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUk7b0JBQzNCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJO29CQUNqQixXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVc7b0JBQ2pDLFFBQVEsRUFBRSxTQUFTO29CQUNuQixXQUFXLEVBQUUsS0FBSyxDQUFDLElBQUk7b0JBQ3ZCLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztpQkFDckMsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3hFLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVNLFlBQVksQ0FBQyxRQUE2QyxFQUFFLE1BQWtCO1FBQ3BGLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQztRQUNwQixJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pDLG9CQUFvQjtZQUNwQixJQUFJLENBQUMsMkJBQTJCLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ25ELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUkscUJBQXFCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxPQUFPLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUM7UUFDOUUsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUM7UUFDdEUsQ0FBQztJQUNGLENBQUM7SUFFTSxLQUFLLENBQUMsMkJBQTJCLENBQUMsUUFBNkMsRUFBRSxNQUFrQjtRQUN6RyxJQUFJLENBQUM7WUFDSixPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDRixDQUFDO0lBRU0sS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUE2QztRQUMvRCxJQUFJLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDckMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0QsT0FBTyxRQUFRLElBQUksTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUQsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFJTyxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBdUQ7UUFDMUYsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsNkJBQTZCLENBQUMsK0JBQStCLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JJLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLE9BQU8sQ0FBQztRQUNoQixDQUFDO1FBRUQsT0FBTztZQUNOLEVBQUUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRTtZQUMzQixJQUFJLEVBQUUsTUFBTTtZQUNaLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtZQUNuQixLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUc7U0FDbkIsQ0FBQztJQUNILENBQUM7SUFFTyxLQUFLLENBQUMsNkJBQTZCLENBQUMsRUFBd0I7UUFDbkUsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkQsTUFBTSxHQUFHLEdBQUcsUUFBUSxJQUFJLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQztZQUN4QyxHQUFHO1lBQ0gsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJO1lBQ2IsUUFBUSxFQUFFLEVBQUUsQ0FBQyxRQUFRO1NBQ3JCLENBQUMsQ0FBQztJQUVKLENBQUM7SUFFTyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRSxHQUFHLEVBQUUsaUJBQWlCLEVBQTRDO1FBQ3BHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sR0FBRyxDQUFDO1FBQ1osQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU8sR0FBRyxDQUFDO1FBQ1osQ0FBQztRQUVELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLGlDQUFpQyxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuSyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sS0FBSyxDQUFDLHNCQUFzQixDQUFDLEVBQXdCO1FBQzVELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFM0YsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzdELE1BQU0sR0FBRyxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUUxQyxNQUFNLElBQUksR0FBc0MsRUFBRSxDQUFDO1FBQ25ELFVBQVUsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUNwQyxVQUFVLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztRQUNqQyxJQUFJLGlCQUFpQixHQUFHLEtBQUssQ0FBQztRQUU5QixJQUFJLENBQUM7WUFDSixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN0QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNwRixJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDNUIsT0FBTyxTQUFTLENBQUM7Z0JBQ2xCLENBQUM7Z0JBQ0QsNkVBQTZFO2dCQUM3RSxpQkFBaUIsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFDdkYsQ0FBQztZQUNELE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1FBQ3hELENBQUM7Z0JBQVMsQ0FBQztZQUNWLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEIsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBRU8sdUJBQXVCLENBQUMsS0FBaUMsRUFBRSxRQUE4QixFQUFFLGNBQWlELEVBQUUsRUFBd0I7UUFDN0ssTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBNEIsRUFBRSxDQUFDLENBQUM7UUFFM0QsTUFBTSx5QkFBeUIsR0FBRyxFQUFFLEdBQUcsY0FBYyxFQUFFLENBQUM7UUFDeEQsS0FBSyxNQUFNLFFBQVEsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDdEcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDOUQseUJBQXlCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1lBQzlFLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxXQUFXLEdBQUcsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHVCQUF1QixFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0wsSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDdkIsV0FBVyxJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBQ3BGLENBQUM7UUFFRCxLQUFLLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUNoQyxLQUFLLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNqQixLQUFLLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNqQixLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFYixNQUFNLFNBQVMsR0FBRyxZQUFZLEVBQUUsQ0FBQztRQUNqQyxNQUFNLFFBQVEsR0FBRyxDQUFDLEtBQWEsRUFBRSxZQUFzQixFQUFFLEVBQUUsRUFBRTtZQUM1RCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakYsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWCxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNoRCxDQUFDO2lCQUFNLElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3RixDQUFDO1lBRUQsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBRUYsSUFBSSxrQkFBa0IsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDdkQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRSxNQUFNLGtCQUFrQixHQUFHLEdBQUcsRUFBRTtZQUMvQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQy9CLElBQUksT0FBTyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDMUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLE9BQU8sR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDM0YsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ3JCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDdkQsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ2IsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNoQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO2dCQUNmLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDdkQsS0FBSyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7Z0JBQ3BCLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQztRQUVGLE1BQU0sMkJBQTJCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLGtCQUFrQixFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFN0YsT0FBTyxJQUFJLE9BQU8sQ0FBb0QsT0FBTyxDQUFDLEVBQUU7WUFDL0UsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtnQkFDaEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsSUFBSSxJQUFJLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUMzQixPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDbkQsQ0FBQztxQkFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzFGLDhGQUE4RjtvQkFDOUYsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO2dCQUMxQixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ2pELENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0osS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3hDLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNsQixrQkFBa0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2pDLGtCQUFrQixHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztnQkFDbkQsMkJBQTJCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3JDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFFaEIsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNsQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUN0QixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsMkJBQTJCLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3hDLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosa0JBQWtCLEVBQUUsQ0FBQztRQUN0QixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFFBQTZDO1FBRXpFLElBQUksUUFBUSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUSxLQUFLLGlCQUFpQixFQUFFLENBQUM7WUFDbEUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sSUFBSSxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzVDLE9BQU8sUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFFTSxRQUFRLENBQUMsS0FBeUI7UUFDeEMsTUFBTSxHQUFHLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMvQyxJQUFJLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUM5QixJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RCxpRkFBaUY7UUFDakYsb0ZBQW9GO1FBQ3BGLElBQUksY0FBYyxHQUFHLElBQUksQ0FBQztRQUMxQixJQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRTtZQUNyQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFWCxNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUU7WUFDcEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQXVELENBQUM7WUFDOUUsS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNyQyxNQUFNLENBQUMsR0FBNEMsRUFBRSxDQUFDO2dCQUN0RCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDdEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUM5QixDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFNLENBQUMsQ0FBQztnQkFDakMsQ0FBQztxQkFBTSxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUMzQixNQUFNO2dCQUNQLENBQUM7Z0JBRUQsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNoRCxNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQy9FLENBQUMsQ0FBQztRQUlGLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO1FBQzNDLGtGQUFrRjtRQUNsRixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsTUFBTSxFQUFDLEVBQUU7WUFDdkYsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNwQyxNQUFNLEdBQUcsR0FBUTtnQkFDaEIsU0FBUyxFQUFFLElBQUksZUFBZSxFQUFFO2dCQUNoQyxjQUFjLEVBQUUsRUFBRTtnQkFDbEIsU0FBUyxFQUFFLElBQUksZUFBZSxFQUFFO2FBQ2hDLENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGdDQUFnQztZQUUxRCxJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDdkIsR0FBRyxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQ2pDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7d0JBQzNCLElBQUksS0FBSyxDQUFDLEtBQUssMENBQWtDLElBQUksS0FBSyxDQUFDLEtBQUssNENBQW9DLEVBQUUsQ0FBQzs0QkFDdEcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO3dCQUNwQixDQUFDO29CQUNGLENBQUMsQ0FBQyxDQUFDO29CQUNILElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM1RSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTt3QkFDL0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQzlDLElBQUksSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDOzRCQUN4QixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ2YsQ0FBQztvQkFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUVELElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxtQ0FBMEIsQ0FBQyxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQztvQkFDakIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDO29CQUM5RixHQUFHLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFO3dCQUNwQyxJQUFJLEtBQUssRUFBRSxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDOzRCQUN0RCxHQUFHLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNyRCxPQUFPLEVBQUUsQ0FBQzt3QkFDWCxDQUFDO29CQUNGLENBQUMsQ0FBQyxFQUFFLENBQUM7aUJBQ0wsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQixHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQ2hCLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUMzQixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUMsQ0FBQyxDQUFDO1FBRUgsMEZBQTBGO1FBQzFGLE9BQU8sT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRTtZQUM3QixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3pELE9BQU8saUJBQWlCO2dCQUN2QixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRTtnQkFDOUYsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUE7QUF2YVkscUJBQXFCO0lBOEUvQixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEsNkJBQTZCLENBQUE7R0FsRm5CLHFCQUFxQixDQXVhakM7O0FBRU0sSUFBZSw2QkFBNkIsR0FBNUMsTUFBZSw2QkFBNkI7SUFDbEQsWUFDa0IsUUFBZ0MsRUFDVCxxQkFBNEMsRUFDbkQsY0FBOEIsRUFDeEIsa0JBQXNDLEVBQzdDLGFBQTRCO1FBSjNDLGFBQVEsR0FBUixRQUFRLENBQXdCO1FBQ1QsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUNuRCxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDeEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUM3QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtJQUU3RCxDQUFDO0lBRVMsV0FBVyxDQUFDLE1BQTJELEVBQUUsS0FBd0IsRUFBRSxVQUEyQztRQUN2SixNQUFNLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDO1FBQ3BDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUM7UUFJNUIsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFFMUUsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUMzRixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQixNQUFNLENBQUMsZUFBZSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFDRCxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9DLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQzFCLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDL0MsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNoQyxNQUFNLEtBQUssR0FBcUUsRUFBRSxDQUFDO1lBQ25GLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ25ELEtBQUssQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2xDLE1BQU0sUUFBUSxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDdEQsUUFBUSxDQUFDLE9BQU8sR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO29CQUNqRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQy9DLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxNQUFNLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxDQUFDO2dCQUNyQyxtQkFBbUI7Z0JBQ25CLE1BQU0sVUFBVSxHQUFtQjtvQkFDbEMsRUFBRSxFQUFFLFFBQVE7b0JBQ1osS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO29CQUN0QyxVQUFVLEVBQUUsSUFBSTtpQkFDaEIsQ0FBQztnQkFDRixLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3hCLENBQUM7WUFDRCxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNyQixNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQztRQUN0QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDL0MsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ25CLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxJQUE2QixDQUFDO2dCQUN6RCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRixJQUFJLFVBQVUsWUFBWSxPQUFPLEVBQUUsQ0FBQztvQkFDbkMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7d0JBQ3pCLElBQUksQ0FBQyxLQUFLLE1BQU0sRUFBRSxDQUFDOzRCQUNsQixNQUFNLE1BQU0sR0FBRyxNQUFNLHlCQUF5QixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7NEJBQzVGLE1BQU0sRUFBRSxlQUFlLENBQUMsVUFBVSxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ25ELENBQUM7d0JBQ0QsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNmLENBQUMsQ0FBQyxDQUFDO2dCQUNKLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDL0IsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO1lBQzFDLElBQUksQ0FBQztnQkFDSixNQUFNLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztnQkFDbkIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7Z0JBRXBDLHFDQUFxQztnQkFDckMsSUFBSSxJQUFJLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMxQixNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDO29CQUNwQixPQUFPO2dCQUNSLENBQUM7Z0JBRUQsTUFBTSxZQUFZLEdBQUcsSUFBNkIsQ0FBQztnQkFDbkQsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQztnQkFDdkMsd0RBQXdEO2dCQUN4RCxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDdEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNmLE1BQU0sR0FBRyxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDekMsSUFBSSxHQUFHLEVBQUUsQ0FBQzt3QkFDVCxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ2QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUNuRyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO29CQUFTLENBQUM7Z0JBQ1YsTUFBTSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBckdxQiw2QkFBNkI7SUFHaEQsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxhQUFhLENBQUE7R0FOTSw2QkFBNkIsQ0FxR2xEOztBQUVNLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsNkJBQTZCO0lBQ3RFLFlBQ0MsT0FBK0IsRUFDUixvQkFBMkMsRUFDbEQsYUFBNkIsRUFDekIsaUJBQXFDLEVBQzFDLFlBQTJCLEVBQ0wsa0JBQXNDO1FBRTNFLEtBQUssQ0FBQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRmhELHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7SUFHNUUsQ0FBQztJQUVNLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLGlCQUFpQixDQUFDLElBQUk7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLEVBQUUsQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDakYsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9DLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNWLE1BQU0sS0FBSyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDckMsQ0FBQztDQUNELENBQUE7QUFyQlksb0JBQW9CO0lBRzlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxrQkFBa0IsQ0FBQTtHQVBSLG9CQUFvQixDQXFCaEM7O0FBRU0sSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSw2QkFBNkI7YUFDakQsV0FBTSxHQUFHLE9BQU8sQUFBVixDQUFXO0lBSXhDLFlBQ3dCLG9CQUEyQyxFQUNsRCxhQUE2QixFQUN6QixpQkFBcUMsRUFDMUMsWUFBMkI7UUFFMUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFSeEYsdUJBQWtCLEdBQUcsNkJBQTZCLENBQUMsSUFBSSxDQUFDO0lBU3hELENBQUM7SUFFRCxPQUFPLENBQUMsTUFBMkQsRUFBRSxLQUF3QixFQUFFLFVBQTJDO1FBQ3pJLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7O0FBaEJXLHNCQUFzQjtJQU1oQyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGFBQWEsQ0FBQTtHQVRILHNCQUFzQixDQWlCbEMifQ==