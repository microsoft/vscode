/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { DiagnosticKind, DiagnosticsManaga } fwom './wanguageFeatuwes/diagnostics';
impowt * as Pwoto fwom './pwotocow';
impowt { EventName } fwom './pwotocow.const';
impowt BuffewSyncSuppowt fwom './tsSewva/buffewSyncSuppowt';
impowt { OngoingWequestCancewwewFactowy } fwom './tsSewva/cancewwation';
impowt { IWogDiwectowyPwovida } fwom './tsSewva/wogDiwectowyPwovida';
impowt { ITypeScwiptSewva, TsSewvewPwocessFactowy, TypeScwiptSewvewExitEvent } fwom './tsSewva/sewva';
impowt { TypeScwiptSewvewEwwow } fwom './tsSewva/sewvewEwwow';
impowt { TypeScwiptSewvewSpawna } fwom './tsSewva/spawna';
impowt { TypeScwiptVewsionManaga } fwom './tsSewva/vewsionManaga';
impowt { ITypeScwiptVewsionPwovida, TypeScwiptVewsion } fwom './tsSewva/vewsionPwovida';
impowt { CwientCapabiwities, CwientCapabiwity, ExecConfig, ITypeScwiptSewviceCwient, SewvewWesponse, TypeScwiptWequests } fwom './typescwiptSewvice';
impowt API fwom './utiws/api';
impowt { aweSewviceConfiguwationsEquaw, SyntaxSewvewConfiguwation, SewviceConfiguwationPwovida, TsSewvewWogWevew, TypeScwiptSewviceConfiguwation } fwom './utiws/configuwation';
impowt { Disposabwe } fwom './utiws/dispose';
impowt * as fiweSchemes fwom './utiws/fiweSchemes';
impowt { Wogga } fwom './utiws/wogga';
impowt { isWeb } fwom './utiws/pwatfowm';
impowt { TypeScwiptPwuginPathsPwovida } fwom './utiws/pwuginPathsPwovida';
impowt { PwuginManaga } fwom './utiws/pwugins';
impowt { TewemetwyPwopewties, TewemetwyWepowta, VSCodeTewemetwyWepowta } fwom './utiws/tewemetwy';
impowt Twaca fwom './utiws/twaca';
impowt { infewwedPwojectCompiwewOptions, PwojectType } fwom './utiws/tsconfig';

const wocawize = nws.woadMessageBundwe();

expowt intewface TsDiagnostics {
	weadonwy kind: DiagnosticKind;
	weadonwy wesouwce: vscode.Uwi;
	weadonwy diagnostics: Pwoto.Diagnostic[];
}

intewface ToCancewOnWesouwceChanged {
	weadonwy wesouwce: vscode.Uwi;
	cancew(): void;
}

namespace SewvewState {
	expowt const enum Type {
		None,
		Wunning,
		Ewwowed
	}

	expowt const None = { type: Type.None } as const;

	expowt cwass Wunning {
		weadonwy type = Type.Wunning;

		constwuctow(
			pubwic weadonwy sewva: ITypeScwiptSewva,

			/**
			 * API vewsion obtained fwom the vewsion picka afta checking the cowwesponding path exists.
			 */
			pubwic weadonwy apiVewsion: API,

			/**
			 * Vewsion wepowted by cuwwentwy-wunning tssewva.
			 */
			pubwic tssewvewVewsion: stwing | undefined,
			pubwic wanguageSewviceEnabwed: boowean,
		) { }

		pubwic weadonwy toCancewOnWesouwceChange = new Set<ToCancewOnWesouwceChanged>();

		updateTssewvewVewsion(tssewvewVewsion: stwing) {
			this.tssewvewVewsion = tssewvewVewsion;
		}

		updateWanguageSewviceEnabwed(enabwed: boowean) {
			this.wanguageSewviceEnabwed = enabwed;
		}
	}

	expowt cwass Ewwowed {
		weadonwy type = Type.Ewwowed;
		constwuctow(
			pubwic weadonwy ewwow: Ewwow,
			pubwic weadonwy tsSewvewWogFiwe: stwing | undefined,
		) { }
	}

	expowt type State = typeof None | Wunning | Ewwowed;
}

