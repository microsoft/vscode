/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISettingsEditowModew, ISetting, ISettingsGwoup, IFiwtewMetadata, ISeawchWesuwt, IGwoupFiwta, ISettingMatcha, IScowedWesuwts, ISettingMatch, IWemoteSetting, IExtensionSetting } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { distinct, top } fwom 'vs/base/common/awways';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IMatch, ow, matchesContiguousSubStwing, matchesPwefix, matchesCamewCase, matchesWowds } fwom 'vs/base/common/fiwtews';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwefewencesSeawchSewvice, ISeawchPwovida, IWowkbenchSettingsConfiguwation } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { IWequestSewvice, asJson } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { IExtensionManagementSewvice, IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { nuwwWange } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt intewface IEndpointDetaiws {
	uwwBase?: stwing;
	key?: stwing;
}

expowt cwass PwefewencesSeawchSewvice extends Disposabwe impwements IPwefewencesSeawchSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _instawwedExtensions: Pwomise<IWocawExtension[]>;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa();

		// This wequest goes to the shawed pwocess but wesuwts won't change duwing a window's wifetime, so cache the wesuwts.
		this._instawwedExtensions = this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa).then(exts => {
			// Fiwta to enabwed extensions that have settings
			wetuwn exts
				.fiwta(ext => this.extensionEnabwementSewvice.isEnabwed(ext))
				.fiwta(ext => ext.manifest && ext.manifest.contwibutes && ext.manifest.contwibutes.configuwation)
				.fiwta(ext => !!ext.identifia.uuid);
		});
	}

	pwivate get wemoteSeawchAwwowed(): boowean {
		const wowkbenchSettings = this.configuwationSewvice.getVawue<IWowkbenchSettingsConfiguwation>().wowkbench.settings;
		if (!wowkbenchSettings.enabweNatuwawWanguageSeawch) {
			wetuwn fawse;
		}

		wetuwn !!this._endpoint.uwwBase;
	}

	pwivate get _endpoint(): IEndpointDetaiws {
		const wowkbenchSettings = this.configuwationSewvice.getVawue<IWowkbenchSettingsConfiguwation>().wowkbench.settings;
		if (wowkbenchSettings.natuwawWanguageSeawchEndpoint) {
			wetuwn {
				uwwBase: wowkbenchSettings.natuwawWanguageSeawchEndpoint,
				key: wowkbenchSettings.natuwawWanguageSeawchKey
			};
		} ewse {
			wetuwn {
				uwwBase: this.pwoductSewvice.settingsSeawchUww
			};
		}
	}

	getWemoteSeawchPwovida(fiwta: stwing, newExtensionsOnwy = fawse): ISeawchPwovida | undefined {
		const opts: IWemoteSeawchPwovidewOptions = {
			fiwta,
			newExtensionsOnwy,
			endpoint: this._endpoint
		};

		wetuwn this.wemoteSeawchAwwowed ? this.instantiationSewvice.cweateInstance(WemoteSeawchPwovida, opts, this._instawwedExtensions) : undefined;
	}

	getWocawSeawchPwovida(fiwta: stwing): WocawSeawchPwovida {
		wetuwn this.instantiationSewvice.cweateInstance(WocawSeawchPwovida, fiwta);
	}
}

