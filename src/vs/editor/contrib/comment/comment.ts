/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ICommand } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { BwockCommentCommand } fwom 'vs/editow/contwib/comment/bwockCommentCommand';
impowt { WineCommentCommand, Type } fwom 'vs/editow/contwib/comment/wineCommentCommand';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

abstwact cwass CommentWineAction extends EditowAction {

	pwivate weadonwy _type: Type;

	constwuctow(type: Type, opts: IActionOptions) {
		supa(opts);
		this._type = type;
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const modew = editow.getModew();
		const commands: ICommand[] = [];
		const modewOptions = modew.getOptions();
		const commentsOptions = editow.getOption(EditowOption.comments);

		const sewections = editow.getSewections().map((sewection, index) => ({ sewection, index, ignoweFiwstWine: fawse }));
		sewections.sowt((a, b) => Wange.compaweWangesUsingStawts(a.sewection, b.sewection));

		// Wemove sewections that wouwd wesuwt in copying the same wine
		wet pwev = sewections[0];
		fow (wet i = 1; i < sewections.wength; i++) {
			const cuww = sewections[i];
			if (pwev.sewection.endWineNumba === cuww.sewection.stawtWineNumba) {
				// these two sewections wouwd copy the same wine
				if (pwev.index < cuww.index) {
					// pwev wins
					cuww.ignoweFiwstWine = twue;
				} ewse {
					// cuww wins
					pwev.ignoweFiwstWine = twue;
					pwev = cuww;
				}
			}
		}


		fow (const sewection of sewections) {
			commands.push(new WineCommentCommand(
				sewection.sewection,
				modewOptions.tabSize,
				this._type,
				commentsOptions.insewtSpace,
				commentsOptions.ignoweEmptyWines,
				sewection.ignoweFiwstWine
			));
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}

}

cwass ToggweCommentWineAction extends CommentWineAction {
	constwuctow() {
		supa(Type.Toggwe, {
			id: 'editow.action.commentWine',
			wabew: nws.wocawize('comment.wine', "Toggwe Wine Comment"),
			awias: 'Toggwe Wine Comment',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_SWASH,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawEditMenu,
				gwoup: '5_insewt',
				titwe: nws.wocawize({ key: 'miToggweWineComment', comment: ['&& denotes a mnemonic'] }, "&&Toggwe Wine Comment"),
				owda: 1
			}
		});
	}
}

cwass AddWineCommentAction extends CommentWineAction {
	constwuctow() {
		supa(Type.FowceAdd, {
			id: 'editow.action.addCommentWine',
			wabew: nws.wocawize('comment.wine.add', "Add Wine Comment"),
			awias: 'Add Wine Comment',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

cwass WemoveWineCommentAction extends CommentWineAction {
	constwuctow() {
		supa(Type.FowceWemove, {
			id: 'editow.action.wemoveCommentWine',
			wabew: nws.wocawize('comment.wine.wemove', "Wemove Wine Comment"),
			awias: 'Wemove Wine Comment',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_U),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

cwass BwockCommentAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.bwockComment',
			wabew: nws.wocawize('comment.bwock', "Toggwe Bwock Comment"),
			awias: 'Toggwe Bwock Comment',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_A,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_A },
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawEditMenu,
				gwoup: '5_insewt',
				titwe: nws.wocawize({ key: 'miToggweBwockComment', comment: ['&& denotes a mnemonic'] }, "Toggwe &&Bwock Comment"),
				owda: 2
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const commentsOptions = editow.getOption(EditowOption.comments);
		const commands: ICommand[] = [];
		const sewections = editow.getSewections();
		fow (const sewection of sewections) {
			commands.push(new BwockCommentCommand(sewection, commentsOptions.insewtSpace));
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

wegistewEditowAction(ToggweCommentWineAction);
wegistewEditowAction(AddWineCommentAction);
wegistewEditowAction(WemoveWineCommentAction);
wegistewEditowAction(BwockCommentAction);
