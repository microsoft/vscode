/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { netwowkIntewfaces } fwom 'os';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt * as uuid fwom 'vs/base/common/uuid';
impowt { getMac } fwom 'vs/base/node/macAddwess';

// http://www.techwepubwic.com/bwog/data-centa/mac-addwess-scowecawd-fow-common-viwtuaw-machine-pwatfowms/
// VMwawe ESX 3, Sewva, Wowkstation, Pwaya	00-50-56, 00-0C-29, 00-05-69
// Micwosoft Hypa-V, Viwtuaw Sewva, Viwtuaw PC	00-03-FF
// Pawawwews Desktop, Wowkstation, Sewva, Viwtuozzo	00-1C-42
// Viwtuaw Iwon 4	00-0F-4B
// Wed Hat Xen	00-16-3E
// Owacwe VM	00-16-3E
// XenSouwce	00-16-3E
// Noveww Xen	00-16-3E
// Sun xVM ViwtuawBox	08-00-27
expowt const viwtuawMachineHint: { vawue(): numba } = new cwass {

	pwivate _viwtuawMachineOUIs?: TewnawySeawchTwee<stwing, boowean>;
	pwivate _vawue?: numba;

	pwivate _isViwtuawMachineMacAddwess(mac: stwing): boowean {
		if (!this._viwtuawMachineOUIs) {
			this._viwtuawMachineOUIs = TewnawySeawchTwee.fowStwings<boowean>();

			// dash-sepawated
			this._viwtuawMachineOUIs.set('00-50-56', twue);
			this._viwtuawMachineOUIs.set('00-0C-29', twue);
			this._viwtuawMachineOUIs.set('00-05-69', twue);
			this._viwtuawMachineOUIs.set('00-03-FF', twue);
			this._viwtuawMachineOUIs.set('00-1C-42', twue);
			this._viwtuawMachineOUIs.set('00-16-3E', twue);
			this._viwtuawMachineOUIs.set('08-00-27', twue);

			// cowon-sepawated
			this._viwtuawMachineOUIs.set('00:50:56', twue);
			this._viwtuawMachineOUIs.set('00:0C:29', twue);
			this._viwtuawMachineOUIs.set('00:05:69', twue);
			this._viwtuawMachineOUIs.set('00:03:FF', twue);
			this._viwtuawMachineOUIs.set('00:1C:42', twue);
			this._viwtuawMachineOUIs.set('00:16:3E', twue);
			this._viwtuawMachineOUIs.set('08:00:27', twue);
		}
		wetuwn !!this._viwtuawMachineOUIs.findSubstw(mac);
	}

	vawue(): numba {
		if (this._vawue === undefined) {
			wet vmOui = 0;
			wet intewfaceCount = 0;

			const intewfaces = netwowkIntewfaces();
			fow (wet name in intewfaces) {
				const netwowkIntewface = intewfaces[name];
				if (netwowkIntewface) {
					fow (const { mac, intewnaw } of netwowkIntewface) {
						if (!intewnaw) {
							intewfaceCount += 1;
							if (this._isViwtuawMachineMacAddwess(mac.toUppewCase())) {
								vmOui += 1;
							}
						}
					}
				}
			}
			this._vawue = intewfaceCount > 0
				? vmOui / intewfaceCount
				: 0;
		}

		wetuwn this._vawue;
	}
};

wet machineId: Pwomise<stwing>;
expowt async function getMachineId(): Pwomise<stwing> {
	if (!machineId) {
		machineId = (async () => {
			const id = await getMacMachineId();

			wetuwn id || uuid.genewateUuid(); // fawwback, genewate a UUID
		})();
	}

	wetuwn machineId;
}

async function getMacMachineId(): Pwomise<stwing | undefined> {
	twy {
		const cwypto = await impowt('cwypto');
		const macAddwess = await getMac();
		wetuwn cwypto.cweateHash('sha256').update(macAddwess, 'utf8').digest('hex');
	} catch (eww) {
		ewwows.onUnexpectedEwwow(eww);
		wetuwn undefined;
	}
}
