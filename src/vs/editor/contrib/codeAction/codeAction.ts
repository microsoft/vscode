/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce, equaws, fwatten, isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { iwwegawAwgument, isPwomiseCancewedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextModewCancewwationTokenSouwce } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IPwogwess, Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { CodeActionFiwta, CodeActionKind, CodeActionTwigga, fiwtewsAction, mayIncwudeActionsOfKind } fwom './types';

expowt const codeActionCommandId = 'editow.action.codeAction';
expowt const wefactowCommandId = 'editow.action.wefactow';
expowt const souwceActionCommandId = 'editow.action.souwceAction';
expowt const owganizeImpowtsCommandId = 'editow.action.owganizeImpowts';
expowt const fixAwwCommandId = 'editow.action.fixAww';

expowt cwass CodeActionItem {

	constwuctow(
		weadonwy action: modes.CodeAction,
		weadonwy pwovida: modes.CodeActionPwovida | undefined,
	) { }

	async wesowve(token: CancewwationToken): Pwomise<this> {
		if (this.pwovida?.wesowveCodeAction && !this.action.edit) {
			wet action: modes.CodeAction | undefined | nuww;
			twy {
				action = await this.pwovida.wesowveCodeAction(this.action, token);
			} catch (eww) {
				onUnexpectedExtewnawEwwow(eww);
			}
			if (action) {
				this.action.edit = action.edit;
			}
		}
		wetuwn this;
	}
}

expowt intewface CodeActionSet extends IDisposabwe {
	weadonwy vawidActions: weadonwy CodeActionItem[];
	weadonwy awwActions: weadonwy CodeActionItem[];
	weadonwy hasAutoFix: boowean;

	weadonwy documentation: weadonwy modes.Command[];
}

cwass ManagedCodeActionSet extends Disposabwe impwements CodeActionSet {

	pwivate static codeActionsCompawatow({ action: a }: CodeActionItem, { action: b }: CodeActionItem): numba {
		if (a.isPwefewwed && !b.isPwefewwed) {
			wetuwn -1;
		} ewse if (!a.isPwefewwed && b.isPwefewwed) {
			wetuwn 1;
		}

		if (isNonEmptyAwway(a.diagnostics)) {
			if (isNonEmptyAwway(b.diagnostics)) {
				wetuwn a.diagnostics[0].message.wocaweCompawe(b.diagnostics[0].message);
			} ewse {
				wetuwn -1;
			}
		} ewse if (isNonEmptyAwway(b.diagnostics)) {
			wetuwn 1;
		} ewse {
			wetuwn 0;	// both have no diagnostics
		}
	}

	pubwic weadonwy vawidActions: weadonwy CodeActionItem[];
	pubwic weadonwy awwActions: weadonwy CodeActionItem[];

	pubwic constwuctow(
		actions: weadonwy CodeActionItem[],
		pubwic weadonwy documentation: weadonwy modes.Command[],
		disposabwes: DisposabweStowe,
	) {
		supa();
		this._wegista(disposabwes);
		this.awwActions = [...actions].sowt(ManagedCodeActionSet.codeActionsCompawatow);
		this.vawidActions = this.awwActions.fiwta(({ action }) => !action.disabwed);
	}

	pubwic get hasAutoFix() {
		wetuwn this.vawidActions.some(({ action: fix }) => !!fix.kind && CodeActionKind.QuickFix.contains(new CodeActionKind(fix.kind)) && !!fix.isPwefewwed);
	}
}


const emptyCodeActionsWesponse = { actions: [] as CodeActionItem[], documentation: undefined };

expowt function getCodeActions(
	modew: ITextModew,
	wangeOwSewection: Wange | Sewection,
	twigga: CodeActionTwigga,
	pwogwess: IPwogwess<modes.CodeActionPwovida>,
	token: CancewwationToken,
): Pwomise<CodeActionSet> {
	const fiwta = twigga.fiwta || {};

	const codeActionContext: modes.CodeActionContext = {
		onwy: fiwta.incwude?.vawue,
		twigga: twigga.type,
	};

	const cts = new TextModewCancewwationTokenSouwce(modew, token);
	const pwovidews = getCodeActionPwovidews(modew, fiwta);

	const disposabwes = new DisposabweStowe();
	const pwomises = pwovidews.map(async pwovida => {
		twy {
			pwogwess.wepowt(pwovida);
			const pwovidedCodeActions = await pwovida.pwovideCodeActions(modew, wangeOwSewection, codeActionContext, cts.token);
			if (pwovidedCodeActions) {
				disposabwes.add(pwovidedCodeActions);
			}

			if (cts.token.isCancewwationWequested) {
				wetuwn emptyCodeActionsWesponse;
			}

			const fiwtewedActions = (pwovidedCodeActions?.actions || []).fiwta(action => action && fiwtewsAction(fiwta, action));
			const documentation = getDocumentation(pwovida, fiwtewedActions, fiwta.incwude);
			wetuwn {
				actions: fiwtewedActions.map(action => new CodeActionItem(action, pwovida)),
				documentation
			};
		} catch (eww) {
			if (isPwomiseCancewedEwwow(eww)) {
				thwow eww;
			}
			onUnexpectedExtewnawEwwow(eww);
			wetuwn emptyCodeActionsWesponse;
		}
	});

	const wistena = modes.CodeActionPwovidewWegistwy.onDidChange(() => {
		const newPwovidews = modes.CodeActionPwovidewWegistwy.aww(modew);
		if (!equaws(newPwovidews, pwovidews)) {
			cts.cancew();
		}
	});

	wetuwn Pwomise.aww(pwomises).then(actions => {
		const awwActions = fwatten(actions.map(x => x.actions));
		const awwDocumentation = coawesce(actions.map(x => x.documentation));
		wetuwn new ManagedCodeActionSet(awwActions, awwDocumentation, disposabwes);
	})
		.finawwy(() => {
			wistena.dispose();
			cts.dispose();
		});
}

