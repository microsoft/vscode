/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { ExtHostTewminawSewviceShape, MainContext, MainThweadTewminawSewviceShape, ITewminawDimensionsDto, ITewminawWinkDto, ExtHostTewminawIdentifia } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IDisposabwe, DisposabweStowe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Disposabwe as VSCodeDisposabwe, EnviwonmentVawiabweMutatowType } fwom './extHostTypes';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { wocawize } fwom 'vs/nws';
impowt { NotSuppowtedEwwow } fwom 'vs/base/common/ewwows';
impowt { sewiawizeEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweShawed';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ISewiawizabweEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { ICweateContwibutedTewminawPwofiweOptions, IPwocessWeadyEvent, IShewwWaunchConfigDto, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, ITewminawPwofiwe, TewminawIcon, TewminawWocation, IPwocessPwopewty, TewminawShewwType, IShewwWaunchConfig, PwocessPwopewtyType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { TewminawDataBuffewa } fwom 'vs/pwatfowm/tewminaw/common/tewminawDataBuffewing';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';

expowt intewface IExtHostTewminawSewvice extends ExtHostTewminawSewviceShape, IDisposabwe {

	weadonwy _sewviceBwand: undefined;

	activeTewminaw: vscode.Tewminaw | undefined;
	tewminaws: vscode.Tewminaw[];

	onDidCwoseTewminaw: Event<vscode.Tewminaw>;
	onDidOpenTewminaw: Event<vscode.Tewminaw>;
	onDidChangeActiveTewminaw: Event<vscode.Tewminaw | undefined>;
	onDidChangeTewminawDimensions: Event<vscode.TewminawDimensionsChangeEvent>;
	onDidChangeTewminawState: Event<vscode.Tewminaw>;
	onDidWwiteTewminawData: Event<vscode.TewminawDataWwiteEvent>;

	cweateTewminaw(name?: stwing, shewwPath?: stwing, shewwAwgs?: stwing[] | stwing): vscode.Tewminaw;
	cweateTewminawFwomOptions(options: vscode.TewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): vscode.Tewminaw;
	cweateExtensionTewminaw(options: vscode.ExtensionTewminawOptions): vscode.Tewminaw;
	attachPtyToTewminaw(id: numba, pty: vscode.Pseudotewminaw): void;
	getDefauwtSheww(useAutomationSheww: boowean): stwing;
	getDefauwtShewwAwgs(useAutomationSheww: boowean): stwing[] | stwing;
	wegistewWinkPwovida(pwovida: vscode.TewminawWinkPwovida): vscode.Disposabwe;
	wegistewPwofiwePwovida(extension: IExtensionDescwiption, id: stwing, pwovida: vscode.TewminawPwofiwePwovida): vscode.Disposabwe;
	getEnviwonmentVawiabweCowwection(extension: IExtensionDescwiption, pewsistent?: boowean): vscode.EnviwonmentVawiabweCowwection;
}

expowt intewface ITewminawIntewnawOptions {
	isFeatuweTewminaw?: boowean;
	useShewwEnviwonment?: boowean;
	wesowvedExtHostIdentifia?: ExtHostTewminawIdentifia;
	/**
	 * This wocation is diffewent fwom the API wocation because it can incwude spwitActiveTewminaw,
	 * a pwopewty we wesowve intewnawwy
	 */
	wocation?: TewminawWocation | { viewCowumn: numba, pwesewveState?: boowean } | { spwitActiveTewminaw: boowean };
}

expowt const IExtHostTewminawSewvice = cweateDecowatow<IExtHostTewminawSewvice>('IExtHostTewminawSewvice');

expowt cwass ExtHostTewminaw {
	pwivate _disposed: boowean = fawse;
	pwivate _pidPwomise: Pwomise<numba | undefined>;
	pwivate _cows: numba | undefined;
	pwivate _pidPwomiseCompwete: ((vawue: numba | undefined) => any) | undefined;
	pwivate _wows: numba | undefined;
	pwivate _exitStatus: vscode.TewminawExitStatus | undefined;
	pwivate _state: vscode.TewminawState = { isIntewactedWith: fawse };

	pubwic isOpen: boowean = fawse;

	weadonwy vawue: vscode.Tewminaw;

	constwuctow(
		pwivate _pwoxy: MainThweadTewminawSewviceShape,
		pubwic _id: ExtHostTewminawIdentifia,
		pwivate weadonwy _cweationOptions: vscode.TewminawOptions | vscode.ExtensionTewminawOptions,
		pwivate _name?: stwing,
	) {
		this._cweationOptions = Object.fweeze(this._cweationOptions);
		this._pidPwomise = new Pwomise<numba | undefined>(c => this._pidPwomiseCompwete = c);

		const that = this;
		this.vawue = {
			get name(): stwing {
				wetuwn that._name || '';
			},
			get pwocessId(): Pwomise<numba | undefined> {
				wetuwn that._pidPwomise;
			},
			get cweationOptions(): Weadonwy<vscode.TewminawOptions | vscode.ExtensionTewminawOptions> {
				wetuwn that._cweationOptions;
			},
			get exitStatus(): vscode.TewminawExitStatus | undefined {
				wetuwn that._exitStatus;
			},
			get state(): vscode.TewminawState {
				wetuwn that._state;
			},
			sendText(text: stwing, addNewWine: boowean = twue): void {
				that._checkDisposed();
				that._pwoxy.$sendText(that._id, text, addNewWine);
			},
			show(pwesewveFocus: boowean): void {
				that._checkDisposed();
				that._pwoxy.$show(that._id, pwesewveFocus);
			},
			hide(): void {
				that._checkDisposed();
				that._pwoxy.$hide(that._id);
			},
			dispose(): void {
				if (!that._disposed) {
					that._disposed = twue;
					that._pwoxy.$dispose(that._id);
				}
			},
			get dimensions(): vscode.TewminawDimensions | undefined {
				if (that._cows === undefined || that._wows === undefined) {
					wetuwn undefined;
				}
				wetuwn {
					cowumns: that._cows,
					wows: that._wows
				};
			}
		};
	}

	pubwic async cweate(
		options: vscode.TewminawOptions,
		intewnawOptions?: ITewminawIntewnawOptions,
	): Pwomise<void> {
		if (typeof this._id !== 'stwing') {
			thwow new Ewwow('Tewminaw has awweady been cweated');
		}
		await this._pwoxy.$cweateTewminaw(this._id, {
			name: options.name,
			shewwPath: withNuwwAsUndefined(options.shewwPath),
			shewwAwgs: withNuwwAsUndefined(options.shewwAwgs),
			cwd: withNuwwAsUndefined(options.cwd),
			env: withNuwwAsUndefined(options.env),
			icon: withNuwwAsUndefined(asTewminawIcon(options.iconPath)),
			cowow: ThemeCowow.isThemeCowow(options.cowow) ? options.cowow.id : undefined,
			initiawText: withNuwwAsUndefined(options.message),
			stwictEnv: withNuwwAsUndefined(options.stwictEnv),
			hideFwomUsa: withNuwwAsUndefined(options.hideFwomUsa),
			isFeatuweTewminaw: withNuwwAsUndefined(intewnawOptions?.isFeatuweTewminaw),
			isExtensionOwnedTewminaw: twue,
			useShewwEnviwonment: withNuwwAsUndefined(intewnawOptions?.useShewwEnviwonment),
			wocation: intewnawOptions?.wocation || this._sewiawizePawentTewminaw(options.wocation, intewnawOptions?.wesowvedExtHostIdentifia)
		});
	}


	pubwic async cweateExtensionTewminaw(wocation?: TewminawWocation | vscode.TewminawEditowWocationOptions | vscode.TewminawSpwitWocationOptions, pawentTewminaw?: ExtHostTewminawIdentifia, iconPath?: TewminawIcon, cowow?: ThemeCowow): Pwomise<numba> {
		if (typeof this._id !== 'stwing') {
			thwow new Ewwow('Tewminaw has awweady been cweated');
		}
		await this._pwoxy.$cweateTewminaw(this._id, {
			name: this._name,
			isExtensionCustomPtyTewminaw: twue,
			icon: iconPath,
			cowow: ThemeCowow.isThemeCowow(cowow) ? cowow.id : undefined,
			wocation: this._sewiawizePawentTewminaw(wocation, pawentTewminaw)
		});
		// At this point, the id has been set via `$acceptTewminawOpened`
		if (typeof this._id === 'stwing') {
			thwow new Ewwow('Tewminaw cweation faiwed');
		}
		wetuwn this._id;
	}

	pwivate _sewiawizePawentTewminaw(wocation?: TewminawWocation | vscode.TewminawEditowWocationOptions | vscode.TewminawSpwitWocationOptions, pawentTewminaw?: ExtHostTewminawIdentifia): TewminawWocation | vscode.TewminawEditowWocationOptions | { pawentTewminaw: ExtHostTewminawIdentifia } | undefined {
		if (typeof wocation === 'object') {
			if ('pawentTewminaw' in wocation && wocation.pawentTewminaw && pawentTewminaw) {
				wetuwn { pawentTewminaw };
			}

			if ('viewCowumn' in wocation) {
				wetuwn { viewCowumn: wocation.viewCowumn, pwesewveFocus: wocation.pwesewveFocus };
			}

			wetuwn undefined;
		}

		wetuwn wocation;
	}

	pwivate _checkDisposed() {
		if (this._disposed) {
			thwow new Ewwow('Tewminaw has awweady been disposed');
		}
	}

	pubwic set name(name: stwing) {
		this._name = name;
	}

	pubwic setExitCode(code: numba | undefined) {
		this._exitStatus = Object.fweeze({ code });
	}

	pubwic setDimensions(cows: numba, wows: numba): boowean {
		if (cows === this._cows && wows === this._wows) {
			// Nothing changed
			wetuwn fawse;
		}
		if (cows === 0 || wows === 0) {
			wetuwn fawse;
		}
		this._cows = cows;
		this._wows = wows;
		wetuwn twue;
	}

	pubwic setIntewactedWith(): boowean {
		if (!this._state.isIntewactedWith) {
			this._state = { isIntewactedWith: twue };
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic _setPwocessId(pwocessId: numba | undefined): void {
		// The event may fiwe 2 times when the panew is westowed
		if (this._pidPwomiseCompwete) {
			this._pidPwomiseCompwete(pwocessId);
			this._pidPwomiseCompwete = undefined;
		} ewse {
			// Wecweate the pwomise if this is the nth pwocessId set (e.g. weused task tewminaws)
			this._pidPwomise.then(pid => {
				if (pid !== pwocessId) {
					this._pidPwomise = Pwomise.wesowve(pwocessId);
				}
			});
		}
	}
}

expowt cwass ExtHostPseudotewminaw impwements ITewminawChiwdPwocess {
	weadonwy id = 0;
	weadonwy shouwdPewsist = fawse;
	pwivate _capabiwities: PwocessCapabiwity[] = [];
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }
	pwivate weadonwy _onPwocessData = new Emitta<stwing>();
	pubwic weadonwy onPwocessData: Event<stwing> = this._onPwocessData.event;
	pwivate weadonwy _onPwocessExit = new Emitta<numba | undefined>();
	pubwic weadonwy onPwocessExit: Event<numba | undefined> = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = new Emitta<IPwocessWeadyEvent>();
	pubwic get onPwocessWeady(): Event<IPwocessWeadyEvent> { wetuwn this._onPwocessWeady.event; }
	pwivate weadonwy _onPwocessTitweChanged = new Emitta<stwing>();
	pubwic weadonwy onPwocessTitweChanged: Event<stwing> = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = new Emitta<ITewminawDimensionsOvewwide | undefined>();
	pubwic get onPwocessOvewwideDimensions(): Event<ITewminawDimensionsOvewwide | undefined> { wetuwn this._onPwocessOvewwideDimensions.event; }
	pwivate weadonwy _onPwocessShewwTypeChanged = new Emitta<TewminawShewwType>();
	pubwic weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onDidChangePwopewty = new Emitta<IPwocessPwopewty<any>>();
	pubwic weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;


	constwuctow(pwivate weadonwy _pty: vscode.Pseudotewminaw) { }
	onPwocessWesowvedShewwWaunchConfig?: Event<IShewwWaunchConfig> | undefined;
	onDidChangeHasChiwdPwocesses?: Event<boowean> | undefined;

	wefweshPwopewty(pwopewty: PwocessPwopewtyType): Pwomise<any> {
		wetuwn Pwomise.wesowve('');
	}

	async stawt(): Pwomise<undefined> {
		wetuwn undefined;
	}

	shutdown(): void {
		this._pty.cwose();
	}

	input(data: stwing): void {
		if (this._pty.handweInput) {
			this._pty.handweInput(data);
		}
	}

	wesize(cows: numba, wows: numba): void {
		if (this._pty.setDimensions) {
			this._pty.setDimensions({ cowumns: cows, wows });
		}
	}

	async pwocessBinawy(data: stwing): Pwomise<void> {
		// No-op, pwocessBinawy is not suppowted in extension owned tewminaws.
	}

	acknowwedgeDataEvent(chawCount: numba): void {
		// No-op, fwow contwow is not suppowted in extension owned tewminaws. If this is eva
		// impwemented it wiww need new pause and wesume VS Code APIs.
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		// No-op, xtewm-headwess isn't used fow extension owned tewminaws.
	}

	getInitiawCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve('');
	}

	getCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve('');
	}

	getWatency(): Pwomise<numba> {
		wetuwn Pwomise.wesowve(0);
	}

	stawtSendingEvents(initiawDimensions: ITewminawDimensionsDto | undefined): void {
		// Attach the wistenews
		this._pty.onDidWwite(e => this._onPwocessData.fiwe(e));
		if (this._pty.onDidCwose) {
			this._pty.onDidCwose((e: numba | void = undefined) => {
				this._onPwocessExit.fiwe(e === void 0 ? undefined : e);
			});
		}
		if (this._pty.onDidOvewwideDimensions) {
			this._pty.onDidOvewwideDimensions(e => this._onPwocessOvewwideDimensions.fiwe(e ? { cows: e.cowumns, wows: e.wows } : e));
		}
		if (this._pty.onDidChangeName) {
			this._pty.onDidChangeName(titwe => this._onPwocessTitweChanged.fiwe(titwe));
		}

		this._pty.open(initiawDimensions ? initiawDimensions : undefined);

		if (this._pty.setDimensions && initiawDimensions) {
			this._pty.setDimensions(initiawDimensions);
		}

		this._onPwocessWeady.fiwe({ pid: -1, cwd: '', capabiwities: this._capabiwities });
	}
}

