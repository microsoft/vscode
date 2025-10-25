/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isAndroid, isChrome, isEdge, isFirefox, isSafari, isWeb, Platform, platform, PlatformToString } from '../../../base/common/platform.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IProductService } from '../../product/common/productService.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { IUserData, IUserDataManifest, IUserDataSyncLogService, IUserDataSyncStoreService } from './userDataSync.js';

export interface IMachineData {
	id: string;
	name: string;
	disabled?: boolean;
	platform?: string;
}

export interface IMachinesData {
	version: number;
	machines: IMachineData[];
}

export type IUserDataSyncMachine = Readonly<IMachineData> & { readonly isCurrent: boolean };

export const IUserDataSyncMachinesService = createDecorator<IUserDataSyncMachinesService>('IUserDataSyncMachinesService');
export interface IUserDataSyncMachinesService {
	_serviceBrand: any;

	readonly onDidChange: Event<void>;

	getMachines(manifest?: IUserDataManifest): Promise<IUserDataSyncMachine[]>;

	addCurrentMachine(manifest?: IUserDataManifest): Promise<void>;
	removeCurrentMachine(manifest?: IUserDataManifest): Promise<void>;
	renameMachine(machineId: string, name: string): Promise<void>;
	setEnablements(enbalements: [string, boolean][]): Promise<void>;
}

const currentMachineNameKey = 'sync.currentMachineName';

const Safari = 'Safari';
const Chrome = 'Chrome';
const Edge = 'Edge';
const Firefox = 'Firefox';
const Android = 'Android';

export function isWebPlatform(platform: string) {
	switch (platform) {
		case Safari:
		case Chrome:
		case Edge:
		case Firefox:
		case Android:
		case PlatformToString(Platform.Web):
			return true;
	}
	return false;
}

function getPlatformName(): string {
	if (isSafari) { return Safari; }
	if (isChrome) { return Chrome; }
	if (isEdge) { return Edge; }
	if (isFirefox) { return Firefox; }
	if (isAndroid) { return Android; }
	return PlatformToString(isWeb ? Platform.Web : platform);
}

export class UserDataSyncMachinesService extends Disposable implements IUserDataSyncMachinesService {

	private static readonly VERSION = 1;
	private static readonly RESOURCE = 'machines';

	_serviceBrand: any;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly currentMachineIdPromise: Promise<string>;
	private userData: IUserData | null = null;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.currentMachineIdPromise = getServiceMachineId(environmentService, fileService, storageService);
	}

	async getMachines(manifest?: IUserDataManifest): Promise<IUserDataSyncMachine[]> {
		const currentMachineId = await this.currentMachineIdPromise;
		const machineData = await this.readMachinesData(manifest);
		return machineData.machines.map<IUserDataSyncMachine>(machine => ({ ...machine, ...{ isCurrent: machine.id === currentMachineId } }));
	}

	async addCurrentMachine(manifest?: IUserDataManifest): Promise<void> {
		const currentMachineId = await this.currentMachineIdPromise;
		const machineData = await this.readMachinesData(manifest);
		if (!machineData.machines.some(({ id }) => id === currentMachineId)) {
			machineData.machines.push({ id: currentMachineId, name: this.computeCurrentMachineName(machineData.machines), platform: getPlatformName() });
			await this.writeMachinesData(machineData);
		}
	}

	async removeCurrentMachine(manifest?: IUserDataManifest): Promise<void> {
		const currentMachineId = await this.currentMachineIdPromise;
		const machineData = await this.readMachinesData(manifest);
		const updatedMachines = machineData.machines.filter(({ id }) => id !== currentMachineId);
		if (updatedMachines.length !== machineData.machines.length) {
			machineData.machines = updatedMachines;
			await this.writeMachinesData(machineData);
		}
	}

	async renameMachine(machineId: string, name: string, manifest?: IUserDataManifest): Promise<void> {
		const machineData = await this.readMachinesData(manifest);
		const machine = machineData.machines.find(({ id }) => id === machineId);
		if (machine) {
			machine.name = name;
			await this.writeMachinesData(machineData);
			const currentMachineId = await this.currentMachineIdPromise;
			if (machineId === currentMachineId) {
				this.storageService.store(currentMachineNameKey, name, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}
	}

	async setEnablements(enablements: [string, boolean][]): Promise<void> {
		const machineData = await this.readMachinesData();
		for (const [machineId, enabled] of enablements) {
			const machine = machineData.machines.find(machine => machine.id === machineId);
			if (machine) {
				machine.disabled = enabled ? undefined : true;
			}
		}
		await this.writeMachinesData(machineData);
	}

	private computeCurrentMachineName(machines: IMachineData[]): string {
		const previousName = this.storageService.get(currentMachineNameKey, StorageScope.APPLICATION);
		if (previousName) {
			if (!machines.some(machine => machine.name === previousName)) {
				return previousName;
			}
			this.storageService.remove(currentMachineNameKey, StorageScope.APPLICATION);
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

	private async readMachinesData(manifest?: IUserDataManifest): Promise<IMachinesData> {
		this.userData = await this.readUserData(manifest);
		const machinesData = this.parse(this.userData);
		if (machinesData.version !== UserDataSyncMachinesService.VERSION) {
			throw new Error(localize('error incompatible', "Cannot read machines data as the current version is incompatible. Please update {0} and try again.", this.productService.nameLong));
		}
		return machinesData;
	}

	private async writeMachinesData(machinesData: IMachinesData): Promise<void> {
		const content = JSON.stringify(machinesData);
		const ref = await this.userDataSyncStoreService.writeResource(UserDataSyncMachinesService.RESOURCE, content, this.userData?.ref || null);
		this.userData = { ref, content };
		this._onDidChange.fire();
	}

	private async readUserData(manifest?: IUserDataManifest): Promise<IUserData> {
		if (this.userData) {

			const latestRef = manifest && manifest.latest ? manifest.latest[UserDataSyncMachinesService.RESOURCE] : undefined;

			// Last time synced resource and latest resource on server are same
			if (this.userData.ref === latestRef) {
				return this.userData;
			}

			// There is no resource on server and last time it was synced with no resource
			if (latestRef === undefined && this.userData.content === null) {
				return this.userData;
			}
		}

		return this.userDataSyncStoreService.readResource(UserDataSyncMachinesService.RESOURCE, this.userData);
	}

	private parse(userData: IUserData): IMachinesData {
		if (userData.content !== null) {
			try {
				return JSON.parse(userData.content);
			} catch (e) {
				this.logService.error(e);
			}
		}
		return {
			version: UserDataSyncMachinesService.VERSION,
			machines: []
		};
	}
}