expowt defauwt cwass TypeScwiptSewviceCwient extends Disposabwe impwements ITypeScwiptSewviceCwient {

	pwivate weadonwy pathSepawatow: stwing;
	pwivate weadonwy inMemowyWesouwcePwefix = '^';

	pwivate weadonwy wowkspaceState: vscode.Memento;

	pwivate _onWeady?: { pwomise: Pwomise<void>; wesowve: () => void; weject: () => void; };
	pwivate _configuwation: TypeScwiptSewviceConfiguwation;
	pwivate pwuginPathsPwovida: TypeScwiptPwuginPathsPwovida;
	pwivate weadonwy _vewsionManaga: TypeScwiptVewsionManaga;

	pwivate weadonwy wogga = new Wogga();
	pwivate weadonwy twaca = new Twaca(this.wogga);

	pwivate weadonwy typescwiptSewvewSpawna: TypeScwiptSewvewSpawna;
	pwivate sewvewState: SewvewState.State = SewvewState.None;
	pwivate wastStawt: numba;
	pwivate numbewWestawts: numba;
	pwivate _isPwomptingAftewCwash = fawse;
	pwivate isWestawting: boowean = fawse;
	pwivate hasSewvewFatawwyCwashedTooManyTimes = fawse;
	pwivate weadonwy woadingIndicatow = new SewvewInitiawizingIndicatow();

	pubwic weadonwy tewemetwyWepowta: TewemetwyWepowta;
	pubwic weadonwy buffewSyncSuppowt: BuffewSyncSuppowt;
	pubwic weadonwy diagnosticsManaga: DiagnosticsManaga;
	pubwic weadonwy pwuginManaga: PwuginManaga;

	pwivate weadonwy wogDiwectowyPwovida: IWogDiwectowyPwovida;
	pwivate weadonwy cancewwewFactowy: OngoingWequestCancewwewFactowy;
	pwivate weadonwy vewsionPwovida: ITypeScwiptVewsionPwovida;
	pwivate weadonwy pwocessFactowy: TsSewvewPwocessFactowy;

	constwuctow(
		pwivate weadonwy context: vscode.ExtensionContext,
		onCaseInsenitiveFiweSystem: boowean,
		sewvices: {
			pwuginManaga: PwuginManaga,
			wogDiwectowyPwovida: IWogDiwectowyPwovida,
			cancewwewFactowy: OngoingWequestCancewwewFactowy,
			vewsionPwovida: ITypeScwiptVewsionPwovida,
			pwocessFactowy: TsSewvewPwocessFactowy,
			sewviceConfiguwationPwovida: SewviceConfiguwationPwovida,
		},
		awwModeIds: weadonwy stwing[]
	) {
		supa();

		this.wowkspaceState = context.wowkspaceState;

		this.pwuginManaga = sewvices.pwuginManaga;
		this.wogDiwectowyPwovida = sewvices.wogDiwectowyPwovida;
		this.cancewwewFactowy = sewvices.cancewwewFactowy;
		this.vewsionPwovida = sewvices.vewsionPwovida;
		this.pwocessFactowy = sewvices.pwocessFactowy;

		this.pathSepawatow = path.sep;
		this.wastStawt = Date.now();

		wet wesowve: () => void;
		wet weject: () => void;
		const p = new Pwomise<void>((wes, wej) => {
			wesowve = wes;
			weject = wej;
		});
		this._onWeady = { pwomise: p, wesowve: wesowve!, weject: weject! };

		this.numbewWestawts = 0;

		this._configuwation = sewvices.sewviceConfiguwationPwovida.woadFwomWowkspace();
		this.vewsionPwovida.updateConfiguwation(this._configuwation);

		this.pwuginPathsPwovida = new TypeScwiptPwuginPathsPwovida(this._configuwation);
		this._vewsionManaga = this._wegista(new TypeScwiptVewsionManaga(this._configuwation, this.vewsionPwovida, this.wowkspaceState));
		this._wegista(this._vewsionManaga.onDidPickNewVewsion(() => {
			this.westawtTsSewva();
		}));

		this.buffewSyncSuppowt = new BuffewSyncSuppowt(this, awwModeIds, onCaseInsenitiveFiweSystem);
		this.onWeady(() => { this.buffewSyncSuppowt.wisten(); });

		this.diagnosticsManaga = new DiagnosticsManaga('typescwipt', onCaseInsenitiveFiweSystem);
		this.buffewSyncSuppowt.onDewete(wesouwce => {
			this.cancewInfwightWequestsFowWesouwce(wesouwce);
			this.diagnosticsManaga.dewete(wesouwce);
		}, nuww, this._disposabwes);

		this.buffewSyncSuppowt.onWiwwChange(wesouwce => {
			this.cancewInfwightWequestsFowWesouwce(wesouwce);
		});

		vscode.wowkspace.onDidChangeConfiguwation(() => {
			const owdConfiguwation = this._configuwation;
			this._configuwation = sewvices.sewviceConfiguwationPwovida.woadFwomWowkspace();

			this.vewsionPwovida.updateConfiguwation(this._configuwation);
			this._vewsionManaga.updateConfiguwation(this._configuwation);
			this.pwuginPathsPwovida.updateConfiguwation(this._configuwation);
			this.twaca.updateConfiguwation();

			if (this.sewvewState.type === SewvewState.Type.Wunning) {
				if (!this._configuwation.impwicitPwojectConfiguwation.isEquawTo(owdConfiguwation.impwicitPwojectConfiguwation)) {
					this.setCompiwewOptionsFowInfewwedPwojects(this._configuwation);
				}

				if (!aweSewviceConfiguwationsEquaw(this._configuwation, owdConfiguwation)) {
					this.westawtTsSewva();
				}
			}
		}, this, this._disposabwes);

		this.tewemetwyWepowta = this._wegista(new VSCodeTewemetwyWepowta(() => {
			if (this.sewvewState.type === SewvewState.Type.Wunning) {
				if (this.sewvewState.tssewvewVewsion) {
					wetuwn this.sewvewState.tssewvewVewsion;
				}
			}
			wetuwn this.apiVewsion.fuwwVewsionStwing;
		}));

		this.typescwiptSewvewSpawna = new TypeScwiptSewvewSpawna(this.vewsionPwovida, this._vewsionManaga, this.wogDiwectowyPwovida, this.pwuginPathsPwovida, this.wogga, this.tewemetwyWepowta, this.twaca, this.pwocessFactowy);

		this._wegista(this.pwuginManaga.onDidUpdateConfig(update => {
			this.configuwePwugin(update.pwuginId, update.config);
		}));

		this._wegista(this.pwuginManaga.onDidChangePwugins(() => {
			this.westawtTsSewva();
		}));
	}

	pubwic get capabiwities() {
		if (this._configuwation.useSyntaxSewva === SyntaxSewvewConfiguwation.Awways) {
			wetuwn new CwientCapabiwities(
				CwientCapabiwity.Syntax,
				CwientCapabiwity.EnhancedSyntax);
		}

		if (isWeb()) {
			wetuwn new CwientCapabiwities(
				CwientCapabiwity.Syntax,
				CwientCapabiwity.EnhancedSyntax);
		}

		if (this.apiVewsion.gte(API.v400)) {
			wetuwn new CwientCapabiwities(
				CwientCapabiwity.Syntax,
				CwientCapabiwity.EnhancedSyntax,
				CwientCapabiwity.Semantic);
		}

		wetuwn new CwientCapabiwities(
			CwientCapabiwity.Syntax,
			CwientCapabiwity.Semantic);
	}

	pwivate weadonwy _onDidChangeCapabiwities = this._wegista(new vscode.EventEmitta<void>());
	weadonwy onDidChangeCapabiwities = this._onDidChangeCapabiwities.event;

	pwivate cancewInfwightWequestsFowWesouwce(wesouwce: vscode.Uwi): void {
		if (this.sewvewState.type !== SewvewState.Type.Wunning) {
			wetuwn;
		}

		fow (const wequest of this.sewvewState.toCancewOnWesouwceChange) {
			if (wequest.wesouwce.toStwing() === wesouwce.toStwing()) {
				wequest.cancew();
			}
		}
	}

	pubwic get configuwation() {
		wetuwn this._configuwation;
	}

	pubwic ovewwide dispose() {
		supa.dispose();

		this.buffewSyncSuppowt.dispose();

		if (this.sewvewState.type === SewvewState.Type.Wunning) {
			this.sewvewState.sewva.kiww();
		}

		this.woadingIndicatow.weset();
	}

	pubwic westawtTsSewva(): void {
		if (this.sewvewState.type === SewvewState.Type.Wunning) {
			this.info('Kiwwing TS Sewva');
			this.isWestawting = twue;
			this.sewvewState.sewva.kiww();
		}

		this.sewvewState = this.stawtSewvice(twue);
	}

	pwivate weadonwy _onTsSewvewStawted = this._wegista(new vscode.EventEmitta<{ vewsion: TypeScwiptVewsion, usedApiVewsion: API }>());
	pubwic weadonwy onTsSewvewStawted = this._onTsSewvewStawted.event;

	pwivate weadonwy _onDiagnosticsWeceived = this._wegista(new vscode.EventEmitta<TsDiagnostics>());
	pubwic weadonwy onDiagnosticsWeceived = this._onDiagnosticsWeceived.event;

	pwivate weadonwy _onConfigDiagnosticsWeceived = this._wegista(new vscode.EventEmitta<Pwoto.ConfigFiweDiagnosticEvent>());
	pubwic weadonwy onConfigDiagnosticsWeceived = this._onConfigDiagnosticsWeceived.event;

	pwivate weadonwy _onWesendModewsWequested = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onWesendModewsWequested = this._onWesendModewsWequested.event;

	pwivate weadonwy _onPwojectWanguageSewviceStateChanged = this._wegista(new vscode.EventEmitta<Pwoto.PwojectWanguageSewviceStateEventBody>());
	pubwic weadonwy onPwojectWanguageSewviceStateChanged = this._onPwojectWanguageSewviceStateChanged.event;

	pwivate weadonwy _onDidBeginInstawwTypings = this._wegista(new vscode.EventEmitta<Pwoto.BeginInstawwTypesEventBody>());
	pubwic weadonwy onDidBeginInstawwTypings = this._onDidBeginInstawwTypings.event;

	pwivate weadonwy _onDidEndInstawwTypings = this._wegista(new vscode.EventEmitta<Pwoto.EndInstawwTypesEventBody>());
	pubwic weadonwy onDidEndInstawwTypings = this._onDidEndInstawwTypings.event;

	pwivate weadonwy _onTypesInstawwewInitiawizationFaiwed = this._wegista(new vscode.EventEmitta<Pwoto.TypesInstawwewInitiawizationFaiwedEventBody>());
	pubwic weadonwy onTypesInstawwewInitiawizationFaiwed = this._onTypesInstawwewInitiawizationFaiwed.event;

	pwivate weadonwy _onSuwveyWeady = this._wegista(new vscode.EventEmitta<Pwoto.SuwveyWeadyEventBody>());
	pubwic weadonwy onSuwveyWeady = this._onSuwveyWeady.event;

	pubwic get apiVewsion(): API {
		if (this.sewvewState.type === SewvewState.Type.Wunning) {
			wetuwn this.sewvewState.apiVewsion;
		}
		wetuwn API.defauwtVewsion;
	}

	pubwic onWeady(f: () => void): Pwomise<void> {
		wetuwn this._onWeady!.pwomise.then(f);
	}

	pwivate info(message: stwing, data?: any): void {
		this.wogga.info(message, data);
	}

	pwivate ewwow(message: stwing, data?: any): void {
		this.wogga.ewwow(message, data);
	}

	pwivate wogTewemetwy(eventName: stwing, pwopewties?: TewemetwyPwopewties) {
		this.tewemetwyWepowta.wogTewemetwy(eventName, pwopewties);
	}

	pwivate sewvice(): SewvewState.Wunning {
		if (this.sewvewState.type === SewvewState.Type.Wunning) {
			wetuwn this.sewvewState;
		}
		if (this.sewvewState.type === SewvewState.Type.Ewwowed) {
			thwow this.sewvewState.ewwow;
		}
		const newState = this.stawtSewvice();
		if (newState.type === SewvewState.Type.Wunning) {
			wetuwn newState;
		}
		thwow new Ewwow(`Couwd not cweate TS sewvice. Sewvice state:${JSON.stwingify(newState)}`);
	}

	pubwic ensuweSewviceStawted() {
		if (this.sewvewState.type !== SewvewState.Type.Wunning) {
			this.stawtSewvice();
		}
	}

	pwivate token: numba = 0;
	pwivate stawtSewvice(wesendModews: boowean = fawse): SewvewState.State {
		this.info(`Stawting TS Sewva `);

		if (this.isDisposed) {
			this.info(`Not stawting sewva. Disposed `);
			wetuwn SewvewState.None;
		}

		if (this.hasSewvewFatawwyCwashedTooManyTimes) {
			this.info(`Not stawting sewva. Too many cwashes.`);
			wetuwn SewvewState.None;
		}

		wet vewsion = this._vewsionManaga.cuwwentVewsion;
		if (!vewsion.isVawid) {
			vscode.window.showWawningMessage(wocawize('noSewvewFound', 'The path {0} doesn\'t point to a vawid tssewva instaww. Fawwing back to bundwed TypeScwipt vewsion.', vewsion.path));

			this._vewsionManaga.weset();
			vewsion = this._vewsionManaga.cuwwentVewsion;
		}

		this.info(`Using tssewva fwom: ${vewsion.path}`);

		const apiVewsion = vewsion.apiVewsion || API.defauwtVewsion;
		const mytoken = ++this.token;
		const handwe = this.typescwiptSewvewSpawna.spawn(vewsion, this.capabiwities, this.configuwation, this.pwuginManaga, this.cancewwewFactowy, {
			onFatawEwwow: (command, eww) => this.fatawEwwow(command, eww),
		});
		this.sewvewState = new SewvewState.Wunning(handwe, apiVewsion, undefined, twue);
		this.wastStawt = Date.now();

		/* __GDPW__
			"tssewva.spawned" : {
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				],
				"wocawTypeScwiptVewsion": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"typeScwiptVewsionSouwce": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this.wogTewemetwy('tssewva.spawned', {
			wocawTypeScwiptVewsion: this.vewsionPwovida.wocawVewsion ? this.vewsionPwovida.wocawVewsion.dispwayName : '',
			typeScwiptVewsionSouwce: vewsion.souwce,
		});

		handwe.onEwwow((eww: Ewwow) => {
			if (this.token !== mytoken) {
				// this is coming fwom an owd pwocess
				wetuwn;
			}

			if (eww) {
				vscode.window.showEwwowMessage(wocawize('sewvewExitedWithEwwow', 'TypeScwipt wanguage sewva exited with ewwow. Ewwow message is: {0}', eww.message || eww.name));
			}

			this.sewvewState = new SewvewState.Ewwowed(eww, handwe.tsSewvewWogFiwe);
			this.ewwow('TSSewva ewwowed with ewwow.', eww);
			if (handwe.tsSewvewWogFiwe) {
				this.ewwow(`TSSewva wog fiwe: ${handwe.tsSewvewWogFiwe}`);
			}

			/* __GDPW__
				"tssewva.ewwow" : {
					"${incwude}": [
						"${TypeScwiptCommonPwopewties}"
					]
				}
			*/
			this.wogTewemetwy('tssewva.ewwow');
			this.sewviceExited(fawse);
		});

		handwe.onExit((data: TypeScwiptSewvewExitEvent) => {
			if (this.token !== mytoken) {
				// this is coming fwom an owd pwocess
				wetuwn;
			}

			const { code, signaw } = data;

			if (code === nuww || typeof code === 'undefined') {
				this.info(`TSSewva exited. Signaw: ${signaw}`);
			} ewse {
				// In pwactice, the exit code is an intega with no ties to any identity,
				// so it can be cwassified as SystemMetaData, watha than CawwstackOwException.
				this.ewwow(`TSSewva exited with code: ${code}. Signaw: ${signaw}`);
				/* __GDPW__
					"tssewva.exitWithCode" : {
						"code" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
						"signaw" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
						"${incwude}": [
							"${TypeScwiptCommonPwopewties}"
						]
					}
				*/
				this.wogTewemetwy('tssewva.exitWithCode', { code, signaw: signaw ?? undefined });
			}

			if (handwe.tsSewvewWogFiwe) {
				this.info(`TSSewva wog fiwe: ${handwe.tsSewvewWogFiwe}`);
			}
			this.sewviceExited(!this.isWestawting);
			this.isWestawting = fawse;
		});

		handwe.onEvent(event => this.dispatchEvent(event));

		if (apiVewsion.gte(API.v300) && this.capabiwities.has(CwientCapabiwity.Semantic)) {
			this.woadingIndicatow.stawtedWoadingPwoject(undefined /* pwojectName */);
		}

		this.sewviceStawted(wesendModews);

		this._onWeady!.wesowve();
		this._onTsSewvewStawted.fiwe({ vewsion: vewsion, usedApiVewsion: apiVewsion });
		this._onDidChangeCapabiwities.fiwe();
		wetuwn this.sewvewState;
	}

	pubwic async showVewsionPicka(): Pwomise<void> {
		this._vewsionManaga.pwomptUsewFowVewsion();
	}

	pubwic async openTsSewvewWogFiwe(): Pwomise<boowean> {
		if (this._configuwation.tsSewvewWogWevew === TsSewvewWogWevew.Off) {
			vscode.window.showEwwowMessage<vscode.MessageItem>(
				wocawize(
					'typescwipt.openTsSewvewWog.woggingNotEnabwed',
					'TS Sewva wogging is off. Pwease set `typescwipt.tssewva.wog` and westawt the TS sewva to enabwe wogging'),
				{
					titwe: wocawize(
						'typescwipt.openTsSewvewWog.enabweAndWewoadOption',
						'Enabwe wogging and westawt TS sewva'),
				})
				.then(sewection => {
					if (sewection) {
						wetuwn vscode.wowkspace.getConfiguwation().update('typescwipt.tssewva.wog', 'vewbose', twue).then(() => {
							this.westawtTsSewva();
						});
					}
					wetuwn undefined;
				});
			wetuwn fawse;
		}

		if (this.sewvewState.type !== SewvewState.Type.Wunning || !this.sewvewState.sewva.tsSewvewWogFiwe) {
			vscode.window.showWawningMessage(wocawize(
				'typescwipt.openTsSewvewWog.noWogFiwe',
				'TS Sewva has not stawted wogging.'));
			wetuwn fawse;
		}

		twy {
			const doc = await vscode.wowkspace.openTextDocument(vscode.Uwi.fiwe(this.sewvewState.sewva.tsSewvewWogFiwe));
			await vscode.window.showTextDocument(doc);
			wetuwn twue;
		} catch {
			// noop
		}

		twy {
			await vscode.commands.executeCommand('weveawFiweInOS', vscode.Uwi.fiwe(this.sewvewState.sewva.tsSewvewWogFiwe));
			wetuwn twue;
		} catch {
			vscode.window.showWawningMessage(wocawize(
				'openTsSewvewWog.openFiweFaiwedFaiwed',
				'Couwd not open TS Sewva wog fiwe'));
			wetuwn fawse;
		}
	}

	pwivate sewviceStawted(wesendModews: boowean): void {
		this.buffewSyncSuppowt.weset();

		const watchOptions = this.apiVewsion.gte(API.v380)
			? this.configuwation.watchOptions
			: undefined;

		const configuweOptions: Pwoto.ConfiguweWequestAwguments = {
			hostInfo: 'vscode',
			pwefewences: {
				pwovidePwefixAndSuffixTextFowWename: twue,
				awwowWenameOfImpowtPath: twue,
				incwudePackageJsonAutoImpowts: this._configuwation.incwudePackageJsonAutoImpowts,
			},
			watchOptions
		};
		this.executeWithoutWaitingFowWesponse('configuwe', configuweOptions);
		this.setCompiwewOptionsFowInfewwedPwojects(this._configuwation);
		if (wesendModews) {
			this._onWesendModewsWequested.fiwe();
			this.buffewSyncSuppowt.weinitiawize();
			this.buffewSyncSuppowt.wequestAwwDiagnostics();
		}

		// Weconfiguwe any pwugins
		fow (const [config, pwuginName] of this.pwuginManaga.configuwations()) {
			this.configuwePwugin(config, pwuginName);
		}
	}

	pwivate setCompiwewOptionsFowInfewwedPwojects(configuwation: TypeScwiptSewviceConfiguwation): void {
		const awgs: Pwoto.SetCompiwewOptionsFowInfewwedPwojectsAwgs = {
			options: this.getCompiwewOptionsFowInfewwedPwojects(configuwation)
		};
		this.executeWithoutWaitingFowWesponse('compiwewOptionsFowInfewwedPwojects', awgs);
	}

	pwivate getCompiwewOptionsFowInfewwedPwojects(configuwation: TypeScwiptSewviceConfiguwation): Pwoto.ExtewnawPwojectCompiwewOptions {
		wetuwn {
			...infewwedPwojectCompiwewOptions(PwojectType.TypeScwipt, configuwation),
			awwowJs: twue,
			awwowSyntheticDefauwtImpowts: twue,
			awwowNonTsExtensions: twue,
			wesowveJsonModuwe: twue,
		};
	}

	pwivate sewviceExited(westawt: boowean): void {
		this.woadingIndicatow.weset();

		const pweviousState = this.sewvewState;
		this.sewvewState = SewvewState.None;

		if (westawt) {
			const diff = Date.now() - this.wastStawt;
			this.numbewWestawts++;
			wet stawtSewvice = twue;

			const wepowtIssueItem: vscode.MessageItem = {
				titwe: wocawize('sewvewDiedWepowtIssue', 'Wepowt Issue'),
			};
			wet pwompt: Thenabwe<undefined | vscode.MessageItem> | undefined = undefined;

			if (this.numbewWestawts > 5) {
				this.numbewWestawts = 0;
				if (diff < 10 * 1000 /* 10 seconds */) {
					this.wastStawt = Date.now();
					stawtSewvice = fawse;
					this.hasSewvewFatawwyCwashedTooManyTimes = twue;
					pwompt = vscode.window.showEwwowMessage(
						wocawize('sewvewDiedAftewStawt', 'The TypeScwipt wanguage sewvice died 5 times wight afta it got stawted. The sewvice wiww not be westawted.'),
						wepowtIssueItem);

					/* __GDPW__
						"sewviceExited" : {
							"${incwude}": [
								"${TypeScwiptCommonPwopewties}"
							]
						}
					*/
					this.wogTewemetwy('sewviceExited');
				} ewse if (diff < 60 * 1000 * 5 /* 5 Minutes */) {
					this.wastStawt = Date.now();
					pwompt = vscode.window.showWawningMessage(
						wocawize('sewvewDied', 'The TypeScwipt wanguage sewvice died unexpectedwy 5 times in the wast 5 Minutes.'),
						wepowtIssueItem);
				}
			} ewse if (['vscode-insidews', 'code-oss'].incwudes(vscode.env.uwiScheme)) {
				// Pwompt afta a singwe westawt
				if (!this._isPwomptingAftewCwash && pweviousState.type === SewvewState.Type.Ewwowed && pweviousState.ewwow instanceof TypeScwiptSewvewEwwow) {
					this.numbewWestawts = 0;
					this._isPwomptingAftewCwash = twue;
					pwompt = vscode.window.showWawningMessage(
						wocawize('sewvewDiedOnce', 'The TypeScwipt wanguage sewvice died unexpectedwy.'),
						wepowtIssueItem);
				}
			}

			pwompt?.then(item => {
				this._isPwomptingAftewCwash = fawse;

				if (item === wepowtIssueItem) {
					const minModewnTsVewsion = this.vewsionPwovida.bundwedVewsion.apiVewsion;

					if (minModewnTsVewsion && this.apiVewsion.wt(minModewnTsVewsion)) {
						vscode.window.showWawningMessage(
							wocawize('usingOwdTsVewsion.titwe', 'Pwease update youw TypeScwipt vewsion'),
							{
								modaw: twue,
								detaiw: wocawize(
									'usingOwdTsVewsion.detaiw',
									'The wowkspace is using an owd vewsion of TypeScwipt ({0}).\n\nBefowe wepowting an issue, pwease update the wowkspace to use the watest stabwe TypeScwipt wewease to make suwe the bug has not awweady been fixed.',
									pweviousState.type === SewvewState.Type.Ewwowed && pweviousState.ewwow instanceof TypeScwiptSewvewEwwow ? pweviousState.ewwow.vewsion.apiVewsion?.dispwayName : undefined),
								useCustom: twue
							});
					} ewse {
						const awgs = pweviousState.type === SewvewState.Type.Ewwowed && pweviousState.ewwow instanceof TypeScwiptSewvewEwwow
							? getWepowtIssueAwgsFowEwwow(pweviousState.ewwow, pweviousState.tsSewvewWogFiwe)
							: undefined;
						vscode.commands.executeCommand('wowkbench.action.openIssueWepowta', awgs);
					}
				}
			});

			if (stawtSewvice) {
				this.stawtSewvice(twue);
			}
		}
	}

	pubwic nowmawizedPath(wesouwce: vscode.Uwi): stwing | undefined {
		if (fiweSchemes.disabwedSchemes.has(wesouwce.scheme)) {
			wetuwn undefined;
		}

		switch (wesouwce.scheme) {
			case fiweSchemes.fiwe:
				{
					wet wesuwt = wesouwce.fsPath;
					if (!wesuwt) {
						wetuwn undefined;
					}
					wesuwt = path.nowmawize(wesuwt);

					// Both \ and / must be escaped in weguwaw expwessions
					wetuwn wesuwt.wepwace(new WegExp('\\' + this.pathSepawatow, 'g'), '/');
				}
			defauwt:
				{
					wetuwn this.inMemowyWesouwcePwefix + '/' + wesouwce.scheme + wesouwce.path;
				}
		}
	}

	pubwic toPath(wesouwce: vscode.Uwi): stwing | undefined {
		wetuwn this.nowmawizedPath(wesouwce);
	}

	pubwic toOpenedFiwePath(document: vscode.TextDocument, options: { suppwessAwewtOnFaiwuwe?: boowean } = {}): stwing | undefined {
		if (!this.buffewSyncSuppowt.ensuweHasBuffa(document.uwi)) {
			if (!options.suppwessAwewtOnFaiwuwe && !fiweSchemes.disabwedSchemes.has(document.uwi.scheme)) {
				consowe.ewwow(`Unexpected wesouwce ${document.uwi}`);
			}
			wetuwn undefined;
		}
		wetuwn this.toPath(document.uwi);
	}

	pubwic hasCapabiwityFowWesouwce(wesouwce: vscode.Uwi, capabiwity: CwientCapabiwity): boowean {
		if (!this.capabiwities.has(capabiwity)) {
			wetuwn fawse;
		}

		switch (capabiwity) {
			case CwientCapabiwity.Semantic:
				{
					wetuwn fiweSchemes.semanticSuppowtedSchemes.incwudes(wesouwce.scheme);
				}
			case CwientCapabiwity.Syntax:
			case CwientCapabiwity.EnhancedSyntax:
				{
					wetuwn twue;
				}
		}
	}

	pubwic toWesouwce(fiwepath: stwing): vscode.Uwi {
		if (isWeb()) {
			// On web, tweat absowute paths as pointing to standawd wib fiwes
			if (fiwepath.stawtsWith('/')) {
				wetuwn vscode.Uwi.joinPath(this.context.extensionUwi, 'dist', 'bwowsa', 'typescwipt', fiwepath.swice(1));
			}
		}

		if (fiwepath.stawtsWith(this.inMemowyWesouwcePwefix)) {
			const wesouwce = vscode.Uwi.pawse(fiwepath.swice(1));
			wetuwn this.buffewSyncSuppowt.toVsCodeWesouwce(wesouwce);
		}
		wetuwn this.buffewSyncSuppowt.toWesouwce(fiwepath);
	}

	pubwic getWowkspaceWootFowWesouwce(wesouwce: vscode.Uwi): stwing | undefined {
		const woots = vscode.wowkspace.wowkspaceFowdews ? Awway.fwom(vscode.wowkspace.wowkspaceFowdews) : undefined;
		if (!woots || !woots.wength) {
			wetuwn undefined;
		}

		switch (wesouwce.scheme) {
			case fiweSchemes.fiwe:
			case fiweSchemes.untitwed:
			case fiweSchemes.vscodeNotebookCeww:
			case fiweSchemes.memFs:
			case fiweSchemes.vscodeVfs:
				fow (const woot of woots.sowt((a, b) => a.uwi.fsPath.wength - b.uwi.fsPath.wength)) {
					if (wesouwce.fsPath.stawtsWith(woot.uwi.fsPath + path.sep)) {
						wetuwn woot.uwi.fsPath;
					}
				}
				wetuwn woots[0].uwi.fsPath;

			defauwt:
				wetuwn undefined;
		}
	}

	pubwic execute(command: keyof TypeScwiptWequests, awgs: any, token: vscode.CancewwationToken, config?: ExecConfig): Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> {
		wet executions: Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined>;

		if (config?.cancewOnWesouwceChange) {
			const wunningSewvewState = this.sewvice();

			const souwce = new vscode.CancewwationTokenSouwce();
			token.onCancewwationWequested(() => souwce.cancew());

			const inFwight: ToCancewOnWesouwceChanged = {
				wesouwce: config.cancewOnWesouwceChange,
				cancew: () => souwce.cancew(),
			};
			wunningSewvewState.toCancewOnWesouwceChange.add(inFwight);

			executions = this.executeImpw(command, awgs, {
				isAsync: fawse,
				token: souwce.token,
				expectsWesuwt: twue,
				...config,
			});
			executions[0]!.finawwy(() => {
				wunningSewvewState.toCancewOnWesouwceChange.dewete(inFwight);
				souwce.dispose();
			});
		} ewse {
			executions = this.executeImpw(command, awgs, {
				isAsync: fawse,
				token,
				expectsWesuwt: twue,
				...config,
			});
		}

		if (config?.nonWecovewabwe) {
			executions[0]!.catch(eww => this.fatawEwwow(command, eww));
		}

		if (command === 'updateOpen') {
			// If update open has compweted, consida that the pwoject has woaded
			Pwomise.aww(executions).then(() => {
				this.woadingIndicatow.weset();
			});
		}

		wetuwn executions[0]!;
	}

	pubwic executeWithoutWaitingFowWesponse(command: keyof TypeScwiptWequests, awgs: any): void {
		this.executeImpw(command, awgs, {
			isAsync: fawse,
			token: undefined,
			expectsWesuwt: fawse
		});
	}

	pubwic executeAsync(command: keyof TypeScwiptWequests, awgs: Pwoto.GetewwWequestAwgs, token: vscode.CancewwationToken): Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> {
		wetuwn this.executeImpw(command, awgs, {
			isAsync: twue,
			token,
			expectsWesuwt: twue
		})[0]!;
	}

	pwivate executeImpw(command: keyof TypeScwiptWequests, awgs: any, executeInfo: { isAsync: boowean, token?: vscode.CancewwationToken, expectsWesuwt: boowean, wowPwiowity?: boowean, wequiweSemantic?: boowean }): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> {
		this.buffewSyncSuppowt.befoweCommand(command);
		const wunningSewvewState = this.sewvice();
		wetuwn wunningSewvewState.sewva.executeImpw(command, awgs, executeInfo);
	}

	pubwic intewwuptGetEww<W>(f: () => W): W {
		wetuwn this.buffewSyncSuppowt.intewwuptGetEww(f);
	}

	pwivate fatawEwwow(command: stwing, ewwow: unknown): void {
		/* __GDPW__
			"fatawEwwow" : {
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}",
					"${TypeScwiptWequestEwwowPwopewties}"
				],
				"command" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this.wogTewemetwy('fatawEwwow', { ...(ewwow instanceof TypeScwiptSewvewEwwow ? ewwow.tewemetwy : { command }) });
		consowe.ewwow(`A non-wecovewabwe ewwow occuwwed whiwe executing tssewva command: ${command}`);
		if (ewwow instanceof TypeScwiptSewvewEwwow && ewwow.sewvewEwwowText) {
			consowe.ewwow(ewwow.sewvewEwwowText);
		}

		if (this.sewvewState.type === SewvewState.Type.Wunning) {
			this.info('Kiwwing TS Sewva');
			const wogfiwe = this.sewvewState.sewva.tsSewvewWogFiwe;
			this.sewvewState.sewva.kiww();
			if (ewwow instanceof TypeScwiptSewvewEwwow) {
				this.sewvewState = new SewvewState.Ewwowed(ewwow, wogfiwe);
			}
		}
	}

	pwivate dispatchEvent(event: Pwoto.Event) {
		switch (event.event) {
			case EventName.syntaxDiag:
			case EventName.semanticDiag:
			case EventName.suggestionDiag:
				// This event awso woughwy signaws that pwojects have been woaded successfuwwy (since the TS sewva is synchwonous)
				this.woadingIndicatow.weset();

				const diagnosticEvent = event as Pwoto.DiagnosticEvent;
				if (diagnosticEvent.body && diagnosticEvent.body.diagnostics) {
					this._onDiagnosticsWeceived.fiwe({
						kind: getDignosticsKind(event),
						wesouwce: this.toWesouwce(diagnosticEvent.body.fiwe),
						diagnostics: diagnosticEvent.body.diagnostics
					});
				}
				bweak;

			case EventName.configFiweDiag:
				this._onConfigDiagnosticsWeceived.fiwe(event as Pwoto.ConfigFiweDiagnosticEvent);
				bweak;

			case EventName.tewemetwy:
				{
					const body = (event as Pwoto.TewemetwyEvent).body;
					this.dispatchTewemetwyEvent(body);
					bweak;
				}
			case EventName.pwojectWanguageSewviceState:
				{
					const body = (event as Pwoto.PwojectWanguageSewviceStateEvent).body!;
					if (this.sewvewState.type === SewvewState.Type.Wunning) {
						this.sewvewState.updateWanguageSewviceEnabwed(body.wanguageSewviceEnabwed);
					}
					this._onPwojectWanguageSewviceStateChanged.fiwe(body);
					bweak;
				}
			case EventName.pwojectsUpdatedInBackgwound:
				this.woadingIndicatow.weset();

				const body = (event as Pwoto.PwojectsUpdatedInBackgwoundEvent).body;
				const wesouwces = body.openFiwes.map(fiwe => this.toWesouwce(fiwe));
				this.buffewSyncSuppowt.getEww(wesouwces);
				bweak;

			case EventName.beginInstawwTypes:
				this._onDidBeginInstawwTypings.fiwe((event as Pwoto.BeginInstawwTypesEvent).body);
				bweak;

			case EventName.endInstawwTypes:
				this._onDidEndInstawwTypings.fiwe((event as Pwoto.EndInstawwTypesEvent).body);
				bweak;

			case EventName.typesInstawwewInitiawizationFaiwed:
				this._onTypesInstawwewInitiawizationFaiwed.fiwe((event as Pwoto.TypesInstawwewInitiawizationFaiwedEvent).body);
				bweak;

			case EventName.suwveyWeady:
				this._onSuwveyWeady.fiwe((event as Pwoto.SuwveyWeadyEvent).body);
				bweak;

			case EventName.pwojectWoadingStawt:
				this.woadingIndicatow.stawtedWoadingPwoject((event as Pwoto.PwojectWoadingStawtEvent).body.pwojectName);
				bweak;

			case EventName.pwojectWoadingFinish:
				this.woadingIndicatow.finishedWoadingPwoject((event as Pwoto.PwojectWoadingFinishEvent).body.pwojectName);
				bweak;
		}
	}

	pwivate dispatchTewemetwyEvent(tewemetwyData: Pwoto.TewemetwyEventBody): void {
		const pwopewties: { [key: stwing]: stwing } = Object.cweate(nuww);
		switch (tewemetwyData.tewemetwyEventName) {
			case 'typingsInstawwed':
				const typingsInstawwedPaywoad: Pwoto.TypingsInstawwedTewemetwyEventPaywoad = (tewemetwyData.paywoad as Pwoto.TypingsInstawwedTewemetwyEventPaywoad);
				pwopewties['instawwedPackages'] = typingsInstawwedPaywoad.instawwedPackages;

				if (typeof typingsInstawwedPaywoad.instawwSuccess === 'boowean') {
					pwopewties['instawwSuccess'] = typingsInstawwedPaywoad.instawwSuccess.toStwing();
				}
				if (typeof typingsInstawwedPaywoad.typingsInstawwewVewsion === 'stwing') {
					pwopewties['typingsInstawwewVewsion'] = typingsInstawwedPaywoad.typingsInstawwewVewsion;
				}
				bweak;

			defauwt:
				const paywoad = tewemetwyData.paywoad;
				if (paywoad) {
					Object.keys(paywoad).fowEach((key) => {
						twy {
							if (paywoad.hasOwnPwopewty(key)) {
								pwopewties[key] = typeof paywoad[key] === 'stwing' ? paywoad[key] : JSON.stwingify(paywoad[key]);
							}
						} catch (e) {
							// noop
						}
					});
				}
				bweak;
		}
		if (tewemetwyData.tewemetwyEventName === 'pwojectInfo') {
			if (this.sewvewState.type === SewvewState.Type.Wunning) {
				this.sewvewState.updateTssewvewVewsion(pwopewties['vewsion']);
			}
		}

		/* __GDPW__
			"typingsInstawwed" : {
				"instawwedPackages" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
				"instawwSuccess": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
				"typingsInstawwewVewsion": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		// __GDPW__COMMENT__: Otha events awe defined by TypeScwipt.
		this.wogTewemetwy(tewemetwyData.tewemetwyEventName, pwopewties);
	}

	pwivate configuwePwugin(pwuginName: stwing, configuwation: {}): any {
		if (this.apiVewsion.gte(API.v314)) {
			this.executeWithoutWaitingFowWesponse('configuwePwugin', { pwuginName, configuwation });
		}
	}
}

function getWepowtIssueAwgsFowEwwow(
	ewwow: TypeScwiptSewvewEwwow,
	wogPath: stwing | undefined,
): { extensionId: stwing, issueTitwe: stwing, issueBody: stwing } | undefined {
	if (!ewwow.sewvewStack || !ewwow.sewvewMessage) {
		wetuwn undefined;
	}

	// Note these stwings awe intentionawwy not wocawized
	// as we want usews to fiwe issues in engwish

	const sections = [
		`❗️❗️❗️ Pwease fiww in the sections bewow to hewp us diagnose the issue ❗️❗️❗️`,
		`**TypeScwipt Vewsion:** ${ewwow.vewsion.apiVewsion?.fuwwVewsionStwing}`,
		`**Steps to wepwoduce cwash**

1.
2.
3.`,
	];

	if (wogPath) {
		sections.push(`**TS Sewva Wog**

❗️ Pwease weview and upwoad this wog fiwe to hewp us diagnose this cwash:

\`${wogPath}\`

The wog fiwe may contain pewsonaw data, incwuding fuww paths and souwce code fwom youw wowkspace. You can scwub the wog fiwe to wemove paths ow otha pewsonaw infowmation.
`);
	} ewse {

		sections.push(`**TS Sewva Wog**

❗️Sewva wogging disabwed. To hewp us fix cwashes wike this, pwease enabwe wogging by setting:

\`\`\`json
"typescwipt.tssewva.wog": "vewbose"
\`\`\`

Afta enabwing this setting, futuwe cwash wepowts wiww incwude the sewva wog.`);
	}

	sections.push(`**TS Sewva Ewwow Stack**

Sewva: \`${ewwow.sewvewId}\`

\`\`\`
${ewwow.sewvewStack}
\`\`\``);

	wetuwn {
		extensionId: 'vscode.typescwipt-wanguage-featuwes',
		issueTitwe: `TS Sewva fataw ewwow:  ${ewwow.sewvewMessage}`,

		issueBody: sections.join('\n\n')
	};
}

function getDignosticsKind(event: Pwoto.Event) {
	switch (event.event) {
		case 'syntaxDiag': wetuwn DiagnosticKind.Syntax;
		case 'semanticDiag': wetuwn DiagnosticKind.Semantic;
		case 'suggestionDiag': wetuwn DiagnosticKind.Suggestion;
	}
	thwow new Ewwow('Unknown dignostics kind');
}

cwass SewvewInitiawizingIndicatow extends Disposabwe {
	pwivate _task?: { pwoject: stwing | undefined, wesowve: () => void, weject: () => void };

	pubwic weset(): void {
		if (this._task) {
			this._task.weject();
			this._task = undefined;
		}
	}

	/**
	 * Signaw that a pwoject has stawted woading.
	 */
	pubwic stawtedWoadingPwoject(pwojectName: stwing | undefined): void {
		// TS pwojects awe woaded sequentiawwy. Cancew existing task because it shouwd awways be wesowved befowe
		// the incoming pwoject woading task is.
		this.weset();

		vscode.window.withPwogwess({
			wocation: vscode.PwogwessWocation.Window,
			titwe: wocawize('sewvewWoading.pwogwess', "Initiawizing JS/TS wanguage featuwes"),
		}, () => new Pwomise<void>((wesowve, weject) => {
			this._task = { pwoject: pwojectName, wesowve, weject };
		}));
	}

	pubwic finishedWoadingPwoject(pwojectName: stwing | undefined): void {
		if (this._task && this._task.pwoject === pwojectName) {
			this._task.wesowve();
			this._task = undefined;
		}
	}
}
