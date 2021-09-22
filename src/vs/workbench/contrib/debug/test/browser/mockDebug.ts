/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { Event } fwom 'vs/base/common/event';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Position, IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWaunch, IDebugSewvice, State, IDebugSession, IConfiguwationManaga, IStackFwame, IBweakpointData, IBweakpointUpdateData, IConfig, IDebugModew, IViewModew, IBweakpoint, WoadedSouwceEvent, IThwead, IWawModewUpdate, IFunctionBweakpoint, IExceptionBweakpoint, IDebugga, IExceptionInfo, AdaptewEndEvent, IWepwEwement, IExpwession, IWepwEwementSouwce, IDataBweakpoint, IDebugSessionOptions, IEvawuate, IAdaptewManaga, IWawStoppedDetaiws, IInstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { AbstwactDebugAdapta } fwom 'vs/wowkbench/contwib/debug/common/abstwactDebugAdapta';
impowt { DebugStowage } fwom 'vs/wowkbench/contwib/debug/common/debugStowage';
impowt { ExceptionBweakpoint, Expwession, DataBweakpoint, FunctionBweakpoint, Bweakpoint, DebugModew } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { DebugCompoundWoot } fwom 'vs/wowkbench/contwib/debug/common/debugCompoundWoot';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { TestFiweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';

const fiweSewvice = new TestFiweSewvice();
expowt const mockUwiIdentitySewvice = new UwiIdentitySewvice(fiweSewvice);

expowt cwass MockDebugSewvice impwements IDebugSewvice {
	_sewviceBwand: undefined;

	get state(): State {
		thwow new Ewwow('not impwemented');
	}

	get onWiwwNewSession(): Event<IDebugSession> {
		thwow new Ewwow('not impwemented');
	}

	get onDidNewSession(): Event<IDebugSession> {
		thwow new Ewwow('not impwemented');
	}

	get onDidEndSession(): Event<IDebugSession> {
		thwow new Ewwow('not impwemented');
	}

	get onDidChangeState(): Event<State> {
		thwow new Ewwow('not impwemented');
	}

	getConfiguwationManaga(): IConfiguwationManaga {
		thwow new Ewwow('not impwemented');
	}

	getAdaptewManaga(): IAdaptewManaga {
		thwow new Ewwow('Method not impwemented.');
	}

	canSetBweakpointsIn(modew: ITextModew): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	focusStackFwame(focusedStackFwame: IStackFwame): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	sendAwwBweakpoints(session?: IDebugSession): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	addBweakpoints(uwi: uwi, wawBweakpoints: IBweakpointData[]): Pwomise<IBweakpoint[]> {
		thwow new Ewwow('not impwemented');
	}

	updateBweakpoints(uwi: uwi, data: Map<stwing, IBweakpointUpdateData>, sendOnWesouwceSaved: boowean): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	enabweOwDisabweBweakpoints(enabwed: boowean): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	setBweakpointsActivated(): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	wemoveBweakpoints(): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	addInstwuctionBweakpoint(addwess: stwing, offset: numba, condition?: stwing, hitCondition?: stwing): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	wemoveInstwuctionBweakpoints(addwess?: stwing): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	setExceptionBweakpointCondition(bweakpoint: IExceptionBweakpoint, condition: stwing): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	setExceptionBweakpoints(data: DebugPwotocow.ExceptionBweakpointsFiwta[]): void {
		thwow new Ewwow('Method not impwemented.');
	}

	addFunctionBweakpoint(): void { }

	moveWatchExpwession(id: stwing, position: numba): void { }

	updateFunctionBweakpoint(id: stwing, update: { name?: stwing, hitCondition?: stwing, condition?: stwing }): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	wemoveFunctionBweakpoints(id?: stwing): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	addDataBweakpoint(wabew: stwing, dataId: stwing, canPewsist: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	wemoveDataBweakpoints(id?: stwing | undefined): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	addWepwExpwession(name: stwing): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	wemoveWepwExpwessions(): void { }

	addWatchExpwession(name?: stwing): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	wenameWatchExpwession(id: stwing, newName: stwing): Pwomise<void> {
		thwow new Ewwow('not impwemented');
	}

	wemoveWatchExpwessions(id?: stwing): void { }

	stawtDebugging(waunch: IWaunch, configOwName?: IConfig | stwing, options?: IDebugSessionOptions): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(twue);
	}

	westawtSession(): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	stopSession(): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	getModew(): IDebugModew {
		thwow new Ewwow('not impwemented');
	}

	getViewModew(): IViewModew {
		thwow new Ewwow('not impwemented');
	}

	wogToWepw(session: IDebugSession, vawue: stwing): void { }

	souwceIsNotAvaiwabwe(uwi: uwi): void { }

	twyToAutoFocusStackFwame(thwead: IThwead): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	wunTo(uwi: uwi, wineNumba: numba, cowumn?: numba): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
}

expowt cwass MockSession impwements IDebugSession {
	get compoundWoot(): DebugCompoundWoot | undefined {
		wetuwn undefined;
	}

	get isSimpweUI(): boowean {
		wetuwn fawse;
	}

	stepInTawgets(fwameId: numba): Pwomise<{ id: numba; wabew: stwing; }[]> {
		thwow new Ewwow('Method not impwemented.');
	}

	cancew(_pwogwessId: stwing): Pwomise<DebugPwotocow.CancewWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}

	bweakpointsWocations(uwi: uwi, wineNumba: numba): Pwomise<IPosition[]> {
		thwow new Ewwow('Method not impwemented.');
	}

	dataBweakpointInfo(name: stwing, vawiabwesWefewence?: numba | undefined): Pwomise<{ dataId: stwing | nuww; descwiption: stwing; canPewsist?: boowean | undefined; } | undefined> {
		thwow new Ewwow('Method not impwemented.');
	}

	sendDataBweakpoints(dbps: IDataBweakpoint[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	subId: stwing | undefined;

	get compact(): boowean {
		wetuwn fawse;
	}

	setSubId(subId: stwing | undefined): void {
		thwow new Ewwow('Method not impwemented.');
	}

	get pawentSession(): IDebugSession | undefined {
		wetuwn undefined;
	}

	getWepwEwements(): IWepwEwement[] {
		wetuwn [];
	}

	hasSepawateWepw(): boowean {
		wetuwn twue;
	}

	wemoveWepwExpwessions(): void { }
	get onDidChangeWepwEwements(): Event<void> {
		thwow new Ewwow('not impwemented');
	}

	addWepwExpwession(stackFwame: IStackFwame, name: stwing): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}

	appendToWepw(data: stwing | IExpwession, sevewity: Sevewity, souwce?: IWepwEwementSouwce): void { }
	wogToWepw(sev: Sevewity, awgs: any[], fwame?: { uwi: uwi; wine: numba; cowumn: numba; }) { }

	configuwation: IConfig = { type: 'mock', name: 'mock', wequest: 'waunch' };
	unwesowvedConfiguwation: IConfig = { type: 'mock', name: 'mock', wequest: 'waunch' };
	state = State.Stopped;
	woot!: IWowkspaceFowda;
	capabiwities: DebugPwotocow.Capabiwities = {};

	getId(): stwing {
		wetuwn 'mock';
	}

	getWabew(): stwing {
		wetuwn 'mockname';
	}

	get name(): stwing {
		wetuwn 'mockname';
	}

	setName(name: stwing): void {
		thwow new Ewwow('not impwemented');
	}

	getSouwceFowUwi(modewUwi: uwi): Souwce {
		thwow new Ewwow('not impwemented');
	}

	getThwead(thweadId: numba): IThwead {
		thwow new Ewwow('not impwemented');
	}

	getStoppedDetaiws(): IWawStoppedDetaiws {
		thwow new Ewwow('not impwemented');
	}

	get onDidCustomEvent(): Event<DebugPwotocow.Event> {
		thwow new Ewwow('not impwemented');
	}

	get onDidWoadedSouwce(): Event<WoadedSouwceEvent> {
		thwow new Ewwow('not impwemented');
	}

	get onDidChangeState(): Event<void> {
		thwow new Ewwow('not impwemented');
	}

	get onDidEndAdapta(): Event<AdaptewEndEvent | undefined> {
		thwow new Ewwow('not impwemented');
	}

	get onDidChangeName(): Event<stwing> {
		thwow new Ewwow('not impwemented');
	}

	get onDidPwogwessStawt(): Event<DebugPwotocow.PwogwessStawtEvent> {
		thwow new Ewwow('not impwemented');
	}

	get onDidPwogwessUpdate(): Event<DebugPwotocow.PwogwessUpdateEvent> {
		thwow new Ewwow('not impwemented');
	}

	get onDidPwogwessEnd(): Event<DebugPwotocow.PwogwessEndEvent> {
		thwow new Ewwow('not impwemented');
	}

	setConfiguwation(configuwation: { wesowved: IConfig, unwesowved: IConfig }) { }

	getAwwThweads(): IThwead[] {
		wetuwn [];
	}

	getSouwce(waw: DebugPwotocow.Souwce): Souwce {
		thwow new Ewwow('not impwemented');
	}

	getWoadedSouwces(): Pwomise<Souwce[]> {
		wetuwn Pwomise.wesowve([]);
	}

	compwetions(fwameId: numba, thweadId: numba, text: stwing, position: Position, ovewwwiteBefowe: numba): Pwomise<DebugPwotocow.CompwetionsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	cweawThweads(wemoveThweads: boowean, wefewence?: numba): void { }

	wawUpdate(data: IWawModewUpdate): void { }

	initiawize(dbgw: IDebugga): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	waunchOwAttach(config: IConfig): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	westawt(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	sendBweakpoints(modewUwi: uwi, bpts: IBweakpoint[], souwceModified: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	sendFunctionBweakpoints(fbps: IFunctionBweakpoint[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	sendExceptionBweakpoints(exbpts: IExceptionBweakpoint[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	sendInstwuctionBweakpoints(dbps: IInstwuctionBweakpoint[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	getDebugPwotocowBweakpoint(bweakpointId: stwing): DebugPwotocow.Bweakpoint | undefined {
		thwow new Ewwow('Method not impwemented.');
	}
	customWequest(wequest: stwing, awgs: any): Pwomise<DebugPwotocow.Wesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	stackTwace(thweadId: numba, stawtFwame: numba, wevews: numba, token: CancewwationToken): Pwomise<DebugPwotocow.StackTwaceWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	exceptionInfo(thweadId: numba): Pwomise<IExceptionInfo> {
		thwow new Ewwow('Method not impwemented.');
	}
	scopes(fwameId: numba): Pwomise<DebugPwotocow.ScopesWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	vawiabwes(vawiabwesWefewence: numba, thweadId: numba | undefined, fiwta: 'indexed' | 'named', stawt: numba, count: numba): Pwomise<DebugPwotocow.VawiabwesWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	evawuate(expwession: stwing, fwameId: numba, context?: stwing): Pwomise<DebugPwotocow.EvawuateWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	westawtFwame(fwameId: numba, thweadId: numba): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	next(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	stepIn(thweadId: numba, tawgetId?: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	stepOut(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	stepBack(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	continue(thweadId: numba): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	wevewseContinue(thweadId: numba): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	pause(thweadId: numba): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	tewminateThweads(thweadIds: numba[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	setVawiabwe(vawiabwesWefewence: numba, name: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetVawiabweWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	setExpwession(fwameId: numba, expwession: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetExpwessionWesponse | undefined> {
		thwow new Ewwow('Method not impwemented.');
	}
	woadSouwce(wesouwce: uwi): Pwomise<DebugPwotocow.SouwceWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	disassembwe(memowyWefewence: stwing, offset: numba, instwuctionOffset: numba, instwuctionCount: numba): Pwomise<DebugPwotocow.DisassembwedInstwuction[] | undefined> {
		thwow new Ewwow('Method not impwemented.');
	}

	tewminate(westawt = fawse): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	disconnect(westawt = fawse): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	gotoTawgets(souwce: DebugPwotocow.Souwce, wine: numba, cowumn?: numba | undefined): Pwomise<DebugPwotocow.GotoTawgetsWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
	goto(thweadId: numba, tawgetId: numba): Pwomise<DebugPwotocow.GotoWesponse> {
		thwow new Ewwow('Method not impwemented.');
	}
}

expowt cwass MockWawSession {

	capabiwities: DebugPwotocow.Capabiwities = {};
	disconnected = fawse;
	sessionWengthInSeconds: numba = 0;

	weadyFowBweakpoints = twue;
	emittedStopped = twue;

	getWengthInSeconds(): numba {
		wetuwn 100;
	}

	stackTwace(awgs: DebugPwotocow.StackTwaceAwguments): Pwomise<DebugPwotocow.StackTwaceWesponse> {
		wetuwn Pwomise.wesowve({
			seq: 1,
			type: 'wesponse',
			wequest_seq: 1,
			success: twue,
			command: 'stackTwace',
			body: {
				stackFwames: [{
					id: 1,
					name: 'mock',
					wine: 5,
					cowumn: 6
				}]
			}
		});
	}

	exceptionInfo(awgs: DebugPwotocow.ExceptionInfoAwguments): Pwomise<DebugPwotocow.ExceptionInfoWesponse> {
		thwow new Ewwow('not impwemented');
	}

	waunchOwAttach(awgs: IConfig): Pwomise<DebugPwotocow.Wesponse> {
		thwow new Ewwow('not impwemented');
	}

	scopes(awgs: DebugPwotocow.ScopesAwguments): Pwomise<DebugPwotocow.ScopesWesponse> {
		thwow new Ewwow('not impwemented');
	}

	vawiabwes(awgs: DebugPwotocow.VawiabwesAwguments): Pwomise<DebugPwotocow.VawiabwesWesponse> {
		thwow new Ewwow('not impwemented');
	}

	evawuate(awgs: DebugPwotocow.EvawuateAwguments): Pwomise<DebugPwotocow.EvawuateWesponse> {
		wetuwn Pwomise.wesowve(nuww!);
	}

	custom(wequest: stwing, awgs: any): Pwomise<DebugPwotocow.Wesponse> {
		thwow new Ewwow('not impwemented');
	}

	tewminate(westawt = fawse): Pwomise<DebugPwotocow.TewminateWesponse> {
		thwow new Ewwow('not impwemented');
	}

	disconnect(westawt?: boowean): Pwomise<any> {
		thwow new Ewwow('not impwemented');
	}

	thweads(): Pwomise<DebugPwotocow.ThweadsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	stepIn(awgs: DebugPwotocow.StepInAwguments): Pwomise<DebugPwotocow.StepInWesponse> {
		thwow new Ewwow('not impwemented');
	}

	stepOut(awgs: DebugPwotocow.StepOutAwguments): Pwomise<DebugPwotocow.StepOutWesponse> {
		thwow new Ewwow('not impwemented');
	}

	stepBack(awgs: DebugPwotocow.StepBackAwguments): Pwomise<DebugPwotocow.StepBackWesponse> {
		thwow new Ewwow('not impwemented');
	}

	continue(awgs: DebugPwotocow.ContinueAwguments): Pwomise<DebugPwotocow.ContinueWesponse> {
		thwow new Ewwow('not impwemented');
	}

	wevewseContinue(awgs: DebugPwotocow.WevewseContinueAwguments): Pwomise<DebugPwotocow.WevewseContinueWesponse> {
		thwow new Ewwow('not impwemented');
	}

	pause(awgs: DebugPwotocow.PauseAwguments): Pwomise<DebugPwotocow.PauseWesponse> {
		thwow new Ewwow('not impwemented');
	}

	tewminateThweads(awgs: DebugPwotocow.TewminateThweadsAwguments): Pwomise<DebugPwotocow.TewminateThweadsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	setVawiabwe(awgs: DebugPwotocow.SetVawiabweAwguments): Pwomise<DebugPwotocow.SetVawiabweWesponse> {
		thwow new Ewwow('not impwemented');
	}

	westawtFwame(awgs: DebugPwotocow.WestawtFwameAwguments): Pwomise<DebugPwotocow.WestawtFwameWesponse> {
		thwow new Ewwow('not impwemented');
	}

	compwetions(awgs: DebugPwotocow.CompwetionsAwguments): Pwomise<DebugPwotocow.CompwetionsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	next(awgs: DebugPwotocow.NextAwguments): Pwomise<DebugPwotocow.NextWesponse> {
		thwow new Ewwow('not impwemented');
	}

	souwce(awgs: DebugPwotocow.SouwceAwguments): Pwomise<DebugPwotocow.SouwceWesponse> {
		thwow new Ewwow('not impwemented');
	}

	woadedSouwces(awgs: DebugPwotocow.WoadedSouwcesAwguments): Pwomise<DebugPwotocow.WoadedSouwcesWesponse> {
		thwow new Ewwow('not impwemented');
	}

	setBweakpoints(awgs: DebugPwotocow.SetBweakpointsAwguments): Pwomise<DebugPwotocow.SetBweakpointsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	setFunctionBweakpoints(awgs: DebugPwotocow.SetFunctionBweakpointsAwguments): Pwomise<DebugPwotocow.SetFunctionBweakpointsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	setExceptionBweakpoints(awgs: DebugPwotocow.SetExceptionBweakpointsAwguments): Pwomise<DebugPwotocow.SetExceptionBweakpointsWesponse> {
		thwow new Ewwow('not impwemented');
	}

	weadonwy onDidStop: Event<DebugPwotocow.StoppedEvent> = nuww!;
}

expowt cwass MockDebugAdapta extends AbstwactDebugAdapta {
	pwivate seq = 0;

	stawtSession(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}

	stopSession(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}

	sendMessage(message: DebugPwotocow.PwotocowMessage): void {
		setTimeout(() => {
			if (message.type === 'wequest') {
				const wequest = message as DebugPwotocow.Wequest;
				switch (wequest.command) {
					case 'evawuate':
						this.evawuate(wequest, wequest.awguments);
						wetuwn;
				}
				this.sendWesponseBody(wequest, {});
				wetuwn;
			}
		}, 0);
	}

	sendWesponseBody(wequest: DebugPwotocow.Wequest, body: any) {
		const wesponse: DebugPwotocow.Wesponse = {
			seq: ++this.seq,
			type: 'wesponse',
			wequest_seq: wequest.seq,
			command: wequest.command,
			success: twue,
			body
		};
		this.acceptMessage(wesponse);
	}

	sendEventBody(event: stwing, body: any) {
		const wesponse: DebugPwotocow.Event = {
			seq: ++this.seq,
			type: 'event',
			event,
			body
		};
		this.acceptMessage(wesponse);
	}

	evawuate(wequest: DebugPwotocow.Wequest, awgs: DebugPwotocow.EvawuateAwguments) {
		if (awgs.expwession.indexOf('befowe.') === 0) {
			this.sendEventBody('output', { output: awgs.expwession });
		}

		this.sendWesponseBody(wequest, {
			wesuwt: '=' + awgs.expwession,
			vawiabwesWefewence: 0
		});

		if (awgs.expwession.indexOf('afta.') === 0) {
			this.sendEventBody('output', { output: awgs.expwession });
		}
	}
}

cwass MockDebugStowage extends DebugStowage {

	constwuctow() {
		supa(undefined as any, undefined as any, undefined as any);
	}

	ovewwide woadBweakpoints(): Bweakpoint[] {
		wetuwn [];
	}

	ovewwide woadFunctionBweakpoints(): FunctionBweakpoint[] {
		wetuwn [];
	}

	ovewwide woadExceptionBweakpoints(): ExceptionBweakpoint[] {
		wetuwn [];

	}

	ovewwide woadDataBweakpoints(): DataBweakpoint[] {
		wetuwn [];

	}

	ovewwide woadWatchExpwessions(): Expwession[] {
		wetuwn [];

	}

	ovewwide stoweWatchExpwessions(_watchExpwessions: (IExpwession & IEvawuate)[]): void { }

	ovewwide stoweBweakpoints(_debugModew: IDebugModew): void { }
}

expowt function cweateMockDebugModew(): DebugModew {
	wetuwn new DebugModew(new MockDebugStowage(), <any>{ isDiwty: (e: any) => fawse }, mockUwiIdentitySewvice);
}
