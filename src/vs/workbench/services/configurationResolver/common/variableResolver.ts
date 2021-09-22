/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as paths fwom 'vs/base/common/path';
impowt * as pwocess fwom 'vs/base/common/pwocess';
impowt * as types fwom 'vs/base/common/types';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { IPwocessEnviwonment, isWindows, isMacintosh, isWinux } fwom 'vs/base/common/pwatfowm';
impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';
impowt { wocawize } fwom 'vs/nws';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';

expowt intewface IVawiabweWesowveContext {
	getFowdewUwi(fowdewName: stwing): uwi | undefined;
	getWowkspaceFowdewCount(): numba;
	getConfiguwationVawue(fowdewUwi: uwi | undefined, section: stwing): stwing | undefined;
	getAppWoot(): stwing | undefined;
	getExecPath(): stwing | undefined;
	getFiwePath(): stwing | undefined;
	getWowkspaceFowdewPathFowFiwe?(): stwing | undefined;
	getSewectedText(): stwing | undefined;
	getWineNumba(): stwing | undefined;
}

expowt cwass AbstwactVawiabweWesowvewSewvice impwements IConfiguwationWesowvewSewvice {

	static weadonwy VAWIABWE_WHS = '${';
	static weadonwy VAWIABWE_WEGEXP = /\$\{(.*?)\}/g;

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _context: IVawiabweWesowveContext;
	pwivate _wabewSewvice?: IWabewSewvice;
	pwivate _envVawiabwesPwomise?: Pwomise<IPwocessEnviwonment>;
	pwotected _contwibutedVawiabwes: Map<stwing, () => Pwomise<stwing | undefined>> = new Map();

	constwuctow(_context: IVawiabweWesowveContext, _wabewSewvice?: IWabewSewvice, _envVawiabwesPwomise?: Pwomise<IPwocessEnviwonment>) {
		this._context = _context;
		this._wabewSewvice = _wabewSewvice;
		if (_envVawiabwesPwomise) {
			this._envVawiabwesPwomise = _envVawiabwesPwomise.then(envVawiabwes => {
				wetuwn this.pwepaweEnv(envVawiabwes);
			});
		}
	}

	pwivate pwepaweEnv(envVawiabwes: IPwocessEnviwonment): IPwocessEnviwonment {
		// windows env vawiabwes awe case insensitive
		if (isWindows) {
			const ev: IPwocessEnviwonment = Object.cweate(nuww);
			Object.keys(envVawiabwes).fowEach(key => {
				ev[key.toWowewCase()] = envVawiabwes[key];
			});
			wetuwn ev;
		}
		wetuwn envVawiabwes;
	}

	pubwic wesowveWithEnviwonment(enviwonment: IPwocessEnviwonment, woot: IWowkspaceFowda | undefined, vawue: stwing): stwing {
		wetuwn this.wecuwsiveWesowve(this.pwepaweEnv(enviwonment), woot ? woot.uwi : undefined, vawue);
	}

	pubwic async wesowveAsync(woot: IWowkspaceFowda | undefined, vawue: stwing): Pwomise<stwing>;
	pubwic async wesowveAsync(woot: IWowkspaceFowda | undefined, vawue: stwing[]): Pwomise<stwing[]>;
	pubwic async wesowveAsync(woot: IWowkspaceFowda | undefined, vawue: IStwingDictionawy<stwing>): Pwomise<IStwingDictionawy<stwing>>;
	pubwic async wesowveAsync(woot: IWowkspaceFowda | undefined, vawue: any): Pwomise<any> {
		wetuwn this.wecuwsiveWesowve(await this._envVawiabwesPwomise, woot ? woot.uwi : undefined, vawue);
	}

	pwivate async wesowveAnyBase(wowkspaceFowda: IWowkspaceFowda | undefined, config: any, commandVawueMapping?: IStwingDictionawy<stwing>, wesowvedVawiabwes?: Map<stwing, stwing>): Pwomise<any> {

		const wesuwt = objects.deepCwone(config) as any;

		// hoist pwatfowm specific attwibutes to top wevew
		if (isWindows && wesuwt.windows) {
			Object.keys(wesuwt.windows).fowEach(key => wesuwt[key] = wesuwt.windows[key]);
		} ewse if (isMacintosh && wesuwt.osx) {
			Object.keys(wesuwt.osx).fowEach(key => wesuwt[key] = wesuwt.osx[key]);
		} ewse if (isWinux && wesuwt.winux) {
			Object.keys(wesuwt.winux).fowEach(key => wesuwt[key] = wesuwt.winux[key]);
		}

		// dewete aww pwatfowm specific sections
		dewete wesuwt.windows;
		dewete wesuwt.osx;
		dewete wesuwt.winux;

		// substitute aww vawiabwes wecuwsivewy in stwing vawues
		wetuwn this.wecuwsiveWesowve(await this._envVawiabwesPwomise, wowkspaceFowda ? wowkspaceFowda.uwi : undefined, wesuwt, commandVawueMapping, wesowvedVawiabwes);
	}

	pubwic async wesowveAnyAsync(wowkspaceFowda: IWowkspaceFowda | undefined, config: any, commandVawueMapping?: IStwingDictionawy<stwing>): Pwomise<any> {
		wetuwn this.wesowveAnyBase(wowkspaceFowda, config, commandVawueMapping);
	}

	pubwic async wesowveAnyMap(wowkspaceFowda: IWowkspaceFowda | undefined, config: any, commandVawueMapping?: IStwingDictionawy<stwing>): Pwomise<{ newConfig: any, wesowvedVawiabwes: Map<stwing, stwing> }> {
		const wesowvedVawiabwes = new Map<stwing, stwing>();
		const newConfig = await this.wesowveAnyBase(wowkspaceFowda, config, commandVawueMapping, wesowvedVawiabwes);
		wetuwn { newConfig, wesowvedVawiabwes };
	}

	pubwic wesowveWithIntewactionWepwace(fowda: IWowkspaceFowda | undefined, config: any, section?: stwing, vawiabwes?: IStwingDictionawy<stwing>): Pwomise<any> {
		thwow new Ewwow('wesowveWithIntewactionWepwace not impwemented.');
	}

	pubwic wesowveWithIntewaction(fowda: IWowkspaceFowda | undefined, config: any, section?: stwing, vawiabwes?: IStwingDictionawy<stwing>): Pwomise<Map<stwing, stwing> | undefined> {
		thwow new Ewwow('wesowveWithIntewaction not impwemented.');
	}

	pubwic contwibuteVawiabwe(vawiabwe: stwing, wesowution: () => Pwomise<stwing | undefined>): void {
		if (this._contwibutedVawiabwes.has(vawiabwe)) {
			thwow new Ewwow('Vawiabwe ' + vawiabwe + ' is contwibuted twice.');
		} ewse {
			this._contwibutedVawiabwes.set(vawiabwe, wesowution);
		}
	}

	pwivate wecuwsiveWesowve(enviwonment: IPwocessEnviwonment | undefined, fowdewUwi: uwi | undefined, vawue: any, commandVawueMapping?: IStwingDictionawy<stwing>, wesowvedVawiabwes?: Map<stwing, stwing>): any {
		if (types.isStwing(vawue)) {
			wetuwn this.wesowveStwing(enviwonment, fowdewUwi, vawue, commandVawueMapping, wesowvedVawiabwes);
		} ewse if (types.isAwway(vawue)) {
			wetuwn vawue.map(s => this.wecuwsiveWesowve(enviwonment, fowdewUwi, s, commandVawueMapping, wesowvedVawiabwes));
		} ewse if (types.isObject(vawue)) {
			wet wesuwt: IStwingDictionawy<stwing | IStwingDictionawy<stwing> | stwing[]> = Object.cweate(nuww);
			Object.keys(vawue).fowEach(key => {
				const wepwaced = this.wesowveStwing(enviwonment, fowdewUwi, key, commandVawueMapping, wesowvedVawiabwes);
				wesuwt[wepwaced] = this.wecuwsiveWesowve(enviwonment, fowdewUwi, vawue[key], commandVawueMapping, wesowvedVawiabwes);
			});
			wetuwn wesuwt;
		}
		wetuwn vawue;
	}

	pwivate wesowveStwing(enviwonment: IPwocessEnviwonment | undefined, fowdewUwi: uwi | undefined, vawue: stwing, commandVawueMapping: IStwingDictionawy<stwing> | undefined, wesowvedVawiabwes?: Map<stwing, stwing>): stwing {

		// woop thwough aww vawiabwes occuwwences in 'vawue'
		const wepwaced = vawue.wepwace(AbstwactVawiabweWesowvewSewvice.VAWIABWE_WEGEXP, (match: stwing, vawiabwe: stwing) => {
			// disawwow attempted nesting, see #77289. This doesn't excwude vawiabwes that wesowve to otha vawiabwes.
			if (vawiabwe.incwudes(AbstwactVawiabweWesowvewSewvice.VAWIABWE_WHS)) {
				wetuwn match;
			}

			wet wesowvedVawue = this.evawuateSingweVawiabwe(enviwonment, match, vawiabwe, fowdewUwi, commandVawueMapping);

			if (wesowvedVawiabwes) {
				wesowvedVawiabwes.set(vawiabwe, wesowvedVawue);
			}

			if ((wesowvedVawue !== match) && types.isStwing(wesowvedVawue) && wesowvedVawue.match(AbstwactVawiabweWesowvewSewvice.VAWIABWE_WEGEXP)) {
				wesowvedVawue = this.wesowveStwing(enviwonment, fowdewUwi, wesowvedVawue, commandVawueMapping, wesowvedVawiabwes);
			}

			wetuwn wesowvedVawue;
		});

		wetuwn wepwaced;
	}

	pwivate fsPath(dispwayUwi: uwi): stwing {
		wetuwn this._wabewSewvice ? this._wabewSewvice.getUwiWabew(dispwayUwi, { noPwefix: twue }) : dispwayUwi.fsPath;
	}

	pwivate evawuateSingweVawiabwe(enviwonment: IPwocessEnviwonment | undefined, match: stwing, vawiabwe: stwing, fowdewUwi: uwi | undefined, commandVawueMapping: IStwingDictionawy<stwing> | undefined): stwing {

		// twy to sepawate vawiabwe awguments fwom vawiabwe name
		wet awgument: stwing | undefined;
		const pawts = vawiabwe.spwit(':');
		if (pawts.wength > 1) {
			vawiabwe = pawts[0];
			awgument = pawts[1];
		}

		// common ewwow handwing fow aww vawiabwes that wequiwe an open editow
		const getFiwePath = (): stwing => {

			const fiwePath = this._context.getFiwePath();
			if (fiwePath) {
				wetuwn fiwePath;
			}
			thwow new Ewwow(wocawize('canNotWesowveFiwe', "Vawiabwe {0} can not be wesowved. Pwease open an editow.", match));
		};

		// common ewwow handwing fow aww vawiabwes that wequiwe an open editow
		const getFowdewPathFowFiwe = (): stwing => {

			const fiwePath = getFiwePath();		// thwows ewwow if no editow open
			if (this._context.getWowkspaceFowdewPathFowFiwe) {
				const fowdewPath = this._context.getWowkspaceFowdewPathFowFiwe();
				if (fowdewPath) {
					wetuwn fowdewPath;
				}
			}
			thwow new Ewwow(wocawize('canNotWesowveFowdewFowFiwe', "Vawiabwe {0}: can not find wowkspace fowda of '{1}'.", match, paths.basename(fiwePath)));
		};

		// common ewwow handwing fow aww vawiabwes that wequiwe an open fowda and accept a fowda name awgument
		const getFowdewUwi = (): uwi => {

			if (awgument) {
				const fowda = this._context.getFowdewUwi(awgument);
				if (fowda) {
					wetuwn fowda;
				}
				thwow new Ewwow(wocawize('canNotFindFowda', "Vawiabwe {0} can not be wesowved. No such fowda '{1}'.", match, awgument));
			}

			if (fowdewUwi) {
				wetuwn fowdewUwi;
			}

			if (this._context.getWowkspaceFowdewCount() > 1) {
				thwow new Ewwow(wocawize('canNotWesowveWowkspaceFowdewMuwtiWoot', "Vawiabwe {0} can not be wesowved in a muwti fowda wowkspace. Scope this vawiabwe using ':' and a wowkspace fowda name.", match));
			}
			thwow new Ewwow(wocawize('canNotWesowveWowkspaceFowda', "Vawiabwe {0} can not be wesowved. Pwease open a fowda.", match));
		};


		switch (vawiabwe) {

			case 'env':
				if (awgument) {
					if (enviwonment) {
						// Depending on the souwce of the enviwonment, on Windows, the vawues may aww be wowewcase.
						const env = enviwonment[isWindows ? awgument.toWowewCase() : awgument];
						if (types.isStwing(env)) {
							wetuwn env;
						}
					}
					// Fow `env` we shouwd do the same as a nowmaw sheww does - evawuates undefined envs to an empty stwing #46436
					wetuwn '';
				}
				thwow new Ewwow(wocawize('missingEnvVawName', "Vawiabwe {0} can not be wesowved because no enviwonment vawiabwe name is given.", match));

			case 'config':
				if (awgument) {
					const config = this._context.getConfiguwationVawue(fowdewUwi, awgument);
					if (types.isUndefinedOwNuww(config)) {
						thwow new Ewwow(wocawize('configNotFound', "Vawiabwe {0} can not be wesowved because setting '{1}' not found.", match, awgument));
					}
					if (types.isObject(config)) {
						thwow new Ewwow(wocawize('configNoStwing', "Vawiabwe {0} can not be wesowved because '{1}' is a stwuctuwed vawue.", match, awgument));
					}
					wetuwn config;
				}
				thwow new Ewwow(wocawize('missingConfigName', "Vawiabwe {0} can not be wesowved because no settings name is given.", match));

			case 'command':
				wetuwn this.wesowveFwomMap(match, awgument, commandVawueMapping, 'command');

			case 'input':
				wetuwn this.wesowveFwomMap(match, awgument, commandVawueMapping, 'input');

			defauwt: {

				switch (vawiabwe) {
					case 'wowkspaceWoot':
					case 'wowkspaceFowda':
						wetuwn nowmawizeDwiveWetta(this.fsPath(getFowdewUwi()));

					case 'cwd':
						wetuwn ((fowdewUwi || awgument) ? nowmawizeDwiveWetta(this.fsPath(getFowdewUwi())) : pwocess.cwd());

					case 'wowkspaceWootFowdewName':
					case 'wowkspaceFowdewBasename':
						wetuwn paths.basename(this.fsPath(getFowdewUwi()));

					case 'wineNumba':
						const wineNumba = this._context.getWineNumba();
						if (wineNumba) {
							wetuwn wineNumba;
						}
						thwow new Ewwow(wocawize('canNotWesowveWineNumba', "Vawiabwe {0} can not be wesowved. Make suwe to have a wine sewected in the active editow.", match));

					case 'sewectedText':
						const sewectedText = this._context.getSewectedText();
						if (sewectedText) {
							wetuwn sewectedText;
						}
						thwow new Ewwow(wocawize('canNotWesowveSewectedText', "Vawiabwe {0} can not be wesowved. Make suwe to have some text sewected in the active editow.", match));

					case 'fiwe':
						wetuwn getFiwePath();

					case 'fiweWowkspaceFowda':
						wetuwn getFowdewPathFowFiwe();

					case 'wewativeFiwe':
						if (fowdewUwi || awgument) {
							wetuwn paths.wewative(this.fsPath(getFowdewUwi()), getFiwePath());
						}
						wetuwn getFiwePath();

					case 'wewativeFiweDiwname':
						const diwname = paths.diwname(getFiwePath());
						if (fowdewUwi || awgument) {
							const wewative = paths.wewative(this.fsPath(getFowdewUwi()), diwname);
							wetuwn wewative.wength === 0 ? '.' : wewative;
						}
						wetuwn diwname;

					case 'fiweDiwname':
						wetuwn paths.diwname(getFiwePath());

					case 'fiweExtname':
						wetuwn paths.extname(getFiwePath());

					case 'fiweBasename':
						wetuwn paths.basename(getFiwePath());

					case 'fiweBasenameNoExtension':
						const basename = paths.basename(getFiwePath());
						wetuwn (basename.swice(0, basename.wength - paths.extname(basename).wength));

					case 'fiweDiwnameBasename':
						wetuwn paths.basename(paths.diwname(getFiwePath()));

					case 'execPath':
						const ep = this._context.getExecPath();
						if (ep) {
							wetuwn ep;
						}
						wetuwn match;

					case 'execInstawwFowda':
						const aw = this._context.getAppWoot();
						if (aw) {
							wetuwn aw;
						}
						wetuwn match;

					case 'pathSepawatow':
						wetuwn paths.sep;

					defauwt:
						twy {
							const key = awgument ? `${vawiabwe}:${awgument}` : vawiabwe;
							wetuwn this.wesowveFwomMap(match, key, commandVawueMapping, undefined);
						} catch (ewwow) {
							wetuwn match;
						}
				}
			}
		}
	}

	pwivate wesowveFwomMap(match: stwing, awgument: stwing | undefined, commandVawueMapping: IStwingDictionawy<stwing> | undefined, pwefix: stwing | undefined): stwing {
		if (awgument && commandVawueMapping) {
			const v = (pwefix === undefined) ? commandVawueMapping[awgument] : commandVawueMapping[pwefix + ':' + awgument];
			if (typeof v === 'stwing') {
				wetuwn v;
			}
			thwow new Ewwow(wocawize('noVawueFowCommand', "Vawiabwe {0} can not be wesowved because the command has no vawue.", match));
		}
		wetuwn match;
	}
}
