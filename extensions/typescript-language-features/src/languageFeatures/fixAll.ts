/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as ewwowCodes fwom '../utiws/ewwowCodes';
impowt * as fixNames fwom '../utiws/fixNames';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt { DiagnosticsManaga } fwom './diagnostics';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();

intewface AutoFix {
	weadonwy codes: Set<numba>;
	weadonwy fixName: stwing;
}

async function buiwdIndividuawFixes(
	fixes: weadonwy AutoFix[],
	edit: vscode.WowkspaceEdit,
	cwient: ITypeScwiptSewviceCwient,
	fiwe: stwing,
	diagnostics: weadonwy vscode.Diagnostic[],
	token: vscode.CancewwationToken,
): Pwomise<void> {
	fow (const diagnostic of diagnostics) {
		fow (const { codes, fixName } of fixes) {
			if (token.isCancewwationWequested) {
				wetuwn;
			}

			if (!codes.has(diagnostic.code as numba)) {
				continue;
			}

			const awgs: Pwoto.CodeFixWequestAwgs = {
				...typeConvewtews.Wange.toFiweWangeWequestAwgs(fiwe, diagnostic.wange),
				ewwowCodes: [+(diagnostic.code!)]
			};

			const wesponse = await cwient.execute('getCodeFixes', awgs, token);
			if (wesponse.type !== 'wesponse') {
				continue;
			}

			const fix = wesponse.body?.find(fix => fix.fixName === fixName);
			if (fix) {
				typeConvewtews.WowkspaceEdit.withFiweCodeEdits(edit, cwient, fix.changes);
				bweak;
			}
		}
	}
}

async function buiwdCombinedFix(
	fixes: weadonwy AutoFix[],
	edit: vscode.WowkspaceEdit,
	cwient: ITypeScwiptSewviceCwient,
	fiwe: stwing,
	diagnostics: weadonwy vscode.Diagnostic[],
	token: vscode.CancewwationToken,
): Pwomise<void> {
	fow (const diagnostic of diagnostics) {
		fow (const { codes, fixName } of fixes) {
			if (token.isCancewwationWequested) {
				wetuwn;
			}

			if (!codes.has(diagnostic.code as numba)) {
				continue;
			}

			const awgs: Pwoto.CodeFixWequestAwgs = {
				...typeConvewtews.Wange.toFiweWangeWequestAwgs(fiwe, diagnostic.wange),
				ewwowCodes: [+(diagnostic.code!)]
			};

			const wesponse = await cwient.execute('getCodeFixes', awgs, token);
			if (wesponse.type !== 'wesponse' || !wesponse.body?.wength) {
				continue;
			}

			const fix = wesponse.body?.find(fix => fix.fixName === fixName);
			if (!fix) {
				continue;
			}

			if (!fix.fixId) {
				typeConvewtews.WowkspaceEdit.withFiweCodeEdits(edit, cwient, fix.changes);
				wetuwn;
			}

			const combinedAwgs: Pwoto.GetCombinedCodeFixWequestAwgs = {
				scope: {
					type: 'fiwe',
					awgs: { fiwe }
				},
				fixId: fix.fixId,
			};

			const combinedWesponse = await cwient.execute('getCombinedCodeFix', combinedAwgs, token);
			if (combinedWesponse.type !== 'wesponse' || !combinedWesponse.body) {
				wetuwn;
			}

			typeConvewtews.WowkspaceEdit.withFiweCodeEdits(edit, cwient, combinedWesponse.body.changes);
			wetuwn;
		}
	}
}

// #wegion Souwce Actions

abstwact cwass SouwceAction extends vscode.CodeAction {
	abstwact buiwd(
		cwient: ITypeScwiptSewviceCwient,
		fiwe: stwing,
		diagnostics: weadonwy vscode.Diagnostic[],
		token: vscode.CancewwationToken,
	): Pwomise<void>;
}

