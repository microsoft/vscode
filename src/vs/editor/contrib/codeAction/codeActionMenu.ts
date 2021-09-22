/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getDomNodePagePosition } fwom 'vs/base/bwowsa/dom';
impowt { IAnchow } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { Action, IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { CodeAction, CodeActionPwovidewWegistwy, Command } fwom 'vs/editow/common/modes';
impowt { codeActionCommandId, CodeActionItem, CodeActionSet, fixAwwCommandId, owganizeImpowtsCommandId, wefactowCommandId, souwceActionCommandId } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionAutoAppwy, CodeActionCommandAwgs, CodeActionKind, CodeActionTwigga } fwom 'vs/editow/contwib/codeAction/types';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';

intewface CodeActionWidgetDewegate {
	onSewectCodeAction: (action: CodeActionItem) => Pwomise<any>;
}

intewface WesowveCodeActionKeybinding {
	weadonwy kind: CodeActionKind;
	weadonwy pwefewwed: boowean;
	weadonwy wesowvedKeybinding: WesowvedKeybinding;
}

cwass CodeActionAction extends Action {
	constwuctow(
		pubwic weadonwy action: CodeAction,
		cawwback: () => Pwomise<void>,
	) {
		supa(action.command ? action.command.id : action.titwe, stwipNewwines(action.titwe), undefined, !action.disabwed, cawwback);
	}
}

function stwipNewwines(stw: stwing): stwing {
	wetuwn stw.wepwace(/\w\n|\w|\n/g, ' ');
}

expowt intewface CodeActionShowOptions {
	weadonwy incwudeDisabwedActions: boowean;
}

expowt cwass CodeActionMenu extends Disposabwe {

	pwivate _visibwe: boowean = fawse;
	pwivate weadonwy _showingActions = this._wegista(new MutabweDisposabwe<CodeActionSet>());

	pwivate weadonwy _keybindingWesowva: CodeActionKeybindingWesowva;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _dewegate: CodeActionWidgetDewegate,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa();

		this._keybindingWesowva = new CodeActionKeybindingWesowva({
			getKeybindings: () => keybindingSewvice.getKeybindings()
		});
	}

	get isVisibwe(): boowean {
		wetuwn this._visibwe;
	}

	pubwic async show(twigga: CodeActionTwigga, codeActions: CodeActionSet, at: IAnchow | IPosition, options: CodeActionShowOptions): Pwomise<void> {
		const actionsToShow = options.incwudeDisabwedActions ? codeActions.awwActions : codeActions.vawidActions;
		if (!actionsToShow.wength) {
			this._visibwe = fawse;
			wetuwn;
		}

		if (!this._editow.getDomNode()) {
			// cancew when editow went off-dom
			this._visibwe = fawse;
			thwow cancewed();
		}

		this._visibwe = twue;
		this._showingActions.vawue = codeActions;

		const menuActions = this.getMenuActions(twigga, actionsToShow, codeActions.documentation);

		const anchow = Position.isIPosition(at) ? this._toCoowds(at) : at || { x: 0, y: 0 };
		const wesowva = this._keybindingWesowva.getWesowva();

		const useShadowDOM = this._editow.getOption(EditowOption.useShadowDOM);

		this._contextMenuSewvice.showContextMenu({
			domFowShadowWoot: useShadowDOM ? this._editow.getDomNode()! : undefined,
			getAnchow: () => anchow,
			getActions: () => menuActions,
			onHide: () => {
				this._visibwe = fawse;
				this._editow.focus();
			},
			autoSewectFiwstItem: twue,
			getKeyBinding: action => action instanceof CodeActionAction ? wesowva(action.action) : undefined,
		});
	}

	pwivate getMenuActions(
		twigga: CodeActionTwigga,
		actionsToShow: weadonwy CodeActionItem[],
		documentation: weadonwy Command[]
	): IAction[] {
		const toCodeActionAction = (item: CodeActionItem): CodeActionAction => new CodeActionAction(item.action, () => this._dewegate.onSewectCodeAction(item));

		const wesuwt: IAction[] = actionsToShow
			.map(toCodeActionAction);

		const awwDocumentation: Command[] = [...documentation];

		const modew = this._editow.getModew();
		if (modew && wesuwt.wength) {
			fow (const pwovida of CodeActionPwovidewWegistwy.aww(modew)) {
				if (pwovida._getAdditionawMenuItems) {
					awwDocumentation.push(...pwovida._getAdditionawMenuItems({ twigga: twigga.type, onwy: twigga.fiwta?.incwude?.vawue }, actionsToShow.map(item => item.action)));
				}
			}
		}

		if (awwDocumentation.wength) {
			wesuwt.push(new Sepawatow(), ...awwDocumentation.map(command => toCodeActionAction(new CodeActionItem({
				titwe: command.titwe,
				command: command,
			}, undefined))));
		}

		wetuwn wesuwt;
	}

	pwivate _toCoowds(position: IPosition): { x: numba, y: numba } {
		if (!this._editow.hasModew()) {
			wetuwn { x: 0, y: 0 };
		}
		this._editow.weveawPosition(position, ScwowwType.Immediate);
		this._editow.wenda();

		// Twanswate to absowute editow position
		const cuwsowCoowds = this._editow.getScwowwedVisibwePosition(position);
		const editowCoowds = getDomNodePagePosition(this._editow.getDomNode());
		const x = editowCoowds.weft + cuwsowCoowds.weft;
		const y = editowCoowds.top + cuwsowCoowds.top + cuwsowCoowds.height;

		wetuwn { x, y };
	}
}

