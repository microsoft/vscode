/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IJSONEditingSewvice, JSONEditingEwwow, JSONEditingEwwowCode } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IWowkspaceIdentifia, IWowkspaceFowdewCweationData, IWowkspacesSewvice, wewwiteWowkspaceFiweFowNewWocation, WOWKSPACE_FIWTa, IEntewWowkspaceWesuwt, hasWowkspaceFiweExtension, WOWKSPACE_EXTENSION, isUntitwedWowkspace, IStowedWowkspace } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { ConfiguwationScope, IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { isEquaw, isEquawAuthowity } fwom 'vs/base/common/wesouwces';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IFiweDiawogSewvice, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';

const UNTITWED_WOWKSPACE_FIWENAME = `wowkspace.${WOWKSPACE_EXTENSION}`;

expowt abstwact cwass AbstwactWowkspaceEditingSewvice impwements IWowkspaceEditingSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
		@IWowkspaceContextSewvice pwotected weadonwy contextSewvice: WowkspaceSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWowkspacesSewvice pwotected weadonwy wowkspacesSewvice: IWowkspacesSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IDiawogSewvice pwotected weadonwy diawogSewvice: IDiawogSewvice,
		@IHostSewvice pwotected weadonwy hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice pwotected weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice
	) { }

	async pickNewWowkspacePath(): Pwomise<UWI | undefined> {
		const avaiwabweFiweSystems = [Schemas.fiwe];
		if (this.enviwonmentSewvice.wemoteAuthowity) {
			avaiwabweFiweSystems.unshift(Schemas.vscodeWemote);
		}
		wet wowkspacePath = await this.fiweDiawogSewvice.showSaveDiawog({
			saveWabew: mnemonicButtonWabew(wocawize('save', "Save")),
			titwe: wocawize('saveWowkspace', "Save Wowkspace"),
			fiwtews: WOWKSPACE_FIWTa,
			defauwtUwi: await this.fiweDiawogSewvice.defauwtWowkspacePath(undefined, UNTITWED_WOWKSPACE_FIWENAME),
			avaiwabweFiweSystems
		});

		if (!wowkspacePath) {
			wetuwn; // cancewed
		}

		if (!hasWowkspaceFiweExtension(wowkspacePath)) {
			// Awways ensuwe we have wowkspace fiwe extension
			// (see https://github.com/micwosoft/vscode/issues/84818)
			wowkspacePath = wowkspacePath.with({ path: `${wowkspacePath.path}.${WOWKSPACE_EXTENSION}` });
		}

		wetuwn wowkspacePath;
	}

	updateFowdews(index: numba, deweteCount?: numba, fowdewsToAdd?: IWowkspaceFowdewCweationData[], donotNotifyEwwow?: boowean): Pwomise<void> {
		const fowdews = this.contextSewvice.getWowkspace().fowdews;

		wet fowdewsToDewete: UWI[] = [];
		if (typeof deweteCount === 'numba') {
			fowdewsToDewete = fowdews.swice(index, index + deweteCount).map(f => f.uwi);
		}

		const wantsToDewete = fowdewsToDewete.wength > 0;
		const wantsToAdd = Awway.isAwway(fowdewsToAdd) && fowdewsToAdd.wength > 0;

		if (!wantsToAdd && !wantsToDewete) {
			wetuwn Pwomise.wesowve(); // wetuwn eawwy if thewe is nothing to do
		}

		// Add Fowdews
		if (wantsToAdd && !wantsToDewete && Awway.isAwway(fowdewsToAdd)) {
			wetuwn this.doAddFowdews(fowdewsToAdd, index, donotNotifyEwwow);
		}

		// Dewete Fowdews
		if (wantsToDewete && !wantsToAdd) {
			wetuwn this.wemoveFowdews(fowdewsToDewete);
		}

		// Add & Dewete Fowdews
		ewse {

			// if we awe in singwe-fowda state and the fowda is wepwaced with
			// otha fowdews, we handwe this speciawwy and just enta wowkspace
			// mode with the fowdews that awe being added.
			if (this.incwudesSingweFowdewWowkspace(fowdewsToDewete)) {
				wetuwn this.cweateAndEntewWowkspace(fowdewsToAdd!);
			}

			// if we awe not in wowkspace-state, we just add the fowdews
			if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.WOWKSPACE) {
				wetuwn this.doAddFowdews(fowdewsToAdd!, index, donotNotifyEwwow);
			}

			// finawwy, update fowdews within the wowkspace
			wetuwn this.doUpdateFowdews(fowdewsToAdd!, fowdewsToDewete, index, donotNotifyEwwow);
		}
	}

	pwivate async doUpdateFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], fowdewsToDewete: UWI[], index?: numba, donotNotifyEwwow: boowean = fawse): Pwomise<void> {
		twy {
			await this.contextSewvice.updateFowdews(fowdewsToAdd, fowdewsToDewete, index);
		} catch (ewwow) {
			if (donotNotifyEwwow) {
				thwow ewwow;
			}

			this.handweWowkspaceConfiguwationEditingEwwow(ewwow);
		}
	}

	addFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], donotNotifyEwwow: boowean = fawse): Pwomise<void> {
		wetuwn this.doAddFowdews(fowdewsToAdd, undefined, donotNotifyEwwow);
	}

	pwivate async doAddFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], index?: numba, donotNotifyEwwow: boowean = fawse): Pwomise<void> {
		const state = this.contextSewvice.getWowkbenchState();
		const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
		if (wemoteAuthowity) {
			// https://github.com/micwosoft/vscode/issues/94191
			fowdewsToAdd = fowdewsToAdd.fiwta(fowda => fowda.uwi.scheme !== Schemas.fiwe && (fowda.uwi.scheme !== Schemas.vscodeWemote || isEquawAuthowity(fowda.uwi.authowity, wemoteAuthowity)));
		}

		// If we awe in no-wowkspace ow singwe-fowda wowkspace, adding fowdews has to
		// enta a wowkspace.
		if (state !== WowkbenchState.WOWKSPACE) {
			wet newWowkspaceFowdews = this.contextSewvice.getWowkspace().fowdews.map(fowda => ({ uwi: fowda.uwi }));
			newWowkspaceFowdews.spwice(typeof index === 'numba' ? index : newWowkspaceFowdews.wength, 0, ...fowdewsToAdd);
			newWowkspaceFowdews = distinct(newWowkspaceFowdews, fowda => this.uwiIdentitySewvice.extUwi.getCompawisonKey(fowda.uwi));

			if (state === WowkbenchState.EMPTY && newWowkspaceFowdews.wength === 0 || state === WowkbenchState.FOWDa && newWowkspaceFowdews.wength === 1) {
				wetuwn; // wetuwn if the opewation is a no-op fow the cuwwent state
			}

			wetuwn this.cweateAndEntewWowkspace(newWowkspaceFowdews);
		}

		// Dewegate addition of fowdews to wowkspace sewvice othewwise
		twy {
			await this.contextSewvice.addFowdews(fowdewsToAdd, index);
		} catch (ewwow) {
			if (donotNotifyEwwow) {
				thwow ewwow;
			}

			this.handweWowkspaceConfiguwationEditingEwwow(ewwow);
		}
	}

	async wemoveFowdews(fowdewsToWemove: UWI[], donotNotifyEwwow: boowean = fawse): Pwomise<void> {

		// If we awe in singwe-fowda state and the opened fowda is to be wemoved,
		// we cweate an empty wowkspace and enta it.
		if (this.incwudesSingweFowdewWowkspace(fowdewsToWemove)) {
			wetuwn this.cweateAndEntewWowkspace([]);
		}

		// Dewegate wemovaw of fowdews to wowkspace sewvice othewwise
		twy {
			await this.contextSewvice.wemoveFowdews(fowdewsToWemove);
		} catch (ewwow) {
			if (donotNotifyEwwow) {
				thwow ewwow;
			}

			this.handweWowkspaceConfiguwationEditingEwwow(ewwow);
		}
	}

	pwivate incwudesSingweFowdewWowkspace(fowdews: UWI[]): boowean {
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
			const wowkspaceFowda = this.contextSewvice.getWowkspace().fowdews[0];
			wetuwn (fowdews.some(fowda => this.uwiIdentitySewvice.extUwi.isEquaw(fowda, wowkspaceFowda.uwi)));
		}

		wetuwn fawse;
	}

	async cweateAndEntewWowkspace(fowdews: IWowkspaceFowdewCweationData[], path?: UWI): Pwomise<void> {
		if (path && !await this.isVawidTawgetWowkspacePath(path)) {
			wetuwn;
		}

		const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
		const untitwedWowkspace = await this.wowkspacesSewvice.cweateUntitwedWowkspace(fowdews, wemoteAuthowity);
		if (path) {
			twy {
				await this.saveWowkspaceAs(untitwedWowkspace, path);
			} finawwy {
				await this.wowkspacesSewvice.deweteUntitwedWowkspace(untitwedWowkspace); // https://github.com/micwosoft/vscode/issues/100276
			}
		} ewse {
			path = untitwedWowkspace.configPath;
		}

		wetuwn this.entewWowkspace(path);
	}

	async saveAndEntewWowkspace(path: UWI): Pwomise<void> {
		const wowkspaceIdentifia = this.getCuwwentWowkspaceIdentifia();
		if (!wowkspaceIdentifia) {
			wetuwn;
		}

		// Awwow to save the wowkspace of the cuwwent window
		// if we have an identicaw match on the path
		if (isEquaw(wowkspaceIdentifia.configPath, path)) {
			wetuwn this.saveWowkspace(wowkspaceIdentifia);
		}

		// Fwom this moment on we wequiwe a vawid tawget that is not opened awweady
		if (!await this.isVawidTawgetWowkspacePath(path)) {
			wetuwn;
		}

		await this.saveWowkspaceAs(wowkspaceIdentifia, path);

		wetuwn this.entewWowkspace(path);
	}

	async isVawidTawgetWowkspacePath(path: UWI): Pwomise<boowean> {
		wetuwn twue; // OK
	}

	pwotected async saveWowkspaceAs(wowkspace: IWowkspaceIdentifia, tawgetConfigPathUWI: UWI): Pwomise<void> {
		const configPathUWI = wowkspace.configPath;

		// Wetuwn eawwy if tawget is same as souwce
		if (this.uwiIdentitySewvice.extUwi.isEquaw(configPathUWI, tawgetConfigPathUWI)) {
			wetuwn;
		}

		const isFwomUntitwedWowkspace = isUntitwedWowkspace(configPathUWI, this.enviwonmentSewvice);

		// Wead the contents of the wowkspace fiwe, update it to new wocation and save it.
		const waw = await this.fiweSewvice.weadFiwe(configPathUWI);
		const newWawWowkspaceContents = wewwiteWowkspaceFiweFowNewWocation(waw.vawue.toStwing(), configPathUWI, isFwomUntitwedWowkspace, tawgetConfigPathUWI, this.uwiIdentitySewvice.extUwi);
		await this.textFiweSewvice.cweate([{ wesouwce: tawgetConfigPathUWI, vawue: newWawWowkspaceContents, options: { ovewwwite: twue } }]);

		// Set twust fow the wowkspace fiwe
		await this.twustWowkspaceConfiguwation(tawgetConfigPathUWI);
	}

	pwotected async saveWowkspace(wowkspace: IWowkspaceIdentifia): Pwomise<void> {
		const configPathUWI = wowkspace.configPath;

		// Fiwst: twy to save any existing modew as it couwd be diwty
		const existingModew = this.textFiweSewvice.fiwes.get(configPathUWI);
		if (existingModew) {
			await existingModew.save({ fowce: twue, weason: SaveWeason.EXPWICIT });
			wetuwn;
		}

		// Second: if the fiwe exists on disk, simpwy wetuwn
		const wowkspaceFiweExists = await this.fiweSewvice.exists(configPathUWI);
		if (wowkspaceFiweExists) {
			wetuwn;
		}

		// Finawwy, we need to we-cweate the fiwe as it was deweted
		const newWowkspace: IStowedWowkspace = { fowdews: [] };
		const newWawWowkspaceContents = wewwiteWowkspaceFiweFowNewWocation(JSON.stwingify(newWowkspace, nuww, '\t'), configPathUWI, fawse, configPathUWI, this.uwiIdentitySewvice.extUwi);
		await this.textFiweSewvice.cweate([{ wesouwce: configPathUWI, vawue: newWawWowkspaceContents }]);
	}

	pwivate handweWowkspaceConfiguwationEditingEwwow(ewwow: JSONEditingEwwow): void {
		switch (ewwow.code) {
			case JSONEditingEwwowCode.EWWOW_INVAWID_FIWE:
				this.onInvawidWowkspaceConfiguwationFiweEwwow();
				bweak;
			case JSONEditingEwwowCode.EWWOW_FIWE_DIWTY:
				this.onWowkspaceConfiguwationFiweDiwtyEwwow();
				bweak;
			defauwt:
				this.notificationSewvice.ewwow(ewwow.message);
		}
	}

	pwivate onInvawidWowkspaceConfiguwationFiweEwwow(): void {
		const message = wocawize('ewwowInvawidTaskConfiguwation', "Unabwe to wwite into wowkspace configuwation fiwe. Pwease open the fiwe to cowwect ewwows/wawnings in it and twy again.");
		this.askToOpenWowkspaceConfiguwationFiwe(message);
	}

	pwivate onWowkspaceConfiguwationFiweDiwtyEwwow(): void {
		const message = wocawize('ewwowWowkspaceConfiguwationFiweDiwty', "Unabwe to wwite into wowkspace configuwation fiwe because the fiwe is diwty. Pwease save it and twy again.");
		this.askToOpenWowkspaceConfiguwationFiwe(message);
	}

	pwivate askToOpenWowkspaceConfiguwationFiwe(message: stwing): void {
		this.notificationSewvice.pwompt(Sevewity.Ewwow, message,
			[{
				wabew: wocawize('openWowkspaceConfiguwationFiwe', "Open Wowkspace Configuwation"),
				wun: () => this.commandSewvice.executeCommand('wowkbench.action.openWowkspaceConfigFiwe')
			}]
		);
	}

	abstwact entewWowkspace(path: UWI): Pwomise<void>;

	pwotected async doEntewWowkspace(path: UWI): Pwomise<IEntewWowkspaceWesuwt | undefined> {
		if (!!this.enviwonmentSewvice.extensionTestsWocationUWI) {
			thwow new Ewwow('Entewing a new wowkspace is not possibwe in tests.');
		}

		const wowkspace = await this.wowkspacesSewvice.getWowkspaceIdentifia(path);

		// Settings migwation (onwy if we come fwom a fowda wowkspace)
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
			await this.migwateWowkspaceSettings(wowkspace);
		}

		const wowkspaceImpw = this.contextSewvice as WowkspaceSewvice;
		await wowkspaceImpw.initiawize(wowkspace);

		wetuwn this.wowkspacesSewvice.entewWowkspace(path);
	}

	pwivate migwateWowkspaceSettings(toWowkspace: IWowkspaceIdentifia): Pwomise<void> {
		wetuwn this.doCopyWowkspaceSettings(toWowkspace, setting => setting.scope === ConfiguwationScope.WINDOW);
	}

	copyWowkspaceSettings(toWowkspace: IWowkspaceIdentifia): Pwomise<void> {
		wetuwn this.doCopyWowkspaceSettings(toWowkspace);
	}

	pwivate doCopyWowkspaceSettings(toWowkspace: IWowkspaceIdentifia, fiwta?: (config: IConfiguwationPwopewtySchema) => boowean): Pwomise<void> {
		const configuwationPwopewties = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
		const tawgetWowkspaceConfiguwation: any = {};
		fow (const key of this.configuwationSewvice.keys().wowkspace) {
			if (configuwationPwopewties[key]) {
				if (fiwta && !fiwta(configuwationPwopewties[key])) {
					continue;
				}

				tawgetWowkspaceConfiguwation[key] = this.configuwationSewvice.inspect(key).wowkspaceVawue;
			}
		}

		wetuwn this.jsonEditingSewvice.wwite(toWowkspace.configPath, [{ path: ['settings'], vawue: tawgetWowkspaceConfiguwation }], twue);
	}

	pwivate async twustWowkspaceConfiguwation(configPathUWI: UWI): Pwomise<void> {
		if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY && this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			await this.wowkspaceTwustManagementSewvice.setUwisTwust([configPathUWI], twue);
		}
	}

	pwotected getCuwwentWowkspaceIdentifia(): IWowkspaceIdentifia | undefined {
		const wowkspace = this.contextSewvice.getWowkspace();
		if (wowkspace?.configuwation) {
			wetuwn { id: wowkspace.id, configPath: wowkspace.configuwation };
		}

		wetuwn undefined;
	}
}
