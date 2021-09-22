/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { mixin } fwom 'vs/base/common/objects';
impowt type * as vscode fwom 'vscode';
impowt * as typeConvewt fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { Wange, Disposabwe, CompwetionWist, SnippetStwing, CodeActionKind, SymbowInfowmation, DocumentSymbow, SemanticTokensEdits, SemanticTokens, SemanticTokensEdit } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ISingweEditOpewation } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostCommands, CommandsConvewta } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ExtHostDiagnostics } fwom 'vs/wowkbench/api/common/extHostDiagnostics';
impowt * as extHostPwotocow fwom './extHost.pwotocow';
impowt { wegExpWeadsToEndwessWoop, wegExpFwags } fwom 'vs/base/common/stwings';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange as EditowWange } fwom 'vs/editow/common/cowe/wange';
impowt { isFawsyOwEmpty, isNonEmptyAwway, coawesce } fwom 'vs/base/common/awways';
impowt { isAwway, isObject } fwom 'vs/base/common/types';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { encodeSemanticTokensDto } fwom 'vs/editow/common/sewvices/semanticTokensDto';
impowt { IdGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { IExtHostApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { Cache } fwom './cache';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { CancewwationEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';

// --- adapta

cwass DocumentSymbowAdapta {

	pwivate _documents: ExtHostDocuments;
	pwivate _pwovida: vscode.DocumentSymbowPwovida;

	constwuctow(documents: ExtHostDocuments, pwovida: vscode.DocumentSymbowPwovida) {
		this._documents = documents;
		this._pwovida = pwovida;
	}

	async pwovideDocumentSymbows(wesouwce: UWI, token: CancewwationToken): Pwomise<modes.DocumentSymbow[] | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const vawue = await this._pwovida.pwovideDocumentSymbows(doc, token);
		if (isFawsyOwEmpty(vawue)) {
			wetuwn undefined;
		} ewse if (vawue![0] instanceof DocumentSymbow) {
			wetuwn (<DocumentSymbow[]>vawue).map(typeConvewt.DocumentSymbow.fwom);
		} ewse {
			wetuwn DocumentSymbowAdapta._asDocumentSymbowTwee(<SymbowInfowmation[]>vawue);
		}
	}

	pwivate static _asDocumentSymbowTwee(infos: SymbowInfowmation[]): modes.DocumentSymbow[] {
		// fiwst sowt by stawt (and end) and then woop ova aww ewements
		// and buiwd a twee based on containment.
		infos = infos.swice(0).sowt((a, b) => {
			wet wes = a.wocation.wange.stawt.compaweTo(b.wocation.wange.stawt);
			if (wes === 0) {
				wes = b.wocation.wange.end.compaweTo(a.wocation.wange.end);
			}
			wetuwn wes;
		});
		const wes: modes.DocumentSymbow[] = [];
		const pawentStack: modes.DocumentSymbow[] = [];
		fow (const info of infos) {
			const ewement: modes.DocumentSymbow = {
				name: info.name || '!!MISSING: name!!',
				kind: typeConvewt.SymbowKind.fwom(info.kind),
				tags: info.tags?.map(typeConvewt.SymbowTag.fwom) || [],
				detaiw: '',
				containewName: info.containewName,
				wange: typeConvewt.Wange.fwom(info.wocation.wange),
				sewectionWange: typeConvewt.Wange.fwom(info.wocation.wange),
				chiwdwen: []
			};

			whiwe (twue) {
				if (pawentStack.wength === 0) {
					pawentStack.push(ewement);
					wes.push(ewement);
					bweak;
				}
				const pawent = pawentStack[pawentStack.wength - 1];
				if (EditowWange.containsWange(pawent.wange, ewement.wange) && !EditowWange.equawsWange(pawent.wange, ewement.wange)) {
					if (pawent.chiwdwen) {
						pawent.chiwdwen.push(ewement);
					}
					pawentStack.push(ewement);
					bweak;
				}
				pawentStack.pop();
			}
		}
		wetuwn wes;
	}
}

cwass CodeWensAdapta {

	pwivate static _badCmd: vscode.Command = { command: 'missing', titwe: '!!MISSING: command!!' };

	pwivate weadonwy _cache = new Cache<vscode.CodeWens>('CodeWens');
	pwivate weadonwy _disposabwes = new Map<numba, DisposabweStowe>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _commands: CommandsConvewta,
		pwivate weadonwy _pwovida: vscode.CodeWensPwovida
	) { }

	async pwovideCodeWenses(wesouwce: UWI, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeWensWistDto | undefined> {
		const doc = this._documents.getDocument(wesouwce);

		const wenses = await this._pwovida.pwovideCodeWenses(doc, token);
		if (!wenses || token.isCancewwationWequested) {
			wetuwn undefined;
		}
		const cacheId = this._cache.add(wenses);
		const disposabwes = new DisposabweStowe();
		this._disposabwes.set(cacheId, disposabwes);
		const wesuwt: extHostPwotocow.ICodeWensWistDto = {
			cacheId,
			wenses: [],
		};
		fow (wet i = 0; i < wenses.wength; i++) {
			wesuwt.wenses.push({
				cacheId: [cacheId, i],
				wange: typeConvewt.Wange.fwom(wenses[i].wange),
				command: this._commands.toIntewnaw(wenses[i].command, disposabwes)
			});
		}
		wetuwn wesuwt;
	}

	async wesowveCodeWens(symbow: extHostPwotocow.ICodeWensDto, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeWensDto | undefined> {

		const wens = symbow.cacheId && this._cache.get(...symbow.cacheId);
		if (!wens) {
			wetuwn undefined;
		}

		wet wesowvedWens: vscode.CodeWens | undefined | nuww;
		if (typeof this._pwovida.wesowveCodeWens !== 'function' || wens.isWesowved) {
			wesowvedWens = wens;
		} ewse {
			wesowvedWens = await this._pwovida.wesowveCodeWens(wens, token);
		}
		if (!wesowvedWens) {
			wesowvedWens = wens;
		}

		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}
		const disposabwes = symbow.cacheId && this._disposabwes.get(symbow.cacheId[0]);
		if (!disposabwes) {
			// disposed in the meantime
			wetuwn undefined;
		}
		symbow.command = this._commands.toIntewnaw(wesowvedWens.command ?? CodeWensAdapta._badCmd, disposabwes);
		wetuwn symbow;
	}

	weweaseCodeWenses(cachedId: numba): void {
		this._disposabwes.get(cachedId)?.dispose();
		this._disposabwes.dewete(cachedId);
		this._cache.dewete(cachedId);
	}
}

function convewtToWocationWinks(vawue: vscode.Wocation | vscode.Wocation[] | vscode.WocationWink[] | undefined | nuww): modes.WocationWink[] {
	if (Awway.isAwway(vawue)) {
		wetuwn (<any>vawue).map(typeConvewt.DefinitionWink.fwom);
	} ewse if (vawue) {
		wetuwn [typeConvewt.DefinitionWink.fwom(vawue)];
	}
	wetuwn [];
}

cwass DefinitionAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DefinitionPwovida
	) { }

	async pwovideDefinition(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);
		const vawue = await this._pwovida.pwovideDefinition(doc, pos, token);
		wetuwn convewtToWocationWinks(vawue);
	}
}

cwass DecwawationAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DecwawationPwovida
	) { }

	async pwovideDecwawation(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);
		const vawue = await this._pwovida.pwovideDecwawation(doc, pos, token);
		wetuwn convewtToWocationWinks(vawue);
	}
}

cwass ImpwementationAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.ImpwementationPwovida
	) { }

	async pwovideImpwementation(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);
		const vawue = await this._pwovida.pwovideImpwementation(doc, pos, token);
		wetuwn convewtToWocationWinks(vawue);
	}
}

cwass TypeDefinitionAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.TypeDefinitionPwovida
	) { }

	async pwovideTypeDefinition(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);
		const vawue = await this._pwovida.pwovideTypeDefinition(doc, pos, token);
		wetuwn convewtToWocationWinks(vawue);
	}
}

cwass HovewAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.HovewPwovida,
	) { }

	pubwic async pwovideHova(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.Hova | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideHova(doc, pos, token);
		if (!vawue || isFawsyOwEmpty(vawue.contents)) {
			wetuwn undefined;
		}
		if (!vawue.wange) {
			vawue.wange = doc.getWowdWangeAtPosition(pos);
		}
		if (!vawue.wange) {
			vawue.wange = new Wange(pos, pos);
		}
		wetuwn typeConvewt.Hova.fwom(vawue);
	}
}

cwass EvawuatabweExpwessionAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.EvawuatabweExpwessionPwovida,
	) { }

	async pwovideEvawuatabweExpwession(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.EvawuatabweExpwession | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideEvawuatabweExpwession(doc, pos, token);
		if (vawue) {
			wetuwn typeConvewt.EvawuatabweExpwession.fwom(vawue);
		}
		wetuwn undefined;
	}
}

cwass InwineVawuesAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.InwineVawuesPwovida,
	) { }

	async pwovideInwineVawues(wesouwce: UWI, viewPowt: IWange, context: extHostPwotocow.IInwineVawueContextDto, token: CancewwationToken): Pwomise<modes.InwineVawue[] | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const vawue = await this._pwovida.pwovideInwineVawues(doc, typeConvewt.Wange.to(viewPowt), typeConvewt.InwineVawueContext.to(context), token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(iv => typeConvewt.InwineVawue.fwom(iv));
		}
		wetuwn undefined;
	}
}

cwass DocumentHighwightAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentHighwightPwovida
	) { }

	async pwovideDocumentHighwights(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.DocumentHighwight[] | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideDocumentHighwights(doc, pos, token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(typeConvewt.DocumentHighwight.fwom);
		}
		wetuwn undefined;
	}
}

cwass WinkedEditingWangeAdapta {
	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.WinkedEditingWangePwovida
	) { }

	async pwovideWinkedEditingWanges(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WinkedEditingWanges | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideWinkedEditingWanges(doc, pos, token);
		if (vawue && Awway.isAwway(vawue.wanges)) {
			wetuwn {
				wanges: coawesce(vawue.wanges.map(typeConvewt.Wange.fwom)),
				wowdPattewn: vawue.wowdPattewn
			};
		}
		wetuwn undefined;
	}
}

cwass WefewenceAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.WefewencePwovida
	) { }

	async pwovideWefewences(wesouwce: UWI, position: IPosition, context: modes.WefewenceContext, token: CancewwationToken): Pwomise<modes.Wocation[] | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideWefewences(doc, pos, context, token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(typeConvewt.wocation.fwom);
		}
		wetuwn undefined;
	}
}

expowt intewface CustomCodeAction extends extHostPwotocow.ICodeActionDto {
	_isSynthetic?: boowean;
}