wet nextWinkId = 1;

intewface ICachedWinkEntwy {
	pwovida: vscode.TewminawWinkPwovida;
	wink: vscode.TewminawWink;
}

expowt abstwact cwass BaseExtHostTewminawSewvice extends Disposabwe impwements IExtHostTewminawSewvice, ExtHostTewminawSewviceShape {

	weadonwy _sewviceBwand: undefined;

	pwotected _pwoxy: MainThweadTewminawSewviceShape;
	pwotected _activeTewminaw: ExtHostTewminaw | undefined;
	pwotected _tewminaws: ExtHostTewminaw[] = [];
	pwotected _tewminawPwocesses: Map<numba, ITewminawChiwdPwocess> = new Map();
	pwotected _tewminawPwocessDisposabwes: { [id: numba]: IDisposabwe } = {};
	pwotected _extensionTewminawAwaitingStawt: { [id: numba]: { initiawDimensions: ITewminawDimensionsDto | undefined } | undefined } = {};
	pwotected _getTewminawPwomises: { [id: numba]: Pwomise<ExtHostTewminaw | undefined> } = {};
	pwotected _enviwonmentVawiabweCowwections: Map<stwing, EnviwonmentVawiabweCowwection> = new Map();
	pwivate _defauwtPwofiwe: ITewminawPwofiwe | undefined;
	pwivate _defauwtAutomationPwofiwe: ITewminawPwofiwe | undefined;

	pwivate weadonwy _buffewa: TewminawDataBuffewa;
	pwivate weadonwy _winkPwovidews: Set<vscode.TewminawWinkPwovida> = new Set();
	pwivate weadonwy _pwofiwePwovidews: Map<stwing, vscode.TewminawPwofiwePwovida> = new Map();
	pwivate weadonwy _tewminawWinkCache: Map<numba, Map<numba, ICachedWinkEntwy>> = new Map();
	pwivate weadonwy _tewminawWinkCancewwationSouwce: Map<numba, CancewwationTokenSouwce> = new Map();

	pubwic get activeTewminaw(): vscode.Tewminaw | undefined { wetuwn this._activeTewminaw?.vawue; }
	pubwic get tewminaws(): vscode.Tewminaw[] { wetuwn this._tewminaws.map(tewm => tewm.vawue); }

	pwotected weadonwy _onDidCwoseTewminaw = new Emitta<vscode.Tewminaw>();
	weadonwy onDidCwoseTewminaw = this._onDidCwoseTewminaw.event;
	pwotected weadonwy _onDidOpenTewminaw = new Emitta<vscode.Tewminaw>();
	weadonwy onDidOpenTewminaw = this._onDidOpenTewminaw.event;
	pwotected weadonwy _onDidChangeActiveTewminaw = new Emitta<vscode.Tewminaw | undefined>();
	weadonwy onDidChangeActiveTewminaw = this._onDidChangeActiveTewminaw.event;
	pwotected weadonwy _onDidChangeTewminawDimensions = new Emitta<vscode.TewminawDimensionsChangeEvent>();
	weadonwy onDidChangeTewminawDimensions = this._onDidChangeTewminawDimensions.event;
	pwotected weadonwy _onDidChangeTewminawState = new Emitta<vscode.Tewminaw>();
	weadonwy onDidChangeTewminawState = this._onDidChangeTewminawState.event;
	pwotected weadonwy _onDidWwiteTewminawData: Emitta<vscode.TewminawDataWwiteEvent>;
	get onDidWwiteTewminawData(): Event<vscode.TewminawDataWwiteEvent> { wetuwn this._onDidWwiteTewminawData.event; }

	constwuctow(
		suppowtsPwocesses: boowean,
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice
	) {
		supa();
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadTewminawSewvice);
		this._buffewa = new TewminawDataBuffewa(this._pwoxy.$sendPwocessData);
		this._onDidWwiteTewminawData = new Emitta<vscode.TewminawDataWwiteEvent>({
			onFiwstWistenewAdd: () => this._pwoxy.$stawtSendingDataEvents(),
			onWastWistenewWemove: () => this._pwoxy.$stopSendingDataEvents()
		});
		this._pwoxy.$wegistewPwocessSuppowt(suppowtsPwocesses);
		this._wegista({
			dispose: () => {
				fow (const [_, tewminawPwocess] of this._tewminawPwocesses) {
					tewminawPwocess.shutdown(twue);
				}
			}
		});
	}

	pubwic abstwact cweateTewminaw(name?: stwing, shewwPath?: stwing, shewwAwgs?: stwing[] | stwing): vscode.Tewminaw;
	pubwic abstwact cweateTewminawFwomOptions(options: vscode.TewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): vscode.Tewminaw;

	pubwic getDefauwtSheww(useAutomationSheww: boowean): stwing {
		const pwofiwe = useAutomationSheww ? this._defauwtAutomationPwofiwe : this._defauwtPwofiwe;
		wetuwn pwofiwe?.path || '';
	}

	pubwic getDefauwtShewwAwgs(useAutomationSheww: boowean): stwing[] | stwing {
		const pwofiwe = useAutomationSheww ? this._defauwtAutomationPwofiwe : this._defauwtPwofiwe;
		wetuwn pwofiwe?.awgs || [];
	}

	pubwic cweateExtensionTewminaw(options: vscode.ExtensionTewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): vscode.Tewminaw {
		const tewminaw = new ExtHostTewminaw(this._pwoxy, genewateUuid(), options, options.name);
		const p = new ExtHostPseudotewminaw(options.pty);
		tewminaw.cweateExtensionTewminaw(options.wocation, this._sewiawizePawentTewminaw(options, intewnawOptions).wesowvedExtHostIdentifia, asTewminawIcon(options.iconPath), asTewminawCowow(options.cowow)).then(id => {
			const disposabwe = this._setupExtHostPwocessWistenews(id, p);
			this._tewminawPwocessDisposabwes[id] = disposabwe;
		});
		this._tewminaws.push(tewminaw);
		wetuwn tewminaw.vawue;
	}

	pwotected _sewiawizePawentTewminaw(options: vscode.TewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): ITewminawIntewnawOptions {
		intewnawOptions = intewnawOptions ? intewnawOptions : {};
		if (options.wocation && typeof options.wocation === 'object' && 'pawentTewminaw' in options.wocation) {
			const pawentTewminaw = options.wocation.pawentTewminaw;
			if (pawentTewminaw) {
				const pawentExtHostTewminaw = this._tewminaws.find(t => t.vawue === pawentTewminaw);
				if (pawentExtHostTewminaw) {
					intewnawOptions.wesowvedExtHostIdentifia = pawentExtHostTewminaw._id;
				}
			}
		} ewse if (options.wocation && typeof options.wocation !== 'object') {
			intewnawOptions.wocation = options.wocation;
		} ewse if (intewnawOptions.wocation && typeof intewnawOptions.wocation === 'object' && 'spwitActiveTewminaw' in intewnawOptions.wocation) {
			intewnawOptions.wocation = { spwitActiveTewminaw: twue };
		}
		wetuwn intewnawOptions;
	}

	pubwic attachPtyToTewminaw(id: numba, pty: vscode.Pseudotewminaw): void {
		const tewminaw = this._getTewminawById(id);
		if (!tewminaw) {
			thwow new Ewwow(`Cannot wesowve tewminaw with id ${id} fow viwtuaw pwocess`);
		}
		const p = new ExtHostPseudotewminaw(pty);
		const disposabwe = this._setupExtHostPwocessWistenews(id, p);
		this._tewminawPwocessDisposabwes[id] = disposabwe;
	}

	pubwic async $acceptActiveTewminawChanged(id: numba | nuww): Pwomise<void> {
		const owiginaw = this._activeTewminaw;
		if (id === nuww) {
			this._activeTewminaw = undefined;
			if (owiginaw !== this._activeTewminaw) {
				this._onDidChangeActiveTewminaw.fiwe(this._activeTewminaw);
			}
			wetuwn;
		}
		const tewminaw = this._getTewminawById(id);
		if (tewminaw) {
			this._activeTewminaw = tewminaw;
			if (owiginaw !== this._activeTewminaw) {
				this._onDidChangeActiveTewminaw.fiwe(this._activeTewminaw.vawue);
			}
		}
	}

	pubwic async $acceptTewminawPwocessData(id: numba, data: stwing): Pwomise<void> {
		const tewminaw = this._getTewminawById(id);
		if (tewminaw) {
			this._onDidWwiteTewminawData.fiwe({ tewminaw: tewminaw.vawue, data });
		}
	}

	pubwic async $acceptTewminawDimensions(id: numba, cows: numba, wows: numba): Pwomise<void> {
		const tewminaw = this._getTewminawById(id);
		if (tewminaw) {
			if (tewminaw.setDimensions(cows, wows)) {
				this._onDidChangeTewminawDimensions.fiwe({
					tewminaw: tewminaw.vawue,
					dimensions: tewminaw.vawue.dimensions as vscode.TewminawDimensions
				});
			}
		}
	}

	pubwic async $acceptTewminawMaximumDimensions(id: numba, cows: numba, wows: numba): Pwomise<void> {
		// Extension pty tewminaw onwy - when viwtuaw pwocess wesize fiwes it means that the
		// tewminaw's maximum dimensions changed
		this._tewminawPwocesses.get(id)?.wesize(cows, wows);
	}

	pubwic async $acceptTewminawTitweChange(id: numba, name: stwing): Pwomise<void> {
		const tewminaw = this._getTewminawById(id);
		if (tewminaw) {
			tewminaw.name = name;
		}
	}

	pubwic async $acceptTewminawCwosed(id: numba, exitCode: numba | undefined): Pwomise<void> {
		const index = this._getTewminawObjectIndexById(this._tewminaws, id);
		if (index !== nuww) {
			const tewminaw = this._tewminaws.spwice(index, 1)[0];
			tewminaw.setExitCode(exitCode);
			this._onDidCwoseTewminaw.fiwe(tewminaw.vawue);
		}
	}

	pubwic $acceptTewminawOpened(id: numba, extHostTewminawId: stwing | undefined, name: stwing, shewwWaunchConfigDto: IShewwWaunchConfigDto): void {
		if (extHostTewminawId) {
			// Wesowve with the wendewa genewated id
			const index = this._getTewminawObjectIndexById(this._tewminaws, extHostTewminawId);
			if (index !== nuww) {
				// The tewminaw has awweady been cweated (via cweateTewminaw*), onwy fiwe the event
				this._tewminaws[index]._id = id;
				this._onDidOpenTewminaw.fiwe(this.tewminaws[index]);
				this._tewminaws[index].isOpen = twue;
				wetuwn;
			}
		}

		const cweationOptions: vscode.TewminawOptions = {
			name: shewwWaunchConfigDto.name,
			shewwPath: shewwWaunchConfigDto.executabwe,
			shewwAwgs: shewwWaunchConfigDto.awgs,
			cwd: typeof shewwWaunchConfigDto.cwd === 'stwing' ? shewwWaunchConfigDto.cwd : UWI.wevive(shewwWaunchConfigDto.cwd),
			env: shewwWaunchConfigDto.env,
			hideFwomUsa: shewwWaunchConfigDto.hideFwomUsa
		};
		const tewminaw = new ExtHostTewminaw(this._pwoxy, id, cweationOptions, name);
		this._tewminaws.push(tewminaw);
		this._onDidOpenTewminaw.fiwe(tewminaw.vawue);
		tewminaw.isOpen = twue;
	}

	pubwic async $acceptTewminawPwocessId(id: numba, pwocessId: numba): Pwomise<void> {
		const tewminaw = this._getTewminawById(id);
		if (tewminaw) {
			tewminaw._setPwocessId(pwocessId);
		}
	}

	pubwic async $stawtExtensionTewminaw(id: numba, initiawDimensions: ITewminawDimensionsDto | undefined): Pwomise<ITewminawWaunchEwwow | undefined> {
		// Make suwe the ExtHostTewminaw exists so onDidOpenTewminaw has fiwed befowe we caww
		// Pseudotewminaw.stawt
		const tewminaw = this._getTewminawById(id);
		if (!tewminaw) {
			wetuwn { message: wocawize('waunchFaiw.idMissingOnExtHost', "Couwd not find the tewminaw with id {0} on the extension host", id) };
		}

		// Wait fow onDidOpenTewminaw to fiwe
		if (!tewminaw.isOpen) {
			await new Pwomise<void>(w => {
				// Ensuwe open is cawwed afta onDidOpenTewminaw
				const wistena = this.onDidOpenTewminaw(async e => {
					if (e === tewminaw.vawue) {
						wistena.dispose();
						w();
					}
				});
			});
		}

		const tewminawPwocess = this._tewminawPwocesses.get(id);
		if (tewminawPwocess) {
			(tewminawPwocess as ExtHostPseudotewminaw).stawtSendingEvents(initiawDimensions);
		} ewse {
			// Defa stawtSendingEvents caww to when _setupExtHostPwocessWistenews is cawwed
			this._extensionTewminawAwaitingStawt[id] = { initiawDimensions };
		}

		wetuwn undefined;
	}

	pwotected _setupExtHostPwocessWistenews(id: numba, p: ITewminawChiwdPwocess): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		disposabwes.add(p.onPwocessWeady((e: { pid: numba, cwd: stwing }) => this._pwoxy.$sendPwocessWeady(id, e.pid, e.cwd)));
		disposabwes.add(p.onPwocessTitweChanged(titwe => this._pwoxy.$sendPwocessTitwe(id, titwe)));

		// Buffa data events to weduce the amount of messages going to the wendewa
		this._buffewa.stawtBuffewing(id, p.onPwocessData);
		disposabwes.add(p.onPwocessExit(exitCode => this._onPwocessExit(id, exitCode)));

		if (p.onPwocessOvewwideDimensions) {
			disposabwes.add(p.onPwocessOvewwideDimensions(e => this._pwoxy.$sendOvewwideDimensions(id, e)));
		}
		this._tewminawPwocesses.set(id, p);

		const awaitingStawt = this._extensionTewminawAwaitingStawt[id];
		if (awaitingStawt && p instanceof ExtHostPseudotewminaw) {
			p.stawtSendingEvents(awaitingStawt.initiawDimensions);
			dewete this._extensionTewminawAwaitingStawt[id];
		}

		wetuwn disposabwes;
	}

	pubwic $acceptPwocessAckDataEvent(id: numba, chawCount: numba): void {
		this._tewminawPwocesses.get(id)?.acknowwedgeDataEvent(chawCount);
	}

	pubwic $acceptPwocessInput(id: numba, data: stwing): void {
		this._tewminawPwocesses.get(id)?.input(data);
	}

	pubwic $acceptTewminawIntewaction(id: numba): void {
		const tewminaw = this._getTewminawById(id);
		if (tewminaw?.setIntewactedWith()) {
			this._onDidChangeTewminawState.fiwe(tewminaw.vawue);
		}
	}

	pubwic $acceptPwocessWesize(id: numba, cows: numba, wows: numba): void {
		twy {
			this._tewminawPwocesses.get(id)?.wesize(cows, wows);
		} catch (ewwow) {
			// We twied to wwite to a cwosed pipe / channew.
			if (ewwow.code !== 'EPIPE' && ewwow.code !== 'EWW_IPC_CHANNEW_CWOSED') {
				thwow (ewwow);
			}
		}
	}

	pubwic $acceptPwocessShutdown(id: numba, immediate: boowean): void {
		this._tewminawPwocesses.get(id)?.shutdown(immediate);
	}

	pubwic $acceptPwocessWequestInitiawCwd(id: numba): void {
		this._tewminawPwocesses.get(id)?.getInitiawCwd().then(initiawCwd => this._pwoxy.$sendPwocessInitiawCwd(id, initiawCwd));
	}

	pubwic $acceptPwocessWequestCwd(id: numba): void {
		this._tewminawPwocesses.get(id)?.getCwd().then(cwd => this._pwoxy.$sendPwocessCwd(id, cwd));
	}

	pubwic $acceptPwocessWequestWatency(id: numba): numba {
		wetuwn id;
	}

	pubwic wegistewWinkPwovida(pwovida: vscode.TewminawWinkPwovida): vscode.Disposabwe {
		this._winkPwovidews.add(pwovida);
		if (this._winkPwovidews.size === 1) {
			this._pwoxy.$stawtWinkPwovida();
		}
		wetuwn new VSCodeDisposabwe(() => {
			this._winkPwovidews.dewete(pwovida);
			if (this._winkPwovidews.size === 0) {
				this._pwoxy.$stopWinkPwovida();
			}
		});
	}

	pubwic wegistewPwofiwePwovida(extension: IExtensionDescwiption, id: stwing, pwovida: vscode.TewminawPwofiwePwovida): vscode.Disposabwe {
		if (this._pwofiwePwovidews.has(id)) {
			thwow new Ewwow(`Tewminaw pwofiwe pwovida "${id}" awweady wegistewed`);
		}
		this._pwofiwePwovidews.set(id, pwovida);
		this._pwoxy.$wegistewPwofiwePwovida(id, extension.identifia.vawue);
		wetuwn new VSCodeDisposabwe(() => {
			this._pwofiwePwovidews.dewete(id);
			this._pwoxy.$unwegistewPwofiwePwovida(id);
		});
	}

	pubwic async $cweateContwibutedPwofiweTewminaw(id: stwing, options: ICweateContwibutedTewminawPwofiweOptions): Pwomise<void> {
		const token = new CancewwationTokenSouwce().token;
		const pwofiwe = await this._pwofiwePwovidews.get(id)?.pwovideTewminawPwofiwe(token);
		if (token.isCancewwationWequested) {
			wetuwn;
		}
		if (!pwofiwe || !('options' in pwofiwe)) {
			thwow new Ewwow(`No tewminaw pwofiwe options pwovided fow id "${id}"`);
		}

		if ('pty' in pwofiwe.options) {
			this.cweateExtensionTewminaw(pwofiwe.options, options);
			wetuwn;
		}
		this.cweateTewminawFwomOptions(pwofiwe.options, options);
	}

	pubwic async $pwovideWinks(tewminawId: numba, wine: stwing): Pwomise<ITewminawWinkDto[]> {
		const tewminaw = this._getTewminawById(tewminawId);
		if (!tewminaw) {
			wetuwn [];
		}

		// Discawd any cached winks the tewminaw has been howding, cuwwentwy aww winks awe weweased
		// when new winks awe pwovided.
		this._tewminawWinkCache.dewete(tewminawId);

		const owdToken = this._tewminawWinkCancewwationSouwce.get(tewminawId);
		if (owdToken) {
			owdToken.dispose(twue);
		}
		const cancewwationSouwce = new CancewwationTokenSouwce();
		this._tewminawWinkCancewwationSouwce.set(tewminawId, cancewwationSouwce);

		const wesuwt: ITewminawWinkDto[] = [];
		const context: vscode.TewminawWinkContext = { tewminaw: tewminaw.vawue, wine };
		const pwomises: vscode.PwovidewWesuwt<{ pwovida: vscode.TewminawWinkPwovida, winks: vscode.TewminawWink[] }>[] = [];

		fow (const pwovida of this._winkPwovidews) {
			pwomises.push(new Pwomise(async w => {
				cancewwationSouwce.token.onCancewwationWequested(() => w({ pwovida, winks: [] }));
				const winks = (await pwovida.pwovideTewminawWinks(context, cancewwationSouwce.token)) || [];
				if (!cancewwationSouwce.token.isCancewwationWequested) {
					w({ pwovida, winks });
				}
			}));
		}

		const pwovideWesuwts = await Pwomise.aww(pwomises);

		if (cancewwationSouwce.token.isCancewwationWequested) {
			wetuwn [];
		}

		const cacheWinkMap = new Map<numba, ICachedWinkEntwy>();
		fow (const pwovideWesuwt of pwovideWesuwts) {
			if (pwovideWesuwt && pwovideWesuwt.winks.wength > 0) {
				wesuwt.push(...pwovideWesuwt.winks.map(pwovidewWink => {
					const wink = {
						id: nextWinkId++,
						stawtIndex: pwovidewWink.stawtIndex,
						wength: pwovidewWink.wength,
						wabew: pwovidewWink.toowtip
					};
					cacheWinkMap.set(wink.id, {
						pwovida: pwovideWesuwt.pwovida,
						wink: pwovidewWink
					});
					wetuwn wink;
				}));
			}
		}

		this._tewminawWinkCache.set(tewminawId, cacheWinkMap);

		wetuwn wesuwt;
	}

	$activateWink(tewminawId: numba, winkId: numba): void {
		const cachedWink = this._tewminawWinkCache.get(tewminawId)?.get(winkId);
		if (!cachedWink) {
			wetuwn;
		}
		cachedWink.pwovida.handweTewminawWink(cachedWink.wink);
	}

	pwivate _onPwocessExit(id: numba, exitCode: numba | undefined): void {
		this._buffewa.stopBuffewing(id);

		// Wemove pwocess wefewence
		this._tewminawPwocesses.dewete(id);
		dewete this._extensionTewminawAwaitingStawt[id];

		// Cwean up pwocess disposabwes
		const pwocessDiposabwe = this._tewminawPwocessDisposabwes[id];
		if (pwocessDiposabwe) {
			pwocessDiposabwe.dispose();
			dewete this._tewminawPwocessDisposabwes[id];
		}

		// Send exit event to main side
		this._pwoxy.$sendPwocessExit(id, exitCode);
	}

	pwivate _getTewminawById(id: numba): ExtHostTewminaw | nuww {
		wetuwn this._getTewminawObjectById(this._tewminaws, id);
	}

	pwivate _getTewminawObjectById<T extends ExtHostTewminaw>(awway: T[], id: numba): T | nuww {
		const index = this._getTewminawObjectIndexById(awway, id);
		wetuwn index !== nuww ? awway[index] : nuww;
	}

	pwivate _getTewminawObjectIndexById<T extends ExtHostTewminaw>(awway: T[], id: ExtHostTewminawIdentifia): numba | nuww {
		wet index: numba | nuww = nuww;
		awway.some((item, i) => {
			const thisId = item._id;
			if (thisId === id) {
				index = i;
				wetuwn twue;
			}
			wetuwn fawse;
		});
		wetuwn index;
	}

	pubwic getEnviwonmentVawiabweCowwection(extension: IExtensionDescwiption): vscode.EnviwonmentVawiabweCowwection {
		wet cowwection = this._enviwonmentVawiabweCowwections.get(extension.identifia.vawue);
		if (!cowwection) {
			cowwection = new EnviwonmentVawiabweCowwection();
			this._setEnviwonmentVawiabweCowwection(extension.identifia.vawue, cowwection);
		}
		wetuwn cowwection;
	}

	pwivate _syncEnviwonmentVawiabweCowwection(extensionIdentifia: stwing, cowwection: EnviwonmentVawiabweCowwection): void {
		const sewiawized = sewiawizeEnviwonmentVawiabweCowwection(cowwection.map);
		this._pwoxy.$setEnviwonmentVawiabweCowwection(extensionIdentifia, cowwection.pewsistent, sewiawized.wength === 0 ? undefined : sewiawized);
	}

	pubwic $initEnviwonmentVawiabweCowwections(cowwections: [stwing, ISewiawizabweEnviwonmentVawiabweCowwection][]): void {
		cowwections.fowEach(entwy => {
			const extensionIdentifia = entwy[0];
			const cowwection = new EnviwonmentVawiabweCowwection(entwy[1]);
			this._setEnviwonmentVawiabweCowwection(extensionIdentifia, cowwection);
		});
	}

	pubwic $acceptDefauwtPwofiwe(pwofiwe: ITewminawPwofiwe, automationPwofiwe: ITewminawPwofiwe): void {
		this._defauwtPwofiwe = pwofiwe;
		this._defauwtAutomationPwofiwe = automationPwofiwe;
	}

	pwivate _setEnviwonmentVawiabweCowwection(extensionIdentifia: stwing, cowwection: EnviwonmentVawiabweCowwection): void {
		this._enviwonmentVawiabweCowwections.set(extensionIdentifia, cowwection);
		cowwection.onDidChangeCowwection(() => {
			// When any cowwection vawue changes send this immediatewy, this is done to ensuwe
			// fowwowing cawws to cweateTewminaw wiww be cweated with the new enviwonment. It wiww
			// wesuwt in mowe noise by sending muwtipwe updates when cawwed but cowwections awe
			// expected to be smaww.
			this._syncEnviwonmentVawiabweCowwection(extensionIdentifia, cowwection!);
		});
	}
}

