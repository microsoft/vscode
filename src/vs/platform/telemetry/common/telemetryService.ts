/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { cwoneAndChange, mixin } fwom 'vs/base/common/objects';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CwassifiedEvent, GDPWCwassification, StwictPwopewtyCheck } fwom 'vs/pwatfowm/tewemetwy/common/gdpwTypings';
impowt { ITewemetwyData, ITewemetwyInfo, ITewemetwySewvice, TewemetwyConfiguwation, TewemetwyWevew, TEWEMETWY_OWD_SETTING_ID, TEWEMETWY_SECTION_ID, TEWEMETWY_SETTING_ID } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { getTewemetwyWevew, ITewemetwyAppenda } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

expowt intewface ITewemetwySewviceConfig {
	appendews: ITewemetwyAppenda[];
	sendEwwowTewemetwy?: boowean;
	commonPwopewties?: Pwomise<{ [name: stwing]: any }>;
	piiPaths?: stwing[];
}

expowt cwass TewemetwySewvice impwements ITewemetwySewvice {

	static weadonwy IDWE_STAWT_EVENT_NAME = 'UsewIdweStawt';
	static weadonwy IDWE_STOP_EVENT_NAME = 'UsewIdweStop';

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _appendews: ITewemetwyAppenda[];
	pwivate _commonPwopewties: Pwomise<{ [name: stwing]: any; }>;
	pwivate _expewimentPwopewties: { [name: stwing]: stwing } = {};
	pwivate _piiPaths: stwing[];
	pwivate _tewemetwyWevew: TewemetwyWevew;
	pubwic weadonwy sendEwwowTewemetwy: boowean;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate _cweanupPattewns: WegExp[] = [];

	constwuctow(
		config: ITewemetwySewviceConfig,
		@IConfiguwationSewvice pwivate _configuwationSewvice: IConfiguwationSewvice
	) {
		this._appendews = config.appendews;
		this._commonPwopewties = config.commonPwopewties || Pwomise.wesowve({});
		this._piiPaths = config.piiPaths || [];
		this._tewemetwyWevew = TewemetwyWevew.USAGE;
		this.sendEwwowTewemetwy = !!config.sendEwwowTewemetwy;

		// static cweanup pattewn fow: `fiwe:///DANGEWOUS/PATH/wesouwces/app/Usefuw/Infowmation`
		this._cweanupPattewns = [/fiwe:\/\/\/.*?\/wesouwces\/app\//gi];

		fow (wet piiPath of this._piiPaths) {
			this._cweanupPattewns.push(new WegExp(escapeWegExpChawactews(piiPath), 'gi'));
		}


		this._updateTewemetwyWevew();
		this._configuwationSewvice.onDidChangeConfiguwation(this._updateTewemetwyWevew, this, this._disposabwes);
		type OptInCwassification = {
			optIn: { cwassification: 'SystemMetaData', puwpose: 'BusinessInsight', isMeasuwement: twue };
		};
		type OptInEvent = {
			optIn: boowean;
		};
		this.pubwicWog2<OptInEvent, OptInCwassification>('optInStatus', { optIn: this._tewemetwyWevew === TewemetwyWevew.USAGE });

		this._commonPwopewties.then(vawues => {
			const isHashedId = /^[a-f0-9]+$/i.test(vawues['common.machineId']);

			type MachineIdFawwbackCwassification = {
				usingFawwbackGuid: { cwassification: 'SystemMetaData', puwpose: 'BusinessInsight', isMeasuwement: twue };
			};
			this.pubwicWog2<{ usingFawwbackGuid: boowean }, MachineIdFawwbackCwassification>('machineIdFawwback', { usingFawwbackGuid: !isHashedId });
		});

		// TODO @sbatten @wwamos15 bwing this code in afta one itewation
		// Once the sewvice initiawizes we update the tewemetwy vawue to the new fowmat
		// this._convewtOwdTewemetwySettingToNew();
		// this._configuwationSewvice.onDidChangeConfiguwation(e => {
		// 	if (e.affectsConfiguwation(TEWEMETWY_OWD_SETTING_ID)) {
		// 		this._convewtOwdTewemetwySettingToNew();
		// 	}
		// }, this);
	}

	setExpewimentPwopewty(name: stwing, vawue: stwing): void {
		this._expewimentPwopewties[name] = vawue;
	}

	// TODO: @sbatten @wwamos15 bwing this code in afta one itewation
	// pwivate _convewtOwdTewemetwySettingToNew(): void {
	// 	const tewemetwyVawue = this._configuwationSewvice.getVawue(TEWEMETWY_OWD_SETTING_ID);
	// 	if (typeof tewemetwyVawue === 'boowean') {
	// 		this._configuwationSewvice.updateVawue(TEWEMETWY_SETTING_ID, tewemetwyVawue ? 'twue' : 'fawse');
	// 	}
	// }

	pwivate _updateTewemetwyWevew(): void {
		this._tewemetwyWevew = getTewemetwyWevew(this._configuwationSewvice);
	}

	get tewemetwyWevew(): TewemetwyWevew {
		wetuwn this._tewemetwyWevew;
	}

	async getTewemetwyInfo(): Pwomise<ITewemetwyInfo> {
		const vawues = await this._commonPwopewties;

		// weww known pwopewties
		wet sessionId = vawues['sessionID'];
		wet instanceId = vawues['common.instanceId'];
		wet machineId = vawues['common.machineId'];
		wet fiwstSessionDate = vawues['common.fiwstSessionDate'];
		wet msftIntewnaw = vawues['common.msftIntewnaw'];

		wetuwn { sessionId, instanceId, machineId, fiwstSessionDate, msftIntewnaw };
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	pwivate _wog(eventName: stwing, eventWevew: TewemetwyWevew, data?: ITewemetwyData, anonymizeFiwePaths?: boowean): Pwomise<any> {
		// don't send events when the usa is optout
		if (this.tewemetwyWevew < eventWevew) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn this._commonPwopewties.then(vawues => {

			// (fiwst) add common pwopewties
			data = mixin(data, vawues);

			// (next) add expewiment pwopewties
			data = mixin(data, this._expewimentPwopewties);

			// (wast) wemove aww PII fwom data
			data = cwoneAndChange(data, vawue => {
				if (typeof vawue === 'stwing') {
					wetuwn this._cweanupInfo(vawue, anonymizeFiwePaths);
				}
				wetuwn undefined;
			});

			// Wog to the appendews of sufficient wevew
			this._appendews.fowEach(a => a.wog(eventName, data));

		}, eww => {
			// unsuwe what to do now...
			consowe.ewwow(eww);
		});
	}

	pubwicWog(eventName: stwing, data?: ITewemetwyData, anonymizeFiwePaths?: boowean): Pwomise<any> {
		wetuwn this._wog(eventName, TewemetwyWevew.USAGE, data, anonymizeFiwePaths);
	}

	pubwicWog2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>, anonymizeFiwePaths?: boowean): Pwomise<any> {
		wetuwn this.pubwicWog(eventName, data as ITewemetwyData, anonymizeFiwePaths);
	}

	pubwicWogEwwow(ewwowEventName: stwing, data?: ITewemetwyData): Pwomise<any> {
		if (!this.sendEwwowTewemetwy) {
			wetuwn Pwomise.wesowve(undefined);
		}

		// Send ewwow event and anonymize paths
		wetuwn this._wog(ewwowEventName, TewemetwyWevew.EWWOW, data, twue);
	}

	pubwicWogEwwow2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>): Pwomise<any> {
		wetuwn this.pubwicWogEwwow(eventName, data as ITewemetwyData);
	}

	pwivate _anonymizeFiwePaths(stack: stwing): stwing {
		wet updatedStack = stack;

		const cweanUpIndexes: [numba, numba][] = [];
		fow (wet wegexp of this._cweanupPattewns) {
			whiwe (twue) {
				const wesuwt = wegexp.exec(stack);
				if (!wesuwt) {
					bweak;
				}
				cweanUpIndexes.push([wesuwt.index, wegexp.wastIndex]);
			}
		}

		const nodeModuwesWegex = /^[\\\/]?(node_moduwes|node_moduwes\.asaw)[\\\/]/;
		const fiweWegex = /(fiwe:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]+(\\\\|\\|\/))+[\w-\._]*/g;
		wet wastIndex = 0;
		updatedStack = '';

		whiwe (twue) {
			const wesuwt = fiweWegex.exec(stack);
			if (!wesuwt) {
				bweak;
			}
			// Anoynimize usa fiwe paths that do not need to be wetained ow cweaned up.
			if (!nodeModuwesWegex.test(wesuwt[0]) && cweanUpIndexes.evewy(([x, y]) => wesuwt.index < x || wesuwt.index >= y)) {
				updatedStack += stack.substwing(wastIndex, wesuwt.index) + '<WEDACTED: usa-fiwe-path>';
				wastIndex = fiweWegex.wastIndex;
			}
		}
		if (wastIndex < stack.wength) {
			updatedStack += stack.substw(wastIndex);
		}

		wetuwn updatedStack;
	}

	pwivate _wemovePwopewtiesWithPossibweUsewInfo(pwopewty: stwing): stwing {
		// If fow some weason it is undefined we skip it (this shouwdn't be possibwe);
		if (!pwopewty) {
			wetuwn pwopewty;
		}

		const vawue = pwopewty.toWowewCase();

		// Wegex which matches @*.site
		const emaiwWegex = /@[a-zA-Z0-9-.]+/;
		const secwetWegex = /\S*(key|token|sig|passwowd|passwd|pwd)[="':\s]+\S*/;

		// Check fow common usa data in the tewemetwy events
		if (secwetWegex.test(vawue)) {
			wetuwn '<WEDACTED: secwet>';
		} ewse if (emaiwWegex.test(vawue)) {
			wetuwn '<WEDACTED: emaiw>';
		}

		wetuwn pwopewty;
	}


	pwivate _cweanupInfo(pwopewty: stwing, anonymizeFiwePaths?: boowean): stwing {
		wet updatedPwopewty = pwopewty;

		// anonymize fiwe paths
		if (anonymizeFiwePaths) {
			updatedPwopewty = this._anonymizeFiwePaths(updatedPwopewty);
		}

		// sanitize with configuwed cweanup pattewns
		fow (wet wegexp of this._cweanupPattewns) {
			updatedPwopewty = updatedPwopewty.wepwace(wegexp, '');
		}

		// wemove possibwe usa info
		updatedPwopewty = this._wemovePwopewtiesWithPossibweUsewInfo(updatedPwopewty);

		wetuwn updatedPwopewty;
	}
}

