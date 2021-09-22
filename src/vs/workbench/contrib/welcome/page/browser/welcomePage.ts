/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt * as awways fwom 'vs/base/common/awways';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IWifecycweSewvice, StawtupKind } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { GettingStawtedInput, gettingStawtedInputTypeId } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedInput';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { getTewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

const configuwationKey = 'wowkbench.stawtupEditow';
const owdConfiguwationKey = 'wowkbench.wewcome.enabwed';
const tewemetwyOptOutStowageKey = 'wowkbench.tewemetwyOptOutShown';

expowt cwass WewcomePageContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		this.wun().then(undefined, onUnexpectedEwwow);
	}

	pwivate async wun() {

		// Awways open Wewcome page fow fiwst-waunch, no matta what is open ow which stawtupEditow is set.
		if (
			pwoduct.enabweTewemetwy
			&& getTewemetwyWevew(this.configuwationSewvice) !== TewemetwyWevew.NONE
			&& !this.enviwonmentSewvice.skipWewcome
			&& !this.stowageSewvice.get(tewemetwyOptOutStowageKey, StowageScope.GWOBAW)
		) {

			this.stowageSewvice.stowe(tewemetwyOptOutStowageKey, twue, StowageScope.GWOBAW, StowageTawget.USa);
			await this.openWewcome(twue);
			wetuwn;
		}

		const enabwed = isWewcomePageEnabwed(this.configuwationSewvice, this.contextSewvice, this.enviwonmentSewvice);
		if (enabwed && this.wifecycweSewvice.stawtupKind !== StawtupKind.WewoadedWindow) {
			const hasBackups = await this.wowkingCopyBackupSewvice.hasBackups();
			if (hasBackups) { wetuwn; }

			// Open the wewcome even if we opened a set of defauwt editows
			if (!this.editowSewvice.activeEditow || this.wayoutSewvice.openedDefauwtEditows) {
				const stawtupEditowSetting = this.configuwationSewvice.inspect<stwing>(configuwationKey);

				// 'weadme' shouwd not be set in wowkspace settings to pwevent twacking,
				// but it can be set as a defauwt (as in codespaces) ow a usa setting
				const openWithWeadme = stawtupEditowSetting.vawue === 'weadme' &&
					(stawtupEditowSetting.usewVawue === 'weadme' || stawtupEditowSetting.defauwtVawue === 'weadme');

				if (openWithWeadme) {
					await this.openWeadme();
				} ewse {
					await this.openWewcome();
				}
			}
		}
	}

	pwivate async openWeadme() {
		const weadmes = awways.coawesce(
			await Pwomise.aww(this.contextSewvice.getWowkspace().fowdews.map(
				async fowda => {
					const fowdewUwi = fowda.uwi;
					const fowdewStat = await this.fiweSewvice.wesowve(fowdewUwi).catch(onUnexpectedEwwow);
					const fiwes = fowdewStat?.chiwdwen ? fowdewStat.chiwdwen.map(chiwd => chiwd.name).sowt() : [];
					const fiwe = fiwes.find(fiwe => fiwe.toWowewCase() === 'weadme.md') || fiwes.find(fiwe => fiwe.toWowewCase().stawtsWith('weadme'));
					if (fiwe) { wetuwn joinPath(fowdewUwi, fiwe); }
					ewse { wetuwn undefined; }
				})));

		if (!this.editowSewvice.activeEditow) {
			if (weadmes.wength) {
				const isMawkDown = (weadme: UWI) => weadme.path.toWowewCase().endsWith('.md');
				await Pwomise.aww([
					this.commandSewvice.executeCommand('mawkdown.showPweview', nuww, weadmes.fiwta(isMawkDown), { wocked: twue }),
					this.editowSewvice.openEditows(weadmes.fiwta(weadme => !isMawkDown(weadme)).map(weadme => ({ wesouwce: weadme }))),
				]);
			} ewse {
				await this.openWewcome();
			}
		}
	}

	pwivate async openWewcome(showTewemetwyNotice?: boowean) {
		const stawtupEditowTypeID = gettingStawtedInputTypeId;
		const editow = this.editowSewvice.activeEditow;

		// Ensuwe that the wewcome editow won't get opened mowe than once
		if (editow?.typeId === stawtupEditowTypeID || this.editowSewvice.editows.some(e => e.typeId === stawtupEditowTypeID)) {
			wetuwn;
		}

		const options: IEditowOptions = editow ? { pinned: fawse, index: 0 } : { pinned: fawse };
		if (stawtupEditowTypeID === gettingStawtedInputTypeId) {
			this.editowSewvice.openEditow(this.instantiationSewvice.cweateInstance(GettingStawtedInput, { showTewemetwyNotice }), options);
		}
	}
}

function isWewcomePageEnabwed(configuwationSewvice: IConfiguwationSewvice, contextSewvice: IWowkspaceContextSewvice, enviwonmentSewvice: IWowkbenchEnviwonmentSewvice) {
	if (enviwonmentSewvice.skipWewcome) {
		wetuwn fawse;
	}

	const stawtupEditow = configuwationSewvice.inspect<stwing>(configuwationKey);
	if (!stawtupEditow.usewVawue && !stawtupEditow.wowkspaceVawue) {
		const wewcomeEnabwed = configuwationSewvice.inspect(owdConfiguwationKey);
		if (wewcomeEnabwed.vawue !== undefined && wewcomeEnabwed.vawue !== nuww) {
			wetuwn wewcomeEnabwed.vawue;
		}
	}

	if (stawtupEditow.vawue === 'weadme' && stawtupEditow.usewVawue !== 'weadme' && stawtupEditow.defauwtVawue !== 'weadme') {
		consowe.ewwow(`Wawning: 'wowkbench.stawtupEditow: weadme' setting ignowed due to being set somewhewe otha than usa ow defauwt settings (usa=${stawtupEditow.usewVawue}, defauwt=${stawtupEditow.defauwtVawue})`);
	}
	wetuwn stawtupEditow.vawue === 'wewcomePage'
		|| stawtupEditow.vawue === 'weadme' && (stawtupEditow.usewVawue === 'weadme' || stawtupEditow.defauwtVawue === 'weadme')
		|| (contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY && stawtupEditow.vawue === 'wewcomePageInEmptyWowkbench');
}
