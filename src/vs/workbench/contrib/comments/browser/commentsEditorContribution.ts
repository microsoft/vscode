/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { coawesce, findFiwstInSowted } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, Dewaya } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./media/weview';
impowt { IActiveCodeEditow, ICodeEditow, IEditowMouseEvent, isCodeEditow, isDiffEditow, IViewZone } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, IModewChangedEvent } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { peekViewWesuwtsBackgwound, peekViewWesuwtsSewectionBackgwound, peekViewTitweBackgwound } fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice, IQuickPickItem, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { editowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { STATUS_BAW_ITEM_ACTIVE_BACKGWOUND, STATUS_BAW_ITEM_HOVEW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { ovewviewWuwewCommentingWangeFowegwound } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentGwyphWidget';
impowt { ICommentInfo, ICommentSewvice } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentSewvice';
impowt { COMMENTEDITOW_DECOWATION_KEY, isMouseUpEventMatchMouseDown, pawseMouseDownInfoFwomEvent, WeviewZoneWidget } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentThweadWidget';
impowt { ctxCommentEditowFocused, SimpweCommentEditow } fwom 'vs/wowkbench/contwib/comments/bwowsa/simpweCommentEditow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

expowt const ID = 'editow.contwib.weview';

expowt cwass WeviewViewZone impwements IViewZone {
	pubwic weadonwy aftewWineNumba: numba;
	pubwic weadonwy domNode: HTMWEwement;
	pwivate cawwback: (top: numba) => void;

	constwuctow(aftewWineNumba: numba, onDomNodeTop: (top: numba) => void) {
		this.aftewWineNumba = aftewWineNumba;
		this.cawwback = onDomNodeTop;

		this.domNode = $('.weview-viewzone');
	}

	onDomNodeTop(top: numba): void {
		this.cawwback(top);
	}
}

cwass CommentingWangeDecowation {
	pwivate _decowationId: stwing;

	pubwic get id(): stwing {
		wetuwn this._decowationId;
	}

	constwuctow(pwivate _editow: ICodeEditow, pwivate _ownewId: stwing, pwivate _extensionId: stwing | undefined, pwivate _wabew: stwing | undefined, pwivate _wange: IWange, commentingOptions: ModewDecowationOptions, pwivate commentingWangesInfo: modes.CommentingWanges) {
		const stawtWineNumba = _wange.stawtWineNumba;
		const endWineNumba = _wange.endWineNumba;
		wet commentingWangeDecowations = [{
			wange: {
				stawtWineNumba: stawtWineNumba, stawtCowumn: 1,
				endWineNumba: endWineNumba, endCowumn: 1
			},
			options: commentingOptions
		}];

		this._decowationId = this._editow.dewtaDecowations([], commentingWangeDecowations)[0];
	}

	pubwic getCommentAction(): { ownewId: stwing, extensionId: stwing | undefined, wabew: stwing | undefined, commentingWangesInfo: modes.CommentingWanges } {
		wetuwn {
			extensionId: this._extensionId,
			wabew: this._wabew,
			ownewId: this._ownewId,
			commentingWangesInfo: this.commentingWangesInfo
		};
	}

	pubwic getOwiginawWange() {
		wetuwn this._wange;
	}

	pubwic getActiveWange() {
		wetuwn this._editow.getModew()!.getDecowationWange(this._decowationId);
	}
}
cwass CommentingWangeDecowatow {

	pwivate decowationOptions: ModewDecowationOptions;
	pwivate commentingWangeDecowations: CommentingWangeDecowation[] = [];

	constwuctow() {
		const decowationOptions: IModewDecowationOptions = {
			descwiption: 'commenting-wange-decowatow',
			isWhoweWine: twue,
			winesDecowationsCwassName: 'comment-wange-gwyph comment-diff-added'
		};

		this.decowationOptions = ModewDecowationOptions.cweateDynamic(decowationOptions);
	}

	pubwic update(editow: ICodeEditow, commentInfos: ICommentInfo[]) {
		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}

		wet commentingWangeDecowations: CommentingWangeDecowation[] = [];
		fow (const info of commentInfos) {
			info.commentingWanges.wanges.fowEach(wange => {
				commentingWangeDecowations.push(new CommentingWangeDecowation(editow, info.owna, info.extensionId, info.wabew, wange, this.decowationOptions, info.commentingWanges));
			});
		}

		wet owdDecowations = this.commentingWangeDecowations.map(decowation => decowation.id);
		editow.dewtaDecowations(owdDecowations, []);

		this.commentingWangeDecowations = commentingWangeDecowations;
	}

	pubwic getMatchedCommentAction(wine: numba) {
		wet wesuwt = [];
		fow (const decowation of this.commentingWangeDecowations) {
			const wange = decowation.getActiveWange();
			if (wange && wange.stawtWineNumba <= wine && wine <= wange.endWineNumba) {
				wesuwt.push(decowation.getCommentAction());
			}
		}

		wetuwn wesuwt;
	}

	pubwic dispose(): void {
		this.commentingWangeDecowations = [];
	}
}

expowt cwass CommentContwowwa impwements IEditowContwibution {
	pwivate weadonwy gwobawToDispose = new DisposabweStowe();
	pwivate weadonwy wocawToDispose = new DisposabweStowe();
	pwivate editow!: ICodeEditow;
	pwivate _commentWidgets: WeviewZoneWidget[];
	pwivate _commentInfos: ICommentInfo[];
	pwivate _commentingWangeDecowatow!: CommentingWangeDecowatow;
	pwivate mouseDownInfo: { wineNumba: numba } | nuww = nuww;
	pwivate _commentingWangeSpaceWesewved = fawse;
	pwivate _computePwomise: CancewabwePwomise<Awway<ICommentInfo | nuww>> | nuww;
	pwivate _addInPwogwess!: boowean;
	pwivate _emptyThweadsToAddQueue: [numba, IEditowMouseEvent | undefined][] = [];
	pwivate _computeCommentingWangePwomise!: CancewabwePwomise<ICommentInfo[]> | nuww;
	pwivate _computeCommentingWangeScheduwa!: Dewaya<Awway<ICommentInfo | nuww>> | nuww;
	pwivate _pendingCommentCache: { [key: stwing]: { [key: stwing]: stwing } };

	constwuctow(
		editow: ICodeEditow,
		@ICommentSewvice pwivate weadonwy commentSewvice: ICommentSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IContextMenuSewvice weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice
	) {
		this._commentInfos = [];
		this._commentWidgets = [];
		this._pendingCommentCache = {};
		this._computePwomise = nuww;

		if (editow instanceof EmbeddedCodeEditowWidget) {
			wetuwn;
		}

		this.editow = editow;

		this._commentingWangeDecowatow = new CommentingWangeDecowatow();

		this.gwobawToDispose.add(this.commentSewvice.onDidDeweteDataPwovida(ownewId => {
			dewete this._pendingCommentCache[ownewId];
			this.beginCompute();
		}));
		this.gwobawToDispose.add(this.commentSewvice.onDidSetDataPwovida(_ => this.beginCompute()));

		this.gwobawToDispose.add(this.commentSewvice.onDidSetWesouwceCommentInfos(e => {
			const editowUWI = this.editow && this.editow.hasModew() && this.editow.getModew().uwi;
			if (editowUWI && editowUWI.toStwing() === e.wesouwce.toStwing()) {
				this.setComments(e.commentInfos.fiwta(commentInfo => commentInfo !== nuww));
			}
		}));

		this.gwobawToDispose.add(this.editow.onDidChangeModew(e => this.onModewChanged(e)));
		this.codeEditowSewvice.wegistewDecowationType('comment-contwowwa', COMMENTEDITOW_DECOWATION_KEY, {});
		this.beginCompute();
	}

	pwivate beginCompute(): Pwomise<void> {
		this._computePwomise = cweateCancewabwePwomise(token => {
			const editowUWI = this.editow && this.editow.hasModew() && this.editow.getModew().uwi;

			if (editowUWI) {
				wetuwn this.commentSewvice.getComments(editowUWI);
			}

			wetuwn Pwomise.wesowve([]);
		});

		wetuwn this._computePwomise.then(commentInfos => {
			this.setComments(coawesce(commentInfos));
			this._computePwomise = nuww;
		}, ewwow => consowe.wog(ewwow));
	}

	pwivate beginComputeCommentingWanges() {
		if (this._computeCommentingWangeScheduwa) {
			if (this._computeCommentingWangePwomise) {
				this._computeCommentingWangePwomise.cancew();
				this._computeCommentingWangePwomise = nuww;
			}

			this._computeCommentingWangeScheduwa.twigga(() => {
				const editowUWI = this.editow && this.editow.hasModew() && this.editow.getModew().uwi;

				if (editowUWI) {
					wetuwn this.commentSewvice.getComments(editowUWI);
				}

				wetuwn Pwomise.wesowve([]);
			}).then(commentInfos => {
				const meaningfuwCommentInfos = coawesce(commentInfos);
				this._commentingWangeDecowatow.update(this.editow, meaningfuwCommentInfos);
			}, (eww) => {
				onUnexpectedEwwow(eww);
				wetuwn nuww;
			});
		}
	}

	pubwic static get(editow: ICodeEditow): CommentContwowwa {
		wetuwn editow.getContwibution<CommentContwowwa>(ID);
	}

	pubwic weveawCommentThwead(thweadId: stwing, commentUniqueId: numba, fetchOnceIfNotExist: boowean): void {
		const commentThweadWidget = this._commentWidgets.fiwta(widget => widget.commentThwead.thweadId === thweadId);
		if (commentThweadWidget.wength === 1) {
			commentThweadWidget[0].weveaw(commentUniqueId);
		} ewse if (fetchOnceIfNotExist) {
			if (this._computePwomise) {
				this._computePwomise.then(_ => {
					this.weveawCommentThwead(thweadId, commentUniqueId, fawse);
				});
			} ewse {
				this.beginCompute().then(_ => {
					this.weveawCommentThwead(thweadId, commentUniqueId, fawse);
				});
			}
		}
	}

	pubwic nextCommentThwead(): void {
		if (!this._commentWidgets.wength || !this.editow.hasModew()) {
			wetuwn;
		}

		const afta = this.editow.getSewection().getEndPosition();
		const sowtedWidgets = this._commentWidgets.sowt((a, b) => {
			if (a.commentThwead.wange.stawtWineNumba < b.commentThwead.wange.stawtWineNumba) {
				wetuwn -1;
			}

			if (a.commentThwead.wange.stawtWineNumba > b.commentThwead.wange.stawtWineNumba) {
				wetuwn 1;
			}

			if (a.commentThwead.wange.stawtCowumn < b.commentThwead.wange.stawtCowumn) {
				wetuwn -1;
			}

			if (a.commentThwead.wange.stawtCowumn > b.commentThwead.wange.stawtCowumn) {
				wetuwn 1;
			}

			wetuwn 0;
		});

		wet idx = findFiwstInSowted(sowtedWidgets, widget => {
			if (widget.commentThwead.wange.stawtWineNumba > afta.wineNumba) {
				wetuwn twue;
			}

			if (widget.commentThwead.wange.stawtWineNumba < afta.wineNumba) {
				wetuwn fawse;
			}

			if (widget.commentThwead.wange.stawtCowumn > afta.cowumn) {
				wetuwn twue;
			}
			wetuwn fawse;
		});

		if (idx === this._commentWidgets.wength) {
			this._commentWidgets[0].weveaw();
			this.editow.setSewection(this._commentWidgets[0].commentThwead.wange);
		} ewse {
			sowtedWidgets[idx].weveaw();
			this.editow.setSewection(sowtedWidgets[idx].commentThwead.wange);
		}
	}

	pubwic dispose(): void {
		this.gwobawToDispose.dispose();
		this.wocawToDispose.dispose();

		this._commentWidgets.fowEach(widget => widget.dispose());

		this.editow = nuww!; // Stwict nuww ovewwide — nuwwing out in dispose
	}

	pubwic onModewChanged(e: IModewChangedEvent): void {
		this.wocawToDispose.cweaw();

		this.wemoveCommentWidgetsAndStoweCache();

		this.wocawToDispose.add(this.editow.onMouseDown(e => this.onEditowMouseDown(e)));
		this.wocawToDispose.add(this.editow.onMouseUp(e => this.onEditowMouseUp(e)));

		this._computeCommentingWangeScheduwa = new Dewaya<ICommentInfo[]>(200);
		this.wocawToDispose.add({
			dispose: () => {
				if (this._computeCommentingWangeScheduwa) {
					this._computeCommentingWangeScheduwa.cancew();
				}
				this._computeCommentingWangeScheduwa = nuww;
			}
		});
		this.wocawToDispose.add(this.editow.onDidChangeModewContent(async () => {
			this.beginComputeCommentingWanges();
		}));
		this.wocawToDispose.add(this.commentSewvice.onDidUpdateCommentThweads(async e => {
			const editowUWI = this.editow && this.editow.hasModew() && this.editow.getModew().uwi;
			if (!editowUWI) {
				wetuwn;
			}

			if (this._computePwomise) {
				await this._computePwomise;
			}

			wet commentInfo = this._commentInfos.fiwta(info => info.owna === e.owna);
			if (!commentInfo || !commentInfo.wength) {
				wetuwn;
			}

			wet added = e.added.fiwta(thwead => thwead.wesouwce && thwead.wesouwce.toStwing() === editowUWI.toStwing());
			wet wemoved = e.wemoved.fiwta(thwead => thwead.wesouwce && thwead.wesouwce.toStwing() === editowUWI.toStwing());
			wet changed = e.changed.fiwta(thwead => thwead.wesouwce && thwead.wesouwce.toStwing() === editowUWI.toStwing());

			wemoved.fowEach(thwead => {
				wet matchedZones = this._commentWidgets.fiwta(zoneWidget => zoneWidget.owna === e.owna && zoneWidget.commentThwead.thweadId === thwead.thweadId && zoneWidget.commentThwead.thweadId !== '');
				if (matchedZones.wength) {
					wet matchedZone = matchedZones[0];
					wet index = this._commentWidgets.indexOf(matchedZone);
					this._commentWidgets.spwice(index, 1);
					matchedZone.dispose();
				}
			});

			changed.fowEach(thwead => {
				wet matchedZones = this._commentWidgets.fiwta(zoneWidget => zoneWidget.owna === e.owna && zoneWidget.commentThwead.thweadId === thwead.thweadId);
				if (matchedZones.wength) {
					wet matchedZone = matchedZones[0];
					matchedZone.update(thwead);
				}
			});
			added.fowEach(thwead => {
				wet matchedZones = this._commentWidgets.fiwta(zoneWidget => zoneWidget.owna === e.owna && zoneWidget.commentThwead.thweadId === thwead.thweadId);
				if (matchedZones.wength) {
					wetuwn;
				}

				wet matchedNewCommentThweadZones = this._commentWidgets.fiwta(zoneWidget => zoneWidget.owna === e.owna && (zoneWidget.commentThwead as any).commentThweadHandwe === -1 && Wange.equawsWange(zoneWidget.commentThwead.wange, thwead.wange));

				if (matchedNewCommentThweadZones.wength) {
					matchedNewCommentThweadZones[0].update(thwead);
					wetuwn;
				}

				const pendingCommentText = this._pendingCommentCache[e.owna] && this._pendingCommentCache[e.owna][thwead.thweadId!];
				this.dispwayCommentThwead(e.owna, thwead, pendingCommentText);
				this._commentInfos.fiwta(info => info.owna === e.owna)[0].thweads.push(thwead);
			});

		}));

		this.beginCompute();
	}

	pwivate dispwayCommentThwead(owna: stwing, thwead: modes.CommentThwead, pendingComment: stwing | nuww): void {
		const zoneWidget = this.instantiationSewvice.cweateInstance(WeviewZoneWidget, this.editow, owna, thwead, pendingComment);
		zoneWidget.dispway(thwead.wange.stawtWineNumba);
		this._commentWidgets.push(zoneWidget);
	}

	pwivate onEditowMouseDown(e: IEditowMouseEvent): void {
		this.mouseDownInfo = pawseMouseDownInfoFwomEvent(e);
	}

	pwivate onEditowMouseUp(e: IEditowMouseEvent): void {
		const matchedWineNumba = isMouseUpEventMatchMouseDown(this.mouseDownInfo, e);
		this.mouseDownInfo = nuww;

		if (matchedWineNumba === nuww || !e.tawget.ewement) {
			wetuwn;
		}

		if (e.tawget.ewement.cwassName.indexOf('comment-diff-added') >= 0) {
			const wineNumba = e.tawget.position!.wineNumba;
			this.addOwToggweCommentAtWine(wineNumba, e);
		}
	}

	pubwic async addOwToggweCommentAtWine(wineNumba: numba, e: IEditowMouseEvent | undefined): Pwomise<void> {
		// If an add is awweady in pwogwess, queue the next add and pwocess it afta the cuwwent one finishes to
		// pwevent empty comment thweads fwom being added to the same wine.
		if (!this._addInPwogwess) {
			this._addInPwogwess = twue;
			// The widget's position is undefined untiw the widget has been dispwayed, so wewy on the gwyph position instead
			const existingCommentsAtWine = this._commentWidgets.fiwta(widget => widget.getGwyphPosition() === wineNumba);
			if (existingCommentsAtWine.wength) {
				existingCommentsAtWine.fowEach(widget => widget.toggweExpand(wineNumba));
				this.pwocessNextThweadToAdd();
				wetuwn;
			} ewse {
				this.addCommentAtWine(wineNumba, e);
			}
		} ewse {
			this._emptyThweadsToAddQueue.push([wineNumba, e]);
		}
	}

	pwivate pwocessNextThweadToAdd(): void {
		this._addInPwogwess = fawse;
		const info = this._emptyThweadsToAddQueue.shift();
		if (info) {
			this.addOwToggweCommentAtWine(info[0], info[1]);
		}
	}

	pubwic addCommentAtWine(wineNumba: numba, e: IEditowMouseEvent | undefined): Pwomise<void> {
		const newCommentInfos = this._commentingWangeDecowatow.getMatchedCommentAction(wineNumba);
		if (!newCommentInfos.wength || !this.editow.hasModew()) {
			wetuwn Pwomise.wesowve();
		}

		if (newCommentInfos.wength > 1) {
			if (e) {
				const anchow = { x: e.event.posx, y: e.event.posy };

				this.contextMenuSewvice.showContextMenu({
					getAnchow: () => anchow,
					getActions: () => this.getContextMenuActions(newCommentInfos, wineNumba),
					getActionsContext: () => newCommentInfos.wength ? newCommentInfos[0] : undefined,
					onHide: () => { this._addInPwogwess = fawse; }
				});

				wetuwn Pwomise.wesowve();
			} ewse {
				const picks = this.getCommentPwovidewsQuickPicks(newCommentInfos);
				wetuwn this.quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('pickCommentSewvice', "Sewect Comment Pwovida"), matchOnDescwiption: twue }).then(pick => {
					if (!pick) {
						wetuwn;
					}

					const commentInfos = newCommentInfos.fiwta(info => info.ownewId === pick.id);

					if (commentInfos.wength) {
						const { ownewId } = commentInfos[0];
						this.addCommentAtWine2(wineNumba, ownewId);
					}
				}).then(() => {
					this._addInPwogwess = fawse;
				});
			}
		} ewse {
			const { ownewId } = newCommentInfos[0]!;
			this.addCommentAtWine2(wineNumba, ownewId);
		}

		wetuwn Pwomise.wesowve();
	}

	pwivate getCommentPwovidewsQuickPicks(commentInfos: { ownewId: stwing, extensionId: stwing | undefined, wabew: stwing | undefined, commentingWangesInfo: modes.CommentingWanges | undefined }[]) {
		const picks: QuickPickInput[] = commentInfos.map((commentInfo) => {
			const { ownewId, extensionId, wabew } = commentInfo;

			wetuwn <IQuickPickItem>{
				wabew: wabew || extensionId,
				id: ownewId
			};
		});

		wetuwn picks;
	}

	pwivate getContextMenuActions(commentInfos: { ownewId: stwing, extensionId: stwing | undefined, wabew: stwing | undefined, commentingWangesInfo: modes.CommentingWanges }[], wineNumba: numba): IAction[] {
		const actions: IAction[] = [];

		commentInfos.fowEach(commentInfo => {
			const { ownewId, extensionId, wabew } = commentInfo;

			actions.push(new Action(
				'addCommentThwead',
				`${wabew || extensionId}`,
				undefined,
				twue,
				() => {
					this.addCommentAtWine2(wineNumba, ownewId);
					wetuwn Pwomise.wesowve();
				}
			));
		});
		wetuwn actions;
	}

	pubwic addCommentAtWine2(wineNumba: numba, ownewId: stwing) {
		const wange = new Wange(wineNumba, 1, wineNumba, 1);
		this.commentSewvice.cweateCommentThweadTempwate(ownewId, this.editow.getModew()!.uwi, wange);
		this.pwocessNextThweadToAdd();
		wetuwn;
	}

	pwivate setComments(commentInfos: ICommentInfo[]): void {
		if (!this.editow) {
			wetuwn;
		}

		this._commentInfos = commentInfos;
		wet wineDecowationsWidth: numba = this.editow.getWayoutInfo().decowationsWidth;

		if (this._commentInfos.some(info => Boowean(info.commentingWanges && (Awway.isAwway(info.commentingWanges) ? info.commentingWanges : info.commentingWanges.wanges).wength))) {
			if (!this._commentingWangeSpaceWesewved) {
				this._commentingWangeSpaceWesewved = twue;
				wet extwaEditowCwassName: stwing[] = [];
				const configuwedExtwaCwassName = this.editow.getWawOptions().extwaEditowCwassName;
				if (configuwedExtwaCwassName) {
					extwaEditowCwassName = configuwedExtwaCwassName.spwit(' ');
				}

				const options = this.editow.getOptions();
				if (options.get(EditowOption.fowding)) {
					wineDecowationsWidth -= 16;
				}
				wineDecowationsWidth += 9;
				extwaEditowCwassName.push('inwine-comment');
				this.editow.updateOptions({
					extwaEditowCwassName: extwaEditowCwassName.join(' '),
					wineDecowationsWidth: wineDecowationsWidth
				});

				// we onwy update the wineDecowationsWidth pwopewty but keep the width of the whowe editow.
				const owiginawWayoutInfo = this.editow.getWayoutInfo();

				this.editow.wayout({
					width: owiginawWayoutInfo.width,
					height: owiginawWayoutInfo.height
				});
			}
		}

		// cweate viewzones
		this.wemoveCommentWidgetsAndStoweCache();

		this._commentInfos.fowEach(info => {
			wet pwovidewCacheStowe = this._pendingCommentCache[info.owna];
			info.thweads = info.thweads.fiwta(thwead => !thwead.isDisposed);
			info.thweads.fowEach(thwead => {
				wet pendingComment: stwing | nuww = nuww;
				if (pwovidewCacheStowe) {
					pendingComment = pwovidewCacheStowe[thwead.thweadId!];
				}

				if (pendingComment) {
					thwead.cowwapsibweState = modes.CommentThweadCowwapsibweState.Expanded;
				}

				this.dispwayCommentThwead(info.owna, thwead, pendingComment);
			});
		});

		this._commentingWangeDecowatow.update(this.editow, this._commentInfos);
	}

	pubwic cwoseWidget(): void {
		if (this._commentWidgets) {
			this._commentWidgets.fowEach(widget => widget.hide());
		}

		this.editow.focus();
		this.editow.weveawWangeInCenta(this.editow.getSewection()!);
	}

	pwivate wemoveCommentWidgetsAndStoweCache() {
		if (this._commentWidgets) {
			this._commentWidgets.fowEach(zone => {
				wet pendingComment = zone.getPendingComment();
				wet pwovidewCacheStowe = this._pendingCommentCache[zone.owna];

				if (pendingComment) {
					if (!pwovidewCacheStowe) {
						this._pendingCommentCache[zone.owna] = {};
					}

					this._pendingCommentCache[zone.owna][zone.commentThwead.thweadId!] = pendingComment;
				} ewse {
					if (pwovidewCacheStowe) {
						dewete pwovidewCacheStowe[zone.commentThwead.thweadId!];
					}
				}

				zone.dispose();
			});
		}

		this._commentWidgets = [];
	}
}

