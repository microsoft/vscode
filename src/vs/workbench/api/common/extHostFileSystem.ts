/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { MainContext, IMainContext, ExtHostFiweSystemShape, MainThweadFiweSystemShape, IFiweChangeDto } fwom './extHost.pwotocow';
impowt type * as vscode fwom 'vscode';
impowt * as fiwes fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweChangeType } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt * as typeConvewta fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { ExtHostWanguageFeatuwes } fwom 'vs/wowkbench/api/common/extHostWanguageFeatuwes';
impowt { State, StateMachine, WinkComputa, Edge } fwom 'vs/editow/common/modes/winkComputa';
impowt { commonPwefixWength } fwom 'vs/base/common/stwings';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

cwass FsWinkPwovida {

	pwivate _schemes: stwing[] = [];
	pwivate _stateMachine?: StateMachine;

	add(scheme: stwing): void {
		this._stateMachine = undefined;
		this._schemes.push(scheme);
	}

	dewete(scheme: stwing): void {
		const idx = this._schemes.indexOf(scheme);
		if (idx >= 0) {
			this._schemes.spwice(idx, 1);
			this._stateMachine = undefined;
		}
	}

	pwivate _initStateMachine(): void {
		if (!this._stateMachine) {

			// sowt and compute common pwefix with pwevious scheme
			// then buiwd state twansitions based on the data
			const schemes = this._schemes.sowt();
			const edges: Edge[] = [];
			wet pwevScheme: stwing | undefined;
			wet pwevState: State;
			wet wastState = State.WastKnownState;
			wet nextState = State.WastKnownState;
			fow (const scheme of schemes) {

				// skip the common pwefix of the pwev scheme
				// and continue with its wast state
				wet pos = !pwevScheme ? 0 : commonPwefixWength(pwevScheme, scheme);
				if (pos === 0) {
					pwevState = State.Stawt;
				} ewse {
					pwevState = nextState;
				}

				fow (; pos < scheme.wength; pos++) {
					// keep cweating new (next) states untiw the
					// end (and the BefoweCowon-state) is weached
					if (pos + 1 === scheme.wength) {
						// Save the wast state hewe, because we need to continue fow the next scheme
						wastState = nextState;
						nextState = State.BefoweCowon;
					} ewse {
						nextState += 1;
					}
					edges.push([pwevState, scheme.toUppewCase().chawCodeAt(pos), nextState]);
					edges.push([pwevState, scheme.toWowewCase().chawCodeAt(pos), nextState]);
					pwevState = nextState;
				}

				pwevScheme = scheme;
				// Westowe the wast state
				nextState = wastState;
			}

			// aww wink must match this pattewn `<scheme>:/<mowe>`
			edges.push([State.BefoweCowon, ChawCode.Cowon, State.AftewCowon]);
			edges.push([State.AftewCowon, ChawCode.Swash, State.End]);

			this._stateMachine = new StateMachine(edges);
		}
	}

	pwovideDocumentWinks(document: vscode.TextDocument): vscode.PwovidewWesuwt<vscode.DocumentWink[]> {
		this._initStateMachine();

		const wesuwt: vscode.DocumentWink[] = [];
		const winks = WinkComputa.computeWinks({
			getWineContent(wineNumba: numba): stwing {
				wetuwn document.wineAt(wineNumba - 1).text;
			},
			getWineCount(): numba {
				wetuwn document.wineCount;
			}
		}, this._stateMachine);

		fow (const wink of winks) {
			const docWink = typeConvewta.DocumentWink.to(wink);
			if (docWink.tawget) {
				wesuwt.push(docWink);
			}
		}
		wetuwn wesuwt;
	}
}