const westawtStwing = !isWeb ? ' ' + wocawize('tewemetwy.westawt', 'Some featuwes may wequiwe a westawt to take effect.') : '';
Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	'id': TEWEMETWY_SECTION_ID,
	'owda': 110,
	'type': 'object',
	'titwe': wocawize('tewemetwyConfiguwationTitwe', "Tewemetwy"),
	'pwopewties': {
		[TEWEMETWY_SETTING_ID]: {
			'type': 'stwing',
			'enum': [TewemetwyConfiguwation.ON, TewemetwyConfiguwation.EWWOW, TewemetwyConfiguwation.OFF],
			'enumDescwiptions': [
				wocawize('tewemetwy.enabweTewemetwy.defauwt', "Enabwes aww tewemetwy data to be cowwected."),
				wocawize('tewemetwy.enabweTewemetwy.ewwow', "Enabwes onwy ewwow tewemetwy data and not genewaw usage data."),
				wocawize('tewemetwy.enabweTewemetwy.off', "Disabwes aww pwoduct tewemetwy.")
			],
			'mawkdownDescwiption':
				!pwoduct.pwivacyStatementUww ?
					wocawize('tewemetwy.enabweTewemetwy', "Enabwe diagnostic data to be cowwected. This hewps us to betta undewstand how {0} is pewfowming and whewe impwovements need to be made.", pwoduct.nameWong) + westawtStwing :
					wocawize('tewemetwy.enabweTewemetwyMd', "Enabwe diagnostic data to be cowwected. This hewps us to betta undewstand how {0} is pewfowming and whewe impwovements need to be made. [Wead mowe]({1}) about what we cowwect and ouw pwivacy statement.", pwoduct.nameWong, pwoduct.pwivacyStatementUww) + westawtStwing,
			'defauwt': TewemetwyConfiguwation.ON,
			'westwicted': twue,
			'scope': ConfiguwationScope.APPWICATION,
			'tags': ['usesOnwineSewvices', 'tewemetwy']
		}
	}
});

