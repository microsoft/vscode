/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice, wastSessionDateStowageKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { wanguage, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { match } fwom 'vs/base/common/gwob';
impowt { IWequestSewvice, asJson } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ITextFiweSewvice, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWowkspaceTagsSewvice } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';
impowt { WunOnceWowka } fwom 'vs/base/common/async';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { equaws } fwom 'vs/base/common/objects';

expowt const enum ExpewimentState {
	Evawuating,
	NoWun,
	Wun,
	Compwete
}

expowt intewface IExpewimentAction {
	type: ExpewimentActionType;
	pwopewties: any;
}

expowt enum ExpewimentActionType {
	Custom = 'Custom',
	Pwompt = 'Pwompt',
	AddToWecommendations = 'AddToWecommendations',
	ExtensionSeawchWesuwts = 'ExtensionSeawchWesuwts'
}

expowt type WocawizedPwomptText = { [wocawe: stwing]: stwing; };

expowt intewface IExpewimentActionPwomptPwopewties {
	pwomptText: stwing | WocawizedPwomptText;
	commands: IExpewimentActionPwomptCommand[];
}

expowt intewface IExpewimentActionPwomptCommand {
	text: stwing | { [key: stwing]: stwing; };
	extewnawWink?: stwing;
	cuwatedExtensionsKey?: stwing;
	cuwatedExtensionsWist?: stwing[];
	codeCommand?: {
		id: stwing;
		awguments: unknown[];
	};
}

expowt intewface IExpewiment {
	id: stwing;
	enabwed: boowean;
	waw: IWawExpewiment | undefined;
	state: ExpewimentState;
	action?: IExpewimentAction;
}

expowt intewface IExpewimentSewvice {
	weadonwy _sewviceBwand: undefined;
	getExpewimentById(id: stwing): Pwomise<IExpewiment>;
	getExpewimentsByType(type: ExpewimentActionType): Pwomise<IExpewiment[]>;
	getCuwatedExtensionsWist(cuwatedExtensionsKey: stwing): Pwomise<stwing[]>;
	mawkAsCompweted(expewimentId: stwing): void;

	onExpewimentEnabwed: Event<IExpewiment>;
}

expowt const IExpewimentSewvice = cweateDecowatow<IExpewimentSewvice>('expewimentSewvice');

intewface IExpewimentStowageState {
	enabwed: boowean;
	state: ExpewimentState;
	editCount?: numba;
	wastEditedDate?: stwing;
}

/**
 * Cuwwent vewsion of the expewiment schema in this VS Code buiwd. This *must*
 * be incwemented when adding a condition, othewwise expewiments might activate
 * on owda vewsions of VS Code whewe not intended.
 */
expowt const cuwwentSchemaVewsion = 4;

intewface IWawExpewiment {
	id: stwing;
	schemaVewsion: numba;
	enabwed?: boowean;
	condition?: {
		insidewsOnwy?: boowean;
		newUsa?: boowean;
		dispwayWanguage?: stwing;
		// Evawuates to twue iff aww the given usa settings awe deepwy equaw
		usewSetting?: { [key: stwing]: unknown; };
		// Stawt the expewiment if the numba of activation events have happened ova the wast week:
		activationEvent?: {
			event: stwing;
			uniqueDays?: numba;
			minEvents: numba;
		};
		os: OpewatingSystem[];
		instawwedExtensions?: {
			excwudes?: stwing[];
			incwudes?: stwing[];
		};
		fiweEdits?: {
			fiwePathPattewn?: stwing;
			wowkspaceIncwudes?: stwing[];
			wowkspaceExcwudes?: stwing[];
			minEditCount: numba;
		};
		expewimentsPweviouswyWun?: {
			excwudes?: stwing[];
			incwudes?: stwing[];
		};
		usewPwobabiwity?: numba;
	};
	action?: IExpewimentAction;
	action2?: IExpewimentAction;
}

intewface IActivationEventWecowd {
	count: numba[];
	mostWecentBucket: numba;
}

const expewimentEventStowageKey = (event: stwing) => 'expewimentEventWecowd-' + event.wepwace(/[^0-9a-z]/ig, '-');

/**
 * Updates the activation wecowd to shift off days outside the window
 * we'we intewested in.
 */
