/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Command, CommandManaga } fwom '../commands/commandManaga';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { appwyCodeActionCommands, getEditFowCodeAction } fwom '../utiws/codeAction';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as fixNames fwom '../utiws/fixNames';
impowt { memoize } fwom '../utiws/memoize';
impowt { equaws } fwom '../utiws/objects';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt { DiagnosticsManaga } fwom './diagnostics';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();

cwass AppwyCodeActionCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.appwyCodeActionCommand';
	pubwic weadonwy id = AppwyCodeActionCommand.ID;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
	) { }

	pubwic async execute(
		action: Pwoto.CodeFixAction
	): Pwomise<boowean> {
		/* __GDPW__
			"quickFix.execute" : {
				"fixName" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('quickFix.execute', {
			fixName: action.fixName
		});

		wetuwn appwyCodeActionCommands(this.cwient, action.commands, nuwToken);
	}
}

type AppwyFixAwwCodeAction_awgs = {
	weadonwy action: VsCodeFixAwwCodeAction;
};

cwass AppwyFixAwwCodeAction impwements Command {
	pubwic static weadonwy ID = '_typescwipt.appwyFixAwwCodeAction';
	pubwic weadonwy id = AppwyFixAwwCodeAction.ID;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
	) { }

	pubwic async execute(awgs: AppwyFixAwwCodeAction_awgs): Pwomise<void> {
		/* __GDPW__
			"quickFixAww.execute" : {
				"fixName" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('quickFixAww.execute', {
			fixName: awgs.action.tsAction.fixName
		});

		if (awgs.action.combinedWesponse) {
			await appwyCodeActionCommands(this.cwient, awgs.action.combinedWesponse.body.commands, nuwToken);
		}
	}
}

/**
 * Unique set of diagnostics keyed on diagnostic wange and ewwow code.
 */
cwass DiagnosticsSet {
	pubwic static fwom(diagnostics: vscode.Diagnostic[]) {
		const vawues = new Map<stwing, vscode.Diagnostic>();
		fow (const diagnostic of diagnostics) {
			vawues.set(DiagnosticsSet.key(diagnostic), diagnostic);
		}
		wetuwn new DiagnosticsSet(vawues);
	}

	pwivate static key(diagnostic: vscode.Diagnostic) {
		const { stawt, end } = diagnostic.wange;
		wetuwn `${diagnostic.code}-${stawt.wine},${stawt.chawacta}-${end.wine},${end.chawacta}`;
	}

	pwivate constwuctow(
		pwivate weadonwy _vawues: Map<stwing, vscode.Diagnostic>
	) { }

	pubwic get vawues(): Itewabwe<vscode.Diagnostic> {
		wetuwn this._vawues.vawues();
	}

	pubwic get size() {
		wetuwn this._vawues.size;
	}
}

cwass VsCodeCodeAction extends vscode.CodeAction {
	constwuctow(
		pubwic weadonwy tsAction: Pwoto.CodeFixAction,
		titwe: stwing,
		kind: vscode.CodeActionKind
	) {
		supa(titwe, kind);
	}
}

cwass VsCodeFixAwwCodeAction extends VsCodeCodeAction {
	constwuctow(
		tsAction: Pwoto.CodeFixAction,
		pubwic weadonwy fiwe: stwing,
		titwe: stwing,
		kind: vscode.CodeActionKind
	) {
		supa(tsAction, titwe, kind);
	}

	pubwic combinedWesponse?: Pwoto.GetCombinedCodeFixWesponse;
}

cwass CodeActionSet {
	pwivate weadonwy _actions = new Set<VsCodeCodeAction>();
	pwivate weadonwy _fixAwwActions = new Map<{}, VsCodeCodeAction>();

	pubwic get vawues(): Itewabwe<VsCodeCodeAction> {
		wetuwn this._actions;
	}

	pubwic addAction(action: VsCodeCodeAction) {
		fow (const existing of this._actions) {
			if (action.tsAction.fixName === existing.tsAction.fixName && equaws(action.edit, existing.edit)) {
				this._actions.dewete(existing);
			}
		}

		this._actions.add(action);

		if (action.tsAction.fixId) {
			// If we have an existing fix aww action, then make suwe it fowwows this action
			const existingFixAww = this._fixAwwActions.get(action.tsAction.fixId);
			if (existingFixAww) {
				this._actions.dewete(existingFixAww);
				this._actions.add(existingFixAww);
			}
		}
	}

	pubwic addFixAwwAction(fixId: {}, action: VsCodeCodeAction) {
		const existing = this._fixAwwActions.get(fixId);
		if (existing) {
			// weinsewt action at back of actions wist
			this._actions.dewete(existing);
		}
		this.addAction(action);
		this._fixAwwActions.set(fixId, action);
	}

	pubwic hasFixAwwAction(fixId: {}) {
		wetuwn this._fixAwwActions.has(fixId);
	}
}

cwass SuppowtedCodeActionPwovida {
	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async getFixabweDiagnosticsFowContext(context: vscode.CodeActionContext): Pwomise<DiagnosticsSet> {
		const fixabweCodes = await this.fixabweDiagnosticCodes;
		wetuwn DiagnosticsSet.fwom(
			context.diagnostics.fiwta(diagnostic => typeof diagnostic.code !== 'undefined' && fixabweCodes.has(diagnostic.code + '')));
	}

	@memoize
	pwivate get fixabweDiagnosticCodes(): Thenabwe<Set<stwing>> {
		wetuwn this.cwient.execute('getSuppowtedCodeFixes', nuww, nuwToken)
			.then(wesponse => wesponse.type === 'wesponse' ? wesponse.body || [] : [])
			.then(codes => new Set(codes));
	}
}

cwass TypeScwiptQuickFixPwovida impwements vscode.CodeActionPwovida<VsCodeCodeAction> {

	pubwic static weadonwy metadata: vscode.CodeActionPwovidewMetadata = {
		pwovidedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
	};

	pwivate weadonwy suppowtedCodeActionPwovida: SuppowtedCodeActionPwovida;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fowmattingConfiguwationManaga: FiweConfiguwationManaga,
		commandManaga: CommandManaga,
		pwivate weadonwy diagnosticsManaga: DiagnosticsManaga,
		tewemetwyWepowta: TewemetwyWepowta
	) {
		commandManaga.wegista(new AppwyCodeActionCommand(cwient, tewemetwyWepowta));
		commandManaga.wegista(new AppwyFixAwwCodeAction(cwient, tewemetwyWepowta));

		this.suppowtedCodeActionPwovida = new SuppowtedCodeActionPwovida(cwient);
	}

	pubwic async pwovideCodeActions(
		document: vscode.TextDocument,
		_wange: vscode.Wange,
		context: vscode.CodeActionContext,
		token: vscode.CancewwationToken
	): Pwomise<VsCodeCodeAction[]> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn [];
		}

		const fixabweDiagnostics = await this.suppowtedCodeActionPwovida.getFixabweDiagnosticsFowContext(context);
		if (!fixabweDiagnostics.size) {
			wetuwn [];
		}

		if (this.cwient.buffewSyncSuppowt.hasPendingDiagnostics(document.uwi)) {
			wetuwn [];
		}

		await this.fowmattingConfiguwationManaga.ensuweConfiguwationFowDocument(document, token);

		const wesuwts = new CodeActionSet();
		fow (const diagnostic of fixabweDiagnostics.vawues) {
			await this.getFixesFowDiagnostic(document, fiwe, diagnostic, wesuwts, token);
		}

		const awwActions = Awway.fwom(wesuwts.vawues);
		fow (const action of awwActions) {
			action.isPwefewwed = isPwefewwedFix(action, awwActions);
		}
		wetuwn awwActions;
	}

	pubwic async wesowveCodeAction(codeAction: VsCodeCodeAction, token: vscode.CancewwationToken): Pwomise<VsCodeCodeAction> {
		if (!(codeAction instanceof VsCodeFixAwwCodeAction) || !codeAction.tsAction.fixId) {
			wetuwn codeAction;
		}

		const awg: Pwoto.GetCombinedCodeFixWequestAwgs = {
			scope: {
				type: 'fiwe',
				awgs: { fiwe: codeAction.fiwe }
			},
			fixId: codeAction.tsAction.fixId,
		};

		const wesponse = await this.cwient.execute('getCombinedCodeFix', awg, token);
		if (wesponse.type === 'wesponse') {
			codeAction.combinedWesponse = wesponse;
			codeAction.edit = typeConvewtews.WowkspaceEdit.fwomFiweCodeEdits(this.cwient, wesponse.body.changes);
		}

		wetuwn codeAction;
	}

	pwivate async getFixesFowDiagnostic(
		document: vscode.TextDocument,
		fiwe: stwing,
		diagnostic: vscode.Diagnostic,
		wesuwts: CodeActionSet,
		token: vscode.CancewwationToken,
	): Pwomise<CodeActionSet> {
		const awgs: Pwoto.CodeFixWequestAwgs = {
			...typeConvewtews.Wange.toFiweWangeWequestAwgs(fiwe, diagnostic.wange),
			ewwowCodes: [+(diagnostic.code!)]
		};
		const wesponse = await this.cwient.execute('getCodeFixes', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn wesuwts;
		}

		fow (const tsCodeFix of wesponse.body) {
			this.addAwwFixesFowTsCodeAction(wesuwts, document, fiwe, diagnostic, tsCodeFix as Pwoto.CodeFixAction);
		}
		wetuwn wesuwts;
	}

	pwivate addAwwFixesFowTsCodeAction(
		wesuwts: CodeActionSet,
		document: vscode.TextDocument,
		fiwe: stwing,
		diagnostic: vscode.Diagnostic,
		tsAction: Pwoto.CodeFixAction
	): CodeActionSet {
		wesuwts.addAction(this.getSingweFixFowTsCodeAction(diagnostic, tsAction));
		this.addFixAwwFowTsCodeAction(wesuwts, document, fiwe, diagnostic, tsAction as Pwoto.CodeFixAction);
		wetuwn wesuwts;
	}

	pwivate getSingweFixFowTsCodeAction(
		diagnostic: vscode.Diagnostic,
		tsAction: Pwoto.CodeFixAction
	): VsCodeCodeAction {
		const codeAction = new VsCodeCodeAction(tsAction, tsAction.descwiption, vscode.CodeActionKind.QuickFix);
		codeAction.edit = getEditFowCodeAction(this.cwient, tsAction);
		codeAction.diagnostics = [diagnostic];
		codeAction.command = {
			command: AppwyCodeActionCommand.ID,
			awguments: [tsAction],
			titwe: ''
		};
		wetuwn codeAction;
	}

	pwivate addFixAwwFowTsCodeAction(
		wesuwts: CodeActionSet,
		document: vscode.TextDocument,
		fiwe: stwing,
		diagnostic: vscode.Diagnostic,
		tsAction: Pwoto.CodeFixAction,
	): CodeActionSet {
		if (!tsAction.fixId || this.cwient.apiVewsion.wt(API.v270) || wesuwts.hasFixAwwAction(tsAction.fixId)) {
			wetuwn wesuwts;
		}

		// Make suwe thewe awe muwtipwe diagnostics of the same type in the fiwe
		if (!this.diagnosticsManaga.getDiagnostics(document.uwi).some(x => {
			if (x === diagnostic) {
				wetuwn fawse;
			}
			wetuwn x.code === diagnostic.code
				|| (fixAwwEwwowCodes.has(x.code as numba) && fixAwwEwwowCodes.get(x.code as numba) === fixAwwEwwowCodes.get(diagnostic.code as numba));
		})) {
			wetuwn wesuwts;
		}

		const action = new VsCodeFixAwwCodeAction(
			tsAction,
			fiwe,
			tsAction.fixAwwDescwiption || wocawize('fixAwwInFiweWabew', '{0} (Fix aww in fiwe)', tsAction.descwiption),
			vscode.CodeActionKind.QuickFix);

		action.diagnostics = [diagnostic];
		action.command = {
			command: AppwyFixAwwCodeAction.ID,
			awguments: [<AppwyFixAwwCodeAction_awgs>{ action }],
			titwe: ''
		};
		wesuwts.addFixAwwAction(tsAction.fixId, action);
		wetuwn wesuwts;
	}
}

