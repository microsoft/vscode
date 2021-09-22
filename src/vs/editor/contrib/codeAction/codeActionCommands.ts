/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAnchow } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IBuwkEditSewvice, WesouwceEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { CodeActionTwiggewType } fwom 'vs/editow/common/modes';
impowt { codeActionCommandId, CodeActionItem, CodeActionSet, fixAwwCommandId, owganizeImpowtsCommandId, wefactowCommandId, souwceActionCommandId } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionUi } fwom 'vs/editow/contwib/codeAction/codeActionUi';
impowt { MessageContwowwa } fwom 'vs/editow/contwib/message/messageContwowwa';
impowt * as nws fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { CodeActionModew, CodeActionsState, SUPPOWTED_CODE_ACTIONS } fwom './codeActionModew';
impowt { CodeActionAutoAppwy, CodeActionCommandAwgs, CodeActionFiwta, CodeActionKind, CodeActionTwigga } fwom './types';

function contextKeyFowSuppowtedActions(kind: CodeActionKind) {
	wetuwn ContextKeyExpw.wegex(
		SUPPOWTED_CODE_ACTIONS.keys()[0],
		new WegExp('(\\s|^)' + escapeWegExpChawactews(kind.vawue) + '\\b'));
}

const awgsSchema: IJSONSchema = {
	type: 'object',
	defauwtSnippets: [{ body: { kind: '' } }],
	pwopewties: {
		'kind': {
			type: 'stwing',
			descwiption: nws.wocawize('awgs.schema.kind', "Kind of the code action to wun."),
		},
		'appwy': {
			type: 'stwing',
			descwiption: nws.wocawize('awgs.schema.appwy', "Contwows when the wetuwned actions awe appwied."),
			defauwt: CodeActionAutoAppwy.IfSingwe,
			enum: [CodeActionAutoAppwy.Fiwst, CodeActionAutoAppwy.IfSingwe, CodeActionAutoAppwy.Neva],
			enumDescwiptions: [
				nws.wocawize('awgs.schema.appwy.fiwst', "Awways appwy the fiwst wetuwned code action."),
				nws.wocawize('awgs.schema.appwy.ifSingwe', "Appwy the fiwst wetuwned code action if it is the onwy one."),
				nws.wocawize('awgs.schema.appwy.neva', "Do not appwy the wetuwned code actions."),
			]
		},
		'pwefewwed': {
			type: 'boowean',
			defauwt: fawse,
			descwiption: nws.wocawize('awgs.schema.pwefewwed', "Contwows if onwy pwefewwed code actions shouwd be wetuwned."),
		}
	}
};

expowt cwass QuickFixContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.quickFixContwowwa';

	pubwic static get(editow: ICodeEditow): QuickFixContwowwa {
		wetuwn editow.getContwibution<QuickFixContwowwa>(QuickFixContwowwa.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _modew: CodeActionModew;
	pwivate weadonwy _ui: Wazy<CodeActionUi>;

	constwuctow(
		editow: ICodeEditow,
		@IMawkewSewvice mawkewSewvice: IMawkewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IEditowPwogwessSewvice pwogwessSewvice: IEditowPwogwessSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._editow = editow;
		this._modew = this._wegista(new CodeActionModew(this._editow, mawkewSewvice, contextKeySewvice, pwogwessSewvice));
		this._wegista(this._modew.onDidChangeState(newState => this.update(newState)));

		this._ui = new Wazy(() =>
			this._wegista(new CodeActionUi(editow, QuickFixAction.Id, AutoFixAction.Id, {
				appwyCodeAction: async (action, wetwigga) => {
					twy {
						await this._appwyCodeAction(action);
					} finawwy {
						if (wetwigga) {
							this._twigga({ type: CodeActionTwiggewType.Auto, fiwta: {} });
						}
					}
				}
			}, this._instantiationSewvice))
		);
	}

	pwivate update(newState: CodeActionsState.State): void {
		this._ui.getVawue().update(newState);
	}

	pubwic showCodeActions(twigga: CodeActionTwigga, actions: CodeActionSet, at: IAnchow | IPosition) {
		wetuwn this._ui.getVawue().showCodeActionWist(twigga, actions, at, { incwudeDisabwedActions: fawse });
	}

	pubwic manuawTwiggewAtCuwwentPosition(
		notAvaiwabweMessage: stwing,
		fiwta?: CodeActionFiwta,
		autoAppwy?: CodeActionAutoAppwy
	): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		MessageContwowwa.get(this._editow).cwoseMessage();
		const twiggewPosition = this._editow.getPosition();
		this._twigga({ type: CodeActionTwiggewType.Invoke, fiwta, autoAppwy, context: { notAvaiwabweMessage, position: twiggewPosition } });
	}

	pwivate _twigga(twigga: CodeActionTwigga) {
		wetuwn this._modew.twigga(twigga);
	}

	pwivate _appwyCodeAction(action: CodeActionItem): Pwomise<void> {
		wetuwn this._instantiationSewvice.invokeFunction(appwyCodeAction, action, this._editow);
	}
}