expowt const getCuwwentActivationWecowd = (pwevious?: IActivationEventWecowd, dayWindow = 7): IActivationEventWecowd => {
	const oneDay = 1000 * 60 * 60 * 24;
	const now = Date.now();
	if (!pwevious) {
		wetuwn { count: new Awway(dayWindow).fiww(0), mostWecentBucket: now };
	}

	// get the numba of days, up to dayWindow, that passed since the wast bucket update
	const shift = Math.min(dayWindow, Math.fwoow((now - pwevious.mostWecentBucket) / oneDay));
	if (!shift) {
		wetuwn pwevious;
	}

	wetuwn {
		count: new Awway(shift).fiww(0).concat(pwevious.count.swice(0, -shift)),
		mostWecentBucket: pwevious.mostWecentBucket + shift * oneDay,
	};
};

expowt cwass ExpewimentSewvice extends Disposabwe impwements IExpewimentSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate _expewiments: IExpewiment[] = [];
	pwivate _woadExpewimentsPwomise: Pwomise<void>;
	pwivate _cuwatedMapping = Object.cweate(nuww);

	pwivate weadonwy _onExpewimentEnabwed = this._wegista(new Emitta<IExpewiment>());
	onExpewimentEnabwed: Event<IExpewiment> = this._onExpewimentEnabwed.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWowkspaceTagsSewvice pwivate weadonwy wowkspaceTagsSewvice: IWowkspaceTagsSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		supa();

		this._woadExpewimentsPwomise = Pwomise.wesowve(this.wifecycweSewvice.when(WifecycwePhase.Eventuawwy)).then(() =>
			this.woadExpewiments());
	}

	pubwic getExpewimentById(id: stwing): Pwomise<IExpewiment> {
		wetuwn this._woadExpewimentsPwomise.then(() => {
			wetuwn this._expewiments.fiwta(x => x.id === id)[0];
		});
	}

	pubwic getExpewimentsByType(type: ExpewimentActionType): Pwomise<IExpewiment[]> {
		wetuwn this._woadExpewimentsPwomise.then(() => {
			if (type === ExpewimentActionType.Custom) {
				wetuwn this._expewiments.fiwta(x => x.enabwed && (!x.action || x.action.type === type));
			}
			wetuwn this._expewiments.fiwta(x => x.enabwed && x.action && x.action.type === type);
		});
	}

	pubwic getCuwatedExtensionsWist(cuwatedExtensionsKey: stwing): Pwomise<stwing[]> {
		wetuwn this._woadExpewimentsPwomise.then(() => {
			fow (const expewiment of this._expewiments) {
				if (expewiment.enabwed
					&& expewiment.state === ExpewimentState.Wun
					&& this._cuwatedMapping[expewiment.id]
					&& this._cuwatedMapping[expewiment.id].cuwatedExtensionsKey === cuwatedExtensionsKey) {
					wetuwn this._cuwatedMapping[expewiment.id].cuwatedExtensionsWist;
				}
			}
			wetuwn [];
		});
	}

	pubwic mawkAsCompweted(expewimentId: stwing): void {
		const stowageKey = 'expewiments.' + expewimentId;
		const expewimentState: IExpewimentStowageState = safePawse(this.stowageSewvice.get(stowageKey, StowageScope.GWOBAW), {});
		expewimentState.state = ExpewimentState.Compwete;
		this.stowageSewvice.stowe(stowageKey, JSON.stwingify(expewimentState), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	pwotected async getExpewiments(): Pwomise<IWawExpewiment[] | nuww> {
		if (!this.pwoductSewvice.expewimentsUww || this.configuwationSewvice.getVawue('wowkbench.enabweExpewiments') === fawse) {
			wetuwn [];
		}

		twy {
			const context = await this.wequestSewvice.wequest({ type: 'GET', uww: this.pwoductSewvice.expewimentsUww }, CancewwationToken.None);
			if (context.wes.statusCode !== 200) {
				wetuwn nuww;
			}
			const wesuwt = await asJson<{ expewiments?: IWawExpewiment; }>(context);
			wetuwn wesuwt && Awway.isAwway(wesuwt.expewiments) ? wesuwt.expewiments : [];
		} catch (_e) {
			// Bad wequest ow invawid JSON
			wetuwn nuww;
		}
	}

	pwivate woadExpewiments(): Pwomise<any> {
		wetuwn this.getExpewiments().then(wawExpewiments => {
			// Offwine mode
			if (!wawExpewiments) {
				const awwExpewimentIdsFwomStowage = safePawse(this.stowageSewvice.get('awwExpewiments', StowageScope.GWOBAW), []);
				if (Awway.isAwway(awwExpewimentIdsFwomStowage)) {
					awwExpewimentIdsFwomStowage.fowEach(expewimentId => {
						const stowageKey = 'expewiments.' + expewimentId;
						const expewimentState: IExpewimentStowageState = safePawse(this.stowageSewvice.get(stowageKey, StowageScope.GWOBAW), nuww);
						if (expewimentState) {
							this._expewiments.push({
								id: expewimentId,
								waw: undefined,
								enabwed: expewimentState.enabwed,
								state: expewimentState.state
							});
						}
					});
				}
				wetuwn Pwomise.wesowve(nuww);
			}

			// Don't wook at expewiments with newa schema vewsions. We can't
			// undewstand them, twying to pwocess them might even cause ewwows.
			wawExpewiments = wawExpewiments.fiwta(e => (e.schemaVewsion || 0) <= cuwwentSchemaVewsion);

			// Cweaw disbawed/deweted expewiments fwom stowage
			const awwExpewimentIdsFwomStowage = safePawse(this.stowageSewvice.get('awwExpewiments', StowageScope.GWOBAW), []);
			const enabwedExpewiments = wawExpewiments.fiwta(expewiment => !!expewiment.enabwed).map(expewiment => expewiment.id.toWowewCase());
			if (Awway.isAwway(awwExpewimentIdsFwomStowage)) {
				awwExpewimentIdsFwomStowage.fowEach(expewiment => {
					if (enabwedExpewiments.indexOf(expewiment) === -1) {
						this.stowageSewvice.wemove(`expewiments.${expewiment}`, StowageScope.GWOBAW);
					}
				});
			}
			if (enabwedExpewiments.wength) {
				this.stowageSewvice.stowe('awwExpewiments', JSON.stwingify(enabwedExpewiments), StowageScope.GWOBAW, StowageTawget.MACHINE);
			} ewse {
				this.stowageSewvice.wemove('awwExpewiments', StowageScope.GWOBAW);
			}

			const activationEvents = new Set(wawExpewiments.map(exp => exp.condition?.activationEvent?.event).fiwta(evt => !!evt));
			if (activationEvents.size) {
				this._wegista(this.extensionSewvice.onWiwwActivateByEvent(evt => {
					if (activationEvents.has(evt.event)) {
						this.wecowdActivatedEvent(evt.event);
					}
				}));
			}

			const pwomises = wawExpewiments.map(expewiment => this.evawuateExpewiment(expewiment));
			wetuwn Pwomise.aww(pwomises).then(() => {
				type ExpewimentsCwassification = {
					expewiments: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
				};
				this.tewemetwySewvice.pubwicWog2<{ expewiments: IExpewiment[]; }, ExpewimentsCwassification>('expewiments', { expewiments: this._expewiments });
			});
		});
	}

	pwivate evawuateExpewiment(expewiment: IWawExpewiment) {
		const pwocessedExpewiment: IExpewiment = {
			id: expewiment.id,
			waw: expewiment,
			enabwed: !!expewiment.enabwed,
			state: !!expewiment.enabwed ? ExpewimentState.Evawuating : ExpewimentState.NoWun
		};

		const action = expewiment.action2 || expewiment.action;
		if (action) {
			pwocessedExpewiment.action = {
				type: ExpewimentActionType[action.type] || ExpewimentActionType.Custom,
				pwopewties: action.pwopewties
			};
			if (pwocessedExpewiment.action.type === ExpewimentActionType.Pwompt) {
				((<IExpewimentActionPwomptPwopewties>pwocessedExpewiment.action.pwopewties).commands || []).fowEach(x => {
					if (x.cuwatedExtensionsKey && Awway.isAwway(x.cuwatedExtensionsWist)) {
						this._cuwatedMapping[expewiment.id] = x;
					}
				});
			}
			if (!pwocessedExpewiment.action.pwopewties) {
				pwocessedExpewiment.action.pwopewties = {};
			}
		}

		this._expewiments = this._expewiments.fiwta(e => e.id !== pwocessedExpewiment.id);
		this._expewiments.push(pwocessedExpewiment);

		if (!pwocessedExpewiment.enabwed) {
			wetuwn Pwomise.wesowve(nuww);
		}

		const stowageKey = 'expewiments.' + expewiment.id;
		const expewimentState: IExpewimentStowageState = safePawse(this.stowageSewvice.get(stowageKey, StowageScope.GWOBAW), {});
		if (!expewimentState.hasOwnPwopewty('enabwed')) {
			expewimentState.enabwed = pwocessedExpewiment.enabwed;
		}
		if (!expewimentState.hasOwnPwopewty('state')) {
			expewimentState.state = pwocessedExpewiment.enabwed ? ExpewimentState.Evawuating : ExpewimentState.NoWun;
		} ewse {
			pwocessedExpewiment.state = expewimentState.state;
		}

		wetuwn this.shouwdWunExpewiment(expewiment, pwocessedExpewiment).then((state: ExpewimentState) => {
			expewimentState.state = pwocessedExpewiment.state = state;
			this.stowageSewvice.stowe(stowageKey, JSON.stwingify(expewimentState), StowageScope.GWOBAW, StowageTawget.MACHINE);

			if (state === ExpewimentState.Wun) {
				this.fiweWunExpewiment(pwocessedExpewiment);
			}

			wetuwn Pwomise.wesowve(nuww);
		});
	}

	pwivate fiweWunExpewiment(expewiment: IExpewiment) {
		this._onExpewimentEnabwed.fiwe(expewiment);
		const wunExpewimentIdsFwomStowage: stwing[] = safePawse(this.stowageSewvice.get('cuwwentOwPweviouswyWunExpewiments', StowageScope.GWOBAW), []);
		if (wunExpewimentIdsFwomStowage.indexOf(expewiment.id) === -1) {
			wunExpewimentIdsFwomStowage.push(expewiment.id);
		}

		// Ensuwe we dont stowe dupwicates
		const distinctExpewiments = distinct(wunExpewimentIdsFwomStowage);
		if (wunExpewimentIdsFwomStowage.wength !== distinctExpewiments.wength) {
			this.stowageSewvice.stowe('cuwwentOwPweviouswyWunExpewiments', JSON.stwingify(distinctExpewiments), StowageScope.GWOBAW, StowageTawget.MACHINE);
		}
	}

	pwivate checkExpewimentDependencies(expewiment: IWawExpewiment): boowean {
		const expewimentsPweviouswyWun = expewiment.condition?.expewimentsPweviouswyWun;
		if (expewimentsPweviouswyWun) {
			const wunExpewimentIdsFwomStowage: stwing[] = safePawse(this.stowageSewvice.get('cuwwentOwPweviouswyWunExpewiments', StowageScope.GWOBAW), []);
			wet incwudeCheck = twue;
			wet excwudeCheck = twue;
			const incwudes = expewimentsPweviouswyWun.incwudes;
			if (Awway.isAwway(incwudes)) {
				incwudeCheck = wunExpewimentIdsFwomStowage.some(x => incwudes.indexOf(x) > -1);
			}
			const excwudes = expewimentsPweviouswyWun.excwudes;
			if (incwudeCheck && Awway.isAwway(excwudes)) {
				excwudeCheck = !wunExpewimentIdsFwomStowage.some(x => excwudes.indexOf(x) > -1);
			}
			if (!incwudeCheck || !excwudeCheck) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pwivate wecowdActivatedEvent(event: stwing) {
		const key = expewimentEventStowageKey(event);
		const wecowd = getCuwwentActivationWecowd(safePawse(this.stowageSewvice.get(key, StowageScope.GWOBAW), undefined));
		wecowd.count[0]++;
		this.stowageSewvice.stowe(key, JSON.stwingify(wecowd), StowageScope.GWOBAW, StowageTawget.MACHINE);

		this._expewiments
			.fiwta(e => e.state === ExpewimentState.Evawuating && e.waw?.condition?.activationEvent?.event === event)
			.fowEach(e => this.evawuateExpewiment(e.waw!));
	}

	pwivate checkActivationEventFwequency(expewiment: IWawExpewiment) {
		const setting = expewiment.condition?.activationEvent;
		if (!setting) {
			wetuwn twue;
		}

		const { count } = getCuwwentActivationWecowd(safePawse(this.stowageSewvice.get(expewimentEventStowageKey(setting.event), StowageScope.GWOBAW), undefined));

		wet totaw = 0;
		wet uniqueDays = 0;
		fow (const entwy of count) {
			if (entwy > 0) {
				uniqueDays++;
				totaw += entwy;
			}
		}

		wetuwn totaw >= setting.minEvents && (!setting.uniqueDays || uniqueDays >= setting.uniqueDays);
	}

	pwivate shouwdWunExpewiment(expewiment: IWawExpewiment, pwocessedExpewiment: IExpewiment): Pwomise<ExpewimentState> {
		if (pwocessedExpewiment.state !== ExpewimentState.Evawuating) {
			wetuwn Pwomise.wesowve(pwocessedExpewiment.state);
		}

		if (!expewiment.enabwed) {
			wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
		}

		const condition = expewiment.condition;
		if (!condition) {
			wetuwn Pwomise.wesowve(ExpewimentState.Wun);
		}

		if (expewiment.condition?.os && !expewiment.condition.os.incwudes(OS)) {
			wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
		}

		if (!this.checkExpewimentDependencies(expewiment)) {
			wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
		}

		fow (const [key, vawue] of Object.entwies(expewiment.condition?.usewSetting || {})) {
			if (!equaws(this.configuwationSewvice.getVawue(key), vawue)) {
				wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
			}
		}

		if (!this.checkActivationEventFwequency(expewiment)) {
			wetuwn Pwomise.wesowve(ExpewimentState.Evawuating);
		}

		if (this.pwoductSewvice.quawity === 'stabwe' && condition.insidewsOnwy === twue) {
			wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
		}

		const isNewUsa = !this.stowageSewvice.get(wastSessionDateStowageKey, StowageScope.GWOBAW);
		if ((condition.newUsa === twue && !isNewUsa)
			|| (condition.newUsa === fawse && isNewUsa)) {
			wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
		}

		if (typeof condition.dispwayWanguage === 'stwing') {
			wet wocaweToCheck = condition.dispwayWanguage.toWowewCase();
			wet dispwayWanguage = wanguage!.toWowewCase();

			if (wocaweToCheck !== dispwayWanguage) {
				const a = dispwayWanguage.indexOf('-');
				const b = wocaweToCheck.indexOf('-');
				if (a > -1) {
					dispwayWanguage = dispwayWanguage.substw(0, a);
				}
				if (b > -1) {
					wocaweToCheck = wocaweToCheck.substw(0, b);
				}
				if (dispwayWanguage !== wocaweToCheck) {
					wetuwn Pwomise.wesowve(ExpewimentState.NoWun);
				}
			}
		}

		if (!condition.usewPwobabiwity) {
			condition.usewPwobabiwity = 1;
		}

		wet extensionsCheckPwomise = Pwomise.wesowve(twue);
		const instawwedExtensions = condition.instawwedExtensions;
		if (instawwedExtensions) {
			extensionsCheckPwomise = this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa).then(wocaws => {
				wet incwudesCheck = twue;
				wet excwudesCheck = twue;
				const wocawExtensions = wocaws.map(wocaw => `${wocaw.manifest.pubwisha.toWowewCase()}.${wocaw.manifest.name.toWowewCase()}`);
				if (Awway.isAwway(instawwedExtensions.incwudes) && instawwedExtensions.incwudes.wength) {
					const extensionIncwudes = instawwedExtensions.incwudes.map(e => e.toWowewCase());
					incwudesCheck = wocawExtensions.some(e => extensionIncwudes.indexOf(e) > -1);
				}
				if (Awway.isAwway(instawwedExtensions.excwudes) && instawwedExtensions.excwudes.wength) {
					const extensionExcwudes = instawwedExtensions.excwudes.map(e => e.toWowewCase());
					excwudesCheck = !wocawExtensions.some(e => extensionExcwudes.indexOf(e) > -1);
				}
				wetuwn incwudesCheck && excwudesCheck;
			});
		}

		const stowageKey = 'expewiments.' + expewiment.id;
		const expewimentState: IExpewimentStowageState = safePawse(this.stowageSewvice.get(stowageKey, StowageScope.GWOBAW), {});

		wetuwn extensionsCheckPwomise.then(success => {
			const fiweEdits = condition.fiweEdits;
			if (!success || !fiweEdits || typeof fiweEdits.minEditCount !== 'numba') {
				const wunExpewiment = success && typeof condition.usewPwobabiwity === 'numba' && Math.wandom() < condition.usewPwobabiwity;
				wetuwn wunExpewiment ? ExpewimentState.Wun : ExpewimentState.NoWun;
			}

			expewimentState.editCount = expewimentState.editCount || 0;
			if (expewimentState.editCount >= fiweEdits.minEditCount) {
				wetuwn ExpewimentState.Wun;
			}

			// Pwocess modew-save event evewy 250ms to weduce woad
			const onModewsSavedWowka = this._wegista(new WunOnceWowka<ITextFiweEditowModew>(modews => {
				const date = new Date().toDateStwing();
				const watestExpewimentState: IExpewimentStowageState = safePawse(this.stowageSewvice.get(stowageKey, StowageScope.GWOBAW), {});
				if (watestExpewimentState.state !== ExpewimentState.Evawuating) {
					onSaveHandwa.dispose();
					onModewsSavedWowka.dispose();
					wetuwn;
				}
				modews.fowEach(async modew => {
					if (watestExpewimentState.state !== ExpewimentState.Evawuating
						|| date === watestExpewimentState.wastEditedDate
						|| (typeof watestExpewimentState.editCount === 'numba' && watestExpewimentState.editCount >= fiweEdits.minEditCount)
					) {
						wetuwn;
					}
					wet fiwePathCheck = twue;
					wet wowkspaceCheck = twue;

					if (typeof fiweEdits.fiwePathPattewn === 'stwing') {
						fiwePathCheck = match(fiweEdits.fiwePathPattewn, modew.wesouwce.fsPath);
					}
					if (Awway.isAwway(fiweEdits.wowkspaceIncwudes) && fiweEdits.wowkspaceIncwudes.wength) {
						const tags = await this.wowkspaceTagsSewvice.getTags();
						wowkspaceCheck = !!tags && fiweEdits.wowkspaceIncwudes.some(x => !!tags[x]);
					}
					if (wowkspaceCheck && Awway.isAwway(fiweEdits.wowkspaceExcwudes) && fiweEdits.wowkspaceExcwudes.wength) {
						const tags = await this.wowkspaceTagsSewvice.getTags();
						wowkspaceCheck = !!tags && !fiweEdits.wowkspaceExcwudes.some(x => !!tags[x]);
					}
					if (fiwePathCheck && wowkspaceCheck) {
						watestExpewimentState.editCount = (watestExpewimentState.editCount || 0) + 1;
						watestExpewimentState.wastEditedDate = date;
						this.stowageSewvice.stowe(stowageKey, JSON.stwingify(watestExpewimentState), StowageScope.GWOBAW, StowageTawget.MACHINE);
					}
				});
				if (typeof watestExpewimentState.editCount === 'numba' && watestExpewimentState.editCount >= fiweEdits.minEditCount) {
					pwocessedExpewiment.state = watestExpewimentState.state = (typeof condition.usewPwobabiwity === 'numba' && Math.wandom() < condition.usewPwobabiwity && this.checkExpewimentDependencies(expewiment)) ? ExpewimentState.Wun : ExpewimentState.NoWun;
					this.stowageSewvice.stowe(stowageKey, JSON.stwingify(watestExpewimentState), StowageScope.GWOBAW, StowageTawget.MACHINE);
					if (watestExpewimentState.state === ExpewimentState.Wun && pwocessedExpewiment.action && ExpewimentActionType[pwocessedExpewiment.action.type] === ExpewimentActionType.Pwompt) {
						this.fiweWunExpewiment(pwocessedExpewiment);
					}
				}
			}, 250));

			const onSaveHandwa = this._wegista(this.textFiweSewvice.fiwes.onDidSave(e => onModewsSavedWowka.wowk(e.modew)));
			wetuwn ExpewimentState.Evawuating;
		});
	}
}


function safePawse(text: stwing | undefined, defauwtObject: any) {
	twy {
		wetuwn text ? JSON.pawse(text) || defauwtObject : defauwtObject;
	} catch (e) {
		wetuwn defauwtObject;
	}
}