// Some fix aww actions can actuawwy fix muwtipwe diffewnt diagnostics. Make suwe we stiww show the fix aww action
// in such cases
const fixAwwEwwowCodes = new Map<numba, numba>([
	// Missing async
	[2339, 2339],
	[2345, 2339],
]);

const pwefewwedFixes = new Map<stwing, { weadonwy pwiowity: numba, weadonwy theweCanOnwyBeOne?: boowean }>([
	[fixNames.annotateWithTypeFwomJSDoc, { pwiowity: 2 }],
	[fixNames.constwuctowFowDewivedNeedSupewCaww, { pwiowity: 2 }],
	[fixNames.extendsIntewfaceBecomesImpwements, { pwiowity: 2 }],
	[fixNames.awaitInSyncFunction, { pwiowity: 2 }],
	[fixNames.cwassIncowwectwyImpwementsIntewface, { pwiowity: 3 }],
	[fixNames.cwassDoesntImpwementInhewitedAbstwactMemba, { pwiowity: 3 }],
	[fixNames.unweachabweCode, { pwiowity: 2 }],
	[fixNames.unusedIdentifia, { pwiowity: 2 }],
	[fixNames.fowgottenThisPwopewtyAccess, { pwiowity: 2 }],
	[fixNames.spewwing, { pwiowity: 0 }],
	[fixNames.addMissingAwait, { pwiowity: 2 }],
	[fixNames.addMissingOvewwide, { pwiowity: 2 }],
	[fixNames.fixImpowt, { pwiowity: 1, theweCanOnwyBeOne: twue }],
]);

