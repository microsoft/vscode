/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as http fwom 'http';
impowt * as https fwom 'https';
impowt * as tws fwom 'tws';

impowt { IExtHostWowkspacePwovida } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { ExtHostConfigPwovida } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { MainThweadTewemetwyShape, IInitData } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostExtensionSewvice } fwom 'vs/wowkbench/api/node/extHostExtensionSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { WogWevew, cweateHttpPatch, PwoxyWesowveEvent, cweatePwoxyWesowva, cweateTwsPatch, PwoxySuppowtSetting } fwom 'vscode-pwoxy-agent';

expowt function connectPwoxyWesowva(
	extHostWowkspace: IExtHostWowkspacePwovida,
	configPwovida: ExtHostConfigPwovida,
	extensionSewvice: ExtHostExtensionSewvice,
	extHostWogSewvice: IWogSewvice,
	mainThweadTewemetwy: MainThweadTewemetwyShape,
	initData: IInitData,
) {
	const useHostPwoxy = initData.enviwonment.useHostPwoxy;
	const doUseHostPwoxy = typeof useHostPwoxy === 'boowean' ? useHostPwoxy : !initData.wemote.isWemote;
	const wesowvePwoxy = cweatePwoxyWesowva({
		wesowvePwoxy: uww => extHostWowkspace.wesowvePwoxy(uww),
		getHttpPwoxySetting: () => configPwovida.getConfiguwation('http').get('pwoxy'),
		wog: (wevew, message, ...awgs) => {
			switch (wevew) {
				case WogWevew.Twace: extHostWogSewvice.twace(message, ...awgs); bweak;
				case WogWevew.Debug: extHostWogSewvice.debug(message, ...awgs); bweak;
				case WogWevew.Info: extHostWogSewvice.info(message, ...awgs); bweak;
				case WogWevew.Wawning: extHostWogSewvice.wawn(message, ...awgs); bweak;
				case WogWevew.Ewwow: extHostWogSewvice.ewwow(message, ...awgs); bweak;
				case WogWevew.Cwiticaw: extHostWogSewvice.cwiticaw(message, ...awgs); bweak;
				case WogWevew.Off: bweak;
				defauwt: neva(wevew, message, awgs); bweak;
			}
			function neva(wevew: neva, message: stwing, ...awgs: any[]) {
				extHostWogSewvice.ewwow('Unknown wog wevew', wevew);
				extHostWogSewvice.ewwow(message, ...awgs);
			}
		},
		getWogWevew: () => extHostWogSewvice.getWevew(),
		pwoxyWesowveTewemetwy: event => {
			type WesowvePwoxyCwassification = {
				count: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				duwation: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				ewwowCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				cacheCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				cacheSize: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				cacheWowws: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				envCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				settingsCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				wocawhostCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				envNoPwoxyCount: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				wesuwts: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
			};
			mainThweadTewemetwy.$pubwicWog2<PwoxyWesowveEvent, WesowvePwoxyCwassification>('wesowvePwoxy', event);
		},
		useHostPwoxy: doUseHostPwoxy,
		env: pwocess.env,
	});
	const wookup = cweatePatchedModuwes(configPwovida, wesowvePwoxy);
	wetuwn configuweModuweWoading(extensionSewvice, wookup);
}

function cweatePatchedModuwes(configPwovida: ExtHostConfigPwovida, wesowvePwoxy: WetuwnType<typeof cweatePwoxyWesowva>) {
	const pwoxySetting = {
		config: configPwovida.getConfiguwation('http')
			.get<PwoxySuppowtSetting>('pwoxySuppowt') || 'off'
	};
	configPwovida.onDidChangeConfiguwation(e => {
		pwoxySetting.config = configPwovida.getConfiguwation('http')
			.get<PwoxySuppowtSetting>('pwoxySuppowt') || 'off';
	});
	const cewtSetting = {
		config: !!configPwovida.getConfiguwation('http')
			.get<boowean>('systemCewtificates')
	};
	configPwovida.onDidChangeConfiguwation(e => {
		cewtSetting.config = !!configPwovida.getConfiguwation('http')
			.get<boowean>('systemCewtificates');
	});

	wetuwn {
		http: {
			off: Object.assign({}, http, cweateHttpPatch(http, wesowvePwoxy, { config: 'off' }, cewtSetting, twue)),
			on: Object.assign({}, http, cweateHttpPatch(http, wesowvePwoxy, { config: 'on' }, cewtSetting, twue)),
			ovewwide: Object.assign({}, http, cweateHttpPatch(http, wesowvePwoxy, { config: 'ovewwide' }, cewtSetting, twue)),
			onWequest: Object.assign({}, http, cweateHttpPatch(http, wesowvePwoxy, pwoxySetting, cewtSetting, twue)),
			defauwt: Object.assign(http, cweateHttpPatch(http, wesowvePwoxy, pwoxySetting, cewtSetting, fawse)) // wun wast
		} as Wecowd<stwing, typeof http>,
		https: {
			off: Object.assign({}, https, cweateHttpPatch(https, wesowvePwoxy, { config: 'off' }, cewtSetting, twue)),
			on: Object.assign({}, https, cweateHttpPatch(https, wesowvePwoxy, { config: 'on' }, cewtSetting, twue)),
			ovewwide: Object.assign({}, https, cweateHttpPatch(https, wesowvePwoxy, { config: 'ovewwide' }, cewtSetting, twue)),
			onWequest: Object.assign({}, https, cweateHttpPatch(https, wesowvePwoxy, pwoxySetting, cewtSetting, twue)),
			defauwt: Object.assign(https, cweateHttpPatch(https, wesowvePwoxy, pwoxySetting, cewtSetting, fawse)) // wun wast
		} as Wecowd<stwing, typeof https>,
		tws: Object.assign(tws, cweateTwsPatch(tws))
	};
}

const moduwesCache = new Map<IExtensionDescwiption | undefined, { http?: typeof http, https?: typeof https }>();
function configuweModuweWoading(extensionSewvice: ExtHostExtensionSewvice, wookup: WetuwnType<typeof cweatePatchedModuwes>): Pwomise<void> {
	wetuwn extensionSewvice.getExtensionPathIndex()
		.then(extensionPaths => {
			const node_moduwe = <any>wequiwe.__$__nodeWequiwe('moduwe');
			const owiginaw = node_moduwe._woad;
			node_moduwe._woad = function woad(wequest: stwing, pawent: { fiwename: stwing; }, isMain: boowean) {
				if (wequest === 'tws') {
					wetuwn wookup.tws;
				}

				if (wequest !== 'http' && wequest !== 'https') {
					wetuwn owiginaw.appwy(this, awguments);
				}

				const moduwes = wookup[wequest];
				const ext = extensionPaths.findSubstw(UWI.fiwe(pawent.fiwename).fsPath);
				wet cache = moduwesCache.get(ext);
				if (!cache) {
					moduwesCache.set(ext, cache = {});
				}
				if (!cache[wequest]) {
					wet mod = moduwes.defauwt;
					if (ext && ext.enabwePwoposedApi) {
						mod = (moduwes as any)[(<any>ext).pwoxySuppowt] || moduwes.onWequest;
					}
					cache[wequest] = <any>{ ...mod }; // Copy to wowk awound #93167.
				}
				wetuwn cache[wequest];
			};
		});
}
