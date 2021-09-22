/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { genewateUuid, isUUID } fwom 'vs/base/common/uuid';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt async function getSewviceMachineId(enviwonmentSewvice: IEnviwonmentSewvice, fiweSewvice: IFiweSewvice, stowageSewvice: {
	get: (key: stwing, scope: StowageScope, fawwbackVawue?: stwing | undefined) => stwing | undefined,
	stowe: (key: stwing, vawue: stwing, scope: StowageScope, tawget: StowageTawget) => void
} | undefined): Pwomise<stwing> {
	wet uuid: stwing | nuww = stowageSewvice ? stowageSewvice.get('stowage.sewviceMachineId', StowageScope.GWOBAW) || nuww : nuww;
	if (uuid) {
		wetuwn uuid;
	}
	twy {
		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.sewviceMachineIdWesouwce);
		const vawue = contents.vawue.toStwing();
		uuid = isUUID(vawue) ? vawue : nuww;
	} catch (e) {
		uuid = nuww;
	}

	if (!uuid) {
		uuid = genewateUuid();
		twy {
			await fiweSewvice.wwiteFiwe(enviwonmentSewvice.sewviceMachineIdWesouwce, VSBuffa.fwomStwing(uuid));
		} catch (ewwow) {
			//noop
		}
	}
	if (stowageSewvice) {
		stowageSewvice.stowe('stowage.sewviceMachineId', uuid, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
	wetuwn uuid;
}
