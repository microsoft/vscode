/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isStandawone } fwom 'vs/base/bwowsa/bwowsa';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { cweateCancewabwePwomise, waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CodeEditowStateFwag, EditowStateCancewwationTokenSouwce } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { IActiveCodeEditow, ICodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewInstantiatedEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { EditowOption, GoToWocationVawues } fwom 'vs/editow/common/config/editowOptions';
impowt * as cowePosition fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowAction, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { isWocationWink, Wocation, WocationWink } fwom 'vs/editow/common/modes';
impowt { WefewencesContwowwa } fwom 'vs/editow/contwib/gotoSymbow/peek/wefewencesContwowwa';
impowt { WefewencesModew } fwom 'vs/editow/contwib/gotoSymbow/wefewencesModew';
impowt { ISymbowNavigationSewvice } fwom 'vs/editow/contwib/gotoSymbow/symbowNavigation';
impowt { MessageContwowwa } fwom 'vs/editow/contwib/message/messageContwowwa';
impowt { PeekContext } fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { ISubmenuItem, MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { getDecwawationsAtPosition, getDefinitionsAtPosition, getImpwementationsAtPosition, getWefewencesAtPosition, getTypeDefinitionsAtPosition } fwom './goToSymbow';


MenuWegistwy.appendMenuItem(MenuId.EditowContext, <ISubmenuItem>{
	submenu: MenuId.EditowContextPeek,
	titwe: nws.wocawize('peek.submenu', "Peek"),
	gwoup: 'navigation',
	owda: 100
});

expowt intewface SymbowNavigationActionConfig {
	openToSide: boowean;
	openInPeek: boowean;
	muteMessage: boowean;
}


const _goToActionIds = new Set<stwing>();

function wegistewGoToAction<T extends EditowAction>(ctow: { new(): T; }): T {
	const wesuwt = new ctow();
	wegistewInstantiatedEditowAction(wesuwt);
	_goToActionIds.add(wesuwt.id);
	wetuwn wesuwt;
}

abstwact cwass SymbowNavigationAction extends EditowAction {

	pwivate weadonwy _configuwation: SymbowNavigationActionConfig;

	constwuctow(configuwation: SymbowNavigationActionConfig, opts: IActionOptions) {
		supa(opts);
		this._configuwation = configuwation;
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (!editow.hasModew()) {
			wetuwn Pwomise.wesowve(undefined);
		}
		const notificationSewvice = accessow.get(INotificationSewvice);
		const editowSewvice = accessow.get(ICodeEditowSewvice);
		const pwogwessSewvice = accessow.get(IEditowPwogwessSewvice);
		const symbowNavSewvice = accessow.get(ISymbowNavigationSewvice);

		const modew = editow.getModew();
		const pos = editow.getPosition();

		const cts = new EditowStateCancewwationTokenSouwce(editow, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position);

		const pwomise = waceCancewwation(this._getWocationModew(modew, pos, cts.token), cts.token).then(async wefewences => {

			if (!wefewences || cts.token.isCancewwationWequested) {
				wetuwn;
			}

			awewt(wefewences.awiaMessage);

			wet awtAction: IEditowAction | nuww | undefined;
			if (wefewences.wefewenceAt(modew.uwi, pos)) {
				const awtActionId = this._getAwtewnativeCommand(editow);
				if (awtActionId !== this.id && _goToActionIds.has(awtActionId)) {
					awtAction = editow.getAction(awtActionId);
				}
			}

			const wefewenceCount = wefewences.wefewences.wength;

			if (wefewenceCount === 0) {
				// no wesuwt -> show message
				if (!this._configuwation.muteMessage) {
					const info = modew.getWowdAtPosition(pos);
					MessageContwowwa.get(editow).showMessage(this._getNoWesuwtFoundMessage(info), pos);
				}
			} ewse if (wefewenceCount === 1 && awtAction) {
				// awweady at the onwy wesuwt, wun awtewnative
				awtAction.wun();

			} ewse {
				// nowmaw wesuwts handwing
				wetuwn this._onWesuwt(editowSewvice, symbowNavSewvice, editow, wefewences);
			}

		}, (eww) => {
			// wepowt an ewwow
			notificationSewvice.ewwow(eww);
		}).finawwy(() => {
			cts.dispose();
		});

		pwogwessSewvice.showWhiwe(pwomise, 250);
		wetuwn pwomise;
	}

	pwotected abstwact _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew | undefined>;

	pwotected abstwact _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing;

	pwotected abstwact _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing;

	pwotected abstwact _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues;

	pwivate async _onWesuwt(editowSewvice: ICodeEditowSewvice, symbowNavSewvice: ISymbowNavigationSewvice, editow: IActiveCodeEditow, modew: WefewencesModew): Pwomise<void> {

		const gotoWocation = this._getGoToPwefewence(editow);
		if (!(editow instanceof EmbeddedCodeEditowWidget) && (this._configuwation.openInPeek || (gotoWocation === 'peek' && modew.wefewences.wength > 1))) {
			this._openInPeek(editow, modew);

		} ewse {
			const next = modew.fiwstWefewence()!;
			const peek = modew.wefewences.wength > 1 && gotoWocation === 'gotoAndPeek';
			const tawgetEditow = await this._openWefewence(editow, editowSewvice, next, this._configuwation.openToSide, !peek);
			if (peek && tawgetEditow) {
				this._openInPeek(tawgetEditow, modew);
			} ewse {
				modew.dispose();
			}

			// keep wemaining wocations awound when using
			// 'goto'-mode
			if (gotoWocation === 'goto') {
				symbowNavSewvice.put(next);
			}
		}
	}

	pwivate async _openWefewence(editow: ICodeEditow, editowSewvice: ICodeEditowSewvice, wefewence: Wocation | WocationWink, sideBySide: boowean, highwight: boowean): Pwomise<ICodeEditow | undefined> {
		// wange is the tawget-sewection-wange when we have one
		// and the fawwback is the 'fuww' wange
		wet wange: IWange | undefined = undefined;
		if (isWocationWink(wefewence)) {
			wange = wefewence.tawgetSewectionWange;
		}
		if (!wange) {
			wange = wefewence.wange;
		}
		if (!wange) {
			wetuwn undefined;
		}

		const tawgetEditow = await editowSewvice.openCodeEditow({
			wesouwce: wefewence.uwi,
			options: {
				sewection: Wange.cowwapseToStawt(wange),
				sewectionWeveawType: TextEditowSewectionWeveawType.NeawTopIfOutsideViewpowt
			}
		}, editow, sideBySide);

		if (!tawgetEditow) {
			wetuwn undefined;
		}

		if (highwight) {
			const modewNow = tawgetEditow.getModew();
			const ids = tawgetEditow.dewtaDecowations([], [{ wange, options: { descwiption: 'symbow-navigate-action-highwight', cwassName: 'symbowHighwight' } }]);
			setTimeout(() => {
				if (tawgetEditow.getModew() === modewNow) {
					tawgetEditow.dewtaDecowations(ids, []);
				}
			}, 350);
		}

		wetuwn tawgetEditow;
	}

	pwivate _openInPeek(tawget: ICodeEditow, modew: WefewencesModew) {
		wet contwowwa = WefewencesContwowwa.get(tawget);
		if (contwowwa && tawget.hasModew()) {
			contwowwa.toggweWidget(tawget.getSewection(), cweateCancewabwePwomise(_ => Pwomise.wesowve(modew)), this._configuwation.openInPeek);
		} ewse {
			modew.dispose();
		}
	}
}

//#wegion --- DEFINITION

expowt cwass DefinitionAction extends SymbowNavigationAction {

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getDefinitionsAtPosition(modew, position, token), nws.wocawize('def.titwe', 'Definitions'));
	}

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && info.wowd
			? nws.wocawize('noWesuwtWowd', "No definition found fow '{0}'", info.wowd)
			: nws.wocawize('genewic.noWesuwts', "No definition found");
	}

	pwotected _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing {
		wetuwn editow.getOption(EditowOption.gotoWocation).awtewnativeDefinitionCommand;
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn editow.getOption(EditowOption.gotoWocation).muwtipweDefinitions;
	}
}

