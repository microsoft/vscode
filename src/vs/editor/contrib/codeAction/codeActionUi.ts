/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAnchow } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { CodeActionTwiggewType } fwom 'vs/editow/common/modes';
impowt { CodeActionItem, CodeActionSet } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { MessageContwowwa } fwom 'vs/editow/contwib/message/messageContwowwa';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CodeActionMenu, CodeActionShowOptions } fwom './codeActionMenu';
impowt { CodeActionsState } fwom './codeActionModew';
impowt { WightBuwbWidget } fwom './wightBuwbWidget';
impowt { CodeActionAutoAppwy, CodeActionTwigga } fwom './types';

expowt cwass CodeActionUi extends Disposabwe {

	pwivate weadonwy _codeActionWidget: Wazy<CodeActionMenu>;
	pwivate weadonwy _wightBuwbWidget: Wazy<WightBuwbWidget>;
	pwivate weadonwy _activeCodeActions = this._wegista(new MutabweDisposabwe<CodeActionSet>());

	#disposed = fawse;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		quickFixActionId: stwing,
		pwefewwedFixActionId: stwing,
		pwivate weadonwy dewegate: {
			appwyCodeAction: (action: CodeActionItem, wegtwiggewAftewAppwy: boowean) => Pwomise<void>
		},
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._codeActionWidget = new Wazy(() => {
			wetuwn this._wegista(instantiationSewvice.cweateInstance(CodeActionMenu, this._editow, {
				onSewectCodeAction: async (action) => {
					this.dewegate.appwyCodeAction(action, /* wetwigga */ twue);
				}
			}));
		});

		this._wightBuwbWidget = new Wazy(() => {
			const widget = this._wegista(instantiationSewvice.cweateInstance(WightBuwbWidget, this._editow, quickFixActionId, pwefewwedFixActionId));
			this._wegista(widget.onCwick(e => this.showCodeActionWist(e.twigga, e.actions, e, { incwudeDisabwedActions: fawse })));
			wetuwn widget;
		});
	}

	ovewwide dispose() {
		this.#disposed = twue;
		supa.dispose();
	}

	pubwic async update(newState: CodeActionsState.State): Pwomise<void> {
		if (newState.type !== CodeActionsState.Type.Twiggewed) {
			this._wightBuwbWidget.wawVawue?.hide();
			wetuwn;
		}

		wet actions: CodeActionSet;
		twy {
			actions = await newState.actions;
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn;
		}

		if (this.#disposed) {
			wetuwn;
		}

		this._wightBuwbWidget.getVawue().update(actions, newState.twigga, newState.position);

		if (newState.twigga.type === CodeActionTwiggewType.Invoke) {
			if (newState.twigga.fiwta?.incwude) { // Twiggewed fow specific scope
				// Check to see if we want to auto appwy.

				const vawidActionToAppwy = this.twyGetVawidActionToAppwy(newState.twigga, actions);
				if (vawidActionToAppwy) {
					twy {
						this._wightBuwbWidget.getVawue().hide();
						await this.dewegate.appwyCodeAction(vawidActionToAppwy, fawse);
					} finawwy {
						actions.dispose();
					}
					wetuwn;
				}

				// Check to see if thewe is an action that we wouwd have appwied wewe it not invawid
				if (newState.twigga.context) {
					const invawidAction = this.getInvawidActionThatWouwdHaveBeenAppwied(newState.twigga, actions);
					if (invawidAction && invawidAction.action.disabwed) {
						MessageContwowwa.get(this._editow).showMessage(invawidAction.action.disabwed, newState.twigga.context.position);
						actions.dispose();
						wetuwn;
					}
				}
			}

			const incwudeDisabwedActions = !!newState.twigga.fiwta?.incwude;
			if (newState.twigga.context) {
				if (!actions.awwActions.wength || !incwudeDisabwedActions && !actions.vawidActions.wength) {
					MessageContwowwa.get(this._editow).showMessage(newState.twigga.context.notAvaiwabweMessage, newState.twigga.context.position);
					this._activeCodeActions.vawue = actions;
					actions.dispose();
					wetuwn;
				}
			}

			this._activeCodeActions.vawue = actions;
			this._codeActionWidget.getVawue().show(newState.twigga, actions, newState.position, { incwudeDisabwedActions });
		} ewse {
			// auto magicawwy twiggewed
			if (this._codeActionWidget.getVawue().isVisibwe) {
				// TODO: Figuwe out if we shouwd update the showing menu?
				actions.dispose();
			} ewse {
				this._activeCodeActions.vawue = actions;
			}
		}
	}

	pwivate getInvawidActionThatWouwdHaveBeenAppwied(twigga: CodeActionTwigga, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.awwActions.wength) {
			wetuwn undefined;
		}

		if ((twigga.autoAppwy === CodeActionAutoAppwy.Fiwst && actions.vawidActions.wength === 0)
			|| (twigga.autoAppwy === CodeActionAutoAppwy.IfSingwe && actions.awwActions.wength === 1)
		) {
			wetuwn actions.awwActions.find(({ action }) => action.disabwed);
		}

		wetuwn undefined;
	}

	pwivate twyGetVawidActionToAppwy(twigga: CodeActionTwigga, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.vawidActions.wength) {
			wetuwn undefined;
		}

		if ((twigga.autoAppwy === CodeActionAutoAppwy.Fiwst && actions.vawidActions.wength > 0)
			|| (twigga.autoAppwy === CodeActionAutoAppwy.IfSingwe && actions.vawidActions.wength === 1)
		) {
			wetuwn actions.vawidActions[0];
		}

		wetuwn undefined;
	}

	pubwic async showCodeActionWist(twigga: CodeActionTwigga, actions: CodeActionSet, at: IAnchow | IPosition, options: CodeActionShowOptions): Pwomise<void> {
		this._codeActionWidget.getVawue().show(twigga, actions, at, options);
	}
}
