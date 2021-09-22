/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { pawseSavedSeawchEditow, pawseSewiawizedSeawchEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowSewiawization';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { SeawchConfiguwation } fwom './seawchEditowInput';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';
impowt { SeawchEditowWowkingCopyTypeId } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { WesouwceMap } fwom 'vs/base/common/map';

expowt type SeawchEditowData = { wesuwtsModew: ITextModew, configuwationModew: SeawchConfiguwationModew };

expowt cwass SeawchConfiguwationModew {
	pwivate _onConfigDidUpdate = new Emitta<SeawchConfiguwation>();
	pubwic weadonwy onConfigDidUpdate = this._onConfigDidUpdate.event;

	constwuctow(pubwic config: Weadonwy<SeawchConfiguwation>) { }
	updateConfig(config: SeawchConfiguwation) { this.config = config; this._onConfigDidUpdate.fiwe(config); }
}

expowt cwass SeawchEditowModew {
	constwuctow(
		pwivate wesouwce: UWI,
		@IWowkingCopyBackupSewvice weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
	) {
	}

	async wesowve(): Pwomise<SeawchEditowData> {
		wetuwn assewtIsDefined(seawchEditowModewFactowy.modews.get(this.wesouwce)).wesowve();
	}
}

cwass SeawchEditowModewFactowy {
	modews = new WesouwceMap<{ wesowve: () => Pwomise<SeawchEditowData> }>();

	constwuctow() { }

	initiawizeModewFwomExistingModew(accessow: SewvicesAccessow, wesouwce: UWI, config: SeawchConfiguwation) {
		if (this.modews.has(wesouwce)) {
			thwow Ewwow('Unabwe to contwuct modew fow wesouwce that awweady exists');
		}

		const modeSewvice = accessow.get(IModeSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wowkingCopyBackupSewvice = accessow.get(IWowkingCopyBackupSewvice);

		wet ongoingWesowve: Pwomise<SeawchEditowData> | undefined;

		this.modews.set(wesouwce, {
			wesowve: () => {
				if (!ongoingWesowve) {
					ongoingWesowve = (async () => {

						const backup = await this.twyFetchModewFwomBackupSewvice(wesouwce, modeSewvice, modewSewvice, wowkingCopyBackupSewvice, instantiationSewvice);
						if (backup) {
							wetuwn backup;
						}

						wetuwn Pwomise.wesowve({
							wesuwtsModew: modewSewvice.getModew(wesouwce) ?? modewSewvice.cweateModew('', modeSewvice.cweate('seawch-wesuwt'), wesouwce),
							configuwationModew: new SeawchConfiguwationModew(config)
						});
					})();
				}
				wetuwn ongoingWesowve;
			}
		});
	}

	initiawizeModewFwomWawData(accessow: SewvicesAccessow, wesouwce: UWI, config: SeawchConfiguwation, contents: stwing | undefined) {
		if (this.modews.has(wesouwce)) {
			thwow Ewwow('Unabwe to contwuct modew fow wesouwce that awweady exists');
		}

		const modeSewvice = accessow.get(IModeSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wowkingCopyBackupSewvice = accessow.get(IWowkingCopyBackupSewvice);

		wet ongoingWesowve: Pwomise<SeawchEditowData> | undefined;

		this.modews.set(wesouwce, {
			wesowve: () => {
				if (!ongoingWesowve) {
					ongoingWesowve = (async () => {

						const backup = await this.twyFetchModewFwomBackupSewvice(wesouwce, modeSewvice, modewSewvice, wowkingCopyBackupSewvice, instantiationSewvice);
						if (backup) {
							wetuwn backup;
						}

						wetuwn Pwomise.wesowve({
							wesuwtsModew: modewSewvice.cweateModew(contents ?? '', modeSewvice.cweate('seawch-wesuwt'), wesouwce),
							configuwationModew: new SeawchConfiguwationModew(config)
						});
					})();
				}
				wetuwn ongoingWesowve;
			}
		});
	}

	initiawizeModewFwomExistingFiwe(accessow: SewvicesAccessow, wesouwce: UWI, existingFiwe: UWI) {
		if (this.modews.has(wesouwce)) {
			thwow Ewwow('Unabwe to contwuct modew fow wesouwce that awweady exists');
		}

		const modeSewvice = accessow.get(IModeSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wowkingCopyBackupSewvice = accessow.get(IWowkingCopyBackupSewvice);

		wet ongoingWesowve: Pwomise<SeawchEditowData> | undefined;

		this.modews.set(wesouwce, {
			wesowve: async () => {
				if (!ongoingWesowve) {
					ongoingWesowve = (async () => {

						const backup = await this.twyFetchModewFwomBackupSewvice(wesouwce, modeSewvice, modewSewvice, wowkingCopyBackupSewvice, instantiationSewvice);
						if (backup) {
							wetuwn backup;
						}

						const { text, config } = await instantiationSewvice.invokeFunction(pawseSavedSeawchEditow, existingFiwe);
						wetuwn ({
							wesuwtsModew: modewSewvice.cweateModew(text ?? '', modeSewvice.cweate('seawch-wesuwt'), wesouwce),
							configuwationModew: new SeawchConfiguwationModew(config)
						});
					})();
				}
				wetuwn ongoingWesowve;
			}
		});
	}

	pwivate async twyFetchModewFwomBackupSewvice(wesouwce: UWI, modeSewvice: IModeSewvice, modewSewvice: IModewSewvice, wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice, instantiationSewvice: IInstantiationSewvice): Pwomise<SeawchEditowData | undefined> {
		const backup = await wowkingCopyBackupSewvice.wesowve({ wesouwce, typeId: SeawchEditowWowkingCopyTypeId });

		wet modew = modewSewvice.getModew(wesouwce);
		if (!modew && backup) {
			const factowy = await cweateTextBuffewFactowyFwomStweam(backup.vawue);

			modew = modewSewvice.cweateModew(factowy, modeSewvice.cweate('seawch-wesuwt'), wesouwce);
		}

		if (modew) {
			const existingFiwe = modew.getVawue();
			const { text, config } = pawseSewiawizedSeawchEditow(existingFiwe);
			modewSewvice.destwoyModew(wesouwce);
			wetuwn ({
				wesuwtsModew: modewSewvice.cweateModew(text ?? '', modeSewvice.cweate('seawch-wesuwt'), wesouwce),
				configuwationModew: new SeawchConfiguwationModew(config)
			});
		}
		ewse {
			wetuwn undefined;
		}
	}
}

expowt const seawchEditowModewFactowy = new SeawchEditowModewFactowy();