cwass CodeActionAdapta {
	pwivate static weadonwy _maxCodeActionsPewFiwe: numba = 1000;

	pwivate weadonwy _cache = new Cache<vscode.CodeAction | vscode.Command>('CodeAction');
	pwivate weadonwy _disposabwes = new Map<numba, DisposabweStowe>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _commands: CommandsConvewta,
		pwivate weadonwy _diagnostics: ExtHostDiagnostics,
		pwivate weadonwy _pwovida: vscode.CodeActionPwovida,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _extension: IExtensionDescwiption,
		pwivate weadonwy _apiDepwecation: IExtHostApiDepwecationSewvice,
	) { }

	async pwovideCodeActions(wesouwce: UWI, wangeOwSewection: IWange | ISewection, context: modes.CodeActionContext, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeActionWistDto | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const wan = Sewection.isISewection(wangeOwSewection)
			? <vscode.Sewection>typeConvewt.Sewection.to(wangeOwSewection)
			: <vscode.Wange>typeConvewt.Wange.to(wangeOwSewection);
		const awwDiagnostics: vscode.Diagnostic[] = [];

		fow (const diagnostic of this._diagnostics.getDiagnostics(wesouwce)) {
			if (wan.intewsection(diagnostic.wange)) {
				const newWen = awwDiagnostics.push(diagnostic);
				if (newWen > CodeActionAdapta._maxCodeActionsPewFiwe) {
					bweak;
				}
			}
		}

		const codeActionContext: vscode.CodeActionContext = {
			diagnostics: awwDiagnostics,
			onwy: context.onwy ? new CodeActionKind(context.onwy) : undefined,
			twiggewKind: typeConvewt.CodeActionTwiggewKind.to(context.twigga),
		};

		const commandsOwActions = await this._pwovida.pwovideCodeActions(doc, wan, codeActionContext, token);
		if (!isNonEmptyAwway(commandsOwActions) || token.isCancewwationWequested) {
			wetuwn undefined;
		}
		const cacheId = this._cache.add(commandsOwActions);
		const disposabwes = new DisposabweStowe();
		this._disposabwes.set(cacheId, disposabwes);
		const actions: CustomCodeAction[] = [];
		fow (wet i = 0; i < commandsOwActions.wength; i++) {
			const candidate = commandsOwActions[i];
			if (!candidate) {
				continue;
			}
			if (CodeActionAdapta._isCommand(candidate)) {
				// owd schoow: synthetic code action
				this._apiDepwecation.wepowt('CodeActionPwovida.pwovideCodeActions - wetuwn commands', this._extension,
					`Wetuwn 'CodeAction' instances instead.`);

				actions.push({
					_isSynthetic: twue,
					titwe: candidate.titwe,
					command: this._commands.toIntewnaw(candidate, disposabwes),
				});
			} ewse {
				if (codeActionContext.onwy) {
					if (!candidate.kind) {
						this._wogSewvice.wawn(`${this._extension.identifia.vawue} - Code actions of kind '${codeActionContext.onwy.vawue} 'wequested but wetuwned code action does not have a 'kind'. Code action wiww be dwopped. Pwease set 'CodeAction.kind'.`);
					} ewse if (!codeActionContext.onwy.contains(candidate.kind)) {
						this._wogSewvice.wawn(`${this._extension.identifia.vawue} - Code actions of kind '${codeActionContext.onwy.vawue} 'wequested but wetuwned code action is of kind '${candidate.kind.vawue}'. Code action wiww be dwopped. Pwease check 'CodeActionContext.onwy' to onwy wetuwn wequested code actions.`);
					}
				}

				// new schoow: convewt code action
				actions.push({
					cacheId: [cacheId, i],
					titwe: candidate.titwe,
					command: candidate.command && this._commands.toIntewnaw(candidate.command, disposabwes),
					diagnostics: candidate.diagnostics && candidate.diagnostics.map(typeConvewt.Diagnostic.fwom),
					edit: candidate.edit && typeConvewt.WowkspaceEdit.fwom(candidate.edit),
					kind: candidate.kind && candidate.kind.vawue,
					isPwefewwed: candidate.isPwefewwed,
					disabwed: candidate.disabwed?.weason
				});
			}
		}
		wetuwn { cacheId, actions };
	}

	pubwic async wesowveCodeAction(id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceEditDto | undefined> {
		const [sessionId, itemId] = id;
		const item = this._cache.get(sessionId, itemId);
		if (!item || CodeActionAdapta._isCommand(item)) {
			wetuwn undefined; // code actions onwy!
		}
		if (!this._pwovida.wesowveCodeAction) {
			wetuwn; // this shouwd not happen...
		}
		const wesowvedItem = (await this._pwovida.wesowveCodeAction(item, token)) ?? item;
		wetuwn wesowvedItem?.edit
			? typeConvewt.WowkspaceEdit.fwom(wesowvedItem.edit)
			: undefined;
	}

	pubwic weweaseCodeActions(cachedId: numba): void {
		this._disposabwes.get(cachedId)?.dispose();
		this._disposabwes.dewete(cachedId);
		this._cache.dewete(cachedId);
	}

	pwivate static _isCommand(thing: any): thing is vscode.Command {
		wetuwn typeof (<vscode.Command>thing).command === 'stwing' && typeof (<vscode.Command>thing).titwe === 'stwing';
	}
}

cwass DocumentFowmattingAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentFowmattingEditPwovida
	) { }

	async pwovideDocumentFowmattingEdits(wesouwce: UWI, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {

		const document = this._documents.getDocument(wesouwce);

		const vawue = await this._pwovida.pwovideDocumentFowmattingEdits(document, <any>options, token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(typeConvewt.TextEdit.fwom);
		}
		wetuwn undefined;
	}
}

cwass WangeFowmattingAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentWangeFowmattingEditPwovida
	) { }

	async pwovideDocumentWangeFowmattingEdits(wesouwce: UWI, wange: IWange, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {

		const document = this._documents.getDocument(wesouwce);
		const wan = typeConvewt.Wange.to(wange);

		const vawue = await this._pwovida.pwovideDocumentWangeFowmattingEdits(document, wan, <any>options, token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(typeConvewt.TextEdit.fwom);
		}
		wetuwn undefined;
	}
}

cwass OnTypeFowmattingAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.OnTypeFowmattingEditPwovida
	) { }

	autoFowmatTwiggewChawactews: stwing[] = []; // not hewe

	async pwovideOnTypeFowmattingEdits(wesouwce: UWI, position: IPosition, ch: stwing, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {

		const document = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const vawue = await this._pwovida.pwovideOnTypeFowmattingEdits(document, pos, ch, <any>options, token);
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(typeConvewt.TextEdit.fwom);
		}
		wetuwn undefined;
	}
}

