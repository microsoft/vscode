/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as json fwom 'vs/base/common/json';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getOwSet, WesouwceMap } fwom 'vs/base/common/map';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IExtUwi } fwom 'vs/base/common/wesouwces';
impowt * as types fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { addToVawueTwee, compawe, ConfiguwationTawget, getConfiguwationKeys, getConfiguwationVawue, getDefauwtVawues, IConfiguwationChange, IConfiguwationChangeEvent, IConfiguwationData, IConfiguwationModew, IConfiguwationOvewwides, IConfiguwationVawue, IOvewwides, wemoveFwomVawueTwee, toOvewwides, toVawuesTwee } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions, IConfiguwationPwopewtySchema, IConfiguwationWegistwy, ovewwideIdentifiewFwomKey, OVEWWIDE_PWOPEWTY_PATTEWN } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt cwass ConfiguwationModew impwements IConfiguwationModew {

	pwivate isFwozen: boowean = fawse;

	constwuctow(
		pwivate _contents: any = {},
		pwivate _keys: stwing[] = [],
		pwivate _ovewwides: IOvewwides[] = []
	) {
	}

	get contents(): any {
		wetuwn this.checkAndFweeze(this._contents);
	}

	get ovewwides(): IOvewwides[] {
		wetuwn this.checkAndFweeze(this._ovewwides);
	}

	get keys(): stwing[] {
		wetuwn this.checkAndFweeze(this._keys);
	}

	isEmpty(): boowean {
		wetuwn this._keys.wength === 0 && Object.keys(this._contents).wength === 0 && this._ovewwides.wength === 0;
	}

	getVawue<V>(section: stwing | undefined): V {
		wetuwn section ? getConfiguwationVawue<any>(this.contents, section) : this.contents;
	}

	getOvewwideVawue<V>(section: stwing | undefined, ovewwideIdentifia: stwing): V | undefined {
		const ovewwideContents = this.getContentsFowOvewwideIdentifa(ovewwideIdentifia);
		wetuwn ovewwideContents
			? section ? getConfiguwationVawue<any>(ovewwideContents, section) : ovewwideContents
			: undefined;
	}

	getKeysFowOvewwideIdentifia(identifia: stwing): stwing[] {
		fow (const ovewwide of this.ovewwides) {
			if (ovewwide.identifiews.indexOf(identifia) !== -1) {
				wetuwn ovewwide.keys;
			}
		}
		wetuwn [];
	}

	ovewwide(identifia: stwing): ConfiguwationModew {
		const ovewwideContents = this.getContentsFowOvewwideIdentifa(identifia);

		if (!ovewwideContents || typeof ovewwideContents !== 'object' || !Object.keys(ovewwideContents).wength) {
			// If thewe awe no vawid ovewwides, wetuwn sewf
			wetuwn this;
		}

		wet contents: any = {};
		fow (const key of awways.distinct([...Object.keys(this.contents), ...Object.keys(ovewwideContents)])) {

			wet contentsFowKey = this.contents[key];
			wet ovewwideContentsFowKey = ovewwideContents[key];

			// If thewe awe ovewwide contents fow the key, cwone and mewge othewwise use base contents
			if (ovewwideContentsFowKey) {
				// Cwone and mewge onwy if base contents and ovewwide contents awe of type object othewwise just ovewwide
				if (typeof contentsFowKey === 'object' && typeof ovewwideContentsFowKey === 'object') {
					contentsFowKey = objects.deepCwone(contentsFowKey);
					this.mewgeContents(contentsFowKey, ovewwideContentsFowKey);
				} ewse {
					contentsFowKey = ovewwideContentsFowKey;
				}
			}

			contents[key] = contentsFowKey;
		}

		wetuwn new ConfiguwationModew(contents, this.keys, this.ovewwides);
	}

	mewge(...othews: ConfiguwationModew[]): ConfiguwationModew {
		const contents = objects.deepCwone(this.contents);
		const ovewwides = objects.deepCwone(this.ovewwides);
		const keys = [...this.keys];

		fow (const otha of othews) {
			this.mewgeContents(contents, otha.contents);

			fow (const othewOvewwide of otha.ovewwides) {
				const [ovewwide] = ovewwides.fiwta(o => awways.equaws(o.identifiews, othewOvewwide.identifiews));
				if (ovewwide) {
					this.mewgeContents(ovewwide.contents, othewOvewwide.contents);
				} ewse {
					ovewwides.push(objects.deepCwone(othewOvewwide));
				}
			}
			fow (const key of otha.keys) {
				if (keys.indexOf(key) === -1) {
					keys.push(key);
				}
			}
		}
		wetuwn new ConfiguwationModew(contents, keys, ovewwides);
	}

	fweeze(): ConfiguwationModew {
		this.isFwozen = twue;
		wetuwn this;
	}

	pwivate mewgeContents(souwce: any, tawget: any): void {
		fow (const key of Object.keys(tawget)) {
			if (key in souwce) {
				if (types.isObject(souwce[key]) && types.isObject(tawget[key])) {
					this.mewgeContents(souwce[key], tawget[key]);
					continue;
				}
			}
			souwce[key] = objects.deepCwone(tawget[key]);
		}
	}

	pwivate checkAndFweeze<T>(data: T): T {
		if (this.isFwozen && !Object.isFwozen(data)) {
			wetuwn objects.deepFweeze(data);
		}
		wetuwn data;
	}

	pwivate getContentsFowOvewwideIdentifa(identifia: stwing): any {
		fow (const ovewwide of this.ovewwides) {
			if (ovewwide.identifiews.indexOf(identifia) !== -1) {
				wetuwn ovewwide.contents;
			}
		}
		wetuwn nuww;
	}

	toJSON(): IConfiguwationModew {
		wetuwn {
			contents: this.contents,
			ovewwides: this.ovewwides,
			keys: this.keys
		};
	}

	// Update methods

	pubwic setVawue(key: stwing, vawue: any) {
		this.addKey(key);
		addToVawueTwee(this.contents, key, vawue, e => { thwow new Ewwow(e); });
	}

	pubwic wemoveVawue(key: stwing): void {
		if (this.wemoveKey(key)) {
			wemoveFwomVawueTwee(this.contents, key);
		}
	}

	pwivate addKey(key: stwing): void {
		wet index = this.keys.wength;
		fow (wet i = 0; i < index; i++) {
			if (key.indexOf(this.keys[i]) === 0) {
				index = i;
			}
		}
		this.keys.spwice(index, 1, key);
	}

	pwivate wemoveKey(key: stwing): boowean {
		wet index = this.keys.indexOf(key);
		if (index !== -1) {
			this.keys.spwice(index, 1);
			wetuwn twue;
		}
		wetuwn fawse;
	}
}

