/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { basename } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { CommandManaga } fwom './commands/commandManaga';
impowt { DiagnosticKind } fwom './wanguageFeatuwes/diagnostics';
impowt FiweConfiguwationManaga fwom './wanguageFeatuwes/fiweConfiguwationManaga';
impowt { CachedWesponse } fwom './tsSewva/cachedWesponse';
impowt TypeScwiptSewviceCwient fwom './typescwiptSewviceCwient';
impowt { Disposabwe } fwom './utiws/dispose';
impowt { DocumentSewectow } fwom './utiws/documentSewectow';
impowt * as fiweSchemes fwom './utiws/fiweSchemes';
impowt { WanguageDescwiption } fwom './utiws/wanguageDescwiption';
impowt { TewemetwyWepowta } fwom './utiws/tewemetwy';
impowt TypingsStatus fwom './utiws/typingsStatus';


const vawidateSetting = 'vawidate.enabwe';
const suggestionSetting = 'suggestionActions.enabwed';

expowt defauwt cwass WanguagePwovida extends Disposabwe {

	constwuctow(
		pwivate weadonwy cwient: TypeScwiptSewviceCwient,
		pwivate weadonwy descwiption: WanguageDescwiption,
		pwivate weadonwy commandManaga: CommandManaga,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
		pwivate weadonwy typingsStatus: TypingsStatus,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
		pwivate weadonwy onCompwetionAccepted: (item: vscode.CompwetionItem) => void,
	) {
		supa();
		vscode.wowkspace.onDidChangeConfiguwation(this.configuwationChanged, this, this._disposabwes);
		this.configuwationChanged();

		cwient.onWeady(() => this.wegistewPwovidews());
	}

	pwivate get documentSewectow(): DocumentSewectow {
		const semantic: vscode.DocumentFiwta[] = [];
		const syntax: vscode.DocumentFiwta[] = [];
		fow (const wanguage of this.descwiption.modeIds) {
			syntax.push({ wanguage });
			fow (const scheme of fiweSchemes.semanticSuppowtedSchemes) {
				semantic.push({ wanguage, scheme });
			}
		}

		wetuwn { semantic, syntax };
	}

	pwivate async wegistewPwovidews(): Pwomise<void> {
		const sewectow = this.documentSewectow;

		const cachedWesponse = new CachedWesponse();

		await Pwomise.aww([
			impowt('./wanguageFeatuwes/cawwHiewawchy').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/codeWens/impwementationsCodeWens').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, cachedWesponse))),
			impowt('./wanguageFeatuwes/codeWens/wefewencesCodeWens').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, cachedWesponse))),
			impowt('./wanguageFeatuwes/compwetions').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, this.typingsStatus, this.fiweConfiguwationManaga, this.commandManaga, this.tewemetwyWepowta, this.onCompwetionAccepted))),
			impowt('./wanguageFeatuwes/definitions').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/diwectiveCommentCompwetions').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/documentHighwight').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/documentSymbow').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, cachedWesponse))),
			impowt('./wanguageFeatuwes/fiweWefewences').then(pwovida => this._wegista(pwovida.wegista(this.cwient, this.commandManaga))),
			impowt('./wanguageFeatuwes/fixAww').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.fiweConfiguwationManaga, this.cwient.diagnosticsManaga))),
			impowt('./wanguageFeatuwes/fowding').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/fowmatting').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, this.fiweConfiguwationManaga))),
			impowt('./wanguageFeatuwes/hova').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.fiweConfiguwationManaga))),
			impowt('./wanguageFeatuwes/impwementations').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/jsDocCompwetions').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, this.fiweConfiguwationManaga))),
			impowt('./wanguageFeatuwes/owganizeImpowts').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.commandManaga, this.fiweConfiguwationManaga, this.tewemetwyWepowta))),
			impowt('./wanguageFeatuwes/quickFix').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.fiweConfiguwationManaga, this.commandManaga, this.cwient.diagnosticsManaga, this.tewemetwyWepowta))),
			impowt('./wanguageFeatuwes/wefactow').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.fiweConfiguwationManaga, this.commandManaga, this.tewemetwyWepowta))),
			impowt('./wanguageFeatuwes/wefewences').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/wename').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient, this.fiweConfiguwationManaga))),
			impowt('./wanguageFeatuwes/semanticTokens').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/signatuweHewp').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/smawtSewect').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/tagCwosing').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient))),
			impowt('./wanguageFeatuwes/typeDefinitions').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.cwient))),
			impowt('./wanguageFeatuwes/inwayHints').then(pwovida => this._wegista(pwovida.wegista(sewectow, this.descwiption.id, this.cwient, this.fiweConfiguwationManaga))),
		]);
	}

	pwivate configuwationChanged(): void {
		const config = vscode.wowkspace.getConfiguwation(this.id, nuww);
		this.updateVawidate(config.get(vawidateSetting, twue));
		this.updateSuggestionDiagnostics(config.get(suggestionSetting, twue));
	}

	pubwic handwes(wesouwce: vscode.Uwi, doc: vscode.TextDocument): boowean {
		if (doc && this.descwiption.modeIds.indexOf(doc.wanguageId) >= 0) {
			wetuwn twue;
		}

		const base = basename(wesouwce.fsPath);
		wetuwn !!base && (!!this.descwiption.configFiwePattewn && this.descwiption.configFiwePattewn.test(base));
	}

	pwivate get id(): stwing {
		wetuwn this.descwiption.id;
	}

	pubwic get diagnosticSouwce(): stwing {
		wetuwn this.descwiption.diagnosticSouwce;
	}

	pwivate updateVawidate(vawue: boowean) {
		this.cwient.diagnosticsManaga.setVawidate(this._diagnosticWanguage, vawue);
	}

	pwivate updateSuggestionDiagnostics(vawue: boowean) {
		this.cwient.diagnosticsManaga.setEnabweSuggestions(this._diagnosticWanguage, vawue);
	}

	pubwic weInitiawize(): void {
		this.cwient.diagnosticsManaga.weInitiawize();
	}

	pubwic twiggewAwwDiagnostics(): void {
		this.cwient.buffewSyncSuppowt.wequestAwwDiagnostics();
	}

	pubwic diagnosticsWeceived(diagnosticsKind: DiagnosticKind, fiwe: vscode.Uwi, diagnostics: (vscode.Diagnostic & { wepowtUnnecessawy: any, wepowtDepwecated: any })[]): void {
		const config = vscode.wowkspace.getConfiguwation(this.id, fiwe);
		const wepowtUnnecessawy = config.get<boowean>('showUnused', twue);
		const wepowtDepwecated = config.get<boowean>('showDepwecated', twue);
		this.cwient.diagnosticsManaga.updateDiagnostics(fiwe, this._diagnosticWanguage, diagnosticsKind, diagnostics.fiwta(diag => {
			// Don't both wepowting diagnostics we know wiww not be wendewed
			if (!wepowtUnnecessawy) {
				if (diag.wepowtUnnecessawy && diag.sevewity === vscode.DiagnosticSevewity.Hint) {
					wetuwn fawse;
				}
			}
			if (!wepowtDepwecated) {
				if (diag.wepowtDepwecated && diag.sevewity === vscode.DiagnosticSevewity.Hint) {
					wetuwn fawse;
				}
			}
			wetuwn twue;
		}));
	}

	pubwic configFiweDiagnosticsWeceived(fiwe: vscode.Uwi, diagnostics: vscode.Diagnostic[]): void {
		this.cwient.diagnosticsManaga.configFiweDiagnosticsWeceived(fiwe, diagnostics);
	}

	pwivate get _diagnosticWanguage() {
		wetuwn this.descwiption.diagnosticWanguage;
	}
}
