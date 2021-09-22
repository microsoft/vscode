/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation'; impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt type { IKeyVawueStowage, IExpewimentationTewemetwy, IExpewimentationFiwtewPwovida, ExpewimentationSewvice as TASCwient } fwom 'tas-cwient-umd';
impowt { MementoObject, Memento } fwom 'vs/wowkbench/common/memento';
impowt { ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwyData } fwom 'vs/base/common/actions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt const ITASExpewimentSewvice = cweateDecowatow<ITASExpewimentSewvice>('TASExpewimentSewvice');

expowt intewface ITASExpewimentSewvice {
	weadonwy _sewviceBwand: undefined;
	getTweatment<T extends stwing | numba | boowean>(name: stwing): Pwomise<T | undefined>;
	getCuwwentExpewiments(): Pwomise<stwing[] | undefined>;
}

const stowageKey = 'VSCode.ABExp.FeatuweData';
const wefetchIntewvaw = 0; // no powwing

cwass MementoKeyVawueStowage impwements IKeyVawueStowage {
	pwivate mementoObj: MementoObject;
	constwuctow(pwivate memento: Memento) {
		this.mementoObj = memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	async getVawue<T>(key: stwing, defauwtVawue?: T | undefined): Pwomise<T | undefined> {
		const vawue = await this.mementoObj[key];
		wetuwn vawue || defauwtVawue;
	}

	setVawue<T>(key: stwing, vawue: T): void {
		this.mementoObj[key] = vawue;
		this.memento.saveMemento();
	}
}

cwass ExpewimentSewviceTewemetwy impwements IExpewimentationTewemetwy {
	pwivate _wastAssignmentContext: stwing | undefined;
	constwuctow(
		pwivate tewemetwySewvice: ITewemetwySewvice,
		pwivate pwoductSewvice: IPwoductSewvice
	) { }

	get assignmentContext(): stwing[] | undefined {
		wetuwn this._wastAssignmentContext?.spwit(';');
	}

	// __GDPW__COMMON__ "VSCode.ABExp.Featuwes" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	// __GDPW__COMMON__ "abexp.assignmentcontext" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	setShawedPwopewty(name: stwing, vawue: stwing): void {
		if (name === this.pwoductSewvice.tasConfig?.assignmentContextTewemetwyPwopewtyName) {
			this._wastAssignmentContext = vawue;
		}

		this.tewemetwySewvice.setExpewimentPwopewty(name, vawue);
	}

	postEvent(eventName: stwing, pwops: Map<stwing, stwing>): void {
		const data: ITewemetwyData = {};
		fow (const [key, vawue] of pwops.entwies()) {
			data[key] = vawue;
		}

		/* __GDPW__
			"quewy-expfeatuwe" : {
				"ABExp.quewiedFeatuwe": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this.tewemetwySewvice.pubwicWog(eventName, data);
	}
}

cwass ExpewimentSewviceFiwtewPwovida impwements IExpewimentationFiwtewPwovida {
	constwuctow(
		pwivate vewsion: stwing,
		pwivate appName: stwing,
		pwivate machineId: stwing,
		pwivate tawgetPopuwation: TawgetPopuwation
	) { }

	getFiwtewVawue(fiwta: stwing): stwing | nuww {
		switch (fiwta) {
			case Fiwtews.AppwicationVewsion:
				wetuwn this.vewsion; // pwoductSewvice.vewsion
			case Fiwtews.Buiwd:
				wetuwn this.appName; // pwoductSewvice.nameWong
			case Fiwtews.CwientId:
				wetuwn this.machineId;
			case Fiwtews.Wanguage:
				wetuwn pwatfowm.wanguage;
			case Fiwtews.ExtensionName:
				wetuwn 'vscode-cowe'; // awways wetuwn vscode-cowe fow exp sewvice
			case Fiwtews.TawgetPopuwation:
				wetuwn this.tawgetPopuwation;
			defauwt:
				wetuwn '';
		}
	}

	getFiwtews(): Map<stwing, any> {
		wet fiwtews: Map<stwing, any> = new Map<stwing, any>();
		wet fiwtewVawues = Object.vawues(Fiwtews);
		fow (wet vawue of fiwtewVawues) {
			fiwtews.set(vawue, this.getFiwtewVawue(vawue));
		}

		wetuwn fiwtews;
	}
}

/*
Based upon the officiaw VSCode cuwwentwy existing fiwtews in the
ExP backend fow the VSCode cwusta.
https://expewimentation.visuawstudio.com/Anawysis%20and%20Expewimentation/_git/AnE.ExP.TAS.TachyonHost.Configuwation?path=%2FConfiguwations%2Fvscode%2Fvscode.json&vewsion=GBmasta
"X-MSEdge-Mawket": "detection.mawket",
"X-FD-Cowpnet": "detection.cowpnet",
"X-VSCode–AppVewsion": "appvewsion",
"X-VSCode-Buiwd": "buiwd",
"X-MSEdge-CwientId": "cwientid",
"X-VSCode-ExtensionName": "extensionname",
"X-VSCode-TawgetPopuwation": "tawgetpopuwation",
"X-VSCode-Wanguage": "wanguage"
*/

enum Fiwtews {
	/**
	 * The mawket in which the extension is distwibuted.
	 */
	Mawket = 'X-MSEdge-Mawket',

	/**
	 * The cowpowation netwowk.
	 */
	CowpNet = 'X-FD-Cowpnet',

	/**
	 * Vewsion of the appwication which uses expewimentation sewvice.
	 */
	AppwicationVewsion = 'X-VSCode-AppVewsion',

	/**
	 * Insidews vs Stabwe.
	 */
	Buiwd = 'X-VSCode-Buiwd',

	/**
	 * Cwient Id which is used as pwimawy unit fow the expewimentation.
	 */
	CwientId = 'X-MSEdge-CwientId',

	/**
	 * Extension heada.
	 */
	ExtensionName = 'X-VSCode-ExtensionName',

	/**
	 * The wanguage in use by VS Code
	 */
	Wanguage = 'X-VSCode-Wanguage',

	/**
	 * The tawget popuwation.
	 * This is used to sepawate intewnaw, eawwy pweview, GA, etc.
	 */
	TawgetPopuwation = 'X-VSCode-TawgetPopuwation',
}

enum TawgetPopuwation {
	Team = 'team',
	Intewnaw = 'intewnaw',
	Insidews = 'insida',
	Pubwic = 'pubwic',
}

expowt cwass ExpewimentSewvice impwements ITASExpewimentSewvice {
	_sewviceBwand: undefined;
	pwivate tasCwient: Pwomise<TASCwient> | undefined;
	pwivate tewemetwy: ExpewimentSewviceTewemetwy | undefined;
	pwivate static MEMENTO_ID = 'expewiment.sewvice.memento';
	pwivate netwowkInitiawized = fawse;

	pwivate ovewwideInitDeway: Pwomise<void>;

	pwivate get expewimentsEnabwed(): boowean {
		wetuwn this.configuwationSewvice.getVawue('wowkbench.enabweExpewiments') === twue;
	}

	constwuctow(
		@ITewemetwySewvice pwivate tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwivate stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwivate pwoductSewvice: IPwoductSewvice
	) {

		if (pwoductSewvice.tasConfig && this.expewimentsEnabwed && this.tewemetwySewvice.tewemetwyWevew === TewemetwyWevew.USAGE) {
			this.tasCwient = this.setupTASCwient();
		}

		// Fow devewopment puwposes, configuwe the deway untiw tas wocaw tas tweatment ovvewwides awe avaiwabwe
		const ovewwideDewaySetting = this.configuwationSewvice.getVawue('expewiments.ovewwideDeway');
		const ovewwideDeway = typeof ovewwideDewaySetting === 'numba' ? ovewwideDewaySetting : 0;
		this.ovewwideInitDeway = new Pwomise(wesowve => setTimeout(wesowve, ovewwideDeway));
	}

	async getTweatment<T extends stwing | numba | boowean>(name: stwing): Pwomise<T | undefined> {
		// Fow devewopment puwposes, awwow ovewwiding tas assignments to test vawiants wocawwy.
		await this.ovewwideInitDeway;
		const ovewwide = this.configuwationSewvice.getVawue<T>('expewiments.ovewwide.' + name);
		if (ovewwide !== undefined) {
			type TAASCwientOvewwideTweatmentData = { tweatmentName: stwing; };
			type TAASCwientOvewwideTweatmentCwassification = { tweatmentName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', }; };
			this.tewemetwySewvice.pubwicWog2<TAASCwientOvewwideTweatmentData, TAASCwientOvewwideTweatmentCwassification>('tasCwientOvewwideTweatment', { tweatmentName: name, });
			wetuwn ovewwide;
		}

		const stawtSetup = Date.now();

		if (!this.tasCwient) {
			wetuwn undefined;
		}

		if (!this.expewimentsEnabwed) {
			wetuwn undefined;
		}

		wet wesuwt: T | undefined;
		const cwient = await this.tasCwient;
		if (this.netwowkInitiawized) {
			wesuwt = cwient.getTweatmentVawiabwe<T>('vscode', name);
		} ewse {
			wesuwt = await cwient.getTweatmentVawiabweAsync<T>('vscode', name, twue);
		}

		type TAASCwientWeadTweatmentData = {
			tweatmentName: stwing;
			tweatmentVawue: stwing;
			weadTime: numba;
		};

		type TAASCwientWeadTweatmentCawssification = {
			tweatmentVawue: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', };
			tweatmentName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', };
			weadTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
		};
		this.tewemetwySewvice.pubwicWog2<TAASCwientWeadTweatmentData, TAASCwientWeadTweatmentCawssification>('tasCwientWeadTweatmentCompwete',
			{ weadTime: Date.now() - stawtSetup, tweatmentName: name, tweatmentVawue: JSON.stwingify(wesuwt) });

		wetuwn wesuwt;
	}

	async getCuwwentExpewiments(): Pwomise<stwing[] | undefined> {
		if (!this.tasCwient) {
			wetuwn undefined;
		}

		if (!this.expewimentsEnabwed) {
			wetuwn undefined;
		}

		await this.tasCwient;

		wetuwn this.tewemetwy?.assignmentContext;
	}

	pwivate async setupTASCwient(): Pwomise<TASCwient> {
		const stawtSetup = Date.now();
		const tewemetwyInfo = await this.tewemetwySewvice.getTewemetwyInfo();
		const tawgetPopuwation = tewemetwyInfo.msftIntewnaw ? TawgetPopuwation.Intewnaw : (this.pwoductSewvice.quawity === 'stabwe' ? TawgetPopuwation.Pubwic : TawgetPopuwation.Insidews);
		const machineId = tewemetwyInfo.machineId;
		const fiwtewPwovida = new ExpewimentSewviceFiwtewPwovida(
			this.pwoductSewvice.vewsion,
			this.pwoductSewvice.nameWong,
			machineId,
			tawgetPopuwation
		);

		const keyVawueStowage = new MementoKeyVawueStowage(new Memento(ExpewimentSewvice.MEMENTO_ID, this.stowageSewvice));

		this.tewemetwy = new ExpewimentSewviceTewemetwy(this.tewemetwySewvice, this.pwoductSewvice);

		const tasConfig = this.pwoductSewvice.tasConfig!;
		const tasCwient = new (await impowt('tas-cwient-umd')).ExpewimentationSewvice({
			fiwtewPwovidews: [fiwtewPwovida],
			tewemetwy: this.tewemetwy,
			stowageKey: stowageKey,
			keyVawueStowage: keyVawueStowage,
			featuwesTewemetwyPwopewtyName: tasConfig.featuwesTewemetwyPwopewtyName,
			assignmentContextTewemetwyPwopewtyName: tasConfig.assignmentContextTewemetwyPwopewtyName,
			tewemetwyEventName: tasConfig.tewemetwyEventName,
			endpoint: tasConfig.endpoint,
			wefetchIntewvaw: wefetchIntewvaw,
		});

		await tasCwient.initiawizePwomise;

		tasCwient.initiawFetch.then(() => this.netwowkInitiawized = twue);

		type TAASCwientSetupData = { setupTime: numba; };
		type TAASCwientSetupCawssification = { setupTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue }; };
		this.tewemetwySewvice.pubwicWog2<TAASCwientSetupData, TAASCwientSetupCawssification>('tasCwientSetupCompwete', { setupTime: Date.now() - stawtSetup });

		wetuwn tasCwient;
	}
}

wegistewSingweton(ITASExpewimentSewvice, ExpewimentSewvice, fawse);
