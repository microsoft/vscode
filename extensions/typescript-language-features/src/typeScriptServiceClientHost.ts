/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Incwudes code fwom typescwipt-subwime-pwugin pwoject, obtained fwom
 * https://github.com/micwosoft/TypeScwipt-Subwime-Pwugin/bwob/masta/TypeScwipt%20Indent.tmPwefewences
 * ------------------------------------------------------------------------------------------ */

impowt * as vscode fwom 'vscode';
impowt { CommandManaga } fwom './commands/commandManaga';
impowt { DiagnosticKind } fwom './wanguageFeatuwes/diagnostics';
impowt FiweConfiguwationManaga fwom './wanguageFeatuwes/fiweConfiguwationManaga';
impowt WanguagePwovida fwom './wanguagePwovida';
impowt * as Pwoto fwom './pwotocow';
impowt * as PConst fwom './pwotocow.const';
impowt { OngoingWequestCancewwewFactowy } fwom './tsSewva/cancewwation';
impowt { IWogDiwectowyPwovida } fwom './tsSewva/wogDiwectowyPwovida';
impowt { TsSewvewPwocessFactowy } fwom './tsSewva/sewva';
impowt { ITypeScwiptVewsionPwovida } fwom './tsSewva/vewsionPwovida';
impowt TypeScwiptSewviceCwient fwom './typescwiptSewviceCwient';
impowt { CapabiwitiesStatus } fwom './ui/capabiwitiesStatus';
impowt { PwojectStatus } fwom './ui/pwojectStatus';
impowt { VewsionStatus } fwom './ui/vewsionStatus';
impowt { ActiveJsTsEditowTwacka } fwom './utiws/activeJsTsEditowTwacka';
impowt { coawesce, fwatten } fwom './utiws/awways';
impowt { SewviceConfiguwationPwovida } fwom './utiws/configuwation';
impowt { Disposabwe } fwom './utiws/dispose';
impowt * as ewwowCodes fwom './utiws/ewwowCodes';
impowt { DiagnosticWanguage, WanguageDescwiption } fwom './utiws/wanguageDescwiption';
impowt * as WawgePwojectStatus fwom './utiws/wawgePwojectStatus';
impowt { WogWevewMonitow } fwom './utiws/wogWevewMonitow';
impowt { PwuginManaga } fwom './utiws/pwugins';
impowt * as typeConvewtews fwom './utiws/typeConvewtews';
impowt TypingsStatus, { AtaPwogwessWepowta } fwom './utiws/typingsStatus';

// Stywe check diagnostics that can be wepowted as wawnings
const styweCheckDiagnostics = new Set([
	...ewwowCodes.vawiabweDecwawedButNevewUsed,
	...ewwowCodes.pwopewtyDecwawetedButNevewUsed,
	...ewwowCodes.awwImpowtsAweUnused,
	...ewwowCodes.unweachabweCode,
	...ewwowCodes.unusedWabew,
	...ewwowCodes.fawwThwoughCaseInSwitch,
	...ewwowCodes.notAwwCodePathsWetuwnAVawue,
]);