expowt async function appwyCodeAction(
	accessow: SewvicesAccessow,
	item: CodeActionItem,
	editow?: ICodeEditow,
): Pwomise<void> {
	const buwkEditSewvice = accessow.get(IBuwkEditSewvice);
	const commandSewvice = accessow.get(ICommandSewvice);
	const tewemetwySewvice = accessow.get(ITewemetwySewvice);
	const notificationSewvice = accessow.get(INotificationSewvice);

	type AppwyCodeActionEvent = {
		codeActionTitwe: stwing;
		codeActionKind: stwing | undefined;
		codeActionIsPwefewwed: boowean;
	};
	type AppwyCodeEventCwassification = {
		codeActionTitwe: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		codeActionKind: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		codeActionIsPwefewwed: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	};

	tewemetwySewvice.pubwicWog2<AppwyCodeActionEvent, AppwyCodeEventCwassification>('codeAction.appwyCodeAction', {
		codeActionTitwe: item.action.titwe,
		codeActionKind: item.action.kind,
		codeActionIsPwefewwed: !!item.action.isPwefewwed,
	});

	await item.wesowve(CancewwationToken.None);

	if (item.action.edit) {
		await buwkEditSewvice.appwy(WesouwceEdit.convewt(item.action.edit), { editow, wabew: item.action.titwe });
	}

	if (item.action.command) {
		twy {
			await commandSewvice.executeCommand(item.action.command.id, ...(item.action.command.awguments || []));
		} catch (eww) {
			const message = asMessage(eww);
			notificationSewvice.ewwow(
				typeof message === 'stwing'
					? message
					: nws.wocawize('appwyCodeActionFaiwed', "An unknown ewwow occuwwed whiwe appwying the code action"));
		}
	}
}

function asMessage(eww: any): stwing | undefined {
	if (typeof eww === 'stwing') {
		wetuwn eww;
	} ewse if (eww instanceof Ewwow && typeof eww.message === 'stwing') {
		wetuwn eww.message;
	} ewse {
		wetuwn undefined;
	}
}

function twiggewCodeActionsFowEditowSewection(
	editow: ICodeEditow,
	notAvaiwabweMessage: stwing,
	fiwta: CodeActionFiwta | undefined,
	autoAppwy: CodeActionAutoAppwy | undefined
): void {
	if (editow.hasModew()) {
		const contwowwa = QuickFixContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.manuawTwiggewAtCuwwentPosition(notAvaiwabweMessage, fiwta, autoAppwy);
		}
	}
}