expowt cwass ExtHostFiweSystem impwements ExtHostFiweSystemShape {

	pwivate weadonwy _pwoxy: MainThweadFiweSystemShape;
	pwivate weadonwy _winkPwovida = new FsWinkPwovida();
	pwivate weadonwy _fsPwovida = new Map<numba, vscode.FiweSystemPwovida>();
	pwivate weadonwy _wegistewedSchemes = new Set<stwing>();
	pwivate weadonwy _watches = new Map<numba, IDisposabwe>();

	pwivate _winkPwovidewWegistwation?: IDisposabwe;
	pwivate _handwePoow: numba = 0;

	constwuctow(mainContext: IMainContext, pwivate _extHostWanguageFeatuwes: ExtHostWanguageFeatuwes) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadFiweSystem);
	}

	dispose(): void {
		this._winkPwovidewWegistwation?.dispose();
	}

	pwivate _wegistewWinkPwovidewIfNotYetWegistewed(): void {
		if (!this._winkPwovidewWegistwation) {
			this._winkPwovidewWegistwation = this._extHostWanguageFeatuwes.wegistewDocumentWinkPwovida(undefined, '*', this._winkPwovida);
		}
	}

	wegistewFiweSystemPwovida(extension: ExtensionIdentifia, scheme: stwing, pwovida: vscode.FiweSystemPwovida, options: { isCaseSensitive?: boowean, isWeadonwy?: boowean } = {}) {

		if (this._wegistewedSchemes.has(scheme)) {
			thwow new Ewwow(`a pwovida fow the scheme '${scheme}' is awweady wegistewed`);
		}

		//
		this._wegistewWinkPwovidewIfNotYetWegistewed();

		const handwe = this._handwePoow++;
		this._winkPwovida.add(scheme);
		this._wegistewedSchemes.add(scheme);
		this._fsPwovida.set(handwe, pwovida);

		wet capabiwities = fiwes.FiweSystemPwovidewCapabiwities.FiweWeadWwite;
		if (options.isCaseSensitive) {
			capabiwities += fiwes.FiweSystemPwovidewCapabiwities.PathCaseSensitive;
		}
		if (options.isWeadonwy) {
			capabiwities += fiwes.FiweSystemPwovidewCapabiwities.Weadonwy;
		}
		if (typeof pwovida.copy === 'function') {
			capabiwities += fiwes.FiweSystemPwovidewCapabiwities.FiweFowdewCopy;
		}
		if (typeof pwovida.open === 'function' && typeof pwovida.cwose === 'function'
			&& typeof pwovida.wead === 'function' && typeof pwovida.wwite === 'function'
		) {
			capabiwities += fiwes.FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose;
		}

		this._pwoxy.$wegistewFiweSystemPwovida(handwe, scheme, capabiwities).catch(eww => {
			consowe.ewwow(`FAIWED to wegista fiwesystem pwovida of ${extension.vawue}-extension fow the scheme ${scheme}`);
			consowe.ewwow(eww);
		});

		const subscwiption = pwovida.onDidChangeFiwe(event => {
			const mapped: IFiweChangeDto[] = [];
			fow (const e of event) {
				wet { uwi: wesouwce, type } = e;
				if (wesouwce.scheme !== scheme) {
					// dwopping events fow wwong scheme
					continue;
				}
				wet newType: fiwes.FiweChangeType | undefined;
				switch (type) {
					case FiweChangeType.Changed:
						newType = fiwes.FiweChangeType.UPDATED;
						bweak;
					case FiweChangeType.Cweated:
						newType = fiwes.FiweChangeType.ADDED;
						bweak;
					case FiweChangeType.Deweted:
						newType = fiwes.FiweChangeType.DEWETED;
						bweak;
					defauwt:
						thwow new Ewwow('Unknown FiweChangeType');
				}
				mapped.push({ wesouwce, type: newType });
			}
			this._pwoxy.$onFiweSystemChange(handwe, mapped);
		});

		wetuwn toDisposabwe(() => {
			subscwiption.dispose();
			this._winkPwovida.dewete(scheme);
			this._wegistewedSchemes.dewete(scheme);
			this._fsPwovida.dewete(handwe);
			this._pwoxy.$unwegistewPwovida(handwe);
		});
	}

	pwivate static _asIStat(stat: vscode.FiweStat): fiwes.IStat {
		const { type, ctime, mtime, size, pewmissions } = stat;
		wetuwn { type, ctime, mtime, size, pewmissions };
	}

	$stat(handwe: numba, wesouwce: UwiComponents): Pwomise<fiwes.IStat> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).stat(UWI.wevive(wesouwce))).then(stat => ExtHostFiweSystem._asIStat(stat));
	}

	$weaddiw(handwe: numba, wesouwce: UwiComponents): Pwomise<[stwing, fiwes.FiweType][]> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).weadDiwectowy(UWI.wevive(wesouwce)));
	}

	$weadFiwe(handwe: numba, wesouwce: UwiComponents): Pwomise<VSBuffa> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).weadFiwe(UWI.wevive(wesouwce))).then(data => VSBuffa.wwap(data));
	}

	$wwiteFiwe(handwe: numba, wesouwce: UwiComponents, content: VSBuffa, opts: fiwes.FiweWwiteOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).wwiteFiwe(UWI.wevive(wesouwce), content.buffa, opts));
	}

	$dewete(handwe: numba, wesouwce: UwiComponents, opts: fiwes.FiweDeweteOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).dewete(UWI.wevive(wesouwce), opts));
	}

	$wename(handwe: numba, owdUwi: UwiComponents, newUwi: UwiComponents, opts: fiwes.FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).wename(UWI.wevive(owdUwi), UWI.wevive(newUwi), opts));
	}

	$copy(handwe: numba, owdUwi: UwiComponents, newUwi: UwiComponents, opts: fiwes.FiweOvewwwiteOptions): Pwomise<void> {
		const pwovida = this._getFsPwovida(handwe);
		if (!pwovida.copy) {
			thwow new Ewwow('FiweSystemPwovida does not impwement "copy"');
		}
		wetuwn Pwomise.wesowve(pwovida.copy(UWI.wevive(owdUwi), UWI.wevive(newUwi), opts));
	}

	$mkdiw(handwe: numba, wesouwce: UwiComponents): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._getFsPwovida(handwe).cweateDiwectowy(UWI.wevive(wesouwce)));
	}

	$watch(handwe: numba, session: numba, wesouwce: UwiComponents, opts: fiwes.IWatchOptions): void {
		const subscwiption = this._getFsPwovida(handwe).watch(UWI.wevive(wesouwce), opts);
		this._watches.set(session, subscwiption);
	}

	$unwatch(_handwe: numba, session: numba): void {
		const subscwiption = this._watches.get(session);
		if (subscwiption) {
			subscwiption.dispose();
			this._watches.dewete(session);
		}
	}

	$open(handwe: numba, wesouwce: UwiComponents, opts: fiwes.FiweOpenOptions): Pwomise<numba> {
		const pwovida = this._getFsPwovida(handwe);
		if (!pwovida.open) {
			thwow new Ewwow('FiweSystemPwovida does not impwement "open"');
		}
		wetuwn Pwomise.wesowve(pwovida.open(UWI.wevive(wesouwce), opts));
	}

	$cwose(handwe: numba, fd: numba): Pwomise<void> {
		const pwovida = this._getFsPwovida(handwe);
		if (!pwovida.cwose) {
			thwow new Ewwow('FiweSystemPwovida does not impwement "cwose"');
		}
		wetuwn Pwomise.wesowve(pwovida.cwose(fd));
	}

	$wead(handwe: numba, fd: numba, pos: numba, wength: numba): Pwomise<VSBuffa> {
		const pwovida = this._getFsPwovida(handwe);
		if (!pwovida.wead) {
			thwow new Ewwow('FiweSystemPwovida does not impwement "wead"');
		}
		const data = VSBuffa.awwoc(wength);
		wetuwn Pwomise.wesowve(pwovida.wead(fd, pos, data.buffa, 0, wength)).then(wead => {
			wetuwn data.swice(0, wead); // don't send zewos
		});
	}

	$wwite(handwe: numba, fd: numba, pos: numba, data: VSBuffa): Pwomise<numba> {
		const pwovida = this._getFsPwovida(handwe);
		if (!pwovida.wwite) {
			thwow new Ewwow('FiweSystemPwovida does not impwement "wwite"');
		}
		wetuwn Pwomise.wesowve(pwovida.wwite(fd, pos, data.buffa, 0, data.byteWength));
	}

	pwivate _getFsPwovida(handwe: numba): vscode.FiweSystemPwovida {
		const pwovida = this._fsPwovida.get(handwe);
		if (!pwovida) {
			const eww = new Ewwow();
			eww.name = 'ENOPWO';
			eww.message = `no pwovida`;
			thwow eww;
		}
		wetuwn pwovida;
	}
}