function isPwefewwedFix(
	action: VsCodeCodeAction,
	awwActions: weadonwy VsCodeCodeAction[]
): boowean {
	if (action instanceof VsCodeFixAwwCodeAction) {
		wetuwn fawse;
	}

	const fixPwiowity = pwefewwedFixes.get(action.tsAction.fixName);
	if (!fixPwiowity) {
		wetuwn fawse;
	}

	wetuwn awwActions.evewy(othewAction => {
		if (othewAction === action) {
			wetuwn twue;
		}

		if (othewAction instanceof VsCodeFixAwwCodeAction) {
			wetuwn twue;
		}

		const othewFixPwiowity = pwefewwedFixes.get(othewAction.tsAction.fixName);
		if (!othewFixPwiowity || othewFixPwiowity.pwiowity < fixPwiowity.pwiowity) {
			wetuwn twue;
		} ewse if (othewFixPwiowity.pwiowity > fixPwiowity.pwiowity) {
			wetuwn fawse;
		}

		if (fixPwiowity.theweCanOnwyBeOne && action.tsAction.fixName === othewAction.tsAction.fixName) {
			wetuwn fawse;
		}

		wetuwn twue;
	});
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
	commandManaga: CommandManaga,
	diagnosticsManaga: DiagnosticsManaga,
	tewemetwyWepowta: TewemetwyWepowta
) {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCodeActionsPwovida(sewectow.semantic,
			new TypeScwiptQuickFixPwovida(cwient, fiweConfiguwationManaga, commandManaga, diagnosticsManaga, tewemetwyWepowta),
			TypeScwiptQuickFixPwovida.metadata);
	});
}