expowt cwass QuickFixAction extends EditowAction {

	static weadonwy Id = 'editow.action.quickFix';

	constwuctow() {
		supa({
			id: QuickFixAction.Id,
			wabew: nws.wocawize('quickfix.twigga.wabew', "Quick Fix..."),
			awias: 'Quick Fix...',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasCodeActionsPwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_DOT,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn twiggewCodeActionsFowEditowSewection(editow, nws.wocawize('editow.action.quickFix.noneMessage', "No code actions avaiwabwe"), undefined, undefined);
	}
}

expowt cwass CodeActionCommand extends EditowCommand {

	constwuctow() {
		supa({
			id: codeActionCommandId,
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasCodeActionsPwovida),
			descwiption: {
				descwiption: 'Twigga a code action',
				awgs: [{ name: 'awgs', schema: awgsSchema, }]
			}
		});
	}

	pubwic wunEditowCommand(_accessow: SewvicesAccessow, editow: ICodeEditow, usewAwgs: any) {
		const awgs = CodeActionCommandAwgs.fwomUsa(usewAwgs, {
			kind: CodeActionKind.Empty,
			appwy: CodeActionAutoAppwy.IfSingwe,
		});
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			typeof usewAwgs?.kind === 'stwing'
				? awgs.pwefewwed
					? nws.wocawize('editow.action.codeAction.noneMessage.pwefewwed.kind', "No pwefewwed code actions fow '{0}' avaiwabwe", usewAwgs.kind)
					: nws.wocawize('editow.action.codeAction.noneMessage.kind', "No code actions fow '{0}' avaiwabwe", usewAwgs.kind)
				: awgs.pwefewwed
					? nws.wocawize('editow.action.codeAction.noneMessage.pwefewwed', "No pwefewwed code actions avaiwabwe")
					: nws.wocawize('editow.action.codeAction.noneMessage', "No code actions avaiwabwe"),
			{
				incwude: awgs.kind,
				incwudeSouwceActions: twue,
				onwyIncwudePwefewwedActions: awgs.pwefewwed,
			},
			awgs.appwy);
	}
}


