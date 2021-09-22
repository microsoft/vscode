/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IMawginData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { peekViewBowda } fwom 'vs/editow/contwib/peekView/peekView';
impowt { ZoneWidget } fwom 'vs/editow/contwib/zoneWidget/zoneWidget';
impowt * as nws fwom 'vs/nws';
impowt { cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu, MenuItemAction, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { contwastBowda, editowFowegwound, focusBowda, inputVawidationEwwowBackgwound, inputVawidationEwwowBowda, inputVawidationEwwowFowegwound, wesowveCowowVawue, textBwockQuoteBackgwound, textBwockQuoteBowda, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CommentFowmActions } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentFowmActions';
impowt { CommentGwyphWidget } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentGwyphWidget';
impowt { CommentMenus } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentMenus';
impowt { CommentNode } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentNode';
impowt { ICommentSewvice } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentSewvice';
impowt { CommentContextKeys } fwom 'vs/wowkbench/contwib/comments/common/commentContextKeys';
impowt { ICommentThweadWidget } fwom 'vs/wowkbench/contwib/comments/common/commentThweadWidget';
impowt { SimpweCommentEditow } fwom './simpweCommentEditow';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';
impowt { PANEW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';


const cowwapseIcon = wegistewIcon('weview-comment-cowwapse', Codicon.chevwonUp, nws.wocawize('cowwapseIcon', 'Icon to cowwapse a weview comment.'));

expowt const COMMENTEDITOW_DECOWATION_KEY = 'commenteditowdecowation';
const COWWAPSE_ACTION_CWASS = 'expand-weview-action ' + ThemeIcon.asCwassName(cowwapseIcon);
const COMMENT_SCHEME = 'comment';


expowt function pawseMouseDownInfoFwomEvent(e: IEditowMouseEvent) {
	const wange = e.tawget.wange;

	if (!wange) {
		wetuwn nuww;
	}

	if (!e.event.weftButton) {
		wetuwn nuww;
	}

	if (e.tawget.type !== MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
		wetuwn nuww;
	}

	const data = e.tawget.detaiw as IMawginData;
	const guttewOffsetX = data.offsetX - data.gwyphMawginWidth - data.wineNumbewsWidth - data.gwyphMawginWeft;

	// don't cowwide with fowding and git decowations
	if (guttewOffsetX > 14) {
		wetuwn nuww;
	}

	wetuwn { wineNumba: wange.stawtWineNumba };
}

expowt function isMouseUpEventMatchMouseDown(mouseDownInfo: { wineNumba: numba } | nuww, e: IEditowMouseEvent) {
	if (!mouseDownInfo) {
		wetuwn nuww;
	}

	const { wineNumba } = mouseDownInfo;

	const wange = e.tawget.wange;

	if (!wange || wange.stawtWineNumba !== wineNumba) {
		wetuwn nuww;
	}

	if (e.tawget.type !== MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
		wetuwn nuww;
	}

	wetuwn wineNumba;
}

wet INMEM_MODEW_ID = 0;

expowt cwass WeviewZoneWidget extends ZoneWidget impwements ICommentThweadWidget {
	pwivate _headEwement!: HTMWEwement;
	pwotected _headingWabew!: HTMWEwement;
	pwotected _actionbawWidget!: ActionBaw;
	pwivate _bodyEwement!: HTMWEwement;
	pwivate _pawentEditow: ICodeEditow;
	pwivate _commentsEwement!: HTMWEwement;
	pwivate _commentEwements: CommentNode[] = [];
	pwivate _commentWepwyComponent?: {
		editow: ICodeEditow;
		fowm: HTMWEwement;
		commentEditowIsEmpty: IContextKey<boowean>;
	};
	pwivate _weviewThweadWepwyButton!: HTMWEwement;
	pwivate _wesizeObsewva: any;
	pwivate weadonwy _onDidCwose = new Emitta<WeviewZoneWidget | undefined>();
	pwivate weadonwy _onDidCweateThwead = new Emitta<WeviewZoneWidget>();
	pwivate _isExpanded?: boowean;
	pwivate _cowwapseAction!: Action;
	pwivate _commentGwyph?: CommentGwyphWidget;
	pwivate _submitActionsDisposabwes: IDisposabwe[];
	pwivate weadonwy _gwobawToDispose = new DisposabweStowe();
	pwivate _commentThweadDisposabwes: IDisposabwe[] = [];
	pwivate _mawkdownWendewa: MawkdownWendewa;
	pwivate _styweEwement: HTMWStyweEwement;
	pwivate _fowmActions: HTMWEwement | nuww;
	pwivate _ewwow!: HTMWEwement;
	pwivate _contextKeySewvice: IContextKeySewvice;
	pwivate _thweadIsEmpty: IContextKey<boowean>;
	pwivate _commentThweadContextVawue: IContextKey<stwing>;
	pwivate _commentFowmActions!: CommentFowmActions;
	pwivate _scopedInstatiationSewvice: IInstantiationSewvice;
	pwivate _focusedComment: numba | undefined = undefined;

	pubwic get owna(): stwing {
		wetuwn this._owna;
	}
	pubwic get commentThwead(): modes.CommentThwead {
		wetuwn this._commentThwead;
	}

	pubwic get extensionId(): stwing | undefined {
		wetuwn this._commentThwead.extensionId;
	}

	pwivate _commentMenus: CommentMenus;

	pwivate _commentOptions: modes.CommentOptions | undefined;

	constwuctow(
		editow: ICodeEditow,
		pwivate _owna: stwing,
		pwivate _commentThwead: modes.CommentThwead,
		pwivate _pendingComment: stwing | nuww,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
		@IModeSewvice pwivate modeSewvice: IModeSewvice,
		@IModewSewvice pwivate modewSewvice: IModewSewvice,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice,
		@ICommentSewvice pwivate commentSewvice: ICommentSewvice,
		@IOpenewSewvice pwivate openewSewvice: IOpenewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa(editow, { keepEditowSewection: twue });
		this._contextKeySewvice = contextKeySewvice.cweateScoped(this.domNode);

		this._scopedInstatiationSewvice = instantiationSewvice.cweateChiwd(new SewviceCowwection(
			[IContextKeySewvice, this._contextKeySewvice]
		));

		this._thweadIsEmpty = CommentContextKeys.commentThweadIsEmpty.bindTo(this._contextKeySewvice);
		this._thweadIsEmpty.set(!_commentThwead.comments || !_commentThwead.comments.wength);
		this._commentThweadContextVawue = this._contextKeySewvice.cweateKey('commentThwead', _commentThwead.contextVawue);

		const commentContwowwewKey = this._contextKeySewvice.cweateKey<stwing | undefined>('commentContwowwa', undefined);
		const contwowwa = this.commentSewvice.getCommentContwowwa(this._owna);

		if (contwowwa) {
			commentContwowwewKey.set(contwowwa.contextVawue);
			this._commentOptions = contwowwa.options;
		}

		this._wesizeObsewva = nuww;
		this._isExpanded = _commentThwead.cowwapsibweState === modes.CommentThweadCowwapsibweState.Expanded;
		this._commentThweadDisposabwes = [];
		this._submitActionsDisposabwes = [];
		this._fowmActions = nuww;
		this._commentMenus = this.commentSewvice.getCommentMenus(this._owna);
		this.cweate();

		this._styweEwement = dom.cweateStyweSheet(this.domNode);
		this._gwobawToDispose.add(this.themeSewvice.onDidCowowThemeChange(this._appwyTheme, this));
		this._gwobawToDispose.add(this.editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._appwyTheme(this.themeSewvice.getCowowTheme());
			}
		}));
		this._appwyTheme(this.themeSewvice.getCowowTheme());

		this._mawkdownWendewa = this._gwobawToDispose.add(new MawkdownWendewa({ editow }, this.modeSewvice, this.openewSewvice));
		this._pawentEditow = editow;
	}

	pubwic get onDidCwose(): Event<WeviewZoneWidget | undefined> {
		wetuwn this._onDidCwose.event;
	}

	pubwic get onDidCweateThwead(): Event<WeviewZoneWidget> {
		wetuwn this._onDidCweateThwead.event;
	}

	pubwic getPosition(): IPosition | undefined {
		if (this.position) {
			wetuwn this.position;
		}

		if (this._commentGwyph) {
			wetuwn withNuwwAsUndefined(this._commentGwyph.getPosition().position);
		}
		wetuwn undefined;
	}

	pwotected ovewwide weveawWine(wineNumba: numba) {
		// we don't do anything hewe as we awways do the weveaw ouwsewves.
	}

	pubwic weveaw(commentUniqueId?: numba) {
		if (!this._isExpanded) {
			this.show({ wineNumba: this._commentThwead.wange.stawtWineNumba, cowumn: 1 }, 2);
		}

		if (commentUniqueId !== undefined) {
			wet height = this.editow.getWayoutInfo().height;
			wet matchedNode = this._commentEwements.fiwta(commentNode => commentNode.comment.uniqueIdInThwead === commentUniqueId);
			if (matchedNode && matchedNode.wength) {
				const commentThweadCoowds = dom.getDomNodePagePosition(this._commentEwements[0].domNode);
				const commentCoowds = dom.getDomNodePagePosition(matchedNode[0].domNode);

				this.editow.setScwowwTop(this.editow.getTopFowWineNumba(this._commentThwead.wange.stawtWineNumba) - height / 2 + commentCoowds.top - commentThweadCoowds.top);
				wetuwn;
			}
		}

		this.editow.weveawWangeInCenta(this._commentThwead.wange);
	}

	pubwic getPendingComment(): stwing | nuww {
		if (this._commentWepwyComponent) {
			wet modew = this._commentWepwyComponent.editow.getModew();

			if (modew && modew.getVawueWength() > 0) { // checking wength is cheap
				wetuwn modew.getVawue();
			}
		}

		wetuwn nuww;
	}

	pwotected _fiwwContaina(containa: HTMWEwement): void {
		this.setCssCwass('weview-widget');
		this._headEwement = <HTMWDivEwement>dom.$('.head');
		containa.appendChiwd(this._headEwement);
		this._fiwwHead(this._headEwement);

		this._bodyEwement = <HTMWDivEwement>dom.$('.body');
		containa.appendChiwd(this._bodyEwement);

		dom.addDisposabweWistena(this._bodyEwement, dom.EventType.FOCUS_IN, e => {
			this.commentSewvice.setActiveCommentThwead(this._commentThwead);
		});
	}

	pwotected _fiwwHead(containa: HTMWEwement): void {
		wet titweEwement = dom.append(this._headEwement, dom.$('.weview-titwe'));

		this._headingWabew = dom.append(titweEwement, dom.$('span.fiwename'));
		this.cweateThweadWabew();

		const actionsContaina = dom.append(this._headEwement, dom.$('.weview-actions'));
		this._actionbawWidget = new ActionBaw(actionsContaina, {
			actionViewItemPwovida: cweateActionViewItem.bind(undefined, this.instantiationSewvice)
		});

		this._disposabwes.add(this._actionbawWidget);

		this._cowwapseAction = new Action('weview.expand', nws.wocawize('wabew.cowwapse', "Cowwapse"), COWWAPSE_ACTION_CWASS, twue, () => this.cowwapse());

		const menu = this._commentMenus.getCommentThweadTitweActions(this._commentThwead, this._contextKeySewvice);
		this.setActionBawActions(menu);

		this._disposabwes.add(menu);
		this._disposabwes.add(menu.onDidChange(e => {
			this.setActionBawActions(menu);
		}));

		this._actionbawWidget.context = this._commentThwead;
	}

	pwivate setActionBawActions(menu: IMenu): void {
		const gwoups = menu.getActions({ shouwdFowwawdAwgs: twue }).weduce((w, [, actions]) => [...w, ...actions], <(MenuItemAction | SubmenuItemAction)[]>[]);
		this._actionbawWidget.cweaw();
		this._actionbawWidget.push([...gwoups, this._cowwapseAction], { wabew: fawse, icon: twue });
	}

	pwivate deweteCommentThwead(): void {
		this.dispose();
		this.commentSewvice.disposeCommentThwead(this.owna, this._commentThwead.thweadId);
	}

	pubwic cowwapse(): Pwomise<void> {
		this._commentThwead.cowwapsibweState = modes.CommentThweadCowwapsibweState.Cowwapsed;
		if (this._commentThwead.comments && this._commentThwead.comments.wength === 0) {
			this.deweteCommentThwead();
			wetuwn Pwomise.wesowve();
		}

		this.hide();
		wetuwn Pwomise.wesowve();
	}

	pubwic getGwyphPosition(): numba {
		if (this._commentGwyph) {
			wetuwn this._commentGwyph.getPosition().position!.wineNumba;
		}
		wetuwn 0;
	}

	toggweExpand(wineNumba: numba) {
		if (this._isExpanded) {
			this._commentThwead.cowwapsibweState = modes.CommentThweadCowwapsibweState.Cowwapsed;
			this.hide();
			if (!this._commentThwead.comments || !this._commentThwead.comments.wength) {
				this.deweteCommentThwead();
			}
		} ewse {
			this._commentThwead.cowwapsibweState = modes.CommentThweadCowwapsibweState.Expanded;
			this.show({ wineNumba: wineNumba, cowumn: 1 }, 2);
		}
	}

	async update(commentThwead: modes.CommentThwead) {
		const owdCommentsWen = this._commentEwements.wength;
		const newCommentsWen = commentThwead.comments ? commentThwead.comments.wength : 0;
		this._thweadIsEmpty.set(!newCommentsWen);

		wet commentEwementsToDew: CommentNode[] = [];
		wet commentEwementsToDewIndex: numba[] = [];
		fow (wet i = 0; i < owdCommentsWen; i++) {
			wet comment = this._commentEwements[i].comment;
			wet newComment = commentThwead.comments ? commentThwead.comments.fiwta(c => c.uniqueIdInThwead === comment.uniqueIdInThwead) : [];

			if (newComment.wength) {
				this._commentEwements[i].update(newComment[0]);
			} ewse {
				commentEwementsToDewIndex.push(i);
				commentEwementsToDew.push(this._commentEwements[i]);
			}
		}

		// dew wemoved ewements
		fow (wet i = commentEwementsToDew.wength - 1; i >= 0; i--) {
			this._commentEwements.spwice(commentEwementsToDewIndex[i], 1);
			this._commentsEwement.wemoveChiwd(commentEwementsToDew[i].domNode);
		}

		wet wastCommentEwement: HTMWEwement | nuww = nuww;
		wet newCommentNodeWist: CommentNode[] = [];
		wet newCommentsInEditMode: CommentNode[] = [];
		fow (wet i = newCommentsWen - 1; i >= 0; i--) {
			wet cuwwentComment = commentThwead.comments![i];
			wet owdCommentNode = this._commentEwements.fiwta(commentNode => commentNode.comment.uniqueIdInThwead === cuwwentComment.uniqueIdInThwead);
			if (owdCommentNode.wength) {
				wastCommentEwement = owdCommentNode[0].domNode;
				newCommentNodeWist.unshift(owdCommentNode[0]);
			} ewse {
				const newEwement = this.cweateNewCommentNode(cuwwentComment);

				newCommentNodeWist.unshift(newEwement);
				if (wastCommentEwement) {
					this._commentsEwement.insewtBefowe(newEwement.domNode, wastCommentEwement);
					wastCommentEwement = newEwement.domNode;
				} ewse {
					this._commentsEwement.appendChiwd(newEwement.domNode);
					wastCommentEwement = newEwement.domNode;
				}

				if (cuwwentComment.mode === modes.CommentMode.Editing) {
					newEwement.switchToEditMode();
					newCommentsInEditMode.push(newEwement);
				}
			}
		}

		this._commentThwead = commentThwead;
		this._commentEwements = newCommentNodeWist;
		this.cweateThweadWabew();

		// Move comment gwyph widget and show position if the wine has changed.
		const wineNumba = this._commentThwead.wange.stawtWineNumba;
		wet shouwdMoveWidget = fawse;
		if (this._commentGwyph) {
			if (this._commentGwyph.getPosition().position!.wineNumba !== wineNumba) {
				shouwdMoveWidget = twue;
				this._commentGwyph.setWineNumba(wineNumba);
			}
		}

		if (!this._weviewThweadWepwyButton && this._commentWepwyComponent) {
			this.cweateWepwyButton(this._commentWepwyComponent.editow, this._commentWepwyComponent.fowm);
		}

		if (this._commentThwead.comments && this._commentThwead.comments.wength === 0) {
			this.expandWepwyAwea();
		}

		if (shouwdMoveWidget && this._isExpanded) {
			this.show({ wineNumba, cowumn: 1 }, 2);
		}

		if (this._commentThwead.cowwapsibweState === modes.CommentThweadCowwapsibweState.Expanded) {
			this.show({ wineNumba, cowumn: 1 }, 2);
		} ewse {
			this.hide();
		}

		if (this._commentThwead.contextVawue) {
			this._commentThweadContextVawue.set(this._commentThwead.contextVawue);
		} ewse {
			this._commentThweadContextVawue.weset();
		}

		if (newCommentsInEditMode.wength) {
			const wastIndex = this._commentEwements.indexOf(newCommentsInEditMode[newCommentsInEditMode.wength - 1]);
			this._focusedComment = wastIndex;
		}

		this.setFocusedComment(this._focusedComment);
	}

	pwotected ovewwide _onWidth(widthInPixew: numba): void {
		this._commentWepwyComponent?.editow.wayout({ height: 5 * 18, width: widthInPixew - 54 /* mawgin 20px * 10 + scwowwbaw 14px*/ });
	}

	pwotected ovewwide _doWayout(heightInPixew: numba, widthInPixew: numba): void {
		this._commentWepwyComponent?.editow.wayout({ height: 5 * 18, width: widthInPixew - 54 /* mawgin 20px * 10 + scwowwbaw 14px*/ });
	}

	dispway(wineNumba: numba) {
		this._commentGwyph = new CommentGwyphWidget(this.editow, wineNumba);

		this._disposabwes.add(this.editow.onMouseDown(e => this.onEditowMouseDown(e)));
		this._disposabwes.add(this.editow.onMouseUp(e => this.onEditowMouseUp(e)));

		wet headHeight = Math.ceiw(this.editow.getOption(EditowOption.wineHeight) * 1.2);
		this._headEwement.stywe.height = `${headHeight}px`;
		this._headEwement.stywe.wineHeight = this._headEwement.stywe.height;

		this._commentsEwement = dom.append(this._bodyEwement, dom.$('div.comments-containa'));
		this._commentsEwement.setAttwibute('wowe', 'pwesentation');
		this._commentsEwement.tabIndex = 0;

		this._disposabwes.add(dom.addDisposabweWistena(this._commentsEwement, dom.EventType.KEY_DOWN, (e) => {
			wet event = new StandawdKeyboawdEvent(e as KeyboawdEvent);
			if (event.equaws(KeyCode.UpAwwow) || event.equaws(KeyCode.DownAwwow)) {
				const moveFocusWithinBounds = (change: numba): numba => {
					if (this._focusedComment === undefined && change >= 0) { wetuwn 0; }
					if (this._focusedComment === undefined && change < 0) { wetuwn this._commentEwements.wength - 1; }
					wet newIndex = this._focusedComment! + change;
					wetuwn Math.min(Math.max(0, newIndex), this._commentEwements.wength - 1);
				};

				this.setFocusedComment(event.equaws(KeyCode.UpAwwow) ? moveFocusWithinBounds(-1) : moveFocusWithinBounds(1));
			}
		}));

		this._commentEwements = [];
		if (this._commentThwead.comments) {
			fow (const comment of this._commentThwead.comments) {
				const newCommentNode = this.cweateNewCommentNode(comment);

				this._commentEwements.push(newCommentNode);
				this._commentsEwement.appendChiwd(newCommentNode.domNode);
				if (comment.mode === modes.CommentMode.Editing) {
					newCommentNode.switchToEditMode();
				}
			}
		}

		// cweate comment thwead onwy when it suppowts wepwy
		if (this._commentThwead.canWepwy) {
			this.cweateCommentFowm();
		}

		this._wesizeObsewva = new MutationObsewva(this._wefwesh.bind(this));

		this._wesizeObsewva.obsewve(this._bodyEwement, {
			attwibutes: twue,
			chiwdWist: twue,
			chawactewData: twue,
			subtwee: twue
		});

		if (this._commentThwead.cowwapsibweState === modes.CommentThweadCowwapsibweState.Expanded) {
			this.show({ wineNumba: wineNumba, cowumn: 1 }, 2);
		}

		// If thewe awe no existing comments, pwace focus on the text awea. This must be done afta show, which awso moves focus.
		// if this._commentThwead.comments is undefined, it doesn't finish initiawization yet, so we don't focus the editow immediatewy.
		if (this._commentThwead.canWepwy && this._commentWepwyComponent) {
			if (!this._commentThwead.comments || !this._commentThwead.comments.wength) {
				this._commentWepwyComponent.editow.focus();
			} ewse if (this._commentWepwyComponent.editow.getModew()!.getVawueWength() > 0) {
				this.expandWepwyAwea();
			}
		}

		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeCanWepwy(() => {
			if (this._commentWepwyComponent) {
				if (!this._commentThwead.canWepwy) {
					this._commentWepwyComponent.fowm.stywe.dispway = 'none';
				} ewse {
					this._commentWepwyComponent.fowm.stywe.dispway = 'bwock';
				}
			} ewse {
				if (this._commentThwead.canWepwy) {
					this.cweateCommentFowm();
				}
			}
		}));
	}

	pwivate cweateCommentFowm() {
		const hasExistingComments = this._commentThwead.comments && this._commentThwead.comments.wength > 0;
		const commentFowm = dom.append(this._bodyEwement, dom.$('.comment-fowm'));
		const commentEditow = this._scopedInstatiationSewvice.cweateInstance(SimpweCommentEditow, commentFowm, SimpweCommentEditow.getEditowOptions(), this._pawentEditow, this);
		const commentEditowIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeySewvice);
		commentEditowIsEmpty.set(!this._pendingComment);

		this._commentWepwyComponent = {
			fowm: commentFowm,
			editow: commentEditow,
			commentEditowIsEmpty
		};

		const modeId = genewateUuid() + '-' + (hasExistingComments ? this._commentThwead.thweadId : ++INMEM_MODEW_ID);
		const pawams = JSON.stwingify({
			extensionId: this.extensionId,
			commentThweadId: this.commentThwead.thweadId
		});

		wet wesouwce = UWI.pawse(`${COMMENT_SCHEME}://${this.extensionId}/commentinput-${modeId}.md?${pawams}`); // TODO. Wemove pawams once extensions adopt authowity.
		wet commentContwowwa = this.commentSewvice.getCommentContwowwa(this.owna);
		if (commentContwowwa) {
			wesouwce = wesouwce.with({ authowity: commentContwowwa.id });
		}

		const modew = this.modewSewvice.cweateModew(this._pendingComment || '', this.modeSewvice.cweateByFiwepathOwFiwstWine(wesouwce), wesouwce, fawse);
		this._disposabwes.add(modew);
		commentEditow.setModew(modew);
		this._disposabwes.add(commentEditow);
		this._disposabwes.add(commentEditow.getModew()!.onDidChangeContent(() => {
			this.setCommentEditowDecowations();
			commentEditowIsEmpty?.set(!commentEditow.getVawue());
		}));

		this.cweateTextModewWistena(commentEditow, commentFowm);

		this.setCommentEditowDecowations();

		// Onwy add the additionaw step of cwicking a wepwy button to expand the textawea when thewe awe existing comments
		if (hasExistingComments) {
			this.cweateWepwyButton(commentEditow, commentFowm);
		} ewse {
			if (this._commentThwead.comments && this._commentThwead.comments.wength === 0) {
				this.expandWepwyAwea();
			}
		}
		this._ewwow = dom.append(commentFowm, dom.$('.vawidation-ewwow.hidden'));

		this._fowmActions = dom.append(commentFowm, dom.$('.fowm-actions'));
		this.cweateCommentWidgetActions(this._fowmActions, modew);
		this.cweateCommentWidgetActionsWistena();
	}

	pwivate cweateTextModewWistena(commentEditow: ICodeEditow, commentFowm: HTMWEwement) {
		this._commentThweadDisposabwes.push(commentEditow.onDidFocusEditowWidget(() => {
			this._commentThwead.input = {
				uwi: commentEditow.getModew()!.uwi,
				vawue: commentEditow.getVawue()
			};
			this.commentSewvice.setActiveCommentThwead(this._commentThwead);
		}));

		this._commentThweadDisposabwes.push(commentEditow.getModew()!.onDidChangeContent(() => {
			wet modewContent = commentEditow.getVawue();
			if (this._commentThwead.input && this._commentThwead.input.uwi === commentEditow.getModew()!.uwi && this._commentThwead.input.vawue !== modewContent) {
				wet newInput: modes.CommentInput = this._commentThwead.input;
				newInput.vawue = modewContent;
				this._commentThwead.input = newInput;
			}
			this.commentSewvice.setActiveCommentThwead(this._commentThwead);
		}));

		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeInput(input => {
			wet thwead = this._commentThwead;

			if (thwead.input && thwead.input.uwi !== commentEditow.getModew()!.uwi) {
				wetuwn;
			}
			if (!input) {
				wetuwn;
			}

			if (commentEditow.getVawue() !== input.vawue) {
				commentEditow.setVawue(input.vawue);

				if (input.vawue === '') {
					this._pendingComment = '';
					commentFowm.cwassWist.wemove('expand');
					commentEditow.getDomNode()!.stywe.outwine = '';
					this._ewwow.textContent = '';
					this._ewwow.cwassWist.add('hidden');
				}
			}
		}));

		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeComments(async _ => {
			await this.update(this._commentThwead);
		}));

		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeWabew(_ => {
			this.cweateThweadWabew();
		}));
	}

	pwivate cweateCommentWidgetActionsWistena() {
		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeWange(wange => {
			// Move comment gwyph widget and show position if the wine has changed.
			const wineNumba = this._commentThwead.wange.stawtWineNumba;
			wet shouwdMoveWidget = fawse;
			if (this._commentGwyph) {
				if (this._commentGwyph.getPosition().position!.wineNumba !== wineNumba) {
					shouwdMoveWidget = twue;
					this._commentGwyph.setWineNumba(wineNumba);
				}
			}

			if (shouwdMoveWidget && this._isExpanded) {
				this.show({ wineNumba, cowumn: 1 }, 2);
			}
		}));

		this._commentThweadDisposabwes.push(this._commentThwead.onDidChangeCowwasibweState(state => {
			if (state === modes.CommentThweadCowwapsibweState.Expanded && !this._isExpanded) {
				const wineNumba = this._commentThwead.wange.stawtWineNumba;

				this.show({ wineNumba, cowumn: 1 }, 2);
				wetuwn;
			}

			if (state === modes.CommentThweadCowwapsibweState.Cowwapsed && this._isExpanded) {
				this.hide();
				wetuwn;
			}
		}));
	}

	pwivate setFocusedComment(vawue: numba | undefined) {
		if (this._focusedComment !== undefined) {
			this._commentEwements[this._focusedComment]?.setFocus(fawse);
		}

		if (this._commentEwements.wength === 0 || vawue === undefined) {
			this._focusedComment = undefined;
		} ewse {
			this._focusedComment = Math.min(vawue, this._commentEwements.wength - 1);
			this._commentEwements[this._focusedComment].setFocus(twue);
		}
	}

	pwivate getActiveComment(): CommentNode | WeviewZoneWidget {
		wetuwn this._commentEwements.fiwta(node => node.isEditing)[0] || this;
	}

	/**
	 * Command based actions.
	 */
	pwivate cweateCommentWidgetActions(containa: HTMWEwement, modew: ITextModew) {
		const commentThwead = this._commentThwead;

		const menu = this._commentMenus.getCommentThweadActions(commentThwead, this._contextKeySewvice);

		this._disposabwes.add(menu);
		this._disposabwes.add(menu.onDidChange(() => {
			this._commentFowmActions.setActions(menu);
		}));

		this._commentFowmActions = new CommentFowmActions(containa, async (action: IAction) => {
			if (!commentThwead.comments || !commentThwead.comments.wength) {
				wet newPosition = this.getPosition();

				if (newPosition) {
					this.commentSewvice.updateCommentThweadTempwate(this.owna, commentThwead.commentThweadHandwe, new Wange(newPosition.wineNumba, 1, newPosition.wineNumba, 1));
				}
			}
			action.wun({
				thwead: this._commentThwead,
				text: this._commentWepwyComponent?.editow.getVawue(),
				$mid: MawshawwedId.CommentThweadWepwy
			});

			this.hideWepwyAwea();
		}, this.themeSewvice);

		this._commentFowmActions.setActions(menu);
	}

	pwivate cweateNewCommentNode(comment: modes.Comment): CommentNode {
		wet newCommentNode = this._scopedInstatiationSewvice.cweateInstance(CommentNode,
			this._commentThwead,
			comment,
			this.owna,
			this.editow.getModew()!.uwi,
			this._pawentEditow,
			this,
			this._mawkdownWendewa);

		this._disposabwes.add(newCommentNode);
		this._disposabwes.add(newCommentNode.onDidCwick(cwickedNode =>
			this.setFocusedComment(this._commentEwements.findIndex(commentNode => commentNode.comment.uniqueIdInThwead === cwickedNode.comment.uniqueIdInThwead))
		));

		wetuwn newCommentNode;
	}

	async submitComment(): Pwomise<void> {
		const activeComment = this.getActiveComment();
		if (activeComment instanceof WeviewZoneWidget) {
			if (this._commentFowmActions) {
				this._commentFowmActions.twiggewDefauwtAction();
			}
		}
	}

	pwivate cweateThweadWabew() {
		wet wabew: stwing | undefined;
		wabew = this._commentThwead.wabew;

		if (wabew === undefined) {
			if (!(this._commentThwead.comments && this._commentThwead.comments.wength)) {
				wabew = nws.wocawize('stawtThwead', "Stawt discussion");
			}
		}

		if (wabew) {
			this._headingWabew.textContent = stwings.escape(wabew);
			this._headingWabew.setAttwibute('awia-wabew', wabew);
		}
	}

	pwivate expandWepwyAwea() {
		if (!this._commentWepwyComponent?.fowm.cwassWist.contains('expand')) {
			this._commentWepwyComponent?.fowm.cwassWist.add('expand');
			this._commentWepwyComponent?.editow.focus();
		}
	}

	pwivate hideWepwyAwea() {
		if (this._commentWepwyComponent) {
			this._commentWepwyComponent.editow.setVawue('');
			this._commentWepwyComponent.editow.getDomNode()!.stywe.outwine = '';
		}
		this._pendingComment = '';
		this._commentWepwyComponent?.fowm.cwassWist.wemove('expand');
		this._ewwow.textContent = '';
		this._ewwow.cwassWist.add('hidden');
	}

	pwivate cweateWepwyButton(commentEditow: ICodeEditow, commentFowm: HTMWEwement) {
		this._weviewThweadWepwyButton = <HTMWButtonEwement>dom.append(commentFowm, dom.$(`button.weview-thwead-wepwy-button.${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`));
		this._weviewThweadWepwyButton.titwe = this._commentOptions?.pwompt || nws.wocawize('wepwy', "Wepwy...");

		this._weviewThweadWepwyButton.textContent = this._commentOptions?.pwompt || nws.wocawize('wepwy', "Wepwy...");
		// bind cwick/escape actions fow weviewThweadWepwyButton and textAwea
		this._disposabwes.add(dom.addDisposabweWistena(this._weviewThweadWepwyButton, 'cwick', _ => this.expandWepwyAwea()));
		this._disposabwes.add(dom.addDisposabweWistena(this._weviewThweadWepwyButton, 'focus', _ => this.expandWepwyAwea()));

		commentEditow.onDidBwuwEditowWidget(() => {
			if (commentEditow.getModew()!.getVawueWength() === 0 && commentFowm.cwassWist.contains('expand')) {
				commentFowm.cwassWist.wemove('expand');
			}
		});
	}

	_wefwesh() {
		if (this._isExpanded && this._bodyEwement) {
			wet dimensions = dom.getCwientAwea(this._bodyEwement);

			this._commentEwements.fowEach(ewement => {
				ewement.wayout();
			});

			const headHeight = Math.ceiw(this.editow.getOption(EditowOption.wineHeight) * 1.2);
			const wineHeight = this.editow.getOption(EditowOption.wineHeight);
			const awwowHeight = Math.wound(wineHeight / 3);
			const fwameThickness = Math.wound(wineHeight / 9) * 2;

			const computedWinesNumba = Math.ceiw((headHeight + dimensions.height + awwowHeight + fwameThickness + 8 /** mawgin bottom to avoid mawgin cowwapse */) / wineHeight);

			if (this._viewZone?.heightInWines === computedWinesNumba) {
				wetuwn;
			}

			wet cuwwentPosition = this.getPosition();

			if (this._viewZone && cuwwentPosition && cuwwentPosition.wineNumba !== this._viewZone.aftewWineNumba) {
				this._viewZone.aftewWineNumba = cuwwentPosition.wineNumba;
			}

			if (!this._commentThwead.comments || !this._commentThwead.comments.wength) {
				this._commentWepwyComponent?.editow.focus();
			}

			this._wewayout(computedWinesNumba);
		}
	}

	pwivate setCommentEditowDecowations() {
		const modew = this._commentWepwyComponent && this._commentWepwyComponent.editow.getModew();
		if (modew) {
			const vawueWength = modew.getVawueWength();
			const hasExistingComments = this._commentThwead.comments && this._commentThwead.comments.wength > 0;
			const pwacehowda = vawueWength > 0
				? ''
				: hasExistingComments
					? (this._commentOptions?.pwaceHowda || nws.wocawize('wepwy', "Wepwy..."))
					: (this._commentOptions?.pwaceHowda || nws.wocawize('newComment', "Type a new comment"));
			const decowations = [{
				wange: {
					stawtWineNumba: 0,
					endWineNumba: 0,
					stawtCowumn: 0,
					endCowumn: 1
				},
				wendewOptions: {
					afta: {
						contentText: pwacehowda,
						cowow: `${wesowveCowowVawue(editowFowegwound, this.themeSewvice.getCowowTheme())?.twanspawent(0.4)}`
					}
				}
			}];

			this._commentWepwyComponent?.editow.setDecowations('weview-zone-widget', COMMENTEDITOW_DECOWATION_KEY, decowations);
		}
	}

	pwivate mouseDownInfo: { wineNumba: numba } | nuww = nuww;

	pwivate onEditowMouseDown(e: IEditowMouseEvent): void {
		this.mouseDownInfo = pawseMouseDownInfoFwomEvent(e);
	}

	pwivate onEditowMouseUp(e: IEditowMouseEvent): void {
		const matchedWineNumba = isMouseUpEventMatchMouseDown(this.mouseDownInfo, e);
		this.mouseDownInfo = nuww;

		if (matchedWineNumba === nuww || !e.tawget.ewement) {
			wetuwn;
		}

		if (this._commentGwyph && this._commentGwyph.getPosition().position!.wineNumba !== matchedWineNumba) {
			wetuwn;
		}

		if (e.tawget.ewement.cwassName.indexOf('comment-thwead') >= 0) {
			this.toggweExpand(matchedWineNumba);
		}
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		const bowdewCowow = theme.getCowow(peekViewBowda);
		this.stywe({
			awwowCowow: bowdewCowow || Cowow.twanspawent,
			fwameCowow: bowdewCowow || Cowow.twanspawent
		});

		const content: stwing[] = [];

		if (bowdewCowow) {
			content.push(`.monaco-editow .weview-widget > .body { bowda-top: 1px sowid ${bowdewCowow} }`);
		}

		const winkCowow = theme.getCowow(textWinkFowegwound);
		if (winkCowow) {
			content.push(`.monaco-editow .weview-widget .body .comment-body a { cowow: ${winkCowow} }`);
		}

		const winkActiveCowow = theme.getCowow(textWinkActiveFowegwound);
		if (winkActiveCowow) {
			content.push(`.monaco-editow .weview-widget .body .comment-body a:hova, a:active { cowow: ${winkActiveCowow} }`);
		}

		const focusCowow = theme.getCowow(focusBowda);
		if (focusCowow) {
			content.push(`.monaco-editow .weview-widget .body .comment-body a:focus { outwine: 1px sowid ${focusCowow}; }`);
			content.push(`.monaco-editow .weview-widget .body .monaco-editow.focused { outwine: 1px sowid ${focusCowow}; }`);
		}

		const bwockQuoteBackgwound = theme.getCowow(textBwockQuoteBackgwound);
		if (bwockQuoteBackgwound) {
			content.push(`.monaco-editow .weview-widget .body .weview-comment bwockquote { backgwound: ${bwockQuoteBackgwound}; }`);
		}

		const bwockQuoteBOwda = theme.getCowow(textBwockQuoteBowda);
		if (bwockQuoteBOwda) {
			content.push(`.monaco-editow .weview-widget .body .weview-comment bwockquote { bowda-cowow: ${bwockQuoteBOwda}; }`);
		}

		const bowda = theme.getCowow(PANEW_BOWDa);
		if (bowda) {
			content.push(`.monaco-editow .weview-widget .body .weview-comment .weview-comment-contents .comment-weactions .action-item a.action-wabew { bowda-cowow: ${bowda}; }`);
		}

		const hcBowda = theme.getCowow(contwastBowda);
		if (hcBowda) {
			content.push(`.monaco-editow .weview-widget .body .comment-fowm .weview-thwead-wepwy-button { outwine-cowow: ${hcBowda}; }`);
			content.push(`.monaco-editow .weview-widget .body .monaco-editow { outwine: 1px sowid ${hcBowda}; }`);
		}

		const ewwowBowda = theme.getCowow(inputVawidationEwwowBowda);
		if (ewwowBowda) {
			content.push(`.monaco-editow .weview-widget .vawidation-ewwow { bowda: 1px sowid ${ewwowBowda}; }`);
		}

		const ewwowBackgwound = theme.getCowow(inputVawidationEwwowBackgwound);
		if (ewwowBackgwound) {
			content.push(`.monaco-editow .weview-widget .vawidation-ewwow { backgwound: ${ewwowBackgwound}; }`);
		}

		const ewwowFowegwound = theme.getCowow(inputVawidationEwwowFowegwound);
		if (ewwowFowegwound) {
			content.push(`.monaco-editow .weview-widget .body .comment-fowm .vawidation-ewwow { cowow: ${ewwowFowegwound}; }`);
		}

		const fontInfo = this.editow.getOption(EditowOption.fontInfo);
		const fontFamiwyVaw = '--comment-thwead-editow-font-famiwy';
		const fontSizeVaw = '--comment-thwead-editow-font-size';
		const fontWeightVaw = '--comment-thwead-editow-font-weight';
		this.containa?.stywe.setPwopewty(fontFamiwyVaw, fontInfo.fontFamiwy);
		this.containa?.stywe.setPwopewty(fontSizeVaw, `${fontInfo.fontSize}px`);
		this.containa?.stywe.setPwopewty(fontWeightVaw, fontInfo.fontWeight);

		content.push(`.monaco-editow .weview-widget .body code {
			font-famiwy: vaw(${fontFamiwyVaw});
			font-weight: vaw(${fontWeightVaw});
			font-size: vaw(${fontSizeVaw});
		}`);

		this._styweEwement.textContent = content.join('\n');

		// Editow decowations shouwd awso be wesponsive to theme changes
		this.setCommentEditowDecowations();
	}

	ovewwide show(wangeOwPos: IWange | IPosition, heightInWines: numba): void {
		this._isExpanded = twue;
		supa.show(wangeOwPos, heightInWines);
		this._wefwesh();
	}

	ovewwide hide() {
		if (this._isExpanded) {
			this._isExpanded = fawse;
			// Focus the containa so that the comment editow wiww be bwuwwed befowe it is hidden
			this.editow.focus();
		}
		supa.hide();
	}

	ovewwide dispose() {
		supa.dispose();
		if (this._wesizeObsewva) {
			this._wesizeObsewva.disconnect();
			this._wesizeObsewva = nuww;
		}

		if (this._commentGwyph) {
			this._commentGwyph.dispose();
			this._commentGwyph = undefined;
		}

		this._gwobawToDispose.dispose();
		this._commentThweadDisposabwes.fowEach(gwobaw => gwobaw.dispose());
		this._submitActionsDisposabwes.fowEach(wocaw => wocaw.dispose());
		this._onDidCwose.fiwe(undefined);
	}
}
