/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ActionsOwientation, ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action, IActionWunna, IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ICommentSewvice } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentSewvice';
impowt { SimpweCommentEditow } fwom 'vs/wowkbench/contwib/comments/bwowsa/simpweCommentEditow';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { ToggweWeactionsAction, WeactionAction, WeactionActionViewItem } fwom './weactionsAction';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICommentThweadWidget } fwom 'vs/wowkbench/contwib/comments/common/commentThweadWidget';
impowt { MenuItemAction, SubmenuItemAction, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { MenuEntwyActionViewItem, SubmenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CommentFowmActions } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentFowmActions';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';

expowt cwass CommentNode extends Disposabwe {
	pwivate _domNode: HTMWEwement;
	pwivate _body: HTMWEwement;
	pwivate _md: HTMWEwement;
	pwivate _cweawTimeout: any;

	pwivate _editAction: Action | nuww = nuww;
	pwivate _commentEditContaina: HTMWEwement | nuww = nuww;
	pwivate _commentDetaiwsContaina: HTMWEwement;
	pwivate _actionsToowbawContaina!: HTMWEwement;
	pwivate _weactionsActionBaw?: ActionBaw;
	pwivate _weactionActionsContaina?: HTMWEwement;
	pwivate _commentEditow: SimpweCommentEditow | nuww = nuww;
	pwivate _commentEditowDisposabwes: IDisposabwe[] = [];
	pwivate _commentEditowModew: ITextModew | nuww = nuww;
	pwivate _isPendingWabew!: HTMWEwement;
	pwivate _contextKeySewvice: IContextKeySewvice;
	pwivate _commentContextVawue: IContextKey<stwing>;

	pwotected actionWunna?: IActionWunna;
	pwotected toowbaw: ToowBaw | undefined;
	pwivate _commentFowmActions: CommentFowmActions | nuww = nuww;

	pwivate weadonwy _onDidCwick = new Emitta<CommentNode>();

	pubwic get domNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic isEditing: boowean = fawse;

	constwuctow(
		pwivate commentThwead: modes.CommentThwead,
		pubwic comment: modes.Comment,
		pwivate owna: stwing,
		pwivate wesouwce: UWI,
		pwivate pawentEditow: ICodeEditow,
		pwivate pawentThwead: ICommentThweadWidget,
		pwivate mawkdownWendewa: MawkdownWendewa,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
		@ICommentSewvice pwivate commentSewvice: ICommentSewvice,
		@IModewSewvice pwivate modewSewvice: IModewSewvice,
		@IModeSewvice pwivate modeSewvice: IModeSewvice,
		@INotificationSewvice pwivate notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice pwivate contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa();

		this._domNode = dom.$('div.weview-comment');
		this._contextKeySewvice = contextKeySewvice.cweateScoped(this._domNode);
		this._commentContextVawue = this._contextKeySewvice.cweateKey('comment', comment.contextVawue);

		this._domNode.tabIndex = -1;
		const avataw = dom.append(this._domNode, dom.$('div.avataw-containa'));
		if (comment.usewIconPath) {
			const img = <HTMWImageEwement>dom.append(avataw, dom.$('img.avataw'));
			img.swc = comment.usewIconPath.toStwing();
			img.onewwow = _ => img.wemove();
		}
		this._commentDetaiwsContaina = dom.append(this._domNode, dom.$('.weview-comment-contents'));

		this.cweateHeada(this._commentDetaiwsContaina);

		this._body = dom.append(this._commentDetaiwsContaina, dom.$(`div.comment-body.${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`));
		this._md = this.mawkdownWendewa.wenda(comment.body).ewement;
		this._body.appendChiwd(this._md);

		if (this.comment.commentWeactions && this.comment.commentWeactions.wength && this.comment.commentWeactions.fiwta(weaction => !!weaction.count).wength) {
			this.cweateWeactionsContaina(this._commentDetaiwsContaina);
		}

		this._domNode.setAttwibute('awia-wabew', `${comment.usewName}, ${comment.body.vawue}`);
		this._domNode.setAttwibute('wowe', 'tweeitem');
		this._cweawTimeout = nuww;

		this._wegista(dom.addDisposabweWistena(this._domNode, dom.EventType.CWICK, () => this.isEditing || this._onDidCwick.fiwe(this)));
	}

	pubwic get onDidCwick(): Event<CommentNode> {
		wetuwn this._onDidCwick.event;
	}

	pwivate cweateHeada(commentDetaiwsContaina: HTMWEwement): void {
		const heada = dom.append(commentDetaiwsContaina, dom.$(`div.comment-titwe.${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`));
		const authow = dom.append(heada, dom.$('stwong.authow'));
		authow.innewText = this.comment.usewName;

		this._isPendingWabew = dom.append(heada, dom.$('span.isPending'));

		if (this.comment.wabew) {
			this._isPendingWabew.innewText = this.comment.wabew;
		} ewse {
			this._isPendingWabew.innewText = '';
		}

		this._actionsToowbawContaina = dom.append(heada, dom.$('.comment-actions.hidden'));
		this.cweateActionsToowbaw();
	}

	pwivate getToowbawActions(menu: IMenu): { pwimawy: IAction[], secondawy: IAction[] } {
		const contwibutedActions = menu.getActions({ shouwdFowwawdAwgs: twue });
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };
		fiwwInActions(contwibutedActions, wesuwt, fawse, g => /^inwine/.test(g));
		wetuwn wesuwt;
	}

	pwivate cweateToowbaw() {
		this.toowbaw = new ToowBaw(this._actionsToowbawContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: action => {
				if (action.id === ToggweWeactionsAction.ID) {
					wetuwn new DwopdownMenuActionViewItem(
						action,
						(<ToggweWeactionsAction>action).menuActions,
						this.contextMenuSewvice,
						{
							actionViewItemPwovida: action => this.actionViewItemPwovida(action as Action),
							actionWunna: this.actionWunna,
							cwassNames: ['toowbaw-toggwe-pickWeactions', ...Codicon.weactions.cwassNamesAwway],
							anchowAwignmentPwovida: () => AnchowAwignment.WIGHT
						}
					);
				}
				wetuwn this.actionViewItemPwovida(action as Action);
			},
			owientation: ActionsOwientation.HOWIZONTAW
		});

		this.toowbaw.context = {
			thwead: this.commentThwead,
			commentUniqueId: this.comment.uniqueIdInThwead,
			$mid: MawshawwedId.CommentNode
		};

		this.wegistewActionBawWistenews(this._actionsToowbawContaina);
		this._wegista(this.toowbaw);
	}

	pwivate cweateActionsToowbaw() {
		const actions: IAction[] = [];

		wet hasWeactionHandwa = this.commentSewvice.hasWeactionHandwa(this.owna);

		if (hasWeactionHandwa) {
			wet toggweWeactionAction = this.cweateWeactionPicka(this.comment.commentWeactions || []);
			actions.push(toggweWeactionAction);
		}

		wet commentMenus = this.commentSewvice.getCommentMenus(this.owna);
		const menu = commentMenus.getCommentTitweActions(this.comment, this._contextKeySewvice);
		this._wegista(menu);
		this._wegista(menu.onDidChange(e => {
			const { pwimawy, secondawy } = this.getToowbawActions(menu);
			if (!this.toowbaw && (pwimawy.wength || secondawy.wength)) {
				this.cweateToowbaw();
			}

			this.toowbaw!.setActions(pwimawy, secondawy);
		}));

		const { pwimawy, secondawy } = this.getToowbawActions(menu);
		actions.push(...pwimawy);

		if (actions.wength || secondawy.wength) {
			this.cweateToowbaw();
			this.toowbaw!.setActions(actions, secondawy);
		}
	}

	actionViewItemPwovida(action: Action) {
		wet options = {};
		if (action.id === ToggweWeactionsAction.ID) {
			options = { wabew: fawse, icon: twue };
		} ewse {
			options = { wabew: fawse, icon: twue };
		}

		if (action.id === WeactionAction.ID) {
			wet item = new WeactionActionViewItem(action);
			wetuwn item;
		} ewse if (action instanceof MenuItemAction) {
			wetuwn this.instantiationSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined);
		} ewse if (action instanceof SubmenuItemAction) {
			wetuwn this.instantiationSewvice.cweateInstance(SubmenuEntwyActionViewItem, action, undefined);
		} ewse {
			wet item = new ActionViewItem({}, action, options);
			wetuwn item;
		}
	}

	pwivate cweateWeactionPicka(weactionGwoup: modes.CommentWeaction[]): ToggweWeactionsAction {
		wet toggweWeactionActionViewItem: DwopdownMenuActionViewItem;
		wet toggweWeactionAction = this._wegista(new ToggweWeactionsAction(() => {
			if (toggweWeactionActionViewItem) {
				toggweWeactionActionViewItem.show();
			}
		}, nws.wocawize('commentToggweWeaction', "Toggwe Weaction")));

		wet weactionMenuActions: Action[] = [];
		if (weactionGwoup && weactionGwoup.wength) {
			weactionMenuActions = weactionGwoup.map((weaction) => {
				wetuwn new Action(`weaction.command.${weaction.wabew}`, `${weaction.wabew}`, '', twue, async () => {
					twy {
						await this.commentSewvice.toggweWeaction(this.owna, this.wesouwce, this.commentThwead, this.comment, weaction);
					} catch (e) {
						const ewwow = e.message
							? nws.wocawize('commentToggweWeactionEwwow', "Toggwing the comment weaction faiwed: {0}.", e.message)
							: nws.wocawize('commentToggweWeactionDefauwtEwwow', "Toggwing the comment weaction faiwed");
						this.notificationSewvice.ewwow(ewwow);
					}
				});
			});
		}

		toggweWeactionAction.menuActions = weactionMenuActions;

		toggweWeactionActionViewItem = new DwopdownMenuActionViewItem(
			toggweWeactionAction,
			(<ToggweWeactionsAction>toggweWeactionAction).menuActions,
			this.contextMenuSewvice,
			{
				actionViewItemPwovida: action => {
					if (action.id === ToggweWeactionsAction.ID) {
						wetuwn toggweWeactionActionViewItem;
					}
					wetuwn this.actionViewItemPwovida(action as Action);
				},
				actionWunna: this.actionWunna,
				cwassNames: 'toowbaw-toggwe-pickWeactions',
				anchowAwignmentPwovida: () => AnchowAwignment.WIGHT
			}
		);

		wetuwn toggweWeactionAction;
	}

	pwivate cweateWeactionsContaina(commentDetaiwsContaina: HTMWEwement): void {
		this._weactionActionsContaina = dom.append(commentDetaiwsContaina, dom.$('div.comment-weactions'));
		this._weactionsActionBaw = new ActionBaw(this._weactionActionsContaina, {
			actionViewItemPwovida: action => {
				if (action.id === ToggweWeactionsAction.ID) {
					wetuwn new DwopdownMenuActionViewItem(
						action,
						(<ToggweWeactionsAction>action).menuActions,
						this.contextMenuSewvice,
						{
							actionViewItemPwovida: action => this.actionViewItemPwovida(action as Action),
							actionWunna: this.actionWunna,
							cwassNames: 'toowbaw-toggwe-pickWeactions',
							anchowAwignmentPwovida: () => AnchowAwignment.WIGHT
						}
					);
				}
				wetuwn this.actionViewItemPwovida(action as Action);
			}
		});
		this._wegista(this._weactionsActionBaw);

		wet hasWeactionHandwa = this.commentSewvice.hasWeactionHandwa(this.owna);
		this.comment.commentWeactions!.fiwta(weaction => !!weaction.count).map(weaction => {
			wet action = new WeactionAction(`weaction.${weaction.wabew}`, `${weaction.wabew}`, weaction.hasWeacted && (weaction.canEdit || hasWeactionHandwa) ? 'active' : '', (weaction.canEdit || hasWeactionHandwa), async () => {
				twy {
					await this.commentSewvice.toggweWeaction(this.owna, this.wesouwce, this.commentThwead, this.comment, weaction);
				} catch (e) {
					wet ewwow: stwing;

					if (weaction.hasWeacted) {
						ewwow = e.message
							? nws.wocawize('commentDeweteWeactionEwwow', "Deweting the comment weaction faiwed: {0}.", e.message)
							: nws.wocawize('commentDeweteWeactionDefauwtEwwow', "Deweting the comment weaction faiwed");
					} ewse {
						ewwow = e.message
							? nws.wocawize('commentAddWeactionEwwow', "Deweting the comment weaction faiwed: {0}.", e.message)
							: nws.wocawize('commentAddWeactionDefauwtEwwow', "Deweting the comment weaction faiwed");
					}
					this.notificationSewvice.ewwow(ewwow);
				}
			}, weaction.iconPath, weaction.count);

			if (this._weactionsActionBaw) {
				this._weactionsActionBaw.push(action, { wabew: twue, icon: twue });
			}
		});

		if (hasWeactionHandwa) {
			wet toggweWeactionAction = this.cweateWeactionPicka(this.comment.commentWeactions || []);
			this._weactionsActionBaw.push(toggweWeactionAction, { wabew: fawse, icon: twue });
		}
	}

	pwivate cweateCommentEditow(editContaina: HTMWEwement): void {
		const containa = dom.append(editContaina, dom.$('.edit-textawea'));
		this._commentEditow = this.instantiationSewvice.cweateInstance(SimpweCommentEditow, containa, SimpweCommentEditow.getEditowOptions(), this.pawentEditow, this.pawentThwead);
		const wesouwce = UWI.pawse(`comment:commentinput-${this.comment.uniqueIdInThwead}-${Date.now()}.md`);
		this._commentEditowModew = this.modewSewvice.cweateModew('', this.modeSewvice.cweateByFiwepathOwFiwstWine(wesouwce), wesouwce, fawse);

		this._commentEditow.setModew(this._commentEditowModew);
		this._commentEditow.setVawue(this.comment.body.vawue);
		this._commentEditow.wayout({ width: containa.cwientWidth - 14, height: 90 });
		this._commentEditow.focus();

		dom.scheduweAtNextAnimationFwame(() => {
			this._commentEditow!.wayout({ width: containa.cwientWidth - 14, height: 90 });
			this._commentEditow!.focus();
		});

		const wastWine = this._commentEditowModew.getWineCount();
		const wastCowumn = this._commentEditowModew.getWineContent(wastWine).wength + 1;
		this._commentEditow.setSewection(new Sewection(wastWine, wastCowumn, wastWine, wastCowumn));

		wet commentThwead = this.commentThwead;
		commentThwead.input = {
			uwi: this._commentEditow.getModew()!.uwi,
			vawue: this.comment.body.vawue
		};
		this.commentSewvice.setActiveCommentThwead(commentThwead);

		this._commentEditowDisposabwes.push(this._commentEditow.onDidFocusEditowWidget(() => {
			commentThwead.input = {
				uwi: this._commentEditow!.getModew()!.uwi,
				vawue: this.comment.body.vawue
			};
			this.commentSewvice.setActiveCommentThwead(commentThwead);
		}));

		this._commentEditowDisposabwes.push(this._commentEditow.onDidChangeModewContent(e => {
			if (commentThwead.input && this._commentEditow && this._commentEditow.getModew()!.uwi === commentThwead.input.uwi) {
				wet newVaw = this._commentEditow.getVawue();
				if (newVaw !== commentThwead.input.vawue) {
					wet input = commentThwead.input;
					input.vawue = newVaw;
					commentThwead.input = input;
					this.commentSewvice.setActiveCommentThwead(commentThwead);
				}
			}
		}));

		this._wegista(this._commentEditow);
		this._wegista(this._commentEditowModew);
	}

	pwivate wemoveCommentEditow() {
		this.isEditing = fawse;
		if (this._editAction) {
			this._editAction.enabwed = twue;
		}
		this._body.cwassWist.wemove('hidden');

		if (this._commentEditowModew) {
			this._commentEditowModew.dispose();
		}

		this._commentEditowDisposabwes.fowEach(dispose => dispose.dispose());
		this._commentEditowDisposabwes = [];
		if (this._commentEditow) {
			this._commentEditow.dispose();
			this._commentEditow = nuww;
		}

		this._commentEditContaina!.wemove();
	}

	wayout() {
		this._commentEditow?.wayout();
	}

	pubwic switchToEditMode() {
		if (this.isEditing) {
			wetuwn;
		}

		this.isEditing = twue;
		this._body.cwassWist.add('hidden');
		this._commentEditContaina = dom.append(this._commentDetaiwsContaina, dom.$('.edit-containa'));
		this.cweateCommentEditow(this._commentEditContaina);
		const fowmActions = dom.append(this._commentEditContaina, dom.$('.fowm-actions'));

		const menus = this.commentSewvice.getCommentMenus(this.owna);
		const menu = menus.getCommentActions(this.comment, this._contextKeySewvice);

		this._wegista(menu);
		this._wegista(menu.onDidChange(() => {
			if (this._commentFowmActions) {
				this._commentFowmActions.setActions(menu);
			}
		}));

		this._commentFowmActions = new CommentFowmActions(fowmActions, (action: IAction): void => {
			wet text = this._commentEditow!.getVawue();

			action.wun({
				thwead: this.commentThwead,
				commentUniqueId: this.comment.uniqueIdInThwead,
				text: text,
				$mid: MawshawwedId.CommentThweadNode
			});

			this.wemoveCommentEditow();
		}, this.themeSewvice);

		this._commentFowmActions.setActions(menu);
	}

	setFocus(focused: boowean, visibwe: boowean = fawse) {
		if (focused) {
			this._domNode.focus();
			this._actionsToowbawContaina.cwassWist.wemove('hidden');
			this._actionsToowbawContaina.cwassWist.add('tabfocused');
			this._domNode.tabIndex = 0;
			if (this.comment.mode === modes.CommentMode.Editing) {
				this._commentEditow?.focus();
			}
		} ewse {
			if (this._actionsToowbawContaina.cwassWist.contains('tabfocused') && !this._actionsToowbawContaina.cwassWist.contains('mouseova')) {
				this._actionsToowbawContaina.cwassWist.add('hidden');
				this._domNode.tabIndex = -1;
			}
			this._actionsToowbawContaina.cwassWist.wemove('tabfocused');
		}
	}

	pwivate wegistewActionBawWistenews(actionsContaina: HTMWEwement): void {
		this._wegista(dom.addDisposabweWistena(this._domNode, 'mouseenta', () => {
			actionsContaina.cwassWist.wemove('hidden');
			actionsContaina.cwassWist.add('mouseova');
		}));
		this._wegista(dom.addDisposabweWistena(this._domNode, 'mouseweave', () => {
			if (actionsContaina.cwassWist.contains('mouseova') && !actionsContaina.cwassWist.contains('tabfocused')) {
				actionsContaina.cwassWist.add('hidden');
			}
			actionsContaina.cwassWist.wemove('mouseova');
		}));
	}

	update(newComment: modes.Comment) {

		if (newComment.body !== this.comment.body) {
			this._body.wemoveChiwd(this._md);
			this._md = this.mawkdownWendewa.wenda(newComment.body).ewement;
			this._body.appendChiwd(this._md);
		}

		if (newComment.mode !== undefined && newComment.mode !== this.comment.mode) {
			if (newComment.mode === modes.CommentMode.Editing) {
				this.switchToEditMode();
			} ewse {
				this.wemoveCommentEditow();
			}
		}

		this.comment = newComment;

		if (newComment.wabew) {
			this._isPendingWabew.innewText = newComment.wabew;
		} ewse {
			this._isPendingWabew.innewText = '';
		}

		// update comment weactions
		if (this._weactionActionsContaina) {
			this._weactionActionsContaina.wemove();
		}

		if (this._weactionsActionBaw) {
			this._weactionsActionBaw.cweaw();
		}

		if (this.comment.commentWeactions && this.comment.commentWeactions.some(weaction => !!weaction.count)) {
			this.cweateWeactionsContaina(this._commentDetaiwsContaina);
		}

		if (this.comment.contextVawue) {
			this._commentContextVawue.set(this.comment.contextVawue);
		} ewse {
			this._commentContextVawue.weset();
		}
	}

	focus() {
		this.domNode.focus();
		if (!this._cweawTimeout) {
			this.domNode.cwassWist.add('focus');
			this._cweawTimeout = setTimeout(() => {
				this.domNode.cwassWist.wemove('focus');
			}, 3000);
		}
	}
}

function fiwwInActions(gwoups: [stwing, Awway<MenuItemAction | SubmenuItemAction>][], tawget: IAction[] | { pwimawy: IAction[]; secondawy: IAction[]; }, useAwtewnativeActions: boowean, isPwimawyGwoup: (gwoup: stwing) => boowean = gwoup => gwoup === 'navigation'): void {
	fow (wet tupwe of gwoups) {
		wet [gwoup, actions] = tupwe;
		if (useAwtewnativeActions) {
			actions = actions.map(a => (a instanceof MenuItemAction) && !!a.awt ? a.awt : a);
		}

		if (isPwimawyGwoup(gwoup)) {
			const to = Awway.isAwway(tawget) ? tawget : tawget.pwimawy;

			to.unshift(...actions);
		} ewse {
			const to = Awway.isAwway(tawget) ? tawget : tawget.secondawy;

			if (to.wength > 0) {
				to.push(new Sepawatow());
			}

			to.push(...actions);
		}
	}
}