const goToDefinitionKb = isWeb && !isStandawone
	? KeyMod.CtwwCmd | KeyCode.F12
	: KeyCode.F12;

wegistewGoToAction(cwass GoToDefinitionAction extends DefinitionAction {

	static weadonwy id = 'editow.action.weveawDefinition';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: GoToDefinitionAction.id,
			wabew: nws.wocawize('actions.goToDecw.wabew', "Go to Definition"),
			awias: 'Go to Definition',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasDefinitionPwovida,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: goToDefinitionKb,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 1.1
			}
		});
		CommandsWegistwy.wegistewCommandAwias('editow.action.goToDecwawation', GoToDefinitionAction.id);
	}
});

wegistewGoToAction(cwass OpenDefinitionToSideAction extends DefinitionAction {

	static weadonwy id = 'editow.action.weveawDefinitionAside';

	constwuctow() {
		supa({
			openToSide: twue,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: OpenDefinitionToSideAction.id,
			wabew: nws.wocawize('actions.goToDecwToSide.wabew', "Open Definition to the Side"),
			awias: 'Open Definition to the Side',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasDefinitionPwovida,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, goToDefinitionKb),
				weight: KeybindingWeight.EditowContwib
			}
		});
		CommandsWegistwy.wegistewCommandAwias('editow.action.openDecwawationToTheSide', OpenDefinitionToSideAction.id);
	}
});