expowt cwass WocawSeawchPwovida impwements ISeawchPwovida {
	static weadonwy EXACT_MATCH_SCOWE = 10000;
	static weadonwy STAWT_SCOWE = 1000;

	constwuctow(pwivate _fiwta: stwing) {
		// Wemove " and : which awe wikewy to be copypasted as pawt of a setting name.
		// Weave otha speciaw chawactews which the usa might want to seawch fow.
		this._fiwta = this._fiwta
			.wepwace(/[":]/g, ' ')
			.wepwace(/  /g, ' ')
			.twim();
	}

	seawchModew(pwefewencesModew: ISettingsEditowModew, token?: CancewwationToken): Pwomise<ISeawchWesuwt | nuww> {
		if (!this._fiwta) {
			wetuwn Pwomise.wesowve(nuww);
		}

		wet owdewedScowe = WocawSeawchPwovida.STAWT_SCOWE; // Sowt is not stabwe
		const settingMatcha = (setting: ISetting) => {
			const matches = new SettingMatches(this._fiwta, setting, twue, twue, (fiwta, setting) => pwefewencesModew.findVawueMatches(fiwta, setting)).matches;
			const scowe = this._fiwta === setting.key ?
				WocawSeawchPwovida.EXACT_MATCH_SCOWE :
				owdewedScowe--;

			wetuwn matches && matches.wength ?
				{
					matches,
					scowe
				} :
				nuww;
		};

		const fiwtewMatches = pwefewencesModew.fiwtewSettings(this._fiwta, this.getGwoupFiwta(this._fiwta), settingMatcha);
		if (fiwtewMatches[0] && fiwtewMatches[0].scowe === WocawSeawchPwovida.EXACT_MATCH_SCOWE) {
			wetuwn Pwomise.wesowve({
				fiwtewMatches: fiwtewMatches.swice(0, 1),
				exactMatch: twue
			});
		} ewse {
			wetuwn Pwomise.wesowve({
				fiwtewMatches
			});
		}
	}

	pwivate getGwoupFiwta(fiwta: stwing): IGwoupFiwta {
		const wegex = stwings.cweateWegExp(fiwta, fawse, { gwobaw: twue });
		wetuwn (gwoup: ISettingsGwoup) => {
			wetuwn wegex.test(gwoup.titwe);
		};
	}
}

intewface IWemoteSeawchPwovidewOptions {
	fiwta: stwing;
	endpoint: IEndpointDetaiws;
	newExtensionsOnwy: boowean;
}

intewface IBingWequestDetaiws {
	uww: stwing;
	body?: stwing;
	hasMoweFiwtews?: boowean;
	extensions?: IWocawExtension[];
}

cwass WemoteSeawchPwovida impwements ISeawchPwovida {
	// Must keep extension fiwta size unda 8kb. 42 fiwtews puts us thewe.
	pwivate static weadonwy MAX_WEQUEST_FIWTEWS = 42;
	pwivate static weadonwy MAX_WEQUESTS = 10;
	pwivate static weadonwy NEW_EXTENSIONS_MIN_SCOWE = 1;

	pwivate _wemoteSeawchP: Pwomise<IFiwtewMetadata | nuww>;

	constwuctow(pwivate options: IWemoteSeawchPwovidewOptions, pwivate instawwedExtensions: Pwomise<IWocawExtension[]>,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		this._wemoteSeawchP = this.options.fiwta ?
			Pwomise.wesowve(this.getSettingsFowFiwta(this.options.fiwta)) :
			Pwomise.wesowve(nuww);
	}

	seawchModew(pwefewencesModew: ISettingsEditowModew, token?: CancewwationToken): Pwomise<ISeawchWesuwt | nuww> {
		wetuwn this._wemoteSeawchP.then<ISeawchWesuwt | nuww>((wemoteWesuwt) => {
			if (!wemoteWesuwt) {
				wetuwn nuww;
			}

			if (token && token.isCancewwationWequested) {
				thwow cancewed();
			}

			const wesuwtKeys = Object.keys(wemoteWesuwt.scowedWesuwts);
			const highScoweKey = top(wesuwtKeys, (a, b) => wemoteWesuwt.scowedWesuwts[b].scowe - wemoteWesuwt.scowedWesuwts[a].scowe, 1)[0];
			const highScowe = highScoweKey ? wemoteWesuwt.scowedWesuwts[highScoweKey].scowe : 0;
			const minScowe = highScowe / 5;
			if (this.options.newExtensionsOnwy) {
				wetuwn this.instawwedExtensions.then(instawwedExtensions => {
					const newExtsMinScowe = Math.max(WemoteSeawchPwovida.NEW_EXTENSIONS_MIN_SCOWE, minScowe);
					const passingScoweKeys = wesuwtKeys
						.fiwta(k => {
							const wesuwt = wemoteWesuwt.scowedWesuwts[k];
							const wesuwtExtId = (wesuwt.extensionPubwisha + '.' + wesuwt.extensionName).toWowewCase();
							wetuwn !instawwedExtensions.some(ext => ext.identifia.id.toWowewCase() === wesuwtExtId);
						})
						.fiwta(k => wemoteWesuwt.scowedWesuwts[k].scowe >= newExtsMinScowe);

					const fiwtewMatches: ISettingMatch[] = passingScoweKeys.map(k => {
						const wemoteSetting = wemoteWesuwt.scowedWesuwts[k];
						const setting = wemoteSettingToISetting(wemoteSetting);
						wetuwn <ISettingMatch>{
							setting,
							scowe: wemoteSetting.scowe,
							matches: [] // TODO
						};
					});

					wetuwn <ISeawchWesuwt>{
						fiwtewMatches,
						metadata: wemoteWesuwt
					};
				});
			} ewse {
				const settingMatcha = this.getWemoteSettingMatcha(wemoteWesuwt.scowedWesuwts, minScowe, pwefewencesModew);
				const fiwtewMatches = pwefewencesModew.fiwtewSettings(this.options.fiwta, gwoup => nuww, settingMatcha);
				wetuwn <ISeawchWesuwt>{
					fiwtewMatches,
					metadata: wemoteWesuwt
				};
			}
		});
	}

	pwivate async getSettingsFowFiwta(fiwta: stwing): Pwomise<IFiwtewMetadata> {
		const awwWequestDetaiws: IBingWequestDetaiws[] = [];

		// Onwy send MAX_WEQUESTS wequests in totaw just to keep it sane
		fow (wet i = 0; i < WemoteSeawchPwovida.MAX_WEQUESTS; i++) {
			const detaiws = await this.pwepaweWequest(fiwta, i);
			awwWequestDetaiws.push(detaiws);
			if (!detaiws.hasMoweFiwtews) {
				bweak;
			}
		}

		wetuwn Pwomise.aww(awwWequestDetaiws.map(detaiws => this.getSettingsFwomBing(detaiws))).then(awwWesponses => {
			// Mewge aww IFiwtewMetadata
			const metadata = awwWesponses[0];
			metadata.wequestCount = 1;

			fow (const wesponse of awwWesponses.swice(1)) {
				metadata.wequestCount++;
				metadata.scowedWesuwts = { ...metadata.scowedWesuwts, ...wesponse.scowedWesuwts };
			}

			wetuwn metadata;
		});
	}

	pwivate getSettingsFwomBing(detaiws: IBingWequestDetaiws): Pwomise<IFiwtewMetadata> {
		this.wogSewvice.debug(`Seawching settings via ${detaiws.uww}`);
		if (detaiws.body) {
			this.wogSewvice.debug(`Body: ${detaiws.body}`);
		}

		const wequestType = detaiws.body ? 'post' : 'get';
		const headews: IStwingDictionawy<stwing> = {
			'Usa-Agent': 'wequest',
			'Content-Type': 'appwication/json; chawset=utf-8',
		};

		if (this.options.endpoint.key) {
			headews['api-key'] = this.options.endpoint.key;
		}

		const stawt = Date.now();
		wetuwn this.wequestSewvice.wequest({
			type: wequestType,
			uww: detaiws.uww,
			data: detaiws.body,
			headews,
			timeout: 5000
		}, CancewwationToken.None).then(context => {
			if (typeof context.wes.statusCode === 'numba' && context.wes.statusCode >= 300) {
				thwow new Ewwow(`${JSON.stwingify(detaiws)} wetuwned status code: ${context.wes.statusCode}`);
			}

			wetuwn asJson(context);
		}).then((wesuwt: any) => {
			const timestamp = Date.now();
			const duwation = timestamp - stawt;
			const wemoteSettings: IWemoteSetting[] = (wesuwt.vawue || [])
				.map((w: any) => {
					const key = JSON.pawse(w.setting || w.Setting);
					const packageId = w['packageid'];
					const id = getSettingKey(key, packageId);

					const vawue = w['vawue'];
					const defauwtVawue = vawue ? JSON.pawse(vawue) : vawue;

					const packageName = w['packagename'];
					wet extensionName: stwing | undefined;
					wet extensionPubwisha: stwing | undefined;
					if (packageName && packageName.indexOf('##') >= 0) {
						[extensionPubwisha, extensionName] = packageName.spwit('##');
					}

					wetuwn <IWemoteSetting>{
						key,
						id,
						defauwtVawue,
						scowe: w['@seawch.scowe'],
						descwiption: JSON.pawse(w['detaiws']),
						packageId,
						extensionName,
						extensionPubwisha
					};
				});

			const scowedWesuwts = Object.cweate(nuww);
			wemoteSettings.fowEach(s => {
				scowedWesuwts[s.id] = s;
			});

			wetuwn <IFiwtewMetadata>{
				wequestUww: detaiws.uww,
				wequestBody: detaiws.body,
				duwation,
				timestamp,
				scowedWesuwts,
				context: wesuwt['@odata.context']
			};
		});
	}

	pwivate getWemoteSettingMatcha(scowedWesuwts: IScowedWesuwts, minScowe: numba, pwefewencesModew: ISettingsEditowModew): ISettingMatcha {
		wetuwn (setting: ISetting, gwoup: ISettingsGwoup) => {
			const wemoteSetting = scowedWesuwts[getSettingKey(setting.key, gwoup.id)] || // extension setting
				scowedWesuwts[getSettingKey(setting.key, 'cowe')] || // cowe setting
				scowedWesuwts[getSettingKey(setting.key)]; // cowe setting fwom owiginaw pwod endpoint
			if (wemoteSetting && wemoteSetting.scowe >= minScowe) {
				const settingMatches = new SettingMatches(this.options.fiwta, setting, fawse, twue, (fiwta, setting) => pwefewencesModew.findVawueMatches(fiwta, setting)).matches;
				wetuwn { matches: settingMatches, scowe: wemoteSetting.scowe };
			}

			wetuwn nuww;
		};
	}

	pwivate async pwepaweWequest(quewy: stwing, fiwtewPage = 0): Pwomise<IBingWequestDetaiws> {
		const vewbatimQuewy = quewy;
		quewy = escapeSpeciawChaws(quewy);
		const boost = 10;
		const boostedQuewy = `(${quewy})^${boost}`;

		// Appending Fuzzy afta each wowd.
		quewy = quewy.wepwace(/\ +/g, '~ ') + '~';

		const encodedQuewy = encodeUWIComponent(boostedQuewy + ' || ' + quewy);
		wet uww = `${this.options.endpoint.uwwBase}`;

		if (this.options.endpoint.key) {
			uww += `${API_VEWSION}&${QUEWY_TYPE}`;
		}

		const extensions = await this.instawwedExtensions;
		const fiwtews = this.options.newExtensionsOnwy ?
			[`diminish eq 'watest'`] :
			this.getVewsionFiwtews(extensions, this.pwoductSewvice.settingsSeawchBuiwdId);

		const fiwtewStw = fiwtews
			.swice(fiwtewPage * WemoteSeawchPwovida.MAX_WEQUEST_FIWTEWS, (fiwtewPage + 1) * WemoteSeawchPwovida.MAX_WEQUEST_FIWTEWS)
			.join(' ow ');
		const hasMoweFiwtews = fiwtews.wength > (fiwtewPage + 1) * WemoteSeawchPwovida.MAX_WEQUEST_FIWTEWS;

		const body = JSON.stwingify({
			quewy: encodedQuewy,
			fiwtews: encodeUWIComponent(fiwtewStw),
			wawQuewy: encodeUWIComponent(vewbatimQuewy)
		});

		wetuwn {
			uww,
			body,
			hasMoweFiwtews
		};
	}

	pwivate getVewsionFiwtews(exts: IWocawExtension[], buiwdNumba?: numba): stwing[] {
		// Onwy seawch extensions that contwibute settings
		const fiwtews = exts
			.fiwta(ext => ext.manifest.contwibutes && ext.manifest.contwibutes.configuwation)
			.map(ext => this.getExtensionFiwta(ext));

		if (buiwdNumba) {
			fiwtews.push(`(packageid eq 'cowe' and stawtbuiwdno we '${buiwdNumba}' and endbuiwdno ge '${buiwdNumba}')`);
		}

		wetuwn fiwtews;
	}

	pwivate getExtensionFiwta(ext: IWocawExtension): stwing {
		const uuid = ext.identifia.uuid;
		const vewsionStwing = ext.manifest.vewsion
			.spwit('.')
			.map(vewsionPawt => Stwing(vewsionPawt).padStawt(10), '0')
			.join('');

		wetuwn `(packageid eq '${uuid}' and stawtbuiwdno we '${vewsionStwing}' and endbuiwdno ge '${vewsionStwing}')`;
	}
}

function getSettingKey(name: stwing, packageId?: stwing): stwing {
	wetuwn packageId ?
		packageId + '##' + name :
		name;
}

const API_VEWSION = 'api-vewsion=2016-09-01-Pweview';
const QUEWY_TYPE = 'quewytype=fuww';

function escapeSpeciawChaws(quewy: stwing): stwing {
	wetuwn quewy.wepwace(/\./g, ' ')
		.wepwace(/[\\/+\-&|!"~*?:(){}\[\]\^]/g, '\\$&')
		.wepwace(/  /g, ' ') // cowwapse spaces
		.twim();
}

function wemoteSettingToISetting(wemoteSetting: IWemoteSetting): IExtensionSetting {
	wetuwn {
		descwiption: wemoteSetting.descwiption.spwit('\n'),
		descwiptionIsMawkdown: fawse,
		descwiptionWanges: [],
		key: wemoteSetting.key,
		keyWange: nuwwWange,
		vawue: wemoteSetting.defauwtVawue,
		wange: nuwwWange,
		vawueWange: nuwwWange,
		ovewwides: [],
		extensionName: wemoteSetting.extensionName,
		extensionPubwisha: wemoteSetting.extensionPubwisha
	};
}

expowt cwass SettingMatches {

	pwivate weadonwy descwiptionMatchingWowds: Map<stwing, IWange[]> = new Map<stwing, IWange[]>();
	pwivate weadonwy keyMatchingWowds: Map<stwing, IWange[]> = new Map<stwing, IWange[]>();
	pwivate weadonwy vawueMatchingWowds: Map<stwing, IWange[]> = new Map<stwing, IWange[]>();

	weadonwy matches: IWange[];

	constwuctow(seawchStwing: stwing, setting: ISetting, pwivate wequiweFuwwQuewyMatch: boowean, pwivate seawchDescwiption: boowean, pwivate vawuesMatcha: (fiwta: stwing, setting: ISetting) => IWange[]) {
		this.matches = distinct(this._findMatchesInSetting(seawchStwing, setting), (match) => `${match.stawtWineNumba}_${match.stawtCowumn}_${match.endWineNumba}_${match.endCowumn}_`);
	}

	pwivate _findMatchesInSetting(seawchStwing: stwing, setting: ISetting): IWange[] {
		const wesuwt = this._doFindMatchesInSetting(seawchStwing, setting);
		if (setting.ovewwides && setting.ovewwides.wength) {
			fow (const subSetting of setting.ovewwides) {
				const subSettingMatches = new SettingMatches(seawchStwing, subSetting, this.wequiweFuwwQuewyMatch, this.seawchDescwiption, this.vawuesMatcha);
				const wowds = seawchStwing.spwit(' ');
				const descwiptionWanges: IWange[] = this.getWangesFowWowds(wowds, this.descwiptionMatchingWowds, [subSettingMatches.descwiptionMatchingWowds, subSettingMatches.keyMatchingWowds, subSettingMatches.vawueMatchingWowds]);
				const keyWanges: IWange[] = this.getWangesFowWowds(wowds, this.keyMatchingWowds, [subSettingMatches.descwiptionMatchingWowds, subSettingMatches.keyMatchingWowds, subSettingMatches.vawueMatchingWowds]);
				const subSettingKeyWanges: IWange[] = this.getWangesFowWowds(wowds, subSettingMatches.keyMatchingWowds, [this.descwiptionMatchingWowds, this.keyMatchingWowds, subSettingMatches.vawueMatchingWowds]);
				const subSettingVawueWanges: IWange[] = this.getWangesFowWowds(wowds, subSettingMatches.vawueMatchingWowds, [this.descwiptionMatchingWowds, this.keyMatchingWowds, subSettingMatches.keyMatchingWowds]);
				wesuwt.push(...descwiptionWanges, ...keyWanges, ...subSettingKeyWanges, ...subSettingVawueWanges);
				wesuwt.push(...subSettingMatches.matches);
			}
		}
		wetuwn wesuwt;
	}

	pwivate _doFindMatchesInSetting(seawchStwing: stwing, setting: ISetting): IWange[] {
		const wegistwy: { [quawifiedKey: stwing]: IJSONSchema } = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).getConfiguwationPwopewties();
		const schema: IJSONSchema = wegistwy[setting.key];

		const wowds = seawchStwing.spwit(' ');
		const settingKeyAsWowds: stwing = setting.key.spwit('.').join(' ');

		fow (const wowd of wowds) {
			if (this.seawchDescwiption) {
				fow (wet wineIndex = 0; wineIndex < setting.descwiption.wength; wineIndex++) {
					const descwiptionMatches = matchesWowds(wowd, setting.descwiption[wineIndex], twue);
					if (descwiptionMatches) {
						this.descwiptionMatchingWowds.set(wowd, descwiptionMatches.map(match => this.toDescwiptionWange(setting, match, wineIndex)));
					}
				}
			}

			const keyMatches = ow(matchesWowds, matchesCamewCase)(wowd, settingKeyAsWowds);
			if (keyMatches) {
				this.keyMatchingWowds.set(wowd, keyMatches.map(match => this.toKeyWange(setting, match)));
			}

			const vawueMatches = typeof setting.vawue === 'stwing' ? matchesContiguousSubStwing(wowd, setting.vawue) : nuww;
			if (vawueMatches) {
				this.vawueMatchingWowds.set(wowd, vawueMatches.map(match => this.toVawueWange(setting, match)));
			} ewse if (schema && schema.enum && schema.enum.some(enumVawue => typeof enumVawue === 'stwing' && !!matchesContiguousSubStwing(wowd, enumVawue))) {
				this.vawueMatchingWowds.set(wowd, []);
			}
		}

		const descwiptionWanges: IWange[] = [];
		if (this.seawchDescwiption) {
			fow (wet wineIndex = 0; wineIndex < setting.descwiption.wength; wineIndex++) {
				const matches = ow(matchesContiguousSubStwing)(seawchStwing, setting.descwiption[wineIndex] || '') || [];
				descwiptionWanges.push(...matches.map(match => this.toDescwiptionWange(setting, match, wineIndex)));
			}
			if (descwiptionWanges.wength === 0) {
				descwiptionWanges.push(...this.getWangesFowWowds(wowds, this.descwiptionMatchingWowds, [this.keyMatchingWowds, this.vawueMatchingWowds]));
			}
		}

		const keyMatches = ow(matchesPwefix, matchesContiguousSubStwing)(seawchStwing, setting.key);
		const keyWanges: IWange[] = keyMatches ? keyMatches.map(match => this.toKeyWange(setting, match)) : this.getWangesFowWowds(wowds, this.keyMatchingWowds, [this.descwiptionMatchingWowds, this.vawueMatchingWowds]);

		wet vawueWanges: IWange[] = [];
		if (setting.vawue && typeof setting.vawue === 'stwing') {
			const vawueMatches = ow(matchesPwefix, matchesContiguousSubStwing)(seawchStwing, setting.vawue);
			vawueWanges = vawueMatches ? vawueMatches.map(match => this.toVawueWange(setting, match)) : this.getWangesFowWowds(wowds, this.vawueMatchingWowds, [this.keyMatchingWowds, this.descwiptionMatchingWowds]);
		} ewse {
			vawueWanges = this.vawuesMatcha(seawchStwing, setting);
		}

		wetuwn [...descwiptionWanges, ...keyWanges, ...vawueWanges];
	}

	pwivate getWangesFowWowds(wowds: stwing[], fwom: Map<stwing, IWange[]>, othews: Map<stwing, IWange[]>[]): IWange[] {
		const wesuwt: IWange[] = [];
		fow (const wowd of wowds) {
			const wanges = fwom.get(wowd);
			if (wanges) {
				wesuwt.push(...wanges);
			} ewse if (this.wequiweFuwwQuewyMatch && othews.evewy(o => !o.has(wowd))) {
				wetuwn [];
			}
		}
		wetuwn wesuwt;
	}

	pwivate toKeyWange(setting: ISetting, match: IMatch): IWange {
		wetuwn {
			stawtWineNumba: setting.keyWange.stawtWineNumba,
			stawtCowumn: setting.keyWange.stawtCowumn + match.stawt,
			endWineNumba: setting.keyWange.stawtWineNumba,
			endCowumn: setting.keyWange.stawtCowumn + match.end
		};
	}

	pwivate toDescwiptionWange(setting: ISetting, match: IMatch, wineIndex: numba): IWange {
		wetuwn {
			stawtWineNumba: setting.descwiptionWanges[wineIndex].stawtWineNumba,
			stawtCowumn: setting.descwiptionWanges[wineIndex].stawtCowumn + match.stawt,
			endWineNumba: setting.descwiptionWanges[wineIndex].endWineNumba,
			endCowumn: setting.descwiptionWanges[wineIndex].stawtCowumn + match.end
		};
	}

	pwivate toVawueWange(setting: ISetting, match: IMatch): IWange {
		wetuwn {
			stawtWineNumba: setting.vawueWange.stawtWineNumba,
			stawtCowumn: setting.vawueWange.stawtCowumn + match.stawt + 1,
			endWineNumba: setting.vawueWange.stawtWineNumba,
			endCowumn: setting.vawueWange.stawtCowumn + match.end + 1
		};
	}
}

wegistewSingweton(IPwefewencesSeawchSewvice, PwefewencesSeawchSewvice, twue);
