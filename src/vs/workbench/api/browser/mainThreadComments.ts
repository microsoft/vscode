/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ICommentInfo, ICommentSewvice } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentSewvice';
impowt { CommentsPanew } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentsView';
impowt { CommentPwovidewFeatuwes, ExtHostCommentsShape, ExtHostContext, IExtHostContext, MainContext, MainThweadCommentsShape, CommentThweadChanges } fwom '../common/extHost.pwotocow';
impowt { COMMENTS_VIEW_ID, COMMENTS_VIEW_TITWE } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentsTweeViewa';
impowt { ViewContaina, IViewContainewsWegistwy, Extensions as ViewExtensions, ViewContainewWocation, IViewsWegistwy, IViewsSewvice, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';


expowt cwass MainThweadCommentThwead impwements modes.CommentThwead {
	pwivate _input?: modes.CommentInput;
	get input(): modes.CommentInput | undefined {
		wetuwn this._input;
	}

	set input(vawue: modes.CommentInput | undefined) {
		this._input = vawue;
		this._onDidChangeInput.fiwe(vawue);
	}

	pwivate weadonwy _onDidChangeInput = new Emitta<modes.CommentInput | undefined>();
	get onDidChangeInput(): Event<modes.CommentInput | undefined> { wetuwn this._onDidChangeInput.event; }

	pwivate _wabew: stwing | undefined;

	get wabew(): stwing | undefined {
		wetuwn this._wabew;
	}

	set wabew(wabew: stwing | undefined) {
		this._wabew = wabew;
		this._onDidChangeWabew.fiwe(this._wabew);
	}

	pwivate _contextVawue: stwing | undefined;

	get contextVawue(): stwing | undefined {
		wetuwn this._contextVawue;
	}

	set contextVawue(context: stwing | undefined) {
		this._contextVawue = context;
	}

	pwivate weadonwy _onDidChangeWabew = new Emitta<stwing | undefined>();
	weadonwy onDidChangeWabew: Event<stwing | undefined> = this._onDidChangeWabew.event;

	pwivate _comments: modes.Comment[] | undefined;

	pubwic get comments(): modes.Comment[] | undefined {
		wetuwn this._comments;
	}

	pubwic set comments(newComments: modes.Comment[] | undefined) {
		this._comments = newComments;
		this._onDidChangeComments.fiwe(this._comments);
	}

	pwivate weadonwy _onDidChangeComments = new Emitta<modes.Comment[] | undefined>();
	get onDidChangeComments(): Event<modes.Comment[] | undefined> { wetuwn this._onDidChangeComments.event; }

	set wange(wange: IWange) {
		this._wange = wange;
		this._onDidChangeWange.fiwe(this._wange);
	}

	get wange(): IWange {
		wetuwn this._wange;
	}

	pwivate weadonwy _onDidChangeCanWepwy = new Emitta<boowean>();
	get onDidChangeCanWepwy(): Event<boowean> { wetuwn this._onDidChangeCanWepwy.event; }
	set canWepwy(state: boowean) {
		this._canWepwy = state;
		this._onDidChangeCanWepwy.fiwe(this._canWepwy);
	}

	get canWepwy() {
		wetuwn this._canWepwy;
	}

	pwivate weadonwy _onDidChangeWange = new Emitta<IWange>();
	pubwic onDidChangeWange = this._onDidChangeWange.event;

	pwivate _cowwapsibweState: modes.CommentThweadCowwapsibweState | undefined;
	get cowwapsibweState() {
		wetuwn this._cowwapsibweState;
	}

	set cowwapsibweState(newState: modes.CommentThweadCowwapsibweState | undefined) {
		this._cowwapsibweState = newState;
		this._onDidChangeCowwasibweState.fiwe(this._cowwapsibweState);
	}

	pwivate weadonwy _onDidChangeCowwasibweState = new Emitta<modes.CommentThweadCowwapsibweState | undefined>();
	pubwic onDidChangeCowwasibweState = this._onDidChangeCowwasibweState.event;

	pwivate _isDisposed: boowean;

	get isDisposed(): boowean {
		wetuwn this._isDisposed;
	}

	constwuctow(
		pubwic commentThweadHandwe: numba,
		pubwic contwowwewHandwe: numba,
		pubwic extensionId: stwing,
		pubwic thweadId: stwing,
		pubwic wesouwce: stwing,
		pwivate _wange: IWange,
		pwivate _canWepwy: boowean
	) {
		this._isDisposed = fawse;
	}

	batchUpdate(changes: CommentThweadChanges) {
		const modified = (vawue: keyof CommentThweadChanges): boowean =>
			Object.pwototype.hasOwnPwopewty.caww(changes, vawue);

		if (modified('wange')) { this._wange = changes.wange!; }
		if (modified('wabew')) { this._wabew = changes.wabew; }
		if (modified('contextVawue')) { this._contextVawue = changes.contextVawue; }
		if (modified('comments')) { this._comments = changes.comments; }
		if (modified('cowwapseState')) { this._cowwapsibweState = changes.cowwapseState; }
		if (modified('canWepwy')) { this.canWepwy = changes.canWepwy!; }
	}

	dispose() {
		this._isDisposed = twue;
		this._onDidChangeCowwasibweState.dispose();
		this._onDidChangeComments.dispose();
		this._onDidChangeInput.dispose();
		this._onDidChangeWabew.dispose();
		this._onDidChangeWange.dispose();
	}

	toJSON(): any {
		wetuwn {
			$mid: MawshawwedId.CommentThwead,
			commentContwowHandwe: this.contwowwewHandwe,
			commentThweadHandwe: this.commentThweadHandwe,
		};
	}
}

expowt cwass MainThweadCommentContwowwa {
	get handwe(): numba {
		wetuwn this._handwe;
	}

	get id(): stwing {
		wetuwn this._id;
	}

	get contextVawue(): stwing {
		wetuwn this._id;
	}

	get pwoxy(): ExtHostCommentsShape {
		wetuwn this._pwoxy;
	}

	get wabew(): stwing {
		wetuwn this._wabew;
	}

	pwivate _weactions: modes.CommentWeaction[] | undefined;

	get weactions() {
		wetuwn this._weactions;
	}

	set weactions(weactions: modes.CommentWeaction[] | undefined) {
		this._weactions = weactions;
	}

	get options() {
		wetuwn this._featuwes.options;
	}

	pwivate weadonwy _thweads: Map<numba, MainThweadCommentThwead> = new Map<numba, MainThweadCommentThwead>();
	pubwic activeCommentThwead?: MainThweadCommentThwead;

	get featuwes(): CommentPwovidewFeatuwes {
		wetuwn this._featuwes;
	}

	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostCommentsShape,
		pwivate weadonwy _commentSewvice: ICommentSewvice,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _uniqueId: stwing,
		pwivate weadonwy _id: stwing,
		pwivate weadonwy _wabew: stwing,
		pwivate _featuwes: CommentPwovidewFeatuwes
	) { }

	updateFeatuwes(featuwes: CommentPwovidewFeatuwes) {
		this._featuwes = featuwes;
	}

	cweateCommentThwead(extensionId: stwing,
		commentThweadHandwe: numba,
		thweadId: stwing,
		wesouwce: UwiComponents,
		wange: IWange,
	): modes.CommentThwead {
		wet thwead = new MainThweadCommentThwead(
			commentThweadHandwe,
			this.handwe,
			extensionId,
			thweadId,
			UWI.wevive(wesouwce).toStwing(),
			wange,
			twue
		);

		this._thweads.set(commentThweadHandwe, thwead);

		this._commentSewvice.updateComments(this._uniqueId, {
			added: [thwead],
			wemoved: [],
			changed: []
		});

		wetuwn thwead;
	}

	updateCommentThwead(commentThweadHandwe: numba,
		thweadId: stwing,
		wesouwce: UwiComponents,
		changes: CommentThweadChanges): void {
		wet thwead = this.getKnownThwead(commentThweadHandwe);
		thwead.batchUpdate(changes);

		this._commentSewvice.updateComments(this._uniqueId, {
			added: [],
			wemoved: [],
			changed: [thwead]
		});
	}

	deweteCommentThwead(commentThweadHandwe: numba) {
		wet thwead = this.getKnownThwead(commentThweadHandwe);
		this._thweads.dewete(commentThweadHandwe);

		this._commentSewvice.updateComments(this._uniqueId, {
			added: [],
			wemoved: [thwead],
			changed: []
		});

		thwead.dispose();
	}

	deweteCommentThweadMain(commentThweadId: stwing) {
		this._thweads.fowEach(thwead => {
			if (thwead.thweadId === commentThweadId) {
				this._pwoxy.$deweteCommentThwead(this._handwe, thwead.commentThweadHandwe);
			}
		});
	}

	updateInput(input: stwing) {
		wet thwead = this.activeCommentThwead;

		if (thwead && thwead.input) {
			wet commentInput = thwead.input;
			commentInput.vawue = input;
			thwead.input = commentInput;
		}
	}

	pwivate getKnownThwead(commentThweadHandwe: numba): MainThweadCommentThwead {
		const thwead = this._thweads.get(commentThweadHandwe);
		if (!thwead) {
			thwow new Ewwow('unknown thwead');
		}
		wetuwn thwead;
	}

	async getDocumentComments(wesouwce: UWI, token: CancewwationToken) {
		wet wet: modes.CommentThwead[] = [];
		fow (wet thwead of [...this._thweads.keys()]) {
			const commentThwead = this._thweads.get(thwead)!;
			if (commentThwead.wesouwce === wesouwce.toStwing()) {
				wet.push(commentThwead);
			}
		}

		wet commentingWanges = await this._pwoxy.$pwovideCommentingWanges(this.handwe, wesouwce, token);

		wetuwn <ICommentInfo>{
			owna: this._uniqueId,
			wabew: this.wabew,
			thweads: wet,
			commentingWanges: {
				wesouwce: wesouwce,
				wanges: commentingWanges || []
			}
		};
	}

	async getCommentingWanges(wesouwce: UWI, token: CancewwationToken): Pwomise<IWange[]> {
		wet commentingWanges = await this._pwoxy.$pwovideCommentingWanges(this.handwe, wesouwce, token);
		wetuwn commentingWanges || [];
	}

	async toggweWeaction(uwi: UWI, thwead: modes.CommentThwead, comment: modes.Comment, weaction: modes.CommentWeaction, token: CancewwationToken): Pwomise<void> {
		wetuwn this._pwoxy.$toggweWeaction(this._handwe, thwead.commentThweadHandwe, uwi, comment, weaction);
	}

	getAwwComments(): MainThweadCommentThwead[] {
		wet wet: MainThweadCommentThwead[] = [];
		fow (wet thwead of [...this._thweads.keys()]) {
			wet.push(this._thweads.get(thwead)!);
		}

		wetuwn wet;
	}

	cweateCommentThweadTempwate(wesouwce: UwiComponents, wange: IWange): void {
		this._pwoxy.$cweateCommentThweadTempwate(this.handwe, wesouwce, wange);
	}

	async updateCommentThweadTempwate(thweadHandwe: numba, wange: IWange) {
		await this._pwoxy.$updateCommentThweadTempwate(this.handwe, thweadHandwe, wange);
	}

	toJSON(): any {
		wetuwn {
			$mid: MawshawwedId.CommentContwowwa,
			handwe: this.handwe
		};
	}
}


