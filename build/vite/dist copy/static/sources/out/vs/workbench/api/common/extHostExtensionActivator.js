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
import * as errors from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtensionDescriptionRegistry } from '../../services/extensions/common/extensionDescriptionRegistry.js';
import { ExtensionIdentifierMap } from '../../../platform/extensions/common/extensions.js';
import { MissingExtensionDependency } from '../../services/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Barrier } from '../../../base/common/async.js';
export class ExtensionActivationTimes {
    static { this.NONE = new ExtensionActivationTimes(false, -1, -1, -1); }
    constructor(startup, codeLoadingTime, activateCallTime, activateResolvedTime) {
        this.startup = startup;
        this.codeLoadingTime = codeLoadingTime;
        this.activateCallTime = activateCallTime;
        this.activateResolvedTime = activateResolvedTime;
    }
}
export class ExtensionActivationTimesBuilder {
    constructor(startup) {
        this._startup = startup;
        this._codeLoadingStart = -1;
        this._codeLoadingStop = -1;
        this._activateCallStart = -1;
        this._activateCallStop = -1;
        this._activateResolveStart = -1;
        this._activateResolveStop = -1;
    }
    _delta(start, stop) {
        if (start === -1 || stop === -1) {
            return -1;
        }
        return stop - start;
    }
    build() {
        return new ExtensionActivationTimes(this._startup, this._delta(this._codeLoadingStart, this._codeLoadingStop), this._delta(this._activateCallStart, this._activateCallStop), this._delta(this._activateResolveStart, this._activateResolveStop));
    }
    codeLoadingStart() {
        this._codeLoadingStart = Date.now();
    }
    codeLoadingStop() {
        this._codeLoadingStop = Date.now();
    }
    activateCallStart() {
        this._activateCallStart = Date.now();
    }
    activateCallStop() {
        this._activateCallStop = Date.now();
    }
    activateResolveStart() {
        this._activateResolveStart = Date.now();
    }
    activateResolveStop() {
        this._activateResolveStop = Date.now();
    }
}
export class ActivatedExtension {
    constructor(activationFailed, activationFailedError, activationTimes, module, exports, disposable) {
        this.activationFailed = activationFailed;
        this.activationFailedError = activationFailedError;
        this.activationTimes = activationTimes;
        this.module = module;
        this.exports = exports;
        this.disposable = disposable;
    }
}
export class EmptyExtension extends ActivatedExtension {
    constructor(activationTimes) {
        super(false, null, activationTimes, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
    }
}
export class HostExtension extends ActivatedExtension {
    constructor() {
        super(false, null, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
    }
}
class FailedExtension extends ActivatedExtension {
    constructor(activationError) {
        super(true, activationError, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
    }
}
let ExtensionsActivator = class ExtensionsActivator {
    constructor(registry, globalRegistry, host, _logService) {
        this._logService = _logService;
        this._registry = registry;
        this._globalRegistry = globalRegistry;
        this._host = host;
        this._operations = new ExtensionIdentifierMap();
        this._alreadyActivatedEvents = Object.create(null);
    }
    dispose() {
        for (const [_, op] of this._operations) {
            op.dispose();
        }
    }
    async waitForActivatingExtensions() {
        const res = [];
        for (const [_, op] of this._operations) {
            res.push(op.wait());
        }
        await Promise.all(res);
    }
    isActivated(extensionId) {
        const op = this._operations.get(extensionId);
        return Boolean(op && op.value);
    }
    getActivatedExtension(extensionId) {
        const op = this._operations.get(extensionId);
        if (!op || !op.value) {
            throw new Error(`Extension '${extensionId.value}' is not known or not activated`);
        }
        return op.value;
    }
    async activateByEvent(activationEvent, startup) {
        if (this._alreadyActivatedEvents[activationEvent]) {
            return;
        }
        const activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
        await this._activateExtensions(activateExtensions.map(e => ({
            id: e.identifier,
            reason: { startup, extensionId: e.identifier, activationEvent }
        })));
        this._alreadyActivatedEvents[activationEvent] = true;
    }
    activateById(extensionId, reason) {
        const desc = this._registry.getExtensionDescription(extensionId);
        if (!desc) {
            throw new Error(`Extension '${extensionId.value}' is not known`);
        }
        return this._activateExtensions([{ id: desc.identifier, reason }]);
    }
    async _activateExtensions(extensions) {
        const operations = extensions
            .filter((p) => !this.isActivated(p.id))
            .map(ext => this._handleActivationRequest(ext));
        await Promise.all(operations.map(op => op.wait()));
    }
    /**
     * Handle semantics related to dependencies for `currentExtension`.
     * We don't need to worry about dependency loops because they are handled by the registry.
     */
    _handleActivationRequest(currentActivation) {
        if (this._operations.has(currentActivation.id)) {
            return this._operations.get(currentActivation.id);
        }
        if (this._isHostExtension(currentActivation.id)) {
            return this._createAndSaveOperation(currentActivation, null, [], null);
        }
        const currentExtension = this._registry.getExtensionDescription(currentActivation.id);
        if (!currentExtension) {
            // Error condition 0: unknown extension
            const error = new Error(`Cannot activate unknown extension '${currentActivation.id.value}'`);
            const result = this._createAndSaveOperation(currentActivation, null, [], new FailedExtension(error));
            this._host.onExtensionActivationError(currentActivation.id, error, new MissingExtensionDependency(currentActivation.id.value));
            return result;
        }
        const deps = [];
        const depIds = (typeof currentExtension.extensionDependencies === 'undefined' ? [] : currentExtension.extensionDependencies);
        for (const depId of depIds) {
            if (this._isResolvedExtension(depId)) {
                // This dependency is already resolved
                continue;
            }
            const dep = this._operations.get(depId);
            if (dep) {
                deps.push(dep);
                continue;
            }
            if (this._isHostExtension(depId)) {
                // must first wait for the dependency to activate
                deps.push(this._handleActivationRequest({
                    id: this._globalRegistry.getExtensionDescription(depId).identifier,
                    reason: currentActivation.reason
                }));
                continue;
            }
            const depDesc = this._registry.getExtensionDescription(depId);
            if (depDesc) {
                if (!depDesc.main && !depDesc.browser) {
                    // this dependency does not need to activate because it is descriptive only
                    continue;
                }
                // must first wait for the dependency to activate
                deps.push(this._handleActivationRequest({
                    id: depDesc.identifier,
                    reason: currentActivation.reason
                }));
                continue;
            }
            // Error condition 1: unknown dependency
            const currentExtensionFriendlyName = currentExtension.displayName || currentExtension.identifier.value;
            const error = new Error(`Cannot activate the '${currentExtensionFriendlyName}' extension because it depends on unknown extension '${depId}'`);
            const result = this._createAndSaveOperation(currentActivation, currentExtension.displayName, [], new FailedExtension(error));
            this._host.onExtensionActivationError(currentExtension.identifier, error, new MissingExtensionDependency(depId));
            return result;
        }
        return this._createAndSaveOperation(currentActivation, currentExtension.displayName, deps, null);
    }
    _createAndSaveOperation(activation, displayName, deps, value) {
        const operation = new ActivationOperation(activation.id, displayName, activation.reason, deps, value, this._host, this._logService);
        this._operations.set(activation.id, operation);
        return operation;
    }
    _isHostExtension(extensionId) {
        return ExtensionDescriptionRegistry.isHostExtension(extensionId, this._registry, this._globalRegistry);
    }
    _isResolvedExtension(extensionId) {
        const extensionDescription = this._globalRegistry.getExtensionDescription(extensionId);
        if (!extensionDescription) {
            // unknown extension
            return false;
        }
        return (!extensionDescription.main && !extensionDescription.browser);
    }
};
ExtensionsActivator = __decorate([
    __param(3, ILogService)
], ExtensionsActivator);
export { ExtensionsActivator };
let ActivationOperation = class ActivationOperation {
    get value() {
        return this._value;
    }
    get friendlyName() {
        return this._displayName || this._id.value;
    }
    constructor(_id, _displayName, _reason, _deps, _value, _host, _logService) {
        this._id = _id;
        this._displayName = _displayName;
        this._reason = _reason;
        this._deps = _deps;
        this._value = _value;
        this._host = _host;
        this._logService = _logService;
        this._barrier = new Barrier();
        this._isDisposed = false;
        this._initialize();
    }
    dispose() {
        this._isDisposed = true;
    }
    wait() {
        return this._barrier.wait();
    }
    async _initialize() {
        await this._waitForDepsThenActivate();
        this._barrier.open();
    }
    async _waitForDepsThenActivate() {
        if (this._value) {
            // this operation is already finished
            return;
        }
        while (this._deps.length > 0) {
            // remove completed deps
            for (let i = 0; i < this._deps.length; i++) {
                const dep = this._deps[i];
                if (dep.value && !dep.value.activationFailed) {
                    // the dependency is already activated OK
                    this._deps.splice(i, 1);
                    i--;
                    continue;
                }
                if (dep.value && dep.value.activationFailed) {
                    // Error condition 2: a dependency has already failed activation
                    const error = new Error(`Cannot activate the '${this.friendlyName}' extension because its dependency '${dep.friendlyName}' failed to activate`);
                    // eslint-disable-next-line local/code-no-any-casts
                    error.detail = dep.value.activationFailedError;
                    this._value = new FailedExtension(error);
                    this._host.onExtensionActivationError(this._id, error, null);
                    return;
                }
            }
            if (this._deps.length > 0) {
                // wait for one dependency
                await Promise.race(this._deps.map(dep => dep.wait()));
            }
        }
        await this._activate();
    }
    async _activate() {
        try {
            this._value = await this._host.actualActivateExtension(this._id, this._reason);
        }
        catch (err) {
            const error = new Error();
            if (err && err.name) {
                error.name = err.name;
            }
            if (err && err.message) {
                error.message = `Activating extension '${this._id.value}' failed: ${err.message}.`;
            }
            else {
                error.message = `Activating extension '${this._id.value}' failed: ${err}.`;
            }
            if (err && err.stack) {
                error.stack = err.stack;
            }
            // Treat the extension as being empty
            this._value = new FailedExtension(error);
            if (this._isDisposed && errors.isCancellationError(err)) {
                // It is expected for ongoing activations to fail if the extension host is going down
                // So simply ignore and don't log canceled errors in this case
                return;
            }
            this._host.onExtensionActivationError(this._id, error, null);
            this._logService.error(`Activating extension ${this._id.value} failed due to an error:`);
            this._logService.error(err);
        }
    }
};
ActivationOperation = __decorate([
    __param(6, ILogService)
], ActivationOperation);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEV4dGVuc2lvbkFjdGl2YXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RFeHRlbnNpb25BY3RpdmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDaEgsT0FBTyxFQUF1QixzQkFBc0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2hILE9BQU8sRUFBNkIsMEJBQTBCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBd0J4RCxNQUFNLE9BQU8sd0JBQXdCO2FBRWIsU0FBSSxHQUFHLElBQUksd0JBQXdCLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFPOUUsWUFBWSxPQUFnQixFQUFFLGVBQXVCLEVBQUUsZ0JBQXdCLEVBQUUsb0JBQTRCO1FBQzVHLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQztRQUN6QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsb0JBQW9CLENBQUM7SUFDbEQsQ0FBQzs7QUFHRixNQUFNLE9BQU8sK0JBQStCO0lBVTNDLFlBQVksT0FBZ0I7UUFDM0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDN0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLE1BQU0sQ0FBQyxLQUFhLEVBQUUsSUFBWTtRQUN6QyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ1gsQ0FBQztRQUNELE9BQU8sSUFBSSxHQUFHLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBRU0sS0FBSztRQUNYLE9BQU8sSUFBSSx3QkFBd0IsQ0FDbEMsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQzVELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUNsRSxDQUFDO0lBQ0gsQ0FBQztJQUVNLGdCQUFnQjtRQUN0QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFTSxlQUFlO1FBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVNLGlCQUFpQjtRQUN2QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFTSxnQkFBZ0I7UUFDdEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0lBRU0sb0JBQW9CO1FBQzFCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDekMsQ0FBQztJQUVNLG1CQUFtQjtRQUN6QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3hDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxrQkFBa0I7SUFTOUIsWUFDQyxnQkFBeUIsRUFDekIscUJBQW1DLEVBQ25DLGVBQXlDLEVBQ3pDLE1BQXdCLEVBQ3hCLE9BQWtDLEVBQ2xDLFVBQXVCO1FBRXZCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQztRQUN6QyxJQUFJLENBQUMscUJBQXFCLEdBQUcscUJBQXFCLENBQUM7UUFDbkQsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDOUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGNBQWUsU0FBUSxrQkFBa0I7SUFDckQsWUFBWSxlQUF5QztRQUNwRCxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pILENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxhQUFjLFNBQVEsa0JBQWtCO0lBQ3BEO1FBQ0MsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsd0JBQXdCLENBQUMsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvSCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGVBQWdCLFNBQVEsa0JBQWtCO0lBQy9DLFlBQVksZUFBc0I7UUFDakMsS0FBSyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUUsd0JBQXdCLENBQUMsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6SSxDQUFDO0NBQ0Q7QUFTTSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFtQjtJQVcvQixZQUNDLFFBQXNDLEVBQ3RDLGNBQTRDLEVBQzVDLElBQThCLEVBQ0EsV0FBd0I7UUFBeEIsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFFdEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxjQUFjLENBQUM7UUFDdEMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLHNCQUFzQixFQUF1QixDQUFDO1FBQ3JFLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTSxPQUFPO1FBQ2IsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN4QyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxDQUFDO0lBQ0YsQ0FBQztJQUVNLEtBQUssQ0FBQywyQkFBMkI7UUFDdkMsTUFBTSxHQUFHLEdBQXVCLEVBQUUsQ0FBQztRQUNuQyxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDckIsQ0FBQztRQUNELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBRU0sV0FBVyxDQUFDLFdBQWdDO1FBQ2xELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLE9BQU8sT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVNLHFCQUFxQixDQUFDLFdBQWdDO1FBQzVELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLFdBQVcsQ0FBQyxLQUFLLGlDQUFpQyxDQUFDLENBQUM7UUFDbkYsQ0FBQztRQUNELE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRU0sS0FBSyxDQUFDLGVBQWUsQ0FBQyxlQUF1QixFQUFFLE9BQWdCO1FBQ3JFLElBQUksSUFBSSxDQUFDLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDbkQsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsMENBQTBDLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdEcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzRCxFQUFFLEVBQUUsQ0FBQyxDQUFDLFVBQVU7WUFDaEIsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLGVBQWUsRUFBRTtTQUMvRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUwsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxHQUFHLElBQUksQ0FBQztJQUN0RCxDQUFDO0lBRU0sWUFBWSxDQUFDLFdBQWdDLEVBQUUsTUFBaUM7UUFDdEYsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDWCxNQUFNLElBQUksS0FBSyxDQUFDLGNBQWMsV0FBVyxDQUFDLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRU8sS0FBSyxDQUFDLG1CQUFtQixDQUFDLFVBQW1DO1FBQ3BFLE1BQU0sVUFBVSxHQUFHLFVBQVU7YUFDM0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ3RDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssd0JBQXdCLENBQUMsaUJBQXdDO1FBQ3hFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBRSxDQUFDO1FBQ3BELENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ2pELE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEUsQ0FBQztRQUVELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN2Qix1Q0FBdUM7WUFDdkMsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsc0NBQXNDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQzdGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDckcsSUFBSSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FDcEMsaUJBQWlCLENBQUMsRUFBRSxFQUNwQixLQUFLLEVBQ0wsSUFBSSwwQkFBMEIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQzFELENBQUM7WUFDRixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFFRCxNQUFNLElBQUksR0FBMEIsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLENBQUMsT0FBTyxnQkFBZ0IsQ0FBQyxxQkFBcUIsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUM3SCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBRTVCLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLHNDQUFzQztnQkFDdEMsU0FBUztZQUNWLENBQUM7WUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QyxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUNULElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2YsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxpREFBaUQ7Z0JBQ2pELElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDO29CQUN2QyxFQUFFLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUUsQ0FBQyxVQUFVO29CQUNuRSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsTUFBTTtpQkFDaEMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osU0FBUztZQUNWLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlELElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3ZDLDJFQUEyRTtvQkFDM0UsU0FBUztnQkFDVixDQUFDO2dCQUVELGlEQUFpRDtnQkFDakQsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUM7b0JBQ3ZDLEVBQUUsRUFBRSxPQUFPLENBQUMsVUFBVTtvQkFDdEIsTUFBTSxFQUFFLGlCQUFpQixDQUFDLE1BQU07aUJBQ2hDLENBQUMsQ0FBQyxDQUFDO2dCQUNKLFNBQVM7WUFDVixDQUFDO1lBRUQsd0NBQXdDO1lBQ3hDLE1BQU0sNEJBQTRCLEdBQUcsZ0JBQWdCLENBQUMsV0FBVyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUM7WUFDdkcsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsd0JBQXdCLDRCQUE0Qix3REFBd0QsS0FBSyxHQUFHLENBQUMsQ0FBQztZQUM5SSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsaUJBQWlCLEVBQUUsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLEVBQUUsRUFBRSxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzdILElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQ3BDLGdCQUFnQixDQUFDLFVBQVUsRUFDM0IsS0FBSyxFQUNMLElBQUksMEJBQTBCLENBQUMsS0FBSyxDQUFDLENBQ3JDLENBQUM7WUFDRixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xHLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxVQUFpQyxFQUFFLFdBQXNDLEVBQUUsSUFBMkIsRUFBRSxLQUFnQztRQUN2SyxNQUFNLFNBQVMsR0FBRyxJQUFJLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNwSSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxXQUF5QztRQUNqRSxPQUFPLDRCQUE0QixDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEcsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFdBQXlDO1FBQ3JFLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMzQixvQkFBb0I7WUFDcEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTyxDQUFDLENBQUMsb0JBQW9CLENBQUMsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEUsQ0FBQztDQUNELENBQUE7QUFsTFksbUJBQW1CO0lBZTdCLFdBQUEsV0FBVyxDQUFBO0dBZkQsbUJBQW1CLENBa0wvQjs7QUFFRCxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFtQjtJQUt4QixJQUFXLEtBQUs7UUFDZixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELElBQVcsWUFBWTtRQUN0QixPQUFPLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7SUFDNUMsQ0FBQztJQUVELFlBQ2tCLEdBQXdCLEVBQ3hCLFlBQXVDLEVBQ3ZDLE9BQWtDLEVBQ2xDLEtBQTRCLEVBQ3JDLE1BQWlDLEVBQ3hCLEtBQStCLEVBQ25DLFdBQXlDO1FBTnJDLFFBQUcsR0FBSCxHQUFHLENBQXFCO1FBQ3hCLGlCQUFZLEdBQVosWUFBWSxDQUEyQjtRQUN2QyxZQUFPLEdBQVAsT0FBTyxDQUEyQjtRQUNsQyxVQUFLLEdBQUwsS0FBSyxDQUF1QjtRQUNyQyxXQUFNLEdBQU4sTUFBTSxDQUEyQjtRQUN4QixVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQUNsQixnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQWxCdEMsYUFBUSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFDbEMsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUFtQjNCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRU0sT0FBTztRQUNiLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLENBQUM7SUFFTSxJQUFJO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVztRQUN4QixNQUFNLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVPLEtBQUssQ0FBQyx3QkFBd0I7UUFDckMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIscUNBQXFDO1lBQ3JDLE9BQU87UUFDUixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM5Qix3QkFBd0I7WUFDeEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRTFCLElBQUksR0FBRyxDQUFDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDOUMseUNBQXlDO29CQUN6QyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3hCLENBQUMsRUFBRSxDQUFDO29CQUNKLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxJQUFJLEdBQUcsQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO29CQUM3QyxnRUFBZ0U7b0JBQ2hFLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLHdCQUF3QixJQUFJLENBQUMsWUFBWSx1Q0FBdUMsR0FBRyxDQUFDLFlBQVksc0JBQXNCLENBQUMsQ0FBQztvQkFDaEosbURBQW1EO29CQUM3QyxLQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUM7b0JBQ3RELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzdELE9BQU87Z0JBQ1IsQ0FBQztZQUNGLENBQUM7WUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMzQiwwQkFBMEI7Z0JBQzFCLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkQsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRU8sS0FBSyxDQUFDLFNBQVM7UUFDdEIsSUFBSSxDQUFDO1lBQ0osSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEYsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFFZCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDckIsS0FBSyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3hCLEtBQUssQ0FBQyxPQUFPLEdBQUcseUJBQXlCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxhQUFhLEdBQUcsQ0FBQyxPQUFPLEdBQUcsQ0FBQztZQUNwRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxDQUFDLE9BQU8sR0FBRyx5QkFBeUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLGFBQWEsR0FBRyxHQUFHLENBQUM7WUFDNUUsQ0FBQztZQUNELElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdEIsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO1lBQ3pCLENBQUM7WUFFRCxxQ0FBcUM7WUFDckMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV6QyxJQUFJLElBQUksQ0FBQyxXQUFXLElBQUksTUFBTSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELHFGQUFxRjtnQkFDckYsOERBQThEO2dCQUM5RCxPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pGLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQTVHSyxtQkFBbUI7SUFvQnRCLFdBQUEsV0FBVyxDQUFBO0dBcEJSLG1CQUFtQixDQTRHeEIifQ==