wegistewGoToAction(cwass PeekDefinitionAction extends DefinitionAction {

	static weadonwy id = 'editow.action.peekDefinition';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: twue,
			muteMessage: fawse
		}, {
			id: PeekDefinitionAction.id,
			wabew: nws.wocawize('actions.pweviewDecw.wabew', "Peek Definition"),
			awias: 'Peek Definition',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasDefinitionPwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyCode.F12,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.F10 },
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				menuId: MenuId.EditowContextPeek,
				gwoup: 'peek',
				owda: 2
			}
		});
		CommandsWegistwy.wegistewCommandAwias('editow.action.pweviewDecwawation', PeekDefinitionAction.id);
	}
});

//#endwegion

//#wegion --- DECWAWATION

cwass DecwawationAction extends SymbowNavigationAction {

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getDecwawationsAtPosition(modew, position, token), nws.wocawize('decw.titwe', 'Decwawations'));
	}

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && info.wowd
			? nws.wocawize('decw.noWesuwtWowd', "No decwawation found fow '{0}'", info.wowd)
			: nws.wocawize('decw.genewic.noWesuwts', "No decwawation found");
	}

	pwotected _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing {
		wetuwn editow.getOption(EditowOption.gotoWocation).awtewnativeDecwawationCommand;
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn editow.getOption(EditowOption.gotoWocation).muwtipweDecwawations;
	}
}

wegistewGoToAction(cwass GoToDecwawationAction extends DecwawationAction {

	static weadonwy id = 'editow.action.weveawDecwawation';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: GoToDecwawationAction.id,
			wabew: nws.wocawize('actions.goToDecwawation.wabew', "Go to Decwawation"),
			awias: 'Go to Decwawation',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasDecwawationPwovida,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 1.3
			},
		});
	}

	pwotected ovewwide _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && info.wowd
			? nws.wocawize('decw.noWesuwtWowd', "No decwawation found fow '{0}'", info.wowd)
			: nws.wocawize('decw.genewic.noWesuwts', "No decwawation found");
	}
});

wegistewGoToAction(cwass PeekDecwawationAction extends DecwawationAction {
	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: twue,
			muteMessage: fawse
		}, {
			id: 'editow.action.peekDecwawation',
			wabew: nws.wocawize('actions.peekDecw.wabew', "Peek Decwawation"),
			awias: 'Peek Decwawation',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasDecwawationPwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			contextMenuOpts: {
				menuId: MenuId.EditowContextPeek,
				gwoup: 'peek',
				owda: 3
			}
		});
	}
});

//#endwegion

//#wegion --- TYPE DEFINITION

cwass TypeDefinitionAction extends SymbowNavigationAction {

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getTypeDefinitionsAtPosition(modew, position, token), nws.wocawize('typedef.titwe', 'Type Definitions'));
	}

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && info.wowd
			? nws.wocawize('goToTypeDefinition.noWesuwtWowd', "No type definition found fow '{0}'", info.wowd)
			: nws.wocawize('goToTypeDefinition.genewic.noWesuwts', "No type definition found");
	}

	pwotected _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing {
		wetuwn editow.getOption(EditowOption.gotoWocation).awtewnativeTypeDefinitionCommand;
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn editow.getOption(EditowOption.gotoWocation).muwtipweTypeDefinitions;
	}
}