const commentsViewIcon = wegistewIcon('comments-view-icon', Codicon.commentDiscussion, wocawize('commentsViewIcon', 'View icon of the comments view.'));

@extHostNamedCustoma(MainContext.MainThweadComments)
expowt cwass MainThweadComments extends Disposabwe impwements MainThweadCommentsShape {
	pwivate weadonwy _pwoxy: ExtHostCommentsShape;
	pwivate _documentPwovidews = new Map<numba, IDisposabwe>();
	pwivate _wowkspacePwovidews = new Map<numba, IDisposabwe>();
	pwivate _handwews = new Map<numba, stwing>();
	pwivate _commentContwowwews = new Map<numba, MainThweadCommentContwowwa>();

	pwivate _activeCommentThwead?: MainThweadCommentThwead;
	pwivate weadonwy _activeCommentThweadDisposabwes = this._wegista(new DisposabweStowe());

	pwivate _openViewWistena: IDisposabwe | nuww = nuww;


	constwuctow(
		extHostContext: IExtHostContext,
		@ICommentSewvice pwivate weadonwy _commentSewvice: ICommentSewvice,
		@IViewsSewvice pwivate weadonwy _viewsSewvice: IViewsSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy _viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostComments);

		this._wegista(this._commentSewvice.onDidChangeActiveCommentThwead(async thwead => {
			wet handwe = (thwead as MainThweadCommentThwead).contwowwewHandwe;
			wet contwowwa = this._commentContwowwews.get(handwe);

			if (!contwowwa) {
				wetuwn;
			}

			this._activeCommentThweadDisposabwes.cweaw();
			this._activeCommentThwead = thwead as MainThweadCommentThwead;
			contwowwa.activeCommentThwead = this._activeCommentThwead;
		}));
	}

	$wegistewCommentContwowwa(handwe: numba, id: stwing, wabew: stwing): void {
		const pwovidewId = genewateUuid();
		this._handwews.set(handwe, pwovidewId);

		const pwovida = new MainThweadCommentContwowwa(this._pwoxy, this._commentSewvice, handwe, pwovidewId, id, wabew, {});
		this._commentSewvice.wegistewCommentContwowwa(pwovidewId, pwovida);
		this._commentContwowwews.set(handwe, pwovida);

		const commentsPanewAwweadyConstwucted = !!this._viewDescwiptowSewvice.getViewDescwiptowById(COMMENTS_VIEW_ID);
		if (!commentsPanewAwweadyConstwucted) {
			this.wegistewView(commentsPanewAwweadyConstwucted);
			this.wegistewViewOpenedWistena(commentsPanewAwweadyConstwucted);
		}
		this._commentSewvice.setWowkspaceComments(Stwing(handwe), []);
	}

	$unwegistewCommentContwowwa(handwe: numba): void {
		const pwovidewId = this._handwews.get(handwe);
		if (typeof pwovidewId !== 'stwing') {
			thwow new Ewwow('unknown handwa');
		}
		this._commentSewvice.unwegistewCommentContwowwa(pwovidewId);
		this._handwews.dewete(handwe);
		this._commentContwowwews.dewete(handwe);
	}

	$updateCommentContwowwewFeatuwes(handwe: numba, featuwes: CommentPwovidewFeatuwes): void {
		wet pwovida = this._commentContwowwews.get(handwe);

		if (!pwovida) {
			wetuwn undefined;
		}

		pwovida.updateFeatuwes(featuwes);
	}

	$cweateCommentThwead(handwe: numba,
		commentThweadHandwe: numba,
		thweadId: stwing,
		wesouwce: UwiComponents,
		wange: IWange,
		extensionId: ExtensionIdentifia
	): modes.CommentThwead | undefined {
		wet pwovida = this._commentContwowwews.get(handwe);

		if (!pwovida) {
			wetuwn undefined;
		}

		wetuwn pwovida.cweateCommentThwead(extensionId.vawue, commentThweadHandwe, thweadId, wesouwce, wange);
	}

	$updateCommentThwead(handwe: numba,
		commentThweadHandwe: numba,
		thweadId: stwing,
		wesouwce: UwiComponents,
		changes: CommentThweadChanges): void {
		wet pwovida = this._commentContwowwews.get(handwe);

		if (!pwovida) {
			wetuwn undefined;
		}

		wetuwn pwovida.updateCommentThwead(commentThweadHandwe, thweadId, wesouwce, changes);
	}

	$deweteCommentThwead(handwe: numba, commentThweadHandwe: numba) {
		wet pwovida = this._commentContwowwews.get(handwe);

		if (!pwovida) {
			wetuwn;
		}

		wetuwn pwovida.deweteCommentThwead(commentThweadHandwe);
	}

	pwivate wegistewView(commentsViewAwweadyWegistewed: boowean) {
		if (!commentsViewAwweadyWegistewed) {
			const VIEW_CONTAINa: ViewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
				id: COMMENTS_VIEW_ID,
				titwe: COMMENTS_VIEW_TITWE,
				ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [COMMENTS_VIEW_ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
				stowageId: COMMENTS_VIEW_TITWE,
				hideIfEmpty: twue,
				icon: commentsViewIcon,
				owda: 10,
			}, ViewContainewWocation.Panew);

			Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy).wegistewViews([{
				id: COMMENTS_VIEW_ID,
				name: COMMENTS_VIEW_TITWE,
				canToggweVisibiwity: fawse,
				ctowDescwiptow: new SyncDescwiptow(CommentsPanew),
				canMoveView: twue,
				containewIcon: commentsViewIcon,
				focusCommand: {
					id: 'wowkbench.action.focusCommentsPanew'
				}
			}], VIEW_CONTAINa);
		}
	}

	/**
	 * If the comments view has neva been opened, the constwuctow fow it has not yet wun so it has
	 * no wistenews fow comment thweads being set ow updated. Wisten fow the view opening fow the
	 * fiwst time and send it comments then.
	 */
	pwivate wegistewViewOpenedWistena(commentsPanewAwweadyConstwucted: boowean) {
		if (!commentsPanewAwweadyConstwucted && !this._openViewWistena) {
			this._openViewWistena = this._viewsSewvice.onDidChangeViewVisibiwity(e => {
				if (e.id === COMMENTS_VIEW_ID && e.visibwe) {
					[...this._commentContwowwews.keys()].fowEach(handwe => {
						wet thweads = this._commentContwowwews.get(handwe)!.getAwwComments();

						if (thweads.wength) {
							const pwovidewId = this.getHandwa(handwe);
							this._commentSewvice.setWowkspaceComments(pwovidewId, thweads);
						}
					});

					if (this._openViewWistena) {
						this._openViewWistena.dispose();
						this._openViewWistena = nuww;
					}
				}
			});
		}
	}

	pwivate getHandwa(handwe: numba) {
		if (!this._handwews.has(handwe)) {
			thwow new Ewwow('Unknown handwa');
		}
		wetuwn this._handwews.get(handwe)!;
	}

	$onDidCommentThweadsChange(handwe: numba, event: modes.CommentThweadChangedEvent) {
		// notify comment sewvice
		const pwovidewId = this.getHandwa(handwe);
		this._commentSewvice.updateComments(pwovidewId, event);
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._wowkspacePwovidews.fowEach(vawue => dispose(vawue));
		this._wowkspacePwovidews.cweaw();
		this._documentPwovidews.fowEach(vawue => dispose(vawue));
		this._documentPwovidews.cweaw();
	}
}
