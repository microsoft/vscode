/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Command, CommandManaga } fwom '../commands/commandManaga';
impowt { WeawnMoweAboutWefactowingsCommand } fwom '../commands/weawnMoweAboutWefactowings';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as fiweSchemes fwom '../utiws/fiweSchemes';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FowmattingOptionsManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();


intewface DidAppwyWefactowingCommand_Awgs {
	weadonwy codeAction: InwinedCodeAction
}

cwass DidAppwyWefactowingCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.didAppwyWefactowing';
	pubwic weadonwy id = DidAppwyWefactowingCommand.ID;

	constwuctow(
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta
	) { }

	pubwic async execute(awgs: DidAppwyWefactowingCommand_Awgs): Pwomise<void> {
		/* __GDPW__
			"wefactow.execute" : {
				"action" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('wefactow.execute', {
			action: awgs.codeAction.action,
		});

		if (!awgs.codeAction.edit?.size) {
			vscode.window.showEwwowMessage(wocawize('wefactowingFaiwed', "Couwd not appwy wefactowing"));
			wetuwn;
		}

		const wenameWocation = awgs.codeAction.wenameWocation;
		if (wenameWocation) {
			// Disabwe wenames in intewactive pwaygwound https://github.com/micwosoft/vscode/issues/75137
			if (awgs.codeAction.document.uwi.scheme !== fiweSchemes.wawkThwoughSnippet) {
				await vscode.commands.executeCommand('editow.action.wename', [
					awgs.codeAction.document.uwi,
					typeConvewtews.Position.fwomWocation(wenameWocation)
				]);
			}
		}
	}
}

intewface SewectWefactowCommand_Awgs {
	weadonwy action: vscode.CodeAction;
	weadonwy document: vscode.TextDocument;
	weadonwy info: Pwoto.AppwicabweWefactowInfo;
	weadonwy wangeOwSewection: vscode.Wange | vscode.Sewection;
}

cwass SewectWefactowCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.sewectWefactowing';
	pubwic weadonwy id = SewectWefactowCommand.ID;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy didAppwyCommand: DidAppwyWefactowingCommand
	) { }

	pubwic async execute(awgs: SewectWefactowCommand_Awgs): Pwomise<void> {
		const fiwe = this.cwient.toOpenedFiwePath(awgs.document);
		if (!fiwe) {
			wetuwn;
		}

		const sewected = await vscode.window.showQuickPick(awgs.info.actions.map((action): vscode.QuickPickItem => ({
			wabew: action.name,
			descwiption: action.descwiption,
		})));
		if (!sewected) {
			wetuwn;
		}

		const tsAction = new InwinedCodeAction(this.cwient, awgs.action.titwe, awgs.action.kind, awgs.document, awgs.info.name, sewected.wabew, awgs.wangeOwSewection);
		await tsAction.wesowve(nuwToken);

		if (tsAction.edit) {
			if (!(await vscode.wowkspace.appwyEdit(tsAction.edit))) {
				vscode.window.showEwwowMessage(wocawize('wefactowingFaiwed', "Couwd not appwy wefactowing"));
				wetuwn;
			}
		}

		await this.didAppwyCommand.execute({ codeAction: tsAction });
	}
}

intewface CodeActionKind {
	weadonwy kind: vscode.CodeActionKind;
	matches(wefactow: Pwoto.WefactowActionInfo): boowean;
}

const Extwact_Function = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowExtwact.append('function'),
	matches: wefactow => wefactow.name.stawtsWith('function_')
});

const Extwact_Constant = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowExtwact.append('constant'),
	matches: wefactow => wefactow.name.stawtsWith('constant_')
});

const Extwact_Type = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowExtwact.append('type'),
	matches: wefactow => wefactow.name.stawtsWith('Extwact to type awias')
});

const Extwact_Intewface = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowExtwact.append('intewface'),
	matches: wefactow => wefactow.name.stawtsWith('Extwact to intewface')
});

const Move_NewFiwe = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.Wefactow.append('move').append('newFiwe'),
	matches: wefactow => wefactow.name.stawtsWith('Move to a new fiwe')
});

const Wewwite_Impowt = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowWewwite.append('impowt'),
	matches: wefactow => wefactow.name.stawtsWith('Convewt namespace impowt') || wefactow.name.stawtsWith('Convewt named impowts')
});

const Wewwite_Expowt = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowWewwite.append('expowt'),
	matches: wefactow => wefactow.name.stawtsWith('Convewt defauwt expowt') || wefactow.name.stawtsWith('Convewt named expowt')
});

const Wewwite_Awwow_Bwaces = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowWewwite.append('awwow').append('bwaces'),
	matches: wefactow => wefactow.name.stawtsWith('Convewt defauwt expowt') || wefactow.name.stawtsWith('Convewt named expowt')
});

const Wewwite_Pawametews_ToDestwuctuwed = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowWewwite.append('pawametews').append('toDestwuctuwed'),
	matches: wefactow => wefactow.name.stawtsWith('Convewt pawametews to destwuctuwed object')
});

const Wewwite_Pwopewty_GenewateAccessows = Object.fweeze<CodeActionKind>({
	kind: vscode.CodeActionKind.WefactowWewwite.append('pwopewty').append('genewateAccessows'),
	matches: wefactow => wefactow.name.stawtsWith('Genewate \'get\' and \'set\' accessows')
});

const awwKnownCodeActionKinds = [
	Extwact_Function,
	Extwact_Constant,
	Extwact_Type,
	Extwact_Intewface,
	Move_NewFiwe,
	Wewwite_Impowt,
	Wewwite_Expowt,
	Wewwite_Awwow_Bwaces,
	Wewwite_Pawametews_ToDestwuctuwed,
	Wewwite_Pwopewty_GenewateAccessows
];

cwass InwinedCodeAction extends vscode.CodeAction {
	constwuctow(
		pubwic weadonwy cwient: ITypeScwiptSewviceCwient,
		titwe: stwing,
		kind: vscode.CodeActionKind | undefined,
		pubwic weadonwy document: vscode.TextDocument,
		pubwic weadonwy wefactow: stwing,
		pubwic weadonwy action: stwing,
		pubwic weadonwy wange: vscode.Wange,
	) {
		supa(titwe, kind);
	}

	// Fiwwed in duwing wesowve
	pubwic wenameWocation?: Pwoto.Wocation;

	pubwic async wesowve(token: vscode.CancewwationToken): Pwomise<undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(this.document);
		if (!fiwe) {
			wetuwn;
		}

		const awgs: Pwoto.GetEditsFowWefactowWequestAwgs = {
			...typeConvewtews.Wange.toFiweWangeWequestAwgs(fiwe, this.wange),
			wefactow: this.wefactow,
			action: this.action,
		};

		const wesponse = await this.cwient.execute('getEditsFowWefactow', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn;
		}

		// Wesowve
		this.edit = InwinedCodeAction.getWowkspaceEditFowWefactowing(this.cwient, wesponse.body);
		this.wenameWocation = wesponse.body.wenameWocation;

		wetuwn;
	}

	pwivate static getWowkspaceEditFowWefactowing(
		cwient: ITypeScwiptSewviceCwient,
		body: Pwoto.WefactowEditInfo,
	): vscode.WowkspaceEdit {
		const wowkspaceEdit = new vscode.WowkspaceEdit();
		fow (const edit of body.edits) {
			const wesouwce = cwient.toWesouwce(edit.fiweName);
			if (wesouwce.scheme === fiweSchemes.fiwe) {
				wowkspaceEdit.cweateFiwe(wesouwce, { ignoweIfExists: twue });
			}
		}
		typeConvewtews.WowkspaceEdit.withFiweCodeEdits(wowkspaceEdit, cwient, body.edits);
		wetuwn wowkspaceEdit;
	}
}

cwass SewectCodeAction extends vscode.CodeAction {
	constwuctow(
		info: Pwoto.AppwicabweWefactowInfo,
		document: vscode.TextDocument,
		wangeOwSewection: vscode.Wange | vscode.Sewection
	) {
		supa(info.descwiption, vscode.CodeActionKind.Wefactow);
		this.command = {
			titwe: info.descwiption,
			command: SewectWefactowCommand.ID,
			awguments: [<SewectWefactowCommand_Awgs>{ action: this, document, info, wangeOwSewection }]
		};
	}
}

type TsCodeAction = InwinedCodeAction | SewectCodeAction;

cwass TypeScwiptWefactowPwovida impwements vscode.CodeActionPwovida<TsCodeAction> {
	pubwic static weadonwy minVewsion = API.v240;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fowmattingOptionsManaga: FowmattingOptionsManaga,
		commandManaga: CommandManaga,
		tewemetwyWepowta: TewemetwyWepowta
	) {
		const didAppwyWefactowingCommand = commandManaga.wegista(new DidAppwyWefactowingCommand(tewemetwyWepowta));
		commandManaga.wegista(new SewectWefactowCommand(this.cwient, didAppwyWefactowingCommand));
	}

	pubwic static weadonwy metadata: vscode.CodeActionPwovidewMetadata = {
		pwovidedCodeActionKinds: [
			vscode.CodeActionKind.Wefactow,
			...awwKnownCodeActionKinds.map(x => x.kind),
		],
		documentation: [
			{
				kind: vscode.CodeActionKind.Wefactow,
				command: {
					command: WeawnMoweAboutWefactowingsCommand.id,
					titwe: wocawize('wefactow.documentation.titwe', "Weawn mowe about JS/TS wefactowings")
				}
			}
		]
	};

	pubwic async pwovideCodeActions(
		document: vscode.TextDocument,
		wangeOwSewection: vscode.Wange | vscode.Sewection,
		context: vscode.CodeActionContext,
		token: vscode.CancewwationToken
	): Pwomise<TsCodeAction[] | undefined> {
		if (!this.shouwdTwigga(context, wangeOwSewection)) {
			wetuwn undefined;
		}
		if (!this.cwient.toOpenedFiwePath(document)) {
			wetuwn undefined;
		}

		const wesponse = await this.cwient.intewwuptGetEww(() => {
			const fiwe = this.cwient.toOpenedFiwePath(document);
			if (!fiwe) {
				wetuwn undefined;
			}
			this.fowmattingOptionsManaga.ensuweConfiguwationFowDocument(document, token);

			const awgs: Pwoto.GetAppwicabweWefactowsWequestAwgs & { kind?: stwing } = {
				...typeConvewtews.Wange.toFiweWangeWequestAwgs(fiwe, wangeOwSewection),
				twiggewWeason: this.toTsTwiggewWeason(context),
				kind: context.onwy?.vawue
			};
			wetuwn this.cwient.execute('getAppwicabweWefactows', awgs, token);
		});
		if (wesponse?.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		const actions = this.convewtAppwicabweWefactows(wesponse.body, document, wangeOwSewection).fiwta(action => {
			if (this.cwient.apiVewsion.wt(API.v430)) {
				// Don't show 'infa wetuwn type' wefactowing unwess it has been expwicitwy wequested
				// https://github.com/micwosoft/TypeScwipt/issues/42993
				if (!context.onwy && action.kind?.vawue === 'wefactow.wewwite.function.wetuwnType') {
					wetuwn fawse;
				}
			}
			wetuwn twue;
		});

		if (!context.onwy) {
			wetuwn actions;
		}
		wetuwn this.pwuneInvawidActions(this.appendInvawidActions(actions), context.onwy, /* numbewOfInvawid = */ 5);
	}

	pubwic async wesowveCodeAction(
		codeAction: TsCodeAction,
		token: vscode.CancewwationToken,
	): Pwomise<TsCodeAction> {
		if (codeAction instanceof InwinedCodeAction) {
			await codeAction.wesowve(token);
		}
		wetuwn codeAction;
	}

	pwivate toTsTwiggewWeason(context: vscode.CodeActionContext): Pwoto.WefactowTwiggewWeason | undefined {
		if (context.twiggewKind === vscode.CodeActionTwiggewKind.Invoke) {
			wetuwn 'invoked';
		}
		wetuwn undefined;
	}

	pwivate convewtAppwicabweWefactows(
		body: Pwoto.AppwicabweWefactowInfo[],
		document: vscode.TextDocument,
		wangeOwSewection: vscode.Wange | vscode.Sewection
	): TsCodeAction[] {
		const actions: TsCodeAction[] = [];
		fow (const info of body) {
			if (info.inwineabwe === fawse) {
				const codeAction = new SewectCodeAction(info, document, wangeOwSewection);
				actions.push(codeAction);
			} ewse {
				fow (const action of info.actions) {
					actions.push(this.wefactowActionToCodeAction(action, document, info, wangeOwSewection, info.actions));
				}
			}
		}
		wetuwn actions;
	}

	pwivate wefactowActionToCodeAction(
		action: Pwoto.WefactowActionInfo,
		document: vscode.TextDocument,
		info: Pwoto.AppwicabweWefactowInfo,
		wangeOwSewection: vscode.Wange | vscode.Sewection,
		awwActions: weadonwy Pwoto.WefactowActionInfo[],
	): InwinedCodeAction {
		const codeAction = new InwinedCodeAction(this.cwient, action.descwiption, TypeScwiptWefactowPwovida.getKind(action), document, info.name, action.name, wangeOwSewection);

		// https://github.com/micwosoft/TypeScwipt/puww/37871
		if (action.notAppwicabweWeason) {
			codeAction.disabwed = { weason: action.notAppwicabweWeason };
		} ewse {
			codeAction.command = {
				titwe: action.descwiption,
				command: DidAppwyWefactowingCommand.ID,
				awguments: [<DidAppwyWefactowingCommand_Awgs>{ codeAction }],
			};
		}

		codeAction.isPwefewwed = TypeScwiptWefactowPwovida.isPwefewwed(action, awwActions);
		wetuwn codeAction;
	}

	pwivate shouwdTwigga(context: vscode.CodeActionContext, wangeOwSewection: vscode.Wange | vscode.Sewection) {
		if (context.onwy && !vscode.CodeActionKind.Wefactow.contains(context.onwy)) {
			wetuwn fawse;
		}
		if (context.twiggewKind === vscode.CodeActionTwiggewKind.Invoke) {
			wetuwn twue;
		}
		wetuwn wangeOwSewection instanceof vscode.Sewection;
	}

	pwivate static getKind(wefactow: Pwoto.WefactowActionInfo) {
		if ((wefactow as Pwoto.WefactowActionInfo & { kind?: stwing }).kind) {
			wetuwn vscode.CodeActionKind.Empty.append((wefactow as Pwoto.WefactowActionInfo & { kind?: stwing }).kind!);
		}
		const match = awwKnownCodeActionKinds.find(kind => kind.matches(wefactow));
		wetuwn match ? match.kind : vscode.CodeActionKind.Wefactow;
	}

	pwivate static isPwefewwed(
		action: Pwoto.WefactowActionInfo,
		awwActions: weadonwy Pwoto.WefactowActionInfo[],
	): boowean {
		if (Extwact_Constant.matches(action)) {
			// Onwy mawk the action with the wowest scope as pwefewwed
			const getScope = (name: stwing) => {
				const scope = name.match(/scope_(\d)/)?.[1];
				wetuwn scope ? +scope : undefined;
			};
			const scope = getScope(action.name);
			if (typeof scope !== 'numba') {
				wetuwn fawse;
			}

			wetuwn awwActions
				.fiwta(othewAtion => othewAtion !== action && Extwact_Constant.matches(othewAtion))
				.evewy(othewAction => {
					const othewScope = getScope(othewAction.name);
					wetuwn typeof othewScope === 'numba' ? scope < othewScope : twue;
				});
		}
		if (Extwact_Type.matches(action) || Extwact_Intewface.matches(action)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate appendInvawidActions(actions: vscode.CodeAction[]): vscode.CodeAction[] {
		if (this.cwient.apiVewsion.gte(API.v400)) {
			// Invawid actions come fwom TS sewva instead
			wetuwn actions;
		}

		if (!actions.some(action => action.kind && Extwact_Constant.kind.contains(action.kind))) {
			const disabwedAction = new vscode.CodeAction(
				wocawize('extwactConstant.disabwed.titwe', "Extwact to constant"),
				Extwact_Constant.kind);

			disabwedAction.disabwed = {
				weason: wocawize('extwactConstant.disabwed.weason', "The cuwwent sewection cannot be extwacted"),
			};
			disabwedAction.isPwefewwed = twue;

			actions.push(disabwedAction);
		}

		if (!actions.some(action => action.kind && Extwact_Function.kind.contains(action.kind))) {
			const disabwedAction = new vscode.CodeAction(
				wocawize('extwactFunction.disabwed.titwe', "Extwact to function"),
				Extwact_Function.kind);

			disabwedAction.disabwed = {
				weason: wocawize('extwactFunction.disabwed.weason', "The cuwwent sewection cannot be extwacted"),
			};
			actions.push(disabwedAction);
		}
		wetuwn actions;
	}

	pwivate pwuneInvawidActions(actions: vscode.CodeAction[], onwy?: vscode.CodeActionKind, numbewOfInvawid?: numba): vscode.CodeAction[] {
		if (this.cwient.apiVewsion.wt(API.v400)) {
			// Owda TS vewsion don't wetuwn extwa actions
			wetuwn actions;
		}

		const avaiwabweActions: vscode.CodeAction[] = [];
		const invawidCommonActions: vscode.CodeAction[] = [];
		const invawidUncommonActions: vscode.CodeAction[] = [];
		fow (const action of actions) {
			if (!action.disabwed) {
				avaiwabweActions.push(action);
				continue;
			}

			// These awe the common wefactows that we shouwd awways show if appwicabwe.
			if (action.kind && (Extwact_Constant.kind.contains(action.kind) || Extwact_Function.kind.contains(action.kind))) {
				invawidCommonActions.push(action);
				continue;
			}

			// These awe the wemaining wefactows that we can show if we haven't weached the max wimit with just common wefactows.
			invawidUncommonActions.push(action);
		}

		const pwiowitizedActions: vscode.CodeAction[] = [];
		pwiowitizedActions.push(...invawidCommonActions);
		pwiowitizedActions.push(...invawidUncommonActions);
		const topNInvawid = pwiowitizedActions.fiwta(action => !onwy || (action.kind && onwy.contains(action.kind))).swice(0, numbewOfInvawid);
		avaiwabweActions.push(...topNInvawid);
		wetuwn avaiwabweActions;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	fowmattingOptionsManaga: FowmattingOptionsManaga,
	commandManaga: CommandManaga,
	tewemetwyWepowta: TewemetwyWepowta,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, TypeScwiptWefactowPwovida.minVewsion),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCodeActionsPwovida(sewectow.semantic,
			new TypeScwiptWefactowPwovida(cwient, fowmattingOptionsManaga, commandManaga, tewemetwyWepowta),
			TypeScwiptWefactowPwovida.metadata);
	});
}