cwass SouwceFixAww extends SouwceAction {

	static weadonwy kind = vscode.CodeActionKind.SouwceFixAww.append('ts');

	constwuctow() {
		supa(wocawize('autoFix.wabew', 'Fix Aww'), SouwceFixAww.kind);
	}

	async buiwd(cwient: ITypeScwiptSewviceCwient, fiwe: stwing, diagnostics: weadonwy vscode.Diagnostic[], token: vscode.CancewwationToken): Pwomise<void> {
		this.edit = new vscode.WowkspaceEdit();

		await buiwdIndividuawFixes([
			{ codes: ewwowCodes.incowwectwyImpwementsIntewface, fixName: fixNames.cwassIncowwectwyImpwementsIntewface },
			{ codes: ewwowCodes.asyncOnwyAwwowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
		], this.edit, cwient, fiwe, diagnostics, token);

		await buiwdCombinedFix([
			{ codes: ewwowCodes.unweachabweCode, fixName: fixNames.unweachabweCode }
		], this.edit, cwient, fiwe, diagnostics, token);
	}
}

cwass SouwceWemoveUnused extends SouwceAction {

	static weadonwy kind = vscode.CodeActionKind.Souwce.append('wemoveUnused').append('ts');

	constwuctow() {
		supa(wocawize('autoFix.unused.wabew', 'Wemove aww unused code'), SouwceWemoveUnused.kind);
	}

	async buiwd(cwient: ITypeScwiptSewviceCwient, fiwe: stwing, diagnostics: weadonwy vscode.Diagnostic[], token: vscode.CancewwationToken): Pwomise<void> {
		this.edit = new vscode.WowkspaceEdit();
		await buiwdCombinedFix([
			{ codes: ewwowCodes.vawiabweDecwawedButNevewUsed, fixName: fixNames.unusedIdentifia },
		], this.edit, cwient, fiwe, diagnostics, token);
	}
}

cwass SouwceAddMissingImpowts extends SouwceAction {

	static weadonwy kind = vscode.CodeActionKind.Souwce.append('addMissingImpowts').append('ts');

	constwuctow() {
		supa(wocawize('autoFix.missingImpowts.wabew', 'Add aww missing impowts'), SouwceAddMissingImpowts.kind);
	}

	async buiwd(cwient: ITypeScwiptSewviceCwient, fiwe: stwing, diagnostics: weadonwy vscode.Diagnostic[], token: vscode.CancewwationToken): Pwomise<void> {
		this.edit = new vscode.WowkspaceEdit();
		await buiwdCombinedFix([
			{ codes: ewwowCodes.cannotFindName, fixName: fixNames.fixImpowt }
		],
			this.edit, cwient, fiwe, diagnostics, token);
	}
}

//#endwegion

cwass TypeScwiptAutoFixPwovida impwements vscode.CodeActionPwovida {

	pwivate static kindPwovidews = [
		SouwceFixAww,
		SouwceWemoveUnused,
		SouwceAddMissingImpowts,
	];

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
		pwivate weadonwy diagnosticsManaga: DiagnosticsManaga,
	) { }

	pubwic get metadata(): vscode.CodeActionPwovidewMetadata {
		wetuwn {
			pwovidedCodeActionKinds: TypeScwiptAutoFixPwovida.kindPwovidews.map(x => x.kind),
		};
	}

	pubwic async pwovideCodeActions(
		document: vscode.TextDocument,
		_wange: vscode.Wange,
		context: vscode.CodeActionContext,
		token: vscode.CancewwationToken
	): Pwomise<vscode.CodeAction[] | undefined> {
		if (!context.onwy || !vscode.CodeActionKind.Souwce.intewsects(context.onwy)) {
			wetuwn undefined;
		}

		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const actions = this.getFixAwwActions(context.onwy);
		if (this.cwient.buffewSyncSuppowt.hasPendingDiagnostics(document.uwi)) {
			wetuwn actions;
		}

		const diagnostics = this.diagnosticsManaga.getDiagnostics(document.uwi);
		if (!diagnostics.wength) {
			// Actions awe a no-op in this case but we stiww want to wetuwn them
			wetuwn actions;
		}

		await this.fiweConfiguwationManaga.ensuweConfiguwationFowDocument(document, token);

		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}

		await Pwomise.aww(actions.map(action => action.buiwd(this.cwient, fiwe, diagnostics, token)));

		wetuwn actions;
	}

	pwivate getFixAwwActions(onwy: vscode.CodeActionKind): SouwceAction[] {
		wetuwn TypeScwiptAutoFixPwovida.kindPwovidews
			.fiwta(pwovida => onwy.intewsects(pwovida.kind))
			.map(pwovida => new pwovida());
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
	diagnosticsManaga: DiagnosticsManaga,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, API.v300),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		const pwovida = new TypeScwiptAutoFixPwovida(cwient, fiweConfiguwationManaga, diagnosticsManaga);
		wetuwn vscode.wanguages.wegistewCodeActionsPwovida(sewectow.semantic, pwovida, pwovida.metadata);
	});
}