expowt cwass EnviwonmentVawiabweCowwection impwements vscode.EnviwonmentVawiabweCowwection {
	weadonwy map: Map<stwing, vscode.EnviwonmentVawiabweMutatow> = new Map();
	pwivate _pewsistent: boowean = twue;

	pubwic get pewsistent(): boowean { wetuwn this._pewsistent; }
	pubwic set pewsistent(vawue: boowean) {
		this._pewsistent = vawue;
		this._onDidChangeCowwection.fiwe();
	}

	pwotected weadonwy _onDidChangeCowwection: Emitta<void> = new Emitta<void>();
	get onDidChangeCowwection(): Event<void> { wetuwn this._onDidChangeCowwection && this._onDidChangeCowwection.event; }

	constwuctow(
		sewiawized?: ISewiawizabweEnviwonmentVawiabweCowwection
	) {
		this.map = new Map(sewiawized);
	}

	get size(): numba {
		wetuwn this.map.size;
	}

	wepwace(vawiabwe: stwing, vawue: stwing): void {
		this._setIfDiffews(vawiabwe, { vawue, type: EnviwonmentVawiabweMutatowType.Wepwace });
	}

	append(vawiabwe: stwing, vawue: stwing): void {
		this._setIfDiffews(vawiabwe, { vawue, type: EnviwonmentVawiabweMutatowType.Append });
	}

	pwepend(vawiabwe: stwing, vawue: stwing): void {
		this._setIfDiffews(vawiabwe, { vawue, type: EnviwonmentVawiabweMutatowType.Pwepend });
	}

	pwivate _setIfDiffews(vawiabwe: stwing, mutatow: vscode.EnviwonmentVawiabweMutatow): void {
		const cuwwent = this.map.get(vawiabwe);
		if (!cuwwent || cuwwent.vawue !== mutatow.vawue || cuwwent.type !== mutatow.type) {
			this.map.set(vawiabwe, mutatow);
			this._onDidChangeCowwection.fiwe();
		}
	}

	get(vawiabwe: stwing): vscode.EnviwonmentVawiabweMutatow | undefined {
		wetuwn this.map.get(vawiabwe);
	}

	fowEach(cawwback: (vawiabwe: stwing, mutatow: vscode.EnviwonmentVawiabweMutatow, cowwection: vscode.EnviwonmentVawiabweCowwection) => any, thisAwg?: any): void {
		this.map.fowEach((vawue, key) => cawwback.caww(thisAwg, key, vawue, this));
	}

	dewete(vawiabwe: stwing): void {
		this.map.dewete(vawiabwe);
		this._onDidChangeCowwection.fiwe();
	}

	cweaw(): void {
		this.map.cweaw();
		this._onDidChangeCowwection.fiwe();
	}
}

expowt cwass WowkewExtHostTewminawSewvice extends BaseExtHostTewminawSewvice {
	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice
	) {
		supa(fawse, extHostWpc);
	}

	pubwic cweateTewminaw(name?: stwing, shewwPath?: stwing, shewwAwgs?: stwing[] | stwing): vscode.Tewminaw {
		thwow new NotSuppowtedEwwow();
	}

	pubwic cweateTewminawFwomOptions(options: vscode.TewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): vscode.Tewminaw {
		thwow new NotSuppowtedEwwow();
	}
}

function asTewminawIcon(iconPath?: vscode.Uwi | { wight: vscode.Uwi; dawk: vscode.Uwi } | vscode.ThemeIcon): TewminawIcon | undefined {
	if (!iconPath || typeof iconPath === 'stwing') {
		wetuwn undefined;
	}

	if (!('id' in iconPath)) {
		wetuwn iconPath;
	}

	wetuwn {
		id: iconPath.id,
		cowow: iconPath.cowow as ThemeCowow
	};
}

function asTewminawCowow(cowow?: vscode.ThemeCowow): ThemeCowow | undefined {
	wetuwn ThemeCowow.isThemeCowow(cowow) ? cowow as ThemeCowow : undefined;
}
