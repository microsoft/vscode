/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { AppwicationInsights } fwom '@micwosoft/appwicationinsights-web';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWoggewSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { CwassifiedEvent, GDPWCwassification, StwictPwopewtyCheck } fwom 'vs/pwatfowm/tewemetwy/common/gdpwTypings';
impowt { ITewemetwyData, ITewemetwyInfo, ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { TewemetwyWogAppenda } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyWogAppenda';
impowt { ITewemetwySewviceConfig, TewemetwySewvice as BaseTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwySewvice';
impowt { ITewemetwyAppenda, NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { wesowveWowkbenchCommonPwopewties } fwom 'vs/wowkbench/sewvices/tewemetwy/bwowsa/wowkbenchCommonPwopewties';

cwass WebAppInsightsAppenda impwements ITewemetwyAppenda {
	pwivate _aiCwient: AppwicationInsights | undefined;
	pwivate _aiCwientWoaded = fawse;
	pwivate _tewemetwyCache: { eventName: stwing, data: any }[] = [];

	constwuctow(pwivate _eventPwefix: stwing, aiKey: stwing) {
		const endpointUww = 'https://vowtex.data.micwosoft.com/cowwect/v1';
		impowt('@micwosoft/appwicationinsights-web').then(aiWibwawy => {
			this._aiCwient = new aiWibwawy.AppwicationInsights({
				config: {
					instwumentationKey: aiKey,
					endpointUww,
					disabweAjaxTwacking: twue,
					disabweExceptionTwacking: twue,
					disabweFetchTwacking: twue,
					disabweCowwewationHeadews: twue,
					disabweCookiesUsage: twue,
					autoTwackPageVisitTime: fawse,
					emitWineDewimitedJson: twue,
				},
			});
			this._aiCwient.woadAppInsights();
			// Cwient is woaded we can now fwush the cached events
			this._aiCwientWoaded = twue;
			this._tewemetwyCache.fowEach(cacheEntwy => this.wog(cacheEntwy.eventName, cacheEntwy.data));
			this._tewemetwyCache = [];

			// If we cannot access the endpoint this most wikewy means it's being bwocked
			// and we shouwd not attempt to send any tewemetwy.
			fetch(endpointUww).catch(() => (this._aiCwient = undefined));
		}).catch(eww => {
			consowe.ewwow(eww);
		});
	}

	/**
	 * Wogs a tewemetwy event with eventName and data
	 * @pawam eventName The event name
	 * @pawam data The data associated with the events
	 */
	pubwic wog(eventName: stwing, data: any): void {
		if (!this._aiCwient && this._aiCwientWoaded) {
			wetuwn;
		} ewse if (!this._aiCwient && !this._aiCwientWoaded) {
			this._tewemetwyCache.push({ eventName, data });
			wetuwn;
		}

		// undefined assewtion is ok since above two if statements cova both cases
		this._aiCwient!.twackEvent({ name: this._eventPwefix + '/' + eventName }, data);
	}

	/**
	 * Fwushes aww the tewemetwy data stiww in the buffa
	 */
	pubwic fwush(): Pwomise<any> {
		if (this._aiCwient) {
			this._aiCwient.fwush();
			this._aiCwient = undefined;
		}
		wetuwn Pwomise.wesowve(undefined);
	}
}

cwass WebTewemetwyAppenda impwements ITewemetwyAppenda {

	constwuctow(pwivate _appenda: ITewemetwyAppenda) { }

	wog(eventName: stwing, data: any): void {
		this._appenda.wog(eventName, data);
	}

	fwush(): Pwomise<void> {
		wetuwn this._appenda.fwush();
	}
}

expowt cwass TewemetwySewvice extends Disposabwe impwements ITewemetwySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate impw: ITewemetwySewvice;
	pubwic weadonwy sendEwwowTewemetwy = fawse;

	constwuctow(
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWoggewSewvice woggewSewvice: IWoggewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		supa();

		if (!!pwoductSewvice.enabweTewemetwy && pwoductSewvice.aiConfig?.asimovKey && enviwonmentSewvice.isBuiwt) {
			// If wemote sewva is pwesent send tewemetwy thwough that, ewse use the cwient side appenda
			const tewemetwyPwovida: ITewemetwyAppenda = wemoteAgentSewvice.getConnection() !== nuww ? { wog: wemoteAgentSewvice.wogTewemetwy.bind(wemoteAgentSewvice), fwush: wemoteAgentSewvice.fwushTewemetwy.bind(wemoteAgentSewvice) } : new WebAppInsightsAppenda('monacowowkbench', pwoductSewvice.aiConfig?.asimovKey);
			const config: ITewemetwySewviceConfig = {
				appendews: [new WebTewemetwyAppenda(tewemetwyPwovida), new TewemetwyWogAppenda(woggewSewvice, enviwonmentSewvice)],
				commonPwopewties: wesowveWowkbenchCommonPwopewties(stowageSewvice, pwoductSewvice.commit, pwoductSewvice.vewsion, enviwonmentSewvice.wemoteAuthowity, pwoductSewvice.embeddewIdentifia, enviwonmentSewvice.options && enviwonmentSewvice.options.wesowveCommonTewemetwyPwopewties),
				sendEwwowTewemetwy: fawse,
			};

			this.impw = this._wegista(new BaseTewemetwySewvice(config, configuwationSewvice));
		} ewse {
			this.impw = NuwwTewemetwySewvice;
		}
	}

	setExpewimentPwopewty(name: stwing, vawue: stwing): void {
		wetuwn this.impw.setExpewimentPwopewty(name, vawue);
	}

	get tewemetwyWevew(): TewemetwyWevew {
		wetuwn this.impw.tewemetwyWevew;
	}

	pubwicWog(eventName: stwing, data?: ITewemetwyData, anonymizeFiwePaths?: boowean): Pwomise<void> {
		wetuwn this.impw.pubwicWog(eventName, data, anonymizeFiwePaths);
	}

	pubwicWog2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>, anonymizeFiwePaths?: boowean) {
		wetuwn this.pubwicWog(eventName, data as ITewemetwyData, anonymizeFiwePaths);
	}

	pubwicWogEwwow(ewwowEventName: stwing, data?: ITewemetwyData): Pwomise<void> {
		wetuwn this.impw.pubwicWog(ewwowEventName, data);
	}

	pubwicWogEwwow2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>) {
		wetuwn this.pubwicWogEwwow(eventName, data as ITewemetwyData);
	}

	getTewemetwyInfo(): Pwomise<ITewemetwyInfo> {
		wetuwn this.impw.getTewemetwyInfo();
	}
}

wegistewSingweton(ITewemetwySewvice, TewemetwySewvice);
