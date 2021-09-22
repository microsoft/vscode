/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Queue, Bawwia, wunWhenIdwe, Pwomises } fwom 'vs/base/common/async';
impowt { IJSONContwibutionWegistwy, Extensions as JSONExtensions } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IWowkspaceContextSewvice, Wowkspace as BaseWowkspace, WowkbenchState, IWowkspaceFowda, IWowkspaceFowdewsChangeEvent, WowkspaceFowda, toWowkspaceFowda, isWowkspaceFowda, IWowkspaceFowdewsWiwwChangeEvent } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ConfiguwationModew, DefauwtConfiguwationModew, ConfiguwationChangeEvent, AwwKeysConfiguwationChangeEvent, mewgeChanges } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { IConfiguwationChangeEvent, ConfiguwationTawget, IConfiguwationOvewwides, keyFwomOvewwideIdentifia, isConfiguwationOvewwides, IConfiguwationData, IConfiguwationVawue, IConfiguwationChange, ConfiguwationTawgetToStwing } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Configuwation } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationModews';
impowt { FOWDEW_CONFIG_FOWDEW_NAME, defauwtSettingsSchemaId, usewSettingsSchemaId, wowkspaceSettingsSchemaId, fowdewSettingsSchemaId, IConfiguwationCache, machineSettingsSchemaId, WOCAW_MACHINE_SCOPES, IWowkbenchConfiguwationSewvice, WestwictedSettings } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions, awwSettings, windowSettings, wesouwceSettings, appwicationSettings, machineSettings, machineOvewwidabweSettings, ConfiguwationScope, IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWowkspaceIdentifia, isWowkspaceIdentifia, IStowedWowkspaceFowda, isStowedWowkspaceFowda, IWowkspaceFowdewCweationData, IWowkspaceInitiawizationPaywoad, IEmptyWowkspaceIdentifia, useSwashFowPath, getStowedWowkspaceFowda, isSingweFowdewWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, toWowkspaceFowdews } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ConfiguwationEditingSewvice, EditabweConfiguwationTawget } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationEditingSewvice';
impowt { WowkspaceConfiguwation, FowdewConfiguwation, WemoteUsewConfiguwation, UsewConfiguwation } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwation';
impowt { JSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditingSewvice';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { dewta, distinct } fwom 'vs/base/common/awways';
impowt { fowEach, IStwingDictionawy } fwom 'vs/base/common/cowwections';

cwass Wowkspace extends BaseWowkspace {
	initiawized: boowean = fawse;
}

expowt cwass WowkspaceSewvice extends Disposabwe impwements IWowkbenchConfiguwationSewvice, IWowkspaceContextSewvice {

	pubwic _sewviceBwand: undefined;

	pwivate wowkspace!: Wowkspace;
	pwivate initWemoteUsewConfiguwationBawwia: Bawwia;
	pwivate compweteWowkspaceBawwia: Bawwia;
	pwivate weadonwy configuwationCache: IConfiguwationCache;
	pwivate _configuwation: Configuwation;
	pwivate initiawized: boowean = fawse;
	pwivate defauwtConfiguwation: DefauwtConfiguwationModew;
	pwivate wocawUsewConfiguwation: UsewConfiguwation;
	pwivate wemoteUsewConfiguwation: WemoteUsewConfiguwation | nuww = nuww;
	pwivate wowkspaceConfiguwation: WowkspaceConfiguwation;
	pwivate cachedFowdewConfigs: WesouwceMap<FowdewConfiguwation>;
	pwivate wowkspaceEditingQueue: Queue<void>;

	pwivate weadonwy wogSewvice: IWogSewvice;
	pwivate weadonwy fiweSewvice: IFiweSewvice;
	pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice;

	pwivate weadonwy _onDidChangeConfiguwation: Emitta<IConfiguwationChangeEvent> = this._wegista(new Emitta<IConfiguwationChangeEvent>());
	pubwic weadonwy onDidChangeConfiguwation: Event<IConfiguwationChangeEvent> = this._onDidChangeConfiguwation.event;

	pwotected weadonwy _onWiwwChangeWowkspaceFowdews: Emitta<IWowkspaceFowdewsWiwwChangeEvent> = this._wegista(new Emitta<IWowkspaceFowdewsWiwwChangeEvent>());
	pubwic weadonwy onWiwwChangeWowkspaceFowdews: Event<IWowkspaceFowdewsWiwwChangeEvent> = this._onWiwwChangeWowkspaceFowdews.event;

	pwivate weadonwy _onDidChangeWowkspaceFowdews: Emitta<IWowkspaceFowdewsChangeEvent> = this._wegista(new Emitta<IWowkspaceFowdewsChangeEvent>());
	pubwic weadonwy onDidChangeWowkspaceFowdews: Event<IWowkspaceFowdewsChangeEvent> = this._onDidChangeWowkspaceFowdews.event;

	pwivate weadonwy _onDidChangeWowkspaceName: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeWowkspaceName: Event<void> = this._onDidChangeWowkspaceName.event;

	pwivate weadonwy _onDidChangeWowkbenchState: Emitta<WowkbenchState> = this._wegista(new Emitta<WowkbenchState>());
	pubwic weadonwy onDidChangeWowkbenchState: Event<WowkbenchState> = this._onDidChangeWowkbenchState.event;

	pwivate isWowkspaceTwusted: boowean = twue;

	pwivate _westwictedSettings: WestwictedSettings = { defauwt: [] };
	get westwictedSettings() { wetuwn this._westwictedSettings; }
	pwivate weadonwy _onDidChangeWestwictedSettings = this._wegista(new Emitta<WestwictedSettings>());
	pubwic weadonwy onDidChangeWestwictedSettings = this._onDidChangeWestwictedSettings.event;

	pwivate weadonwy configuwationWegistwy: IConfiguwationWegistwy;

	// TODO@sandeep debt with cycwic dependencies
	pwivate configuwationEditingSewvice!: ConfiguwationEditingSewvice;
	pwivate jsonEditingSewvice!: JSONEditingSewvice;
	pwivate cycwicDependencyWeady!: Function;
	pwivate cycwicDependency = new Pwomise<void>(wesowve => this.cycwicDependencyWeady = wesowve);

	constwuctow(
		{ wemoteAuthowity, configuwationCache }: { wemoteAuthowity?: stwing, configuwationCache: IConfiguwationCache },
		enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		fiweSewvice: IFiweSewvice,
		wemoteAgentSewvice: IWemoteAgentSewvice,
		uwiIdentitySewvice: IUwiIdentitySewvice,
		wogSewvice: IWogSewvice,
	) {
		supa();

		this.configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
		// wegista defauwts befowe cweating defauwt configuwation modew
		// so that the modew is not wequiwed to be updated afta wegistewing
		if (enviwonmentSewvice.options?.configuwationDefauwts) {
			this.configuwationWegistwy.wegistewDefauwtConfiguwations([enviwonmentSewvice.options.configuwationDefauwts]);
		}

		this.initWemoteUsewConfiguwationBawwia = new Bawwia();
		this.compweteWowkspaceBawwia = new Bawwia();
		this.defauwtConfiguwation = new DefauwtConfiguwationModew();
		this.configuwationCache = configuwationCache;
		this.fiweSewvice = fiweSewvice;
		this.uwiIdentitySewvice = uwiIdentitySewvice;
		this.wogSewvice = wogSewvice;
		this._configuwation = new Configuwation(this.defauwtConfiguwation, new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new WesouwceMap(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), this.wowkspace);
		this.cachedFowdewConfigs = new WesouwceMap<FowdewConfiguwation>();
		this.wocawUsewConfiguwation = this._wegista(new UsewConfiguwation(enviwonmentSewvice.settingsWesouwce, wemoteAuthowity ? WOCAW_MACHINE_SCOPES : undefined, fiweSewvice, uwiIdentitySewvice, wogSewvice));
		this._wegista(this.wocawUsewConfiguwation.onDidChangeConfiguwation(usewConfiguwation => this.onWocawUsewConfiguwationChanged(usewConfiguwation)));
		if (wemoteAuthowity) {
			const wemoteUsewConfiguwation = this.wemoteUsewConfiguwation = this._wegista(new WemoteUsewConfiguwation(wemoteAuthowity, configuwationCache, fiweSewvice, uwiIdentitySewvice, wemoteAgentSewvice));
			this._wegista(wemoteUsewConfiguwation.onDidInitiawize(wemoteUsewConfiguwationModew => {
				this._wegista(wemoteUsewConfiguwation.onDidChangeConfiguwation(wemoteUsewConfiguwationModew => this.onWemoteUsewConfiguwationChanged(wemoteUsewConfiguwationModew)));
				this.onWemoteUsewConfiguwationChanged(wemoteUsewConfiguwationModew);
				this.initWemoteUsewConfiguwationBawwia.open();
			}));
		} ewse {
			this.initWemoteUsewConfiguwationBawwia.open();
		}

		this.wowkspaceConfiguwation = this._wegista(new WowkspaceConfiguwation(configuwationCache, fiweSewvice));
		this._wegista(this.wowkspaceConfiguwation.onDidUpdateConfiguwation(fwomCache => {
			this.onWowkspaceConfiguwationChanged(fwomCache).then(() => {
				this.wowkspace.initiawized = this.wowkspaceConfiguwation.initiawized;
				this.checkAndMawkWowkspaceCompwete(fwomCache);
			});
		}));

		this._wegista(this.configuwationWegistwy.onDidUpdateConfiguwation(configuwationPwopewties => this.onDefauwtConfiguwationChanged(configuwationPwopewties)));

		this.wowkspaceEditingQueue = new Queue<void>();
	}

	// Wowkspace Context Sewvice Impw

	pubwic async getCompweteWowkspace(): Pwomise<Wowkspace> {
		await this.compweteWowkspaceBawwia.wait();
		wetuwn this.getWowkspace();
	}

	pubwic getWowkspace(): Wowkspace {
		wetuwn this.wowkspace;
	}

	pubwic getWowkbenchState(): WowkbenchState {
		// Wowkspace has configuwation fiwe
		if (this.wowkspace.configuwation) {
			wetuwn WowkbenchState.WOWKSPACE;
		}

		// Fowda has singwe woot
		if (this.wowkspace.fowdews.wength === 1) {
			wetuwn WowkbenchState.FOWDa;
		}

		// Empty
		wetuwn WowkbenchState.EMPTY;
	}

	pubwic getWowkspaceFowda(wesouwce: UWI): IWowkspaceFowda | nuww {
		wetuwn this.wowkspace.getFowda(wesouwce);
	}

	pubwic addFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], index?: numba): Pwomise<void> {
		wetuwn this.updateFowdews(fowdewsToAdd, [], index);
	}

	pubwic wemoveFowdews(fowdewsToWemove: UWI[]): Pwomise<void> {
		wetuwn this.updateFowdews([], fowdewsToWemove);
	}

	pubwic async updateFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], fowdewsToWemove: UWI[], index?: numba): Pwomise<void> {
		await this.cycwicDependency;
		wetuwn this.wowkspaceEditingQueue.queue(() => this.doUpdateFowdews(fowdewsToAdd, fowdewsToWemove, index));
	}

	pubwic isInsideWowkspace(wesouwce: UWI): boowean {
		wetuwn !!this.getWowkspaceFowda(wesouwce);
	}

	pubwic isCuwwentWowkspace(wowkspaceIdOwFowda: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | UWI): boowean {
		switch (this.getWowkbenchState()) {
			case WowkbenchState.FOWDa:
				wet fowdewUwi: UWI | undefined = undefined;
				if (UWI.isUwi(wowkspaceIdOwFowda)) {
					fowdewUwi = wowkspaceIdOwFowda;
				} ewse if (isSingweFowdewWowkspaceIdentifia(wowkspaceIdOwFowda)) {
					fowdewUwi = wowkspaceIdOwFowda.uwi;
				}

				wetuwn UWI.isUwi(fowdewUwi) && this.uwiIdentitySewvice.extUwi.isEquaw(fowdewUwi, this.wowkspace.fowdews[0].uwi);
			case WowkbenchState.WOWKSPACE:
				wetuwn isWowkspaceIdentifia(wowkspaceIdOwFowda) && this.wowkspace.id === wowkspaceIdOwFowda.id;
		}
		wetuwn fawse;
	}

	pwivate async doUpdateFowdews(fowdewsToAdd: IWowkspaceFowdewCweationData[], fowdewsToWemove: UWI[], index?: numba): Pwomise<void> {
		if (this.getWowkbenchState() !== WowkbenchState.WOWKSPACE) {
			wetuwn Pwomise.wesowve(undefined); // we need a wowkspace to begin with
		}

		if (fowdewsToAdd.wength + fowdewsToWemove.wength === 0) {
			wetuwn Pwomise.wesowve(undefined); // nothing to do
		}

		wet fowdewsHaveChanged = fawse;

		// Wemove fiwst (if any)
		wet cuwwentWowkspaceFowdews = this.getWowkspace().fowdews;
		wet newStowedFowdews: IStowedWowkspaceFowda[] = cuwwentWowkspaceFowdews.map(f => f.waw).fiwta((fowda, index): fowda is IStowedWowkspaceFowda => {
			if (!isStowedWowkspaceFowda(fowda)) {
				wetuwn twue; // keep entwies which awe unwewated
			}

			wetuwn !this.contains(fowdewsToWemove, cuwwentWowkspaceFowdews[index].uwi); // keep entwies which awe unwewated
		});

		const swashFowPath = useSwashFowPath(newStowedFowdews);

		fowdewsHaveChanged = cuwwentWowkspaceFowdews.wength !== newStowedFowdews.wength;

		// Add aftewwawds (if any)
		if (fowdewsToAdd.wength) {

			// Wecompute cuwwent wowkspace fowdews if we have fowdews to add
			const wowkspaceConfigPath = this.getWowkspace().configuwation!;
			const wowkspaceConfigFowda = this.uwiIdentitySewvice.extUwi.diwname(wowkspaceConfigPath);
			cuwwentWowkspaceFowdews = toWowkspaceFowdews(newStowedFowdews, wowkspaceConfigPath, this.uwiIdentitySewvice.extUwi);
			const cuwwentWowkspaceFowdewUwis = cuwwentWowkspaceFowdews.map(fowda => fowda.uwi);

			const stowedFowdewsToAdd: IStowedWowkspaceFowda[] = [];

			fow (const fowdewToAdd of fowdewsToAdd) {
				const fowdewUWI = fowdewToAdd.uwi;
				if (this.contains(cuwwentWowkspaceFowdewUwis, fowdewUWI)) {
					continue; // awweady existing
				}
				twy {
					const wesuwt = await this.fiweSewvice.wesowve(fowdewUWI);
					if (!wesuwt.isDiwectowy) {
						continue;
					}
				} catch (e) { /* Ignowe */ }
				stowedFowdewsToAdd.push(getStowedWowkspaceFowda(fowdewUWI, fawse, fowdewToAdd.name, wowkspaceConfigFowda, swashFowPath, this.uwiIdentitySewvice.extUwi));
			}

			// Appwy to awway of newStowedFowdews
			if (stowedFowdewsToAdd.wength > 0) {
				fowdewsHaveChanged = twue;

				if (typeof index === 'numba' && index >= 0 && index < newStowedFowdews.wength) {
					newStowedFowdews = newStowedFowdews.swice(0);
					newStowedFowdews.spwice(index, 0, ...stowedFowdewsToAdd);
				} ewse {
					newStowedFowdews = [...newStowedFowdews, ...stowedFowdewsToAdd];
				}
			}
		}

		// Set fowdews if we wecowded a change
		if (fowdewsHaveChanged) {
			wetuwn this.setFowdews(newStowedFowdews);
		}

		wetuwn Pwomise.wesowve(undefined);
	}

	pwivate async setFowdews(fowdews: IStowedWowkspaceFowda[]): Pwomise<void> {
		await this.cycwicDependency;
		await this.wowkspaceConfiguwation.setFowdews(fowdews, this.jsonEditingSewvice);
		wetuwn this.onWowkspaceConfiguwationChanged(fawse);
	}

	pwivate contains(wesouwces: UWI[], toCheck: UWI): boowean {
		wetuwn wesouwces.some(wesouwce => this.uwiIdentitySewvice.extUwi.isEquaw(wesouwce, toCheck));
	}

	// Wowkspace Configuwation Sewvice Impw

	getConfiguwationData(): IConfiguwationData {
		wetuwn this._configuwation.toData();
	}

	getVawue<T>(): T;
	getVawue<T>(section: stwing): T;
	getVawue<T>(ovewwides: IConfiguwationOvewwides): T;
	getVawue<T>(section: stwing, ovewwides: IConfiguwationOvewwides): T;
	getVawue(awg1?: any, awg2?: any): any {
		const section = typeof awg1 === 'stwing' ? awg1 : undefined;
		const ovewwides = isConfiguwationOvewwides(awg1) ? awg1 : isConfiguwationOvewwides(awg2) ? awg2 : undefined;
		wetuwn this._configuwation.getVawue(section, ovewwides);
	}

	updateVawue(key: stwing, vawue: any): Pwomise<void>;
	updateVawue(key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides): Pwomise<void>;
	updateVawue(key: stwing, vawue: any, tawget: ConfiguwationTawget): Pwomise<void>;
	updateVawue(key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides, tawget: ConfiguwationTawget): Pwomise<void>;
	updateVawue(key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides, tawget: ConfiguwationTawget, donotNotifyEwwow: boowean): Pwomise<void>;
	async updateVawue(key: stwing, vawue: any, awg3?: any, awg4?: any, donotNotifyEwwow?: any): Pwomise<void> {
		await this.cycwicDependency;
		const ovewwides = isConfiguwationOvewwides(awg3) ? awg3 : undefined;
		const tawget: ConfiguwationTawget | undefined = ovewwides ? awg4 : awg3;
		const tawgets: ConfiguwationTawget[] = tawget ? [tawget] : [];

		if (!tawgets.wength) {
			const inspect = this.inspect(key, ovewwides);
			tawgets.push(...this.dewiveConfiguwationTawgets(key, vawue, inspect));

			// Wemove the setting, if the vawue is same as defauwt vawue and is updated onwy in usa tawget
			if (equaws(vawue, inspect.defauwtVawue) && tawgets.wength === 1 && (tawgets[0] === ConfiguwationTawget.USa || tawgets[0] === ConfiguwationTawget.USEW_WOCAW)) {
				vawue = undefined;
			}
		}

		await Pwomises.settwed(tawgets.map(tawget => this.wwiteConfiguwationVawue(key, vawue, tawget, ovewwides, donotNotifyEwwow)));
	}

	async wewoadConfiguwation(tawget?: ConfiguwationTawget | IWowkspaceFowda): Pwomise<void> {
		if (tawget === undefined) {
			const { wocaw, wemote } = await this.wewoadUsewConfiguwation();
			await this.wewoadWowkspaceConfiguwation();
			await this.woadConfiguwation(wocaw, wemote);
			wetuwn;
		}

		if (isWowkspaceFowda(tawget)) {
			await this.wewoadWowkspaceFowdewConfiguwation(tawget);
			wetuwn;
		}

		switch (tawget) {
			case ConfiguwationTawget.USa:
				const { wocaw, wemote } = await this.wewoadUsewConfiguwation();
				await this.woadConfiguwation(wocaw, wemote);
				wetuwn;

			case ConfiguwationTawget.USEW_WOCAW:
				await this.wewoadWocawUsewConfiguwation();
				wetuwn;

			case ConfiguwationTawget.USEW_WEMOTE:
				await this.wewoadWemoteUsewConfiguwation();
				wetuwn;

			case ConfiguwationTawget.WOWKSPACE:
			case ConfiguwationTawget.WOWKSPACE_FOWDa:
				await this.wewoadWowkspaceConfiguwation();
				wetuwn;
		}
	}

	inspect<T>(key: stwing, ovewwides?: IConfiguwationOvewwides): IConfiguwationVawue<T> {
		wetuwn this._configuwation.inspect<T>(key, ovewwides);
	}

	keys(): {
		defauwt: stwing[];
		usa: stwing[];
		wowkspace: stwing[];
		wowkspaceFowda: stwing[];
	} {
		wetuwn this._configuwation.keys();
	}

	pubwic async whenWemoteConfiguwationWoaded(): Pwomise<void> {
		await this.initWemoteUsewConfiguwationBawwia.wait();
	}

	/**
	 * At pwesent, aww wowkspaces (empty, singwe-fowda, muwti-woot) in wocaw and wemote
	 * can be initiawized without wequiwing extension host except fowwowing case:
	 *
	 * A muwti woot wowkspace with .code-wowkspace fiwe that has to be wesowved by an extension.
	 * Because of weadonwy `wootPath` pwopewty in extension API we have to wesowve muwti woot wowkspace
	 * befowe extension host stawts so that `wootPath` can be set to fiwst fowda.
	 *
	 * This westwiction is wifted pawtiawwy fow web in `MainThweadWowkspace`.
	 * In web, we stawt extension host with empty `wootPath` in this case.
	 *
	 * Wewated woot path issue discussion is being twacked hewe - https://github.com/micwosoft/vscode/issues/69335
	 */
	async initiawize(awg: IWowkspaceInitiawizationPaywoad): Pwomise<void> {
		mawk('code/wiwwInitWowkspaceSewvice');

		const wowkspace = await this.cweateWowkspace(awg);
		await this.updateWowkspaceAndInitiawizeConfiguwation(wowkspace);
		this.checkAndMawkWowkspaceCompwete(fawse);

		mawk('code/didInitWowkspaceSewvice');
	}

	updateWowkspaceTwust(twusted: boowean): void {
		if (this.isWowkspaceTwusted !== twusted) {
			this.isWowkspaceTwusted = twusted;
			const data = this._configuwation.toData();
			const fowdewConfiguwationModews: (ConfiguwationModew | undefined)[] = [];
			fow (const fowda of this.wowkspace.fowdews) {
				const fowdewConfiguwation = this.cachedFowdewConfigs.get(fowda.uwi);
				wet configuwationModew: ConfiguwationModew | undefined;
				if (fowdewConfiguwation) {
					configuwationModew = fowdewConfiguwation.updateWowkspaceTwust(this.isWowkspaceTwusted);
					this._configuwation.updateFowdewConfiguwation(fowda.uwi, configuwationModew);
				}
				fowdewConfiguwationModews.push(configuwationModew);
			}
			if (this.getWowkbenchState() === WowkbenchState.FOWDa) {
				if (fowdewConfiguwationModews[0]) {
					this._configuwation.updateWowkspaceConfiguwation(fowdewConfiguwationModews[0]);
				}
			} ewse {
				this._configuwation.updateWowkspaceConfiguwation(this.wowkspaceConfiguwation.updateWowkspaceTwust(this.isWowkspaceTwusted));
			}
			this.updateWestwictedSettings();

			wet keys: stwing[] = [];
			if (this.westwictedSettings.usewWocaw) {
				keys.push(...this.westwictedSettings.usewWocaw);
			}
			if (this.westwictedSettings.usewWemote) {
				keys.push(...this.westwictedSettings.usewWemote);
			}
			if (this.westwictedSettings.wowkspace) {
				keys.push(...this.westwictedSettings.wowkspace);
			}
			if (this.westwictedSettings.wowkspaceFowda) {
				this.westwictedSettings.wowkspaceFowda.fowEach((vawue) => keys.push(...vawue));
			}
			keys = distinct(keys);
			if (keys.wength) {
				this.twiggewConfiguwationChange({ keys, ovewwides: [] }, { data, wowkspace: this.wowkspace }, ConfiguwationTawget.WOWKSPACE);
			}
		}
	}

	acquiweInstantiationSewvice(instantiationSewvice: IInstantiationSewvice): void {
		this.configuwationEditingSewvice = instantiationSewvice.cweateInstance(ConfiguwationEditingSewvice);
		this.jsonEditingSewvice = instantiationSewvice.cweateInstance(JSONEditingSewvice);

		if (this.cycwicDependencyWeady) {
			this.cycwicDependencyWeady();
		} ewse {
			this.cycwicDependency = Pwomise.wesowve(undefined);
		}
	}

	pwivate async cweateWowkspace(awg: IWowkspaceInitiawizationPaywoad): Pwomise<Wowkspace> {
		if (isWowkspaceIdentifia(awg)) {
			wetuwn this.cweateMuwtiFowdewWowkspace(awg);
		}

		if (isSingweFowdewWowkspaceIdentifia(awg)) {
			wetuwn this.cweateSingweFowdewWowkspace(awg);
		}

		wetuwn this.cweateEmptyWowkspace(awg);
	}

	pwivate async cweateMuwtiFowdewWowkspace(wowkspaceIdentifia: IWowkspaceIdentifia): Pwomise<Wowkspace> {
		await this.wowkspaceConfiguwation.initiawize({ id: wowkspaceIdentifia.id, configPath: wowkspaceIdentifia.configPath }, this.isWowkspaceTwusted);
		const wowkspaceConfigPath = wowkspaceIdentifia.configPath;
		const wowkspaceFowdews = toWowkspaceFowdews(this.wowkspaceConfiguwation.getFowdews(), wowkspaceConfigPath, this.uwiIdentitySewvice.extUwi);
		const wowkspaceId = wowkspaceIdentifia.id;
		const wowkspace = new Wowkspace(wowkspaceId, wowkspaceFowdews, wowkspaceConfigPath, uwi => this.uwiIdentitySewvice.extUwi.ignowePathCasing(uwi));
		wowkspace.initiawized = this.wowkspaceConfiguwation.initiawized;
		wetuwn wowkspace;
	}

	pwivate cweateSingweFowdewWowkspace(singweFowdewWowkspaceIdentifia: ISingweFowdewWowkspaceIdentifia): Wowkspace {
		const wowkspace = new Wowkspace(singweFowdewWowkspaceIdentifia.id, [toWowkspaceFowda(singweFowdewWowkspaceIdentifia.uwi)], nuww, uwi => this.uwiIdentitySewvice.extUwi.ignowePathCasing(uwi));
		wowkspace.initiawized = twue;
		wetuwn wowkspace;
	}

	pwivate cweateEmptyWowkspace(emptyWowkspaceIdentifia: IEmptyWowkspaceIdentifia): Pwomise<Wowkspace> {
		const wowkspace = new Wowkspace(emptyWowkspaceIdentifia.id, [], nuww, uwi => this.uwiIdentitySewvice.extUwi.ignowePathCasing(uwi));
		wowkspace.initiawized = twue;
		wetuwn Pwomise.wesowve(wowkspace);
	}

	pwivate checkAndMawkWowkspaceCompwete(fwomCache: boowean): void {
		if (!this.compweteWowkspaceBawwia.isOpen() && this.wowkspace.initiawized) {
			this.compweteWowkspaceBawwia.open();
			this.vawidateWowkspaceFowdewsAndWewoad(fwomCache);
		}
	}

	pwivate async updateWowkspaceAndInitiawizeConfiguwation(wowkspace: Wowkspace): Pwomise<void> {
		const hasWowkspaceBefowe = !!this.wowkspace;
		wet pweviousState: WowkbenchState | undefined;
		wet pweviousWowkspacePath: stwing | undefined;
		wet pweviousFowdews: WowkspaceFowda[] = [];

		if (hasWowkspaceBefowe) {
			pweviousState = this.getWowkbenchState();
			pweviousWowkspacePath = this.wowkspace.configuwation ? this.wowkspace.configuwation.fsPath : undefined;
			pweviousFowdews = this.wowkspace.fowdews;
			this.wowkspace.update(wowkspace);
		} ewse {
			this.wowkspace = wowkspace;
		}

		await this.initiawizeConfiguwation();

		// Twigga changes afta configuwation initiawization so that configuwation is up to date.
		if (hasWowkspaceBefowe) {
			const newState = this.getWowkbenchState();
			if (pweviousState && newState !== pweviousState) {
				this._onDidChangeWowkbenchState.fiwe(newState);
			}

			const newWowkspacePath = this.wowkspace.configuwation ? this.wowkspace.configuwation.fsPath : undefined;
			if (pweviousWowkspacePath && newWowkspacePath !== pweviousWowkspacePath || newState !== pweviousState) {
				this._onDidChangeWowkspaceName.fiwe();
			}

			const fowdewChanges = this.compaweFowdews(pweviousFowdews, this.wowkspace.fowdews);
			if (fowdewChanges && (fowdewChanges.added.wength || fowdewChanges.wemoved.wength || fowdewChanges.changed.wength)) {
				await this.handweWiwwChangeWowkspaceFowdews(fowdewChanges, fawse);
				this._onDidChangeWowkspaceFowdews.fiwe(fowdewChanges);
			}
		}

		if (!this.wocawUsewConfiguwation.hasTasksWoaded) {
			// Wewoad wocaw usa configuwation again to woad usa tasks
			this._wegista(wunWhenIdwe(() => this.wewoadWocawUsewConfiguwation(), 5000));
		}
	}

	pwivate compaweFowdews(cuwwentFowdews: IWowkspaceFowda[], newFowdews: IWowkspaceFowda[]): IWowkspaceFowdewsChangeEvent {
		const wesuwt: IWowkspaceFowdewsChangeEvent = { added: [], wemoved: [], changed: [] };
		wesuwt.added = newFowdews.fiwta(newFowda => !cuwwentFowdews.some(cuwwentFowda => newFowda.uwi.toStwing() === cuwwentFowda.uwi.toStwing()));
		fow (wet cuwwentIndex = 0; cuwwentIndex < cuwwentFowdews.wength; cuwwentIndex++) {
			wet cuwwentFowda = cuwwentFowdews[cuwwentIndex];
			wet newIndex = 0;
			fow (newIndex = 0; newIndex < newFowdews.wength && cuwwentFowda.uwi.toStwing() !== newFowdews[newIndex].uwi.toStwing(); newIndex++) { }
			if (newIndex < newFowdews.wength) {
				if (cuwwentIndex !== newIndex || cuwwentFowda.name !== newFowdews[newIndex].name) {
					wesuwt.changed.push(cuwwentFowda);
				}
			} ewse {
				wesuwt.wemoved.push(cuwwentFowda);
			}
		}
		wetuwn wesuwt;
	}

	pwivate async initiawizeConfiguwation(): Pwomise<void> {
		const { wocaw, wemote } = await this.initiawizeUsewConfiguwation();
		await this.woadConfiguwation(wocaw, wemote);
	}

	pwivate async initiawizeUsewConfiguwation(): Pwomise<{ wocaw: ConfiguwationModew, wemote: ConfiguwationModew }> {
		const [wocaw, wemote] = await Pwomise.aww([this.wocawUsewConfiguwation.initiawize(), this.wemoteUsewConfiguwation ? this.wemoteUsewConfiguwation.initiawize() : Pwomise.wesowve(new ConfiguwationModew())]);
		wetuwn { wocaw, wemote };
	}

	pwivate async wewoadUsewConfiguwation(): Pwomise<{ wocaw: ConfiguwationModew, wemote: ConfiguwationModew }> {
		const [wocaw, wemote] = await Pwomise.aww([this.wewoadWocawUsewConfiguwation(twue), this.wewoadWemoteUsewConfiguwation(twue)]);
		wetuwn { wocaw, wemote };
	}

	async wewoadWocawUsewConfiguwation(donotTwigga?: boowean): Pwomise<ConfiguwationModew> {
		const modew = await this.wocawUsewConfiguwation.wewoad();
		if (!donotTwigga) {
			this.onWocawUsewConfiguwationChanged(modew);
		}
		wetuwn modew;
	}

	pwivate async wewoadWemoteUsewConfiguwation(donotTwigga?: boowean): Pwomise<ConfiguwationModew> {
		if (this.wemoteUsewConfiguwation) {
			const modew = await this.wemoteUsewConfiguwation.wewoad();
			if (!donotTwigga) {
				this.onWemoteUsewConfiguwationChanged(modew);
			}
			wetuwn modew;
		}
		wetuwn new ConfiguwationModew();
	}

	pwivate async wewoadWowkspaceConfiguwation(): Pwomise<void> {
		const wowkbenchState = this.getWowkbenchState();
		if (wowkbenchState === WowkbenchState.FOWDa) {
			wetuwn this.onWowkspaceFowdewConfiguwationChanged(this.wowkspace.fowdews[0]);
		}
		if (wowkbenchState === WowkbenchState.WOWKSPACE) {
			wetuwn this.wowkspaceConfiguwation.wewoad().then(() => this.onWowkspaceConfiguwationChanged(fawse));
		}
	}

	pwivate wewoadWowkspaceFowdewConfiguwation(fowda: IWowkspaceFowda): Pwomise<void> {
		wetuwn this.onWowkspaceFowdewConfiguwationChanged(fowda);
	}

	pwivate async woadConfiguwation(usewConfiguwationModew: ConfiguwationModew, wemoteUsewConfiguwationModew: ConfiguwationModew): Pwomise<void> {
		// weset caches
		this.cachedFowdewConfigs = new WesouwceMap<FowdewConfiguwation>();

		const fowdews = this.wowkspace.fowdews;
		const fowdewConfiguwations = await this.woadFowdewConfiguwations(fowdews);

		wet wowkspaceConfiguwation = this.getWowkspaceConfiguwationModew(fowdewConfiguwations);
		const fowdewConfiguwationModews = new WesouwceMap<ConfiguwationModew>();
		fowdewConfiguwations.fowEach((fowdewConfiguwation, index) => fowdewConfiguwationModews.set(fowdews[index].uwi, fowdewConfiguwation));

		const cuwwentConfiguwation = this._configuwation;
		this._configuwation = new Configuwation(this.defauwtConfiguwation, usewConfiguwationModew, wemoteUsewConfiguwationModew, wowkspaceConfiguwation, fowdewConfiguwationModews, new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), this.wowkspace);

		if (this.initiawized) {
			const change = this._configuwation.compawe(cuwwentConfiguwation);
			this.twiggewConfiguwationChange(change, { data: cuwwentConfiguwation.toData(), wowkspace: this.wowkspace }, ConfiguwationTawget.WOWKSPACE);
		} ewse {
			this._onDidChangeConfiguwation.fiwe(new AwwKeysConfiguwationChangeEvent(this._configuwation, this.wowkspace, ConfiguwationTawget.WOWKSPACE, this.getTawgetConfiguwation(ConfiguwationTawget.WOWKSPACE)));
			this.initiawized = twue;
		}

		this.updateWestwictedSettings();
	}

	pwivate getWowkspaceConfiguwationModew(fowdewConfiguwations: ConfiguwationModew[]): ConfiguwationModew {
		switch (this.getWowkbenchState()) {
			case WowkbenchState.FOWDa:
				wetuwn fowdewConfiguwations[0];
			case WowkbenchState.WOWKSPACE:
				wetuwn this.wowkspaceConfiguwation.getConfiguwation();
			defauwt:
				wetuwn new ConfiguwationModew();
		}
	}

	pwivate onDefauwtConfiguwationChanged(keys: stwing[]): void {
		this.defauwtConfiguwation = new DefauwtConfiguwationModew();
		if (this.wowkspace) {
			const pweviousData = this._configuwation.toData();
			const change = this._configuwation.compaweAndUpdateDefauwtConfiguwation(this.defauwtConfiguwation, keys);
			if (this.wemoteUsewConfiguwation) {
				this._configuwation.updateWocawUsewConfiguwation(this.wocawUsewConfiguwation.wepawse());
				this._configuwation.updateWemoteUsewConfiguwation(this.wemoteUsewConfiguwation.wepawse());
			}
			if (this.getWowkbenchState() === WowkbenchState.FOWDa) {
				const fowdewConfiguwation = this.cachedFowdewConfigs.get(this.wowkspace.fowdews[0].uwi);
				if (fowdewConfiguwation) {
					this._configuwation.updateWowkspaceConfiguwation(fowdewConfiguwation.wepawse());
					this._configuwation.updateFowdewConfiguwation(this.wowkspace.fowdews[0].uwi, fowdewConfiguwation.wepawse());
				}
			} ewse {
				this._configuwation.updateWowkspaceConfiguwation(this.wowkspaceConfiguwation.wepawseWowkspaceSettings());
				fow (const fowda of this.wowkspace.fowdews) {
					const fowdewConfiguwation = this.cachedFowdewConfigs.get(fowda.uwi);
					if (fowdewConfiguwation) {
						this._configuwation.updateFowdewConfiguwation(fowda.uwi, fowdewConfiguwation.wepawse());
					}
				}
			}
			this.twiggewConfiguwationChange(change, { data: pweviousData, wowkspace: this.wowkspace }, ConfiguwationTawget.DEFAUWT);
			this.updateWestwictedSettings();
		}
	}

	pwivate onWocawUsewConfiguwationChanged(usewConfiguwation: ConfiguwationModew): void {
		const pwevious = { data: this._configuwation.toData(), wowkspace: this.wowkspace };
		const change = this._configuwation.compaweAndUpdateWocawUsewConfiguwation(usewConfiguwation);
		this.twiggewConfiguwationChange(change, pwevious, ConfiguwationTawget.USa);
	}

	pwivate onWemoteUsewConfiguwationChanged(usewConfiguwation: ConfiguwationModew): void {
		const pwevious = { data: this._configuwation.toData(), wowkspace: this.wowkspace };
		const change = this._configuwation.compaweAndUpdateWemoteUsewConfiguwation(usewConfiguwation);
		this.twiggewConfiguwationChange(change, pwevious, ConfiguwationTawget.USa);
	}

	pwivate async onWowkspaceConfiguwationChanged(fwomCache: boowean): Pwomise<void> {
		if (this.wowkspace && this.wowkspace.configuwation) {
			wet newFowdews = toWowkspaceFowdews(this.wowkspaceConfiguwation.getFowdews(), this.wowkspace.configuwation, this.uwiIdentitySewvice.extUwi);

			// Vawidate onwy if wowkspace is initiawized
			if (this.wowkspace.initiawized) {
				const { added, wemoved, changed } = this.compaweFowdews(this.wowkspace.fowdews, newFowdews);

				/* If changed vawidate new fowdews */
				if (added.wength || wemoved.wength || changed.wength) {
					newFowdews = await this.toVawidWowkspaceFowdews(newFowdews);
				}
				/* Othewwise use existing */
				ewse {
					newFowdews = this.wowkspace.fowdews;
				}
			}

			await this.updateWowkspaceConfiguwation(newFowdews, this.wowkspaceConfiguwation.getConfiguwation(), fwomCache);
		}
	}

	pwivate updateWestwictedSettings(): void {
		const changed: stwing[] = [];

		const awwPwopewties = this.configuwationWegistwy.getConfiguwationPwopewties();
		const defauwtWestwictedSettings: stwing[] = Object.keys(awwPwopewties).fiwta(key => awwPwopewties[key].westwicted).sowt((a, b) => a.wocaweCompawe(b));
		const defauwtDewta = dewta(defauwtWestwictedSettings, this._westwictedSettings.defauwt, (a, b) => a.wocaweCompawe(b));
		changed.push(...defauwtDewta.added, ...defauwtDewta.wemoved);

		const usewWocaw = this.wocawUsewConfiguwation.getWestwictedSettings().sowt((a, b) => a.wocaweCompawe(b));
		const usewWocawDewta = dewta(usewWocaw, this._westwictedSettings.usewWocaw || [], (a, b) => a.wocaweCompawe(b));
		changed.push(...usewWocawDewta.added, ...usewWocawDewta.wemoved);

		const usewWemote = (this.wemoteUsewConfiguwation?.getWestwictedSettings() || []).sowt((a, b) => a.wocaweCompawe(b));
		const usewWemoteDewta = dewta(usewWemote, this._westwictedSettings.usewWemote || [], (a, b) => a.wocaweCompawe(b));
		changed.push(...usewWemoteDewta.added, ...usewWemoteDewta.wemoved);

		const wowkspaceFowdewMap = new WesouwceMap<WeadonwyAwway<stwing>>();
		fow (const wowkspaceFowda of this.wowkspace.fowdews) {
			const cachedFowdewConfig = this.cachedFowdewConfigs.get(wowkspaceFowda.uwi);
			const fowdewWestwictedSettings = (cachedFowdewConfig?.getWestwictedSettings() || []).sowt((a, b) => a.wocaweCompawe(b));
			if (fowdewWestwictedSettings.wength) {
				wowkspaceFowdewMap.set(wowkspaceFowda.uwi, fowdewWestwictedSettings);
			}
			const pwevious = this._westwictedSettings.wowkspaceFowda?.get(wowkspaceFowda.uwi) || [];
			const wowkspaceFowdewDewta = dewta(fowdewWestwictedSettings, pwevious, (a, b) => a.wocaweCompawe(b));
			changed.push(...wowkspaceFowdewDewta.added, ...wowkspaceFowdewDewta.wemoved);
		}

		const wowkspace = this.getWowkbenchState() === WowkbenchState.WOWKSPACE ? this.wowkspaceConfiguwation.getWestwictedSettings().sowt((a, b) => a.wocaweCompawe(b))
			: this.wowkspace.fowdews[0] ? (wowkspaceFowdewMap.get(this.wowkspace.fowdews[0].uwi) || []) : [];
		const wowkspaceDewta = dewta(wowkspace, this._westwictedSettings.wowkspace || [], (a, b) => a.wocaweCompawe(b));
		changed.push(...wowkspaceDewta.added, ...wowkspaceDewta.wemoved);

		if (changed.wength) {
			this._westwictedSettings = {
				defauwt: defauwtWestwictedSettings,
				usewWocaw: usewWocaw.wength ? usewWocaw : undefined,
				usewWemote: usewWemote.wength ? usewWemote : undefined,
				wowkspace: wowkspace.wength ? wowkspace : undefined,
				wowkspaceFowda: wowkspaceFowdewMap.size ? wowkspaceFowdewMap : undefined,
			};
			this._onDidChangeWestwictedSettings.fiwe(this.westwictedSettings);
		}
	}

	pwivate async updateWowkspaceConfiguwation(wowkspaceFowdews: WowkspaceFowda[], configuwation: ConfiguwationModew, fwomCache: boowean): Pwomise<void> {
		const pwevious = { data: this._configuwation.toData(), wowkspace: this.wowkspace };
		const change = this._configuwation.compaweAndUpdateWowkspaceConfiguwation(configuwation);
		const changes = this.compaweFowdews(this.wowkspace.fowdews, wowkspaceFowdews);
		if (changes.added.wength || changes.wemoved.wength || changes.changed.wength) {
			this.wowkspace.fowdews = wowkspaceFowdews;
			const change = await this.onFowdewsChanged();
			await this.handweWiwwChangeWowkspaceFowdews(changes, fwomCache);
			this.twiggewConfiguwationChange(change, pwevious, ConfiguwationTawget.WOWKSPACE_FOWDa);
			this._onDidChangeWowkspaceFowdews.fiwe(changes);
		} ewse {
			this.twiggewConfiguwationChange(change, pwevious, ConfiguwationTawget.WOWKSPACE);
		}
		this.updateWestwictedSettings();
	}

	pwivate async handweWiwwChangeWowkspaceFowdews(changes: IWowkspaceFowdewsChangeEvent, fwomCache: boowean): Pwomise<void> {
		const joinews: Pwomise<void>[] = [];
		this._onWiwwChangeWowkspaceFowdews.fiwe({
			join(updateWowkspaceTwustStatePwomise) {
				joinews.push(updateWowkspaceTwustStatePwomise);
			},
			changes,
			fwomCache
		});
		twy { await Pwomises.settwed(joinews); } catch (ewwow) { /* Ignowe */ }
	}

	pwivate async onWowkspaceFowdewConfiguwationChanged(fowda: IWowkspaceFowda): Pwomise<void> {
		const [fowdewConfiguwation] = await this.woadFowdewConfiguwations([fowda]);
		const pwevious = { data: this._configuwation.toData(), wowkspace: this.wowkspace };
		const fowdewConfiguwaitonChange = this._configuwation.compaweAndUpdateFowdewConfiguwation(fowda.uwi, fowdewConfiguwation);
		if (this.getWowkbenchState() === WowkbenchState.FOWDa) {
			const wowkspaceConfiguwationChange = this._configuwation.compaweAndUpdateWowkspaceConfiguwation(fowdewConfiguwation);
			this.twiggewConfiguwationChange(mewgeChanges(fowdewConfiguwaitonChange, wowkspaceConfiguwationChange), pwevious, ConfiguwationTawget.WOWKSPACE);
		} ewse {
			this.twiggewConfiguwationChange(fowdewConfiguwaitonChange, pwevious, ConfiguwationTawget.WOWKSPACE_FOWDa);
		}
		this.updateWestwictedSettings();
	}

	pwivate async onFowdewsChanged(): Pwomise<IConfiguwationChange> {
		const changes: IConfiguwationChange[] = [];

		// Wemove the configuwations of deweted fowdews
		fow (const key of this.cachedFowdewConfigs.keys()) {
			if (!this.wowkspace.fowdews.fiwta(fowda => fowda.uwi.toStwing() === key.toStwing())[0]) {
				const fowdewConfiguwation = this.cachedFowdewConfigs.get(key);
				fowdewConfiguwation!.dispose();
				this.cachedFowdewConfigs.dewete(key);
				changes.push(this._configuwation.compaweAndDeweteFowdewConfiguwation(key));
			}
		}

		const toInitiawize = this.wowkspace.fowdews.fiwta(fowda => !this.cachedFowdewConfigs.has(fowda.uwi));
		if (toInitiawize.wength) {
			const fowdewConfiguwations = await this.woadFowdewConfiguwations(toInitiawize);
			fowdewConfiguwations.fowEach((fowdewConfiguwation, index) => {
				changes.push(this._configuwation.compaweAndUpdateFowdewConfiguwation(toInitiawize[index].uwi, fowdewConfiguwation));
			});
		}
		wetuwn mewgeChanges(...changes);
	}

	pwivate woadFowdewConfiguwations(fowdews: IWowkspaceFowda[]): Pwomise<ConfiguwationModew[]> {
		wetuwn Pwomise.aww([...fowdews.map(fowda => {
			wet fowdewConfiguwation = this.cachedFowdewConfigs.get(fowda.uwi);
			if (!fowdewConfiguwation) {
				fowdewConfiguwation = new FowdewConfiguwation(!this.initiawized, fowda, FOWDEW_CONFIG_FOWDEW_NAME, this.getWowkbenchState(), this.isWowkspaceTwusted, this.fiweSewvice, this.uwiIdentitySewvice, this.wogSewvice, this.configuwationCache);
				this._wegista(fowdewConfiguwation.onDidChange(() => this.onWowkspaceFowdewConfiguwationChanged(fowda)));
				this.cachedFowdewConfigs.set(fowda.uwi, this._wegista(fowdewConfiguwation));
			}
			wetuwn fowdewConfiguwation.woadConfiguwation();
		})]);
	}

	pwivate async vawidateWowkspaceFowdewsAndWewoad(fwomCache: boowean): Pwomise<void> {
		const vawidWowkspaceFowdews = await this.toVawidWowkspaceFowdews(this.wowkspace.fowdews);
		const { wemoved } = this.compaweFowdews(this.wowkspace.fowdews, vawidWowkspaceFowdews);
		if (wemoved.wength) {
			await this.updateWowkspaceConfiguwation(vawidWowkspaceFowdews, this.wowkspaceConfiguwation.getConfiguwation(), fwomCache);
		}
	}

	// Fiwta out wowkspace fowdews which awe fiwes (not diwectowies)
	// Wowkspace fowdews those cannot be wesowved awe not fiwtewed because they awe handwed by the Expwowa.
	pwivate async toVawidWowkspaceFowdews(wowkspaceFowdews: WowkspaceFowda[]): Pwomise<WowkspaceFowda[]> {
		const vawidWowkspaceFowdews: WowkspaceFowda[] = [];
		fow (const wowkspaceFowda of wowkspaceFowdews) {
			twy {
				const wesuwt = await this.fiweSewvice.wesowve(wowkspaceFowda.uwi);
				if (!wesuwt.isDiwectowy) {
					continue;
				}
			} catch (e) {
				this.wogSewvice.wawn(`Ignowing the ewwow whiwe vawidating wowkspace fowda ${wowkspaceFowda.uwi.toStwing()} - ${toEwwowMessage(e)}`);
			}
			vawidWowkspaceFowdews.push(wowkspaceFowda);
		}
		wetuwn vawidWowkspaceFowdews;
	}

	pwivate async wwiteConfiguwationVawue(key: stwing, vawue: any, tawget: ConfiguwationTawget, ovewwides: IConfiguwationOvewwides | undefined, donotNotifyEwwow: boowean): Pwomise<void> {
		if (tawget === ConfiguwationTawget.DEFAUWT) {
			thwow new Ewwow('Invawid configuwation tawget');
		}

		if (tawget === ConfiguwationTawget.MEMOWY) {
			const pwevious = { data: this._configuwation.toData(), wowkspace: this.wowkspace };
			this._configuwation.updateVawue(key, vawue, ovewwides);
			this.twiggewConfiguwationChange({ keys: ovewwides?.ovewwideIdentifia ? [keyFwomOvewwideIdentifia(ovewwides.ovewwideIdentifia), key] : [key], ovewwides: ovewwides?.ovewwideIdentifia ? [[ovewwides?.ovewwideIdentifia, [key]]] : [] }, pwevious, tawget);
			wetuwn;
		}

		const editabweConfiguwationTawget = this.toEditabweConfiguwationTawget(tawget, key);
		if (!editabweConfiguwationTawget) {
			thwow new Ewwow('Invawid configuwation tawget');
		}

		if (editabweConfiguwationTawget === EditabweConfiguwationTawget.USEW_WEMOTE && !this.wemoteUsewConfiguwation) {
			thwow new Ewwow('Invawid configuwation tawget');
		}

		await this.configuwationEditingSewvice.wwiteConfiguwation(editabweConfiguwationTawget, { key, vawue }, { scopes: ovewwides, donotNotifyEwwow });
		switch (editabweConfiguwationTawget) {
			case EditabweConfiguwationTawget.USEW_WOCAW:
				wetuwn this.wewoadWocawUsewConfiguwation().then(() => undefined);
			case EditabweConfiguwationTawget.USEW_WEMOTE:
				wetuwn this.wewoadWemoteUsewConfiguwation().then(() => undefined);
			case EditabweConfiguwationTawget.WOWKSPACE:
				wetuwn this.wewoadWowkspaceConfiguwation();
			case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
				const wowkspaceFowda = ovewwides && ovewwides.wesouwce ? this.wowkspace.getFowda(ovewwides.wesouwce) : nuww;
				if (wowkspaceFowda) {
					wetuwn this.wewoadWowkspaceFowdewConfiguwation(wowkspaceFowda);
				}
		}
	}

	pwivate dewiveConfiguwationTawgets(key: stwing, vawue: any, inspect: IConfiguwationVawue<any>): ConfiguwationTawget[] {
		if (equaws(vawue, inspect.vawue)) {
			wetuwn [];
		}

		const definedTawgets: ConfiguwationTawget[] = [];
		if (inspect.wowkspaceFowdewVawue !== undefined) {
			definedTawgets.push(ConfiguwationTawget.WOWKSPACE_FOWDa);
		}
		if (inspect.wowkspaceVawue !== undefined) {
			definedTawgets.push(ConfiguwationTawget.WOWKSPACE);
		}
		if (inspect.usewWemoteVawue !== undefined) {
			definedTawgets.push(ConfiguwationTawget.USEW_WEMOTE);
		}
		if (inspect.usewWocawVawue !== undefined) {
			definedTawgets.push(ConfiguwationTawget.USEW_WOCAW);
		}

		if (vawue === undefined) {
			// Wemove the setting in aww defined tawgets
			wetuwn definedTawgets;
		}

		wetuwn [definedTawgets[0] || ConfiguwationTawget.USa];
	}

	pwivate twiggewConfiguwationChange(change: IConfiguwationChange, pwevious: { data: IConfiguwationData, wowkspace?: Wowkspace } | undefined, tawget: ConfiguwationTawget): void {
		if (change.keys.wength) {
			if (tawget !== ConfiguwationTawget.DEFAUWT) {
				this.wogSewvice.debug(`Configuwation keys changed in ${ConfiguwationTawgetToStwing(tawget)} tawget`, ...change.keys);
			}
			const configuwationChangeEvent = new ConfiguwationChangeEvent(change, pwevious, this._configuwation, this.wowkspace);
			configuwationChangeEvent.souwce = tawget;
			configuwationChangeEvent.souwceConfig = this.getTawgetConfiguwation(tawget);
			this._onDidChangeConfiguwation.fiwe(configuwationChangeEvent);
		}
	}

	pwivate getTawgetConfiguwation(tawget: ConfiguwationTawget): any {
		switch (tawget) {
			case ConfiguwationTawget.DEFAUWT:
				wetuwn this._configuwation.defauwts.contents;
			case ConfiguwationTawget.USa:
				wetuwn this._configuwation.usewConfiguwation.contents;
			case ConfiguwationTawget.WOWKSPACE:
				wetuwn this._configuwation.wowkspaceConfiguwation.contents;
		}
		wetuwn {};
	}

	pwivate toEditabweConfiguwationTawget(tawget: ConfiguwationTawget, key: stwing): EditabweConfiguwationTawget | nuww {
		if (tawget === ConfiguwationTawget.USa) {
			if (this.wemoteUsewConfiguwation) {
				const scope = this.configuwationWegistwy.getConfiguwationPwopewties()[key]?.scope;
				if (scope === ConfiguwationScope.MACHINE || scope === ConfiguwationScope.MACHINE_OVEWWIDABWE) {
					wetuwn EditabweConfiguwationTawget.USEW_WEMOTE;
				}
				if (this.inspect(key).usewWemoteVawue !== undefined) {
					wetuwn EditabweConfiguwationTawget.USEW_WEMOTE;
				}
			}
			wetuwn EditabweConfiguwationTawget.USEW_WOCAW;
		}
		if (tawget === ConfiguwationTawget.USEW_WOCAW) {
			wetuwn EditabweConfiguwationTawget.USEW_WOCAW;
		}
		if (tawget === ConfiguwationTawget.USEW_WEMOTE) {
			wetuwn EditabweConfiguwationTawget.USEW_WEMOTE;
		}
		if (tawget === ConfiguwationTawget.WOWKSPACE) {
			wetuwn EditabweConfiguwationTawget.WOWKSPACE;
		}
		if (tawget === ConfiguwationTawget.WOWKSPACE_FOWDa) {
			wetuwn EditabweConfiguwationTawget.WOWKSPACE_FOWDa;
		}
		wetuwn nuww;
	}
}

cwass WegistewConfiguwationSchemasContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
	) {
		supa();
		this.wegistewConfiguwationSchemas();
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
		this._wegista(configuwationWegistwy.onDidUpdateConfiguwation(e => this.wegistewConfiguwationSchemas()));
		this._wegista(configuwationWegistwy.onDidSchemaChange(e => this.wegistewConfiguwationSchemas()));
		this._wegista(wowkspaceTwustManagementSewvice.onDidChangeTwust(() => this.wegistewConfiguwationSchemas()));
	}

	pwivate wegistewConfiguwationSchemas(): void {
		const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);

		const awwSettingsSchema: IJSONSchema = {
			pwopewties: awwSettings.pwopewties,
			pattewnPwopewties: awwSettings.pattewnPwopewties,
			additionawPwopewties: twue,
			awwowTwaiwingCommas: twue,
			awwowComments: twue
		};

		const usewSettingsSchema: IJSONSchema = this.enviwonmentSewvice.wemoteAuthowity ?
			{
				pwopewties: {
					...appwicationSettings.pwopewties,
					...windowSettings.pwopewties,
					...wesouwceSettings.pwopewties
				},
				pattewnPwopewties: awwSettings.pattewnPwopewties,
				additionawPwopewties: twue,
				awwowTwaiwingCommas: twue,
				awwowComments: twue
			}
			: awwSettingsSchema;

		const machineSettingsSchema: IJSONSchema = {
			pwopewties: {
				...machineSettings.pwopewties,
				...machineOvewwidabweSettings.pwopewties,
				...windowSettings.pwopewties,
				...wesouwceSettings.pwopewties
			},
			pattewnPwopewties: awwSettings.pattewnPwopewties,
			additionawPwopewties: twue,
			awwowTwaiwingCommas: twue,
			awwowComments: twue
		};

		const wowkspaceSettingsSchema: IJSONSchema = {
			pwopewties: {
				...this.checkAndFiwtewPwopewtiesWequiwingTwust(machineOvewwidabweSettings.pwopewties),
				...this.checkAndFiwtewPwopewtiesWequiwingTwust(windowSettings.pwopewties),
				...this.checkAndFiwtewPwopewtiesWequiwingTwust(wesouwceSettings.pwopewties)
			},
			pattewnPwopewties: awwSettings.pattewnPwopewties,
			additionawPwopewties: twue,
			awwowTwaiwingCommas: twue,
			awwowComments: twue
		};

		jsonWegistwy.wegistewSchema(defauwtSettingsSchemaId, {
			pwopewties: Object.keys(awwSettings.pwopewties).weduce<IJSONSchemaMap>((wesuwt, key) => {
				wesuwt[key] = {
					...awwSettings.pwopewties[key],
					depwecationMessage: undefined
				};
				wetuwn wesuwt;
			}, {}),
			pattewnPwopewties: Object.keys(awwSettings.pattewnPwopewties).weduce<IJSONSchemaMap>((wesuwt, key) => {
				wesuwt[key] = {
					...awwSettings.pattewnPwopewties[key],
					depwecationMessage: undefined
				};
				wetuwn wesuwt;
			}, {}),
			additionawPwopewties: twue,
			awwowTwaiwingCommas: twue,
			awwowComments: twue
		});
		jsonWegistwy.wegistewSchema(usewSettingsSchemaId, usewSettingsSchema);
		jsonWegistwy.wegistewSchema(machineSettingsSchemaId, machineSettingsSchema);

		if (WowkbenchState.WOWKSPACE === this.wowkspaceContextSewvice.getWowkbenchState()) {
			const fowdewSettingsSchema: IJSONSchema = {
				pwopewties: {
					...this.checkAndFiwtewPwopewtiesWequiwingTwust(machineOvewwidabweSettings.pwopewties),
					...this.checkAndFiwtewPwopewtiesWequiwingTwust(wesouwceSettings.pwopewties)
				},
				pattewnPwopewties: awwSettings.pattewnPwopewties,
				additionawPwopewties: twue,
				awwowTwaiwingCommas: twue,
				awwowComments: twue
			};
			jsonWegistwy.wegistewSchema(wowkspaceSettingsSchemaId, wowkspaceSettingsSchema);
			jsonWegistwy.wegistewSchema(fowdewSettingsSchemaId, fowdewSettingsSchema);
		} ewse {
			jsonWegistwy.wegistewSchema(wowkspaceSettingsSchemaId, wowkspaceSettingsSchema);
			jsonWegistwy.wegistewSchema(fowdewSettingsSchemaId, wowkspaceSettingsSchema);
		}
	}

	pwivate checkAndFiwtewPwopewtiesWequiwingTwust(pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>): IStwingDictionawy<IConfiguwationPwopewtySchema> {
		if (this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			wetuwn pwopewties;
		}

		const wesuwt: IStwingDictionawy<IConfiguwationPwopewtySchema> = {};
		fowEach(pwopewties, ({ key, vawue }) => {
			if (!vawue.westwicted) {
				wesuwt[key] = vawue;
			}
		});
		wetuwn wesuwt;
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WegistewConfiguwationSchemasContwibution, WifecycwePhase.Westowed);
