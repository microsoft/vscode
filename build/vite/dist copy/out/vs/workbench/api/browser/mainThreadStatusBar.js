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
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { DisposableMap, toDisposable, Disposable } from '../../../base/common/lifecycle.js';
import { IExtensionStatusBarItemService } from './statusBarExtensionPoint.js';
let MainThreadStatusBar = class MainThreadStatusBar extends Disposable {
    constructor(extHostContext, statusbarService) {
        super();
        this.statusbarService = statusbarService;
        this._entryDisposables = this._register(new DisposableMap());
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStatusBar);
        // once, at startup read existing items and send them over
        const entries = [];
        for (const [entryId, item] of statusbarService.getEntries()) {
            entries.push(asDto(entryId, item));
        }
        this._proxy.$acceptStaticEntries(entries);
        this._register(statusbarService.onDidChange(e => {
            if (e.added) {
                this._proxy.$acceptStaticEntries([asDto(e.added[0], e.added[1])]);
            }
        }));
        function asDto(entryId, item) {
            return {
                entryId,
                name: item.entry.name,
                text: item.entry.text,
                tooltip: item.entry.tooltip,
                command: typeof item.entry.command === 'string' ? item.entry.command : typeof item.entry.command === 'object' ? item.entry.command.id : undefined,
                priority: item.priority,
                alignLeft: item.alignment === 0 /* StatusbarAlignment.LEFT */,
                accessibilityInformation: item.entry.ariaLabel ? { label: item.entry.ariaLabel, role: item.entry.role } : undefined
            };
        }
    }
    $setEntry(entryId, id, extensionId, name, text, tooltip, hasTooltipProvider, command, color, backgroundColor, alignLeft, priority, accessibilityInformation) {
        const tooltipOrTooltipProvider = hasTooltipProvider
            ? {
                markdown: (cancellation) => {
                    return this._proxy.$provideTooltip(entryId, cancellation);
                },
                markdownNotSupportedFallback: undefined
            }
            : tooltip;
        const kind = this.statusbarService.setOrUpdateEntry(entryId, id, extensionId, name, text, tooltipOrTooltipProvider, command, color, backgroundColor, alignLeft, priority, accessibilityInformation);
        if (kind === 0 /* StatusBarUpdateKind.DidDefine */) {
            const disposable = toDisposable(() => this.statusbarService.unsetEntry(entryId));
            this._entryDisposables.set(entryId, disposable);
        }
    }
    $disposeEntry(entryId) {
        this._entryDisposables.deleteAndDispose(entryId);
    }
};
MainThreadStatusBar = __decorate([
    extHostNamedCustomer(MainContext.MainThreadStatusBar),
    __param(1, IExtensionStatusBarItemService)
], MainThreadStatusBar);
export { MainThreadStatusBar };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFN0YXR1c0Jhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkU3RhdHVzQmFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBNEIsV0FBVyxFQUFFLGNBQWMsRUFBMkMsTUFBTSwrQkFBK0IsQ0FBQztBQUUvSSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJNUYsT0FBTyxFQUFFLDhCQUE4QixFQUF1QixNQUFNLDhCQUE4QixDQUFDO0FBTTVGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQUtsRCxZQUNDLGNBQStCLEVBQ0MsZ0JBQWlFO1FBRWpHLEtBQUssRUFBRSxDQUFDO1FBRnlDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBZ0M7UUFKakYsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBVSxDQUFDLENBQUM7UUFPaEYsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRXZFLDBEQUEwRDtRQUMxRCxNQUFNLE9BQU8sR0FBdUIsRUFBRSxDQUFDO1FBQ3ZDLEtBQUssTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQzdELE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxJQUFJLENBQUMsTUFB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