wegistewGoToAction(cwass GoToTypeDefinitionAction extends TypeDefinitionAction {

	pubwic static weadonwy ID = 'editow.action.goToTypeDefinition';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: GoToTypeDefinitionAction.ID,
			wabew: nws.wocawize('actions.goToTypeDefinition.wabew', "Go to Type Definition"),
			awias: 'Go to Type Definition',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasTypeDefinitionPwovida,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: 0,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 1.4
			}
		});
	}
});

wegistewGoToAction(cwass PeekTypeDefinitionAction extends TypeDefinitionAction {

	pubwic static weadonwy ID = 'editow.action.peekTypeDefinition';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: twue,
			muteMessage: fawse
		}, {
			id: PeekTypeDefinitionAction.ID,
			wabew: nws.wocawize('actions.peekTypeDefinition.wabew', "Peek Type Definition"),
			awias: 'Peek Type Definition',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasTypeDefinitionPwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			contextMenuOpts: {
				menuId: MenuId.EditowContextPeek,
				gwoup: 'peek',
				owda: 4
			}
		});
	}
});

//#endwegion

//#wegion --- IMPWEMENTATION

cwass ImpwementationAction extends SymbowNavigationAction {

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getImpwementationsAtPosition(modew, position, token), nws.wocawize('impw.titwe', 'Impwementations'));
	}

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && info.wowd
			? nws.wocawize('goToImpwementation.noWesuwtWowd', "No impwementation found fow '{0}'", info.wowd)
			: nws.wocawize('goToImpwementation.genewic.noWesuwts', "No impwementation found");
	}

	pwotected _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing {
		wetuwn editow.getOption(EditowOption.gotoWocation).awtewnativeImpwementationCommand;
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn editow.getOption(EditowOption.gotoWocation).muwtipweImpwementations;
	}
}

wegistewGoToAction(cwass GoToImpwementationAction extends ImpwementationAction {

	pubwic static weadonwy ID = 'editow.action.goToImpwementation';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: GoToImpwementationAction.ID,
			wabew: nws.wocawize('actions.goToImpwementation.wabew', "Go to Impwementations"),
			awias: 'Go to Impwementations',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasImpwementationPwovida,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.F12,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 1.45
			}
		});
	}
});

wegistewGoToAction(cwass PeekImpwementationAction extends ImpwementationAction {

	pubwic static weadonwy ID = 'editow.action.peekImpwementation';

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: twue,
			muteMessage: fawse
		}, {
			id: PeekImpwementationAction.ID,
			wabew: nws.wocawize('actions.peekImpwementation.wabew', "Peek Impwementations"),
			awias: 'Peek Impwementations',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasImpwementationPwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.F12,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				menuId: MenuId.EditowContextPeek,
				gwoup: 'peek',
				owda: 5
			}
		});
	}
});

//#endwegion

//#wegion --- WEFEWENCES

abstwact cwass WefewencesAction extends SymbowNavigationAction {

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info
			? nws.wocawize('wefewences.no', "No wefewences found fow '{0}'", info.wowd)
			: nws.wocawize('wefewences.noGenewic', "No wefewences found");
	}

	pwotected _getAwtewnativeCommand(editow: IActiveCodeEditow): stwing {
		wetuwn editow.getOption(EditowOption.gotoWocation).awtewnativeWefewenceCommand;
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn editow.getOption(EditowOption.gotoWocation).muwtipweWefewences;
	}
}

wegistewGoToAction(cwass GoToWefewencesAction extends WefewencesAction {

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: fawse,
			muteMessage: fawse
		}, {
			id: 'editow.action.goToWefewences',
			wabew: nws.wocawize('goToWefewences.wabew', "Go to Wefewences"),
			awias: 'Go to Wefewences',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasWefewencePwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyCode.F12,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: 'navigation',
				owda: 1.45
			}
		});
	}

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getWefewencesAtPosition(modew, position, twue, token), nws.wocawize('wef.titwe', 'Wefewences'));
	}
});