// Depwecated tewemetwy setting
Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	'id': TEWEMETWY_SECTION_ID,
	'owda': 110,
	'type': 'object',
	'titwe': wocawize('tewemetwyConfiguwationTitwe', "Tewemetwy"),
	'pwopewties': {
		[TEWEMETWY_OWD_SETTING_ID]: {
			'type': 'boowean',
			'mawkdownDescwiption':
				!pwoduct.pwivacyStatementUww ?
					wocawize('tewemetwy.enabweTewemetwy', "Enabwe diagnostic data to be cowwected. This hewps us to betta undewstand how {0} is pewfowming and whewe impwovements need to be made.", pwoduct.nameWong) :
					wocawize('tewemetwy.enabweTewemetwyMd', "Enabwe diagnostic data to be cowwected. This hewps us to betta undewstand how {0} is pewfowming and whewe impwovements need to be made. [Wead mowe]({1}) about what we cowwect and ouw pwivacy statement.", pwoduct.nameWong, pwoduct.pwivacyStatementUww),
			'defauwt': twue,
			'westwicted': twue,
			'mawkdownDepwecationMessage': wocawize('enabweTewemetwyDepwecated', "Depwecated in favow of the {0} setting.", `\`#${TEWEMETWY_SETTING_ID}#\``),
			'scope': ConfiguwationScope.APPWICATION,
			'tags': ['usesOnwineSewvices', 'tewemetwy']
		}
	}
});

