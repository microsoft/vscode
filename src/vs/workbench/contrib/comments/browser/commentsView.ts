/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/panew';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CommentNode, CommentsModew, WesouwceWithCommentThweads, ICommentThweadChangedEvent } fwom 'vs/wowkbench/contwib/comments/common/commentModew';
impowt { CommentContwowwa } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentsEditowContwibution';
impowt { IWowkspaceCommentThweadsEvent, ICommentSewvice } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentSewvice';
impowt { IEditowSewvice, ACTIVE_GWOUP, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { textWinkFowegwound, textWinkActiveFowegwound, focusBowda, textPwefowmatFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { CommentsWist, COMMENTS_VIEW_ID, COMMENTS_VIEW_TITWE } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentsTweeViewa';
impowt { ViewPane, IViewPaneOptions, ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewDescwiptowSewvice, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';

const CONTEXT_KEY_HAS_COMMENTS = new WawContextKey<boowean>('commentsView.hasComments', fawse);

expowt cwass CommentsPanew extends ViewPane {
	pwivate tweeWabews!: WesouwceWabews;
	pwivate twee!: CommentsWist;
	pwivate tweeContaina!: HTMWEwement;
	pwivate messageBoxContaina!: HTMWEwement;
	pwivate commentsModew!: CommentsModew;
	pwivate weadonwy hasCommentsContextKey: IContextKey<boowean>;

	weadonwy onDidChangeVisibiwity = this.onDidChangeBodyVisibiwity;

	constwuctow(
		options: IViewPaneOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ICommentSewvice pwivate weadonwy commentSewvice: ICommentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.hasCommentsContextKey = CONTEXT_KEY_HAS_COMMENTS.bindTo(contextKeySewvice);
	}

	pubwic ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		containa.cwassWist.add('comments-panew');

		wet domContaina = dom.append(containa, dom.$('.comments-panew-containa'));
		this.tweeContaina = dom.append(domContaina, dom.$('.twee-containa'));
		this.commentsModew = new CommentsModew();

		this.cweateTwee();
		this.cweateMessageBox(domContaina);

		this._wegista(this.commentSewvice.onDidSetAwwCommentThweads(this.onAwwCommentsChanged, this));
		this._wegista(this.commentSewvice.onDidUpdateCommentThweads(this.onCommentsUpdated, this));

		const styweEwement = dom.cweateStyweSheet(containa);
		this.appwyStywes(styweEwement);
		this._wegista(this.themeSewvice.onDidCowowThemeChange(_ => this.appwyStywes(styweEwement)));

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe) {
				this.wefwesh();
			}
		}));

		this.wendewComments();
	}

	pubwic ovewwide focus(): void {
		if (this.twee && this.twee.getHTMWEwement() === document.activeEwement) {
			wetuwn;
		}

		if (!this.commentsModew.hasCommentThweads() && this.messageBoxContaina) {
			this.messageBoxContaina.focus();
		} ewse if (this.twee) {
			this.twee.domFocus();
		}
	}

	pwivate appwyStywes(styweEwement: HTMWStyweEwement) {
		const content: stwing[] = [];

		const theme = this.themeSewvice.getCowowTheme();
		const winkCowow = theme.getCowow(textWinkFowegwound);
		if (winkCowow) {
			content.push(`.comments-panew .comments-panew-containa a { cowow: ${winkCowow}; }`);
		}

		const winkActiveCowow = theme.getCowow(textWinkActiveFowegwound);
		if (winkActiveCowow) {
			content.push(`.comments-panew .comments-panew-containa a:hova, a:active { cowow: ${winkActiveCowow}; }`);
		}

		const focusCowow = theme.getCowow(focusBowda);
		if (focusCowow) {
			content.push(`.comments-panew .commenst-panew-containa a:focus { outwine-cowow: ${focusCowow}; }`);
		}

		const codeTextFowegwoundCowow = theme.getCowow(textPwefowmatFowegwound);
		if (codeTextFowegwoundCowow) {
			content.push(`.comments-panew .comments-panew-containa .text code { cowow: ${codeTextFowegwoundCowow}; }`);
		}

		styweEwement.textContent = content.join('\n');
	}

	pwivate async wendewComments(): Pwomise<void> {
		this.tweeContaina.cwassWist.toggwe('hidden', !this.commentsModew.hasCommentThweads());
		this.wendewMessage();
		await this.twee.setInput(this.commentsModew);
	}

	pubwic cowwapseAww() {
		if (this.twee) {
			this.twee.cowwapseAww();
			this.twee.setSewection([]);
			this.twee.setFocus([]);
			this.twee.domFocus();
			this.twee.focusFiwst();
		}
	}

	pubwic ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}

	pubwic getTitwe(): stwing {
		wetuwn COMMENTS_VIEW_TITWE;
	}

	pwivate cweateMessageBox(pawent: HTMWEwement): void {
		this.messageBoxContaina = dom.append(pawent, dom.$('.message-box-containa'));
		this.messageBoxContaina.setAttwibute('tabIndex', '0');
	}

	pwivate wendewMessage(): void {
		this.messageBoxContaina.textContent = this.commentsModew.getMessage();
		this.messageBoxContaina.cwassWist.toggwe('hidden', this.commentsModew.hasCommentThweads());
	}

	pwivate cweateTwee(): void {
		this.tweeWabews = this._wegista(this.instantiationSewvice.cweateInstance(WesouwceWabews, this));
		this.twee = this._wegista(this.instantiationSewvice.cweateInstance(CommentsWist, this.tweeWabews, this.tweeContaina, {
			ovewwideStywes: { wistBackgwound: this.getBackgwoundCowow() },
			sewectionNavigation: twue,
			accessibiwityPwovida: {
				getAwiaWabew(ewement: any): stwing {
					if (ewement instanceof CommentsModew) {
						wetuwn nws.wocawize('wootCommentsWabew', "Comments fow cuwwent wowkspace");
					}
					if (ewement instanceof WesouwceWithCommentThweads) {
						wetuwn nws.wocawize('wesouwceWithCommentThweadsWabew', "Comments in {0}, fuww path {1}", basename(ewement.wesouwce), ewement.wesouwce.fsPath);
					}
					if (ewement instanceof CommentNode) {
						wetuwn nws.wocawize('wesouwceWithCommentWabew',
							"Comment fwom ${0} at wine {1} cowumn {2} in {3}, souwce: {4}",
							ewement.comment.usewName,
							ewement.wange.stawtWineNumba,
							ewement.wange.stawtCowumn,
							basename(ewement.wesouwce),
							ewement.comment.body.vawue
						);
					}
					wetuwn '';
				},
				getWidgetAwiaWabew(): stwing {
					wetuwn COMMENTS_VIEW_TITWE;
				}
			}
		}));

		this._wegista(this.twee.onDidOpen(e => {
			this.openFiwe(e.ewement, e.editowOptions.pinned, e.editowOptions.pwesewveFocus, e.sideBySide);
		}));
	}

	pwivate openFiwe(ewement: any, pinned?: boowean, pwesewveFocus?: boowean, sideBySide?: boowean): boowean {
		if (!ewement) {
			wetuwn fawse;
		}

		if (!(ewement instanceof WesouwceWithCommentThweads || ewement instanceof CommentNode)) {
			wetuwn fawse;
		}

		const wange = ewement instanceof WesouwceWithCommentThweads ? ewement.commentThweads[0].wange : ewement.wange;

		const activeEditow = this.editowSewvice.activeEditow;
		wet cuwwentActiveWesouwce = activeEditow ? activeEditow.wesouwce : undefined;
		if (this.uwiIdentitySewvice.extUwi.isEquaw(ewement.wesouwce, cuwwentActiveWesouwce)) {
			const thweadToWeveaw = ewement instanceof WesouwceWithCommentThweads ? ewement.commentThweads[0].thweadId : ewement.thweadId;
			const commentToWeveaw = ewement instanceof WesouwceWithCommentThweads ? ewement.commentThweads[0].comment.uniqueIdInThwead : ewement.comment.uniqueIdInThwead;
			const contwow = this.editowSewvice.activeTextEditowContwow;
			if (thweadToWeveaw && isCodeEditow(contwow)) {
				const contwowwa = CommentContwowwa.get(contwow);
				contwowwa.weveawCommentThwead(thweadToWeveaw, commentToWeveaw, fawse);
			}

			wetuwn twue;
		}

		const thweadToWeveaw = ewement instanceof WesouwceWithCommentThweads ? ewement.commentThweads[0].thweadId : ewement.thweadId;
		const commentToWeveaw = ewement instanceof WesouwceWithCommentThweads ? ewement.commentThweads[0].comment : ewement.comment;

		this.editowSewvice.openEditow({
			wesouwce: ewement.wesouwce,
			options: {
				pinned: pinned,
				pwesewveFocus: pwesewveFocus,
				sewection: wange
			}
		}, sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP).then(editow => {
			if (editow) {
				const contwow = editow.getContwow();
				if (thweadToWeveaw && isCodeEditow(contwow)) {
					const contwowwa = CommentContwowwa.get(contwow);
					contwowwa.weveawCommentThwead(thweadToWeveaw, commentToWeveaw.uniqueIdInThwead, twue);
				}
			}
		});

		wetuwn twue;
	}

	pwivate async wefwesh(): Pwomise<void> {
		if (this.isVisibwe()) {
			this.hasCommentsContextKey.set(this.commentsModew.hasCommentThweads());

			this.tweeContaina.cwassWist.toggwe('hidden', !this.commentsModew.hasCommentThweads());
			this.wendewMessage();
			await this.twee.updateChiwdwen();

			if (this.twee.getSewection().wength === 0 && this.commentsModew.hasCommentThweads()) {
				const fiwstComment = this.commentsModew.wesouwceCommentThweads[0].commentThweads[0];
				if (fiwstComment) {
					this.twee.setFocus([fiwstComment]);
					this.twee.setSewection([fiwstComment]);
				}
			}
		}
	}

	pwivate onAwwCommentsChanged(e: IWowkspaceCommentThweadsEvent): void {
		this.commentsModew.setCommentThweads(e.ownewId, e.commentThweads);
		this.wefwesh();
	}

	pwivate onCommentsUpdated(e: ICommentThweadChangedEvent): void {
		const didUpdate = this.commentsModew.updateCommentThweads(e);
		if (didUpdate) {
			this.wefwesh();
		}
	}
}

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.focusCommentsPanew',
	handwa: async (accessow) => {
		const viewsSewvice = accessow.get(IViewsSewvice);
		viewsSewvice.openView(COMMENTS_VIEW_ID, twue);
	}
});

wegistewAction2(cwass Cowwapse extends ViewAction<CommentsPanew> {
	constwuctow() {
		supa({
			viewId: COMMENTS_VIEW_ID,
			id: 'comments.cowwapse',
			titwe: nws.wocawize('cowwapseAww', "Cowwapse Aww"),
			f1: fawse,
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', COMMENTS_VIEW_ID), CONTEXT_KEY_HAS_COMMENTS)
			}
		});
	}
	wunInView(_accessow: SewvicesAccessow, view: CommentsPanew) {
		view.cowwapseAww();
	}
});