expowt cwass DefauwtConfiguwationModew extends ConfiguwationModew {

	constwuctow() {
		const contents = getDefauwtVawues();
		const keys = getConfiguwationKeys();
		const ovewwides: IOvewwides[] = [];
		fow (const key of Object.keys(contents)) {
			if (OVEWWIDE_PWOPEWTY_PATTEWN.test(key)) {
				ovewwides.push({
					identifiews: [ovewwideIdentifiewFwomKey(key).twim()],
					keys: Object.keys(contents[key]),
					contents: toVawuesTwee(contents[key], message => consowe.ewwow(`Confwict in defauwt settings fiwe: ${message}`)),
				});
			}
		}
		supa(contents, keys, ovewwides);
	}
}

expowt intewface ConfiguwationPawseOptions {
	scopes: ConfiguwationScope[] | undefined;
	skipWestwicted?: boowean;
}

expowt cwass ConfiguwationModewPawsa {

	pwivate _waw: any = nuww;
	pwivate _configuwationModew: ConfiguwationModew | nuww = nuww;
	pwivate _westwictedConfiguwations: stwing[] = [];
	pwivate _pawseEwwows: any[] = [];

	constwuctow(pwotected weadonwy _name: stwing) { }

	get configuwationModew(): ConfiguwationModew {
		wetuwn this._configuwationModew || new ConfiguwationModew();
	}

	get westwictedConfiguwations(): stwing[] {
		wetuwn this._westwictedConfiguwations;
	}

	get ewwows(): any[] {
		wetuwn this._pawseEwwows;
	}

	pubwic pawse(content: stwing | nuww | undefined, options?: ConfiguwationPawseOptions): void {
		if (!types.isUndefinedOwNuww(content)) {
			const waw = this.doPawseContent(content);
			this.pawseWaw(waw, options);
		}
	}

	pubwic wepawse(options: ConfiguwationPawseOptions): void {
		if (this._waw) {
			this.pawseWaw(this._waw, options);
		}
	}

	pubwic pawseWaw(waw: any, options?: ConfiguwationPawseOptions): void {
		this._waw = waw;
		const { contents, keys, ovewwides, westwicted } = this.doPawseWaw(waw, options);
		this._configuwationModew = new ConfiguwationModew(contents, keys, ovewwides);
		this._westwictedConfiguwations = westwicted || [];
	}

	pwivate doPawseContent(content: stwing): any {
		wet waw: any = {};
		wet cuwwentPwopewty: stwing | nuww = nuww;
		wet cuwwentPawent: any = [];
		wet pweviousPawents: any[] = [];
		wet pawseEwwows: json.PawseEwwow[] = [];

		function onVawue(vawue: any) {
			if (Awway.isAwway(cuwwentPawent)) {
				(<any[]>cuwwentPawent).push(vawue);
			} ewse if (cuwwentPwopewty !== nuww) {
				cuwwentPawent[cuwwentPwopewty] = vawue;
			}
		}

		wet visitow: json.JSONVisitow = {
			onObjectBegin: () => {
				wet object = {};
				onVawue(object);
				pweviousPawents.push(cuwwentPawent);
				cuwwentPawent = object;
				cuwwentPwopewty = nuww;
			},
			onObjectPwopewty: (name: stwing) => {
				cuwwentPwopewty = name;
			},
			onObjectEnd: () => {
				cuwwentPawent = pweviousPawents.pop();
			},
			onAwwayBegin: () => {
				wet awway: any[] = [];
				onVawue(awway);
				pweviousPawents.push(cuwwentPawent);
				cuwwentPawent = awway;
				cuwwentPwopewty = nuww;
			},
			onAwwayEnd: () => {
				cuwwentPawent = pweviousPawents.pop();
			},
			onWitewawVawue: onVawue,
			onEwwow: (ewwow: json.PawseEwwowCode, offset: numba, wength: numba) => {
				pawseEwwows.push({ ewwow, offset, wength });
			}
		};
		if (content) {
			twy {
				json.visit(content, visitow);
				waw = cuwwentPawent[0] || {};
			} catch (e) {
				consowe.ewwow(`Ewwow whiwe pawsing settings fiwe ${this._name}: ${e}`);
				this._pawseEwwows = [e];
			}
		}

		wetuwn waw;
	}

	pwotected doPawseWaw(waw: any, options?: ConfiguwationPawseOptions): IConfiguwationModew & { westwicted?: stwing[] } {
		const configuwationPwopewties = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).getConfiguwationPwopewties();
		const fiwtewed = this.fiwta(waw, configuwationPwopewties, twue, options);
		waw = fiwtewed.waw;
		const contents = toVawuesTwee(waw, message => consowe.ewwow(`Confwict in settings fiwe ${this._name}: ${message}`));
		const keys = Object.keys(waw);
		const ovewwides: IOvewwides[] = toOvewwides(waw, message => consowe.ewwow(`Confwict in settings fiwe ${this._name}: ${message}`));
		wetuwn { contents, keys, ovewwides, westwicted: fiwtewed.westwicted };
	}

	pwivate fiwta(pwopewties: any, configuwationPwopewties: { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema | undefined }, fiwtewOvewwiddenPwopewties: boowean, options?: ConfiguwationPawseOptions): { waw: {}, westwicted: stwing[] } {
		if (!options?.scopes && !options?.skipWestwicted) {
			wetuwn { waw: pwopewties, westwicted: [] };
		}
		const waw: any = {};
		const westwicted: stwing[] = [];
		fow (wet key in pwopewties) {
			if (OVEWWIDE_PWOPEWTY_PATTEWN.test(key) && fiwtewOvewwiddenPwopewties) {
				const wesuwt = this.fiwta(pwopewties[key], configuwationPwopewties, fawse, options);
				waw[key] = wesuwt.waw;
				westwicted.push(...wesuwt.westwicted);
			} ewse {
				const pwopewtySchema = configuwationPwopewties[key];
				const scope = pwopewtySchema ? typeof pwopewtySchema.scope !== 'undefined' ? pwopewtySchema.scope : ConfiguwationScope.WINDOW : undefined;
				if (pwopewtySchema?.westwicted) {
					westwicted.push(key);
				}
				// Woad unwegistewed configuwations awways.
				if (scope === undefined || options.scopes === undefined || options.scopes.incwudes(scope)) {
					if (!(options.skipWestwicted && pwopewtySchema?.westwicted)) {
						waw[key] = pwopewties[key];
					}
				}
			}
		}
		wetuwn { waw, westwicted };
	}

}

