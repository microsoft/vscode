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
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IUserDataProfilesService, reviveProfile } from '../../userDataProfile/common/userDataProfile.js';
import { UserDataSyncError } from './userDataSync.js';
function reviewSyncResource(syncResource, userDataProfilesService) {
    return { ...syncResource, profile: reviveProfile(syncResource.profile, userDataProfilesService.profilesHome.scheme) };
}
function reviewSyncResourceHandle(syncResourceHandle) {
    return { created: syncResourceHandle.created, uri: URI.revive(syncResourceHandle.uri) };
}
export class UserDataSyncServiceChannel {
    constructor(service, userDataProfilesService, logService) {
        this.service = service;
        this.userDataProfilesService = userDataProfilesService;
        this.logService = logService;
        this.manualSyncTasks = new Map();
        this.onManualSynchronizeResources = new Emitter();
    }
    listen(_, event) {
        switch (event) {
            // sync
            case 'onDidChangeStatus': return this.service.onDidChangeStatus;
            case 'onDidChangeConflicts': return this.service.onDidChangeConflicts;
            case 'onDidChangeLocal': return this.service.onDidChangeLocal;
            case 'onDidChangeLastSyncTime': return this.service.onDidChangeLastSyncTime;
            case 'onSyncErrors': return this.service.onSyncErrors;
            case 'onDidResetLocal': return this.service.onDidResetLocal;
            case 'onDidResetRemote': return this.service.onDidResetRemote;
            // manual sync
            case 'manualSync/onSynchronizeResources': return this.onManualSynchronizeResources.event;
        }
        throw new Error(`[UserDataSyncServiceChannel] Event not found: ${event}`);
    }
    async call(context, command, args) {
        try {
            const result = await this._call(context, command, args);
            return result;
        }
        catch (e) {
            this.logService.error(e);
            throw e;
        }
    }
    async _call(context, command, args) {
        switch (command) {
            // sync
            case '_getInitialData': return Promise.resolve([this.service.status, this.service.conflicts, this.service.lastSyncTime]);
            case 'reset': return this.service.reset();
            case 'resetRemote': return this.service.resetRemote();
            case 'resetLocal': return this.service.resetLocal();
            case 'hasPreviouslySynced': return this.service.hasPreviouslySynced();
            case 'hasLocalData': return this.service.hasLocalData();
            case 'resolveContent': return this.service.resolveContent(URI.revive(args[0]));
            case 'accept': return this.service.accept(reviewSyncResource(args[0], this.userDataProfilesService), URI.revive(args[1]), args[2], args[3]);
            case 'replace': return this.service.replace(reviewSyncResourceHandle(args[0]));
            case 'cleanUpRemoteData': return this.service.cleanUpRemoteData();
            case 'getRemoteActivityData': return this.service.saveRemoteActivityData(URI.revive(args[0]));
            case 'extractActivityData': return this.service.extractActivityData(URI.revive(args[0]), URI.revive(args[1]));
            case 'createManualSyncTask': return this.createManualSyncTask();
        }
        // manual sync
        if (command.startsWith('manualSync/')) {
            const manualSyncTaskCommand = command.substring('manualSync/'.length);
            const manualSyncTaskId = args[0];
            const manualSyncTask = this.getManualSyncTask(manualSyncTaskId);
            args = args.slice(1);
            switch (manualSyncTaskCommand) {
                case 'merge': return manualSyncTask.merge();
                case 'apply': return manualSyncTask.apply().then(() => this.manualSyncTasks.delete(this.createKey(manualSyncTask.id)));
                case 'stop': return manualSyncTask.stop().finally(() => this.manualSyncTasks.delete(this.createKey(manualSyncTask.id)));
            }
        }
        throw new Error('Invalid call');
    }
    getManualSyncTask(manualSyncTaskId) {
        const manualSyncTask = this.manualSyncTasks.get(this.createKey(manualSyncTaskId));
        if (!manualSyncTask) {
            throw new Error(`Manual sync taks not found: ${manualSyncTaskId}`);
        }
        return manualSyncTask;
    }
    async createManualSyncTask() {
        const manualSyncTask = await this.service.createManualSyncTask();
        this.manualSyncTasks.set(this.createKey(manualSyncTask.id), manualSyncTask);
        return manualSyncTask.id;
    }
    createKey(manualSyncTaskId) { return `manualSyncTask-${manualSyncTaskId}`; }
}
let UserDataSyncServiceChannelClient = class UserDataSyncServiceChannelClient extends Disposable {
    get status() { return this._status; }
    get onDidChangeLocal() { return this.channel.listen('onDidChangeLocal'); }
    get conflicts() { return this._conflicts; }
    get lastSyncTime() { return this._lastSyncTime; }
    get onDidResetLocal() { return this.channel.listen('onDidResetLocal'); }
    get onDidResetRemote() { return this.channel.listen('onDidResetRemote'); }
    constructor(userDataSyncChannel, userDataProfilesService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this._status = "uninitialized" /* SyncStatus.Uninitialized */;
        this._onDidChangeStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangeStatus.event;
        this._conflicts = [];
        this._onDidChangeConflicts = this._register(new Emitter());
        this.onDidChangeConflicts = this._onDidChangeConflicts.event;
        this._lastSyncTime = undefined;
        this._onDidChangeLastSyncTime = this._register(new Emitter());
        this.onDidChangeLastSyncTime = this._onDidChangeLastSyncTime.event;
        this._onSyncErrors = this._register(new Emitter());
        this.onSyncErrors = this._onSyncErrors.event;
        this.channel = {
            call(command, arg, cancellationToken) {
                return userDataSyncChannel.call(command, arg, cancellationToken)
                    .then(null, error => { throw UserDataSyncError.toUserDataSyncError(error); });
            },
            listen(event, arg) {
                return userDataSyncChannel.listen(event, arg);
            }
        };
        this.channel.call('_getInitialData').then(([status, conflicts, lastSyncTime]) => {
            this.updateStatus(status);
            this.updateConflicts(conflicts);
            if (lastSyncTime) {
                this.updateLastSyncTime(lastSyncTime);
            }
            this._register(this.channel.listen('onDidChangeStatus')(status => this.updateStatus(status)));
            this._register(this.channel.listen('onDidChangeLastSyncTime')(lastSyncTime => this.updateLastSyncTime(lastSyncTime)));
        });
        this._register(this.channel.listen('onDidChangeConflicts')(conflicts => this.updateConflicts(conflicts)));
        this._register(this.channel.listen('onSyncErrors')(errors => this._onSyncErrors.fire(errors.map(syncError => ({ ...syncError, error: UserDataSyncError.toUserDataSyncError(syncError.error) })))));
    }
    createSyncTask() {
        throw new Error('not supported');
    }
    async createManualSyncTask() {
        const id = await this.channel.call('createManualSyncTask');
        const that = this;
        const manualSyncTaskChannelClient = new ManualSyncTaskChannelClient(id, {
            async call(command, arg, cancellationToken) {
                return that.channel.call(`manualSync/${command}`, [id, ...(Array.isArray(arg) ? arg : [arg])], cancellationToken);
            },
            listen() {
                throw new Error('not supported');
            }
        });
        return manualSyncTaskChannelClient;
    }
    reset() {
        return this.channel.call('reset');
    }
    resetRemote() {
        return this.channel.call('resetRemote');
    }
    resetLocal() {
        return this.channel.call('resetLocal');
    }
    hasPreviouslySynced() {
        return this.channel.call('hasPreviouslySynced');
    }
    hasLocalData() {
        return this.channel.call('hasLocalData');
    }
    accept(syncResource, resource, content, apply) {
        return this.channel.call('accept', [syncResource, resource, content, apply]);
    }
    resolveContent(resource) {
        return this.channel.call('resolveContent', [resource]);
    }
    cleanUpRemoteData() {
        return this.channel.call('cleanUpRemoteData');
    }
    replace(syncResourceHandle) {
        return this.channel.call('replace', [syncResourceHandle]);
    }
    saveRemoteActivityData(location) {
        return this.channel.call('getRemoteActivityData', [location]);
    }
    extractActivityData(activityDataResource, location) {
        return this.channel.call('extractActivityData', [activityDataResource, location]);
    }
    async updateStatus(status) {
        this._status = status;
        this._onDidChangeStatus.fire(status);
    }
    async updateConflicts(conflicts) {
        // Revive URIs
        this._conflicts = conflicts.map(syncConflict => ({
            syncResource: syncConflict.syncResource,
            profile: reviveProfile(syncConflict.profile, this.userDataProfilesService.profilesHome.scheme),
            conflicts: syncConflict.conflicts.map(r => ({
                ...r,
                baseResource: URI.revive(r.baseResource),
                localResource: URI.revive(r.localResource),
                remoteResource: URI.revive(r.remoteResource),
                previewResource: URI.revive(r.previewResource),
            }))
        }));
        this._onDidChangeConflicts.fire(this._conflicts);
    }
    updateLastSyncTime(lastSyncTime) {
        if (this._lastSyncTime !== lastSyncTime) {
            this._lastSyncTime = lastSyncTime;
            this._onDidChangeLastSyncTime.fire(lastSyncTime);
        }
    }
};
UserDataSyncServiceChannelClient = __decorate([
    __param(1, IUserDataProfilesService)
], UserDataSyncServiceChannelClient);
export { UserDataSyncServiceChannelClient };
class ManualSyncTaskChannelClient extends Disposable {
    constructor(id, channel) {
        super();
        this.id = id;
        this.channel = channel;
    }
    async merge() {
        return this.channel.call('merge');
    }
    async apply() {
        return this.channel.call('apply');
    }
    stop() {
        return this.channel.call('stop');
    }
    dispose() {
        this.channel.call('dispose');
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jU2VydmljZUlwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jU2VydmljZUlwYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUdsRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDMUcsT0FBTyxFQUVvQixpQkFBaUIsRUFDM0MsTUFBTSxtQkFBbUIsQ0FBQztBQUkzQixTQUFTLGtCQUFrQixDQUFDLFlBQW1DLEVBQUUsdUJBQWlEO0lBQ2pILE9BQU8sRUFBRSxHQUFHLFlBQVksRUFBRSxPQUFPLEVBQUUsYUFBYSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsdUJBQXVCLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDdkgsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQUMsa0JBQXVDO0lBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsa0JBQWtCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDekYsQ0FBQztBQUVELE1BQU0sT0FBTywwQkFBMEI7SUFLdEMsWUFDa0IsT0FBNkIsRUFDN0IsdUJBQWlELEVBQ2pELFVBQXVCO1FBRnZCLFlBQU8sR0FBUCxPQUFPLENBQXNCO1FBQzdCLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDakQsZUFB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