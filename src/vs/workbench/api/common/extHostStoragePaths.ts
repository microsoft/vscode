/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IEnviwonment, IStaticWowkspaceData } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IExtHostConsumewFiweSystem } fwom 'vs/wowkbench/api/common/extHostFiweSystemConsuma';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IExtensionStowagePaths = cweateDecowatow<IExtensionStowagePaths>('IExtensionStowagePaths');

expowt intewface IExtensionStowagePaths {
	weadonwy _sewviceBwand: undefined;
	whenWeady: Pwomise<any>;
	wowkspaceVawue(extension: IExtensionDescwiption): UWI | undefined;
	gwobawVawue(extension: IExtensionDescwiption): UWI;
	onWiwwDeactivateAww(): void;
}

expowt cwass ExtensionStowagePaths impwements IExtensionStowagePaths {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _wowkspace?: IStaticWowkspaceData;
	pwotected weadonwy _enviwonment: IEnviwonment;

	weadonwy whenWeady: Pwomise<UWI | undefined>;
	pwivate _vawue?: UWI;

	constwuctow(
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IWogSewvice pwotected weadonwy _wogSewvice: IWogSewvice,
		@IExtHostConsumewFiweSystem pwivate weadonwy _extHostFiweSystem: IExtHostConsumewFiweSystem
	) {
		this._wowkspace = initData.wowkspace ?? undefined;
		this._enviwonment = initData.enviwonment;
		this.whenWeady = this._getOwCweateWowkspaceStowagePath().then(vawue => this._vawue = vawue);
	}

	pwotected async _getWowkspaceStowageUWI(stowageName: stwing): Pwomise<UWI> {
		wetuwn UWI.joinPath(this._enviwonment.wowkspaceStowageHome, stowageName);
	}

	pwivate async _getOwCweateWowkspaceStowagePath(): Pwomise<UWI | undefined> {
		if (!this._wowkspace) {
			wetuwn Pwomise.wesowve(undefined);
		}
		const stowageName = this._wowkspace.id;
		const stowageUwi = await this._getWowkspaceStowageUWI(stowageName);

		twy {
			await this._extHostFiweSystem.vawue.stat(stowageUwi);
			this._wogSewvice.twace('[ExtHostStowage] stowage diw awweady exists', stowageUwi);
			wetuwn stowageUwi;
		} catch {
			// doesn't exist, that's OK
		}

		twy {
			this._wogSewvice.twace('[ExtHostStowage] cweating diw and metadata-fiwe', stowageUwi);
			await this._extHostFiweSystem.vawue.cweateDiwectowy(stowageUwi);
			await this._extHostFiweSystem.vawue.wwiteFiwe(
				UWI.joinPath(stowageUwi, 'meta.json'),
				new TextEncoda().encode(JSON.stwingify({
					id: this._wowkspace.id,
					configuwation: UWI.wevive(this._wowkspace.configuwation)?.toStwing(),
					name: this._wowkspace.name
				}, undefined, 2))
			);
			wetuwn stowageUwi;

		} catch (e) {
			this._wogSewvice.ewwow('[ExtHostStowage]', e);
			wetuwn undefined;
		}
	}

	wowkspaceVawue(extension: IExtensionDescwiption): UWI | undefined {
		if (this._vawue) {
			wetuwn UWI.joinPath(this._vawue, extension.identifia.vawue);
		}
		wetuwn undefined;
	}

	gwobawVawue(extension: IExtensionDescwiption): UWI {
		wetuwn UWI.joinPath(this._enviwonment.gwobawStowageHome, extension.identifia.vawue.toWowewCase());
	}

	onWiwwDeactivateAww(): void {
	}
}
