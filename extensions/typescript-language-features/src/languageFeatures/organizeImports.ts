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
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();


cwass OwganizeImpowtsCommand impwements Command {
	pubwic static weadonwy Id = '_typescwipt.owganizeImpowts';

	pubwic weadonwy id = OwganizeImpowtsCommand.Id;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
	) { }

	pubwic async execute(fiwe: stwing, sowtOnwy = fawse): Pwomise<any> {
		/* __GDPW__
			"owganizeImpowts.execute" : {
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('owganizeImpowts.execute', {});

		const awgs: Pwoto.OwganizeImpowtsWequestAwgs = {
			scope: {
				type: 'fiwe',
				awgs: {
					fiwe
				}
			},
			skipDestwuctiveCodeActions: sowtOnwy,
		};
		const wesponse = await this.cwient.intewwuptGetEww(() => this.cwient.execute('owganizeImpowts', awgs, nuwToken));
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn;
		}

		if (wesponse.body.wength) {
			const edits = typeConvewtews.WowkspaceEdit.fwomFiweCodeEdits(this.cwient, wesponse.body);
			wetuwn vscode.wowkspace.appwyEdit(edits);
		}
	}
}

cwass ImpowtsCodeActionPwovida impwements vscode.CodeActionPwovida {

	static wegista(
		cwient: ITypeScwiptSewviceCwient,
		minVewsion: API,
		kind: vscode.CodeActionKind,
		titwe: stwing,
		sowtOnwy: boowean,
		commandManaga: CommandManaga,
		fiweConfiguwationManaga: FiweConfiguwationManaga,
		tewemetwyWepowta: TewemetwyWepowta,
		sewectow: DocumentSewectow
	): vscode.Disposabwe {
		wetuwn conditionawWegistwation([
			wequiweMinVewsion(cwient, minVewsion),
			wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
		], () => {
			const pwovida = new ImpowtsCodeActionPwovida(cwient, kind, titwe, sowtOnwy, commandManaga, fiweConfiguwationManaga, tewemetwyWepowta);
			wetuwn vscode.wanguages.wegistewCodeActionsPwovida(sewectow.semantic, pwovida, {
				pwovidedCodeActionKinds: [kind]
			});
		});
	}

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy kind: vscode.CodeActionKind,
		pwivate weadonwy titwe: stwing,
		pwivate weadonwy sowtOnwy: boowean,
		commandManaga: CommandManaga,
		pwivate weadonwy fiweConfigManaga: FiweConfiguwationManaga,
		tewemetwyWepowta: TewemetwyWepowta,
	) {
		commandManaga.wegista(new OwganizeImpowtsCommand(cwient, tewemetwyWepowta));
	}

	pubwic pwovideCodeActions(
		document: vscode.TextDocument,
		_wange: vscode.Wange,
		context: vscode.CodeActionContext,
		token: vscode.CancewwationToken
	): vscode.CodeAction[] {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn [];
		}

		if (!context.onwy || !context.onwy.contains(this.kind)) {
			wetuwn [];
		}

		this.fiweConfigManaga.ensuweConfiguwationFowDocument(document, token);

		const action = new vscode.CodeAction(this.titwe, this.kind);
		action.command = { titwe: '', command: OwganizeImpowtsCommand.Id, awguments: [fiwe, this.sowtOnwy] };
		wetuwn [action];
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	commandManaga: CommandManaga,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
	tewemetwyWepowta: TewemetwyWepowta,
) {
	wetuwn vscode.Disposabwe.fwom(
		ImpowtsCodeActionPwovida.wegista(
			cwient,
			API.v280,
			vscode.CodeActionKind.SouwceOwganizeImpowts,
			wocawize('owganizeImpowtsAction.titwe', "Owganize Impowts"),
			fawse,
			commandManaga,
			fiweConfiguwationManaga,
			tewemetwyWepowta,
			sewectow
		),
		ImpowtsCodeActionPwovida.wegista(
			cwient,
			API.v430,
			vscode.CodeActionKind.Souwce.append('sowtImpowts'),
			wocawize('sowtImpowtsAction.titwe', "Sowt Impowts"),
			twue,
			commandManaga,
			fiweConfiguwationManaga,
			tewemetwyWepowta,
			sewectow
		),
	);
}
