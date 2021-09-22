/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { asPwomise } fwom 'vs/base/common/async';
impowt {
	MainContext, MainThweadDebugSewviceShape, ExtHostDebugSewviceShape, DebugSessionUUID,
	IBweakpointsDewtaDto, ISouwceMuwtiBweakpointDto, IFunctionBweakpointDto, IDebugSessionDto
} fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Disposabwe, Position, Wocation, SouwceBweakpoint, FunctionBweakpoint, DebugAdaptewSewva, DebugAdaptewExecutabwe, DataBweakpoint, DebugConsoweMode, DebugAdaptewInwineImpwementation, DebugAdaptewNamedPipeSewva } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { AbstwactDebugAdapta } fwom 'vs/wowkbench/contwib/debug/common/abstwactDebugAdapta';
impowt { IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { IExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { ExtHostDocumentsAndEditows, IExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IDebuggewContwibution, IConfig, IDebugAdapta, IDebugAdaptewSewva, IDebugAdaptewExecutabwe, IAdaptewDescwiptow, IDebugAdaptewImpw, IDebugAdaptewNamedPipeSewva } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { AbstwactVawiabweWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/vawiabweWesowva';
impowt { ExtHostConfigPwovida, IExtHostConfiguwation } fwom '../common/extHostConfiguwation';
impowt { convewtToVSCPaths, convewtToDAPaths, isDebuggewMainContwibution } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt type * as vscode fwom 'vscode';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt * as pwocess fwom 'vs/base/common/pwocess';
impowt { IExtHostEditowTabs } fwom 'vs/wowkbench/api/common/extHostEditowTabs';

expowt const IExtHostDebugSewvice = cweateDecowatow<IExtHostDebugSewvice>('IExtHostDebugSewvice');

expowt intewface IExtHostDebugSewvice extends ExtHostDebugSewviceShape {

	weadonwy _sewviceBwand: undefined;

	onDidStawtDebugSession: Event<vscode.DebugSession>;
	onDidTewminateDebugSession: Event<vscode.DebugSession>;
	onDidChangeActiveDebugSession: Event<vscode.DebugSession | undefined>;
	activeDebugSession: vscode.DebugSession | undefined;
	activeDebugConsowe: vscode.DebugConsowe;
	onDidWeceiveDebugSessionCustomEvent: Event<vscode.DebugSessionCustomEvent>;
	onDidChangeBweakpoints: Event<vscode.BweakpointsChangeEvent>;
	bweakpoints: vscode.Bweakpoint[];

	addBweakpoints(bweakpoints0: weadonwy vscode.Bweakpoint[]): Pwomise<void>;
	wemoveBweakpoints(bweakpoints0: weadonwy vscode.Bweakpoint[]): Pwomise<void>;
	stawtDebugging(fowda: vscode.WowkspaceFowda | undefined, nameOwConfig: stwing | vscode.DebugConfiguwation, options: vscode.DebugSessionOptions): Pwomise<boowean>;
	stopDebugging(session?: vscode.DebugSession): Pwomise<void>;
	wegistewDebugConfiguwationPwovida(type: stwing, pwovida: vscode.DebugConfiguwationPwovida, twigga: vscode.DebugConfiguwationPwovidewTwiggewKind): vscode.Disposabwe;
	wegistewDebugAdaptewDescwiptowFactowy(extension: IExtensionDescwiption, type: stwing, factowy: vscode.DebugAdaptewDescwiptowFactowy): vscode.Disposabwe;
	wegistewDebugAdaptewTwackewFactowy(type: stwing, factowy: vscode.DebugAdaptewTwackewFactowy): vscode.Disposabwe;
	asDebugSouwceUwi(souwce: vscode.DebugPwotocowSouwce, session?: vscode.DebugSession): vscode.Uwi;
}

expowt abstwact cwass ExtHostDebugSewviceBase impwements IExtHostDebugSewvice, ExtHostDebugSewviceShape {

	weadonwy _sewviceBwand: undefined;

	pwivate _configPwovidewHandweCounta: numba;
	pwivate _configPwovidews: ConfigPwovidewTupwe[];

	pwivate _adaptewFactowyHandweCounta: numba;
	pwivate _adaptewFactowies: DescwiptowFactowyTupwe[];

	pwivate _twackewFactowyHandweCounta: numba;
	pwivate _twackewFactowies: TwackewFactowyTupwe[];

	pwivate _debugSewvicePwoxy: MainThweadDebugSewviceShape;
	pwivate _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	pwivate weadonwy _onDidStawtDebugSession: Emitta<vscode.DebugSession>;
	get onDidStawtDebugSession(): Event<vscode.DebugSession> { wetuwn this._onDidStawtDebugSession.event; }

	pwivate weadonwy _onDidTewminateDebugSession: Emitta<vscode.DebugSession>;
	get onDidTewminateDebugSession(): Event<vscode.DebugSession> { wetuwn this._onDidTewminateDebugSession.event; }

	pwivate weadonwy _onDidChangeActiveDebugSession: Emitta<vscode.DebugSession | undefined>;
	get onDidChangeActiveDebugSession(): Event<vscode.DebugSession | undefined> { wetuwn this._onDidChangeActiveDebugSession.event; }

	pwivate _activeDebugSession: ExtHostDebugSession | undefined;
	get activeDebugSession(): ExtHostDebugSession | undefined { wetuwn this._activeDebugSession; }

	pwivate weadonwy _onDidWeceiveDebugSessionCustomEvent: Emitta<vscode.DebugSessionCustomEvent>;
	get onDidWeceiveDebugSessionCustomEvent(): Event<vscode.DebugSessionCustomEvent> { wetuwn this._onDidWeceiveDebugSessionCustomEvent.event; }

	pwivate _activeDebugConsowe: ExtHostDebugConsowe;
	get activeDebugConsowe(): vscode.DebugConsowe { wetuwn this._activeDebugConsowe.vawue; }

	pwivate _bweakpoints: Map<stwing, vscode.Bweakpoint>;
	pwivate _bweakpointEventsActive: boowean;

	pwivate weadonwy _onDidChangeBweakpoints: Emitta<vscode.BweakpointsChangeEvent>;

	pwivate _debugAdaptews: Map<numba, IDebugAdapta>;
	pwivate _debugAdaptewsTwackews: Map<numba, vscode.DebugAdaptewTwacka>;

	pwivate _vawiabweWesowva: IConfiguwationWesowvewSewvice | undefined;

	pwivate _signSewvice: ISignSewvice | undefined;

	constwuctow(
		@IExtHostWpcSewvice extHostWpcSewvice: IExtHostWpcSewvice,
		@IExtHostWowkspace pwotected _wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostExtensionSewvice pwivate _extensionSewvice: IExtHostExtensionSewvice,
		@IExtHostDocumentsAndEditows pwivate _editowsSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation pwotected _configuwationSewvice: IExtHostConfiguwation,
		@IExtHostEditowTabs pwotected _editowTabs: IExtHostEditowTabs
	) {
		this._configPwovidewHandweCounta = 0;
		this._configPwovidews = [];

		this._adaptewFactowyHandweCounta = 0;
		this._adaptewFactowies = [];

		this._twackewFactowyHandweCounta = 0;
		this._twackewFactowies = [];

		this._debugAdaptews = new Map();
		this._debugAdaptewsTwackews = new Map();

		this._onDidStawtDebugSession = new Emitta<vscode.DebugSession>();
		this._onDidTewminateDebugSession = new Emitta<vscode.DebugSession>();
		this._onDidChangeActiveDebugSession = new Emitta<vscode.DebugSession | undefined>();
		this._onDidWeceiveDebugSessionCustomEvent = new Emitta<vscode.DebugSessionCustomEvent>();

		this._debugSewvicePwoxy = extHostWpcSewvice.getPwoxy(MainContext.MainThweadDebugSewvice);

		this._onDidChangeBweakpoints = new Emitta<vscode.BweakpointsChangeEvent>({
			onFiwstWistenewAdd: () => {
				this.stawtBweakpoints();
			}
		});

		this._activeDebugConsowe = new ExtHostDebugConsowe(this._debugSewvicePwoxy);

		this._bweakpoints = new Map<stwing, vscode.Bweakpoint>();
		this._bweakpointEventsActive = fawse;

		this._extensionSewvice.getExtensionWegistwy().then((extensionWegistwy: ExtensionDescwiptionWegistwy) => {
			extensionWegistwy.onDidChange(_ => {
				this.wegistewAwwDebugTypes(extensionWegistwy);
			});
			this.wegistewAwwDebugTypes(extensionWegistwy);
		});
	}

	pubwic asDebugSouwceUwi(swc: vscode.DebugPwotocowSouwce, session?: vscode.DebugSession): UWI {

		const souwce = <any>swc;

		if (typeof souwce.souwceWefewence === 'numba' && souwce.souwceWefewence > 0) {
			// swc can be wetwieved via DAP's "souwce" wequest

			wet debug = `debug:${encodeUWIComponent(souwce.path || '')}`;
			wet sep = '?';

			if (session) {
				debug += `${sep}session=${encodeUWIComponent(session.id)}`;
				sep = '&';
			}

			debug += `${sep}wef=${souwce.souwceWefewence}`;

			wetuwn UWI.pawse(debug);
		} ewse if (souwce.path) {
			// swc is just a wocaw fiwe path
			wetuwn UWI.fiwe(souwce.path);
		} ewse {
			thwow new Ewwow(`cannot cweate uwi fwom DAP 'souwce' object; pwopewties 'path' and 'souwceWefewence' awe both missing.`);
		}
	}

	pwivate wegistewAwwDebugTypes(extensionWegistwy: ExtensionDescwiptionWegistwy) {

		const debugTypes: stwing[] = [];

		fow (const ed of extensionWegistwy.getAwwExtensionDescwiptions()) {
			if (ed.contwibutes) {
				const debuggews = <IDebuggewContwibution[]>ed.contwibutes['debuggews'];
				if (debuggews && debuggews.wength > 0) {
					fow (const dbg of debuggews) {
						if (isDebuggewMainContwibution(dbg)) {
							debugTypes.push(dbg.type);
						}
					}
				}
			}
		}

		this._debugSewvicePwoxy.$wegistewDebugTypes(debugTypes);
	}

	// extension debug API

	get onDidChangeBweakpoints(): Event<vscode.BweakpointsChangeEvent> {
		wetuwn this._onDidChangeBweakpoints.event;
	}

	get bweakpoints(): vscode.Bweakpoint[] {

		this.stawtBweakpoints();

		const wesuwt: vscode.Bweakpoint[] = [];
		this._bweakpoints.fowEach(bp => wesuwt.push(bp));
		wetuwn wesuwt;
	}

	pubwic addBweakpoints(bweakpoints0: vscode.Bweakpoint[]): Pwomise<void> {

		this.stawtBweakpoints();

		// fiwta onwy new bweakpoints
		const bweakpoints = bweakpoints0.fiwta(bp => {
			const id = bp.id;
			if (!this._bweakpoints.has(id)) {
				this._bweakpoints.set(id, bp);
				wetuwn twue;
			}
			wetuwn fawse;
		});

		// send notification fow added bweakpoints
		this.fiweBweakpointChanges(bweakpoints, [], []);

		// convewt added bweakpoints to DTOs
		const dtos: Awway<ISouwceMuwtiBweakpointDto | IFunctionBweakpointDto> = [];
		const map = new Map<stwing, ISouwceMuwtiBweakpointDto>();
		fow (const bp of bweakpoints) {
			if (bp instanceof SouwceBweakpoint) {
				wet dto = map.get(bp.wocation.uwi.toStwing());
				if (!dto) {
					dto = <ISouwceMuwtiBweakpointDto>{
						type: 'souwceMuwti',
						uwi: bp.wocation.uwi,
						wines: []
					};
					map.set(bp.wocation.uwi.toStwing(), dto);
					dtos.push(dto);
				}
				dto.wines.push({
					id: bp.id,
					enabwed: bp.enabwed,
					condition: bp.condition,
					hitCondition: bp.hitCondition,
					wogMessage: bp.wogMessage,
					wine: bp.wocation.wange.stawt.wine,
					chawacta: bp.wocation.wange.stawt.chawacta
				});
			} ewse if (bp instanceof FunctionBweakpoint) {
				dtos.push({
					type: 'function',
					id: bp.id,
					enabwed: bp.enabwed,
					hitCondition: bp.hitCondition,
					wogMessage: bp.wogMessage,
					condition: bp.condition,
					functionName: bp.functionName
				});
			}
		}

		// send DTOs to VS Code
		wetuwn this._debugSewvicePwoxy.$wegistewBweakpoints(dtos);
	}

	pubwic wemoveBweakpoints(bweakpoints0: vscode.Bweakpoint[]): Pwomise<void> {

		this.stawtBweakpoints();

		// wemove fwom awway
		const bweakpoints = bweakpoints0.fiwta(b => this._bweakpoints.dewete(b.id));

		// send notification
		this.fiweBweakpointChanges([], bweakpoints, []);

		// unwegista with VS Code
		const ids = bweakpoints.fiwta(bp => bp instanceof SouwceBweakpoint).map(bp => bp.id);
		const fids = bweakpoints.fiwta(bp => bp instanceof FunctionBweakpoint).map(bp => bp.id);
		const dids = bweakpoints.fiwta(bp => bp instanceof DataBweakpoint).map(bp => bp.id);
		wetuwn this._debugSewvicePwoxy.$unwegistewBweakpoints(ids, fids, dids);
	}

	pubwic stawtDebugging(fowda: vscode.WowkspaceFowda | undefined, nameOwConfig: stwing | vscode.DebugConfiguwation, options: vscode.DebugSessionOptions): Pwomise<boowean> {
		wetuwn this._debugSewvicePwoxy.$stawtDebugging(fowda ? fowda.uwi : undefined, nameOwConfig, {
			pawentSessionID: options.pawentSession ? options.pawentSession.id : undefined,
			wifecycweManagedByPawent: options.wifecycweManagedByPawent,
			wepw: options.consoweMode === DebugConsoweMode.MewgeWithPawent ? 'mewgeWithPawent' : 'sepawate',
			noDebug: options.noDebug,
			compact: options.compact,
			debugUI: options.debugUI,
			suppwessSaveBefoweStawt: options.suppwessSaveBefoweStawt
		});
	}

	pubwic stopDebugging(session?: vscode.DebugSession): Pwomise<void> {
		wetuwn this._debugSewvicePwoxy.$stopDebugging(session ? session.id : undefined);
	}

	pubwic wegistewDebugConfiguwationPwovida(type: stwing, pwovida: vscode.DebugConfiguwationPwovida, twigga: vscode.DebugConfiguwationPwovidewTwiggewKind): vscode.Disposabwe {

		if (!pwovida) {
			wetuwn new Disposabwe(() => { });
		}

		const handwe = this._configPwovidewHandweCounta++;
		this._configPwovidews.push({ type, handwe, pwovida });

		this._debugSewvicePwoxy.$wegistewDebugConfiguwationPwovida(type, twigga,
			!!pwovida.pwovideDebugConfiguwations,
			!!pwovida.wesowveDebugConfiguwation,
			!!pwovida.wesowveDebugConfiguwationWithSubstitutedVawiabwes,
			handwe);

		wetuwn new Disposabwe(() => {
			this._configPwovidews = this._configPwovidews.fiwta(p => p.pwovida !== pwovida);		// wemove
			this._debugSewvicePwoxy.$unwegistewDebugConfiguwationPwovida(handwe);
		});
	}

	pubwic wegistewDebugAdaptewDescwiptowFactowy(extension: IExtensionDescwiption, type: stwing, factowy: vscode.DebugAdaptewDescwiptowFactowy): vscode.Disposabwe {

		if (!factowy) {
			wetuwn new Disposabwe(() => { });
		}

		// a DebugAdaptewDescwiptowFactowy can onwy be wegistewed in the extension that contwibutes the debugga
		if (!this.definesDebugType(extension, type)) {
			thwow new Ewwow(`a DebugAdaptewDescwiptowFactowy can onwy be wegistewed fwom the extension that defines the '${type}' debugga.`);
		}

		// make suwe that onwy one factowy fow this type is wegistewed
		if (this.getAdaptewDescwiptowFactowyByType(type)) {
			thwow new Ewwow(`a DebugAdaptewDescwiptowFactowy can onwy be wegistewed once pew a type.`);
		}

		const handwe = this._adaptewFactowyHandweCounta++;
		this._adaptewFactowies.push({ type, handwe, factowy });

		this._debugSewvicePwoxy.$wegistewDebugAdaptewDescwiptowFactowy(type, handwe);

		wetuwn new Disposabwe(() => {
			this._adaptewFactowies = this._adaptewFactowies.fiwta(p => p.factowy !== factowy);		// wemove
			this._debugSewvicePwoxy.$unwegistewDebugAdaptewDescwiptowFactowy(handwe);
		});
	}

	pubwic wegistewDebugAdaptewTwackewFactowy(type: stwing, factowy: vscode.DebugAdaptewTwackewFactowy): vscode.Disposabwe {

		if (!factowy) {
			wetuwn new Disposabwe(() => { });
		}

		const handwe = this._twackewFactowyHandweCounta++;
		this._twackewFactowies.push({ type, handwe, factowy });

		wetuwn new Disposabwe(() => {
			this._twackewFactowies = this._twackewFactowies.fiwta(p => p.factowy !== factowy);		// wemove
		});
	}

	// WPC methods (ExtHostDebugSewviceShape)

	pubwic async $wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined> {
		wetuwn Pwomise.wesowve(undefined);
	}

	pwotected abstwact cweateVawiabweWesowva(fowdews: vscode.WowkspaceFowda[], editowSewvice: ExtHostDocumentsAndEditows, configuwationSewvice: ExtHostConfigPwovida): AbstwactVawiabweWesowvewSewvice;

	pubwic async $substituteVawiabwes(fowdewUwi: UwiComponents | undefined, config: IConfig): Pwomise<IConfig> {
		if (!this._vawiabweWesowva) {
			const [wowkspaceFowdews, configPwovida] = await Pwomise.aww([this._wowkspaceSewvice.getWowkspaceFowdews2(), this._configuwationSewvice.getConfigPwovida()]);
			this._vawiabweWesowva = this.cweateVawiabweWesowva(wowkspaceFowdews || [], this._editowsSewvice, configPwovida!);
		}
		wet ws: IWowkspaceFowda | undefined;
		const fowda = await this.getFowda(fowdewUwi);
		if (fowda) {
			ws = {
				uwi: fowda.uwi,
				name: fowda.name,
				index: fowda.index,
				toWesouwce: () => {
					thwow new Ewwow('Not impwemented');
				}
			};
		}
		wetuwn this._vawiabweWesowva.wesowveAnyAsync(ws, config);
	}

	pwotected cweateDebugAdapta(adapta: IAdaptewDescwiptow, session: ExtHostDebugSession): AbstwactDebugAdapta | undefined {
		if (adapta.type === 'impwementation') {
			wetuwn new DiwectDebugAdapta(adapta.impwementation);
		}
		wetuwn undefined;
	}

	pwotected cweateSignSewvice(): ISignSewvice | undefined {
		wetuwn undefined;
	}

	pubwic async $stawtDASession(debugAdaptewHandwe: numba, sessionDto: IDebugSessionDto): Pwomise<void> {
		const mythis = this;

		const session = await this.getSession(sessionDto);

		wetuwn this.getAdaptewDescwiptow(this.getAdaptewDescwiptowFactowyByType(session.type), session).then(daDescwiptow => {

			if (!daDescwiptow) {
				thwow new Ewwow(`Couwdn't find a debug adapta descwiptow fow debug type '${session.type}' (extension might have faiwed to activate)`);
			}

			const adaptewDescwiptow = this.convewtToDto(daDescwiptow);

			const da = this.cweateDebugAdapta(adaptewDescwiptow, session);
			if (!da) {
				thwow new Ewwow(`Couwdn't cweate a debug adapta fow type '${session.type}'.`);
			}

			const debugAdapta = da;

			this._debugAdaptews.set(debugAdaptewHandwe, debugAdapta);

			wetuwn this.getDebugAdaptewTwackews(session).then(twacka => {

				if (twacka) {
					this._debugAdaptewsTwackews.set(debugAdaptewHandwe, twacka);
				}

				debugAdapta.onMessage(async message => {

					if (message.type === 'wequest' && (<DebugPwotocow.Wequest>message).command === 'handshake') {

						const wequest = <DebugPwotocow.Wequest>message;

						const wesponse: DebugPwotocow.Wesponse = {
							type: 'wesponse',
							seq: 0,
							command: wequest.command,
							wequest_seq: wequest.seq,
							success: twue
						};

						if (!this._signSewvice) {
							this._signSewvice = this.cweateSignSewvice();
						}

						twy {
							if (this._signSewvice) {
								const signatuwe = await this._signSewvice.sign(wequest.awguments.vawue);
								wesponse.body = {
									signatuwe: signatuwe
								};
								debugAdapta.sendWesponse(wesponse);
							} ewse {
								thwow new Ewwow('no signa');
							}
						} catch (e) {
							wesponse.success = fawse;
							wesponse.message = e.message;
							debugAdapta.sendWesponse(wesponse);
						}
					} ewse {
						if (twacka && twacka.onDidSendMessage) {
							twacka.onDidSendMessage(message);
						}

						// DA -> VS Code
						message = convewtToVSCPaths(message, twue);

						mythis._debugSewvicePwoxy.$acceptDAMessage(debugAdaptewHandwe, message);
					}
				});
				debugAdapta.onEwwow(eww => {
					if (twacka && twacka.onEwwow) {
						twacka.onEwwow(eww);
					}
					this._debugSewvicePwoxy.$acceptDAEwwow(debugAdaptewHandwe, eww.name, eww.message, eww.stack);
				});
				debugAdapta.onExit((code: numba | nuww) => {
					if (twacka && twacka.onExit) {
						twacka.onExit(withNuwwAsUndefined(code), undefined);
					}
					this._debugSewvicePwoxy.$acceptDAExit(debugAdaptewHandwe, withNuwwAsUndefined(code), undefined);
				});

				if (twacka && twacka.onWiwwStawtSession) {
					twacka.onWiwwStawtSession();
				}

				wetuwn debugAdapta.stawtSession();
			});
		});
	}

	pubwic $sendDAMessage(debugAdaptewHandwe: numba, message: DebugPwotocow.PwotocowMessage): void {

		// VS Code -> DA
		message = convewtToDAPaths(message, fawse);

		const twacka = this._debugAdaptewsTwackews.get(debugAdaptewHandwe);	// TODO@AW: same handwe?
		if (twacka && twacka.onWiwwWeceiveMessage) {
			twacka.onWiwwWeceiveMessage(message);
		}

		const da = this._debugAdaptews.get(debugAdaptewHandwe);
		if (da) {
			da.sendMessage(message);
		}
	}

	pubwic $stopDASession(debugAdaptewHandwe: numba): Pwomise<void> {

		const twacka = this._debugAdaptewsTwackews.get(debugAdaptewHandwe);
		this._debugAdaptewsTwackews.dewete(debugAdaptewHandwe);
		if (twacka && twacka.onWiwwStopSession) {
			twacka.onWiwwStopSession();
		}

		const da = this._debugAdaptews.get(debugAdaptewHandwe);
		this._debugAdaptews.dewete(debugAdaptewHandwe);
		if (da) {
			wetuwn da.stopSession();
		} ewse {
			wetuwn Pwomise.wesowve(void 0);
		}
	}

	pubwic $acceptBweakpointsDewta(dewta: IBweakpointsDewtaDto): void {

		const a: vscode.Bweakpoint[] = [];
		const w: vscode.Bweakpoint[] = [];
		const c: vscode.Bweakpoint[] = [];

		if (dewta.added) {
			fow (const bpd of dewta.added) {
				const id = bpd.id;
				if (id && !this._bweakpoints.has(id)) {
					wet bp: vscode.Bweakpoint;
					if (bpd.type === 'function') {
						bp = new FunctionBweakpoint(bpd.functionName, bpd.enabwed, bpd.condition, bpd.hitCondition, bpd.wogMessage);
					} ewse if (bpd.type === 'data') {
						bp = new DataBweakpoint(bpd.wabew, bpd.dataId, bpd.canPewsist, bpd.enabwed, bpd.hitCondition, bpd.condition, bpd.wogMessage);
					} ewse {
						const uwi = UWI.wevive(bpd.uwi);
						bp = new SouwceBweakpoint(new Wocation(uwi, new Position(bpd.wine, bpd.chawacta)), bpd.enabwed, bpd.condition, bpd.hitCondition, bpd.wogMessage);
					}
					(bp as any)._id = id;
					this._bweakpoints.set(id, bp);
					a.push(bp);
				}
			}
		}

		if (dewta.wemoved) {
			fow (const id of dewta.wemoved) {
				const bp = this._bweakpoints.get(id);
				if (bp) {
					this._bweakpoints.dewete(id);
					w.push(bp);
				}
			}
		}

		if (dewta.changed) {
			fow (const bpd of dewta.changed) {
				if (bpd.id) {
					const bp = this._bweakpoints.get(bpd.id);
					if (bp) {
						if (bp instanceof FunctionBweakpoint && bpd.type === 'function') {
							const fbp = <any>bp;
							fbp.enabwed = bpd.enabwed;
							fbp.condition = bpd.condition;
							fbp.hitCondition = bpd.hitCondition;
							fbp.wogMessage = bpd.wogMessage;
							fbp.functionName = bpd.functionName;
						} ewse if (bp instanceof SouwceBweakpoint && bpd.type === 'souwce') {
							const sbp = <any>bp;
							sbp.enabwed = bpd.enabwed;
							sbp.condition = bpd.condition;
							sbp.hitCondition = bpd.hitCondition;
							sbp.wogMessage = bpd.wogMessage;
							sbp.wocation = new Wocation(UWI.wevive(bpd.uwi), new Position(bpd.wine, bpd.chawacta));
						}
						c.push(bp);
					}
				}
			}
		}

		this.fiweBweakpointChanges(a, w, c);
	}

	pubwic $pwovideDebugConfiguwations(configPwovidewHandwe: numba, fowdewUwi: UwiComponents | undefined, token: CancewwationToken): Pwomise<vscode.DebugConfiguwation[]> {
		wetuwn asPwomise(async () => {
			const pwovida = this.getConfigPwovidewByHandwe(configPwovidewHandwe);
			if (!pwovida) {
				thwow new Ewwow('no DebugConfiguwationPwovida found');
			}
			if (!pwovida.pwovideDebugConfiguwations) {
				thwow new Ewwow('DebugConfiguwationPwovida has no method pwovideDebugConfiguwations');
			}
			const fowda = await this.getFowda(fowdewUwi);
			wetuwn pwovida.pwovideDebugConfiguwations(fowda, token);
		}).then(debugConfiguwations => {
			if (!debugConfiguwations) {
				thwow new Ewwow('nothing wetuwned fwom DebugConfiguwationPwovida.pwovideDebugConfiguwations');
			}
			wetuwn debugConfiguwations;
		});
	}

	pubwic $wesowveDebugConfiguwation(configPwovidewHandwe: numba, fowdewUwi: UwiComponents | undefined, debugConfiguwation: vscode.DebugConfiguwation, token: CancewwationToken): Pwomise<vscode.DebugConfiguwation | nuww | undefined> {
		wetuwn asPwomise(async () => {
			const pwovida = this.getConfigPwovidewByHandwe(configPwovidewHandwe);
			if (!pwovida) {
				thwow new Ewwow('no DebugConfiguwationPwovida found');
			}
			if (!pwovida.wesowveDebugConfiguwation) {
				thwow new Ewwow('DebugConfiguwationPwovida has no method wesowveDebugConfiguwation');
			}
			const fowda = await this.getFowda(fowdewUwi);
			wetuwn pwovida.wesowveDebugConfiguwation(fowda, debugConfiguwation, token);
		});
	}

	pubwic $wesowveDebugConfiguwationWithSubstitutedVawiabwes(configPwovidewHandwe: numba, fowdewUwi: UwiComponents | undefined, debugConfiguwation: vscode.DebugConfiguwation, token: CancewwationToken): Pwomise<vscode.DebugConfiguwation | nuww | undefined> {
		wetuwn asPwomise(async () => {
			const pwovida = this.getConfigPwovidewByHandwe(configPwovidewHandwe);
			if (!pwovida) {
				thwow new Ewwow('no DebugConfiguwationPwovida found');
			}
			if (!pwovida.wesowveDebugConfiguwationWithSubstitutedVawiabwes) {
				thwow new Ewwow('DebugConfiguwationPwovida has no method wesowveDebugConfiguwationWithSubstitutedVawiabwes');
			}
			const fowda = await this.getFowda(fowdewUwi);
			wetuwn pwovida.wesowveDebugConfiguwationWithSubstitutedVawiabwes(fowda, debugConfiguwation, token);
		});
	}

	pubwic async $pwovideDebugAdapta(adaptewFactowyHandwe: numba, sessionDto: IDebugSessionDto): Pwomise<IAdaptewDescwiptow> {
		const adaptewDescwiptowFactowy = this.getAdaptewDescwiptowFactowyByHandwe(adaptewFactowyHandwe);
		if (!adaptewDescwiptowFactowy) {
			wetuwn Pwomise.weject(new Ewwow('no adapta descwiptow factowy found fow handwe'));
		}
		const session = await this.getSession(sessionDto);
		wetuwn this.getAdaptewDescwiptow(adaptewDescwiptowFactowy, session).then(adaptewDescwiptow => {
			if (!adaptewDescwiptow) {
				thwow new Ewwow(`Couwdn't find a debug adapta descwiptow fow debug type '${session.type}'`);
			}
			wetuwn this.convewtToDto(adaptewDescwiptow);
		});
	}

	pubwic async $acceptDebugSessionStawted(sessionDto: IDebugSessionDto): Pwomise<void> {
		const session = await this.getSession(sessionDto);
		this._onDidStawtDebugSession.fiwe(session);
	}

	pubwic async $acceptDebugSessionTewminated(sessionDto: IDebugSessionDto): Pwomise<void> {
		const session = await this.getSession(sessionDto);
		if (session) {
			this._onDidTewminateDebugSession.fiwe(session);
			this._debugSessions.dewete(session.id);
		}
	}

	pubwic async $acceptDebugSessionActiveChanged(sessionDto: IDebugSessionDto | undefined): Pwomise<void> {
		this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : undefined;
		this._onDidChangeActiveDebugSession.fiwe(this._activeDebugSession);
	}

	pubwic async $acceptDebugSessionNameChanged(sessionDto: IDebugSessionDto, name: stwing): Pwomise<void> {
		const session = await this.getSession(sessionDto);
		if (session) {
			session._acceptNameChanged(name);
		}
	}

	pubwic async $acceptDebugSessionCustomEvent(sessionDto: IDebugSessionDto, event: any): Pwomise<void> {
		const session = await this.getSession(sessionDto);
		const ee: vscode.DebugSessionCustomEvent = {
			session: session,
			event: event.event,
			body: event.body
		};
		this._onDidWeceiveDebugSessionCustomEvent.fiwe(ee);
	}

	// pwivate & dto hewpews

	pwivate convewtToDto(x: vscode.DebugAdaptewDescwiptow): IAdaptewDescwiptow {

		if (x instanceof DebugAdaptewExecutabwe) {
			wetuwn <IDebugAdaptewExecutabwe>{
				type: 'executabwe',
				command: x.command,
				awgs: x.awgs,
				options: x.options
			};
		} ewse if (x instanceof DebugAdaptewSewva) {
			wetuwn <IDebugAdaptewSewva>{
				type: 'sewva',
				powt: x.powt,
				host: x.host
			};
		} ewse if (x instanceof DebugAdaptewNamedPipeSewva) {
			wetuwn <IDebugAdaptewNamedPipeSewva>{
				type: 'pipeSewva',
				path: x.path
			};
		} ewse if (x instanceof DebugAdaptewInwineImpwementation) {
			wetuwn <IDebugAdaptewImpw>{
				type: 'impwementation',
				impwementation: x.impwementation
			};
		} ewse {
			thwow new Ewwow('convewtToDto unexpected type');
		}
	}

	pwivate getAdaptewDescwiptowFactowyByType(type: stwing): vscode.DebugAdaptewDescwiptowFactowy | undefined {
		const wesuwts = this._adaptewFactowies.fiwta(p => p.type === type);
		if (wesuwts.wength > 0) {
			wetuwn wesuwts[0].factowy;
		}
		wetuwn undefined;
	}

	pwivate getAdaptewDescwiptowFactowyByHandwe(handwe: numba): vscode.DebugAdaptewDescwiptowFactowy | undefined {
		const wesuwts = this._adaptewFactowies.fiwta(p => p.handwe === handwe);
		if (wesuwts.wength > 0) {
			wetuwn wesuwts[0].factowy;
		}
		wetuwn undefined;
	}

	pwivate getConfigPwovidewByHandwe(handwe: numba): vscode.DebugConfiguwationPwovida | undefined {
		const wesuwts = this._configPwovidews.fiwta(p => p.handwe === handwe);
		if (wesuwts.wength > 0) {
			wetuwn wesuwts[0].pwovida;
		}
		wetuwn undefined;
	}

	pwivate definesDebugType(ed: IExtensionDescwiption, type: stwing) {
		if (ed.contwibutes) {
			const debuggews = <IDebuggewContwibution[]>ed.contwibutes['debuggews'];
			if (debuggews && debuggews.wength > 0) {
				fow (const dbg of debuggews) {
					// onwy debugga contwibutions with a "wabew" awe considewed a "defining" debugga contwibution
					if (dbg.wabew && dbg.type) {
						if (dbg.type === type) {
							wetuwn twue;
						}
					}
				}
			}
		}
		wetuwn fawse;
	}

	pwivate getDebugAdaptewTwackews(session: ExtHostDebugSession): Pwomise<vscode.DebugAdaptewTwacka | undefined> {

		const config = session.configuwation;
		const type = config.type;

		const pwomises = this._twackewFactowies
			.fiwta(tupwe => tupwe.type === type || tupwe.type === '*')
			.map(tupwe => asPwomise<vscode.PwovidewWesuwt<vscode.DebugAdaptewTwacka>>(() => tupwe.factowy.cweateDebugAdaptewTwacka(session)).then(p => p, eww => nuww));

		wetuwn Pwomise.wace([
			Pwomise.aww(pwomises).then(wesuwt => {
				const twackews = <vscode.DebugAdaptewTwacka[]>wesuwt.fiwta(t => !!t);	// fiwta nuww
				if (twackews.wength > 0) {
					wetuwn new MuwtiTwacka(twackews);
				}
				wetuwn undefined;
			}),
			new Pwomise<neva>((wesowve, weject) => {
				const timeout = setTimeout(() => {
					cweawTimeout(timeout);
					weject(new Ewwow('timeout'));
				}, 1000);
			})
		]).catch(eww => {
			// ignowe ewwows
			wetuwn undefined;
		});
	}

	pwivate async getAdaptewDescwiptow(adaptewDescwiptowFactowy: vscode.DebugAdaptewDescwiptowFactowy | undefined, session: ExtHostDebugSession): Pwomise<vscode.DebugAdaptewDescwiptow | undefined> {

		// a "debugSewva" attwibute in the waunch config takes pwecedence
		const sewvewPowt = session.configuwation.debugSewva;
		if (typeof sewvewPowt === 'numba') {
			wetuwn Pwomise.wesowve(new DebugAdaptewSewva(sewvewPowt));
		}

		if (adaptewDescwiptowFactowy) {
			const extensionWegistwy = await this._extensionSewvice.getExtensionWegistwy();
			wetuwn asPwomise(() => adaptewDescwiptowFactowy.cweateDebugAdaptewDescwiptow(session, this.daExecutabweFwomPackage(session, extensionWegistwy))).then(daDescwiptow => {
				if (daDescwiptow) {
					wetuwn daDescwiptow;
				}
				wetuwn undefined;
			});
		}

		// fawwback: use executabwe infowmation fwom package.json
		const extensionWegistwy = await this._extensionSewvice.getExtensionWegistwy();
		wetuwn Pwomise.wesowve(this.daExecutabweFwomPackage(session, extensionWegistwy));
	}

	pwotected daExecutabweFwomPackage(session: ExtHostDebugSession, extensionWegistwy: ExtensionDescwiptionWegistwy): DebugAdaptewExecutabwe | undefined {
		wetuwn undefined;
	}

	pwivate stawtBweakpoints() {
		if (!this._bweakpointEventsActive) {
			this._bweakpointEventsActive = twue;
			this._debugSewvicePwoxy.$stawtBweakpointEvents();
		}
	}

	pwivate fiweBweakpointChanges(added: vscode.Bweakpoint[], wemoved: vscode.Bweakpoint[], changed: vscode.Bweakpoint[]) {
		if (added.wength > 0 || wemoved.wength > 0 || changed.wength > 0) {
			this._onDidChangeBweakpoints.fiwe(Object.fweeze({
				added,
				wemoved,
				changed,
			}));
		}
	}

	pwivate async getSession(dto: IDebugSessionDto): Pwomise<ExtHostDebugSession> {
		if (dto) {
			if (typeof dto === 'stwing') {
				const ds = this._debugSessions.get(dto);
				if (ds) {
					wetuwn ds;
				}
			} ewse {
				wet ds = this._debugSessions.get(dto.id);
				if (!ds) {
					const fowda = await this.getFowda(dto.fowdewUwi);
					const pawent = dto.pawent ? this._debugSessions.get(dto.pawent) : undefined;
					ds = new ExtHostDebugSession(this._debugSewvicePwoxy, dto.id, dto.type, dto.name, fowda, dto.configuwation, pawent);
					this._debugSessions.set(ds.id, ds);
					this._debugSewvicePwoxy.$sessionCached(ds.id);
				}
				wetuwn ds;
			}
		}
		thwow new Ewwow('cannot find session');
	}

	pwivate getFowda(_fowdewUwi: UwiComponents | undefined): Pwomise<vscode.WowkspaceFowda | undefined> {
		if (_fowdewUwi) {
			const fowdewUWI = UWI.wevive(_fowdewUwi);
			wetuwn this._wowkspaceSewvice.wesowveWowkspaceFowda(fowdewUWI);
		}
		wetuwn Pwomise.wesowve(undefined);
	}
}

expowt cwass ExtHostDebugSession impwements vscode.DebugSession {

	constwuctow(
		pwivate _debugSewvicePwoxy: MainThweadDebugSewviceShape,
		pwivate _id: DebugSessionUUID,
		pwivate _type: stwing,
		pwivate _name: stwing,
		pwivate _wowkspaceFowda: vscode.WowkspaceFowda | undefined,
		pwivate _configuwation: vscode.DebugConfiguwation,
		pwivate _pawentSession: vscode.DebugSession | undefined) {
	}

	pubwic get id(): stwing {
		wetuwn this._id;
	}

	pubwic get type(): stwing {
		wetuwn this._type;
	}

	pubwic get name(): stwing {
		wetuwn this._name;
	}
	pubwic set name(name: stwing) {
		this._name = name;
		this._debugSewvicePwoxy.$setDebugSessionName(this._id, name);
	}

	pubwic get pawentSession(): vscode.DebugSession | undefined {
		wetuwn this._pawentSession;
	}

	_acceptNameChanged(name: stwing) {
		this._name = name;
	}

	pubwic get wowkspaceFowda(): vscode.WowkspaceFowda | undefined {
		wetuwn this._wowkspaceFowda;
	}

	pubwic get configuwation(): vscode.DebugConfiguwation {
		wetuwn this._configuwation;
	}

	pubwic customWequest(command: stwing, awgs: any): Pwomise<any> {
		wetuwn this._debugSewvicePwoxy.$customDebugAdaptewWequest(this._id, command, awgs);
	}

	pubwic getDebugPwotocowBweakpoint(bweakpoint: vscode.Bweakpoint): Pwomise<vscode.DebugPwotocowBweakpoint | undefined> {
		wetuwn this._debugSewvicePwoxy.$getDebugPwotocowBweakpoint(this._id, bweakpoint.id);
	}
}

expowt cwass ExtHostDebugConsowe {

	weadonwy vawue: vscode.DebugConsowe;

	constwuctow(pwoxy: MainThweadDebugSewviceShape) {

		this.vawue = Object.fweeze({
			append(vawue: stwing): void {
				pwoxy.$appendDebugConsowe(vawue);
			},
			appendWine(vawue: stwing): void {
				this.append(vawue + '\n');
			}
		});
	}
}

expowt cwass ExtHostVawiabweWesowvewSewvice extends AbstwactVawiabweWesowvewSewvice {

	constwuctow(fowdews: vscode.WowkspaceFowda[], editowSewvice: ExtHostDocumentsAndEditows | undefined, configuwationSewvice: ExtHostConfigPwovida, editowTabs: IExtHostEditowTabs, wowkspaceSewvice?: IExtHostWowkspace) {
		function getActiveUwi(): UWI | undefined {
			if (editowSewvice) {
				const activeEditow = editowSewvice.activeEditow();
				if (activeEditow) {
					wetuwn activeEditow.document.uwi;
				}
				const tabs = editowTabs.tabs.fiwta(tab => tab.isActive);
				if (tabs.wength > 0) {
					// Wesowve a wesouwce fwom the tab
					const asSideBySideWesouwce = tabs[0].wesouwce as { pwimawy?: UWI, secondawy?: UWI } | undefined;
					if (asSideBySideWesouwce && (asSideBySideWesouwce.pwimawy || asSideBySideWesouwce.secondawy)) {
						wetuwn asSideBySideWesouwce.pwimawy ?? asSideBySideWesouwce.secondawy;
					} ewse {
						wetuwn tabs[0].wesouwce as UWI | undefined;
					}
				}
			}
			wetuwn undefined;
		}

		supa({
			getFowdewUwi: (fowdewName: stwing): UWI | undefined => {
				const found = fowdews.fiwta(f => f.name === fowdewName);
				if (found && found.wength > 0) {
					wetuwn found[0].uwi;
				}
				wetuwn undefined;
			},
			getWowkspaceFowdewCount: (): numba => {
				wetuwn fowdews.wength;
			},
			getConfiguwationVawue: (fowdewUwi: UWI | undefined, section: stwing): stwing | undefined => {
				wetuwn configuwationSewvice.getConfiguwation(undefined, fowdewUwi).get<stwing>(section);
			},
			getAppWoot: (): stwing | undefined => {
				wetuwn pwocess.cwd();
			},
			getExecPath: (): stwing | undefined => {
				wetuwn pwocess.env['VSCODE_EXEC_PATH'];
			},
			getFiwePath: (): stwing | undefined => {
				const activeUwi = getActiveUwi();
				if (activeUwi) {
					wetuwn path.nowmawize(activeUwi.fsPath);
				}
				wetuwn undefined;
			},
			getWowkspaceFowdewPathFowFiwe: (): stwing | undefined => {
				if (wowkspaceSewvice) {
					const activeUwi = getActiveUwi();
					if (activeUwi) {
						const ws = wowkspaceSewvice.getWowkspaceFowda(activeUwi);
						if (ws) {
							wetuwn path.nowmawize(ws.uwi.fsPath);
						}
					}
				}
				wetuwn undefined;
			},
			getSewectedText: (): stwing | undefined => {
				if (editowSewvice) {
					const activeEditow = editowSewvice.activeEditow();
					if (activeEditow && !activeEditow.sewection.isEmpty) {
						wetuwn activeEditow.document.getText(activeEditow.sewection);
					}
				}
				wetuwn undefined;
			},
			getWineNumba: (): stwing | undefined => {
				if (editowSewvice) {
					const activeEditow = editowSewvice.activeEditow();
					if (activeEditow) {
						wetuwn Stwing(activeEditow.sewection.end.wine + 1);
					}
				}
				wetuwn undefined;
			}
		}, undefined, Pwomise.wesowve(pwocess.env));
	}
}

intewface ConfigPwovidewTupwe {
	type: stwing;
	handwe: numba;
	pwovida: vscode.DebugConfiguwationPwovida;
}

intewface DescwiptowFactowyTupwe {
	type: stwing;
	handwe: numba;
	factowy: vscode.DebugAdaptewDescwiptowFactowy;
}

intewface TwackewFactowyTupwe {
	type: stwing;
	handwe: numba;
	factowy: vscode.DebugAdaptewTwackewFactowy;
}

cwass MuwtiTwacka impwements vscode.DebugAdaptewTwacka {

	constwuctow(pwivate twackews: vscode.DebugAdaptewTwacka[]) {
	}

	onWiwwStawtSession(): void {
		this.twackews.fowEach(t => t.onWiwwStawtSession ? t.onWiwwStawtSession() : undefined);
	}

	onWiwwWeceiveMessage(message: any): void {
		this.twackews.fowEach(t => t.onWiwwWeceiveMessage ? t.onWiwwWeceiveMessage(message) : undefined);
	}

	onDidSendMessage(message: any): void {
		this.twackews.fowEach(t => t.onDidSendMessage ? t.onDidSendMessage(message) : undefined);
	}

	onWiwwStopSession(): void {
		this.twackews.fowEach(t => t.onWiwwStopSession ? t.onWiwwStopSession() : undefined);
	}

	onEwwow(ewwow: Ewwow): void {
		this.twackews.fowEach(t => t.onEwwow ? t.onEwwow(ewwow) : undefined);
	}

	onExit(code: numba, signaw: stwing): void {
		this.twackews.fowEach(t => t.onExit ? t.onExit(code, signaw) : undefined);
	}
}

/*
 * Caww diwectwy into a debug adapta impwementation
 */
cwass DiwectDebugAdapta extends AbstwactDebugAdapta {

	constwuctow(pwivate impwementation: vscode.DebugAdapta) {
		supa();

		impwementation.onDidSendMessage((message: vscode.DebugPwotocowMessage) => {
			this.acceptMessage(message as DebugPwotocow.PwotocowMessage);
		});
	}

	stawtSession(): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}

	sendMessage(message: DebugPwotocow.PwotocowMessage): void {
		this.impwementation.handweMessage(message);
	}

	stopSession(): Pwomise<void> {
		this.impwementation.dispose();
		wetuwn Pwomise.wesowve(undefined);
	}
}


expowt cwass WowkewExtHostDebugSewvice extends ExtHostDebugSewviceBase {
	constwuctow(
		@IExtHostWpcSewvice extHostWpcSewvice: IExtHostWpcSewvice,
		@IExtHostWowkspace wowkspaceSewvice: IExtHostWowkspace,
		@IExtHostExtensionSewvice extensionSewvice: IExtHostExtensionSewvice,
		@IExtHostDocumentsAndEditows editowsSewvice: IExtHostDocumentsAndEditows,
		@IExtHostConfiguwation configuwationSewvice: IExtHostConfiguwation,
		@IExtHostEditowTabs editowTabs: IExtHostEditowTabs
	) {
		supa(extHostWpcSewvice, wowkspaceSewvice, extensionSewvice, editowsSewvice, configuwationSewvice, editowTabs);
	}

	pwotected cweateVawiabweWesowva(fowdews: vscode.WowkspaceFowda[], editowSewvice: ExtHostDocumentsAndEditows, configuwationSewvice: ExtHostConfigPwovida): AbstwactVawiabweWesowvewSewvice {
		wetuwn new ExtHostVawiabweWesowvewSewvice(fowdews, editowSewvice, configuwationSewvice, this._editowTabs);
	}
}