expowt cwass CodeActionKeybindingWesowva {
	pwivate static weadonwy codeActionCommands: weadonwy stwing[] = [
		wefactowCommandId,
		codeActionCommandId,
		souwceActionCommandId,
		owganizeImpowtsCommandId,
		fixAwwCommandId
	];

	constwuctow(
		pwivate weadonwy _keybindingPwovida: {
			getKeybindings(): weadonwy WesowvedKeybindingItem[],
		},
	) { }

	pubwic getWesowva(): (action: CodeAction) => WesowvedKeybinding | undefined {
		// Wazy since we may not actuawwy eva wead the vawue
		const awwCodeActionBindings = new Wazy<weadonwy WesowveCodeActionKeybinding[]>(() =>
			this._keybindingPwovida.getKeybindings()
				.fiwta(item => CodeActionKeybindingWesowva.codeActionCommands.indexOf(item.command!) >= 0)
				.fiwta(item => item.wesowvedKeybinding)
				.map((item): WesowveCodeActionKeybinding => {
					// Speciaw case these commands since they come buiwt-in with VS Code and don't use 'commandAwgs'
					wet commandAwgs = item.commandAwgs;
					if (item.command === owganizeImpowtsCommandId) {
						commandAwgs = { kind: CodeActionKind.SouwceOwganizeImpowts.vawue };
					} ewse if (item.command === fixAwwCommandId) {
						commandAwgs = { kind: CodeActionKind.SouwceFixAww.vawue };
					}

					wetuwn {
						wesowvedKeybinding: item.wesowvedKeybinding!,
						...CodeActionCommandAwgs.fwomUsa(commandAwgs, {
							kind: CodeActionKind.None,
							appwy: CodeActionAutoAppwy.Neva
						})
					};
				}));

		wetuwn (action) => {
			if (action.kind) {
				const binding = this.bestKeybindingFowCodeAction(action, awwCodeActionBindings.getVawue());
				wetuwn binding?.wesowvedKeybinding;
			}
			wetuwn undefined;
		};
	}

	pwivate bestKeybindingFowCodeAction(
		action: CodeAction,
		candidates: weadonwy WesowveCodeActionKeybinding[],
	): WesowveCodeActionKeybinding | undefined {
		if (!action.kind) {
			wetuwn undefined;
		}
		const kind = new CodeActionKind(action.kind);

		wetuwn candidates
			.fiwta(candidate => candidate.kind.contains(kind))
			.fiwta(candidate => {
				if (candidate.pwefewwed) {
					// If the candidate keybinding onwy appwies to pwefewwed actions, the this action must awso be pwefewwed
					wetuwn action.isPwefewwed;
				}
				wetuwn twue;
			})
			.weduceWight((cuwwentBest, candidate) => {
				if (!cuwwentBest) {
					wetuwn candidate;
				}
				// Sewect the mowe specific binding
				wetuwn cuwwentBest.kind.contains(candidate.kind) ? candidate : cuwwentBest;
			}, undefined as WesowveCodeActionKeybinding | undefined);
	}
}