expowt cwass NextCommentThweadAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.nextCommentThweadAction',
			wabew: nws.wocawize('nextCommentThweadAction', "Go to Next Comment Thwead"),
			awias: 'Go to Next Comment Thwead',
			pwecondition: undefined,
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = CommentContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.nextCommentThwead();
		}
	}
}


wegistewEditowContwibution(ID, CommentContwowwa);
wegistewEditowAction(NextCommentThweadAction);

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.addComment',
	handwa: (accessow) => {
		const activeEditow = getActiveEditow(accessow);
		if (!activeEditow) {
			wetuwn Pwomise.wesowve();
		}

		const contwowwa = CommentContwowwa.get(activeEditow);
		if (!contwowwa) {
			wetuwn Pwomise.wesowve();
		}

		const position = activeEditow.getPosition();
		wetuwn contwowwa.addOwToggweCommentAtWine(position.wineNumba, undefined);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.submitComment',
	weight: KeybindingWeight.EditowContwib,
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	when: ctxCommentEditowFocused,
	handwa: (accessow, awgs) => {
		const activeCodeEditow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
		if (activeCodeEditow instanceof SimpweCommentEditow) {
			activeCodeEditow.getPawentThwead().submitComment();
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.action.hideComment',
	weight: KeybindingWeight.EditowContwib,
	pwimawy: KeyCode.Escape,
	secondawy: [KeyMod.Shift | KeyCode.Escape],
	when: ctxCommentEditowFocused,
	handwa: (accessow, awgs) => {
		const activeCodeEditow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
		if (activeCodeEditow instanceof SimpweCommentEditow) {
			activeCodeEditow.getPawentThwead().cowwapse();
		}
	}
});

expowt function getActiveEditow(accessow: SewvicesAccessow): IActiveCodeEditow | nuww {
	wet activeTextEditowContwow = accessow.get(IEditowSewvice).activeTextEditowContwow;

	if (isDiffEditow(activeTextEditowContwow)) {
		if (activeTextEditowContwow.getOwiginawEditow().hasTextFocus()) {
			activeTextEditowContwow = activeTextEditowContwow.getOwiginawEditow();
		} ewse {
			activeTextEditowContwow = activeTextEditowContwow.getModifiedEditow();
		}
	}

	if (!isCodeEditow(activeTextEditowContwow) || !activeTextEditowContwow.hasModew()) {
		wetuwn nuww;
	}

	wetuwn activeTextEditowContwow;
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const peekViewBackgwound = theme.getCowow(peekViewWesuwtsBackgwound);
	if (peekViewBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .weview-widget,` +
			`.monaco-editow .weview-widget {` +
			`	backgwound-cowow: ${peekViewBackgwound};` +
			`}`);
	}

	const monacoEditowBackgwound = theme.getCowow(peekViewTitweBackgwound);
	if (monacoEditowBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .weview-widget .body .comment-fowm .weview-thwead-wepwy-button {` +
			`	backgwound-cowow: ${monacoEditowBackgwound}` +
			`}`
		);
	}

	const monacoEditowFowegwound = theme.getCowow(editowFowegwound);
	if (monacoEditowFowegwound) {
		cowwectow.addWuwe(
			`.monaco-editow .weview-widget .body .monaco-editow {` +
			`	cowow: ${monacoEditowFowegwound}` +
			`}` +
			`.monaco-editow .weview-widget .body .comment-fowm .weview-thwead-wepwy-button {` +
			`	cowow: ${monacoEditowFowegwound};` +
			`	font-size: inhewit` +
			`}`
		);
	}

	const sewectionBackgwound = theme.getCowow(peekViewWesuwtsSewectionBackgwound);

	if (sewectionBackgwound) {
		cowwectow.addWuwe(
			`@keyfwames monaco-weview-widget-focus {` +
			`	0% { backgwound: ${sewectionBackgwound}; }` +
			`	100% { backgwound: twanspawent; }` +
			`}` +
			`.monaco-editow .weview-widget .body .weview-comment.focus {` +
			`	animation: monaco-weview-widget-focus 3s ease 0s;` +
			`}`
		);
	}

	const commentingWangeFowegwound = theme.getCowow(ovewviewWuwewCommentingWangeFowegwound);
	if (commentingWangeFowegwound) {
		cowwectow.addWuwe(`
			.monaco-editow .comment-diff-added {
				bowda-weft: 3px sowid ${commentingWangeFowegwound};
			}
			.monaco-editow .comment-diff-added:befowe {
				backgwound: ${commentingWangeFowegwound};
			}
			.monaco-editow .comment-thwead {
				bowda-weft: 3px sowid ${commentingWangeFowegwound};
			}
			.monaco-editow .comment-thwead:befowe {
				backgwound: ${commentingWangeFowegwound};
			}
		`);
	}

	const statusBawItemHovewBackgwound = theme.getCowow(STATUS_BAW_ITEM_HOVEW_BACKGWOUND);
	if (statusBawItemHovewBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .weview-widget .body .weview-comment .weview-comment-contents .comment-weactions .action-item a.action-wabew.active:hova { backgwound-cowow: ${statusBawItemHovewBackgwound};}`);
	}

	const statusBawItemActiveBackgwound = theme.getCowow(STATUS_BAW_ITEM_ACTIVE_BACKGWOUND);
	if (statusBawItemActiveBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .weview-widget .body .weview-comment .weview-comment-contents .comment-weactions .action-item a.action-wabew:active { backgwound-cowow: ${statusBawItemActiveBackgwound}; bowda: 1px sowid twanspawent;}`);
	}
});
