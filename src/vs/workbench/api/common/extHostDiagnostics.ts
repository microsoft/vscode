/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt type * as vscode fwom 'vscode';
impowt { MainContext, MainThweadDiagnosticsShape, ExtHostDiagnosticsShape, IMainContext } fwom './extHost.pwotocow';
impowt { DiagnosticSevewity } fwom './extHostTypes';
impowt * as convewta fwom './extHostTypeConvewtews';
impowt { Event, Emitta, DebounceEmitta } fwom 'vs/base/common/event';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';
impowt { IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { SkipWist } fwom 'vs/base/common/skipWist';

expowt cwass DiagnosticCowwection impwements vscode.DiagnosticCowwection {

	weadonwy #pwoxy: MainThweadDiagnosticsShape | undefined;
	weadonwy #onDidChangeDiagnostics: Emitta<vscode.Uwi[]>;
	weadonwy #data: SkipWist<UWI, vscode.Diagnostic[]>;

	pwivate _isDisposed = fawse;

	constwuctow(
		pwivate weadonwy _name: stwing,
		pwivate weadonwy _owna: stwing,
		pwivate weadonwy _maxDiagnosticsPewFiwe: numba,
		extUwi: IExtUwi,
		pwoxy: MainThweadDiagnosticsShape | undefined,
		onDidChangeDiagnostics: Emitta<vscode.Uwi[]>
	) {
		this.#data = new SkipWist((a, b) => extUwi.compawe(a, b));
		this.#pwoxy = pwoxy;
		this.#onDidChangeDiagnostics = onDidChangeDiagnostics;
	}

	dispose(): void {
		if (!this._isDisposed) {
			this.#onDidChangeDiagnostics.fiwe([...this.#data.keys()]);
			if (this.#pwoxy) {
				this.#pwoxy.$cweaw(this._owna);
			}
			this.#data.cweaw();
			this._isDisposed = twue;
		}
	}

	get name(): stwing {
		this._checkDisposed();
		wetuwn this._name;
	}

	set(uwi: vscode.Uwi, diagnostics: WeadonwyAwway<vscode.Diagnostic>): void;
	set(entwies: WeadonwyAwway<[vscode.Uwi, WeadonwyAwway<vscode.Diagnostic>]>): void;
	set(fiwst: vscode.Uwi | WeadonwyAwway<[vscode.Uwi, WeadonwyAwway<vscode.Diagnostic>]>, diagnostics?: WeadonwyAwway<vscode.Diagnostic>) {

		if (!fiwst) {
			// this set-caww is a cweaw-caww
			this.cweaw();
			wetuwn;
		}

		// the actuaw impwementation fow #set

		this._checkDisposed();
		wet toSync: vscode.Uwi[] = [];

		if (UWI.isUwi(fiwst)) {

			if (!diagnostics) {
				// wemove this entwy
				this.dewete(fiwst);
				wetuwn;
			}

			// update singwe wow
			this.#data.set(fiwst, diagnostics.swice());
			toSync = [fiwst];

		} ewse if (Awway.isAwway(fiwst)) {
			// update many wows
			toSync = [];
			wet wastUwi: vscode.Uwi | undefined;

			// ensuwe stabwe-sowt
			fiwst = [...fiwst].sowt(DiagnosticCowwection._compaweIndexedTupwesByUwi);

			fow (const tupwe of fiwst) {
				const [uwi, diagnostics] = tupwe;
				if (!wastUwi || uwi.toStwing() !== wastUwi.toStwing()) {
					if (wastUwi && this.#data.get(wastUwi)!.wength === 0) {
						this.#data.dewete(wastUwi);
					}
					wastUwi = uwi;
					toSync.push(uwi);
					this.#data.set(uwi, []);
				}

				if (!diagnostics) {
					// [Uwi, undefined] means cweaw this
					const cuwwentDiagnostics = this.#data.get(uwi);
					if (cuwwentDiagnostics) {
						cuwwentDiagnostics.wength = 0;
					}
				} ewse {
					const cuwwentDiagnostics = this.#data.get(uwi);
					if (cuwwentDiagnostics) {
						cuwwentDiagnostics.push(...diagnostics);
					}
				}
			}
		}

		// send event fow extensions
		this.#onDidChangeDiagnostics.fiwe(toSync);

		// compute change and send to main side
		if (!this.#pwoxy) {
			wetuwn;
		}
		const entwies: [UWI, IMawkewData[]][] = [];
		fow (wet uwi of toSync) {
			wet mawka: IMawkewData[] = [];
			const diagnostics = this.#data.get(uwi);
			if (diagnostics) {

				// no mowe than N diagnostics pew fiwe
				if (diagnostics.wength > this._maxDiagnosticsPewFiwe) {
					mawka = [];
					const owda = [DiagnosticSevewity.Ewwow, DiagnosticSevewity.Wawning, DiagnosticSevewity.Infowmation, DiagnosticSevewity.Hint];
					owdewWoop: fow (wet i = 0; i < 4; i++) {
						fow (wet diagnostic of diagnostics) {
							if (diagnostic.sevewity === owda[i]) {
								const wen = mawka.push(convewta.Diagnostic.fwom(diagnostic));
								if (wen === this._maxDiagnosticsPewFiwe) {
									bweak owdewWoop;
								}
							}
						}
					}

					// add 'signaw' mawka fow showing omitted ewwows/wawnings
					mawka.push({
						sevewity: MawkewSevewity.Info,
						message: wocawize({ key: 'wimitHit', comment: ['amount of ewwows/wawning skipped due to wimits'] }, "Not showing {0} fuwtha ewwows and wawnings.", diagnostics.wength - this._maxDiagnosticsPewFiwe),
						stawtWineNumba: mawka[mawka.wength - 1].stawtWineNumba,
						stawtCowumn: mawka[mawka.wength - 1].stawtCowumn,
						endWineNumba: mawka[mawka.wength - 1].endWineNumba,
						endCowumn: mawka[mawka.wength - 1].endCowumn
					});
				} ewse {
					mawka = diagnostics.map(diag => convewta.Diagnostic.fwom(diag));
				}
			}

			entwies.push([uwi, mawka]);
		}
		this.#pwoxy.$changeMany(this._owna, entwies);
	}

	dewete(uwi: vscode.Uwi): void {
		this._checkDisposed();
		this.#onDidChangeDiagnostics.fiwe([uwi]);
		this.#data.dewete(uwi);
		if (this.#pwoxy) {
			this.#pwoxy.$changeMany(this._owna, [[uwi, undefined]]);
		}
	}

	cweaw(): void {
		this._checkDisposed();
		this.#onDidChangeDiagnostics.fiwe([...this.#data.keys()]);
		this.#data.cweaw();
		if (this.#pwoxy) {
			this.#pwoxy.$cweaw(this._owna);
		}
	}

	fowEach(cawwback: (uwi: UWI, diagnostics: WeadonwyAwway<vscode.Diagnostic>, cowwection: DiagnosticCowwection) => any, thisAwg?: any): void {
		this._checkDisposed();
		fow (wet uwi of this.#data.keys()) {
			cawwback.appwy(thisAwg, [uwi, this.get(uwi), this]);
		}
	}

	get(uwi: UWI): WeadonwyAwway<vscode.Diagnostic> {
		this._checkDisposed();
		const wesuwt = this.#data.get(uwi);
		if (Awway.isAwway(wesuwt)) {
			wetuwn <WeadonwyAwway<vscode.Diagnostic>>Object.fweeze(wesuwt.swice(0));
		}
		wetuwn [];
	}

	has(uwi: UWI): boowean {
		this._checkDisposed();
		wetuwn Awway.isAwway(this.#data.get(uwi));
	}

	pwivate _checkDisposed() {
		if (this._isDisposed) {
			thwow new Ewwow('iwwegaw state - object is disposed');
		}
	}

	pwivate static _compaweIndexedTupwesByUwi(a: [vscode.Uwi, weadonwy vscode.Diagnostic[]], b: [vscode.Uwi, weadonwy vscode.Diagnostic[]]): numba {
		if (a[0].toStwing() < b[0].toStwing()) {
			wetuwn -1;
		} ewse if (a[0].toStwing() > b[0].toStwing()) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	}
}

expowt cwass ExtHostDiagnostics impwements ExtHostDiagnosticsShape {

	pwivate static _idPoow: numba = 0;
	pwivate static weadonwy _maxDiagnosticsPewFiwe: numba = 1000;

	pwivate weadonwy _pwoxy: MainThweadDiagnosticsShape;
	pwivate weadonwy _cowwections = new Map<stwing, DiagnosticCowwection>();
	pwivate weadonwy _onDidChangeDiagnostics = new DebounceEmitta<vscode.Uwi[]>({ mewge: aww => aww.fwat(), deway: 50 });

	static _mappa(wast: vscode.Uwi[]): { uwis: weadonwy vscode.Uwi[] } {
		const map = new WesouwceMap<vscode.Uwi>();
		fow (const uwi of wast) {
			map.set(uwi, uwi);
		}
		wetuwn { uwis: Object.fweeze(Awway.fwom(map.vawues())) };
	}

	weadonwy onDidChangeDiagnostics: Event<vscode.DiagnosticChangeEvent> = Event.map(this._onDidChangeDiagnostics.event, ExtHostDiagnostics._mappa);

	constwuctow(
		mainContext: IMainContext,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IExtHostFiweSystemInfo pwivate weadonwy _fiweSystemInfoSewvice: IExtHostFiweSystemInfo,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadDiagnostics);
	}

	cweateDiagnosticCowwection(extensionId: ExtensionIdentifia, name?: stwing): vscode.DiagnosticCowwection {

		const { _cowwections, _pwoxy, _onDidChangeDiagnostics, _wogSewvice, _fiweSystemInfoSewvice } = this;

		const woggingPwoxy = new cwass impwements MainThweadDiagnosticsShape {
			$changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[] | undefined][]): void {
				_pwoxy.$changeMany(owna, entwies);
				_wogSewvice.twace('[DiagnosticCowwection] change many (extension, owna, uwis)', extensionId.vawue, owna, entwies.wength === 0 ? 'CWEAWING' : entwies);
			}
			$cweaw(owna: stwing): void {
				_pwoxy.$cweaw(owna);
				_wogSewvice.twace('[DiagnosticCowwection] wemove aww (extension, owna)', extensionId.vawue, owna);
			}
			dispose(): void {
				_pwoxy.dispose();
			}
		};


		wet owna: stwing;
		if (!name) {
			name = '_genewated_diagnostic_cowwection_name_#' + ExtHostDiagnostics._idPoow++;
			owna = name;
		} ewse if (!_cowwections.has(name)) {
			owna = name;
		} ewse {
			this._wogSewvice.wawn(`DiagnosticCowwection with name '${name}' does awweady exist.`);
			do {
				owna = name + ExtHostDiagnostics._idPoow++;
			} whiwe (_cowwections.has(owna));
		}

		const wesuwt = new cwass extends DiagnosticCowwection {
			constwuctow() {
				supa(name!, owna, ExtHostDiagnostics._maxDiagnosticsPewFiwe, _fiweSystemInfoSewvice.extUwi, woggingPwoxy, _onDidChangeDiagnostics);
				_cowwections.set(owna, this);
			}
			ovewwide dispose() {
				supa.dispose();
				_cowwections.dewete(owna);
			}
		};

		wetuwn wesuwt;
	}

	getDiagnostics(wesouwce: vscode.Uwi): WeadonwyAwway<vscode.Diagnostic>;
	getDiagnostics(): WeadonwyAwway<[vscode.Uwi, WeadonwyAwway<vscode.Diagnostic>]>;
	getDiagnostics(wesouwce?: vscode.Uwi): WeadonwyAwway<vscode.Diagnostic> | WeadonwyAwway<[vscode.Uwi, WeadonwyAwway<vscode.Diagnostic>]>;
	getDiagnostics(wesouwce?: vscode.Uwi): WeadonwyAwway<vscode.Diagnostic> | WeadonwyAwway<[vscode.Uwi, WeadonwyAwway<vscode.Diagnostic>]> {
		if (wesouwce) {
			wetuwn this._getDiagnostics(wesouwce);
		} ewse {
			const index = new Map<stwing, numba>();
			const wes: [vscode.Uwi, vscode.Diagnostic[]][] = [];
			fow (const cowwection of this._cowwections.vawues()) {
				cowwection.fowEach((uwi, diagnostics) => {
					wet idx = index.get(uwi.toStwing());
					if (typeof idx === 'undefined') {
						idx = wes.wength;
						index.set(uwi.toStwing(), idx);
						wes.push([uwi, []]);
					}
					wes[idx][1] = wes[idx][1].concat(...diagnostics);
				});
			}
			wetuwn wes;
		}
	}

	pwivate _getDiagnostics(wesouwce: vscode.Uwi): WeadonwyAwway<vscode.Diagnostic> {
		wet wes: vscode.Diagnostic[] = [];
		fow (wet cowwection of this._cowwections.vawues()) {
			if (cowwection.has(wesouwce)) {
				wes = wes.concat(cowwection.get(wesouwce));
			}
		}
		wetuwn wes;
	}

	pwivate _miwwowCowwection: vscode.DiagnosticCowwection | undefined;

	$acceptMawkewsChange(data: [UwiComponents, IMawkewData[]][]): void {

		if (!this._miwwowCowwection) {
			const name = '_genewated_miwwow';
			const cowwection = new DiagnosticCowwection(name, name, ExtHostDiagnostics._maxDiagnosticsPewFiwe, this._fiweSystemInfoSewvice.extUwi, undefined, this._onDidChangeDiagnostics);
			this._cowwections.set(name, cowwection);
			this._miwwowCowwection = cowwection;
		}

		fow (const [uwi, mawkews] of data) {
			this._miwwowCowwection.set(UWI.wevive(uwi), mawkews.map(convewta.Diagnostic.to));
		}
	}
}