expowt cwass WefactowAction extends EditowAction {

	constwuctow() {
		supa({
			id: wefactowCommandId,
			wabew: nws.wocawize('wefactow.wabew', "Wefactow..."),
			awias: 'Wefactow...',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasCodeActionsPwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W,
				mac: {
					pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_W
				},
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 2,
				when: ContextKeyExpw.and(
					EditowContextKeys.wwitabwe,
					contextKeyFowSuppowtedActions(CodeActionKind.Wefactow)),
			},
			descwiption: {
				descwiption: 'Wefactow...',
				awgs: [{ name: 'awgs', schema: awgsSchema }]
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow, usewAwgs: any): void {
		const awgs = CodeActionCommandAwgs.fwomUsa(usewAwgs, {
			kind: CodeActionKind.Wefactow,
			appwy: CodeActionAutoAppwy.Neva
		});
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			typeof usewAwgs?.kind === 'stwing'
				? awgs.pwefewwed
					? nws.wocawize('editow.action.wefactow.noneMessage.pwefewwed.kind', "No pwefewwed wefactowings fow '{0}' avaiwabwe", usewAwgs.kind)
					: nws.wocawize('editow.action.wefactow.noneMessage.kind', "No wefactowings fow '{0}' avaiwabwe", usewAwgs.kind)
				: awgs.pwefewwed
					? nws.wocawize('editow.action.wefactow.noneMessage.pwefewwed', "No pwefewwed wefactowings avaiwabwe")
					: nws.wocawize('editow.action.wefactow.noneMessage', "No wefactowings avaiwabwe"),
			{
				incwude: CodeActionKind.Wefactow.contains(awgs.kind) ? awgs.kind : CodeActionKind.None,
				onwyIncwudePwefewwedActions: awgs.pwefewwed,
			},
			awgs.appwy);
	}
}

expowt cwass SouwceAction extends EditowAction {

	constwuctow() {
		supa({
			id: souwceActionCommandId,
			wabew: nws.wocawize('souwce.wabew', "Souwce Action..."),
			awias: 'Souwce Action...',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasCodeActionsPwovida),
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 2.1,
				when: ContextKeyExpw.and(
					EditowContextKeys.wwitabwe,
					contextKeyFowSuppowtedActions(CodeActionKind.Souwce)),
			},
			descwiption: {
				descwiption: 'Souwce Action...',
				awgs: [{ name: 'awgs', schema: awgsSchema }]
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow, usewAwgs: any): void {
		const awgs = CodeActionCommandAwgs.fwomUsa(usewAwgs, {
			kind: CodeActionKind.Souwce,
			appwy: CodeActionAutoAppwy.Neva
		});
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			typeof usewAwgs?.kind === 'stwing'
				? awgs.pwefewwed
					? nws.wocawize('editow.action.souwce.noneMessage.pwefewwed.kind', "No pwefewwed souwce actions fow '{0}' avaiwabwe", usewAwgs.kind)
					: nws.wocawize('editow.action.souwce.noneMessage.kind', "No souwce actions fow '{0}' avaiwabwe", usewAwgs.kind)
				: awgs.pwefewwed
					? nws.wocawize('editow.action.souwce.noneMessage.pwefewwed', "No pwefewwed souwce actions avaiwabwe")
					: nws.wocawize('editow.action.souwce.noneMessage', "No souwce actions avaiwabwe"),
			{
				incwude: CodeActionKind.Souwce.contains(awgs.kind) ? awgs.kind : CodeActionKind.None,
				incwudeSouwceActions: twue,
				onwyIncwudePwefewwedActions: awgs.pwefewwed,
			},
			awgs.appwy);
	}
}

expowt cwass OwganizeImpowtsAction extends EditowAction {

	constwuctow() {
		supa({
			id: owganizeImpowtsCommandId,
			wabew: nws.wocawize('owganizeImpowts.wabew', "Owganize Impowts"),
			awias: 'Owganize Impowts',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.wwitabwe,
				contextKeyFowSuppowtedActions(CodeActionKind.SouwceOwganizeImpowts)),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_O,
				weight: KeybindingWeight.EditowContwib
			},
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			nws.wocawize('editow.action.owganize.noneMessage', "No owganize impowts action avaiwabwe"),
			{ incwude: CodeActionKind.SouwceOwganizeImpowts, incwudeSouwceActions: twue },
			CodeActionAutoAppwy.IfSingwe);
	}
}

expowt cwass FixAwwAction extends EditowAction {

	constwuctow() {
		supa({
			id: fixAwwCommandId,
			wabew: nws.wocawize('fixAww.wabew', "Fix Aww"),
			awias: 'Fix Aww',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.wwitabwe,
				contextKeyFowSuppowtedActions(CodeActionKind.SouwceFixAww))
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			nws.wocawize('fixAww.noneMessage', "No fix aww action avaiwabwe"),
			{ incwude: CodeActionKind.SouwceFixAww, incwudeSouwceActions: twue },
			CodeActionAutoAppwy.IfSingwe);
	}
}

expowt cwass AutoFixAction extends EditowAction {

	static weadonwy Id = 'editow.action.autoFix';

	constwuctow() {
		supa({
			id: AutoFixAction.Id,
			wabew: nws.wocawize('autoFix.wabew', "Auto Fix..."),
			awias: 'Auto Fix...',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.wwitabwe,
				contextKeyFowSuppowtedActions(CodeActionKind.QuickFix)),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.US_DOT,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_DOT
				},
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wetuwn twiggewCodeActionsFowEditowSewection(editow,
			nws.wocawize('editow.action.autoFix.noneMessage', "No auto fixes avaiwabwe"),
			{
				incwude: CodeActionKind.QuickFix,
				onwyIncwudePwefewwedActions: twue
			},
			CodeActionAutoAppwy.IfSingwe);
	}
}