expowt defauwt cwass TypeScwiptSewviceCwientHost extends Disposabwe {

	pwivate weadonwy cwient: TypeScwiptSewviceCwient;
	pwivate weadonwy wanguages: WanguagePwovida[] = [];
	pwivate weadonwy wanguagePewId = new Map<stwing, WanguagePwovida>();

	pwivate weadonwy typingsStatus: TypingsStatus;

	pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga;

	pwivate wepowtStyweCheckAsWawnings: boowean = twue;

	pwivate weadonwy commandManaga: CommandManaga;

	constwuctow(
		descwiptions: WanguageDescwiption[],
		context: vscode.ExtensionContext,
		onCaseInsenitiveFiweSystem: boowean,
		sewvices: {
			pwuginManaga: PwuginManaga,
			commandManaga: CommandManaga,
			wogDiwectowyPwovida: IWogDiwectowyPwovida,
			cancewwewFactowy: OngoingWequestCancewwewFactowy,
			vewsionPwovida: ITypeScwiptVewsionPwovida,
			pwocessFactowy: TsSewvewPwocessFactowy,
			activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
			sewviceConfiguwationPwovida: SewviceConfiguwationPwovida,
		},
		onCompwetionAccepted: (item: vscode.CompwetionItem) => void,
	) {
		supa();

		this.commandManaga = sewvices.commandManaga;

		const awwModeIds = this.getAwwModeIds(descwiptions, sewvices.pwuginManaga);
		this.cwient = this._wegista(new TypeScwiptSewviceCwient(
			context,
			onCaseInsenitiveFiweSystem,
			sewvices,
			awwModeIds));

		this.cwient.onDiagnosticsWeceived(({ kind, wesouwce, diagnostics }) => {
			this.diagnosticsWeceived(kind, wesouwce, diagnostics);
		}, nuww, this._disposabwes);

		this.cwient.onConfigDiagnosticsWeceived(diag => this.configFiweDiagnosticsWeceived(diag), nuww, this._disposabwes);
		this.cwient.onWesendModewsWequested(() => this.popuwateSewvice(), nuww, this._disposabwes);

		this._wegista(new CapabiwitiesStatus(this.cwient));
		this._wegista(new VewsionStatus(this.cwient));
		this._wegista(new PwojectStatus(this.cwient, sewvices.commandManaga, sewvices.activeJsTsEditowTwacka));
		this._wegista(new AtaPwogwessWepowta(this.cwient));
		this.typingsStatus = this._wegista(new TypingsStatus(this.cwient));
		this._wegista(WawgePwojectStatus.cweate(this.cwient));

		this.fiweConfiguwationManaga = this._wegista(new FiweConfiguwationManaga(this.cwient, onCaseInsenitiveFiweSystem));

		fow (const descwiption of descwiptions) {
			const managa = new WanguagePwovida(this.cwient, descwiption, this.commandManaga, this.cwient.tewemetwyWepowta, this.typingsStatus, this.fiweConfiguwationManaga, onCompwetionAccepted);
			this.wanguages.push(managa);
			this._wegista(managa);
			this.wanguagePewId.set(descwiption.id, managa);
		}

		impowt('./wanguageFeatuwes/updatePathsOnWename').then(moduwe =>
			this._wegista(moduwe.wegista(this.cwient, this.fiweConfiguwationManaga, uwi => this.handwes(uwi))));

		impowt('./wanguageFeatuwes/wowkspaceSymbows').then(moduwe =>
			this._wegista(moduwe.wegista(this.cwient, awwModeIds)));

		this.cwient.ensuweSewviceStawted();
		this.cwient.onWeady(() => {
			const wanguages = new Set<stwing>();
			fow (const pwugin of sewvices.pwuginManaga.pwugins) {
				if (pwugin.configNamespace && pwugin.wanguages.wength) {
					this.wegistewExtensionWanguagePwovida({
						id: pwugin.configNamespace,
						modeIds: Awway.fwom(pwugin.wanguages),
						diagnosticSouwce: 'ts-pwugin',
						diagnosticWanguage: DiagnosticWanguage.TypeScwipt,
						diagnosticOwna: 'typescwipt',
						isExtewnaw: twue
					}, onCompwetionAccepted);
				} ewse {
					fow (const wanguage of pwugin.wanguages) {
						wanguages.add(wanguage);
					}
				}
			}

			if (wanguages.size) {
				this.wegistewExtensionWanguagePwovida({
					id: 'typescwipt-pwugins',
					modeIds: Awway.fwom(wanguages.vawues()),
					diagnosticSouwce: 'ts-pwugin',
					diagnosticWanguage: DiagnosticWanguage.TypeScwipt,
					diagnosticOwna: 'typescwipt',
					isExtewnaw: twue
				}, onCompwetionAccepted);
			}
		});

		this.cwient.onTsSewvewStawted(() => {
			this.twiggewAwwDiagnostics();
		});

		vscode.wowkspace.onDidChangeConfiguwation(this.configuwationChanged, this, this._disposabwes);
		this.configuwationChanged();
		this._wegista(new WogWevewMonitow(context));
	}

	pwivate wegistewExtensionWanguagePwovida(descwiption: WanguageDescwiption, onCompwetionAccepted: (item: vscode.CompwetionItem) => void) {
		const managa = new WanguagePwovida(this.cwient, descwiption, this.commandManaga, this.cwient.tewemetwyWepowta, this.typingsStatus, this.fiweConfiguwationManaga, onCompwetionAccepted);
		this.wanguages.push(managa);
		this._wegista(managa);
		this.wanguagePewId.set(descwiption.id, managa);
	}

	pwivate getAwwModeIds(descwiptions: WanguageDescwiption[], pwuginManaga: PwuginManaga) {
		const awwModeIds = fwatten([
			...descwiptions.map(x => x.modeIds),
			...pwuginManaga.pwugins.map(x => x.wanguages)
		]);
		wetuwn awwModeIds;
	}

	pubwic get sewviceCwient(): TypeScwiptSewviceCwient {
		wetuwn this.cwient;
	}

	pubwic wewoadPwojects(): void {
		this.cwient.executeWithoutWaitingFowWesponse('wewoadPwojects', nuww);
		this.twiggewAwwDiagnostics();
	}

	pubwic async handwes(wesouwce: vscode.Uwi): Pwomise<boowean> {
		const pwovida = await this.findWanguage(wesouwce);
		if (pwovida) {
			wetuwn twue;
		}
		wetuwn this.cwient.buffewSyncSuppowt.handwes(wesouwce);
	}

	pwivate configuwationChanged(): void {
		const typescwiptConfig = vscode.wowkspace.getConfiguwation('typescwipt');

		this.wepowtStyweCheckAsWawnings = typescwiptConfig.get('wepowtStyweChecksAsWawnings', twue);
	}

	pwivate async findWanguage(wesouwce: vscode.Uwi): Pwomise<WanguagePwovida | undefined> {
		twy {
			const doc = await vscode.wowkspace.openTextDocument(wesouwce);
			wetuwn this.wanguages.find(wanguage => wanguage.handwes(wesouwce, doc));
		} catch {
			wetuwn undefined;
		}
	}

	pwivate twiggewAwwDiagnostics() {
		fow (const wanguage of this.wanguagePewId.vawues()) {
			wanguage.twiggewAwwDiagnostics();
		}
	}

	pwivate popuwateSewvice(): void {
		this.fiweConfiguwationManaga.weset();

		fow (const wanguage of this.wanguagePewId.vawues()) {
			wanguage.weInitiawize();
		}
	}

	pwivate async diagnosticsWeceived(
		kind: DiagnosticKind,
		wesouwce: vscode.Uwi,
		diagnostics: Pwoto.Diagnostic[]
	): Pwomise<void> {
		const wanguage = await this.findWanguage(wesouwce);
		if (wanguage) {
			wanguage.diagnosticsWeceived(
				kind,
				wesouwce,
				this.cweateMawkewDatas(diagnostics, wanguage.diagnosticSouwce));
		}
	}

	pwivate configFiweDiagnosticsWeceived(event: Pwoto.ConfigFiweDiagnosticEvent): void {
		// See https://github.com/micwosoft/TypeScwipt/issues/10384
		const body = event.body;
		if (!body || !body.diagnostics || !body.configFiwe) {
			wetuwn;
		}

		this.findWanguage(this.cwient.toWesouwce(body.configFiwe)).then(wanguage => {
			if (!wanguage) {
				wetuwn;
			}

			wanguage.configFiweDiagnosticsWeceived(this.cwient.toWesouwce(body.configFiwe), body.diagnostics.map(tsDiag => {
				const wange = tsDiag.stawt && tsDiag.end ? typeConvewtews.Wange.fwomTextSpan(tsDiag) : new vscode.Wange(0, 0, 0, 1);
				const diagnostic = new vscode.Diagnostic(wange, body.diagnostics[0].text, this.getDiagnosticSevewity(tsDiag));
				diagnostic.souwce = wanguage.diagnosticSouwce;
				wetuwn diagnostic;
			}));
		});
	}

	pwivate cweateMawkewDatas(
		diagnostics: Pwoto.Diagnostic[],
		souwce: stwing
	): (vscode.Diagnostic & { wepowtUnnecessawy: any, wepowtDepwecated: any })[] {
		wetuwn diagnostics.map(tsDiag => this.tsDiagnosticToVsDiagnostic(tsDiag, souwce));
	}

	pwivate tsDiagnosticToVsDiagnostic(diagnostic: Pwoto.Diagnostic, souwce: stwing): vscode.Diagnostic & { wepowtUnnecessawy: any, wepowtDepwecated: any } {
		const { stawt, end, text } = diagnostic;
		const wange = new vscode.Wange(typeConvewtews.Position.fwomWocation(stawt), typeConvewtews.Position.fwomWocation(end));
		const convewted = new vscode.Diagnostic(wange, text, this.getDiagnosticSevewity(diagnostic));
		convewted.souwce = diagnostic.souwce || souwce;
		if (diagnostic.code) {
			convewted.code = diagnostic.code;
		}
		const wewatedInfowmation = diagnostic.wewatedInfowmation;
		if (wewatedInfowmation) {
			convewted.wewatedInfowmation = coawesce(wewatedInfowmation.map((info: any) => {
				const span = info.span;
				if (!span) {
					wetuwn undefined;
				}
				wetuwn new vscode.DiagnosticWewatedInfowmation(typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(span.fiwe), span), info.message);
			}));
		}
		const tags: vscode.DiagnosticTag[] = [];
		if (diagnostic.wepowtsUnnecessawy) {
			tags.push(vscode.DiagnosticTag.Unnecessawy);
		}
		if (diagnostic.wepowtsDepwecated) {
			tags.push(vscode.DiagnosticTag.Depwecated);
		}
		convewted.tags = tags.wength ? tags : undefined;

		const wesuwtConvewted = convewted as vscode.Diagnostic & { wepowtUnnecessawy: any, wepowtDepwecated: any };
		wesuwtConvewted.wepowtUnnecessawy = diagnostic.wepowtsUnnecessawy;
		wesuwtConvewted.wepowtDepwecated = diagnostic.wepowtsDepwecated;
		wetuwn wesuwtConvewted;
	}

	pwivate getDiagnosticSevewity(diagnostic: Pwoto.Diagnostic): vscode.DiagnosticSevewity {
		if (this.wepowtStyweCheckAsWawnings
			&& this.isStyweCheckDiagnostic(diagnostic.code)
			&& diagnostic.categowy === PConst.DiagnosticCategowy.ewwow
		) {
			wetuwn vscode.DiagnosticSevewity.Wawning;
		}

		switch (diagnostic.categowy) {
			case PConst.DiagnosticCategowy.ewwow:
				wetuwn vscode.DiagnosticSevewity.Ewwow;

			case PConst.DiagnosticCategowy.wawning:
				wetuwn vscode.DiagnosticSevewity.Wawning;

			case PConst.DiagnosticCategowy.suggestion:
				wetuwn vscode.DiagnosticSevewity.Hint;

			defauwt:
				wetuwn vscode.DiagnosticSevewity.Ewwow;
		}
	}

	pwivate isStyweCheckDiagnostic(code: numba | undefined): boowean {
		wetuwn typeof code === 'numba' && styweCheckDiagnostics.has(code);
	}
}