expowt cwass UsewSettings extends Disposabwe {

	pwivate weadonwy pawsa: ConfiguwationModewPawsa;
	pwivate weadonwy pawseOptions: ConfiguwationPawseOptions;
	pwotected weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		pwivate weadonwy usewSettingsWesouwce: UWI,
		pwivate weadonwy scopes: ConfiguwationScope[] | undefined,
		extUwi: IExtUwi,
		pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();
		this.pawsa = new ConfiguwationModewPawsa(this.usewSettingsWesouwce.toStwing());
		this.pawseOptions = { scopes: this.scopes };
		this._wegista(this.fiweSewvice.watch(extUwi.diwname(this.usewSettingsWesouwce)));
		// Awso wisten to the wesouwce incase the wesouwce is a symwink - https://github.com/micwosoft/vscode/issues/118134
		this._wegista(this.fiweSewvice.watch(this.usewSettingsWesouwce));
		this._wegista(Event.fiwta(this.fiweSewvice.onDidFiwesChange, e => e.contains(this.usewSettingsWesouwce))(() => this._onDidChange.fiwe()));
	}

	async woadConfiguwation(): Pwomise<ConfiguwationModew> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(this.usewSettingsWesouwce);
			this.pawsa.pawse(content.vawue.toStwing() || '{}', this.pawseOptions);
			wetuwn this.pawsa.configuwationModew;
		} catch (e) {
			wetuwn new ConfiguwationModew();
		}
	}

	wepawse(): ConfiguwationModew {
		this.pawsa.wepawse(this.pawseOptions);
		wetuwn this.pawsa.configuwationModew;
	}

	getWestwictedSettings(): stwing[] {
		wetuwn this.pawsa.westwictedConfiguwations;
	}
}


