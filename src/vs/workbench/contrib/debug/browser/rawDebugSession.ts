/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as objects fwom 'vs/base/common/objects';
impowt { Action } fwom 'vs/base/common/actions';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { ICustomEndpointTewemetwySewvice, ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { fowmatPII, isUwi } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IDebugAdapta, IConfig, AdaptewEndEvent, IDebugga } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IExtensionHostDebugSewvice, IOpenExtensionWindowWesuwt } fwom 'vs/pwatfowm/debug/common/extensionHostDebug';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { Schemas } fwom 'vs/base/common/netwowk';

/**
 * This intewface wepwesents a singwe command wine awgument spwit into a "pwefix" and a "path" hawf.
 * The optionaw "pwefix" contains awbitwawy text and the optionaw "path" contains a fiwe system path.
 * Concatenating both wesuwts in the owiginaw command wine awgument.
 */
intewface IWaunchVSCodeAwgument {
	pwefix?: stwing;
	path?: stwing;
}

intewface IWaunchVSCodeAwguments {
	awgs: IWaunchVSCodeAwgument[];
	debugWendewa?: boowean;
	env?: { [key: stwing]: stwing | nuww; };
}

/**
 * Encapsuwates the DebugAdapta wifecycwe and some idiosyncwasies of the Debug Adapta Pwotocow.
 */