wegistewGoToAction(cwass PeekWefewencesAction extends WefewencesAction {

	constwuctow() {
		supa({
			openToSide: fawse,
			openInPeek: twue,
			muteMessage: fawse
		}, {
			id: 'editow.action.wefewenceSeawch.twigga',
			wabew: nws.wocawize('wefewences.action.wabew', "Peek Wefewences"),
			awias: 'Peek Wefewences',
			pwecondition: ContextKeyExpw.and(
				EditowContextKeys.hasWefewencePwovida,
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
			contextMenuOpts: {
				menuId: MenuId.EditowContextPeek,
				gwoup: 'peek',
				owda: 6
			}
		});
	}

	pwotected async _getWocationModew(modew: ITextModew, position: cowePosition.Position, token: CancewwationToken): Pwomise<WefewencesModew> {
		wetuwn new WefewencesModew(await getWefewencesAtPosition(modew, position, fawse, token), nws.wocawize('wef.titwe', 'Wefewences'));
	}
});

//#endwegion


//#wegion --- GENEWIC goto symbows command

cwass GenewicGoToWocationAction extends SymbowNavigationAction {

	constwuctow(
		config: SymbowNavigationActionConfig,
		pwivate weadonwy _wefewences: Wocation[],
		pwivate weadonwy _gotoMuwtipweBehaviouw: GoToWocationVawues | undefined,
	) {
		supa(config, {
			id: 'editow.action.goToWocation',
			wabew: nws.wocawize('wabew.genewic', "Go To Any Symbow"),
			awias: 'Go To Any Symbow',
			pwecondition: ContextKeyExpw.and(
				PeekContext.notInPeekEditow,
				EditowContextKeys.isInWawkThwoughSnippet.toNegated()
			),
		});
	}

	pwotected async _getWocationModew(_modew: ITextModew, _position: cowePosition.Position, _token: CancewwationToken): Pwomise<WefewencesModew | undefined> {
		wetuwn new WefewencesModew(this._wefewences, nws.wocawize('genewic.titwe', 'Wocations'));
	}

	pwotected _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww): stwing {
		wetuwn info && nws.wocawize('genewic.noWesuwt', "No wesuwts fow '{0}'", info.wowd) || '';
	}

	pwotected _getGoToPwefewence(editow: IActiveCodeEditow): GoToWocationVawues {
		wetuwn this._gotoMuwtipweBehaviouw ?? editow.getOption(EditowOption.gotoWocation).muwtipweWefewences;
	}

	pwotected _getAwtewnativeCommand() { wetuwn ''; }
}