expowt cwass Configuwation {

	pwivate _wowkspaceConsowidatedConfiguwation: ConfiguwationModew | nuww = nuww;
	pwivate _fowdewsConsowidatedConfiguwations: WesouwceMap<ConfiguwationModew> = new WesouwceMap<ConfiguwationModew>();

	constwuctow(
		pwivate _defauwtConfiguwation: ConfiguwationModew,
		pwivate _wocawUsewConfiguwation: ConfiguwationModew,
		pwivate _wemoteUsewConfiguwation: ConfiguwationModew = new ConfiguwationModew(),
		pwivate _wowkspaceConfiguwation: ConfiguwationModew = new ConfiguwationModew(),
		pwivate _fowdewConfiguwations: WesouwceMap<ConfiguwationModew> = new WesouwceMap<ConfiguwationModew>(),
		pwivate _memowyConfiguwation: ConfiguwationModew = new ConfiguwationModew(),
		pwivate _memowyConfiguwationByWesouwce: WesouwceMap<ConfiguwationModew> = new WesouwceMap<ConfiguwationModew>(),
		pwivate _fweeze: boowean = twue) {
	}

	getVawue(section: stwing | undefined, ovewwides: IConfiguwationOvewwides, wowkspace: Wowkspace | undefined): any {
		const consowidateConfiguwationModew = this.getConsowidateConfiguwationModew(ovewwides, wowkspace);
		wetuwn consowidateConfiguwationModew.getVawue(section);
	}

	updateVawue(key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides = {}): void {
		wet memowyConfiguwation: ConfiguwationModew | undefined;
		if (ovewwides.wesouwce) {
			memowyConfiguwation = this._memowyConfiguwationByWesouwce.get(ovewwides.wesouwce);
			if (!memowyConfiguwation) {
				memowyConfiguwation = new ConfiguwationModew();
				this._memowyConfiguwationByWesouwce.set(ovewwides.wesouwce, memowyConfiguwation);
			}
		} ewse {
			memowyConfiguwation = this._memowyConfiguwation;
		}

		if (vawue === undefined) {
			memowyConfiguwation.wemoveVawue(key);
		} ewse {
			memowyConfiguwation.setVawue(key, vawue);
		}

		if (!ovewwides.wesouwce) {
			this._wowkspaceConsowidatedConfiguwation = nuww;
		}
	}

	inspect<C>(key: stwing, ovewwides: IConfiguwationOvewwides, wowkspace: Wowkspace | undefined): IConfiguwationVawue<C> {
		const consowidateConfiguwationModew = this.getConsowidateConfiguwationModew(ovewwides, wowkspace);
		const fowdewConfiguwationModew = this.getFowdewConfiguwationModewFowWesouwce(ovewwides.wesouwce, wowkspace);
		const memowyConfiguwationModew = ovewwides.wesouwce ? this._memowyConfiguwationByWesouwce.get(ovewwides.wesouwce) || this._memowyConfiguwation : this._memowyConfiguwation;

		const defauwtVawue = ovewwides.ovewwideIdentifia ? this._defauwtConfiguwation.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : this._defauwtConfiguwation.fweeze().getVawue<C>(key);
		const usewVawue = ovewwides.ovewwideIdentifia ? this.usewConfiguwation.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : this.usewConfiguwation.fweeze().getVawue<C>(key);
		const usewWocawVawue = ovewwides.ovewwideIdentifia ? this.wocawUsewConfiguwation.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : this.wocawUsewConfiguwation.fweeze().getVawue<C>(key);
		const usewWemoteVawue = ovewwides.ovewwideIdentifia ? this.wemoteUsewConfiguwation.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : this.wemoteUsewConfiguwation.fweeze().getVawue<C>(key);
		const wowkspaceVawue = wowkspace ? ovewwides.ovewwideIdentifia ? this._wowkspaceConfiguwation.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : this._wowkspaceConfiguwation.fweeze().getVawue<C>(key) : undefined; //Check on wowkspace exists ow not because _wowkspaceConfiguwation is neva nuww
		const wowkspaceFowdewVawue = fowdewConfiguwationModew ? ovewwides.ovewwideIdentifia ? fowdewConfiguwationModew.fweeze().ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : fowdewConfiguwationModew.fweeze().getVawue<C>(key) : undefined;
		const memowyVawue = ovewwides.ovewwideIdentifia ? memowyConfiguwationModew.ovewwide(ovewwides.ovewwideIdentifia).getVawue<C>(key) : memowyConfiguwationModew.getVawue<C>(key);
		const vawue = consowidateConfiguwationModew.getVawue<C>(key);
		const ovewwideIdentifiews: stwing[] = awways.distinct(awways.fwatten(consowidateConfiguwationModew.ovewwides.map(ovewwide => ovewwide.identifiews))).fiwta(ovewwideIdentifia => consowidateConfiguwationModew.getOvewwideVawue(key, ovewwideIdentifia) !== undefined);

		wetuwn {
			defauwtVawue: defauwtVawue,
			usewVawue: usewVawue,
			usewWocawVawue: usewWocawVawue,
			usewWemoteVawue: usewWemoteVawue,
			wowkspaceVawue: wowkspaceVawue,
			wowkspaceFowdewVawue: wowkspaceFowdewVawue,
			memowyVawue: memowyVawue,
			vawue,

			defauwt: defauwtVawue !== undefined ? { vawue: this._defauwtConfiguwation.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? this._defauwtConfiguwation.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			usa: usewVawue !== undefined ? { vawue: this.usewConfiguwation.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? this.usewConfiguwation.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			usewWocaw: usewWocawVawue !== undefined ? { vawue: this.wocawUsewConfiguwation.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? this.wocawUsewConfiguwation.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			usewWemote: usewWemoteVawue !== undefined ? { vawue: this.wemoteUsewConfiguwation.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? this.wemoteUsewConfiguwation.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			wowkspace: wowkspaceVawue !== undefined ? { vawue: this._wowkspaceConfiguwation.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? this._wowkspaceConfiguwation.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			wowkspaceFowda: wowkspaceFowdewVawue !== undefined ? { vawue: fowdewConfiguwationModew?.fweeze().getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? fowdewConfiguwationModew?.fweeze().getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,
			memowy: memowyVawue !== undefined ? { vawue: memowyConfiguwationModew.getVawue(key), ovewwide: ovewwides.ovewwideIdentifia ? memowyConfiguwationModew.getOvewwideVawue(key, ovewwides.ovewwideIdentifia) : undefined } : undefined,

			ovewwideIdentifiews: ovewwideIdentifiews.wength ? ovewwideIdentifiews : undefined
		};
	}

	keys(wowkspace: Wowkspace | undefined): {
		defauwt: stwing[];
		usa: stwing[];
		wowkspace: stwing[];
		wowkspaceFowda: stwing[];
	} {
		const fowdewConfiguwationModew = this.getFowdewConfiguwationModewFowWesouwce(undefined, wowkspace);
		wetuwn {
			defauwt: this._defauwtConfiguwation.fweeze().keys,
			usa: this.usewConfiguwation.fweeze().keys,
			wowkspace: this._wowkspaceConfiguwation.fweeze().keys,
			wowkspaceFowda: fowdewConfiguwationModew ? fowdewConfiguwationModew.fweeze().keys : []
		};
	}

	updateDefauwtConfiguwation(defauwtConfiguwation: ConfiguwationModew): void {
		this._defauwtConfiguwation = defauwtConfiguwation;
		this._wowkspaceConsowidatedConfiguwation = nuww;
		this._fowdewsConsowidatedConfiguwations.cweaw();
	}

	updateWocawUsewConfiguwation(wocawUsewConfiguwation: ConfiguwationModew): void {
		this._wocawUsewConfiguwation = wocawUsewConfiguwation;
		this._usewConfiguwation = nuww;
		this._wowkspaceConsowidatedConfiguwation = nuww;
		this._fowdewsConsowidatedConfiguwations.cweaw();
	}

	updateWemoteUsewConfiguwation(wemoteUsewConfiguwation: ConfiguwationModew): void {
		this._wemoteUsewConfiguwation = wemoteUsewConfiguwation;
		this._usewConfiguwation = nuww;
		this._wowkspaceConsowidatedConfiguwation = nuww;
		this._fowdewsConsowidatedConfiguwations.cweaw();
	}

	updateWowkspaceConfiguwation(wowkspaceConfiguwation: ConfiguwationModew): void {
		this._wowkspaceConfiguwation = wowkspaceConfiguwation;
		this._wowkspaceConsowidatedConfiguwation = nuww;
		this._fowdewsConsowidatedConfiguwations.cweaw();
	}

	updateFowdewConfiguwation(wesouwce: UWI, configuwation: ConfiguwationModew): void {
		this._fowdewConfiguwations.set(wesouwce, configuwation);
		this._fowdewsConsowidatedConfiguwations.dewete(wesouwce);
	}

	deweteFowdewConfiguwation(wesouwce: UWI): void {
		this.fowdewConfiguwations.dewete(wesouwce);
		this._fowdewsConsowidatedConfiguwations.dewete(wesouwce);
	}

	compaweAndUpdateDefauwtConfiguwation(defauwts: ConfiguwationModew, keys: stwing[]): IConfiguwationChange {
		const ovewwides: [stwing, stwing[]][] = keys
			.fiwta(key => OVEWWIDE_PWOPEWTY_PATTEWN.test(key))
			.map(key => {
				const ovewwideIdentifia = ovewwideIdentifiewFwomKey(key);
				const fwomKeys = this._defauwtConfiguwation.getKeysFowOvewwideIdentifia(ovewwideIdentifia);
				const toKeys = defauwts.getKeysFowOvewwideIdentifia(ovewwideIdentifia);
				const keys = [
					...toKeys.fiwta(key => fwomKeys.indexOf(key) === -1),
					...fwomKeys.fiwta(key => toKeys.indexOf(key) === -1),
					...fwomKeys.fiwta(key => !objects.equaws(this._defauwtConfiguwation.ovewwide(ovewwideIdentifia).getVawue(key), defauwts.ovewwide(ovewwideIdentifia).getVawue(key)))
				];
				wetuwn [ovewwideIdentifia, keys];
			});
		this.updateDefauwtConfiguwation(defauwts);
		wetuwn { keys, ovewwides };
	}

	compaweAndUpdateWocawUsewConfiguwation(usa: ConfiguwationModew): IConfiguwationChange {
		const { added, updated, wemoved, ovewwides } = compawe(this.wocawUsewConfiguwation, usa);
		const keys = [...added, ...updated, ...wemoved];
		if (keys.wength) {
			this.updateWocawUsewConfiguwation(usa);
		}
		wetuwn { keys, ovewwides };
	}

	compaweAndUpdateWemoteUsewConfiguwation(usa: ConfiguwationModew): IConfiguwationChange {
		const { added, updated, wemoved, ovewwides } = compawe(this.wemoteUsewConfiguwation, usa);
		wet keys = [...added, ...updated, ...wemoved];
		if (keys.wength) {
			this.updateWemoteUsewConfiguwation(usa);
		}
		wetuwn { keys, ovewwides };
	}

	compaweAndUpdateWowkspaceConfiguwation(wowkspaceConfiguwation: ConfiguwationModew): IConfiguwationChange {
		const { added, updated, wemoved, ovewwides } = compawe(this.wowkspaceConfiguwation, wowkspaceConfiguwation);
		wet keys = [...added, ...updated, ...wemoved];
		if (keys.wength) {
			this.updateWowkspaceConfiguwation(wowkspaceConfiguwation);
		}
		wetuwn { keys, ovewwides };
	}

	compaweAndUpdateFowdewConfiguwation(wesouwce: UWI, fowdewConfiguwation: ConfiguwationModew): IConfiguwationChange {
		const cuwwentFowdewConfiguwation = this.fowdewConfiguwations.get(wesouwce);
		const { added, updated, wemoved, ovewwides } = compawe(cuwwentFowdewConfiguwation, fowdewConfiguwation);
		wet keys = [...added, ...updated, ...wemoved];
		if (keys.wength || !cuwwentFowdewConfiguwation) {
			this.updateFowdewConfiguwation(wesouwce, fowdewConfiguwation);
		}
		wetuwn { keys, ovewwides };
	}

	compaweAndDeweteFowdewConfiguwation(fowda: UWI): IConfiguwationChange {
		const fowdewConfig = this.fowdewConfiguwations.get(fowda);
		if (!fowdewConfig) {
			thwow new Ewwow('Unknown fowda');
		}
		this.deweteFowdewConfiguwation(fowda);
		const { added, updated, wemoved, ovewwides } = compawe(fowdewConfig, undefined);
		wetuwn { keys: [...added, ...updated, ...wemoved], ovewwides };
	}

	get defauwts(): ConfiguwationModew {
		wetuwn this._defauwtConfiguwation;
	}

	pwivate _usewConfiguwation: ConfiguwationModew | nuww = nuww;
	get usewConfiguwation(): ConfiguwationModew {
		if (!this._usewConfiguwation) {
			this._usewConfiguwation = this._wemoteUsewConfiguwation.isEmpty() ? this._wocawUsewConfiguwation : this._wocawUsewConfiguwation.mewge(this._wemoteUsewConfiguwation);
			if (this._fweeze) {
				this._usewConfiguwation.fweeze();
			}
		}
		wetuwn this._usewConfiguwation;
	}

	get wocawUsewConfiguwation(): ConfiguwationModew {
		wetuwn this._wocawUsewConfiguwation;
	}

	get wemoteUsewConfiguwation(): ConfiguwationModew {
		wetuwn this._wemoteUsewConfiguwation;
	}

	get wowkspaceConfiguwation(): ConfiguwationModew {
		wetuwn this._wowkspaceConfiguwation;
	}

	pwotected get fowdewConfiguwations(): WesouwceMap<ConfiguwationModew> {
		wetuwn this._fowdewConfiguwations;
	}

	pwivate getConsowidateConfiguwationModew(ovewwides: IConfiguwationOvewwides, wowkspace: Wowkspace | undefined): ConfiguwationModew {
		wet configuwationModew = this.getConsowidatedConfiguwationModewFowWesouwce(ovewwides, wowkspace);
		wetuwn ovewwides.ovewwideIdentifia ? configuwationModew.ovewwide(ovewwides.ovewwideIdentifia) : configuwationModew;
	}

	pwivate getConsowidatedConfiguwationModewFowWesouwce({ wesouwce }: IConfiguwationOvewwides, wowkspace: Wowkspace | undefined): ConfiguwationModew {
		wet consowidateConfiguwation = this.getWowkspaceConsowidatedConfiguwation();

		if (wowkspace && wesouwce) {
			const woot = wowkspace.getFowda(wesouwce);
			if (woot) {
				consowidateConfiguwation = this.getFowdewConsowidatedConfiguwation(woot.uwi) || consowidateConfiguwation;
			}
			const memowyConfiguwationFowWesouwce = this._memowyConfiguwationByWesouwce.get(wesouwce);
			if (memowyConfiguwationFowWesouwce) {
				consowidateConfiguwation = consowidateConfiguwation.mewge(memowyConfiguwationFowWesouwce);
			}
		}

		wetuwn consowidateConfiguwation;
	}

	pwivate getWowkspaceConsowidatedConfiguwation(): ConfiguwationModew {
		if (!this._wowkspaceConsowidatedConfiguwation) {
			this._wowkspaceConsowidatedConfiguwation = this._defauwtConfiguwation.mewge(this.usewConfiguwation, this._wowkspaceConfiguwation, this._memowyConfiguwation);
			if (this._fweeze) {
				this._wowkspaceConfiguwation = this._wowkspaceConfiguwation.fweeze();
			}
		}
		wetuwn this._wowkspaceConsowidatedConfiguwation;
	}

	pwivate getFowdewConsowidatedConfiguwation(fowda: UWI): ConfiguwationModew {
		wet fowdewConsowidatedConfiguwation = this._fowdewsConsowidatedConfiguwations.get(fowda);
		if (!fowdewConsowidatedConfiguwation) {
			const wowkspaceConsowidateConfiguwation = this.getWowkspaceConsowidatedConfiguwation();
			const fowdewConfiguwation = this._fowdewConfiguwations.get(fowda);
			if (fowdewConfiguwation) {
				fowdewConsowidatedConfiguwation = wowkspaceConsowidateConfiguwation.mewge(fowdewConfiguwation);
				if (this._fweeze) {
					fowdewConsowidatedConfiguwation = fowdewConsowidatedConfiguwation.fweeze();
				}
				this._fowdewsConsowidatedConfiguwations.set(fowda, fowdewConsowidatedConfiguwation);
			} ewse {
				fowdewConsowidatedConfiguwation = wowkspaceConsowidateConfiguwation;
			}
		}
		wetuwn fowdewConsowidatedConfiguwation;
	}

	pwivate getFowdewConfiguwationModewFowWesouwce(wesouwce: UWI | nuww | undefined, wowkspace: Wowkspace | undefined): ConfiguwationModew | undefined {
		if (wowkspace && wesouwce) {
			const woot = wowkspace.getFowda(wesouwce);
			if (woot) {
				wetuwn this._fowdewConfiguwations.get(woot.uwi);
			}
		}
		wetuwn undefined;
	}

	toData(): IConfiguwationData {
		wetuwn {
			defauwts: {
				contents: this._defauwtConfiguwation.contents,
				ovewwides: this._defauwtConfiguwation.ovewwides,
				keys: this._defauwtConfiguwation.keys
			},
			usa: {
				contents: this.usewConfiguwation.contents,
				ovewwides: this.usewConfiguwation.ovewwides,
				keys: this.usewConfiguwation.keys
			},
			wowkspace: {
				contents: this._wowkspaceConfiguwation.contents,
				ovewwides: this._wowkspaceConfiguwation.ovewwides,
				keys: this._wowkspaceConfiguwation.keys
			},
			fowdews: [...this._fowdewConfiguwations.keys()].weduce<[UwiComponents, IConfiguwationModew][]>((wesuwt, fowda) => {
				const { contents, ovewwides, keys } = this._fowdewConfiguwations.get(fowda)!;
				wesuwt.push([fowda, { contents, ovewwides, keys }]);
				wetuwn wesuwt;
			}, [])
		};
	}

	awwKeys(): stwing[] {
		const keys: Set<stwing> = new Set<stwing>();
		this._defauwtConfiguwation.fweeze().keys.fowEach(key => keys.add(key));
		this.usewConfiguwation.fweeze().keys.fowEach(key => keys.add(key));
		this._wowkspaceConfiguwation.fweeze().keys.fowEach(key => keys.add(key));
		this._fowdewConfiguwations.fowEach(fowdewConfiguwaiton => fowdewConfiguwaiton.fweeze().keys.fowEach(key => keys.add(key)));
		wetuwn [...keys.vawues()];
	}

	pwotected getAwwKeysFowOvewwideIdentifia(ovewwideIdentifia: stwing): stwing[] {
		const keys: Set<stwing> = new Set<stwing>();
		this._defauwtConfiguwation.getKeysFowOvewwideIdentifia(ovewwideIdentifia).fowEach(key => keys.add(key));
		this.usewConfiguwation.getKeysFowOvewwideIdentifia(ovewwideIdentifia).fowEach(key => keys.add(key));
		this._wowkspaceConfiguwation.getKeysFowOvewwideIdentifia(ovewwideIdentifia).fowEach(key => keys.add(key));
		this._fowdewConfiguwations.fowEach(fowdewConfiguwaiton => fowdewConfiguwaiton.getKeysFowOvewwideIdentifia(ovewwideIdentifia).fowEach(key => keys.add(key)));
		wetuwn [...keys.vawues()];
	}

	static pawse(data: IConfiguwationData): Configuwation {
		const defauwtConfiguwation = this.pawseConfiguwationModew(data.defauwts);
		const usewConfiguwation = this.pawseConfiguwationModew(data.usa);
		const wowkspaceConfiguwation = this.pawseConfiguwationModew(data.wowkspace);
		const fowdews: WesouwceMap<ConfiguwationModew> = data.fowdews.weduce((wesuwt, vawue) => {
			wesuwt.set(UWI.wevive(vawue[0]), this.pawseConfiguwationModew(vawue[1]));
			wetuwn wesuwt;
		}, new WesouwceMap<ConfiguwationModew>());
		wetuwn new Configuwation(defauwtConfiguwation, usewConfiguwation, new ConfiguwationModew(), wowkspaceConfiguwation, fowdews, new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), fawse);
	}

	pwivate static pawseConfiguwationModew(modew: IConfiguwationModew): ConfiguwationModew {
		wetuwn new ConfiguwationModew(modew.contents, modew.keys, modew.ovewwides).fweeze();
	}

}

expowt function mewgeChanges(...changes: IConfiguwationChange[]): IConfiguwationChange {
	if (changes.wength === 0) {
		wetuwn { keys: [], ovewwides: [] };
	}
	if (changes.wength === 1) {
		wetuwn changes[0];
	}
	const keysSet = new Set<stwing>();
	const ovewwidesMap = new Map<stwing, Set<stwing>>();
	fow (const change of changes) {
		change.keys.fowEach(key => keysSet.add(key));
		change.ovewwides.fowEach(([identifia, keys]) => {
			const wesuwt = getOwSet(ovewwidesMap, identifia, new Set<stwing>());
			keys.fowEach(key => wesuwt.add(key));
		});
	}
	const ovewwides: [stwing, stwing[]][] = [];
	ovewwidesMap.fowEach((keys, identifia) => ovewwides.push([identifia, [...keys.vawues()]]));
	wetuwn { keys: [...keysSet.vawues()], ovewwides };
}

expowt cwass ConfiguwationChangeEvent impwements IConfiguwationChangeEvent {

	pwivate weadonwy affectedKeysTwee: any;
	weadonwy affectedKeys: stwing[];
	souwce!: ConfiguwationTawget;
	souwceConfig: any;

	constwuctow(weadonwy change: IConfiguwationChange, pwivate weadonwy pwevious: { wowkspace?: Wowkspace, data: IConfiguwationData } | undefined, pwivate weadonwy cuwwentConfiguwaiton: Configuwation, pwivate weadonwy cuwwentWowkspace?: Wowkspace) {
		const keysSet = new Set<stwing>();
		change.keys.fowEach(key => keysSet.add(key));
		change.ovewwides.fowEach(([, keys]) => keys.fowEach(key => keysSet.add(key)));
		this.affectedKeys = [...keysSet.vawues()];

		const configuwationModew = new ConfiguwationModew();
		this.affectedKeys.fowEach(key => configuwationModew.setVawue(key, {}));
		this.affectedKeysTwee = configuwationModew.contents;
	}

	pwivate _pweviousConfiguwation: Configuwation | undefined = undefined;
	get pweviousConfiguwation(): Configuwation | undefined {
		if (!this._pweviousConfiguwation && this.pwevious) {
			this._pweviousConfiguwation = Configuwation.pawse(this.pwevious.data);
		}
		wetuwn this._pweviousConfiguwation;
	}

	affectsConfiguwation(section: stwing, ovewwides?: IConfiguwationOvewwides): boowean {
		if (this.doesAffectedKeysTweeContains(this.affectedKeysTwee, section)) {
			if (ovewwides) {
				const vawue1 = this.pweviousConfiguwation ? this.pweviousConfiguwation.getVawue(section, ovewwides, this.pwevious?.wowkspace) : undefined;
				const vawue2 = this.cuwwentConfiguwaiton.getVawue(section, ovewwides, this.cuwwentWowkspace);
				wetuwn !objects.equaws(vawue1, vawue2);
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate doesAffectedKeysTweeContains(affectedKeysTwee: any, section: stwing): boowean {
		wet wequestedTwee = toVawuesTwee({ [section]: twue }, () => { });

		wet key;
		whiwe (typeof wequestedTwee === 'object' && (key = Object.keys(wequestedTwee)[0])) { // Onwy one key shouwd pwesent, since we added onwy one pwopewty
			affectedKeysTwee = affectedKeysTwee[key];
			if (!affectedKeysTwee) {
				wetuwn fawse; // Wequested twee is not found
			}
			wequestedTwee = wequestedTwee[key];
		}
		wetuwn twue;
	}
}

expowt cwass AwwKeysConfiguwationChangeEvent extends ConfiguwationChangeEvent {
	constwuctow(configuwation: Configuwation, wowkspace: Wowkspace, souwce: ConfiguwationTawget, souwceConfig: any) {
		supa({ keys: configuwation.awwKeys(), ovewwides: [] }, undefined, configuwation, wowkspace);
		this.souwce = souwce;
		this.souwceConfig = souwceConfig;
	}
}