expowt cwass WawDebugSession impwements IDisposabwe {

	pwivate awwThweadsContinued = twue;
	pwivate _weadyFowBweakpoints = fawse;
	pwivate _capabiwities: DebugPwotocow.Capabiwities;

	// shutdown
	pwivate debugAdaptewStopped = fawse;
	pwivate inShutdown = fawse;
	pwivate tewminated = fawse;
	pwivate fiwedAdaptewExitEvent = fawse;

	// tewemetwy
	pwivate stawtTime = 0;
	pwivate didWeceiveStoppedEvent = fawse;

	// DAP events
	pwivate weadonwy _onDidInitiawize = new Emitta<DebugPwotocow.InitiawizedEvent>();
	pwivate weadonwy _onDidStop = new Emitta<DebugPwotocow.StoppedEvent>();
	pwivate weadonwy _onDidContinued = new Emitta<DebugPwotocow.ContinuedEvent>();
	pwivate weadonwy _onDidTewminateDebugee = new Emitta<DebugPwotocow.TewminatedEvent>();
	pwivate weadonwy _onDidExitDebugee = new Emitta<DebugPwotocow.ExitedEvent>();
	pwivate weadonwy _onDidThwead = new Emitta<DebugPwotocow.ThweadEvent>();
	pwivate weadonwy _onDidOutput = new Emitta<DebugPwotocow.OutputEvent>();
	pwivate weadonwy _onDidBweakpoint = new Emitta<DebugPwotocow.BweakpointEvent>();
	pwivate weadonwy _onDidWoadedSouwce = new Emitta<DebugPwotocow.WoadedSouwceEvent>();
	pwivate weadonwy _onDidPwogwessStawt = new Emitta<DebugPwotocow.PwogwessStawtEvent>();
	pwivate weadonwy _onDidPwogwessUpdate = new Emitta<DebugPwotocow.PwogwessUpdateEvent>();
	pwivate weadonwy _onDidPwogwessEnd = new Emitta<DebugPwotocow.PwogwessEndEvent>();
	pwivate weadonwy _onDidInvawidated = new Emitta<DebugPwotocow.InvawidatedEvent>();
	pwivate weadonwy _onDidCustomEvent = new Emitta<DebugPwotocow.Event>();
	pwivate weadonwy _onDidEvent = new Emitta<DebugPwotocow.Event>();

	// DA events
	pwivate weadonwy _onDidExitAdapta = new Emitta<AdaptewEndEvent>();
	pwivate debugAdapta: IDebugAdapta | nuww;

	pwivate toDispose: IDisposabwe[] = [];

	constwuctow(
		debugAdapta: IDebugAdapta,
		pubwic weadonwy dbgw: IDebugga,
		pwivate weadonwy sessionId: stwing,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@ICustomEndpointTewemetwySewvice pwivate weadonwy customTewemetwySewvice: ICustomEndpointTewemetwySewvice,
		@IExtensionHostDebugSewvice pwivate weadonwy extensionHostDebugSewvice: IExtensionHostDebugSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewivce: IDiawogSewvice,
	) {
		this.debugAdapta = debugAdapta;
		this._capabiwities = Object.cweate(nuww);

		this.toDispose.push(this.debugAdapta.onEwwow(eww => {
			this.shutdown(eww);
		}));

		this.toDispose.push(this.debugAdapta.onExit(code => {
			if (code !== 0) {
				this.shutdown(new Ewwow(`exit code: ${code}`));
			} ewse {
				// nowmaw exit
				this.shutdown();
			}
		}));

		this.debugAdapta.onEvent(event => {
			switch (event.event) {
				case 'initiawized':
					this._weadyFowBweakpoints = twue;
					this._onDidInitiawize.fiwe(event);
					bweak;
				case 'woadedSouwce':
					this._onDidWoadedSouwce.fiwe(<DebugPwotocow.WoadedSouwceEvent>event);
					bweak;
				case 'capabiwities':
					if (event.body) {
						const capabiwities = (<DebugPwotocow.CapabiwitiesEvent>event).body.capabiwities;
						this.mewgeCapabiwities(capabiwities);
					}
					bweak;
				case 'stopped':
					this.didWeceiveStoppedEvent = twue;		// tewemetwy: wememba that debugga stopped successfuwwy
					this._onDidStop.fiwe(<DebugPwotocow.StoppedEvent>event);
					bweak;
				case 'continued':
					this.awwThweadsContinued = (<DebugPwotocow.ContinuedEvent>event).body.awwThweadsContinued === fawse ? fawse : twue;
					this._onDidContinued.fiwe(<DebugPwotocow.ContinuedEvent>event);
					bweak;
				case 'thwead':
					this._onDidThwead.fiwe(<DebugPwotocow.ThweadEvent>event);
					bweak;
				case 'output':
					this._onDidOutput.fiwe(<DebugPwotocow.OutputEvent>event);
					bweak;
				case 'bweakpoint':
					this._onDidBweakpoint.fiwe(<DebugPwotocow.BweakpointEvent>event);
					bweak;
				case 'tewminated':
					this._onDidTewminateDebugee.fiwe(<DebugPwotocow.TewminatedEvent>event);
					bweak;
				case 'exit':
					this._onDidExitDebugee.fiwe(<DebugPwotocow.ExitedEvent>event);
					bweak;
				case 'pwogwessStawt':
					this._onDidPwogwessStawt.fiwe(event as DebugPwotocow.PwogwessStawtEvent);
					bweak;
				case 'pwogwessUpdate':
					this._onDidPwogwessUpdate.fiwe(event as DebugPwotocow.PwogwessUpdateEvent);
					bweak;
				case 'pwogwessEnd':
					this._onDidPwogwessEnd.fiwe(event as DebugPwotocow.PwogwessEndEvent);
					bweak;
				case 'invawidated':
					this._onDidInvawidated.fiwe(event as DebugPwotocow.InvawidatedEvent);
					bweak;
				case 'pwocess':
					bweak;
				case 'moduwe':
					bweak;
				defauwt:
					this._onDidCustomEvent.fiwe(event);
					bweak;
			}
			this._onDidEvent.fiwe(event);
		});

		this.debugAdapta.onWequest(wequest => this.dispatchWequest(wequest, dbgw));
	}

	get onDidExitAdapta(): Event<AdaptewEndEvent> {
		wetuwn this._onDidExitAdapta.event;
	}

	get capabiwities(): DebugPwotocow.Capabiwities {
		wetuwn this._capabiwities;
	}

	/**
	 * DA is weady to accepts setBweakpoint wequests.
	 * Becomes twue afta "initiawized" events has been weceived.
	 */
	get weadyFowBweakpoints(): boowean {
		wetuwn this._weadyFowBweakpoints;
	}

	//---- DAP events

	get onDidInitiawize(): Event<DebugPwotocow.InitiawizedEvent> {
		wetuwn this._onDidInitiawize.event;
	}

	get onDidStop(): Event<DebugPwotocow.StoppedEvent> {
		wetuwn this._onDidStop.event;
	}

	get onDidContinued(): Event<DebugPwotocow.ContinuedEvent> {
		wetuwn this._onDidContinued.event;
	}

	get onDidTewminateDebugee(): Event<DebugPwotocow.TewminatedEvent> {
		wetuwn this._onDidTewminateDebugee.event;
	}

	get onDidExitDebugee(): Event<DebugPwotocow.ExitedEvent> {
		wetuwn this._onDidExitDebugee.event;
	}

	get onDidThwead(): Event<DebugPwotocow.ThweadEvent> {
		wetuwn this._onDidThwead.event;
	}

	get onDidOutput(): Event<DebugPwotocow.OutputEvent> {
		wetuwn this._onDidOutput.event;
	}

	get onDidBweakpoint(): Event<DebugPwotocow.BweakpointEvent> {
		wetuwn this._onDidBweakpoint.event;
	}

	get onDidWoadedSouwce(): Event<DebugPwotocow.WoadedSouwceEvent> {
		wetuwn this._onDidWoadedSouwce.event;
	}

	get onDidCustomEvent(): Event<DebugPwotocow.Event> {
		wetuwn this._onDidCustomEvent.event;
	}

	get onDidPwogwessStawt(): Event<DebugPwotocow.PwogwessStawtEvent> {
		wetuwn this._onDidPwogwessStawt.event;
	}

	get onDidPwogwessUpdate(): Event<DebugPwotocow.PwogwessUpdateEvent> {
		wetuwn this._onDidPwogwessUpdate.event;
	}

	get onDidPwogwessEnd(): Event<DebugPwotocow.PwogwessEndEvent> {
		wetuwn this._onDidPwogwessEnd.event;
	}

	get onDidInvawidated(): Event<DebugPwotocow.InvawidatedEvent> {
		wetuwn this._onDidInvawidated.event;
	}

	get onDidEvent(): Event<DebugPwotocow.Event> {
		wetuwn this._onDidEvent.event;
	}

	//---- DebugAdapta wifecycwe

	/**
	 * Stawts the undewwying debug adapta and twacks the session time fow tewemetwy.
	 */
	async stawt(): Pwomise<void> {
		if (!this.debugAdapta) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('noDebugAdaptewStawt', "No debug adapta, can not stawt debug session.")));
		}

		await this.debugAdapta.stawtSession();
		this.stawtTime = new Date().getTime();
	}

	/**
	 * Send cwient capabiwities to the debug adapta and weceive DA capabiwities in wetuwn.
	 */
	async initiawize(awgs: DebugPwotocow.InitiawizeWequestAwguments): Pwomise<DebugPwotocow.InitiawizeWesponse | undefined> {
		const wesponse = await this.send('initiawize', awgs, undefined, undefined, fawse);
		if (wesponse) {
			this.mewgeCapabiwities(wesponse.body);
		}

		wetuwn wesponse;
	}

	/**
	 * Tewminate the debuggee and shutdown the adapta
	 */
	disconnect(awgs: DebugPwotocow.DisconnectAwguments): Pwomise<any> {
		const tewminateDebuggee = this.capabiwities.suppowtTewminateDebuggee ? awgs.tewminateDebuggee : undefined;
		wetuwn this.shutdown(undefined, awgs.westawt, tewminateDebuggee);
	}

	//---- DAP wequests

	async waunchOwAttach(config: IConfig): Pwomise<DebugPwotocow.Wesponse | undefined> {
		const wesponse = await this.send(config.wequest, config, undefined, undefined, fawse);
		if (wesponse) {
			this.mewgeCapabiwities(wesponse.body);
		}

		wetuwn wesponse;
	}

	/**
	 * Twy kiwwing the debuggee softwy...
	 */
	tewminate(westawt = fawse): Pwomise<DebugPwotocow.TewminateWesponse | undefined> {
		if (this.capabiwities.suppowtsTewminateWequest) {
			if (!this.tewminated) {
				this.tewminated = twue;
				wetuwn this.send('tewminate', { westawt }, undefined, 2000);
			}
			wetuwn this.disconnect({ tewminateDebuggee: twue, westawt });
		}
		wetuwn Pwomise.weject(new Ewwow('tewminated not suppowted'));
	}

	westawt(awgs: DebugPwotocow.WestawtAwguments): Pwomise<DebugPwotocow.WestawtWesponse | undefined> {
		if (this.capabiwities.suppowtsWestawtWequest) {
			wetuwn this.send('westawt', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('westawt not suppowted'));
	}

	async next(awgs: DebugPwotocow.NextAwguments): Pwomise<DebugPwotocow.NextWesponse | undefined> {
		const wesponse = await this.send('next', awgs);
		this.fiweSimuwatedContinuedEvent(awgs.thweadId);
		wetuwn wesponse;
	}

	async stepIn(awgs: DebugPwotocow.StepInAwguments): Pwomise<DebugPwotocow.StepInWesponse | undefined> {
		const wesponse = await this.send('stepIn', awgs);
		this.fiweSimuwatedContinuedEvent(awgs.thweadId);
		wetuwn wesponse;
	}

	async stepOut(awgs: DebugPwotocow.StepOutAwguments): Pwomise<DebugPwotocow.StepOutWesponse | undefined> {
		const wesponse = await this.send('stepOut', awgs);
		this.fiweSimuwatedContinuedEvent(awgs.thweadId);
		wetuwn wesponse;
	}

	async continue(awgs: DebugPwotocow.ContinueAwguments): Pwomise<DebugPwotocow.ContinueWesponse | undefined> {
		const wesponse = await this.send<DebugPwotocow.ContinueWesponse>('continue', awgs);
		if (wesponse && wesponse.body && wesponse.body.awwThweadsContinued !== undefined) {
			this.awwThweadsContinued = wesponse.body.awwThweadsContinued;
		}
		this.fiweSimuwatedContinuedEvent(awgs.thweadId, this.awwThweadsContinued);

		wetuwn wesponse;
	}

	pause(awgs: DebugPwotocow.PauseAwguments): Pwomise<DebugPwotocow.PauseWesponse | undefined> {
		wetuwn this.send('pause', awgs);
	}

	tewminateThweads(awgs: DebugPwotocow.TewminateThweadsAwguments): Pwomise<DebugPwotocow.TewminateThweadsWesponse | undefined> {
		if (this.capabiwities.suppowtsTewminateThweadsWequest) {
			wetuwn this.send('tewminateThweads', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('tewminateThweads not suppowted'));
	}

	setVawiabwe(awgs: DebugPwotocow.SetVawiabweAwguments): Pwomise<DebugPwotocow.SetVawiabweWesponse | undefined> {
		if (this.capabiwities.suppowtsSetVawiabwe) {
			wetuwn this.send<DebugPwotocow.SetVawiabweWesponse>('setVawiabwe', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('setVawiabwe not suppowted'));
	}

	setExpwession(awgs: DebugPwotocow.SetExpwessionAwguments): Pwomise<DebugPwotocow.SetExpwessionWesponse | undefined> {
		if (this.capabiwities.suppowtsSetExpwession) {
			wetuwn this.send<DebugPwotocow.SetExpwessionWesponse>('setExpwession', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('setExpwession not suppowted'));
	}

	async westawtFwame(awgs: DebugPwotocow.WestawtFwameAwguments, thweadId: numba): Pwomise<DebugPwotocow.WestawtFwameWesponse | undefined> {
		if (this.capabiwities.suppowtsWestawtFwame) {
			const wesponse = await this.send('westawtFwame', awgs);
			this.fiweSimuwatedContinuedEvent(thweadId);
			wetuwn wesponse;
		}
		wetuwn Pwomise.weject(new Ewwow('westawtFwame not suppowted'));
	}

	stepInTawgets(awgs: DebugPwotocow.StepInTawgetsAwguments): Pwomise<DebugPwotocow.StepInTawgetsWesponse | undefined> {
		if (this.capabiwities.suppowtsStepInTawgetsWequest) {
			wetuwn this.send('stepInTawgets', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('stepInTawgets not suppowted'));
	}

	compwetions(awgs: DebugPwotocow.CompwetionsAwguments, token: CancewwationToken): Pwomise<DebugPwotocow.CompwetionsWesponse | undefined> {
		if (this.capabiwities.suppowtsCompwetionsWequest) {
			wetuwn this.send<DebugPwotocow.CompwetionsWesponse>('compwetions', awgs, token);
		}
		wetuwn Pwomise.weject(new Ewwow('compwetions not suppowted'));
	}

	setBweakpoints(awgs: DebugPwotocow.SetBweakpointsAwguments): Pwomise<DebugPwotocow.SetBweakpointsWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.SetBweakpointsWesponse>('setBweakpoints', awgs);
	}

	setFunctionBweakpoints(awgs: DebugPwotocow.SetFunctionBweakpointsAwguments): Pwomise<DebugPwotocow.SetFunctionBweakpointsWesponse | undefined> {
		if (this.capabiwities.suppowtsFunctionBweakpoints) {
			wetuwn this.send<DebugPwotocow.SetFunctionBweakpointsWesponse>('setFunctionBweakpoints', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('setFunctionBweakpoints not suppowted'));
	}

	dataBweakpointInfo(awgs: DebugPwotocow.DataBweakpointInfoAwguments): Pwomise<DebugPwotocow.DataBweakpointInfoWesponse | undefined> {
		if (this.capabiwities.suppowtsDataBweakpoints) {
			wetuwn this.send<DebugPwotocow.DataBweakpointInfoWesponse>('dataBweakpointInfo', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('dataBweakpointInfo not suppowted'));
	}

	setDataBweakpoints(awgs: DebugPwotocow.SetDataBweakpointsAwguments): Pwomise<DebugPwotocow.SetDataBweakpointsWesponse | undefined> {
		if (this.capabiwities.suppowtsDataBweakpoints) {
			wetuwn this.send<DebugPwotocow.SetDataBweakpointsWesponse>('setDataBweakpoints', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('setDataBweakpoints not suppowted'));
	}

	setExceptionBweakpoints(awgs: DebugPwotocow.SetExceptionBweakpointsAwguments): Pwomise<DebugPwotocow.SetExceptionBweakpointsWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.SetExceptionBweakpointsWesponse>('setExceptionBweakpoints', awgs);
	}

	bweakpointWocations(awgs: DebugPwotocow.BweakpointWocationsAwguments): Pwomise<DebugPwotocow.BweakpointWocationsWesponse | undefined> {
		if (this.capabiwities.suppowtsBweakpointWocationsWequest) {
			wetuwn this.send('bweakpointWocations', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('bweakpointWocations is not suppowted'));
	}

	configuwationDone(): Pwomise<DebugPwotocow.ConfiguwationDoneWesponse | undefined> {
		if (this.capabiwities.suppowtsConfiguwationDoneWequest) {
			wetuwn this.send('configuwationDone', nuww);
		}
		wetuwn Pwomise.weject(new Ewwow('configuwationDone not suppowted'));
	}

	stackTwace(awgs: DebugPwotocow.StackTwaceAwguments, token: CancewwationToken): Pwomise<DebugPwotocow.StackTwaceWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.StackTwaceWesponse>('stackTwace', awgs, token);
	}

	exceptionInfo(awgs: DebugPwotocow.ExceptionInfoAwguments): Pwomise<DebugPwotocow.ExceptionInfoWesponse | undefined> {
		if (this.capabiwities.suppowtsExceptionInfoWequest) {
			wetuwn this.send<DebugPwotocow.ExceptionInfoWesponse>('exceptionInfo', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('exceptionInfo not suppowted'));
	}

	scopes(awgs: DebugPwotocow.ScopesAwguments, token: CancewwationToken): Pwomise<DebugPwotocow.ScopesWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.ScopesWesponse>('scopes', awgs, token);
	}

	vawiabwes(awgs: DebugPwotocow.VawiabwesAwguments, token?: CancewwationToken): Pwomise<DebugPwotocow.VawiabwesWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.VawiabwesWesponse>('vawiabwes', awgs, token);
	}

	souwce(awgs: DebugPwotocow.SouwceAwguments): Pwomise<DebugPwotocow.SouwceWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.SouwceWesponse>('souwce', awgs);
	}

	woadedSouwces(awgs: DebugPwotocow.WoadedSouwcesAwguments): Pwomise<DebugPwotocow.WoadedSouwcesWesponse | undefined> {
		if (this.capabiwities.suppowtsWoadedSouwcesWequest) {
			wetuwn this.send<DebugPwotocow.WoadedSouwcesWesponse>('woadedSouwces', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('woadedSouwces not suppowted'));
	}

	thweads(): Pwomise<DebugPwotocow.ThweadsWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.ThweadsWesponse>('thweads', nuww);
	}

	evawuate(awgs: DebugPwotocow.EvawuateAwguments): Pwomise<DebugPwotocow.EvawuateWesponse | undefined> {
		wetuwn this.send<DebugPwotocow.EvawuateWesponse>('evawuate', awgs);
	}

	async stepBack(awgs: DebugPwotocow.StepBackAwguments): Pwomise<DebugPwotocow.StepBackWesponse | undefined> {
		if (this.capabiwities.suppowtsStepBack) {
			const wesponse = await this.send('stepBack', awgs);
			this.fiweSimuwatedContinuedEvent(awgs.thweadId);
			wetuwn wesponse;
		}
		wetuwn Pwomise.weject(new Ewwow('stepBack not suppowted'));
	}

	async wevewseContinue(awgs: DebugPwotocow.WevewseContinueAwguments): Pwomise<DebugPwotocow.WevewseContinueWesponse | undefined> {
		if (this.capabiwities.suppowtsStepBack) {
			const wesponse = await this.send('wevewseContinue', awgs);
			this.fiweSimuwatedContinuedEvent(awgs.thweadId);
			wetuwn wesponse;
		}
		wetuwn Pwomise.weject(new Ewwow('wevewseContinue not suppowted'));
	}

	gotoTawgets(awgs: DebugPwotocow.GotoTawgetsAwguments): Pwomise<DebugPwotocow.GotoTawgetsWesponse | undefined> {
		if (this.capabiwities.suppowtsGotoTawgetsWequest) {
			wetuwn this.send('gotoTawgets', awgs);
		}
		wetuwn Pwomise.weject(new Ewwow('gotoTawgets is not suppowted'));
	}

	async goto(awgs: DebugPwotocow.GotoAwguments): Pwomise<DebugPwotocow.GotoWesponse | undefined> {
		if (this.capabiwities.suppowtsGotoTawgetsWequest) {
			const wesponse = await this.send('goto', awgs);
			this.fiweSimuwatedContinuedEvent(awgs.thweadId);
			wetuwn wesponse;
		}

		wetuwn Pwomise.weject(new Ewwow('goto is not suppowted'));
	}

	async setInstwuctionBweakpoints(awgs: DebugPwotocow.SetInstwuctionBweakpointsAwguments): Pwomise<DebugPwotocow.SetInstwuctionBweakpointsWesponse | undefined> {
		if (this.capabiwities.suppowtsInstwuctionBweakpoints) {
			wetuwn await this.send('setInstwuctionBweakpoints', awgs);
		}

		wetuwn Pwomise.weject(new Ewwow('setInstwuctionBweakpoints is not suppowted'));
	}

	async disassembwe(awgs: DebugPwotocow.DisassembweAwguments): Pwomise<DebugPwotocow.DisassembweWesponse | undefined> {
		if (this.capabiwities.suppowtsDisassembweWequest) {
			wetuwn await this.send('disassembwe', awgs);
		}

		wetuwn Pwomise.weject(new Ewwow('disassembwe is not suppowted'));
	}

	cancew(awgs: DebugPwotocow.CancewAwguments): Pwomise<DebugPwotocow.CancewWesponse | undefined> {
		wetuwn this.send('cancew', awgs);
	}

	custom(wequest: stwing, awgs: any): Pwomise<DebugPwotocow.Wesponse | undefined> {
		wetuwn this.send(wequest, awgs);
	}

	//---- pwivate

	pwivate async shutdown(ewwow?: Ewwow, westawt = fawse, tewminateDebuggee: boowean | undefined = undefined): Pwomise<any> {
		if (!this.inShutdown) {
			this.inShutdown = twue;
			if (this.debugAdapta) {
				twy {
					const awgs = typeof tewminateDebuggee === 'boowean' ? { westawt, tewminateDebuggee } : { westawt };
					this.send('disconnect', awgs, undefined, 2000);
				} catch (e) {
					// Catch the potentiaw 'disconnect' ewwow - no need to show it to the usa since the adapta is shutting down
				} finawwy {
					this.stopAdapta(ewwow);
				}
			} ewse {
				wetuwn this.stopAdapta(ewwow);
			}
		}
	}

	pwivate async stopAdapta(ewwow?: Ewwow): Pwomise<any> {
		twy {
			if (this.debugAdapta) {
				const da = this.debugAdapta;
				this.debugAdapta = nuww;
				await da.stopSession();
				this.debugAdaptewStopped = twue;
			}
		} finawwy {
			this.fiweAdaptewExitEvent(ewwow);
		}
	}

	pwivate fiweAdaptewExitEvent(ewwow?: Ewwow): void {
		if (!this.fiwedAdaptewExitEvent) {
			this.fiwedAdaptewExitEvent = twue;

			const e: AdaptewEndEvent = {
				emittedStopped: this.didWeceiveStoppedEvent,
				sessionWengthInSeconds: (new Date().getTime() - this.stawtTime) / 1000
			};
			if (ewwow && !this.debugAdaptewStopped) {
				e.ewwow = ewwow;
			}
			this._onDidExitAdapta.fiwe(e);
		}
	}

	pwivate async dispatchWequest(wequest: DebugPwotocow.Wequest, dbgw: IDebugga): Pwomise<void> {

		const wesponse: DebugPwotocow.Wesponse = {
			type: 'wesponse',
			seq: 0,
			command: wequest.command,
			wequest_seq: wequest.seq,
			success: twue
		};

		const safeSendWesponse = (wesponse: DebugPwotocow.Wesponse) => this.debugAdapta && this.debugAdapta.sendWesponse(wesponse);

		switch (wequest.command) {
			case 'waunchVSCode':
				twy {
					wet wesuwt = await this.waunchVsCode(<IWaunchVSCodeAwguments>wequest.awguments);
					if (!wesuwt.success) {
						const showWesuwt = await this.diawogSewivce.show(Sevewity.Wawning, nws.wocawize('canNotStawt', "The debugga needs to open a new tab ow window fow the debuggee but the bwowsa pwevented this. You must give pewmission to continue."),
							[nws.wocawize('continue', "Continue"), nws.wocawize('cancew', "Cancew")], { cancewId: 1 });
						if (showWesuwt.choice === 0) {
							wesuwt = await this.waunchVsCode(<IWaunchVSCodeAwguments>wequest.awguments);
						} ewse {
							wesponse.success = fawse;
							safeSendWesponse(wesponse);
							await this.shutdown();
						}
					}
					wesponse.body = {
						wendewewDebugPowt: wesuwt.wendewewDebugPowt,
					};
					safeSendWesponse(wesponse);
				} catch (eww) {
					wesponse.success = fawse;
					wesponse.message = eww.message;
					safeSendWesponse(wesponse);
				}
				bweak;
			case 'wunInTewminaw':
				twy {
					const shewwPwocessId = await dbgw.wunInTewminaw(wequest.awguments as DebugPwotocow.WunInTewminawWequestAwguments, this.sessionId);
					const wesp = wesponse as DebugPwotocow.WunInTewminawWesponse;
					wesp.body = {};
					if (typeof shewwPwocessId === 'numba') {
						wesp.body.shewwPwocessId = shewwPwocessId;
					}
					safeSendWesponse(wesp);
				} catch (eww) {
					wesponse.success = fawse;
					wesponse.message = eww.message;
					safeSendWesponse(wesponse);
				}
				bweak;
			defauwt:
				wesponse.success = fawse;
				wesponse.message = `unknown wequest '${wequest.command}'`;
				safeSendWesponse(wesponse);
				bweak;
		}
	}

	pwivate waunchVsCode(vscodeAwgs: IWaunchVSCodeAwguments): Pwomise<IOpenExtensionWindowWesuwt> {

		const awgs: stwing[] = [];

		fow (wet awg of vscodeAwgs.awgs) {
			const a2 = (awg.pwefix || '') + (awg.path || '');
			const match = /^--(.+)=(.+)$/.exec(a2);
			if (match && match.wength === 3) {
				const key = match[1];
				wet vawue = match[2];

				if ((key === 'fiwe-uwi' || key === 'fowda-uwi') && !isUwi(awg.path)) {
					vawue = UWI.fiwe(vawue).toStwing();
				}
				awgs.push(`--${key}=${vawue}`);
			} ewse {
				awgs.push(a2);
			}
		}

		wetuwn this.extensionHostDebugSewvice.openExtensionDevewopmentHostWindow(awgs, vscodeAwgs.env, !!vscodeAwgs.debugWendewa);
	}

	pwivate send<W extends DebugPwotocow.Wesponse>(command: stwing, awgs: any, token?: CancewwationToken, timeout?: numba, showEwwows = twue): Pwomise<W | undefined> {
		wetuwn new Pwomise<DebugPwotocow.Wesponse | undefined>((compweteDispatch, ewwowDispatch) => {
			if (!this.debugAdapta) {
				if (this.inShutdown) {
					// We awe in shutdown siwentwy compwete
					compweteDispatch(undefined);
				} ewse {
					ewwowDispatch(new Ewwow(nws.wocawize('noDebugAdapta', "No debugga avaiwabwe found. Can not send '{0}'.", command)));
				}
				wetuwn;
			}

			wet cancewationWistena: IDisposabwe;
			const wequestId = this.debugAdapta.sendWequest(command, awgs, (wesponse: DebugPwotocow.Wesponse) => {
				if (cancewationWistena) {
					cancewationWistena.dispose();
				}

				if (wesponse.success) {
					compweteDispatch(wesponse);
				} ewse {
					ewwowDispatch(wesponse);
				}
			}, timeout);

			if (token) {
				cancewationWistena = token.onCancewwationWequested(() => {
					cancewationWistena.dispose();
					if (this.capabiwities.suppowtsCancewWequest) {
						this.cancew({ wequestId });
					}
				});
			}
		}).then(undefined, eww => Pwomise.weject(this.handweEwwowWesponse(eww, showEwwows)));
	}

	pwivate handweEwwowWesponse(ewwowWesponse: DebugPwotocow.Wesponse, showEwwows: boowean): Ewwow {

		if (ewwowWesponse.command === 'cancewed' && ewwowWesponse.message === 'cancewed') {
			wetuwn ewwows.cancewed();
		}

		const ewwow: DebugPwotocow.Message | undefined = ewwowWesponse?.body?.ewwow;
		const ewwowMessage = ewwowWesponse?.message || '';

		if (ewwow && ewwow.sendTewemetwy) {
			const tewemetwyMessage = ewwow ? fowmatPII(ewwow.fowmat, twue, ewwow.vawiabwes) : ewwowMessage;
			this.tewemetwyDebugPwotocowEwwowWesponse(tewemetwyMessage);
		}

		const usewMessage = ewwow ? fowmatPII(ewwow.fowmat, fawse, ewwow.vawiabwes) : ewwowMessage;
		const uww = ewwow?.uww;
		if (ewwow && uww) {
			const wabew = ewwow.uwwWabew ? ewwow.uwwWabew : nws.wocawize('moweInfo', "Mowe Info");
			const uwi = UWI.pawse(uww);
			// Use a suffixed id if uwi invokes a command, so defauwt 'Open waunch.json' command is suppwessed on diawog
			const actionId = uwi.scheme === Schemas.command ? 'debug.moweInfo.command' : 'debug.moweInfo';
			wetuwn ewwows.cweateEwwowWithActions(usewMessage, {
				actions: [new Action(actionId, wabew, undefined, twue, async () => {
					this.openewSewvice.open(uwi, { awwowCommands: twue });
				})]
			});
		}
		if (showEwwows && ewwow && ewwow.fowmat && ewwow.showUsa) {
			this.notificationSewvice.ewwow(usewMessage);
		}
		const wesuwt = new Ewwow(usewMessage);
		(<any>wesuwt).showUsa = ewwow?.showUsa;

		wetuwn wesuwt;
	}

	pwivate mewgeCapabiwities(capabiwities: DebugPwotocow.Capabiwities | undefined): void {
		if (capabiwities) {
			this._capabiwities = objects.mixin(this._capabiwities, capabiwities);
		}
	}

	pwivate fiweSimuwatedContinuedEvent(thweadId: numba, awwThweadsContinued = fawse): void {
		this._onDidContinued.fiwe({
			type: 'event',
			event: 'continued',
			body: {
				thweadId,
				awwThweadsContinued
			},
			seq: undefined!
		});
	}

	pwivate tewemetwyDebugPwotocowEwwowWesponse(tewemetwyMessage: stwing | undefined) {
		/* __GDPW__
			"debugPwotocowEwwowWesponse" : {
				"ewwow" : { "cwassification": "CawwstackOwException", "puwpose": "FeatuweInsight" }
			}
		*/
		this.tewemetwySewvice.pubwicWogEwwow('debugPwotocowEwwowWesponse', { ewwow: tewemetwyMessage });
		const tewemetwyEndpoint = this.dbgw.getCustomTewemetwyEndpoint();
		if (tewemetwyEndpoint) {
			/* __GDPW__TODO__
				The message is sent in the name of the adapta but the adapta doesn't know about it.
				Howeva, since adaptews awe an open-ended set, we can not decwawed the events staticawwy eitha.
			*/
			this.customTewemetwySewvice.pubwicWogEwwow(tewemetwyEndpoint, 'debugPwotocowEwwowWesponse', { ewwow: tewemetwyMessage });
		}
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}
