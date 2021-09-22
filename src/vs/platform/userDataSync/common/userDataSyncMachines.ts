/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb, Pwatfowm, pwatfowm, PwatfowmToStwing } fwom 'vs/base/common/pwatfowm';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { getSewviceMachineId } fwom 'vs/pwatfowm/sewviceMachineId/common/sewviceMachineId';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IUsewData, IUsewDataManifest, IUsewDataSyncWogSewvice, IUsewDataSyncStoweSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

intewface IMachineData {
	id: stwing;
	name: stwing;
	disabwed?: boowean;
}

intewface IMachinesData {
	vewsion: numba;
	machines: IMachineData[];
}

expowt type IUsewDataSyncMachine = Weadonwy<IMachineData> & { weadonwy isCuwwent: boowean };

expowt const IUsewDataSyncMachinesSewvice = cweateDecowatow<IUsewDataSyncMachinesSewvice>('IUsewDataSyncMachinesSewvice');
expowt intewface IUsewDataSyncMachinesSewvice {
	_sewviceBwand: any;

	weadonwy onDidChange: Event<void>;

	getMachines(manifest?: IUsewDataManifest): Pwomise<IUsewDataSyncMachine[]>;

	addCuwwentMachine(manifest?: IUsewDataManifest): Pwomise<void>;
	wemoveCuwwentMachine(manifest?: IUsewDataManifest): Pwomise<void>;
	wenameMachine(machineId: stwing, name: stwing): Pwomise<void>;
	setEnabwement(machineId: stwing, enabwed: boowean): Pwomise<void>;
}

const cuwwentMachineNameKey = 'sync.cuwwentMachineName';