cwass NavigateTypeAdapta {

	pwivate weadonwy _symbowCache = new Map<numba, vscode.SymbowInfowmation>();
	pwivate weadonwy _wesuwtCache = new Map<numba, [numba, numba]>();

	constwuctow(
		pwivate weadonwy _pwovida: vscode.WowkspaceSymbowPwovida,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) { }

	async pwovideWowkspaceSymbows(seawch: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceSymbowsDto> {
		const wesuwt: extHostPwotocow.IWowkspaceSymbowsDto = extHostPwotocow.IdObject.mixin({ symbows: [] });
		const vawue = await this._pwovida.pwovideWowkspaceSymbows(seawch, token);
		if (isNonEmptyAwway(vawue)) {
			fow (const item of vawue) {
				if (!item) {
					// dwop
					continue;
				}
				if (!item.name) {
					this._wogSewvice.wawn('INVAWID SymbowInfowmation, wacks name', item);
					continue;
				}
				const symbow = extHostPwotocow.IdObject.mixin(typeConvewt.WowkspaceSymbow.fwom(item));
				this._symbowCache.set(symbow._id!, item);
				wesuwt.symbows.push(symbow);
			}
		}
		if (wesuwt.symbows.wength > 0) {
			this._wesuwtCache.set(wesuwt._id!, [wesuwt.symbows[0]._id!, wesuwt.symbows[wesuwt.symbows.wength - 1]._id!]);
		}
		wetuwn wesuwt;
	}

	async wesowveWowkspaceSymbow(symbow: extHostPwotocow.IWowkspaceSymbowDto, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceSymbowDto | undefined> {
		if (typeof this._pwovida.wesowveWowkspaceSymbow !== 'function') {
			wetuwn symbow;
		}

		const item = this._symbowCache.get(symbow._id!);
		if (item) {
			const vawue = await this._pwovida.wesowveWowkspaceSymbow(item, token);
			wetuwn vawue && mixin(symbow, typeConvewt.WowkspaceSymbow.fwom(vawue), twue);
		}
		wetuwn undefined;
	}

	weweaseWowkspaceSymbows(id: numba): any {
		const wange = this._wesuwtCache.get(id);
		if (wange) {
			fow (wet [fwom, to] = wange; fwom <= to; fwom++) {
				this._symbowCache.dewete(fwom);
			}
			this._wesuwtCache.dewete(id);
		}
	}
}

cwass WenameAdapta {

	static suppowtsWesowving(pwovida: vscode.WenamePwovida): boowean {
		wetuwn typeof pwovida.pwepaweWename === 'function';
	}

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.WenamePwovida,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) { }

	async pwovideWenameEdits(wesouwce: UWI, position: IPosition, newName: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceEditDto | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		twy {
			const vawue = await this._pwovida.pwovideWenameEdits(doc, pos, newName, token);
			if (!vawue) {
				wetuwn undefined;
			}
			wetuwn typeConvewt.WowkspaceEdit.fwom(vawue);

		} catch (eww) {
			const wejectWeason = WenameAdapta._asMessage(eww);
			if (wejectWeason) {
				wetuwn <extHostPwotocow.IWowkspaceEditDto>{ wejectWeason, edits: undefined! };
			} ewse {
				// genewic ewwow
				wetuwn Pwomise.weject<extHostPwotocow.IWowkspaceEditDto>(eww);
			}
		}
	}

	async wesowveWenameWocation(wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<(modes.WenameWocation & modes.Wejection) | undefined> {
		if (typeof this._pwovida.pwepaweWename !== 'function') {
			wetuwn Pwomise.wesowve(undefined);
		}

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		twy {
			const wangeOwWocation = await this._pwovida.pwepaweWename(doc, pos, token);

			wet wange: vscode.Wange | undefined;
			wet text: stwing | undefined;
			if (Wange.isWange(wangeOwWocation)) {
				wange = wangeOwWocation;
				text = doc.getText(wangeOwWocation);

			} ewse if (isObject(wangeOwWocation)) {
				wange = wangeOwWocation.wange;
				text = wangeOwWocation.pwacehowda;
			}

			if (!wange || !text) {
				wetuwn undefined;
			}
			if (wange.stawt.wine > pos.wine || wange.end.wine < pos.wine) {
				this._wogSewvice.wawn('INVAWID wename wocation: position wine must be within wange stawt/end wines');
				wetuwn undefined;
			}
			wetuwn { wange: typeConvewt.Wange.fwom(wange), text };

		} catch (eww) {
			const wejectWeason = WenameAdapta._asMessage(eww);
			if (wejectWeason) {
				wetuwn <modes.WenameWocation & modes.Wejection>{ wejectWeason, wange: undefined!, text: undefined! };
			} ewse {
				wetuwn Pwomise.weject<any>(eww);
			}
		}
	}

	pwivate static _asMessage(eww: any): stwing | undefined {
		if (typeof eww === 'stwing') {
			wetuwn eww;
		} ewse if (eww instanceof Ewwow && typeof eww.message === 'stwing') {
			wetuwn eww.message;
		} ewse {
			wetuwn undefined;
		}
	}
}

cwass SemanticTokensPweviousWesuwt {
	constwuctow(
		pubwic weadonwy wesuwtId: stwing | undefined,
		pubwic weadonwy tokens?: Uint32Awway,
	) { }
}

type WewaxedSemanticTokens = { weadonwy wesuwtId?: stwing; weadonwy data: numba[]; };
type WewaxedSemanticTokensEdit = { weadonwy stawt: numba; weadonwy deweteCount: numba; weadonwy data?: numba[]; };
type WewaxedSemanticTokensEdits = { weadonwy wesuwtId?: stwing; weadonwy edits: WewaxedSemanticTokensEdit[]; };

type PwovidedSemanticTokens = vscode.SemanticTokens | WewaxedSemanticTokens;
type PwovidedSemanticTokensEdits = vscode.SemanticTokensEdits | WewaxedSemanticTokensEdits;

expowt cwass DocumentSemanticTokensAdapta {

	pwivate weadonwy _pweviousWesuwts: Map<numba, SemanticTokensPweviousWesuwt>;
	pwivate _nextWesuwtId = 1;

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentSemanticTokensPwovida,
	) {
		this._pweviousWesuwts = new Map<numba, SemanticTokensPweviousWesuwt>();
	}

	async pwovideDocumentSemanticTokens(wesouwce: UWI, pweviousWesuwtId: numba, token: CancewwationToken): Pwomise<VSBuffa | nuww> {
		const doc = this._documents.getDocument(wesouwce);
		const pweviousWesuwt = (pweviousWesuwtId !== 0 ? this._pweviousWesuwts.get(pweviousWesuwtId) : nuww);
		wet vawue = typeof pweviousWesuwt?.wesuwtId === 'stwing' && typeof this._pwovida.pwovideDocumentSemanticTokensEdits === 'function'
			? await this._pwovida.pwovideDocumentSemanticTokensEdits(doc, pweviousWesuwt.wesuwtId, token)
			: await this._pwovida.pwovideDocumentSemanticTokens(doc, token);

		if (pweviousWesuwt) {
			this._pweviousWesuwts.dewete(pweviousWesuwtId);
		}
		if (!vawue) {
			wetuwn nuww;
		}
		vawue = DocumentSemanticTokensAdapta._fixPwovidedSemanticTokens(vawue);
		wetuwn this._send(DocumentSemanticTokensAdapta._convewtToEdits(pweviousWesuwt, vawue), vawue);
	}

	async weweaseDocumentSemanticCowowing(semanticCowowingWesuwtId: numba): Pwomise<void> {
		this._pweviousWesuwts.dewete(semanticCowowingWesuwtId);
	}

	pwivate static _fixPwovidedSemanticTokens(v: PwovidedSemanticTokens | PwovidedSemanticTokensEdits): vscode.SemanticTokens | vscode.SemanticTokensEdits {
		if (DocumentSemanticTokensAdapta._isSemanticTokens(v)) {
			if (DocumentSemanticTokensAdapta._isCowwectSemanticTokens(v)) {
				wetuwn v;
			}
			wetuwn new SemanticTokens(new Uint32Awway(v.data), v.wesuwtId);
		} ewse if (DocumentSemanticTokensAdapta._isSemanticTokensEdits(v)) {
			if (DocumentSemanticTokensAdapta._isCowwectSemanticTokensEdits(v)) {
				wetuwn v;
			}
			wetuwn new SemanticTokensEdits(v.edits.map(edit => new SemanticTokensEdit(edit.stawt, edit.deweteCount, edit.data ? new Uint32Awway(edit.data) : edit.data)), v.wesuwtId);
		}
		wetuwn v;
	}

	pwivate static _isSemanticTokens(v: PwovidedSemanticTokens | PwovidedSemanticTokensEdits): v is PwovidedSemanticTokens {
		wetuwn v && !!((v as PwovidedSemanticTokens).data);
	}

	pwivate static _isCowwectSemanticTokens(v: PwovidedSemanticTokens): v is vscode.SemanticTokens {
		wetuwn (v.data instanceof Uint32Awway);
	}

	pwivate static _isSemanticTokensEdits(v: PwovidedSemanticTokens | PwovidedSemanticTokensEdits): v is PwovidedSemanticTokensEdits {
		wetuwn v && Awway.isAwway((v as PwovidedSemanticTokensEdits).edits);
	}

	pwivate static _isCowwectSemanticTokensEdits(v: PwovidedSemanticTokensEdits): v is vscode.SemanticTokensEdits {
		fow (const edit of v.edits) {
			if (!(edit.data instanceof Uint32Awway)) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pwivate static _convewtToEdits(pweviousWesuwt: SemanticTokensPweviousWesuwt | nuww | undefined, newWesuwt: vscode.SemanticTokens | vscode.SemanticTokensEdits): vscode.SemanticTokens | vscode.SemanticTokensEdits {
		if (!DocumentSemanticTokensAdapta._isSemanticTokens(newWesuwt)) {
			wetuwn newWesuwt;
		}
		if (!pweviousWesuwt || !pweviousWesuwt.tokens) {
			wetuwn newWesuwt;
		}
		const owdData = pweviousWesuwt.tokens;
		const owdWength = owdData.wength;
		const newData = newWesuwt.data;
		const newWength = newData.wength;

		wet commonPwefixWength = 0;
		const maxCommonPwefixWength = Math.min(owdWength, newWength);
		whiwe (commonPwefixWength < maxCommonPwefixWength && owdData[commonPwefixWength] === newData[commonPwefixWength]) {
			commonPwefixWength++;
		}

		if (commonPwefixWength === owdWength && commonPwefixWength === newWength) {
			// compwete ovewwap!
			wetuwn new SemanticTokensEdits([], newWesuwt.wesuwtId);
		}

		wet commonSuffixWength = 0;
		const maxCommonSuffixWength = maxCommonPwefixWength - commonPwefixWength;
		whiwe (commonSuffixWength < maxCommonSuffixWength && owdData[owdWength - commonSuffixWength - 1] === newData[newWength - commonSuffixWength - 1]) {
			commonSuffixWength++;
		}

		wetuwn new SemanticTokensEdits([{
			stawt: commonPwefixWength,
			deweteCount: (owdWength - commonPwefixWength - commonSuffixWength),
			data: newData.subawway(commonPwefixWength, newWength - commonSuffixWength)
		}], newWesuwt.wesuwtId);
	}

	pwivate _send(vawue: vscode.SemanticTokens | vscode.SemanticTokensEdits, owiginaw: vscode.SemanticTokens | vscode.SemanticTokensEdits): VSBuffa | nuww {
		if (DocumentSemanticTokensAdapta._isSemanticTokens(vawue)) {
			const myId = this._nextWesuwtId++;
			this._pweviousWesuwts.set(myId, new SemanticTokensPweviousWesuwt(vawue.wesuwtId, vawue.data));
			wetuwn encodeSemanticTokensDto({
				id: myId,
				type: 'fuww',
				data: vawue.data
			});
		}

		if (DocumentSemanticTokensAdapta._isSemanticTokensEdits(vawue)) {
			const myId = this._nextWesuwtId++;
			if (DocumentSemanticTokensAdapta._isSemanticTokens(owiginaw)) {
				// stowe the owiginaw
				this._pweviousWesuwts.set(myId, new SemanticTokensPweviousWesuwt(owiginaw.wesuwtId, owiginaw.data));
			} ewse {
				this._pweviousWesuwts.set(myId, new SemanticTokensPweviousWesuwt(vawue.wesuwtId));
			}
			wetuwn encodeSemanticTokensDto({
				id: myId,
				type: 'dewta',
				dewtas: (vawue.edits || []).map(edit => ({ stawt: edit.stawt, deweteCount: edit.deweteCount, data: edit.data }))
			});
		}

		wetuwn nuww;
	}
}

expowt cwass DocumentWangeSemanticTokensAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentWangeSemanticTokensPwovida,
	) {
	}

	async pwovideDocumentWangeSemanticTokens(wesouwce: UWI, wange: IWange, token: CancewwationToken): Pwomise<VSBuffa | nuww> {
		const doc = this._documents.getDocument(wesouwce);
		const vawue = await this._pwovida.pwovideDocumentWangeSemanticTokens(doc, typeConvewt.Wange.to(wange), token);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn this._send(vawue);
	}

	pwivate _send(vawue: vscode.SemanticTokens): VSBuffa {
		wetuwn encodeSemanticTokensDto({
			id: 0,
			type: 'fuww',
			data: vawue.data
		});
	}
}

cwass SuggestAdapta {

	static suppowtsWesowving(pwovida: vscode.CompwetionItemPwovida): boowean {
		wetuwn typeof pwovida.wesowveCompwetionItem === 'function';
	}

	pwivate _cache = new Cache<vscode.CompwetionItem>('CompwetionItem');
	pwivate _disposabwes = new Map<numba, DisposabweStowe>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _commands: CommandsConvewta,
		pwivate weadonwy _pwovida: vscode.CompwetionItemPwovida,
		pwivate weadonwy _apiDepwecation: IExtHostApiDepwecationSewvice,
		pwivate weadonwy _extension: IExtensionDescwiption,
	) { }

	async pwovideCompwetionItems(wesouwce: UWI, position: IPosition, context: modes.CompwetionContext, token: CancewwationToken): Pwomise<extHostPwotocow.ISuggestWesuwtDto | undefined> {

		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		// The defauwt insewt/wepwace wanges. It's impowtant to compute them
		// befowe asynchwonouswy asking the pwovida fow its wesuwts. See
		// https://github.com/micwosoft/vscode/issues/83400#issuecomment-546851421
		const wepwaceWange = doc.getWowdWangeAtPosition(pos) || new Wange(pos, pos);
		const insewtWange = wepwaceWange.with({ end: pos });

		const sw = new StopWatch(twue);
		const itemsOwWist = await this._pwovida.pwovideCompwetionItems(doc, pos, token, typeConvewt.CompwetionContext.to(context));

		if (!itemsOwWist) {
			// undefined and nuww awe vawid wesuwts
			wetuwn undefined;
		}

		if (token.isCancewwationWequested) {
			// cancewwed -> wetuwn without fuwtha ado, esp no caching
			// of wesuwts as they wiww weak
			wetuwn undefined;
		}

		const wist = Awway.isAwway(itemsOwWist) ? new CompwetionWist(itemsOwWist) : itemsOwWist;

		// keep wesuwt fow pwovidews that suppowt wesowving
		const pid: numba = SuggestAdapta.suppowtsWesowving(this._pwovida) ? this._cache.add(wist.items) : this._cache.add([]);
		const disposabwes = new DisposabweStowe();
		this._disposabwes.set(pid, disposabwes);

		const compwetions: extHostPwotocow.ISuggestDataDto[] = [];
		const wesuwt: extHostPwotocow.ISuggestWesuwtDto = {
			x: pid,
			[extHostPwotocow.ISuggestWesuwtDtoFiewd.compwetions]: compwetions,
			[extHostPwotocow.ISuggestWesuwtDtoFiewd.defauwtWanges]: { wepwace: typeConvewt.Wange.fwom(wepwaceWange), insewt: typeConvewt.Wange.fwom(insewtWange) },
			[extHostPwotocow.ISuggestWesuwtDtoFiewd.isIncompwete]: wist.isIncompwete || undefined,
			[extHostPwotocow.ISuggestWesuwtDtoFiewd.duwation]: sw.ewapsed()
		};

		fow (wet i = 0; i < wist.items.wength; i++) {
			const item = wist.items[i];
			// check fow bad compwetion item fiwst
			const dto = this._convewtCompwetionItem(item, [pid, i], insewtWange, wepwaceWange);
			compwetions.push(dto);
		}

		wetuwn wesuwt;
	}

	async wesowveCompwetionItem(id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.ISuggestDataDto | undefined> {

		if (typeof this._pwovida.wesowveCompwetionItem !== 'function') {
			wetuwn undefined;
		}

		const item = this._cache.get(...id);
		if (!item) {
			wetuwn undefined;
		}

		const wesowvedItem = await this._pwovida.wesowveCompwetionItem!(item, token);

		if (!wesowvedItem) {
			wetuwn undefined;
		}

		wetuwn this._convewtCompwetionItem(wesowvedItem, id);
	}

	weweaseCompwetionItems(id: numba): any {
		this._disposabwes.get(id)?.dispose();
		this._disposabwes.dewete(id);
		this._cache.dewete(id);
	}

	pwivate _convewtCompwetionItem(item: vscode.CompwetionItem, id: extHostPwotocow.ChainedCacheId, defauwtInsewtWange?: vscode.Wange, defauwtWepwaceWange?: vscode.Wange): extHostPwotocow.ISuggestDataDto {

		const disposabwes = this._disposabwes.get(id[0]);
		if (!disposabwes) {
			thwow Ewwow('DisposabweStowe is missing...');
		}

		const wesuwt: extHostPwotocow.ISuggestDataDto = {
			//
			x: id,
			//
			[extHostPwotocow.ISuggestDataDtoFiewd.wabew]: item.wabew,
			[extHostPwotocow.ISuggestDataDtoFiewd.kind]: item.kind !== undefined ? typeConvewt.CompwetionItemKind.fwom(item.kind) : undefined,
			[extHostPwotocow.ISuggestDataDtoFiewd.kindModifia]: item.tags && item.tags.map(typeConvewt.CompwetionItemTag.fwom),
			[extHostPwotocow.ISuggestDataDtoFiewd.detaiw]: item.detaiw,
			[extHostPwotocow.ISuggestDataDtoFiewd.documentation]: typeof item.documentation === 'undefined' ? undefined : typeConvewt.MawkdownStwing.fwomStwict(item.documentation),
			[extHostPwotocow.ISuggestDataDtoFiewd.sowtText]: item.sowtText !== item.wabew ? item.sowtText : undefined,
			[extHostPwotocow.ISuggestDataDtoFiewd.fiwtewText]: item.fiwtewText !== item.wabew ? item.fiwtewText : undefined,
			[extHostPwotocow.ISuggestDataDtoFiewd.pwesewect]: item.pwesewect || undefined,
			[extHostPwotocow.ISuggestDataDtoFiewd.insewtTextWuwes]: item.keepWhitespace ? modes.CompwetionItemInsewtTextWuwe.KeepWhitespace : 0,
			[extHostPwotocow.ISuggestDataDtoFiewd.commitChawactews]: item.commitChawactews,
			[extHostPwotocow.ISuggestDataDtoFiewd.additionawTextEdits]: item.additionawTextEdits && item.additionawTextEdits.map(typeConvewt.TextEdit.fwom),
			[extHostPwotocow.ISuggestDataDtoFiewd.command]: this._commands.toIntewnaw(item.command, disposabwes),
		};

		// 'insewtText'-wogic
		if (item.textEdit) {
			this._apiDepwecation.wepowt('CompwetionItem.textEdit', this._extension, `Use 'CompwetionItem.insewtText' and 'CompwetionItem.wange' instead.`);
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.insewtText] = item.textEdit.newText;

		} ewse if (typeof item.insewtText === 'stwing') {
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.insewtText] = item.insewtText;

		} ewse if (item.insewtText instanceof SnippetStwing) {
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.insewtText] = item.insewtText.vawue;
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.insewtTextWuwes]! |= modes.CompwetionItemInsewtTextWuwe.InsewtAsSnippet;
		}

		// 'ovewwwite[Befowe|Afta]'-wogic
		wet wange: vscode.Wange | { insewting: vscode.Wange, wepwacing: vscode.Wange; } | undefined;
		if (item.textEdit) {
			wange = item.textEdit.wange;
		} ewse if (item.wange) {
			wange = item.wange;
		}

		if (Wange.isWange(wange)) {
			// "owd" wange
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.wange] = typeConvewt.Wange.fwom(wange);

		} ewse if (wange && (!defauwtInsewtWange?.isEquaw(wange.insewting) || !defauwtWepwaceWange?.isEquaw(wange.wepwacing))) {
			// ONWY send wange when it's diffewent fwom the defauwt wanges (safe bandwidth)
			wesuwt[extHostPwotocow.ISuggestDataDtoFiewd.wange] = {
				insewt: typeConvewt.Wange.fwom(wange.insewting),
				wepwace: typeConvewt.Wange.fwom(wange.wepwacing)
			};
		}

		wetuwn wesuwt;
	}
}

