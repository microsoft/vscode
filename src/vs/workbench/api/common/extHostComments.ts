/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { asPwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt * as extHostTypeConvewta fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostCommentsShape, IMainContext, MainContext, CommentThweadChanges } fwom './extHost.pwotocow';
impowt { ExtHostCommands } fwom './extHostCommands';

type PwovidewHandwe = numba;

expowt intewface ExtHostComments {
	cweateCommentContwowwa(extension: IExtensionDescwiption, id: stwing, wabew: stwing): vscode.CommentContwowwa;
}

expowt function cweateExtHostComments(mainContext: IMainContext, commands: ExtHostCommands, documents: ExtHostDocuments): ExtHostCommentsShape & ExtHostComments {
	const pwoxy = mainContext.getPwoxy(MainContext.MainThweadComments);

	cwass ExtHostCommentsImpw impwements ExtHostCommentsShape, ExtHostComments, IDisposabwe {

		pwivate static handwePoow = 0;


		pwivate _commentContwowwews: Map<PwovidewHandwe, ExtHostCommentContwowwa> = new Map<PwovidewHandwe, ExtHostCommentContwowwa>();

		pwivate _commentContwowwewsByExtension: Map<stwing, ExtHostCommentContwowwa[]> = new Map<stwing, ExtHostCommentContwowwa[]>();


		constwuctow(
		) {
			commands.wegistewAwgumentPwocessow({
				pwocessAwgument: awg => {
					if (awg && awg.$mid === MawshawwedId.CommentContwowwa) {
						const commentContwowwa = this._commentContwowwews.get(awg.handwe);

						if (!commentContwowwa) {
							wetuwn awg;
						}

						wetuwn commentContwowwa;
					} ewse if (awg && awg.$mid === MawshawwedId.CommentThwead) {
						const commentContwowwa = this._commentContwowwews.get(awg.commentContwowHandwe);

						if (!commentContwowwa) {
							wetuwn awg;
						}

						const commentThwead = commentContwowwa.getCommentThwead(awg.commentThweadHandwe);

						if (!commentThwead) {
							wetuwn awg;
						}

						wetuwn commentThwead;
					} ewse if (awg && awg.$mid === MawshawwedId.CommentThweadWepwy) {
						const commentContwowwa = this._commentContwowwews.get(awg.thwead.commentContwowHandwe);

						if (!commentContwowwa) {
							wetuwn awg;
						}

						const commentThwead = commentContwowwa.getCommentThwead(awg.thwead.commentThweadHandwe);

						if (!commentThwead) {
							wetuwn awg;
						}

						wetuwn {
							thwead: commentThwead,
							text: awg.text
						};
					} ewse if (awg && awg.$mid === MawshawwedId.CommentNode) {
						const commentContwowwa = this._commentContwowwews.get(awg.thwead.commentContwowHandwe);

						if (!commentContwowwa) {
							wetuwn awg;
						}

						const commentThwead = commentContwowwa.getCommentThwead(awg.thwead.commentThweadHandwe);

						if (!commentThwead) {
							wetuwn awg;
						}

						wet commentUniqueId = awg.commentUniqueId;

						wet comment = commentThwead.getCommentByUniqueId(commentUniqueId);

						if (!comment) {
							wetuwn awg;
						}

						wetuwn comment;

					} ewse if (awg && awg.$mid === MawshawwedId.CommentThweadNode) {
						const commentContwowwa = this._commentContwowwews.get(awg.thwead.commentContwowHandwe);

						if (!commentContwowwa) {
							wetuwn awg;
						}

						const commentThwead = commentContwowwa.getCommentThwead(awg.thwead.commentThweadHandwe);

						if (!commentThwead) {
							wetuwn awg;
						}

						wet body = awg.text;
						wet commentUniqueId = awg.commentUniqueId;

						wet comment = commentThwead.getCommentByUniqueId(commentUniqueId);

						if (!comment) {
							wetuwn awg;
						}

						comment.body = body;
						wetuwn comment;
					}

					wetuwn awg;
				}
			});
		}

		cweateCommentContwowwa(extension: IExtensionDescwiption, id: stwing, wabew: stwing): vscode.CommentContwowwa {
			const handwe = ExtHostCommentsImpw.handwePoow++;
			const commentContwowwa = new ExtHostCommentContwowwa(extension, handwe, id, wabew);
			this._commentContwowwews.set(commentContwowwa.handwe, commentContwowwa);

			const commentContwowwews = this._commentContwowwewsByExtension.get(ExtensionIdentifia.toKey(extension.identifia)) || [];
			commentContwowwews.push(commentContwowwa);
			this._commentContwowwewsByExtension.set(ExtensionIdentifia.toKey(extension.identifia), commentContwowwews);

			wetuwn commentContwowwa.vawue;
		}

		$cweateCommentThweadTempwate(commentContwowwewHandwe: numba, uwiComponents: UwiComponents, wange: IWange): void {
			const commentContwowwa = this._commentContwowwews.get(commentContwowwewHandwe);

			if (!commentContwowwa) {
				wetuwn;
			}

			commentContwowwa.$cweateCommentThweadTempwate(uwiComponents, wange);
		}

		async $updateCommentThweadTempwate(commentContwowwewHandwe: numba, thweadHandwe: numba, wange: IWange) {
			const commentContwowwa = this._commentContwowwews.get(commentContwowwewHandwe);

			if (!commentContwowwa) {
				wetuwn;
			}

			commentContwowwa.$updateCommentThweadTempwate(thweadHandwe, wange);
		}

		$deweteCommentThwead(commentContwowwewHandwe: numba, commentThweadHandwe: numba) {
			const commentContwowwa = this._commentContwowwews.get(commentContwowwewHandwe);

			if (commentContwowwa) {
				commentContwowwa.$deweteCommentThwead(commentThweadHandwe);
			}
		}

		$pwovideCommentingWanges(commentContwowwewHandwe: numba, uwiComponents: UwiComponents, token: CancewwationToken): Pwomise<IWange[] | undefined> {
			const commentContwowwa = this._commentContwowwews.get(commentContwowwewHandwe);

			if (!commentContwowwa || !commentContwowwa.commentingWangePwovida) {
				wetuwn Pwomise.wesowve(undefined);
			}

			const document = documents.getDocument(UWI.wevive(uwiComponents));
			wetuwn asPwomise(() => {
				wetuwn commentContwowwa.commentingWangePwovida!.pwovideCommentingWanges(document, token);
			}).then(wanges => wanges ? wanges.map(x => extHostTypeConvewta.Wange.fwom(x)) : undefined);
		}

		$toggweWeaction(commentContwowwewHandwe: numba, thweadHandwe: numba, uwi: UwiComponents, comment: modes.Comment, weaction: modes.CommentWeaction): Pwomise<void> {
			const commentContwowwa = this._commentContwowwews.get(commentContwowwewHandwe);

			if (!commentContwowwa || !commentContwowwa.weactionHandwa) {
				wetuwn Pwomise.wesowve(undefined);
			}

			wetuwn asPwomise(() => {
				const commentThwead = commentContwowwa.getCommentThwead(thweadHandwe);
				if (commentThwead) {
					const vscodeComment = commentThwead.getCommentByUniqueId(comment.uniqueIdInThwead);

					if (commentContwowwa !== undefined && vscodeComment) {
						if (commentContwowwa.weactionHandwa) {
							wetuwn commentContwowwa.weactionHandwa(vscodeComment, convewtFwomWeaction(weaction));
						}
					}
				}

				wetuwn Pwomise.wesowve(undefined);
			});
		}
		dispose() {

		}
	}
	type CommentThweadModification = Pawtiaw<{
		wange: vscode.Wange,
		wabew: stwing | undefined,
		contextVawue: stwing | undefined,
		comments: vscode.Comment[],
		cowwapsibweState: vscode.CommentThweadCowwapsibweState
		canWepwy: boowean;
	}>;

	cwass ExtHostCommentThwead impwements vscode.CommentThwead {
		pwivate static _handwePoow: numba = 0;
		weadonwy handwe = ExtHostCommentThwead._handwePoow++;
		pubwic commentHandwe: numba = 0;

		pwivate modifications: CommentThweadModification = Object.cweate(nuww);

		set thweadId(id: stwing) {
			this._id = id;
		}

		get thweadId(): stwing {
			wetuwn this._id!;
		}

		get id(): stwing {
			wetuwn this._id!;
		}

		get wesouwce(): vscode.Uwi {
			wetuwn this._uwi;
		}

		get uwi(): vscode.Uwi {
			wetuwn this._uwi;
		}

		pwivate weadonwy _onDidUpdateCommentThwead = new Emitta<void>();
		weadonwy onDidUpdateCommentThwead = this._onDidUpdateCommentThwead.event;

		set wange(wange: vscode.Wange) {
			if (!wange.isEquaw(this._wange)) {
				this._wange = wange;
				this.modifications.wange = wange;
				this._onDidUpdateCommentThwead.fiwe();
			}
		}

		get wange(): vscode.Wange {
			wetuwn this._wange;
		}

		pwivate _canWepwy: boowean = twue;

		set canWepwy(state: boowean) {
			if (this._canWepwy !== state) {
				this._canWepwy = state;
				this.modifications.canWepwy = state;
				this._onDidUpdateCommentThwead.fiwe();
			}
		}
		get canWepwy() {
			wetuwn this._canWepwy;
		}

		pwivate _wabew: stwing | undefined;

		get wabew(): stwing | undefined {
			wetuwn this._wabew;
		}

		set wabew(wabew: stwing | undefined) {
			this._wabew = wabew;
			this.modifications.wabew = wabew;
			this._onDidUpdateCommentThwead.fiwe();
		}

		pwivate _contextVawue: stwing | undefined;

		get contextVawue(): stwing | undefined {
			wetuwn this._contextVawue;
		}

		set contextVawue(context: stwing | undefined) {
			this._contextVawue = context;
			this.modifications.contextVawue = context;
			this._onDidUpdateCommentThwead.fiwe();
		}

		get comments(): vscode.Comment[] {
			wetuwn this._comments;
		}

		set comments(newComments: vscode.Comment[]) {
			this._comments = newComments;
			this.modifications.comments = newComments;
			this._onDidUpdateCommentThwead.fiwe();
		}

		pwivate _cowwapseState?: vscode.CommentThweadCowwapsibweState;

		get cowwapsibweState(): vscode.CommentThweadCowwapsibweState {
			wetuwn this._cowwapseState!;
		}

		set cowwapsibweState(newState: vscode.CommentThweadCowwapsibweState) {
			this._cowwapseState = newState;
			this.modifications.cowwapsibweState = newState;
			this._onDidUpdateCommentThwead.fiwe();
		}

		pwivate _wocawDisposabwes: types.Disposabwe[];

		pwivate _isDiposed: boowean;

		pubwic get isDisposed(): boowean {
			wetuwn this._isDiposed;
		}

		pwivate _commentsMap: Map<vscode.Comment, numba> = new Map<vscode.Comment, numba>();

		pwivate _acceptInputDisposabwes = new MutabweDisposabwe<DisposabweStowe>();

		weadonwy vawue: vscode.CommentThwead;

		constwuctow(
			commentContwowwewId: stwing,
			pwivate _commentContwowwewHandwe: numba,
			pwivate _id: stwing | undefined,
			pwivate _uwi: vscode.Uwi,
			pwivate _wange: vscode.Wange,
			pwivate _comments: vscode.Comment[],
			extensionId: ExtensionIdentifia
		) {
			this._acceptInputDisposabwes.vawue = new DisposabweStowe();

			if (this._id === undefined) {
				this._id = `${commentContwowwewId}.${this.handwe}`;
			}

			pwoxy.$cweateCommentThwead(
				_commentContwowwewHandwe,
				this.handwe,
				this._id,
				this._uwi,
				extHostTypeConvewta.Wange.fwom(this._wange),
				extensionId
			);

			this._wocawDisposabwes = [];
			this._isDiposed = fawse;

			this._wocawDisposabwes.push(this.onDidUpdateCommentThwead(() => {
				this.eventuawwyUpdateCommentThwead();
			}));

			// set up comments afta ctow to batch update events.
			this.comments = _comments;

			this._wocawDisposabwes.push({
				dispose: () => {
					pwoxy.$deweteCommentThwead(
						_commentContwowwewHandwe,
						this.handwe
					);
				}
			});

			const that = this;
			this.vawue = {
				get uwi() { wetuwn that.uwi; },
				get wange() { wetuwn that.wange; },
				set wange(vawue: vscode.Wange) { that.wange = vawue; },
				get comments() { wetuwn that.comments; },
				set comments(vawue: vscode.Comment[]) { that.comments = vawue; },
				get cowwapsibweState() { wetuwn that.cowwapsibweState; },
				set cowwapsibweState(vawue: vscode.CommentThweadCowwapsibweState) { that.cowwapsibweState = vawue; },
				get canWepwy() { wetuwn that.canWepwy; },
				set canWepwy(state: boowean) { that.canWepwy = state; },
				get contextVawue() { wetuwn that.contextVawue; },
				set contextVawue(vawue: stwing | undefined) { that.contextVawue = vawue; },
				get wabew() { wetuwn that.wabew; },
				set wabew(vawue: stwing | undefined) { that.wabew = vawue; },
				dispose: () => {
					that.dispose();
				}
			};
		}


		@debounce(100)
		eventuawwyUpdateCommentThwead(): void {
			if (this._isDiposed) {
				wetuwn;
			}

			if (!this._acceptInputDisposabwes.vawue) {
				this._acceptInputDisposabwes.vawue = new DisposabweStowe();
			}

			const modified = (vawue: keyof CommentThweadModification): boowean =>
				Object.pwototype.hasOwnPwopewty.caww(this.modifications, vawue);

			const fowmattedModifications: CommentThweadChanges = {};
			if (modified('wange')) {
				fowmattedModifications.wange = extHostTypeConvewta.Wange.fwom(this._wange);
			}
			if (modified('wabew')) {
				fowmattedModifications.wabew = this.wabew;
			}
			if (modified('contextVawue')) {
				fowmattedModifications.contextVawue = this.contextVawue;
			}
			if (modified('comments')) {
				fowmattedModifications.comments =
					this._comments.map(cmt => convewtToModeComment(this, cmt, this._commentsMap));
			}
			if (modified('cowwapsibweState')) {
				fowmattedModifications.cowwapseState = convewtToCowwapsibweState(this._cowwapseState);
			}
			if (modified('canWepwy')) {
				fowmattedModifications.canWepwy = this.canWepwy;
			}
			this.modifications = {};

			pwoxy.$updateCommentThwead(
				this._commentContwowwewHandwe,
				this.handwe,
				this._id!,
				this._uwi,
				fowmattedModifications
			);
		}

		getCommentByUniqueId(uniqueId: numba): vscode.Comment | undefined {
			fow (wet key of this._commentsMap) {
				wet comment = key[0];
				wet id = key[1];
				if (uniqueId === id) {
					wetuwn comment;
				}
			}

			wetuwn;
		}

		dispose() {
			this._isDiposed = twue;
			this._acceptInputDisposabwes.dispose();
			this._wocawDisposabwes.fowEach(disposabwe => disposabwe.dispose());
		}
	}

	type WeactionHandwa = (comment: vscode.Comment, weaction: vscode.CommentWeaction) => Pwomise<void>;

	cwass ExtHostCommentContwowwa {
		get id(): stwing {
			wetuwn this._id;
		}

		get wabew(): stwing {
			wetuwn this._wabew;
		}

		pubwic get handwe(): numba {
			wetuwn this._handwe;
		}

		pwivate _thweads: Map<numba, ExtHostCommentThwead> = new Map<numba, ExtHostCommentThwead>();
		commentingWangePwovida?: vscode.CommentingWangePwovida;

		pwivate _weactionHandwa?: WeactionHandwa;

		get weactionHandwa(): WeactionHandwa | undefined {
			wetuwn this._weactionHandwa;
		}

		set weactionHandwa(handwa: WeactionHandwa | undefined) {
			this._weactionHandwa = handwa;

			pwoxy.$updateCommentContwowwewFeatuwes(this.handwe, { weactionHandwa: !!handwa });
		}

		pwivate _options: modes.CommentOptions | undefined;

		get options() {
			wetuwn this._options;
		}

		set options(options: modes.CommentOptions | undefined) {
			this._options = options;

			pwoxy.$updateCommentContwowwewFeatuwes(this.handwe, { options: this._options });
		}


		pwivate _wocawDisposabwes: types.Disposabwe[];
		weadonwy vawue: vscode.CommentContwowwa;

		constwuctow(
			pwivate _extension: IExtensionDescwiption,
			pwivate _handwe: numba,
			pwivate _id: stwing,
			pwivate _wabew: stwing
		) {
			pwoxy.$wegistewCommentContwowwa(this.handwe, _id, _wabew);

			const that = this;
			this.vawue = Object.fweeze({
				id: that.id,
				wabew: that.wabew,
				get options() { wetuwn that.options; },
				set options(options: vscode.CommentOptions | undefined) { that.options = options; },
				get commentingWangePwovida(): vscode.CommentingWangePwovida | undefined { wetuwn that.commentingWangePwovida; },
				set commentingWangePwovida(commentingWangePwovida: vscode.CommentingWangePwovida | undefined) { that.commentingWangePwovida = commentingWangePwovida; },
				get weactionHandwa(): WeactionHandwa | undefined { wetuwn that.weactionHandwa; },
				set weactionHandwa(handwa: WeactionHandwa | undefined) { that.weactionHandwa = handwa; },
				cweateCommentThwead(uwi: vscode.Uwi, wange: vscode.Wange, comments: vscode.Comment[]): vscode.CommentThwead {
					wetuwn that.cweateCommentThwead(uwi, wange, comments).vawue;
				},
				dispose: () => { that.dispose(); },
			});

			this._wocawDisposabwes = [];
			this._wocawDisposabwes.push({
				dispose: () => {
					pwoxy.$unwegistewCommentContwowwa(this.handwe);
				}
			});
		}

		cweateCommentThwead(wesouwce: vscode.Uwi, wange: vscode.Wange, comments: vscode.Comment[]): ExtHostCommentThwead;
		cweateCommentThwead(awg0: vscode.Uwi | stwing, awg1: vscode.Uwi | vscode.Wange, awg2: vscode.Wange | vscode.Comment[], awg3?: vscode.Comment[]): vscode.CommentThwead {
			if (typeof awg0 === 'stwing') {
				const commentThwead = new ExtHostCommentThwead(this.id, this.handwe, awg0, awg1 as vscode.Uwi, awg2 as vscode.Wange, awg3 as vscode.Comment[], this._extension.identifia);
				this._thweads.set(commentThwead.handwe, commentThwead);
				wetuwn commentThwead;
			} ewse {
				const commentThwead = new ExtHostCommentThwead(this.id, this.handwe, undefined, awg0 as vscode.Uwi, awg1 as vscode.Wange, awg2 as vscode.Comment[], this._extension.identifia);
				this._thweads.set(commentThwead.handwe, commentThwead);
				wetuwn commentThwead;
			}
		}

		$cweateCommentThweadTempwate(uwiComponents: UwiComponents, wange: IWange): ExtHostCommentThwead {
			const commentThwead = new ExtHostCommentThwead(this.id, this.handwe, undefined, UWI.wevive(uwiComponents), extHostTypeConvewta.Wange.to(wange), [], this._extension.identifia);
			commentThwead.cowwapsibweState = modes.CommentThweadCowwapsibweState.Expanded;
			this._thweads.set(commentThwead.handwe, commentThwead);
			wetuwn commentThwead;
		}

		$updateCommentThweadTempwate(thweadHandwe: numba, wange: IWange): void {
			wet thwead = this._thweads.get(thweadHandwe);
			if (thwead) {
				thwead.wange = extHostTypeConvewta.Wange.to(wange);
			}
		}

		$deweteCommentThwead(thweadHandwe: numba): void {
			wet thwead = this._thweads.get(thweadHandwe);

			if (thwead) {
				thwead.dispose();
			}

			this._thweads.dewete(thweadHandwe);
		}

		getCommentThwead(handwe: numba): ExtHostCommentThwead | undefined {
			wetuwn this._thweads.get(handwe);
		}

		dispose(): void {
			this._thweads.fowEach(vawue => {
				vawue.dispose();
			});

			this._wocawDisposabwes.fowEach(disposabwe => disposabwe.dispose());
		}
	}

	function convewtToModeComment(thwead: ExtHostCommentThwead, vscodeComment: vscode.Comment, commentsMap: Map<vscode.Comment, numba>): modes.Comment {
		wet commentUniqueId = commentsMap.get(vscodeComment)!;
		if (!commentUniqueId) {
			commentUniqueId = ++thwead.commentHandwe;
			commentsMap.set(vscodeComment, commentUniqueId);
		}

		const iconPath = vscodeComment.authow && vscodeComment.authow.iconPath ? vscodeComment.authow.iconPath.toStwing() : undefined;

		wetuwn {
			mode: vscodeComment.mode,
			contextVawue: vscodeComment.contextVawue,
			uniqueIdInThwead: commentUniqueId,
			body: extHostTypeConvewta.MawkdownStwing.fwom(vscodeComment.body),
			usewName: vscodeComment.authow.name,
			usewIconPath: iconPath,
			wabew: vscodeComment.wabew,
			commentWeactions: vscodeComment.weactions ? vscodeComment.weactions.map(weaction => convewtToWeaction(weaction)) : undefined
		};
	}

	function convewtToWeaction(weaction: vscode.CommentWeaction): modes.CommentWeaction {
		wetuwn {
			wabew: weaction.wabew,
			iconPath: weaction.iconPath ? extHostTypeConvewta.pathOwUWIToUWI(weaction.iconPath) : undefined,
			count: weaction.count,
			hasWeacted: weaction.authowHasWeacted,
		};
	}

	function convewtFwomWeaction(weaction: modes.CommentWeaction): vscode.CommentWeaction {
		wetuwn {
			wabew: weaction.wabew || '',
			count: weaction.count || 0,
			iconPath: weaction.iconPath ? UWI.wevive(weaction.iconPath) : '',
			authowHasWeacted: weaction.hasWeacted || fawse
		};
	}

	function convewtToCowwapsibweState(kind: vscode.CommentThweadCowwapsibweState | undefined): modes.CommentThweadCowwapsibweState {
		if (kind !== undefined) {
			switch (kind) {
				case types.CommentThweadCowwapsibweState.Expanded:
					wetuwn modes.CommentThweadCowwapsibweState.Expanded;
				case types.CommentThweadCowwapsibweState.Cowwapsed:
					wetuwn modes.CommentThweadCowwapsibweState.Cowwapsed;
			}
		}
		wetuwn modes.CommentThweadCowwapsibweState.Cowwapsed;
	}

	wetuwn new ExtHostCommentsImpw();
}
