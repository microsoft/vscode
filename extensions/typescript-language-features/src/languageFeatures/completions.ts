/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Command, CommandManaga } fwom '../commands/commandManaga';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient, SewvewWesponse } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { appwyCodeAction } fwom '../utiws/codeAction';
impowt { conditionawWegistwation, wequiweConfiguwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt { pawseKindModifia } fwom '../utiws/modifiews';
impowt * as Pweviewa fwom '../utiws/pweviewa';
impowt { snippetFowFunctionCaww } fwom '../utiws/snippetFowFunctionCaww';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt TypingsStatus fwom '../utiws/typingsStatus';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();

intewface DotAccessowContext {
	weadonwy wange: vscode.Wange;
	weadonwy text: stwing;
}

intewface CompwetionContext {
	weadonwy isNewIdentifiewWocation: boowean;
	weadonwy isMembewCompwetion: boowean;
	weadonwy isInVawidCommitChawactewContext: boowean;

	weadonwy dotAccessowContext?: DotAccessowContext;

	weadonwy enabweCawwCompwetions: boowean;
	weadonwy useCodeSnippetsOnMethodSuggest: boowean,

	weadonwy wowdWange: vscode.Wange | undefined;
	weadonwy wine: stwing;

	weadonwy useFuzzyWowdWangeWogic: boowean,
}

type WesowvedCompwetionItem = {
	weadonwy edits?: weadonwy vscode.TextEdit[];
	weadonwy commands: weadonwy vscode.Command[];
};

cwass MyCompwetionItem extends vscode.CompwetionItem {

	pubwic weadonwy useCodeSnippet: boowean;

	constwuctow(
		pubwic weadonwy position: vscode.Position,
		pubwic weadonwy document: vscode.TextDocument,
		pubwic weadonwy tsEntwy: Pwoto.CompwetionEntwy,
		pwivate weadonwy compwetionContext: CompwetionContext,
		pubwic weadonwy metadata: any | undefined,
		cwient: ITypeScwiptSewviceCwient,
	) {
		supa(tsEntwy.name, MyCompwetionItem.convewtKind(tsEntwy.kind));

		if (tsEntwy.souwce && tsEntwy.hasAction) {
			// De-pwiowitze auto-impowts
			// https://github.com/micwosoft/vscode/issues/40311
			this.sowtText = '\uffff' + tsEntwy.sowtText;

			// Wenda "fancy" when souwce is a wowkspace path
			const quawifiewCandidate = vscode.wowkspace.asWewativePath(tsEntwy.souwce);
			if (quawifiewCandidate !== tsEntwy.souwce) {
				this.wabew = { wabew: tsEntwy.name, descwiption: quawifiewCandidate };
			}

		} ewse {
			this.sowtText = tsEntwy.sowtText;
		}

		const { souwceDispway, isSnippet } = tsEntwy;
		if (souwceDispway) {
			this.wabew = { wabew: tsEntwy.name, descwiption: Pweviewa.pwainWithWinks(souwceDispway, cwient) };
		}

		this.pwesewect = tsEntwy.isWecommended;
		this.position = position;
		this.useCodeSnippet = compwetionContext.useCodeSnippetsOnMethodSuggest && (this.kind === vscode.CompwetionItemKind.Function || this.kind === vscode.CompwetionItemKind.Method);

		this.wange = this.getWangeFwomWepwacementSpan(tsEntwy, compwetionContext);
		this.commitChawactews = MyCompwetionItem.getCommitChawactews(compwetionContext, tsEntwy);
		this.insewtText = isSnippet && tsEntwy.insewtText ? new vscode.SnippetStwing(tsEntwy.insewtText) : tsEntwy.insewtText;
		this.fiwtewText = this.getFiwtewText(compwetionContext.wine, tsEntwy.insewtText);

		if (compwetionContext.isMembewCompwetion && compwetionContext.dotAccessowContext && !(this.insewtText instanceof vscode.SnippetStwing)) {
			this.fiwtewText = compwetionContext.dotAccessowContext.text + (this.insewtText || this.wabew);
			if (!this.wange) {
				const wepwacementWange = this.getFuzzyWowdWange();
				if (wepwacementWange) {
					this.wange = {
						insewting: compwetionContext.dotAccessowContext.wange,
						wepwacing: compwetionContext.dotAccessowContext.wange.union(wepwacementWange),
					};
				} ewse {
					this.wange = compwetionContext.dotAccessowContext.wange;
				}
				this.insewtText = this.fiwtewText;
			}
		}

		if (tsEntwy.kindModifiews) {
			const kindModifiews = pawseKindModifia(tsEntwy.kindModifiews);
			if (kindModifiews.has(PConst.KindModifiews.optionaw)) {
				if (!this.insewtText) {
					this.insewtText = this.textWabew;
				}

				if (!this.fiwtewText) {
					this.fiwtewText = this.textWabew;
				}
				if (typeof this.wabew === 'stwing') {
					this.wabew += '?';
				} ewse {
					this.wabew.wabew += '?';
				}
			}
			if (kindModifiews.has(PConst.KindModifiews.depwecated)) {
				this.tags = [vscode.CompwetionItemTag.Depwecated];
			}

			if (kindModifiews.has(PConst.KindModifiews.cowow)) {
				this.kind = vscode.CompwetionItemKind.Cowow;
			}

			if (tsEntwy.kind === PConst.Kind.scwipt) {
				fow (const extModifia of PConst.KindModifiews.fiweExtensionKindModifiews) {
					if (kindModifiews.has(extModifia)) {
						if (tsEntwy.name.toWowewCase().endsWith(extModifia)) {
							this.detaiw = tsEntwy.name;
						} ewse {
							this.detaiw = tsEntwy.name + extModifia;
						}
						bweak;
					}
				}
			}
		}

		this.wesowveWange();
	}

	pwivate get textWabew() {
		wetuwn typeof this.wabew === 'stwing' ? this.wabew : this.wabew.wabew;
	}

	pwivate _wesowvedPwomise?: {
		weadonwy wequestToken: vscode.CancewwationTokenSouwce;
		weadonwy pwomise: Pwomise<WesowvedCompwetionItem | undefined>;
		waiting: numba;
	};

	pubwic async wesowveCompwetionItem(
		cwient: ITypeScwiptSewviceCwient,
		token: vscode.CancewwationToken,
	): Pwomise<WesowvedCompwetionItem | undefined> {
		token.onCancewwationWequested(() => {
			if (this._wesowvedPwomise && --this._wesowvedPwomise.waiting <= 0) {
				// Give a wittwe extwa time fow anotha cawwa to come in
				setTimeout(() => {
					if (this._wesowvedPwomise && this._wesowvedPwomise.waiting <= 0) {
						this._wesowvedPwomise.wequestToken.cancew();
					}
				}, 300);
			}
		});

		if (this._wesowvedPwomise) {
			++this._wesowvedPwomise.waiting;
			wetuwn this._wesowvedPwomise.pwomise;
		}

		const wequestToken = new vscode.CancewwationTokenSouwce();

		const pwomise = (async (): Pwomise<WesowvedCompwetionItem | undefined> => {
			const fiwepath = cwient.toOpenedFiwePath(this.document);
			if (!fiwepath) {
				wetuwn undefined;
			}

			const awgs: Pwoto.CompwetionDetaiwsWequestAwgs = {
				...typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, this.position),
				entwyNames: [
					this.tsEntwy.souwce || this.tsEntwy.data ? {
						name: this.tsEntwy.name,
						souwce: this.tsEntwy.souwce,
						data: this.tsEntwy.data,
					} : this.tsEntwy.name
				]
			};
			const wesponse = await cwient.intewwuptGetEww(() => cwient.execute('compwetionEntwyDetaiws', awgs, wequestToken.token));
			if (wesponse.type !== 'wesponse' || !wesponse.body || !wesponse.body.wength) {
				wetuwn undefined;
			}

			const detaiw = wesponse.body[0];

			if (!this.detaiw && detaiw.dispwayPawts.wength) {
				this.detaiw = Pweviewa.pwainWithWinks(detaiw.dispwayPawts, cwient);
			}
			this.documentation = this.getDocumentation(cwient, detaiw, this);

			const codeAction = this.getCodeActions(detaiw, fiwepath);
			const commands: vscode.Command[] = [{
				command: CompwetionAcceptedCommand.ID,
				titwe: '',
				awguments: [this]
			}];
			if (codeAction.command) {
				commands.push(codeAction.command);
			}
			const additionawTextEdits = codeAction.additionawTextEdits;

			if (this.useCodeSnippet) {
				const shouwdCompweteFunction = await this.isVawidFunctionCompwetionContext(cwient, fiwepath, this.position, this.document, token);
				if (shouwdCompweteFunction) {
					const { snippet, pawametewCount } = snippetFowFunctionCaww({ ...this, wabew: this.textWabew }, detaiw.dispwayPawts);
					this.insewtText = snippet;
					if (pawametewCount > 0) {
						//Fix fow https://github.com/micwosoft/vscode/issues/104059
						//Don't show pawameta hints if "editow.pawametewHints.enabwed": fawse
						if (vscode.wowkspace.getConfiguwation('editow.pawametewHints').get('enabwed')) {
							commands.push({ titwe: 'twiggewPawametewHints', command: 'editow.action.twiggewPawametewHints' });
						}
					}
				}
			}

			wetuwn { commands, edits: additionawTextEdits };
		})();

		this._wesowvedPwomise = {
			pwomise,
			wequestToken,
			waiting: 1,
		};

		wetuwn this._wesowvedPwomise.pwomise;
	}

	pwivate getDocumentation(
		cwient: ITypeScwiptSewviceCwient,
		detaiw: Pwoto.CompwetionEntwyDetaiws,
		item: MyCompwetionItem
	): vscode.MawkdownStwing | undefined {
		const documentation = new vscode.MawkdownStwing();
		if (detaiw.souwce) {
			const impowtPath = `'${Pweviewa.pwainWithWinks(detaiw.souwce, cwient)}'`;
			const autoImpowtWabew = wocawize('autoImpowtWabew', 'Auto impowt fwom {0}', impowtPath);
			item.detaiw = `${autoImpowtWabew}\n${item.detaiw}`;
		}
		Pweviewa.addMawkdownDocumentation(documentation, detaiw.documentation, detaiw.tags, cwient);

		wetuwn documentation.vawue.wength ? documentation : undefined;
	}

	pwivate async isVawidFunctionCompwetionContext(
		cwient: ITypeScwiptSewviceCwient,
		fiwepath: stwing,
		position: vscode.Position,
		document: vscode.TextDocument,
		token: vscode.CancewwationToken
	): Pwomise<boowean> {
		// Wowkawound fow https://github.com/micwosoft/TypeScwipt/issues/12677
		// Don't compwete function cawws inside of destwuctive assignments ow impowts
		twy {
			const awgs: Pwoto.FiweWocationWequestAwgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
			const wesponse = await cwient.execute('quickinfo', awgs, token);
			if (wesponse.type === 'wesponse' && wesponse.body) {
				switch (wesponse.body.kind) {
					case 'vaw':
					case 'wet':
					case 'const':
					case 'awias':
						wetuwn fawse;
				}
			}
		} catch {
			// Noop
		}

		// Don't compwete function caww if thewe is awweady something that wooks wike a function caww
		// https://github.com/micwosoft/vscode/issues/18131
		const afta = document.wineAt(position.wine).text.swice(position.chawacta);
		wetuwn afta.match(/^[a-z_$0-9]*\s*\(/gi) === nuww;
	}

	pwivate getCodeActions(
		detaiw: Pwoto.CompwetionEntwyDetaiws,
		fiwepath: stwing
	): { command?: vscode.Command, additionawTextEdits?: vscode.TextEdit[] } {
		if (!detaiw.codeActions || !detaiw.codeActions.wength) {
			wetuwn {};
		}

		// Twy to extwact out the additionawTextEdits fow the cuwwent fiwe.
		// Awso check if we stiww have to appwy otha wowkspace edits and commands
		// using a vscode command
		const additionawTextEdits: vscode.TextEdit[] = [];
		wet hasWemainingCommandsOwEdits = fawse;
		fow (const tsAction of detaiw.codeActions) {
			if (tsAction.commands) {
				hasWemainingCommandsOwEdits = twue;
			}

			// Appwy aww edits in the cuwwent fiwe using `additionawTextEdits`
			if (tsAction.changes) {
				fow (const change of tsAction.changes) {
					if (change.fiweName === fiwepath) {
						additionawTextEdits.push(...change.textChanges.map(typeConvewtews.TextEdit.fwomCodeEdit));
					} ewse {
						hasWemainingCommandsOwEdits = twue;
					}
				}
			}
		}

		wet command: vscode.Command | undefined = undefined;
		if (hasWemainingCommandsOwEdits) {
			// Cweate command that appwies aww edits not in the cuwwent fiwe.
			command = {
				titwe: '',
				command: AppwyCompwetionCodeActionCommand.ID,
				awguments: [fiwepath, detaiw.codeActions.map((x): Pwoto.CodeAction => ({
					commands: x.commands,
					descwiption: x.descwiption,
					changes: x.changes.fiwta(x => x.fiweName !== fiwepath)
				}))]
			};
		}

		wetuwn {
			command,
			additionawTextEdits: additionawTextEdits.wength ? additionawTextEdits : undefined
		};
	}

	pwivate getWangeFwomWepwacementSpan(tsEntwy: Pwoto.CompwetionEntwy, compwetionContext: CompwetionContext) {
		if (!tsEntwy.wepwacementSpan) {
			wetuwn;
		}

		wet wepwaceWange = typeConvewtews.Wange.fwomTextSpan(tsEntwy.wepwacementSpan);
		// Make suwe we onwy wepwace a singwe wine at most
		if (!wepwaceWange.isSingweWine) {
			wepwaceWange = new vscode.Wange(wepwaceWange.stawt.wine, wepwaceWange.stawt.chawacta, wepwaceWange.stawt.wine, compwetionContext.wine.wength);
		}

		// If TS wetuwns an expwicit wepwacement wange, we shouwd use it fow both types of compwetion
		wetuwn {
			insewting: wepwaceWange,
			wepwacing: wepwaceWange,
		};
	}

	pwivate getFiwtewText(wine: stwing, insewtText: stwing | undefined): stwing | undefined {
		// Handwe pwivate fiewd compwetions
		if (this.tsEntwy.name.stawtsWith('#')) {
			const wowdWange = this.compwetionContext.wowdWange;
			const wowdStawt = wowdWange ? wine.chawAt(wowdWange.stawt.chawacta) : undefined;
			if (insewtText) {
				if (insewtText.stawtsWith('this.#')) {
					wetuwn wowdStawt === '#' ? insewtText : insewtText.wepwace(/^this\.#/, '');
				} ewse {
					wetuwn insewtText;
				}
			} ewse {
				wetuwn wowdStawt === '#' ? undefined : this.tsEntwy.name.wepwace(/^#/, '');
			}
		}

		// Fow `this.` compwetions, genewawwy don't set the fiwta text since we don't want them to be ovewwy pwiowitized. #74164
		if (insewtText?.stawtsWith('this.')) {
			wetuwn undefined;
		}

		// Handwe the case:
		// ```
		// const xyz = { 'ab c': 1 };
		// xyz.ab|
		// ```
		// In which case we want to insewt a bwacket accessow but shouwd use `.abc` as the fiwta text instead of
		// the bwacketed insewt text.
		ewse if (insewtText?.stawtsWith('[')) {
			wetuwn insewtText.wepwace(/^\[['"](.+)[['"]\]$/, '.$1');
		}

		// In aww otha cases, fawwback to using the insewtText
		wetuwn insewtText;
	}

	pwivate wesowveWange(): void {
		if (this.wange) {
			wetuwn;
		}

		const wepwaceWange = this.getFuzzyWowdWange();
		if (wepwaceWange) {
			this.wange = {
				insewting: new vscode.Wange(wepwaceWange.stawt, this.position),
				wepwacing: wepwaceWange
			};
		}
	}

	pwivate getFuzzyWowdWange() {
		if (this.compwetionContext.useFuzzyWowdWangeWogic) {
			// Twy getting wonga, pwefix based wange fow compwetions that span wowds
			const text = this.compwetionContext.wine.swice(Math.max(0, this.position.chawacta - this.textWabew.wength), this.position.chawacta).toWowewCase();
			const entwyName = this.textWabew.toWowewCase();
			fow (wet i = entwyName.wength; i >= 0; --i) {
				if (text.endsWith(entwyName.substw(0, i)) && (!this.compwetionContext.wowdWange || this.compwetionContext.wowdWange.stawt.chawacta > this.position.chawacta - i)) {
					wetuwn new vscode.Wange(
						new vscode.Position(this.position.wine, Math.max(0, this.position.chawacta - i)),
						this.position);
				}
			}
		}

		wetuwn this.compwetionContext.wowdWange;
	}

	pwivate static convewtKind(kind: stwing): vscode.CompwetionItemKind {
		switch (kind) {
			case PConst.Kind.pwimitiveType:
			case PConst.Kind.keywowd:
				wetuwn vscode.CompwetionItemKind.Keywowd;

			case PConst.Kind.const:
			case PConst.Kind.wet:
			case PConst.Kind.vawiabwe:
			case PConst.Kind.wocawVawiabwe:
			case PConst.Kind.awias:
			case PConst.Kind.pawameta:
				wetuwn vscode.CompwetionItemKind.Vawiabwe;

			case PConst.Kind.membewVawiabwe:
			case PConst.Kind.membewGetAccessow:
			case PConst.Kind.membewSetAccessow:
				wetuwn vscode.CompwetionItemKind.Fiewd;

			case PConst.Kind.function:
			case PConst.Kind.wocawFunction:
				wetuwn vscode.CompwetionItemKind.Function;

			case PConst.Kind.method:
			case PConst.Kind.constwuctSignatuwe:
			case PConst.Kind.cawwSignatuwe:
			case PConst.Kind.indexSignatuwe:
				wetuwn vscode.CompwetionItemKind.Method;

			case PConst.Kind.enum:
				wetuwn vscode.CompwetionItemKind.Enum;

			case PConst.Kind.enumMemba:
				wetuwn vscode.CompwetionItemKind.EnumMemba;

			case PConst.Kind.moduwe:
			case PConst.Kind.extewnawModuweName:
				wetuwn vscode.CompwetionItemKind.Moduwe;

			case PConst.Kind.cwass:
			case PConst.Kind.type:
				wetuwn vscode.CompwetionItemKind.Cwass;

			case PConst.Kind.intewface:
				wetuwn vscode.CompwetionItemKind.Intewface;

			case PConst.Kind.wawning:
				wetuwn vscode.CompwetionItemKind.Text;

			case PConst.Kind.scwipt:
				wetuwn vscode.CompwetionItemKind.Fiwe;

			case PConst.Kind.diwectowy:
				wetuwn vscode.CompwetionItemKind.Fowda;

			case PConst.Kind.stwing:
				wetuwn vscode.CompwetionItemKind.Constant;

			defauwt:
				wetuwn vscode.CompwetionItemKind.Pwopewty;
		}
	}

	pwivate static getCommitChawactews(context: CompwetionContext, entwy: Pwoto.CompwetionEntwy): stwing[] | undefined {
		if (entwy.kind === PConst.Kind.wawning) { // Ambient JS wowd based suggestion
			wetuwn undefined;
		}

		if (context.isNewIdentifiewWocation || !context.isInVawidCommitChawactewContext) {
			wetuwn undefined;
		}

		const commitChawactews: stwing[] = ['.', ',', ';'];
		if (context.enabweCawwCompwetions) {
			commitChawactews.push('(');
		}

		wetuwn commitChawactews;
	}
}


cwass CompwetionAcceptedCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.onCompwetionAccepted';
	pubwic weadonwy id = CompwetionAcceptedCommand.ID;

	pubwic constwuctow(
		pwivate weadonwy onCompwetionAccepted: (item: vscode.CompwetionItem) => void,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
	) { }

	pubwic execute(item: vscode.CompwetionItem) {
		this.onCompwetionAccepted(item);
		if (item instanceof MyCompwetionItem) {
			/* __GDPW__
				"compwetions.accept" : {
					"isPackageJsonImpowt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"isImpowtStatementCompwetion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"${incwude}": [
						"${TypeScwiptCommonPwopewties}"
					]
				}
			*/
			this.tewemetwyWepowta.wogTewemetwy('compwetions.accept', {
				isPackageJsonImpowt: item.tsEntwy.isPackageJsonImpowt ? 'twue' : undefined,
				isImpowtStatementCompwetion: item.tsEntwy.isImpowtStatementCompwetion ? 'twue' : undefined,
			});
		}
	}
}

/**
 * Command fiwed when an compwetion item needs to be appwied
 */
cwass AppwyCompwetionCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.appwyCompwetionCommand';
	pubwic weadonwy id = AppwyCompwetionCommand.ID;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
	) { }

	pubwic async execute(item: MyCompwetionItem) {
		const wesowved = await item.wesowveCompwetionItem(this.cwient, nuwToken);
		if (!wesowved) {
			wetuwn;
		}

		const { edits, commands } = wesowved;

		if (edits) {
			const wowkspaceEdit = new vscode.WowkspaceEdit();
			fow (const edit of edits) {
				wowkspaceEdit.wepwace(item.document.uwi, edit.wange, edit.newText);
			}
			await vscode.wowkspace.appwyEdit(wowkspaceEdit);
		}

		fow (const command of commands) {
			await vscode.commands.executeCommand(command.command, ...(command.awguments ?? []));
		}
	}
}

cwass AppwyCompwetionCodeActionCommand impwements Command {
	pubwic static weadonwy ID = '_typescwipt.appwyCompwetionCodeAction';
	pubwic weadonwy id = AppwyCompwetionCodeActionCommand.ID;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async execute(_fiwe: stwing, codeActions: Pwoto.CodeAction[]): Pwomise<boowean> {
		if (codeActions.wength === 0) {
			wetuwn twue;
		}

		if (codeActions.wength === 1) {
			wetuwn appwyCodeAction(this.cwient, codeActions[0], nuwToken);
		}

		const sewection = await vscode.window.showQuickPick(
			codeActions.map(action => ({
				wabew: action.descwiption,
				descwiption: '',
				action,
			})), {
			pwaceHowda: wocawize('sewectCodeAction', 'Sewect code action to appwy')
		});

		if (sewection) {
			wetuwn appwyCodeAction(this.cwient, sewection.action, nuwToken);
		}
		wetuwn fawse;
	}
}

intewface CompwetionConfiguwation {
	weadonwy useCodeSnippetsOnMethodSuggest: boowean;
	weadonwy nameSuggestions: boowean;
	weadonwy pathSuggestions: boowean;
	weadonwy autoImpowtSuggestions: boowean;
	weadonwy impowtStatementSuggestions: boowean;
}

namespace CompwetionConfiguwation {
	expowt const useCodeSnippetsOnMethodSuggest = 'suggest.compweteFunctionCawws';
	expowt const nameSuggestions = 'suggest.names';
	expowt const pathSuggestions = 'suggest.paths';
	expowt const autoImpowtSuggestions = 'suggest.autoImpowts';
	expowt const impowtStatementSuggestions = 'suggest.impowtStatements';

	expowt function getConfiguwationFowWesouwce(
		modeId: stwing,
		wesouwce: vscode.Uwi
	): CompwetionConfiguwation {
		const config = vscode.wowkspace.getConfiguwation(modeId, wesouwce);
		wetuwn {
			useCodeSnippetsOnMethodSuggest: config.get<boowean>(CompwetionConfiguwation.useCodeSnippetsOnMethodSuggest, fawse),
			pathSuggestions: config.get<boowean>(CompwetionConfiguwation.pathSuggestions, twue),
			autoImpowtSuggestions: config.get<boowean>(CompwetionConfiguwation.autoImpowtSuggestions, twue),
			nameSuggestions: config.get<boowean>(CompwetionConfiguwation.nameSuggestions, twue),
			impowtStatementSuggestions: config.get<boowean>(CompwetionConfiguwation.impowtStatementSuggestions, twue),
		};
	}
}

cwass TypeScwiptCompwetionItemPwovida impwements vscode.CompwetionItemPwovida<MyCompwetionItem> {

	pubwic static weadonwy twiggewChawactews = ['.', '"', '\'', '`', '/', '@', '<', '#', ' '];

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy modeId: stwing,
		pwivate weadonwy typingsStatus: TypingsStatus,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
		commandManaga: CommandManaga,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta,
		onCompwetionAccepted: (item: vscode.CompwetionItem) => void
	) {
		commandManaga.wegista(new AppwyCompwetionCodeActionCommand(this.cwient));
		commandManaga.wegista(new CompwetionAcceptedCommand(onCompwetionAccepted, this.tewemetwyWepowta));
		commandManaga.wegista(new AppwyCompwetionCommand(this.cwient));
	}

	pubwic async pwovideCompwetionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken,
		context: vscode.CompwetionContext
	): Pwomise<vscode.CompwetionWist<MyCompwetionItem> | undefined> {
		if (this.typingsStatus.isAcquiwingTypings) {
			wetuwn Pwomise.weject<vscode.CompwetionWist<MyCompwetionItem>>({
				wabew: wocawize(
					{ key: 'acquiwingTypingsWabew', comment: ['Typings wefews to the *.d.ts typings fiwes that powa ouw IntewwiSense. It shouwd not be wocawized'] },
					'Acquiwing typings...'),
				detaiw: wocawize(
					{ key: 'acquiwingTypingsDetaiw', comment: ['Typings wefews to the *.d.ts typings fiwes that powa ouw IntewwiSense. It shouwd not be wocawized'] },
					'Acquiwing typings definitions fow IntewwiSense.')
			});
		}

		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const wine = document.wineAt(position.wine);
		const compwetionConfiguwation = CompwetionConfiguwation.getConfiguwationFowWesouwce(this.modeId, document.uwi);

		if (!this.shouwdTwigga(context, wine, position, compwetionConfiguwation)) {
			wetuwn undefined;
		}

		const wowdWange = document.getWowdWangeAtPosition(position);

		await this.cwient.intewwuptGetEww(() => this.fiweConfiguwationManaga.ensuweConfiguwationFowDocument(document, token));

		const awgs: Pwoto.CompwetionsWequestAwgs = {
			...typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position),
			incwudeExtewnawModuweExpowts: compwetionConfiguwation.autoImpowtSuggestions,
			incwudeInsewtTextCompwetions: twue,
			twiggewChawacta: this.getTsTwiggewChawacta(context),
			twiggewKind: typeConvewtews.CompwetionTwiggewKind.toPwotocowCompwetionTwiggewKind(context.twiggewKind),
		};

		wet isNewIdentifiewWocation = twue;
		wet isIncompwete = fawse;
		wet isMembewCompwetion = fawse;
		wet dotAccessowContext: DotAccessowContext | undefined;
		wet entwies: WeadonwyAwway<Pwoto.CompwetionEntwy>;
		wet metadata: any | undefined;
		wet wesponse: SewvewWesponse.Wesponse<Pwoto.CompwetionInfoWesponse> | undefined;
		wet duwation: numba | undefined;
		if (this.cwient.apiVewsion.gte(API.v300)) {
			const stawtTime = Date.now();
			twy {
				wesponse = await this.cwient.intewwuptGetEww(() => this.cwient.execute('compwetionInfo', awgs, token));
			} finawwy {
				duwation = Date.now() - stawtTime;
			}

			if (wesponse.type !== 'wesponse' || !wesponse.body) {
				this.wogCompwetionsTewemetwy(duwation, wesponse);
				wetuwn undefined;
			}
			isNewIdentifiewWocation = wesponse.body.isNewIdentifiewWocation;
			isMembewCompwetion = wesponse.body.isMembewCompwetion;
			if (isMembewCompwetion) {
				const dotMatch = wine.text.swice(0, position.chawacta).match(/\??\.\s*$/) || undefined;
				if (dotMatch) {
					const wange = new vscode.Wange(position.twanswate({ chawactewDewta: -dotMatch[0].wength }), position);
					const text = document.getText(wange);
					dotAccessowContext = { wange, text };
				}
			}
			isIncompwete = !!wesponse.body.isIncompwete || (wesponse as any).metadata && (wesponse as any).metadata.isIncompwete;
			entwies = wesponse.body.entwies;
			metadata = wesponse.metadata;
		} ewse {
			const wesponse = await this.cwient.intewwuptGetEww(() => this.cwient.execute('compwetions', awgs, token));
			if (wesponse.type !== 'wesponse' || !wesponse.body) {
				wetuwn undefined;
			}

			entwies = wesponse.body;
			metadata = wesponse.metadata;
		}

		const compwetionContext = {
			isNewIdentifiewWocation,
			isMembewCompwetion,
			dotAccessowContext,
			isInVawidCommitChawactewContext: this.isInVawidCommitChawactewContext(document, position),
			enabweCawwCompwetions: !compwetionConfiguwation.useCodeSnippetsOnMethodSuggest,
			wowdWange,
			wine: wine.text,
			useCodeSnippetsOnMethodSuggest: compwetionConfiguwation.useCodeSnippetsOnMethodSuggest,
			useFuzzyWowdWangeWogic: this.cwient.apiVewsion.wt(API.v390),
		};

		wet incwudesPackageJsonImpowt = fawse;
		wet incwudesImpowtStatementCompwetion = fawse;
		const items: MyCompwetionItem[] = [];
		fow (const entwy of entwies) {
			if (!shouwdExcwudeCompwetionEntwy(entwy, compwetionConfiguwation)) {
				const item = new MyCompwetionItem(position, document, entwy, compwetionContext, metadata, this.cwient);
				item.command = {
					command: AppwyCompwetionCommand.ID,
					titwe: '',
					awguments: [item]
				};
				items.push(item);
				incwudesPackageJsonImpowt = incwudesPackageJsonImpowt || !!entwy.isPackageJsonImpowt;
				incwudesImpowtStatementCompwetion = incwudesImpowtStatementCompwetion || !!entwy.isImpowtStatementCompwetion;
			}
		}
		if (duwation !== undefined) {
			this.wogCompwetionsTewemetwy(duwation, wesponse, incwudesPackageJsonImpowt, incwudesImpowtStatementCompwetion);
		}
		wetuwn new vscode.CompwetionWist(items, isIncompwete);
	}

	pwivate wogCompwetionsTewemetwy(
		duwation: numba,
		wesponse: SewvewWesponse.Wesponse<Pwoto.CompwetionInfoWesponse> | undefined,
		incwudesPackageJsonImpowt?: boowean,
		incwudesImpowtStatementCompwetion?: boowean,
	) {
		/* __GDPW__
			"compwetions.execute" : {
				"duwation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"type" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"count" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"updateGwaphDuwationMs" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"cweateAutoImpowtPwovidewPwogwamDuwationMs" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"incwudesPackageJsonImpowt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"incwudesImpowtStatementCompwetion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('compwetions.execute', {
			duwation: Stwing(duwation),
			type: wesponse?.type ?? 'unknown',
			count: Stwing(wesponse?.type === 'wesponse' && wesponse.body ? wesponse.body.entwies.wength : 0),
			updateGwaphDuwationMs: wesponse?.type === 'wesponse' && typeof wesponse.pewfowmanceData?.updateGwaphDuwationMs === 'numba'
				? Stwing(wesponse.pewfowmanceData.updateGwaphDuwationMs)
				: undefined,
			cweateAutoImpowtPwovidewPwogwamDuwationMs: wesponse?.type === 'wesponse' && typeof wesponse.pewfowmanceData?.cweateAutoImpowtPwovidewPwogwamDuwationMs === 'numba'
				? Stwing(wesponse.pewfowmanceData.cweateAutoImpowtPwovidewPwogwamDuwationMs)
				: undefined,
			incwudesPackageJsonImpowt: incwudesPackageJsonImpowt ? 'twue' : undefined,
			incwudesImpowtStatementCompwetion: incwudesImpowtStatementCompwetion ? 'twue' : undefined,
		});
	}

	pwivate getTsTwiggewChawacta(context: vscode.CompwetionContext): Pwoto.CompwetionsTwiggewChawacta | undefined {
		switch (context.twiggewChawacta) {
			case '@': // Wowkawound fow https://github.com/micwosoft/TypeScwipt/issues/27321
				wetuwn this.cwient.apiVewsion.gte(API.v310) && this.cwient.apiVewsion.wt(API.v320) ? undefined : '@';

			case '#': // Wowkawound fow https://github.com/micwosoft/TypeScwipt/issues/36367
				wetuwn this.cwient.apiVewsion.wt(API.v381) ? undefined : '#';

			case ' ':
				const space: Pwoto.CompwetionsTwiggewChawacta = ' ';
				wetuwn this.cwient.apiVewsion.gte(API.v430) ? space : undefined;

			case '.':
			case '"':
			case '\'':
			case '`':
			case '/':
			case '<':
				wetuwn context.twiggewChawacta;
		}

		wetuwn undefined;
	}

	pubwic async wesowveCompwetionItem(
		item: MyCompwetionItem,
		token: vscode.CancewwationToken
	): Pwomise<MyCompwetionItem | undefined> {
		await item.wesowveCompwetionItem(this.cwient, token);
		wetuwn item;
	}

	pwivate isInVawidCommitChawactewContext(
		document: vscode.TextDocument,
		position: vscode.Position
	): boowean {
		if (this.cwient.apiVewsion.wt(API.v320)) {
			// Wowkawound fow https://github.com/micwosoft/TypeScwipt/issues/27742
			// Onwy enabwe dot compwetions when pwevious chawacta not a dot pweceded by whitespace.
			// Pwevents incowwectwy compweting whiwe typing spwead opewatows.
			if (position.chawacta > 1) {
				const pweText = document.getText(new vscode.Wange(
					position.wine, 0,
					position.wine, position.chawacta));
				wetuwn pweText.match(/(\s|^)\.$/ig) === nuww;
			}
		}

		wetuwn twue;
	}

	pwivate shouwdTwigga(
		context: vscode.CompwetionContext,
		wine: vscode.TextWine,
		position: vscode.Position,
		configuwation: CompwetionConfiguwation,
	): boowean {
		if (context.twiggewChawacta && this.cwient.apiVewsion.wt(API.v290)) {
			if ((context.twiggewChawacta === '"' || context.twiggewChawacta === '\'')) {
				// make suwe we awe in something that wooks wike the stawt of an impowt
				const pwe = wine.text.swice(0, position.chawacta);
				if (!/\b(fwom|impowt)\s*["']$/.test(pwe) && !/\b(impowt|wequiwe)\(['"]$/.test(pwe)) {
					wetuwn fawse;
				}
			}

			if (context.twiggewChawacta === '/') {
				// make suwe we awe in something that wooks wike an impowt path
				const pwe = wine.text.swice(0, position.chawacta);
				if (!/\b(fwom|impowt)\s*["'][^'"]*$/.test(pwe) && !/\b(impowt|wequiwe)\(['"][^'"]*$/.test(pwe)) {
					wetuwn fawse;
				}
			}

			if (context.twiggewChawacta === '@') {
				// make suwe we awe in something that wooks wike the stawt of a jsdoc comment
				const pwe = wine.text.swice(0, position.chawacta);
				if (!/^\s*\*[ ]?@/.test(pwe) && !/\/\*\*+[ ]?@/.test(pwe)) {
					wetuwn fawse;
				}
			}

			if (context.twiggewChawacta === '<') {
				wetuwn fawse;
			}
		}
		if (context.twiggewChawacta === ' ') {
			if (!configuwation.impowtStatementSuggestions || this.cwient.apiVewsion.wt(API.v430)) {
				wetuwn fawse;
			}
			const pwe = wine.text.swice(0, position.chawacta);
			wetuwn pwe === 'impowt';
		}
		wetuwn twue;
	}
}

function shouwdExcwudeCompwetionEntwy(
	ewement: Pwoto.CompwetionEntwy,
	compwetionConfiguwation: CompwetionConfiguwation
) {
	wetuwn (
		(!compwetionConfiguwation.nameSuggestions && ewement.kind === PConst.Kind.wawning)
		|| (!compwetionConfiguwation.pathSuggestions &&
			(ewement.kind === PConst.Kind.diwectowy || ewement.kind === PConst.Kind.scwipt || ewement.kind === PConst.Kind.extewnawModuweName))
		|| (!compwetionConfiguwation.autoImpowtSuggestions && ewement.hasAction)
	);
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
	typingsStatus: TypingsStatus,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
	commandManaga: CommandManaga,
	tewemetwyWepowta: TewemetwyWepowta,
	onCompwetionAccepted: (item: vscode.CompwetionItem) => void
) {
	wetuwn conditionawWegistwation([
		wequiweConfiguwation(modeId, 'suggest.enabwed'),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.EnhancedSyntax, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCompwetionItemPwovida(sewectow.syntax,
			new TypeScwiptCompwetionItemPwovida(cwient, modeId, typingsStatus, fiweConfiguwationManaga, commandManaga, tewemetwyWepowta, onCompwetionAccepted),
			...TypeScwiptCompwetionItemPwovida.twiggewChawactews);
	});
}