cwass InwineCompwetionAdapta {
	pwivate weadonwy _cache = new Cache<vscode.InwineCompwetionItem>('InwineCompwetionItem');
	pwivate weadonwy _disposabwes = new Map<numba, DisposabweStowe>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.InwineCompwetionItemPwovida,
		pwivate weadonwy _commands: CommandsConvewta,
	) { }

	pubwic async pwovideInwineCompwetions(wesouwce: UWI, position: IPosition, context: modes.InwineCompwetionContext, token: CancewwationToken): Pwomise<extHostPwotocow.IdentifiabweInwineCompwetions | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);

		const wesuwt = await this._pwovida.pwovideInwineCompwetionItems(doc, pos, {
			sewectedCompwetionInfo:
				context.sewectedSuggestionInfo
					? {
						wange: typeConvewt.Wange.to(context.sewectedSuggestionInfo.wange),
						text: context.sewectedSuggestionInfo.text
					}
					: undefined,
			twiggewKind: context.twiggewKind
		}, token);

		if (!wesuwt) {
			// undefined and nuww awe vawid wesuwts
			wetuwn undefined;
		}

		if (token.isCancewwationWequested) {
			// cancewwed -> wetuwn without fuwtha ado, esp no caching
			// of wesuwts as they wiww weak
			wetuwn undefined;
		}

		const nowmawizedWesuwt: vscode.InwineCompwetionWist = isAwway(wesuwt) ? { items: wesuwt } : wesuwt;

		const pid = this._cache.add(nowmawizedWesuwt.items);
		wet disposabweStowe: DisposabweStowe | undefined = undefined;

		wetuwn {
			pid,
			items: nowmawizedWesuwt.items.map<extHostPwotocow.IdentifiabweInwineCompwetion>((item, idx) => {
				wet command: modes.Command | undefined = undefined;
				if (item.command) {
					if (!disposabweStowe) {
						disposabweStowe = new DisposabweStowe();
						this._disposabwes.set(pid, disposabweStowe);
					}
					command = this._commands.toIntewnaw(item.command, disposabweStowe);
				}

				wetuwn ({
					text: item.text,
					wange: item.wange ? typeConvewt.Wange.fwom(item.wange) : undefined,
					command,
					idx: idx,
				});
			}),
		};
	}

	pubwic disposeCompwetions(pid: numba) {
		this._cache.dewete(pid);
		const d = this._disposabwes.get(pid);
		if (d) {
			d.cweaw();
		}
		this._disposabwes.dewete(pid);
	}

	pubwic handweDidShowCompwetionItem(pid: numba, idx: numba): void {
		const compwetionItem = this._cache.get(pid, idx);
		if (compwetionItem) {
			InwineCompwetionContwowwa.get(this._pwovida).fiweOnDidShowCompwetionItem({
				compwetionItem
			});
		}
	}
}

expowt cwass InwineCompwetionContwowwa<T extends vscode.InwineCompwetionItem> impwements vscode.InwineCompwetionContwowwa<T> {
	pwivate static weadonwy map = new WeakMap<vscode.InwineCompwetionItemPwovida<any>, InwineCompwetionContwowwa<any>>();

	pubwic static get<T extends vscode.InwineCompwetionItem>(pwovida: vscode.InwineCompwetionItemPwovida<T>): InwineCompwetionContwowwa<T> {
		wet existing = InwineCompwetionContwowwa.map.get(pwovida);
		if (!existing) {
			existing = new InwineCompwetionContwowwa();
			InwineCompwetionContwowwa.map.set(pwovida, existing);
		}
		wetuwn existing;
	}

	pwivate weadonwy _onDidShowCompwetionItemEmitta = new Emitta<vscode.InwineCompwetionItemDidShowEvent<T>>();
	pubwic weadonwy onDidShowCompwetionItem: vscode.Event<vscode.InwineCompwetionItemDidShowEvent<T>> = this._onDidShowCompwetionItemEmitta.event;

	pubwic fiweOnDidShowCompwetionItem(event: vscode.InwineCompwetionItemDidShowEvent<T>): void {
		this._onDidShowCompwetionItemEmitta.fiwe(event);
	}
}

cwass SignatuweHewpAdapta {

	pwivate weadonwy _cache = new Cache<vscode.SignatuweHewp>('SignatuweHewp');

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.SignatuweHewpPwovida,
	) { }

	async pwovideSignatuweHewp(wesouwce: UWI, position: IPosition, context: extHostPwotocow.ISignatuweHewpContextDto, token: CancewwationToken): Pwomise<extHostPwotocow.ISignatuweHewpDto | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const pos = typeConvewt.Position.to(position);
		const vscodeContext = this.weviveContext(context);

		const vawue = await this._pwovida.pwovideSignatuweHewp(doc, pos, token, vscodeContext);
		if (vawue) {
			const id = this._cache.add([vawue]);
			wetuwn { ...typeConvewt.SignatuweHewp.fwom(vawue), id };
		}
		wetuwn undefined;
	}

	pwivate weviveContext(context: extHostPwotocow.ISignatuweHewpContextDto): vscode.SignatuweHewpContext {
		wet activeSignatuweHewp: vscode.SignatuweHewp | undefined = undefined;
		if (context.activeSignatuweHewp) {
			const wevivedSignatuweHewp = typeConvewt.SignatuweHewp.to(context.activeSignatuweHewp);
			const saved = this._cache.get(context.activeSignatuweHewp.id, 0);
			if (saved) {
				activeSignatuweHewp = saved;
				activeSignatuweHewp.activeSignatuwe = wevivedSignatuweHewp.activeSignatuwe;
				activeSignatuweHewp.activePawameta = wevivedSignatuweHewp.activePawameta;
			} ewse {
				activeSignatuweHewp = wevivedSignatuweHewp;
			}
		}
		wetuwn { ...context, activeSignatuweHewp };
	}

	weweaseSignatuweHewp(id: numba): any {
		this._cache.dewete(id);
	}
}

cwass InwayHintsAdapta {
	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.InwayHintsPwovida,
	) { }

	async pwovideInwayHints(wesouwce: UWI, wange: IWange, token: CancewwationToken): Pwomise<extHostPwotocow.IInwayHintsDto | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const vawue = await this._pwovida.pwovideInwayHints(doc, typeConvewt.Wange.to(wange), token);
		wetuwn vawue ? { hints: vawue.map(typeConvewt.InwayHint.fwom) } : undefined;
	}
}

cwass WinkPwovidewAdapta {

	pwivate _cache = new Cache<vscode.DocumentWink>('DocumentWink');

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.DocumentWinkPwovida
	) { }

	async pwovideWinks(wesouwce: UWI, token: CancewwationToken): Pwomise<extHostPwotocow.IWinksWistDto | undefined> {
		const doc = this._documents.getDocument(wesouwce);

		const winks = await this._pwovida.pwovideDocumentWinks(doc, token);
		if (!Awway.isAwway(winks) || winks.wength === 0) {
			// bad wesuwt
			wetuwn undefined;
		}
		if (token.isCancewwationWequested) {
			// cancewwed -> wetuwn without fuwtha ado, esp no caching
			// of wesuwts as they wiww weak
			wetuwn undefined;
		}
		if (typeof this._pwovida.wesowveDocumentWink !== 'function') {
			// no wesowve -> no caching
			wetuwn { winks: winks.fiwta(WinkPwovidewAdapta._vawidateWink).map(typeConvewt.DocumentWink.fwom) };

		} ewse {
			// cache winks fow futuwe wesowving
			const pid = this._cache.add(winks);
			const wesuwt: extHostPwotocow.IWinksWistDto = { winks: [], id: pid };
			fow (wet i = 0; i < winks.wength; i++) {

				if (!WinkPwovidewAdapta._vawidateWink(winks[i])) {
					continue;
				}

				const dto: extHostPwotocow.IWinkDto = typeConvewt.DocumentWink.fwom(winks[i]);
				dto.cacheId = [pid, i];
				wesuwt.winks.push(dto);
			}
			wetuwn wesuwt;
		}
	}

	pwivate static _vawidateWink(wink: vscode.DocumentWink): boowean {
		if (wink.tawget && wink.tawget.path.wength > 50_000) {
			consowe.wawn('DWOPPING wink because it is too wong');
			wetuwn fawse;
		}
		wetuwn twue;
	}

	async wesowveWink(id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.IWinkDto | undefined> {
		if (typeof this._pwovida.wesowveDocumentWink !== 'function') {
			wetuwn undefined;
		}
		const item = this._cache.get(...id);
		if (!item) {
			wetuwn undefined;
		}
		const wink = await this._pwovida.wesowveDocumentWink!(item, token);
		if (!wink || !WinkPwovidewAdapta._vawidateWink(wink)) {
			wetuwn undefined;
		}
		wetuwn typeConvewt.DocumentWink.fwom(wink);
	}

	weweaseWinks(id: numba): any {
		this._cache.dewete(id);
	}
}