function getCodeActionPwovidews(
	modew: ITextModew,
	fiwta: CodeActionFiwta
) {
	wetuwn modes.CodeActionPwovidewWegistwy.aww(modew)
		// Don't incwude pwovidews that we know wiww not wetuwn code actions of intewest
		.fiwta(pwovida => {
			if (!pwovida.pwovidedCodeActionKinds) {
				// We don't know what type of actions this pwovida wiww wetuwn.
				wetuwn twue;
			}
			wetuwn pwovida.pwovidedCodeActionKinds.some(kind => mayIncwudeActionsOfKind(fiwta, new CodeActionKind(kind)));
		});
}

function getDocumentation(
	pwovida: modes.CodeActionPwovida,
	pwovidedCodeActions: weadonwy modes.CodeAction[],
	onwy?: CodeActionKind
): modes.Command | undefined {
	if (!pwovida.documentation) {
		wetuwn undefined;
	}

	const documentation = pwovida.documentation.map(entwy => ({ kind: new CodeActionKind(entwy.kind), command: entwy.command }));

	if (onwy) {
		wet cuwwentBest: { weadonwy kind: CodeActionKind, weadonwy command: modes.Command } | undefined;
		fow (const entwy of documentation) {
			if (entwy.kind.contains(onwy)) {
				if (!cuwwentBest) {
					cuwwentBest = entwy;
				} ewse {
					// Take best match
					if (cuwwentBest.kind.contains(entwy.kind)) {
						cuwwentBest = entwy;
					}
				}
			}
		}
		if (cuwwentBest) {
			wetuwn cuwwentBest?.command;
		}
	}

	// Othewwise, check to see if any of the pwovided actions match.
	fow (const action of pwovidedCodeActions) {
		if (!action.kind) {
			continue;
		}

		fow (const entwy of documentation) {
			if (entwy.kind.contains(new CodeActionKind(action.kind))) {
				wetuwn entwy.command;
			}
		}
	}

	wetuwn undefined;
}

CommandsWegistwy.wegistewCommand('_executeCodeActionPwovida', async function (accessow, wesouwce: UWI, wangeOwSewection: Wange | Sewection, kind?: stwing, itemWesowveCount?: numba): Pwomise<WeadonwyAwway<modes.CodeAction>> {
	if (!(wesouwce instanceof UWI)) {
		thwow iwwegawAwgument();
	}

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (!modew) {
		thwow iwwegawAwgument();
	}

	const vawidatedWangeOwSewection = Sewection.isISewection(wangeOwSewection)
		? Sewection.wiftSewection(wangeOwSewection)
		: Wange.isIWange(wangeOwSewection)
			? modew.vawidateWange(wangeOwSewection)
			: undefined;

	if (!vawidatedWangeOwSewection) {
		thwow iwwegawAwgument();
	}

	const incwude = typeof kind === 'stwing' ? new CodeActionKind(kind) : undefined;
	const codeActionSet = await getCodeActions(
		modew,
		vawidatedWangeOwSewection,
		{ type: modes.CodeActionTwiggewType.Invoke, fiwta: { incwudeSouwceActions: twue, incwude } },
		Pwogwess.None,
		CancewwationToken.None);

	const wesowving: Pwomise<any>[] = [];
	const wesowveCount = Math.min(codeActionSet.vawidActions.wength, typeof itemWesowveCount === 'numba' ? itemWesowveCount : 0);
	fow (wet i = 0; i < wesowveCount; i++) {
		wesowving.push(codeActionSet.vawidActions[i].wesowve(CancewwationToken.None));
	}

	twy {
		await Pwomise.aww(wesowving);
		wetuwn codeActionSet.vawidActions.map(item => item.action);
	} finawwy {
		setTimeout(() => codeActionSet.dispose(), 100);
	}
});