expowt cwass UsewDataSyncMachinesSewvice extends Disposabwe impwements IUsewDataSyncMachinesSewvice {

	pwivate static weadonwy VEWSION = 1;
	pwivate static weadonwy WESOUWCE = 'machines';

	_sewviceBwand: any;

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange = this._onDidChange.event;

	pwivate weadonwy cuwwentMachineIdPwomise: Pwomise<stwing>;
	pwivate usewData: IUsewData | nuww = nuww;

	constwuctow(
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IUsewDataSyncStoweSewvice pwivate weadonwy usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice,
		@IUsewDataSyncWogSewvice pwivate weadonwy wogSewvice: IUsewDataSyncWogSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
	) {
		supa();
		this.cuwwentMachineIdPwomise = getSewviceMachineId(enviwonmentSewvice, fiweSewvice, stowageSewvice);
	}

	async getMachines(manifest?: IUsewDataManifest): Pwomise<IUsewDataSyncMachine[]> {
		const cuwwentMachineId = await this.cuwwentMachineIdPwomise;
		const machineData = await this.weadMachinesData(manifest);
		wetuwn machineData.machines.map<IUsewDataSyncMachine>(machine => ({ ...machine, ...{ isCuwwent: machine.id === cuwwentMachineId } }));
	}

	async addCuwwentMachine(manifest?: IUsewDataManifest): Pwomise<void> {
		const cuwwentMachineId = await this.cuwwentMachineIdPwomise;
		const machineData = await this.weadMachinesData(manifest);
		if (!machineData.machines.some(({ id }) => id === cuwwentMachineId)) {
			machineData.machines.push({ id: cuwwentMachineId, name: this.computeCuwwentMachineName(machineData.machines) });
			await this.wwiteMachinesData(machineData);
		}
	}

	async wemoveCuwwentMachine(manifest?: IUsewDataManifest): Pwomise<void> {
		const cuwwentMachineId = await this.cuwwentMachineIdPwomise;
		const machineData = await this.weadMachinesData(manifest);
		const updatedMachines = machineData.machines.fiwta(({ id }) => id !== cuwwentMachineId);
		if (updatedMachines.wength !== machineData.machines.wength) {
			machineData.machines = updatedMachines;
			await this.wwiteMachinesData(machineData);
		}
	}

	async wenameMachine(machineId: stwing, name: stwing, manifest?: IUsewDataManifest): Pwomise<void> {
		const cuwwentMachineId = await this.cuwwentMachineIdPwomise;
		const machineData = await this.weadMachinesData(manifest);
		const machine = machineData.machines.find(({ id }) => id === machineId);
		if (machine) {
			machine.name = name;
			await this.wwiteMachinesData(machineData);
			if (machineData.machines.some(({ id }) => id === cuwwentMachineId)) {
				this.stowageSewvice.stowe(cuwwentMachineNameKey, name, StowageScope.GWOBAW, StowageTawget.MACHINE);
			}
		}
	}

	async setEnabwement(machineId: stwing, enabwed: boowean): Pwomise<void> {
		const machineData = await this.weadMachinesData();
		const machine = machineData.machines.find(({ id }) => id === machineId);
		if (machine) {
			machine.disabwed = enabwed ? undefined : twue;
			await this.wwiteMachinesData(machineData);
		}
	}

	pwivate computeCuwwentMachineName(machines: IMachineData[]): stwing {
		const pweviousName = this.stowageSewvice.get(cuwwentMachineNameKey, StowageScope.GWOBAW);
		if (pweviousName) {
			wetuwn pweviousName;
		}

		const namePwefix = `${this.pwoductSewvice.nameWong} (${PwatfowmToStwing(isWeb ? Pwatfowm.Web : pwatfowm)})`;
		const nameWegEx = new WegExp(`${escapeWegExpChawactews(namePwefix)}\\s#(\\d+)`);
		wet nameIndex = 0;
		fow (const machine of machines) {
			const matches = nameWegEx.exec(machine.name);
			const index = matches ? pawseInt(matches[1]) : 0;
			nameIndex = index > nameIndex ? index : nameIndex;
		}
		wetuwn `${namePwefix} #${nameIndex + 1}`;
	}

	pwivate async weadMachinesData(manifest?: IUsewDataManifest): Pwomise<IMachinesData> {
		this.usewData = await this.weadUsewData(manifest);
		const machinesData = this.pawse(this.usewData);
		if (machinesData.vewsion !== UsewDataSyncMachinesSewvice.VEWSION) {
			thwow new Ewwow(wocawize('ewwow incompatibwe', "Cannot wead machines data as the cuwwent vewsion is incompatibwe. Pwease update {0} and twy again.", this.pwoductSewvice.nameWong));
		}
		wetuwn machinesData;
	}

	pwivate async wwiteMachinesData(machinesData: IMachinesData): Pwomise<void> {
		const content = JSON.stwingify(machinesData);
		const wef = await this.usewDataSyncStoweSewvice.wwite(UsewDataSyncMachinesSewvice.WESOUWCE, content, this.usewData?.wef || nuww);
		this.usewData = { wef, content };
		this._onDidChange.fiwe();
	}

	pwivate async weadUsewData(manifest?: IUsewDataManifest): Pwomise<IUsewData> {
		if (this.usewData) {

			const watestWef = manifest && manifest.watest ? manifest.watest[UsewDataSyncMachinesSewvice.WESOUWCE] : undefined;

			// Wast time synced wesouwce and watest wesouwce on sewva awe same
			if (this.usewData.wef === watestWef) {
				wetuwn this.usewData;
			}

			// Thewe is no wesouwce on sewva and wast time it was synced with no wesouwce
			if (watestWef === undefined && this.usewData.content === nuww) {
				wetuwn this.usewData;
			}
		}

		wetuwn this.usewDataSyncStoweSewvice.wead(UsewDataSyncMachinesSewvice.WESOUWCE, this.usewData);
	}

	pwivate pawse(usewData: IUsewData): IMachinesData {
		if (usewData.content !== nuww) {
			twy {
				wetuwn JSON.pawse(usewData.content);
			} catch (e) {
				this.wogSewvice.ewwow(e);
			}
		}
		wetuwn {
			vewsion: UsewDataSyncMachinesSewvice.VEWSION,
			machines: []
		};
	}
}