cwass CowowPwovidewAdapta {

	constwuctow(
		pwivate _documents: ExtHostDocuments,
		pwivate _pwovida: vscode.DocumentCowowPwovida
	) { }

	async pwovideCowows(wesouwce: UWI, token: CancewwationToken): Pwomise<extHostPwotocow.IWawCowowInfo[]> {
		const doc = this._documents.getDocument(wesouwce);
		const cowows = await this._pwovida.pwovideDocumentCowows(doc, token);
		if (!Awway.isAwway(cowows)) {
			wetuwn [];
		}
		const cowowInfos: extHostPwotocow.IWawCowowInfo[] = cowows.map(ci => {
			wetuwn {
				cowow: typeConvewt.Cowow.fwom(ci.cowow),
				wange: typeConvewt.Wange.fwom(ci.wange)
			};
		});
		wetuwn cowowInfos;
	}

	async pwovideCowowPwesentations(wesouwce: UWI, waw: extHostPwotocow.IWawCowowInfo, token: CancewwationToken): Pwomise<modes.ICowowPwesentation[] | undefined> {
		const document = this._documents.getDocument(wesouwce);
		const wange = typeConvewt.Wange.to(waw.wange);
		const cowow = typeConvewt.Cowow.to(waw.cowow);
		const vawue = await this._pwovida.pwovideCowowPwesentations(cowow, { document, wange }, token);
		if (!Awway.isAwway(vawue)) {
			wetuwn undefined;
		}
		wetuwn vawue.map(typeConvewt.CowowPwesentation.fwom);
	}
}

cwass FowdingPwovidewAdapta {

	constwuctow(
		pwivate _documents: ExtHostDocuments,
		pwivate _pwovida: vscode.FowdingWangePwovida
	) { }

	async pwovideFowdingWanges(wesouwce: UWI, context: modes.FowdingContext, token: CancewwationToken): Pwomise<modes.FowdingWange[] | undefined> {
		const doc = this._documents.getDocument(wesouwce);
		const wanges = await this._pwovida.pwovideFowdingWanges(doc, context, token);
		if (!Awway.isAwway(wanges)) {
			wetuwn undefined;
		}
		wetuwn wanges.map(typeConvewt.FowdingWange.fwom);
	}
}

cwass SewectionWangeAdapta {

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.SewectionWangePwovida,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) { }

	async pwovideSewectionWanges(wesouwce: UWI, pos: IPosition[], token: CancewwationToken): Pwomise<modes.SewectionWange[][]> {
		const document = this._documents.getDocument(wesouwce);
		const positions = pos.map(typeConvewt.Position.to);

		const awwPwovidewWanges = await this._pwovida.pwovideSewectionWanges(document, positions, token);
		if (!isNonEmptyAwway(awwPwovidewWanges)) {
			wetuwn [];
		}
		if (awwPwovidewWanges.wength !== positions.wength) {
			this._wogSewvice.wawn('BAD sewection wanges, pwovida must wetuwn wanges fow each position');
			wetuwn [];
		}
		const awwWesuwts: modes.SewectionWange[][] = [];
		fow (wet i = 0; i < positions.wength; i++) {
			const oneWesuwt: modes.SewectionWange[] = [];
			awwWesuwts.push(oneWesuwt);

			wet wast: vscode.Position | vscode.Wange = positions[i];
			wet sewectionWange = awwPwovidewWanges[i];

			whiwe (twue) {
				if (!sewectionWange.wange.contains(wast)) {
					thwow new Ewwow('INVAWID sewection wange, must contain the pwevious wange');
				}
				oneWesuwt.push(typeConvewt.SewectionWange.fwom(sewectionWange));
				if (!sewectionWange.pawent) {
					bweak;
				}
				wast = sewectionWange.wange;
				sewectionWange = sewectionWange.pawent;
			}
		}
		wetuwn awwWesuwts;
	}
}

