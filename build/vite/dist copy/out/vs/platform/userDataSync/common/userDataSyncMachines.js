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
var UserDataSyncMachinesService_1;
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isAndroid, isChrome, isEdge, isFirefox, isSafari, isWeb, platform, PlatformToString } from '../../../base/common/platform.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IUserDataSyncLogService, IUserDataSyncStoreService } from './userDataSync.js';
export const IUserDataSyncMachinesService = createDecorator('IUserDataSyncMachinesService');
const currentMachineNameKey = 'sync.currentMachineName';
const Safari = 'Safari';
const Chrome = 'Chrome';
const Edge = 'Edge';
const Firefox = 'Firefox';
const Android = 'Android';
export function isWebPlatform(platform) {
    switch (platform) {
        case Safari:
        case Chrome:
        case Edge:
        case Firefox:
        case Android:
        case PlatformToString(0 /* Platform.Web */):
            return true;
    }
    return false;
}
function getPlatformName() {
    if (isSafari) {
        return Safari;
    }
    if (isChrome) {
        return Chrome;
    }
    if (isEdge) {
        return Edge;
    }
    if (isFirefox) {
        return Firefox;
    }
    if (isAndroid) {
        return Android;
    }
    return PlatformToString(isWeb ? 0 /* Platform.Web */ : platform);
}
let UserDataSyncMachinesService = class UserDataSyncMachinesService extends Disposable {
    static { UserDataSyncMachinesService_1 = this; }
    static { this.VERSION = 1; }
    static { this.RESOURCE = 'machines'; }
    constructor(environmentService, fileService, storageService, userDataSyncStoreService, logService, productService) {
        super();
        this.storageService = storageService;
        this.userDataSyncStoreService = userDataSyncStoreService;
        this.logService = logService;
        this.productService = productService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.userData = null;
        this.currentMachineIdPromise = getServiceMachineId(environmentService, fileService, storageService);
    }
    async getMachines(manifest) {
        const currentMachineId = await this.currentMachineIdPromise;
        const machineData = await this.readMachinesData(manifest);
        return machineData.machines.map(machine => ({ ...machine, ...{ isCurrent: machine.id === currentMachineId } }));
    }
    async addCurrentMachine(manifest) {
        const currentMachineId = await this.currentMachineIdPromise;
        const machineData = await this.readMachinesData(manifest);
        if (!machineData.machines.some(({ id }) => id === currentMachineId)) {
            machineData.machines.push({ id: currentMachineId, name: this.computeCurrentMachineName(machineData.machines), platform: getPlatformName() });
            await this.writeMachinesData(machineData);
        }
    }
    async removeCurrentMachine(manifest) {
        const currentMachineId = await this.currentMachineIdPromise;
        const machineData = await this.readMachinesData(manifest);
        const updatedMachines = machineData.machines.filter(({ id }) => id !== currentMachineId);
        if (updatedMachines.length !== machineData.machines.length) {
            machineData.machines = updatedMachines;
            await this.writeMachinesData(machineData);
        }
    }
    async renameMachine(machineId, name, manifest) {
        const machineData = await this.readMachinesData(manifest);
        const machine = machineData.machines.find(({ id }) => id === machineId);
        if (machine) {
            machine.name = name;
            await this.writeMachinesData(machineData);
            const currentMachineId = await this.currentMachineIdPromise;
            if (machineId === currentMachineId) {
                this.storageService.store(currentMachineNameKey, name, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
        }
    }
    async setEnablements(enablements) {
        const machineData = await this.readMachinesData();
        for (const [machineId, enabled] of enablements) {
            const machine = machineData.machines.find(machine => machine.id === machineId);
            if (machine) {
                machine.disabled = enabled ? undefined : true;
            }
        }
        await this.writeMachinesData(machineData);
    }
    computeCurrentMachineName(machines) {
        const previousName = this.storageService.get(currentMachineNameKey, -1 /* StorageScope.APPLICATION */);
        if (previousName) {
            if (!machines.some(machine => machine.name === previousName)) {
                return previousName;
            }
            this.storageService.remove(currentMachineNameKey, -1 /* StorageScope.APPLICATION */);
        }
        const namePrefix = `${this.productService.embedderIdentifier ? `${this.productService.embedderIdentifier} - ` : ''}${getPlatformName()} (${this.productService.nameShort})`;
        const nameRegEx = new RegExp(`${escapeRegExpCharacters(namePrefix)}\\s#(\\d+)`);
        let nameIndex = 0;
        for (const machine of machines) {
            const matches = nameRegEx.exec(machine.name);
            const index = matches ? parseInt(matches[1]) : 0;
            nameIndex = index > nameIndex ? index : nameIndex;
        }
        return `${namePrefix} #${nameIndex + 1}`;
    }
    async readMachinesData(manifest) {
        this.userData = await this.readUserData(manifest);
        const machinesData = this.parse(this.userData);
        if (machinesData.version !== UserDataSyncMachinesService_1.VERSION) {
            throw new Error(localize('error incompatible', "Cannot read machines data as the current version is incompatible. Please update {0} and try again.", this.productService.nameLong));
        }
        return machinesData;
    }
    async writeMachinesData(machinesData) {
        const content = JSON.stringify(machinesData);
        const ref = await this.userDataSyncStoreService.writeResource(UserDataSyncMachinesService_1.RESOURCE, content, this.userData?.ref || null);
        this.userData = { ref, content };
        this._onDidChange.fire();
    }
    async readUserData(manifest) {
        if (this.userData) {
            const latestRef = manifest && manifest.latest ? manifest.latest[UserDataSyncMachinesService_1.RESOURCE] : undefined;
            // Last time synced resource and latest resource on server are same
            if (this.userData.ref === latestRef) {
                return this.userData;
            }
            // There is no resource on server and last time it was synced with no resource
            if (latestRef === undefined && this.userData.content === null) {
                return this.userData;
            }
        }
        return this.userDataSyncStoreService.readResource(UserDataSyncMachinesService_1.RESOURCE, this.userData);
    }
    parse(userData) {
        if (userData.content !== null) {
            try {
                return JSON.parse(userData.content);
            }
            catch (e) {
                this.logService.error(e);
            }
        }
        return {
            version: UserDataSyncMachinesService_1.VERSION,
            machines: []
        };
    }
};
UserDataSyncMachinesService = UserDataSyncMachinesService_1 = __decorate([
    __param(0, IEnvironmentService),
    __param(1, IFileService),
    __param(2, IStorageService),
    __param(3, IUserDataSyncStoreService),
    __param(4, IUserDataSyncLogService),
    __param(5, IProductService)
], UserDataSyncMachinesService);
export { UserDataSyncMachinesService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jTWFjaGluZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luY01hY2hpbmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBWSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqSixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRixPQUFPLEVBQWdDLHVCQUF1QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFnQnJILE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLGVBQWUsQ0FBK0IsOEJBQThCLENBQUMsQ0FBQztBQWMxSCxNQUFNLHFCQUFxQixHQUFHLHlCQUF5QixDQUFDO0FBRXhELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztBQUN4QixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUM7QUFDeEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ3BCLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQztBQUMxQixNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUM7QUFFMUIsTUFBTSxVQUFVLGFBQWEsQ0FBQyxRQUFnQjtJQUM3QyxRQUFRLFFBQVEsRUFBRSxDQUFDO1FBQ2xCLEtBQUssTUFBTSxDQUFDO1FBQ1osS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLElBQUksQ0FBQztRQUNWLEtBQUssT0FBTyxDQUFDO1FBQ2IsS0FBSyxPQUFPLENBQUM7UUFDYixLQUFLLGdCQUFnQixzQkFBYztZQUNsQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGVBQWU7SUFDdkIsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUFDLE9BQU8sTUFBTSxDQUFDO0lBQUMsQ0FBQztJQUNoQyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQUMsT0FBTyxNQUFNLENBQUM7SUFBQyxDQUFDO0lBQ2hDLElBQUksTUFBTSxFQUFFLENBQUM7UUFBQyxPQUFPLElBQUksQ0FBQztJQUFDLENBQUM7SUFDNUIsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUFDLE9BQU8sT0FBTyxDQUFDO0lBQUMsQ0FBQztJQUNsQyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQUMsT0FBTyxPQUFPLENBQUM7SUFBQyxDQUFDO0lBQ2xDLE9BQU8sZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsc0JBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQzFELENBQUM7QUFFTSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7O2FBRWxDLFlBQU8sR0FBRyxDQUFDLEFBQUosQ0FBSzthQUNaLGFBQVEsR0FBRyxVQUFVLEFBQWIsQ0FBYztJQVU5QyxZQUNzQixrQkFBdUMsRUFDOUMsV0FBeUIsRUFDdEIsY0FBZ0QsRUFDdEMsd0JBQW9FLEVBQ3RFLFVBQW9ELEVBQzVELGNBQWdEO1FBRWpFLEtBQUssRUFBRSxDQUFDO1FBTDBCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUNyQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTJCO1FBQ3JELGVBQVUsR0FBVixVQUFVLENBQXlCO1FBQzNDLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQVpqRCxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFHdkMsYUFBUSxHQUFxQixJQUFJLENBQUM7UUFXekMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLG1CQUFtQixDQUFDLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUE0QjtRQUM3QyxNQUFNLGdCQUFnQixHQUFHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBQzVELE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFELE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQXVCLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3ZJLENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBNEI7UUFDbkQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztRQUM1RCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQ3JFLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxJQUFJLENBQUMseUJBQXlCLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDN0ksTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDM0MsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsUUFBNEI7UUFDdEQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztRQUM1RCxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3pGLElBQUksZUFBZSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzVELFdBQVcsQ0FBQyxRQUFRLEdBQUcsZUFBZSxDQUFDO1lBQ3ZDLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzNDLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFpQixFQUFFLElBQVksRUFBRSxRQUE0QjtRQUNoRixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxTQUFTLENBQUMsQ0FBQztRQUN4RSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7WUFDcEIsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDMUMsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztZQUM1RCxJQUFJLFNBQVMsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNwQyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLG1FQUFrRCxDQUFDO1lBQ3pHLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsV0FBZ0M7UUFDcEQsTUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUNsRCxLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7WUFDaEQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLFNBQVMsQ0FBQyxDQUFDO1lBQy9FLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQy9DLENBQUM7UUFDRixDQUFDO1FBQ0QsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVPLHlCQUF5QixDQUFDLFFBQXdCO1FBQ3pELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixvQ0FBMkIsQ0FBQztRQUM5RixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUM5RCxPQUFPLFlBQVksQ0FBQztZQUNyQixDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMscUJBQXFCLG9DQUEyQixDQUFDO1FBQzdFLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsZUFBZSxFQUFFLEtBQUssSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEdBQUcsQ0FBQztRQUM1SyxNQUFNLFNBQVMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNoRixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pELFNBQVMsR0FBRyxLQUFLLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNuRCxDQUFDO1FBQ0QsT0FBTyxHQUFHLFVBQVUsS0FBSyxTQUFTLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFDMUMsQ0FBQztJQUVPLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUE0QjtRQUMxRCxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNsRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQyxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssNkJBQTJCLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsb0dBQW9HLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3JMLENBQUM7UUFDRCxPQUFPLFlBQVksQ0FBQztJQUNyQixDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLFlBQTJCO1FBQzFELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0MsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLDZCQUEyQixDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLElBQUksSUFBSSxDQUFDLENBQUM7UUFDekksSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQTRCO1FBQ3RELElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBRW5CLE1BQU0sU0FBUyxHQUFHLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLDZCQUEyQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFFbEgsbUVBQW1FO1lBQ25FLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3JDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztZQUN0QixDQUFDO1lBRUQsOEVBQThFO1lBQzlFLElBQUksU0FBUyxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDL0QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsWUFBWSxDQUFDLDZCQUEyQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEcsQ0FBQztJQUVPLEtBQUssQ0FBQyxRQUFtQjtRQUNoQyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDO2dCQUNKLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ1osSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPO1lBQ04sT0FBTyxFQUFFLDZCQUEyQixDQUFDLE9BQU87WUFDNUMsUUFBUSxFQUFFLEVBQUU7U0FDWixDQUFDO0lBQ0gsQ0FBQzs7QUE3SVcsMkJBQTJCO0lBY3JDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLGVBQWUsQ0FBQTtHQW5CTCwyQkFBMkIsQ0E4SXZDIn0=