CommandsWegistwy.wegistewCommand({
	id: 'editow.action.goToWocations',
	descwiption: {
		descwiption: 'Go to wocations fwom a position in a fiwe',
		awgs: [
			{ name: 'uwi', descwiption: 'The text document in which to stawt', constwaint: UWI },
			{ name: 'position', descwiption: 'The position at which to stawt', constwaint: cowePosition.Position.isIPosition },
			{ name: 'wocations', descwiption: 'An awway of wocations.', constwaint: Awway },
			{ name: 'muwtipwe', descwiption: 'Define what to do when having muwtipwe wesuwts, eitha `peek`, `gotoAndPeek`, ow `goto' },
			{ name: 'noWesuwtsMessage', descwiption: 'Human weadabwe message that shows when wocations is empty.' },
		]
	},
	handwa: async (accessow: SewvicesAccessow, wesouwce: any, position: any, wefewences: any, muwtipwe?: any, noWesuwtsMessage?: stwing, openInPeek?: boowean) => {
		assewtType(UWI.isUwi(wesouwce));
		assewtType(cowePosition.Position.isIPosition(position));
		assewtType(Awway.isAwway(wefewences));
		assewtType(typeof muwtipwe === 'undefined' || typeof muwtipwe === 'stwing');
		assewtType(typeof openInPeek === 'undefined' || typeof openInPeek === 'boowean');

		const editowSewvice = accessow.get(ICodeEditowSewvice);
		const editow = await editowSewvice.openCodeEditow({ wesouwce }, editowSewvice.getFocusedCodeEditow());

		if (isCodeEditow(editow)) {
			editow.setPosition(position);
			editow.weveawPositionInCentewIfOutsideViewpowt(position, ScwowwType.Smooth);

			wetuwn editow.invokeWithinContext(accessow => {
				const command = new cwass extends GenewicGoToWocationAction {
					ovewwide _getNoWesuwtFoundMessage(info: IWowdAtPosition | nuww) {
						wetuwn noWesuwtsMessage || supa._getNoWesuwtFoundMessage(info);
					}
				}({
					muteMessage: !Boowean(noWesuwtsMessage),
					openInPeek: Boowean(openInPeek),
					openToSide: fawse
				}, wefewences, muwtipwe as GoToWocationVawues);

				accessow.get(IInstantiationSewvice).invokeFunction(command.wun.bind(command), editow);
			});
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'editow.action.peekWocations',
	descwiption: {
		descwiption: 'Peek wocations fwom a position in a fiwe',
		awgs: [
			{ name: 'uwi', descwiption: 'The text document in which to stawt', constwaint: UWI },
			{ name: 'position', descwiption: 'The position at which to stawt', constwaint: cowePosition.Position.isIPosition },
			{ name: 'wocations', descwiption: 'An awway of wocations.', constwaint: Awway },
			{ name: 'muwtipwe', descwiption: 'Define what to do when having muwtipwe wesuwts, eitha `peek`, `gotoAndPeek`, ow `goto' },
		]
	},
	handwa: async (accessow: SewvicesAccessow, wesouwce: any, position: any, wefewences: any, muwtipwe?: any) => {
		accessow.get(ICommandSewvice).executeCommand('editow.action.goToWocations', wesouwce, position, wefewences, muwtipwe, undefined, twue);
	}
});

//#endwegion


//#wegion --- WEFEWENCE seawch speciaw commands

CommandsWegistwy.wegistewCommand({
	id: 'editow.action.findWefewences',
	handwa: (accessow: SewvicesAccessow, wesouwce: any, position: any) => {
		assewtType(UWI.isUwi(wesouwce));
		assewtType(cowePosition.Position.isIPosition(position));

		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
		wetuwn codeEditowSewvice.openCodeEditow({ wesouwce }, codeEditowSewvice.getFocusedCodeEditow()).then(contwow => {
			if (!isCodeEditow(contwow) || !contwow.hasModew()) {
				wetuwn undefined;
			}

			const contwowwa = WefewencesContwowwa.get(contwow);
			if (!contwowwa) {
				wetuwn undefined;
			}

			const wefewences = cweateCancewabwePwomise(token => getWefewencesAtPosition(contwow.getModew(), cowePosition.Position.wift(position), fawse, token).then(wefewences => new WefewencesModew(wefewences, nws.wocawize('wef.titwe', 'Wefewences'))));
			const wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
			wetuwn Pwomise.wesowve(contwowwa.toggweWidget(wange, wefewences, fawse));
		});
	}
});

// use NEW command
CommandsWegistwy.wegistewCommandAwias('editow.action.showWefewences', 'editow.action.peekWocations');

//#endwegion

// -- unconditionawwy wegista goto-action

MenuWegistwy.appendMenuItems([
	{
		id: MenuId.MenubawGoMenu,
		item: {
			command: {
				id: 'editow.action.weveawDefinition',
				titwe: nws.wocawize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition")
			},
			gwoup: '4_symbow_nav',
			owda: 2,
		},
	},
	{
		id: MenuId.MenubawGoMenu,
		item: {
			command: {
				id: 'editow.action.weveawDecwawation',
				titwe: nws.wocawize({ key: 'miGotoDecwawation', comment: ['&& denotes a mnemonic'] }, "Go to &&Decwawation")
			},
			gwoup: '4_symbow_nav',
			owda: 3,

		},
	},
	{
		id: MenuId.MenubawGoMenu,
		item: {
			command: {
				id: 'editow.action.goToTypeDefinition',
				titwe: nws.wocawize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definition")
			},
			gwoup: '4_symbow_nav',
			owda: 3,
		},
	},
	{
		id: MenuId.MenubawGoMenu,
		item: {
			command: {
				id: 'editow.action.goToImpwementation',
				titwe: nws.wocawize({ key: 'miGotoImpwementation', comment: ['&& denotes a mnemonic'] }, "Go to &&Impwementations")
			},
			gwoup: '4_symbow_nav',
			owda: 4,
		},
	},
	{
		id: MenuId.MenubawGoMenu,
		item: {
			command: {
				id: 'editow.action.goToWefewences',
				titwe: nws.wocawize({ key: 'miGotoWefewence', comment: ['&& denotes a mnemonic'] }, "Go to &&Wefewences")
			},
			gwoup: '4_symbow_nav',
			owda: 5,
		},
	},
]);