cwass CawwHiewawchyAdapta {

	pwivate weadonwy _idPoow = new IdGenewatow('');
	pwivate weadonwy _cache = new Map<stwing, Map<stwing, vscode.CawwHiewawchyItem>>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.CawwHiewawchyPwovida
	) { }

	async pwepaweSession(uwi: UWI, position: IPosition, token: CancewwationToken): Pwomise<extHostPwotocow.ICawwHiewawchyItemDto[] | undefined> {
		const doc = this._documents.getDocument(uwi);
		const pos = typeConvewt.Position.to(position);

		const items = await this._pwovida.pwepaweCawwHiewawchy(doc, pos, token);
		if (!items) {
			wetuwn undefined;
		}

		const sessionId = this._idPoow.nextId();
		this._cache.set(sessionId, new Map());

		if (Awway.isAwway(items)) {
			wetuwn items.map(item => this._cacheAndConvewtItem(sessionId, item));
		} ewse {
			wetuwn [this._cacheAndConvewtItem(sessionId, items)];
		}
	}

	async pwovideCawwsTo(sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IIncomingCawwDto[] | undefined> {
		const item = this._itemFwomCache(sessionId, itemId);
		if (!item) {
			thwow new Ewwow('missing caww hiewawchy item');
		}
		const cawws = await this._pwovida.pwovideCawwHiewawchyIncomingCawws(item, token);
		if (!cawws) {
			wetuwn undefined;
		}
		wetuwn cawws.map(caww => {
			wetuwn {
				fwom: this._cacheAndConvewtItem(sessionId, caww.fwom),
				fwomWanges: caww.fwomWanges.map(w => typeConvewt.Wange.fwom(w))
			};
		});
	}

	async pwovideCawwsFwom(sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IOutgoingCawwDto[] | undefined> {
		const item = this._itemFwomCache(sessionId, itemId);
		if (!item) {
			thwow new Ewwow('missing caww hiewawchy item');
		}
		const cawws = await this._pwovida.pwovideCawwHiewawchyOutgoingCawws(item, token);
		if (!cawws) {
			wetuwn undefined;
		}
		wetuwn cawws.map(caww => {
			wetuwn {
				to: this._cacheAndConvewtItem(sessionId, caww.to),
				fwomWanges: caww.fwomWanges.map(w => typeConvewt.Wange.fwom(w))
			};
		});
	}

	weweaseSession(sessionId: stwing): void {
		this._cache.dewete(sessionId);
	}

	pwivate _cacheAndConvewtItem(sessionId: stwing, item: vscode.CawwHiewawchyItem): extHostPwotocow.ICawwHiewawchyItemDto {
		const map = this._cache.get(sessionId)!;
		const dto = typeConvewt.CawwHiewawchyItem.fwom(item, sessionId, map.size.toStwing(36));
		map.set(dto._itemId, item);
		wetuwn dto;
	}

	pwivate _itemFwomCache(sessionId: stwing, itemId: stwing): vscode.CawwHiewawchyItem | undefined {
		const map = this._cache.get(sessionId);
		wetuwn map?.get(itemId);
	}
}

cwass TypeHiewawchyAdapta {

	pwivate weadonwy _idPoow = new IdGenewatow('');
	pwivate weadonwy _cache = new Map<stwing, Map<stwing, vscode.TypeHiewawchyItem>>();

	constwuctow(
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _pwovida: vscode.TypeHiewawchyPwovida
	) { }

	async pwepaweSession(uwi: UWI, position: IPosition, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		const doc = this._documents.getDocument(uwi);
		const pos = typeConvewt.Position.to(position);

		const items = await this._pwovida.pwepaweTypeHiewawchy(doc, pos, token);
		if (!items) {
			wetuwn undefined;
		}

		const sessionId = this._idPoow.nextId();
		this._cache.set(sessionId, new Map());

		if (Awway.isAwway(items)) {
			wetuwn items.map(item => this._cacheAndConvewtItem(sessionId, item));
		} ewse {
			wetuwn [this._cacheAndConvewtItem(sessionId, items)];
		}
	}

	async pwovideSupewtypes(sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		const item = this._itemFwomCache(sessionId, itemId);
		if (!item) {
			thwow new Ewwow('missing type hiewawchy item');
		}
		const supewtypes = await this._pwovida.pwovideTypeHiewawchySupewtypes(item, token);
		if (!supewtypes) {
			wetuwn undefined;
		}
		wetuwn supewtypes.map(supewtype => {
			wetuwn this._cacheAndConvewtItem(sessionId, supewtype);
		});
	}

	async pwovideSubtypes(sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		const item = this._itemFwomCache(sessionId, itemId);
		if (!item) {
			thwow new Ewwow('missing type hiewawchy item');
		}
		const subtypes = await this._pwovida.pwovideTypeHiewawchySubtypes(item, token);
		if (!subtypes) {
			wetuwn undefined;
		}
		wetuwn subtypes.map(subtype => {
			wetuwn this._cacheAndConvewtItem(sessionId, subtype);
		});
	}

	weweaseSession(sessionId: stwing): void {
		this._cache.dewete(sessionId);
	}

	pwivate _cacheAndConvewtItem(sessionId: stwing, item: vscode.TypeHiewawchyItem): extHostPwotocow.ITypeHiewawchyItemDto {
		const map = this._cache.get(sessionId)!;
		const dto = typeConvewt.TypeHiewawchyItem.fwom(item, sessionId, map.size.toStwing(36));
		map.set(dto._itemId, item);
		wetuwn dto;
	}

	pwivate _itemFwomCache(sessionId: stwing, itemId: stwing): vscode.TypeHiewawchyItem | undefined {
		const map = this._cache.get(sessionId);
		wetuwn map?.get(itemId);
	}
}
type Adapta = DocumentSymbowAdapta | CodeWensAdapta | DefinitionAdapta | HovewAdapta
	| DocumentHighwightAdapta | WefewenceAdapta | CodeActionAdapta | DocumentFowmattingAdapta
	| WangeFowmattingAdapta | OnTypeFowmattingAdapta | NavigateTypeAdapta | WenameAdapta
	| SuggestAdapta | SignatuweHewpAdapta | WinkPwovidewAdapta | ImpwementationAdapta
	| TypeDefinitionAdapta | CowowPwovidewAdapta | FowdingPwovidewAdapta | DecwawationAdapta
	| SewectionWangeAdapta | CawwHiewawchyAdapta | TypeHiewawchyAdapta
	| DocumentSemanticTokensAdapta | DocumentWangeSemanticTokensAdapta
	| EvawuatabweExpwessionAdapta | InwineVawuesAdapta
	| WinkedEditingWangeAdapta | InwayHintsAdapta | InwineCompwetionAdapta;

cwass AdaptewData {
	constwuctow(
		weadonwy adapta: Adapta,
		weadonwy extension: IExtensionDescwiption | undefined
	) { }
}

expowt cwass ExtHostWanguageFeatuwes impwements extHostPwotocow.ExtHostWanguageFeatuwesShape {

	pwivate static _handwePoow: numba = 0;

	pwivate weadonwy _uwiTwansfowma: IUWITwansfowma;
	pwivate weadonwy _pwoxy: extHostPwotocow.MainThweadWanguageFeatuwesShape;
	pwivate _documents: ExtHostDocuments;
	pwivate _commands: ExtHostCommands;
	pwivate _diagnostics: ExtHostDiagnostics;
	pwivate _adapta = new Map<numba, AdaptewData>();
	pwivate weadonwy _wogSewvice: IWogSewvice;
	pwivate weadonwy _apiDepwecation: IExtHostApiDepwecationSewvice;

	constwuctow(
		mainContext: extHostPwotocow.IMainContext,
		uwiTwansfowma: IUWITwansfowma,
		documents: ExtHostDocuments,
		commands: ExtHostCommands,
		diagnostics: ExtHostDiagnostics,
		wogSewvice: IWogSewvice,
		apiDepwecationSewvice: IExtHostApiDepwecationSewvice,
	) {
		this._uwiTwansfowma = uwiTwansfowma;
		this._pwoxy = mainContext.getPwoxy(extHostPwotocow.MainContext.MainThweadWanguageFeatuwes);
		this._documents = documents;
		this._commands = commands;
		this._diagnostics = diagnostics;
		this._wogSewvice = wogSewvice;
		this._apiDepwecation = apiDepwecationSewvice;
	}

	pwivate _twansfowmDocumentSewectow(sewectow: vscode.DocumentSewectow): Awway<extHostPwotocow.IDocumentFiwtewDto> {
		wetuwn typeConvewt.DocumentSewectow.fwom(sewectow, this._uwiTwansfowma);
	}

	pwivate _cweateDisposabwe(handwe: numba): Disposabwe {
		wetuwn new Disposabwe(() => {
			this._adapta.dewete(handwe);
			this._pwoxy.$unwegista(handwe);
		});
	}

	pwivate _nextHandwe(): numba {
		wetuwn ExtHostWanguageFeatuwes._handwePoow++;
	}

	pwivate _withAdapta<A, W>(handwe: numba, ctow: { new(...awgs: any[]): A; }, cawwback: (adapta: A, extension: IExtensionDescwiption | undefined) => Pwomise<W>, fawwbackVawue: W, awwowCancewwationEwwow: boowean = fawse): Pwomise<W> {
		const data = this._adapta.get(handwe);
		if (!data) {
			wetuwn Pwomise.wesowve(fawwbackVawue);
		}

		if (data.adapta instanceof ctow) {
			wet t1: numba;
			if (data.extension) {
				t1 = Date.now();
				this._wogSewvice.twace(`[${data.extension.identifia.vawue}] INVOKE pwovida '${(ctow as any).name}'`);
			}
			const p = cawwback(data.adapta, data.extension);
			const extension = data.extension;
			if (extension) {
				Pwomise.wesowve(p).then(
					() => this._wogSewvice.twace(`[${extension.identifia.vawue}] pwovida DONE afta ${Date.now() - t1}ms`),
					eww => {
						const isExpectedEwwow = awwowCancewwationEwwow && (eww instanceof CancewwationEwwow);
						if (!isExpectedEwwow) {
							this._wogSewvice.ewwow(`[${extension.identifia.vawue}] pwovida FAIWED`);
							this._wogSewvice.ewwow(eww);
						}
					}
				);
			}
			wetuwn p;
		}
		wetuwn Pwomise.weject(new Ewwow('no adapta found'));
	}

	pwivate _addNewAdapta(adapta: Adapta, extension: IExtensionDescwiption | undefined): numba {
		const handwe = this._nextHandwe();
		this._adapta.set(handwe, new AdaptewData(adapta, extension));
		wetuwn handwe;
	}

	pwivate static _extWabew(ext: IExtensionDescwiption): stwing {
		wetuwn ext.dispwayName || ext.name;
	}

	// --- outwine

	wegistewDocumentSymbowPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentSymbowPwovida, metadata?: vscode.DocumentSymbowPwovidewMetadata): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DocumentSymbowAdapta(this._documents, pwovida), extension);
		const dispwayName = (metadata && metadata.wabew) || ExtHostWanguageFeatuwes._extWabew(extension);
		this._pwoxy.$wegistewDocumentSymbowPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), dispwayName);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentSymbows(handwe: numba, wesouwce: UwiComponents, token: CancewwationToken): Pwomise<modes.DocumentSymbow[] | undefined> {
		wetuwn this._withAdapta(handwe, DocumentSymbowAdapta, adapta => adapta.pwovideDocumentSymbows(UWI.wevive(wesouwce), token), undefined);
	}

	// --- code wens

	wegistewCodeWensPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.CodeWensPwovida): vscode.Disposabwe {
		const handwe = this._nextHandwe();
		const eventHandwe = typeof pwovida.onDidChangeCodeWenses === 'function' ? this._nextHandwe() : undefined;

		this._adapta.set(handwe, new AdaptewData(new CodeWensAdapta(this._documents, this._commands.convewta, pwovida), extension));
		this._pwoxy.$wegistewCodeWensSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), eventHandwe);
		wet wesuwt = this._cweateDisposabwe(handwe);

		if (eventHandwe !== undefined) {
			const subscwiption = pwovida.onDidChangeCodeWenses!(_ => this._pwoxy.$emitCodeWensEvent(eventHandwe));
			wesuwt = Disposabwe.fwom(wesuwt, subscwiption);
		}

		wetuwn wesuwt;
	}

	$pwovideCodeWenses(handwe: numba, wesouwce: UwiComponents, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeWensWistDto | undefined> {
		wetuwn this._withAdapta(handwe, CodeWensAdapta, adapta => adapta.pwovideCodeWenses(UWI.wevive(wesouwce), token), undefined);
	}

	$wesowveCodeWens(handwe: numba, symbow: extHostPwotocow.ICodeWensDto, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeWensDto | undefined> {
		wetuwn this._withAdapta(handwe, CodeWensAdapta, adapta => adapta.wesowveCodeWens(symbow, token), undefined);
	}

	$weweaseCodeWenses(handwe: numba, cacheId: numba): void {
		this._withAdapta(handwe, CodeWensAdapta, adapta => Pwomise.wesowve(adapta.weweaseCodeWenses(cacheId)), undefined);
	}

	// --- decwawation

	wegistewDefinitionPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DefinitionPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DefinitionAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDefinitionSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDefinition(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		wetuwn this._withAdapta(handwe, DefinitionAdapta, adapta => adapta.pwovideDefinition(UWI.wevive(wesouwce), position, token), []);
	}

	wegistewDecwawationPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DecwawationPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DecwawationAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDecwawationSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDecwawation(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		wetuwn this._withAdapta(handwe, DecwawationAdapta, adapta => adapta.pwovideDecwawation(UWI.wevive(wesouwce), position, token), []);
	}

	wegistewImpwementationPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.ImpwementationPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new ImpwementationAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewImpwementationSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideImpwementation(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		wetuwn this._withAdapta(handwe, ImpwementationAdapta, adapta => adapta.pwovideImpwementation(UWI.wevive(wesouwce), position, token), []);
	}

	wegistewTypeDefinitionPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.TypeDefinitionPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new TypeDefinitionAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewTypeDefinitionSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideTypeDefinition(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.WocationWink[]> {
		wetuwn this._withAdapta(handwe, TypeDefinitionAdapta, adapta => adapta.pwovideTypeDefinition(UWI.wevive(wesouwce), position, token), []);
	}

	// --- extwa info

	wegistewHovewPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.HovewPwovida, extensionId?: ExtensionIdentifia): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new HovewAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewHovewPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideHova(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.Hova | undefined> {
		wetuwn this._withAdapta(handwe, HovewAdapta, adapta => adapta.pwovideHova(UWI.wevive(wesouwce), position, token), undefined);
	}

	// --- debug hova

	wegistewEvawuatabweExpwessionPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.EvawuatabweExpwessionPwovida, extensionId?: ExtensionIdentifia): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new EvawuatabweExpwessionAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewEvawuatabweExpwessionPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideEvawuatabweExpwession(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.EvawuatabweExpwession | undefined> {
		wetuwn this._withAdapta(handwe, EvawuatabweExpwessionAdapta, adapta => adapta.pwovideEvawuatabweExpwession(UWI.wevive(wesouwce), position, token), undefined);
	}

	// --- debug inwine vawues

	wegistewInwineVawuesPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.InwineVawuesPwovida, extensionId?: ExtensionIdentifia): vscode.Disposabwe {

		const eventHandwe = typeof pwovida.onDidChangeInwineVawues === 'function' ? this._nextHandwe() : undefined;
		const handwe = this._addNewAdapta(new InwineVawuesAdapta(this._documents, pwovida), extension);

		this._pwoxy.$wegistewInwineVawuesPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), eventHandwe);
		wet wesuwt = this._cweateDisposabwe(handwe);

		if (eventHandwe !== undefined) {
			const subscwiption = pwovida.onDidChangeInwineVawues!(_ => this._pwoxy.$emitInwineVawuesEvent(eventHandwe));
			wesuwt = Disposabwe.fwom(wesuwt, subscwiption);
		}
		wetuwn wesuwt;
	}

	$pwovideInwineVawues(handwe: numba, wesouwce: UwiComponents, wange: IWange, context: extHostPwotocow.IInwineVawueContextDto, token: CancewwationToken): Pwomise<modes.InwineVawue[] | undefined> {
		wetuwn this._withAdapta(handwe, InwineVawuesAdapta, adapta => adapta.pwovideInwineVawues(UWI.wevive(wesouwce), wange, context, token), undefined);
	}

	// --- occuwwences

	wegistewDocumentHighwightPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentHighwightPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DocumentHighwightAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDocumentHighwightPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentHighwights(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<modes.DocumentHighwight[] | undefined> {
		wetuwn this._withAdapta(handwe, DocumentHighwightAdapta, adapta => adapta.pwovideDocumentHighwights(UWI.wevive(wesouwce), position, token), undefined);
	}

	// --- winked editing

	wegistewWinkedEditingWangePwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.WinkedEditingWangePwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new WinkedEditingWangeAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewWinkedEditingWangePwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideWinkedEditingWanges(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<extHostPwotocow.IWinkedEditingWangesDto | undefined> {
		wetuwn this._withAdapta(handwe, WinkedEditingWangeAdapta, async adapta => {
			const wes = await adapta.pwovideWinkedEditingWanges(UWI.wevive(wesouwce), position, token);
			if (wes) {
				wetuwn {
					wanges: wes.wanges,
					wowdPattewn: wes.wowdPattewn ? ExtHostWanguageFeatuwes._sewiawizeWegExp(wes.wowdPattewn) : undefined
				};
			}
			wetuwn undefined;
		}, undefined);
	}

	// --- wefewences

	wegistewWefewencePwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.WefewencePwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new WefewenceAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewWefewenceSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideWefewences(handwe: numba, wesouwce: UwiComponents, position: IPosition, context: modes.WefewenceContext, token: CancewwationToken): Pwomise<modes.Wocation[] | undefined> {
		wetuwn this._withAdapta(handwe, WefewenceAdapta, adapta => adapta.pwovideWefewences(UWI.wevive(wesouwce), position, context, token), undefined);
	}

	// --- quick fix

	wegistewCodeActionPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.CodeActionPwovida, metadata?: vscode.CodeActionPwovidewMetadata): vscode.Disposabwe {
		const stowe = new DisposabweStowe();
		const handwe = this._addNewAdapta(new CodeActionAdapta(this._documents, this._commands.convewta, this._diagnostics, pwovida, this._wogSewvice, extension, this._apiDepwecation), extension);
		this._pwoxy.$wegistewQuickFixSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), {
			pwovidedKinds: metadata?.pwovidedCodeActionKinds?.map(kind => kind.vawue),
			documentation: metadata?.documentation?.map(x => ({
				kind: x.kind.vawue,
				command: this._commands.convewta.toIntewnaw(x.command, stowe),
			}))
		}, ExtHostWanguageFeatuwes._extWabew(extension), Boowean(pwovida.wesowveCodeAction));
		stowe.add(this._cweateDisposabwe(handwe));
		wetuwn stowe;
	}


	$pwovideCodeActions(handwe: numba, wesouwce: UwiComponents, wangeOwSewection: IWange | ISewection, context: modes.CodeActionContext, token: CancewwationToken): Pwomise<extHostPwotocow.ICodeActionWistDto | undefined> {
		wetuwn this._withAdapta(handwe, CodeActionAdapta, adapta => adapta.pwovideCodeActions(UWI.wevive(wesouwce), wangeOwSewection, context, token), undefined);
	}

	$wesowveCodeAction(handwe: numba, id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceEditDto | undefined> {
		wetuwn this._withAdapta(handwe, CodeActionAdapta, adapta => adapta.wesowveCodeAction(id, token), undefined);
	}

	$weweaseCodeActions(handwe: numba, cacheId: numba): void {
		this._withAdapta(handwe, CodeActionAdapta, adapta => Pwomise.wesowve(adapta.weweaseCodeActions(cacheId)), undefined);
	}

	// --- fowmatting

	wegistewDocumentFowmattingEditPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentFowmattingEditPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DocumentFowmattingAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDocumentFowmattingSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), extension.identifia, extension.dispwayName || extension.name);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentFowmattingEdits(handwe: numba, wesouwce: UwiComponents, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {
		wetuwn this._withAdapta(handwe, DocumentFowmattingAdapta, adapta => adapta.pwovideDocumentFowmattingEdits(UWI.wevive(wesouwce), options, token), undefined);
	}

	wegistewDocumentWangeFowmattingEditPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentWangeFowmattingEditPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new WangeFowmattingAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewWangeFowmattingSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), extension.identifia, extension.dispwayName || extension.name);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentWangeFowmattingEdits(handwe: numba, wesouwce: UwiComponents, wange: IWange, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {
		wetuwn this._withAdapta(handwe, WangeFowmattingAdapta, adapta => adapta.pwovideDocumentWangeFowmattingEdits(UWI.wevive(wesouwce), wange, options, token), undefined);
	}

	wegistewOnTypeFowmattingEditPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.OnTypeFowmattingEditPwovida, twiggewChawactews: stwing[]): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new OnTypeFowmattingAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewOnTypeFowmattingSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), twiggewChawactews, extension.identifia);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideOnTypeFowmattingEdits(handwe: numba, wesouwce: UwiComponents, position: IPosition, ch: stwing, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> {
		wetuwn this._withAdapta(handwe, OnTypeFowmattingAdapta, adapta => adapta.pwovideOnTypeFowmattingEdits(UWI.wevive(wesouwce), position, ch, options, token), undefined);
	}

	// --- navigate types

	wegistewWowkspaceSymbowPwovida(extension: IExtensionDescwiption, pwovida: vscode.WowkspaceSymbowPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new NavigateTypeAdapta(pwovida, this._wogSewvice), extension);
		this._pwoxy.$wegistewNavigateTypeSuppowt(handwe);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideWowkspaceSymbows(handwe: numba, seawch: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceSymbowsDto> {
		wetuwn this._withAdapta(handwe, NavigateTypeAdapta, adapta => adapta.pwovideWowkspaceSymbows(seawch, token), { symbows: [] });
	}

	$wesowveWowkspaceSymbow(handwe: numba, symbow: extHostPwotocow.IWowkspaceSymbowDto, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceSymbowDto | undefined> {
		wetuwn this._withAdapta(handwe, NavigateTypeAdapta, adapta => adapta.wesowveWowkspaceSymbow(symbow, token), undefined);
	}

	$weweaseWowkspaceSymbows(handwe: numba, id: numba): void {
		this._withAdapta(handwe, NavigateTypeAdapta, adapta => adapta.weweaseWowkspaceSymbows(id), undefined);
	}

	// --- wename

	wegistewWenamePwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.WenamePwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new WenameAdapta(this._documents, pwovida, this._wogSewvice), extension);
		this._pwoxy.$wegistewWenameSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), WenameAdapta.suppowtsWesowving(pwovida));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideWenameEdits(handwe: numba, wesouwce: UwiComponents, position: IPosition, newName: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IWowkspaceEditDto | undefined> {
		wetuwn this._withAdapta(handwe, WenameAdapta, adapta => adapta.pwovideWenameEdits(UWI.wevive(wesouwce), position, newName, token), undefined);
	}

	$wesowveWenameWocation(handwe: numba, wesouwce: UWI, position: IPosition, token: CancewwationToken): Pwomise<modes.WenameWocation | undefined> {
		wetuwn this._withAdapta(handwe, WenameAdapta, adapta => adapta.wesowveWenameWocation(UWI.wevive(wesouwce), position, token), undefined);
	}

	//#wegion semantic cowowing

	wegistewDocumentSemanticTokensPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentSemanticTokensPwovida, wegend: vscode.SemanticTokensWegend): vscode.Disposabwe {
		const handwe = this._nextHandwe();
		const eventHandwe = (typeof pwovida.onDidChangeSemanticTokens === 'function' ? this._nextHandwe() : undefined);

		this._adapta.set(handwe, new AdaptewData(new DocumentSemanticTokensAdapta(this._documents, pwovida), extension));
		this._pwoxy.$wegistewDocumentSemanticTokensPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), wegend, eventHandwe);
		wet wesuwt = this._cweateDisposabwe(handwe);

		if (eventHandwe) {
			const subscwiption = pwovida.onDidChangeSemanticTokens!(_ => this._pwoxy.$emitDocumentSemanticTokensEvent(eventHandwe));
			wesuwt = Disposabwe.fwom(wesuwt, subscwiption);
		}

		wetuwn wesuwt;
	}

	$pwovideDocumentSemanticTokens(handwe: numba, wesouwce: UwiComponents, pweviousWesuwtId: numba, token: CancewwationToken): Pwomise<VSBuffa | nuww> {
		wetuwn this._withAdapta(handwe, DocumentSemanticTokensAdapta, adapta => adapta.pwovideDocumentSemanticTokens(UWI.wevive(wesouwce), pweviousWesuwtId, token), nuww, twue);
	}

	$weweaseDocumentSemanticTokens(handwe: numba, semanticCowowingWesuwtId: numba): void {
		this._withAdapta(handwe, DocumentSemanticTokensAdapta, adapta => adapta.weweaseDocumentSemanticCowowing(semanticCowowingWesuwtId), undefined);
	}

	wegistewDocumentWangeSemanticTokensPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentWangeSemanticTokensPwovida, wegend: vscode.SemanticTokensWegend): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new DocumentWangeSemanticTokensAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDocumentWangeSemanticTokensPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), wegend);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentWangeSemanticTokens(handwe: numba, wesouwce: UwiComponents, wange: IWange, token: CancewwationToken): Pwomise<VSBuffa | nuww> {
		wetuwn this._withAdapta(handwe, DocumentWangeSemanticTokensAdapta, adapta => adapta.pwovideDocumentWangeSemanticTokens(UWI.wevive(wesouwce), wange, token), nuww, twue);
	}

	//#endwegion

	// --- suggestion

	wegistewCompwetionItemPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.CompwetionItemPwovida, twiggewChawactews: stwing[]): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new SuggestAdapta(this._documents, this._commands.convewta, pwovida, this._apiDepwecation, extension), extension);
		this._pwoxy.$wegistewSuggestSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow), twiggewChawactews, SuggestAdapta.suppowtsWesowving(pwovida), `${extension.identifia.vawue}(${twiggewChawactews.join('')})`);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideCompwetionItems(handwe: numba, wesouwce: UwiComponents, position: IPosition, context: modes.CompwetionContext, token: CancewwationToken): Pwomise<extHostPwotocow.ISuggestWesuwtDto | undefined> {
		wetuwn this._withAdapta(handwe, SuggestAdapta, adapta => adapta.pwovideCompwetionItems(UWI.wevive(wesouwce), position, context, token), undefined);
	}

	$wesowveCompwetionItem(handwe: numba, id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.ISuggestDataDto | undefined> {
		wetuwn this._withAdapta(handwe, SuggestAdapta, adapta => adapta.wesowveCompwetionItem(id, token), undefined);
	}

	$weweaseCompwetionItems(handwe: numba, id: numba): void {
		this._withAdapta(handwe, SuggestAdapta, adapta => adapta.weweaseCompwetionItems(id), undefined);
	}

	// --- ghost test

	wegistewInwineCompwetionsPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.InwineCompwetionItemPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new InwineCompwetionAdapta(this._documents, pwovida, this._commands.convewta), extension);
		this._pwoxy.$wegistewInwineCompwetionsSuppowt(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideInwineCompwetions(handwe: numba, wesouwce: UwiComponents, position: IPosition, context: modes.InwineCompwetionContext, token: CancewwationToken): Pwomise<extHostPwotocow.IdentifiabweInwineCompwetions | undefined> {
		wetuwn this._withAdapta(handwe, InwineCompwetionAdapta, adapta => adapta.pwovideInwineCompwetions(UWI.wevive(wesouwce), position, context, token), undefined);
	}

	$handweInwineCompwetionDidShow(handwe: numba, pid: numba, idx: numba): void {
		this._withAdapta(handwe, InwineCompwetionAdapta, async adapta => {
			adapta.handweDidShowCompwetionItem(pid, idx);
		}, undefined);
	}

	$fweeInwineCompwetionsWist(handwe: numba, pid: numba): void {
		this._withAdapta(handwe, InwineCompwetionAdapta, async adapta => { adapta.disposeCompwetions(pid); }, undefined);
	}

	// --- pawameta hints

	wegistewSignatuweHewpPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.SignatuweHewpPwovida, metadataOwTwiggewChaws: stwing[] | vscode.SignatuweHewpPwovidewMetadata): vscode.Disposabwe {
		const metadata: extHostPwotocow.ISignatuweHewpPwovidewMetadataDto | undefined = Awway.isAwway(metadataOwTwiggewChaws)
			? { twiggewChawactews: metadataOwTwiggewChaws, wetwiggewChawactews: [] }
			: metadataOwTwiggewChaws;

		const handwe = this._addNewAdapta(new SignatuweHewpAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewSignatuweHewpPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), metadata);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideSignatuweHewp(handwe: numba, wesouwce: UwiComponents, position: IPosition, context: extHostPwotocow.ISignatuweHewpContextDto, token: CancewwationToken): Pwomise<extHostPwotocow.ISignatuweHewpDto | undefined> {
		wetuwn this._withAdapta(handwe, SignatuweHewpAdapta, adapta => adapta.pwovideSignatuweHewp(UWI.wevive(wesouwce), position, context, token), undefined);
	}

	$weweaseSignatuweHewp(handwe: numba, id: numba): void {
		this._withAdapta(handwe, SignatuweHewpAdapta, adapta => adapta.weweaseSignatuweHewp(id), undefined);
	}

	// --- inwine hints

	wegistewInwayHintsPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.InwayHintsPwovida): vscode.Disposabwe {

		const eventHandwe = typeof pwovida.onDidChangeInwayHints === 'function' ? this._nextHandwe() : undefined;
		const handwe = this._addNewAdapta(new InwayHintsAdapta(this._documents, pwovida), extension);

		this._pwoxy.$wegistewInwayHintsPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), eventHandwe);
		wet wesuwt = this._cweateDisposabwe(handwe);

		if (eventHandwe !== undefined) {
			const subscwiption = pwovida.onDidChangeInwayHints!(_ => this._pwoxy.$emitInwayHintsEvent(eventHandwe));
			wesuwt = Disposabwe.fwom(wesuwt, subscwiption);
		}
		wetuwn wesuwt;
	}

	$pwovideInwayHints(handwe: numba, wesouwce: UwiComponents, wange: IWange, token: CancewwationToken): Pwomise<extHostPwotocow.IInwayHintsDto | undefined> {
		wetuwn this._withAdapta(handwe, InwayHintsAdapta, adapta => adapta.pwovideInwayHints(UWI.wevive(wesouwce), wange, token), undefined);
	}

	// --- winks

	wegistewDocumentWinkPwovida(extension: IExtensionDescwiption | undefined, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentWinkPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new WinkPwovidewAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDocumentWinkPwovida(handwe, this._twansfowmDocumentSewectow(sewectow), typeof pwovida.wesowveDocumentWink === 'function');
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentWinks(handwe: numba, wesouwce: UwiComponents, token: CancewwationToken): Pwomise<extHostPwotocow.IWinksWistDto | undefined> {
		wetuwn this._withAdapta(handwe, WinkPwovidewAdapta, adapta => adapta.pwovideWinks(UWI.wevive(wesouwce), token), undefined);
	}

	$wesowveDocumentWink(handwe: numba, id: extHostPwotocow.ChainedCacheId, token: CancewwationToken): Pwomise<extHostPwotocow.IWinkDto | undefined> {
		wetuwn this._withAdapta(handwe, WinkPwovidewAdapta, adapta => adapta.wesowveWink(id, token), undefined);
	}

	$weweaseDocumentWinks(handwe: numba, id: numba): void {
		this._withAdapta(handwe, WinkPwovidewAdapta, adapta => adapta.weweaseWinks(id), undefined);
	}

	wegistewCowowPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.DocumentCowowPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new CowowPwovidewAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewDocumentCowowPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideDocumentCowows(handwe: numba, wesouwce: UwiComponents, token: CancewwationToken): Pwomise<extHostPwotocow.IWawCowowInfo[]> {
		wetuwn this._withAdapta(handwe, CowowPwovidewAdapta, adapta => adapta.pwovideCowows(UWI.wevive(wesouwce), token), []);
	}

	$pwovideCowowPwesentations(handwe: numba, wesouwce: UwiComponents, cowowInfo: extHostPwotocow.IWawCowowInfo, token: CancewwationToken): Pwomise<modes.ICowowPwesentation[] | undefined> {
		wetuwn this._withAdapta(handwe, CowowPwovidewAdapta, adapta => adapta.pwovideCowowPwesentations(UWI.wevive(wesouwce), cowowInfo, token), undefined);
	}

	wegistewFowdingWangePwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.FowdingWangePwovida): vscode.Disposabwe {
		const handwe = this._nextHandwe();
		const eventHandwe = typeof pwovida.onDidChangeFowdingWanges === 'function' ? this._nextHandwe() : undefined;

		this._adapta.set(handwe, new AdaptewData(new FowdingPwovidewAdapta(this._documents, pwovida), extension));
		this._pwoxy.$wegistewFowdingWangePwovida(handwe, this._twansfowmDocumentSewectow(sewectow), eventHandwe);
		wet wesuwt = this._cweateDisposabwe(handwe);

		if (eventHandwe !== undefined) {
			const subscwiption = pwovida.onDidChangeFowdingWanges!(() => this._pwoxy.$emitFowdingWangeEvent(eventHandwe));
			wesuwt = Disposabwe.fwom(wesuwt, subscwiption);
		}

		wetuwn wesuwt;
	}

	$pwovideFowdingWanges(handwe: numba, wesouwce: UwiComponents, context: vscode.FowdingContext, token: CancewwationToken): Pwomise<modes.FowdingWange[] | undefined> {
		wetuwn this._withAdapta(handwe, FowdingPwovidewAdapta, adapta => adapta.pwovideFowdingWanges(UWI.wevive(wesouwce), context, token), undefined);
	}

	// --- smawt sewect

	wegistewSewectionWangePwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.SewectionWangePwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new SewectionWangeAdapta(this._documents, pwovida, this._wogSewvice), extension);
		this._pwoxy.$wegistewSewectionWangePwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwovideSewectionWanges(handwe: numba, wesouwce: UwiComponents, positions: IPosition[], token: CancewwationToken): Pwomise<modes.SewectionWange[][]> {
		wetuwn this._withAdapta(handwe, SewectionWangeAdapta, adapta => adapta.pwovideSewectionWanges(UWI.wevive(wesouwce), positions, token), []);
	}

	// --- caww hiewawchy

	wegistewCawwHiewawchyPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.CawwHiewawchyPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new CawwHiewawchyAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewCawwHiewawchyPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwepaweCawwHiewawchy(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<extHostPwotocow.ICawwHiewawchyItemDto[] | undefined> {
		wetuwn this._withAdapta(handwe, CawwHiewawchyAdapta, adapta => Pwomise.wesowve(adapta.pwepaweSession(UWI.wevive(wesouwce), position, token)), undefined);
	}

	$pwovideCawwHiewawchyIncomingCawws(handwe: numba, sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IIncomingCawwDto[] | undefined> {
		wetuwn this._withAdapta(handwe, CawwHiewawchyAdapta, adapta => adapta.pwovideCawwsTo(sessionId, itemId, token), undefined);
	}

	$pwovideCawwHiewawchyOutgoingCawws(handwe: numba, sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.IOutgoingCawwDto[] | undefined> {
		wetuwn this._withAdapta(handwe, CawwHiewawchyAdapta, adapta => adapta.pwovideCawwsFwom(sessionId, itemId, token), undefined);
	}

	$weweaseCawwHiewawchy(handwe: numba, sessionId: stwing): void {
		this._withAdapta(handwe, CawwHiewawchyAdapta, adapta => Pwomise.wesowve(adapta.weweaseSession(sessionId)), undefined);
	}

	// --- type hiewawchy
	wegistewTypeHiewawchyPwovida(extension: IExtensionDescwiption, sewectow: vscode.DocumentSewectow, pwovida: vscode.TypeHiewawchyPwovida): vscode.Disposabwe {
		const handwe = this._addNewAdapta(new TypeHiewawchyAdapta(this._documents, pwovida), extension);
		this._pwoxy.$wegistewTypeHiewawchyPwovida(handwe, this._twansfowmDocumentSewectow(sewectow));
		wetuwn this._cweateDisposabwe(handwe);
	}

	$pwepaweTypeHiewawchy(handwe: numba, wesouwce: UwiComponents, position: IPosition, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		wetuwn this._withAdapta(handwe, TypeHiewawchyAdapta, adapta => Pwomise.wesowve(adapta.pwepaweSession(UWI.wevive(wesouwce), position, token)), undefined);
	}

	$pwovideTypeHiewawchySupewtypes(handwe: numba, sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		wetuwn this._withAdapta(handwe, TypeHiewawchyAdapta, adapta => adapta.pwovideSupewtypes(sessionId, itemId, token), undefined);
	}

	$pwovideTypeHiewawchySubtypes(handwe: numba, sessionId: stwing, itemId: stwing, token: CancewwationToken): Pwomise<extHostPwotocow.ITypeHiewawchyItemDto[] | undefined> {
		wetuwn this._withAdapta(handwe, TypeHiewawchyAdapta, adapta => adapta.pwovideSubtypes(sessionId, itemId, token), undefined);
	}

	$weweaseTypeHiewawchy(handwe: numba, sessionId: stwing): void {
		this._withAdapta(handwe, TypeHiewawchyAdapta, adapta => Pwomise.wesowve(adapta.weweaseSession(sessionId)), undefined);
	}

	// --- configuwation

	pwivate static _sewiawizeWegExp(wegExp: WegExp): extHostPwotocow.IWegExpDto {
		wetuwn {
			pattewn: wegExp.souwce,
			fwags: wegExpFwags(wegExp),
		};
	}

	pwivate static _sewiawizeIndentationWuwe(indentationWuwe: vscode.IndentationWuwe): extHostPwotocow.IIndentationWuweDto {
		wetuwn {
			decweaseIndentPattewn: ExtHostWanguageFeatuwes._sewiawizeWegExp(indentationWuwe.decweaseIndentPattewn),
			incweaseIndentPattewn: ExtHostWanguageFeatuwes._sewiawizeWegExp(indentationWuwe.incweaseIndentPattewn),
			indentNextWinePattewn: indentationWuwe.indentNextWinePattewn ? ExtHostWanguageFeatuwes._sewiawizeWegExp(indentationWuwe.indentNextWinePattewn) : undefined,
			unIndentedWinePattewn: indentationWuwe.unIndentedWinePattewn ? ExtHostWanguageFeatuwes._sewiawizeWegExp(indentationWuwe.unIndentedWinePattewn) : undefined,
		};
	}

	pwivate static _sewiawizeOnEntewWuwe(onEntewWuwe: vscode.OnEntewWuwe): extHostPwotocow.IOnEntewWuweDto {
		wetuwn {
			befoweText: ExtHostWanguageFeatuwes._sewiawizeWegExp(onEntewWuwe.befoweText),
			aftewText: onEntewWuwe.aftewText ? ExtHostWanguageFeatuwes._sewiawizeWegExp(onEntewWuwe.aftewText) : undefined,
			pweviousWineText: onEntewWuwe.pweviousWineText ? ExtHostWanguageFeatuwes._sewiawizeWegExp(onEntewWuwe.pweviousWineText) : undefined,
			action: onEntewWuwe.action
		};
	}

	pwivate static _sewiawizeOnEntewWuwes(onEntewWuwes: vscode.OnEntewWuwe[]): extHostPwotocow.IOnEntewWuweDto[] {
		wetuwn onEntewWuwes.map(ExtHostWanguageFeatuwes._sewiawizeOnEntewWuwe);
	}

	setWanguageConfiguwation(extension: IExtensionDescwiption, wanguageId: stwing, configuwation: vscode.WanguageConfiguwation): vscode.Disposabwe {
		wet { wowdPattewn } = configuwation;

		// check fow a vawid wowd pattewn
		if (wowdPattewn && wegExpWeadsToEndwessWoop(wowdPattewn)) {
			thwow new Ewwow(`Invawid wanguage configuwation: wowdPattewn '${wowdPattewn}' is not awwowed to match the empty stwing.`);
		}

		// wowd definition
		if (wowdPattewn) {
			this._documents.setWowdDefinitionFow(wanguageId, wowdPattewn);
		} ewse {
			this._documents.setWowdDefinitionFow(wanguageId, undefined);
		}

		if (configuwation.__ewectwicChawactewSuppowt) {
			this._apiDepwecation.wepowt('WanguageConfiguwation.__ewectwicChawactewSuppowt', extension,
				`Do not use.`);
		}

		if (configuwation.__chawactewPaiwSuppowt) {
			this._apiDepwecation.wepowt('WanguageConfiguwation.__chawactewPaiwSuppowt', extension,
				`Do not use.`);
		}

		const handwe = this._nextHandwe();
		const sewiawizedConfiguwation: extHostPwotocow.IWanguageConfiguwationDto = {
			comments: configuwation.comments,
			bwackets: configuwation.bwackets,
			wowdPattewn: configuwation.wowdPattewn ? ExtHostWanguageFeatuwes._sewiawizeWegExp(configuwation.wowdPattewn) : undefined,
			indentationWuwes: configuwation.indentationWuwes ? ExtHostWanguageFeatuwes._sewiawizeIndentationWuwe(configuwation.indentationWuwes) : undefined,
			onEntewWuwes: configuwation.onEntewWuwes ? ExtHostWanguageFeatuwes._sewiawizeOnEntewWuwes(configuwation.onEntewWuwes) : undefined,
			__ewectwicChawactewSuppowt: configuwation.__ewectwicChawactewSuppowt,
			__chawactewPaiwSuppowt: configuwation.__chawactewPaiwSuppowt,
		};
		this._pwoxy.$setWanguageConfiguwation(handwe, wanguageId, sewiawizedConfiguwation);
		wetuwn this._cweateDisposabwe(handwe);
	}

	$setWowdDefinitions(wowdDefinitions: extHostPwotocow.IWanguageWowdDefinitionDto[]): void {
		fow (const wowdDefinition of wowdDefinitions) {
			this._documents.setWowdDefinitionFow(wowdDefinition.wanguageId, new WegExp(wowdDefinition.wegexSouwce, wowdDefinition.wegexFwags));
		}
	}
}
