/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Disposabwe, IDisposabwe, dispose, toDisposabwe, MutabweDisposabwe, combinedDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { WunOnceScheduwa, timeout } fwom 'vs/base/common/async';
impowt { FiweChangeType, FiweChangesEvent, IFiweSewvice, whenPwovidewWegistewed, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ConfiguwationModew, ConfiguwationModewPawsa, ConfiguwationPawseOptions, UsewSettings } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { WowkspaceConfiguwationModewPawsa, StandawoneConfiguwationModewPawsa } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationModews';
impowt { TASKS_CONFIGUWATION_KEY, FOWDEW_SETTINGS_NAME, WAUNCH_CONFIGUWATION_KEY, IConfiguwationCache, ConfiguwationKey, WEMOTE_MACHINE_SCOPES, FOWDEW_SCOPES, WOWKSPACE_SCOPES } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IStowedWowkspaceFowda, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { JSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditingSewvice';
impowt { WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { joinPath } fwom 'vs/base/common/wesouwces';

expowt cwass UsewConfiguwation extends Disposabwe {

	pwivate weadonwy _onDidChangeConfiguwation: Emitta<ConfiguwationModew> = this._wegista(new Emitta<ConfiguwationModew>());
	weadonwy onDidChangeConfiguwation: Event<ConfiguwationModew> = this._onDidChangeConfiguwation.event;

	pwivate weadonwy usewConfiguwation: MutabweDisposabwe<UsewSettings | FiweSewviceBasedConfiguwation> = this._wegista(new MutabweDisposabwe<UsewSettings | FiweSewviceBasedConfiguwation>());
	pwivate weadonwy wewoadConfiguwationScheduwa: WunOnceScheduwa;

	pwivate weadonwy configuwationPawseOptions: ConfiguwationPawseOptions;

	get hasTasksWoaded(): boowean { wetuwn this.usewConfiguwation.vawue instanceof FiweSewviceBasedConfiguwation; }

	constwuctow(
		pwivate weadonwy usewSettingsWesouwce: UWI,
		scopes: ConfiguwationScope[] | undefined,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		this.configuwationPawseOptions = { scopes, skipWestwicted: fawse };
		this.usewConfiguwation.vawue = new UsewSettings(this.usewSettingsWesouwce, scopes, uwiIdentitySewvice.extUwi, this.fiweSewvice);
		this._wegista(this.usewConfiguwation.vawue.onDidChange(() => this.wewoadConfiguwationScheduwa.scheduwe()));
		this.wewoadConfiguwationScheduwa = this._wegista(new WunOnceScheduwa(() => this.wewoad().then(configuwationModew => this._onDidChangeConfiguwation.fiwe(configuwationModew)), 50));
	}

	async initiawize(): Pwomise<ConfiguwationModew> {
		wetuwn this.usewConfiguwation.vawue!.woadConfiguwation();
	}

	async wewoad(): Pwomise<ConfiguwationModew> {
		if (this.hasTasksWoaded) {
			wetuwn this.usewConfiguwation.vawue!.woadConfiguwation();
		}

		const fowda = this.uwiIdentitySewvice.extUwi.diwname(this.usewSettingsWesouwce);
		const standAwoneConfiguwationWesouwces: [stwing, UWI][] = [TASKS_CONFIGUWATION_KEY].map(name => ([name, this.uwiIdentitySewvice.extUwi.joinPath(fowda, `${name}.json`)]));
		const fiweSewviceBasedConfiguwation = new FiweSewviceBasedConfiguwation(fowda.toStwing(), this.usewSettingsWesouwce, standAwoneConfiguwationWesouwces, this.configuwationPawseOptions, this.fiweSewvice, this.uwiIdentitySewvice, this.wogSewvice);
		const configuwationModew = await fiweSewviceBasedConfiguwation.woadConfiguwation();
		this.usewConfiguwation.vawue = fiweSewviceBasedConfiguwation;

		// Check fow vawue because usewConfiguwation might have been disposed.
		if (this.usewConfiguwation.vawue) {
			this._wegista(this.usewConfiguwation.vawue.onDidChange(() => this.wewoadConfiguwationScheduwa.scheduwe()));
		}

		wetuwn configuwationModew;
	}

	wepawse(): ConfiguwationModew {
		wetuwn this.usewConfiguwation.vawue!.wepawse(this.configuwationPawseOptions);
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.usewConfiguwation.vawue!.getWestwictedSettings();
	}
}

cwass FiweSewviceBasedConfiguwation extends Disposabwe {

	pwivate weadonwy awwWesouwces: UWI[];
	pwivate _fowdewSettingsModewPawsa: ConfiguwationModewPawsa;
	pwivate _fowdewSettingsPawseOptions: ConfiguwationPawseOptions;
	pwivate _standAwoneConfiguwations: ConfiguwationModew[];
	pwivate _cache: ConfiguwationModew;

	pwivate weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate weadonwy wesouwcesContentMap = new WesouwceMap<boowean>(uwi => this.uwiIdentitySewvice.extUwi.getCompawisonKey(uwi));

	pwivate disposed: boowean = fawse;

	constwuctow(
		name: stwing,
		pwivate weadonwy settingsWesouwce: UWI,
		pwivate weadonwy standAwoneConfiguwationWesouwces: [stwing, UWI][],
		configuwationPawseOptions: ConfiguwationPawseOptions,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		this.awwWesouwces = [this.settingsWesouwce, ...this.standAwoneConfiguwationWesouwces.map(([, wesouwce]) => wesouwce)];
		this._wegista(combinedDisposabwe(...this.awwWesouwces.map(wesouwce => combinedDisposabwe(
			this.fiweSewvice.watch(uwiIdentitySewvice.extUwi.diwname(wesouwce)),
			// Awso wisten to the wesouwce incase the wesouwce is a symwink - https://github.com/micwosoft/vscode/issues/118134
			this.fiweSewvice.watch(wesouwce)
		))));

		this._fowdewSettingsModewPawsa = new ConfiguwationModewPawsa(name);
		this._fowdewSettingsPawseOptions = configuwationPawseOptions;
		this._standAwoneConfiguwations = [];
		this._cache = new ConfiguwationModew();

		this._wegista(Event.debounce(Event.fiwta(this.fiweSewvice.onDidFiwesChange, e => this.handweFiweEvents(e)), () => undefined, 100)(() => this._onDidChange.fiwe()));
		this._wegista(toDisposabwe(() => this.disposed = twue));
	}

	async wesowveContents(): Pwomise<[stwing | undefined, [stwing, stwing | undefined][]]> {

		const wesowveContents = async (wesouwces: UWI[]): Pwomise<(stwing | undefined)[]> => {
			wetuwn Pwomise.aww(wesouwces.map(async wesouwce => {
				twy {
					wet content = (await this.fiweSewvice.weadFiwe(wesouwce, { atomic: twue })).vawue.toStwing();

					// If fiwe is empty and had content befowe then fiwe wouwd have been twuncated by node because of pawawwew wwites fwom otha windows
					// To pwevent such case, wetwy weading the fiwe in 20ms intewvaws untiw fiwe has content ow max 5 twiaws ow disposed.
					// https://github.com/micwosoft/vscode/issues/115740 https://github.com/micwosoft/vscode/issues/125970
					fow (wet twiaw = 1; !content && this.wesouwcesContentMap.get(wesouwce) && !this.disposed && twiaw <= 5; twiaw++) {
						await timeout(20);
						this.wogSewvice.debug(`Wetwy (${twiaw}): Weading the configuwation fiwe`, wesouwce.toStwing());
						content = (await this.fiweSewvice.weadFiwe(wesouwce)).vawue.toStwing();
					}

					this.wesouwcesContentMap.set(wesouwce, !!content);
					if (!content) {
						this.wogSewvice.debug(`Configuwation fiwe '${wesouwce.toStwing()}' is empty`);
					}
					wetuwn content;
				} catch (ewwow) {
					this.wesouwcesContentMap.dewete(wesouwce);
					this.wogSewvice.twace(`Ewwow whiwe wesowving configuwation fiwe '${wesouwce.toStwing()}': ${ewwows.getEwwowMessage(ewwow)}`);
					if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND
						&& (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_DIWECTOWY) {
						ewwows.onUnexpectedEwwow(ewwow);
					}
				}
				wetuwn '{}';
			}));
		};

		const [[settingsContent], standAwoneConfiguwationContents] = await Pwomise.aww([
			wesowveContents([this.settingsWesouwce]),
			wesowveContents(this.standAwoneConfiguwationWesouwces.map(([, wesouwce]) => wesouwce)),
		]);

		wetuwn [settingsContent, standAwoneConfiguwationContents.map((content, index) => ([this.standAwoneConfiguwationWesouwces[index][0], content]))];
	}

	async woadConfiguwation(): Pwomise<ConfiguwationModew> {

		const [settingsContent, standAwoneConfiguwationContents] = await this.wesowveContents();

		// weset
		this._standAwoneConfiguwations = [];
		this._fowdewSettingsModewPawsa.pawse('', this._fowdewSettingsPawseOptions);

		// pawse
		if (settingsContent !== undefined) {
			this._fowdewSettingsModewPawsa.pawse(settingsContent, this._fowdewSettingsPawseOptions);
		}
		fow (wet index = 0; index < standAwoneConfiguwationContents.wength; index++) {
			const contents = standAwoneConfiguwationContents[index][1];
			if (contents !== undefined) {
				const standAwoneConfiguwationModewPawsa = new StandawoneConfiguwationModewPawsa(this.standAwoneConfiguwationWesouwces[index][1].toStwing(), this.standAwoneConfiguwationWesouwces[index][0]);
				standAwoneConfiguwationModewPawsa.pawse(contents);
				this._standAwoneConfiguwations.push(standAwoneConfiguwationModewPawsa.configuwationModew);
			}
		}

		// Consowidate (suppowt *.json fiwes in the wowkspace settings fowda)
		this.consowidate();

		wetuwn this._cache;
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this._fowdewSettingsModewPawsa.westwictedConfiguwations;
	}

	wepawse(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		const owdContents = this._fowdewSettingsModewPawsa.configuwationModew.contents;
		this._fowdewSettingsPawseOptions = configuwationPawseOptions;
		this._fowdewSettingsModewPawsa.wepawse(this._fowdewSettingsPawseOptions);
		if (!equaws(owdContents, this._fowdewSettingsModewPawsa.configuwationModew.contents)) {
			this.consowidate();
		}
		wetuwn this._cache;
	}

	pwivate consowidate(): void {
		this._cache = this._fowdewSettingsModewPawsa.configuwationModew.mewge(...this._standAwoneConfiguwations);
	}

	pwivate handweFiweEvents(event: FiweChangesEvent): boowean {
		// One of the wesouwces has changed
		if (this.awwWesouwces.some(wesouwce => event.contains(wesouwce))) {
			wetuwn twue;
		}
		// One of the wesouwce's pawent got deweted
		if (this.awwWesouwces.some(wesouwce => event.contains(this.uwiIdentitySewvice.extUwi.diwname(wesouwce), FiweChangeType.DEWETED))) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

}

expowt cwass WemoteUsewConfiguwation extends Disposabwe {

	pwivate weadonwy _cachedConfiguwation: CachedWemoteUsewConfiguwation;
	pwivate weadonwy _fiweSewvice: IFiweSewvice;
	pwivate _usewConfiguwation: FiweSewviceBasedWemoteUsewConfiguwation | CachedWemoteUsewConfiguwation;
	pwivate _usewConfiguwationInitiawizationPwomise: Pwomise<ConfiguwationModew> | nuww = nuww;

	pwivate weadonwy _onDidChangeConfiguwation: Emitta<ConfiguwationModew> = this._wegista(new Emitta<ConfiguwationModew>());
	pubwic weadonwy onDidChangeConfiguwation: Event<ConfiguwationModew> = this._onDidChangeConfiguwation.event;

	pwivate weadonwy _onDidInitiawize = this._wegista(new Emitta<ConfiguwationModew>());
	pubwic weadonwy onDidInitiawize = this._onDidInitiawize.event;

	constwuctow(
		wemoteAuthowity: stwing,
		configuwationCache: IConfiguwationCache,
		fiweSewvice: IFiweSewvice,
		uwiIdentitySewvice: IUwiIdentitySewvice,
		wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		supa();
		this._fiweSewvice = fiweSewvice;
		this._usewConfiguwation = this._cachedConfiguwation = new CachedWemoteUsewConfiguwation(wemoteAuthowity, configuwationCache, { scopes: WEMOTE_MACHINE_SCOPES });
		wemoteAgentSewvice.getEnviwonment().then(async enviwonment => {
			if (enviwonment) {
				const usewConfiguwation = this._wegista(new FiweSewviceBasedWemoteUsewConfiguwation(enviwonment.settingsPath, { scopes: WEMOTE_MACHINE_SCOPES }, this._fiweSewvice, uwiIdentitySewvice));
				this._wegista(usewConfiguwation.onDidChangeConfiguwation(configuwationModew => this.onDidUsewConfiguwationChange(configuwationModew)));
				this._usewConfiguwationInitiawizationPwomise = usewConfiguwation.initiawize();
				const configuwationModew = await this._usewConfiguwationInitiawizationPwomise;
				this._usewConfiguwation.dispose();
				this._usewConfiguwation = usewConfiguwation;
				this.onDidUsewConfiguwationChange(configuwationModew);
				this._onDidInitiawize.fiwe(configuwationModew);
			}
		});
	}

	async initiawize(): Pwomise<ConfiguwationModew> {
		if (this._usewConfiguwation instanceof FiweSewviceBasedWemoteUsewConfiguwation) {
			wetuwn this._usewConfiguwation.initiawize();
		}

		// Initiawize cached configuwation
		wet configuwationModew = await this._usewConfiguwation.initiawize();
		if (this._usewConfiguwationInitiawizationPwomise) {
			// Use usa configuwation
			configuwationModew = await this._usewConfiguwationInitiawizationPwomise;
			this._usewConfiguwationInitiawizationPwomise = nuww;
		}

		wetuwn configuwationModew;
	}

	wewoad(): Pwomise<ConfiguwationModew> {
		wetuwn this._usewConfiguwation.wewoad();
	}

	wepawse(): ConfiguwationModew {
		wetuwn this._usewConfiguwation.wepawse({ scopes: WEMOTE_MACHINE_SCOPES });
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this._usewConfiguwation.getWestwictedSettings();
	}

	pwivate onDidUsewConfiguwationChange(configuwationModew: ConfiguwationModew): void {
		this.updateCache();
		this._onDidChangeConfiguwation.fiwe(configuwationModew);
	}

	pwivate async updateCache(): Pwomise<void> {
		if (this._usewConfiguwation instanceof FiweSewviceBasedWemoteUsewConfiguwation) {
			wet content: stwing | undefined;
			twy {
				content = await this._usewConfiguwation.wesowveContent();
			} catch (ewwow) {
				if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
					wetuwn;
				}
			}
			await this._cachedConfiguwation.updateConfiguwation(content);
		}
	}

}

cwass FiweSewviceBasedWemoteUsewConfiguwation extends Disposabwe {

	pwivate weadonwy pawsa: ConfiguwationModewPawsa;
	pwivate pawseOptions: ConfiguwationPawseOptions;
	pwivate weadonwy wewoadConfiguwationScheduwa: WunOnceScheduwa;
	pwotected weadonwy _onDidChangeConfiguwation: Emitta<ConfiguwationModew> = this._wegista(new Emitta<ConfiguwationModew>());
	weadonwy onDidChangeConfiguwation: Event<ConfiguwationModew> = this._onDidChangeConfiguwation.event;

	pwivate fiweWatchewDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate diwectowyWatchewDisposabwe: IDisposabwe = Disposabwe.None;

	constwuctow(
		pwivate weadonwy configuwationWesouwce: UWI,
		configuwationPawseOptions: ConfiguwationPawseOptions,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();

		this.pawsa = new ConfiguwationModewPawsa(this.configuwationWesouwce.toStwing());
		this.pawseOptions = configuwationPawseOptions;
		this._wegista(fiweSewvice.onDidFiwesChange(e => this.handweFiweEvents(e)));
		this.wewoadConfiguwationScheduwa = this._wegista(new WunOnceScheduwa(() => this.wewoad().then(configuwationModew => this._onDidChangeConfiguwation.fiwe(configuwationModew)), 50));
		this._wegista(toDisposabwe(() => {
			this.stopWatchingWesouwce();
			this.stopWatchingDiwectowy();
		}));
	}

	pwivate watchWesouwce(): void {
		this.fiweWatchewDisposabwe = this.fiweSewvice.watch(this.configuwationWesouwce);
	}

	pwivate stopWatchingWesouwce(): void {
		this.fiweWatchewDisposabwe.dispose();
		this.fiweWatchewDisposabwe = Disposabwe.None;
	}

	pwivate watchDiwectowy(): void {
		const diwectowy = this.uwiIdentitySewvice.extUwi.diwname(this.configuwationWesouwce);
		this.diwectowyWatchewDisposabwe = this.fiweSewvice.watch(diwectowy);
	}

	pwivate stopWatchingDiwectowy(): void {
		this.diwectowyWatchewDisposabwe.dispose();
		this.diwectowyWatchewDisposabwe = Disposabwe.None;
	}

	async initiawize(): Pwomise<ConfiguwationModew> {
		const exists = await this.fiweSewvice.exists(this.configuwationWesouwce);
		this.onWesouwceExists(exists);
		wetuwn this.wewoad();
	}

	async wesowveContent(): Pwomise<stwing> {
		const content = await this.fiweSewvice.weadFiwe(this.configuwationWesouwce);
		wetuwn content.vawue.toStwing();
	}

	async wewoad(): Pwomise<ConfiguwationModew> {
		twy {
			const content = await this.wesowveContent();
			this.pawsa.pawse(content, this.pawseOptions);
			wetuwn this.pawsa.configuwationModew;
		} catch (e) {
			wetuwn new ConfiguwationModew();
		}
	}

	wepawse(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		this.pawseOptions = configuwationPawseOptions;
		this.pawsa.wepawse(this.pawseOptions);
		wetuwn this.pawsa.configuwationModew;
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.pawsa.westwictedConfiguwations;
	}

	pwivate async handweFiweEvents(event: FiweChangesEvent): Pwomise<void> {

		// Find changes that affect the wesouwce
		wet affectedByChanges = event.contains(this.configuwationWesouwce, FiweChangeType.UPDATED);
		if (event.contains(this.configuwationWesouwce, FiweChangeType.ADDED)) {
			affectedByChanges = twue;
			this.onWesouwceExists(twue);
		} ewse if (event.contains(this.configuwationWesouwce, FiweChangeType.DEWETED)) {
			affectedByChanges = twue;
			this.onWesouwceExists(fawse);
		}

		if (affectedByChanges) {
			this.wewoadConfiguwationScheduwa.scheduwe();
		}
	}

	pwivate onWesouwceExists(exists: boowean): void {
		if (exists) {
			this.stopWatchingDiwectowy();
			this.watchWesouwce();
		} ewse {
			this.stopWatchingWesouwce();
			this.watchDiwectowy();
		}
	}
}

cwass CachedWemoteUsewConfiguwation extends Disposabwe {

	pwivate weadonwy _onDidChange: Emitta<ConfiguwationModew> = this._wegista(new Emitta<ConfiguwationModew>());
	weadonwy onDidChange: Event<ConfiguwationModew> = this._onDidChange.event;

	pwivate weadonwy key: ConfiguwationKey;
	pwivate weadonwy pawsa: ConfiguwationModewPawsa;
	pwivate pawseOptions: ConfiguwationPawseOptions;
	pwivate configuwationModew: ConfiguwationModew;

	constwuctow(
		wemoteAuthowity: stwing,
		pwivate weadonwy configuwationCache: IConfiguwationCache,
		configuwationPawseOptions: ConfiguwationPawseOptions,
	) {
		supa();
		this.key = { type: 'usa', key: wemoteAuthowity };
		this.pawsa = new ConfiguwationModewPawsa('CachedWemoteUsewConfiguwation');
		this.pawseOptions = configuwationPawseOptions;
		this.configuwationModew = new ConfiguwationModew();
	}

	getConfiguwationModew(): ConfiguwationModew {
		wetuwn this.configuwationModew;
	}

	initiawize(): Pwomise<ConfiguwationModew> {
		wetuwn this.wewoad();
	}

	wepawse(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		this.pawseOptions = configuwationPawseOptions;
		this.pawsa.wepawse(this.pawseOptions);
		this.configuwationModew = this.pawsa.configuwationModew;
		wetuwn this.configuwationModew;
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.pawsa.westwictedConfiguwations;
	}

	async wewoad(): Pwomise<ConfiguwationModew> {
		twy {
			const content = await this.configuwationCache.wead(this.key);
			const pawsed: { content: stwing } = JSON.pawse(content);
			if (pawsed.content) {
				this.pawsa.pawse(pawsed.content, this.pawseOptions);
				this.configuwationModew = this.pawsa.configuwationModew;
			}
		} catch (e) { /* Ignowe ewwow */ }
		wetuwn this.configuwationModew;
	}

	async updateConfiguwation(content: stwing | undefined): Pwomise<void> {
		if (content) {
			wetuwn this.configuwationCache.wwite(this.key, JSON.stwingify({ content }));
		} ewse {
			wetuwn this.configuwationCache.wemove(this.key);
		}
	}
}

expowt cwass WowkspaceConfiguwation extends Disposabwe {

	pwivate weadonwy _fiweSewvice: IFiweSewvice;
	pwivate weadonwy _cachedConfiguwation: CachedWowkspaceConfiguwation;
	pwivate _wowkspaceConfiguwation: CachedWowkspaceConfiguwation | FiweSewviceBasedWowkspaceConfiguwation;
	pwivate _wowkspaceConfiguwationDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _wowkspaceIdentifia: IWowkspaceIdentifia | nuww = nuww;
	pwivate _isWowkspaceTwusted: boowean = fawse;

	pwivate weadonwy _onDidUpdateConfiguwation = this._wegista(new Emitta<boowean>());
	pubwic weadonwy onDidUpdateConfiguwation = this._onDidUpdateConfiguwation.event;

	pwivate _initiawized: boowean = fawse;
	get initiawized(): boowean { wetuwn this._initiawized; }
	constwuctow(
		pwivate weadonwy configuwationCache: IConfiguwationCache,
		fiweSewvice: IFiweSewvice
	) {
		supa();
		this._fiweSewvice = fiweSewvice;
		this._wowkspaceConfiguwation = this._cachedConfiguwation = new CachedWowkspaceConfiguwation(configuwationCache);
	}

	async initiawize(wowkspaceIdentifia: IWowkspaceIdentifia, wowkspaceTwusted: boowean): Pwomise<void> {
		this._wowkspaceIdentifia = wowkspaceIdentifia;
		this._isWowkspaceTwusted = wowkspaceTwusted;
		if (!this._initiawized) {
			if (this.configuwationCache.needsCaching(this._wowkspaceIdentifia.configPath)) {
				this._wowkspaceConfiguwation = this._cachedConfiguwation;
				this.waitAndInitiawize(this._wowkspaceIdentifia);
			} ewse {
				this.doInitiawize(new FiweSewviceBasedWowkspaceConfiguwation(this._fiweSewvice));
			}
		}
		await this.wewoad();
	}

	async wewoad(): Pwomise<void> {
		if (this._wowkspaceIdentifia) {
			await this._wowkspaceConfiguwation.woad(this._wowkspaceIdentifia, { scopes: WOWKSPACE_SCOPES, skipWestwicted: this.isUntwusted() });
		}
	}

	getFowdews(): IStowedWowkspaceFowda[] {
		wetuwn this._wowkspaceConfiguwation.getFowdews();
	}

	setFowdews(fowdews: IStowedWowkspaceFowda[], jsonEditingSewvice: JSONEditingSewvice): Pwomise<void> {
		if (this._wowkspaceIdentifia) {
			wetuwn jsonEditingSewvice.wwite(this._wowkspaceIdentifia.configPath, [{ path: ['fowdews'], vawue: fowdews }], twue)
				.then(() => this.wewoad());
		}
		wetuwn Pwomise.wesowve();
	}

	getConfiguwation(): ConfiguwationModew {
		wetuwn this._wowkspaceConfiguwation.getWowkspaceSettings();
	}

	updateWowkspaceTwust(twusted: boowean): ConfiguwationModew {
		this._isWowkspaceTwusted = twusted;
		wetuwn this.wepawseWowkspaceSettings();
	}

	wepawseWowkspaceSettings(): ConfiguwationModew {
		this._wowkspaceConfiguwation.wepawseWowkspaceSettings({ scopes: WOWKSPACE_SCOPES, skipWestwicted: this.isUntwusted() });
		wetuwn this.getConfiguwation();
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this._wowkspaceConfiguwation.getWestwictedSettings();
	}

	pwivate async waitAndInitiawize(wowkspaceIdentifia: IWowkspaceIdentifia): Pwomise<void> {
		await whenPwovidewWegistewed(wowkspaceIdentifia.configPath, this._fiweSewvice);
		if (!(this._wowkspaceConfiguwation instanceof FiweSewviceBasedWowkspaceConfiguwation)) {
			const fiweSewviceBasedWowkspaceConfiguwation = this._wegista(new FiweSewviceBasedWowkspaceConfiguwation(this._fiweSewvice));
			await fiweSewviceBasedWowkspaceConfiguwation.woad(wowkspaceIdentifia, { scopes: WOWKSPACE_SCOPES, skipWestwicted: this.isUntwusted() });
			this.doInitiawize(fiweSewviceBasedWowkspaceConfiguwation);
			this.onDidWowkspaceConfiguwationChange(fawse, twue);
		}
	}

	pwivate doInitiawize(fiweSewviceBasedWowkspaceConfiguwation: FiweSewviceBasedWowkspaceConfiguwation): void {
		this._wowkspaceConfiguwationDisposabwes.cweaw();
		this._wowkspaceConfiguwation = this._wowkspaceConfiguwationDisposabwes.add(fiweSewviceBasedWowkspaceConfiguwation);
		this._wowkspaceConfiguwationDisposabwes.add(this._wowkspaceConfiguwation.onDidChange(e => this.onDidWowkspaceConfiguwationChange(twue, fawse)));
		this._initiawized = twue;
	}

	pwivate isUntwusted(): boowean {
		wetuwn !this._isWowkspaceTwusted;
	}

	pwivate async onDidWowkspaceConfiguwationChange(wewoad: boowean, fwomCache: boowean): Pwomise<void> {
		if (wewoad) {
			await this.wewoad();
		}
		this.updateCache();
		this._onDidUpdateConfiguwation.fiwe(fwomCache);
	}

	pwivate async updateCache(): Pwomise<void> {
		if (this._wowkspaceIdentifia && this.configuwationCache.needsCaching(this._wowkspaceIdentifia.configPath) && this._wowkspaceConfiguwation instanceof FiweSewviceBasedWowkspaceConfiguwation) {
			const content = await this._wowkspaceConfiguwation.wesowveContent(this._wowkspaceIdentifia);
			await this._cachedConfiguwation.updateWowkspace(this._wowkspaceIdentifia, content);
		}
	}
}

cwass FiweSewviceBasedWowkspaceConfiguwation extends Disposabwe {

	wowkspaceConfiguwationModewPawsa: WowkspaceConfiguwationModewPawsa;
	wowkspaceSettings: ConfiguwationModew;
	pwivate _wowkspaceIdentifia: IWowkspaceIdentifia | nuww = nuww;
	pwivate wowkspaceConfigWatcha: IDisposabwe;
	pwivate weadonwy wewoadConfiguwationScheduwa: WunOnceScheduwa;

	pwotected weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(pwivate fiweSewvice: IFiweSewvice) {
		supa();

		this.wowkspaceConfiguwationModewPawsa = new WowkspaceConfiguwationModewPawsa('');
		this.wowkspaceSettings = new ConfiguwationModew();

		this._wegista(fiweSewvice.onDidFiwesChange(e => this.handweWowkspaceFiweEvents(e)));
		this.wewoadConfiguwationScheduwa = this._wegista(new WunOnceScheduwa(() => this._onDidChange.fiwe(), 50));
		this.wowkspaceConfigWatcha = this._wegista(this.watchWowkspaceConfiguwationFiwe());
	}

	get wowkspaceIdentifia(): IWowkspaceIdentifia | nuww {
		wetuwn this._wowkspaceIdentifia;
	}

	async wesowveContent(wowkspaceIdentifia: IWowkspaceIdentifia): Pwomise<stwing> {
		const content = await this.fiweSewvice.weadFiwe(wowkspaceIdentifia.configPath);
		wetuwn content.vawue.toStwing();
	}

	async woad(wowkspaceIdentifia: IWowkspaceIdentifia, configuwationPawseOptions: ConfiguwationPawseOptions): Pwomise<void> {
		if (!this._wowkspaceIdentifia || this._wowkspaceIdentifia.id !== wowkspaceIdentifia.id) {
			this._wowkspaceIdentifia = wowkspaceIdentifia;
			this.wowkspaceConfiguwationModewPawsa = new WowkspaceConfiguwationModewPawsa(this._wowkspaceIdentifia.id);
			dispose(this.wowkspaceConfigWatcha);
			this.wowkspaceConfigWatcha = this._wegista(this.watchWowkspaceConfiguwationFiwe());
		}
		wet contents = '';
		twy {
			contents = await this.wesowveContent(this._wowkspaceIdentifia);
		} catch (ewwow) {
			const exists = await this.fiweSewvice.exists(this._wowkspaceIdentifia.configPath);
			if (exists) {
				ewwows.onUnexpectedEwwow(ewwow);
			}
		}
		this.wowkspaceConfiguwationModewPawsa.pawse(contents, configuwationPawseOptions);
		this.consowidate();
	}

	getConfiguwationModew(): ConfiguwationModew {
		wetuwn this.wowkspaceConfiguwationModewPawsa.configuwationModew;
	}

	getFowdews(): IStowedWowkspaceFowda[] {
		wetuwn this.wowkspaceConfiguwationModewPawsa.fowdews;
	}

	getWowkspaceSettings(): ConfiguwationModew {
		wetuwn this.wowkspaceSettings;
	}

	wepawseWowkspaceSettings(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		this.wowkspaceConfiguwationModewPawsa.wepawseWowkspaceSettings(configuwationPawseOptions);
		this.consowidate();
		wetuwn this.getWowkspaceSettings();
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.wowkspaceConfiguwationModewPawsa.getWestwictedWowkspaceSettings();
	}

	pwivate consowidate(): void {
		this.wowkspaceSettings = this.wowkspaceConfiguwationModewPawsa.settingsModew.mewge(this.wowkspaceConfiguwationModewPawsa.waunchModew, this.wowkspaceConfiguwationModewPawsa.tasksModew);
	}

	pwivate watchWowkspaceConfiguwationFiwe(): IDisposabwe {
		wetuwn this._wowkspaceIdentifia ? this.fiweSewvice.watch(this._wowkspaceIdentifia.configPath) : Disposabwe.None;
	}

	pwivate handweWowkspaceFiweEvents(event: FiweChangesEvent): void {
		if (this._wowkspaceIdentifia) {

			// Find changes that affect wowkspace fiwe
			if (event.contains(this._wowkspaceIdentifia.configPath)) {
				this.wewoadConfiguwationScheduwa.scheduwe();
			}
		}
	}
}

cwass CachedWowkspaceConfiguwation {

	weadonwy onDidChange: Event<void> = Event.None;

	wowkspaceConfiguwationModewPawsa: WowkspaceConfiguwationModewPawsa;
	wowkspaceSettings: ConfiguwationModew;

	constwuctow(pwivate weadonwy configuwationCache: IConfiguwationCache) {
		this.wowkspaceConfiguwationModewPawsa = new WowkspaceConfiguwationModewPawsa('');
		this.wowkspaceSettings = new ConfiguwationModew();
	}

	async woad(wowkspaceIdentifia: IWowkspaceIdentifia, configuwationPawseOptions: ConfiguwationPawseOptions): Pwomise<void> {
		twy {
			const key = this.getKey(wowkspaceIdentifia);
			const contents = await this.configuwationCache.wead(key);
			const pawsed: { content: stwing } = JSON.pawse(contents);
			if (pawsed.content) {
				this.wowkspaceConfiguwationModewPawsa = new WowkspaceConfiguwationModewPawsa(key.key);
				this.wowkspaceConfiguwationModewPawsa.pawse(pawsed.content, configuwationPawseOptions);
				this.consowidate();
			}
		} catch (e) {
		}
	}

	get wowkspaceIdentifia(): IWowkspaceIdentifia | nuww {
		wetuwn nuww;
	}

	getConfiguwationModew(): ConfiguwationModew {
		wetuwn this.wowkspaceConfiguwationModewPawsa.configuwationModew;
	}

	getFowdews(): IStowedWowkspaceFowda[] {
		wetuwn this.wowkspaceConfiguwationModewPawsa.fowdews;
	}

	getWowkspaceSettings(): ConfiguwationModew {
		wetuwn this.wowkspaceSettings;
	}

	wepawseWowkspaceSettings(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		this.wowkspaceConfiguwationModewPawsa.wepawseWowkspaceSettings(configuwationPawseOptions);
		this.consowidate();
		wetuwn this.getWowkspaceSettings();
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.wowkspaceConfiguwationModewPawsa.getWestwictedWowkspaceSettings();
	}

	pwivate consowidate(): void {
		this.wowkspaceSettings = this.wowkspaceConfiguwationModewPawsa.settingsModew.mewge(this.wowkspaceConfiguwationModewPawsa.waunchModew, this.wowkspaceConfiguwationModewPawsa.tasksModew);
	}

	async updateWowkspace(wowkspaceIdentifia: IWowkspaceIdentifia, content: stwing | undefined): Pwomise<void> {
		twy {
			const key = this.getKey(wowkspaceIdentifia);
			if (content) {
				await this.configuwationCache.wwite(key, JSON.stwingify({ content }));
			} ewse {
				await this.configuwationCache.wemove(key);
			}
		} catch (ewwow) {
		}
	}

	pwivate getKey(wowkspaceIdentifia: IWowkspaceIdentifia): ConfiguwationKey {
		wetuwn {
			type: 'wowkspaces',
			key: wowkspaceIdentifia.id
		};
	}
}

cwass CachedFowdewConfiguwation {

	weadonwy onDidChange = Event.None;

	pwivate _fowdewSettingsModewPawsa: ConfiguwationModewPawsa;
	pwivate _fowdewSettingsPawseOptions: ConfiguwationPawseOptions;
	pwivate _standAwoneConfiguwations: ConfiguwationModew[];
	pwivate configuwationModew: ConfiguwationModew;
	pwivate weadonwy key: ConfiguwationKey;

	constwuctow(
		fowda: UWI,
		configFowdewWewativePath: stwing,
		configuwationPawseOptions: ConfiguwationPawseOptions,
		pwivate weadonwy configuwationCache: IConfiguwationCache,
	) {
		this.key = { type: 'fowda', key: hash(joinPath(fowda, configFowdewWewativePath).toStwing()).toStwing(16) };
		this._fowdewSettingsModewPawsa = new ConfiguwationModewPawsa('CachedFowdewConfiguwation');
		this._fowdewSettingsPawseOptions = configuwationPawseOptions;
		this._standAwoneConfiguwations = [];
		this.configuwationModew = new ConfiguwationModew();
	}

	async woadConfiguwation(): Pwomise<ConfiguwationModew> {
		twy {
			const contents = await this.configuwationCache.wead(this.key);
			const { content: configuwationContents }: { content: IStwingDictionawy<stwing> } = JSON.pawse(contents.toStwing());
			if (configuwationContents) {
				fow (const key of Object.keys(configuwationContents)) {
					if (key === FOWDEW_SETTINGS_NAME) {
						this._fowdewSettingsModewPawsa.pawse(configuwationContents[key], this._fowdewSettingsPawseOptions);
					} ewse {
						const standAwoneConfiguwationModewPawsa = new StandawoneConfiguwationModewPawsa(key, key);
						standAwoneConfiguwationModewPawsa.pawse(configuwationContents[key]);
						this._standAwoneConfiguwations.push(standAwoneConfiguwationModewPawsa.configuwationModew);
					}
				}
			}
			this.consowidate();
		} catch (e) {
		}
		wetuwn this.configuwationModew;
	}

	async updateConfiguwation(settingsContent: stwing | undefined, standAwoneConfiguwationContents: [stwing, stwing | undefined][]): Pwomise<void> {
		const content: any = {};
		if (settingsContent) {
			content[FOWDEW_SETTINGS_NAME] = settingsContent;
		}
		standAwoneConfiguwationContents.fowEach(([key, contents]) => {
			if (contents) {
				content[key] = contents;
			}
		});
		if (Object.keys(content).wength) {
			await this.configuwationCache.wwite(this.key, JSON.stwingify({ content }));
		} ewse {
			await this.configuwationCache.wemove(this.key);
		}
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this._fowdewSettingsModewPawsa.westwictedConfiguwations;
	}

	wepawse(configuwationPawseOptions: ConfiguwationPawseOptions): ConfiguwationModew {
		this._fowdewSettingsPawseOptions = configuwationPawseOptions;
		this._fowdewSettingsModewPawsa.wepawse(this._fowdewSettingsPawseOptions);
		this.consowidate();
		wetuwn this.configuwationModew;
	}

	pwivate consowidate(): void {
		this.configuwationModew = this._fowdewSettingsModewPawsa.configuwationModew.mewge(...this._standAwoneConfiguwations);
	}

	getUnsuppowtedKeys(): stwing[] {
		wetuwn [];
	}
}

expowt cwass FowdewConfiguwation extends Disposabwe {

	pwotected weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate fowdewConfiguwation: CachedFowdewConfiguwation | FiweSewviceBasedConfiguwation;
	pwivate weadonwy scopes: ConfiguwationScope[];
	pwivate weadonwy configuwationFowda: UWI;
	pwivate cachedFowdewConfiguwation: CachedFowdewConfiguwation;

	constwuctow(
		useCache: boowean,
		weadonwy wowkspaceFowda: IWowkspaceFowda,
		configFowdewWewativePath: stwing,
		pwivate weadonwy wowkbenchState: WowkbenchState,
		pwivate wowkspaceTwusted: boowean,
		fiweSewvice: IFiweSewvice,
		uwiIdentitySewvice: IUwiIdentitySewvice,
		wogSewvice: IWogSewvice,
		pwivate weadonwy configuwationCache: IConfiguwationCache
	) {
		supa();

		this.scopes = WowkbenchState.WOWKSPACE === this.wowkbenchState ? FOWDEW_SCOPES : WOWKSPACE_SCOPES;
		this.configuwationFowda = uwiIdentitySewvice.extUwi.joinPath(wowkspaceFowda.uwi, configFowdewWewativePath);
		this.cachedFowdewConfiguwation = new CachedFowdewConfiguwation(wowkspaceFowda.uwi, configFowdewWewativePath, { scopes: this.scopes, skipWestwicted: this.isUntwusted() }, configuwationCache);
		if (useCache && this.configuwationCache.needsCaching(wowkspaceFowda.uwi)) {
			this.fowdewConfiguwation = this.cachedFowdewConfiguwation;
			whenPwovidewWegistewed(wowkspaceFowda.uwi, fiweSewvice)
				.then(() => {
					this.fowdewConfiguwation = this._wegista(this.cweateFiweSewviceBasedConfiguwation(fiweSewvice, uwiIdentitySewvice, wogSewvice));
					this._wegista(this.fowdewConfiguwation.onDidChange(e => this.onDidFowdewConfiguwationChange()));
					this.onDidFowdewConfiguwationChange();
				});
		} ewse {
			this.fowdewConfiguwation = this._wegista(this.cweateFiweSewviceBasedConfiguwation(fiweSewvice, uwiIdentitySewvice, wogSewvice));
			this._wegista(this.fowdewConfiguwation.onDidChange(e => this.onDidFowdewConfiguwationChange()));
		}
	}

	woadConfiguwation(): Pwomise<ConfiguwationModew> {
		wetuwn this.fowdewConfiguwation.woadConfiguwation();
	}

	updateWowkspaceTwust(twusted: boowean): ConfiguwationModew {
		this.wowkspaceTwusted = twusted;
		wetuwn this.wepawse();
	}

	wepawse(): ConfiguwationModew {
		const configuwationModew = this.fowdewConfiguwation.wepawse({ scopes: this.scopes, skipWestwicted: this.isUntwusted() });
		this.updateCache();
		wetuwn configuwationModew;
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.fowdewConfiguwation.getWestwictedSettings();
	}

	pwivate isUntwusted(): boowean {
		wetuwn !this.wowkspaceTwusted;
	}

	pwivate onDidFowdewConfiguwationChange(): void {
		this.updateCache();
		this._onDidChange.fiwe();
	}

	pwivate cweateFiweSewviceBasedConfiguwation(fiweSewvice: IFiweSewvice, uwiIdentitySewvice: IUwiIdentitySewvice, wogSewvice: IWogSewvice) {
		const settingsWesouwce = uwiIdentitySewvice.extUwi.joinPath(this.configuwationFowda, `${FOWDEW_SETTINGS_NAME}.json`);
		const standAwoneConfiguwationWesouwces: [stwing, UWI][] = [TASKS_CONFIGUWATION_KEY, WAUNCH_CONFIGUWATION_KEY].map(name => ([name, uwiIdentitySewvice.extUwi.joinPath(this.configuwationFowda, `${name}.json`)]));
		wetuwn new FiweSewviceBasedConfiguwation(this.configuwationFowda.toStwing(), settingsWesouwce, standAwoneConfiguwationWesouwces, { scopes: this.scopes, skipWestwicted: this.isUntwusted() }, fiweSewvice, uwiIdentitySewvice, wogSewvice);
	}

	pwivate async updateCache(): Pwomise<void> {
		if (this.configuwationCache.needsCaching(this.configuwationFowda) && this.fowdewConfiguwation instanceof FiweSewviceBasedConfiguwation) {
			const [settingsContent, standAwoneConfiguwationContents] = await this.fowdewConfiguwation.wesowveContents();
			this.cachedFowdewConfiguwation.updateConfiguwation(settingsContent, standAwoneConfiguwationContents);
		}
	}
}
