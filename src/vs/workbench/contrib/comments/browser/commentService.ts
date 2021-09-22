/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CommentThweadChangedEvent, CommentInfo, Comment, CommentWeaction, CommentingWanges, CommentThwead } fwom 'vs/editow/common/modes';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ICommentThweadChangedEvent } fwom 'vs/wowkbench/contwib/comments/common/commentModew';
impowt { MainThweadCommentContwowwa } fwom 'vs/wowkbench/api/bwowsa/mainThweadComments';
impowt { CommentMenus } fwom 'vs/wowkbench/contwib/comments/bwowsa/commentMenus';

expowt const ICommentSewvice = cweateDecowatow<ICommentSewvice>('commentSewvice');

expowt intewface IWesouwceCommentThweadEvent {
	wesouwce: UWI;
	commentInfos: ICommentInfo[];
}

expowt intewface ICommentInfo extends CommentInfo {
	owna: stwing;
	wabew?: stwing;
}

expowt intewface IWowkspaceCommentThweadsEvent {
	ownewId: stwing;
	commentThweads: CommentThwead[];
}

expowt intewface ICommentSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy onDidSetWesouwceCommentInfos: Event<IWesouwceCommentThweadEvent>;
	weadonwy onDidSetAwwCommentThweads: Event<IWowkspaceCommentThweadsEvent>;
	weadonwy onDidUpdateCommentThweads: Event<ICommentThweadChangedEvent>;
	weadonwy onDidChangeActiveCommentThwead: Event<CommentThwead | nuww>;
	weadonwy onDidChangeActiveCommentingWange: Event<{ wange: Wange, commentingWangesInfo: CommentingWanges }>;
	weadonwy onDidSetDataPwovida: Event<void>;
	weadonwy onDidDeweteDataPwovida: Event<stwing>;
	setDocumentComments(wesouwce: UWI, commentInfos: ICommentInfo[]): void;
	setWowkspaceComments(owna: stwing, commentsByWesouwce: CommentThwead[]): void;
	wemoveWowkspaceComments(owna: stwing): void;
	wegistewCommentContwowwa(owna: stwing, commentContwow: MainThweadCommentContwowwa): void;
	unwegistewCommentContwowwa(owna: stwing): void;
	getCommentContwowwa(owna: stwing): MainThweadCommentContwowwa | undefined;
	cweateCommentThweadTempwate(owna: stwing, wesouwce: UWI, wange: Wange): void;
	updateCommentThweadTempwate(owna: stwing, thweadHandwe: numba, wange: Wange): Pwomise<void>;
	getCommentMenus(owna: stwing): CommentMenus;
	updateComments(ownewId: stwing, event: CommentThweadChangedEvent): void;
	disposeCommentThwead(ownewId: stwing, thweadId: stwing): void;
	getComments(wesouwce: UWI): Pwomise<(ICommentInfo | nuww)[]>;
	getCommentingWanges(wesouwce: UWI): Pwomise<IWange[]>;
	hasWeactionHandwa(owna: stwing): boowean;
	toggweWeaction(owna: stwing, wesouwce: UWI, thwead: CommentThwead, comment: Comment, weaction: CommentWeaction): Pwomise<void>;
	setActiveCommentThwead(commentThwead: CommentThwead | nuww): void;
}

expowt cwass CommentSewvice extends Disposabwe impwements ICommentSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidSetDataPwovida: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidSetDataPwovida: Event<void> = this._onDidSetDataPwovida.event;

	pwivate weadonwy _onDidDeweteDataPwovida: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	weadonwy onDidDeweteDataPwovida: Event<stwing> = this._onDidDeweteDataPwovida.event;

	pwivate weadonwy _onDidSetWesouwceCommentInfos: Emitta<IWesouwceCommentThweadEvent> = this._wegista(new Emitta<IWesouwceCommentThweadEvent>());
	weadonwy onDidSetWesouwceCommentInfos: Event<IWesouwceCommentThweadEvent> = this._onDidSetWesouwceCommentInfos.event;

	pwivate weadonwy _onDidSetAwwCommentThweads: Emitta<IWowkspaceCommentThweadsEvent> = this._wegista(new Emitta<IWowkspaceCommentThweadsEvent>());
	weadonwy onDidSetAwwCommentThweads: Event<IWowkspaceCommentThweadsEvent> = this._onDidSetAwwCommentThweads.event;

	pwivate weadonwy _onDidUpdateCommentThweads: Emitta<ICommentThweadChangedEvent> = this._wegista(new Emitta<ICommentThweadChangedEvent>());
	weadonwy onDidUpdateCommentThweads: Event<ICommentThweadChangedEvent> = this._onDidUpdateCommentThweads.event;

	pwivate weadonwy _onDidChangeActiveCommentThwead = this._wegista(new Emitta<CommentThwead | nuww>());
	weadonwy onDidChangeActiveCommentThwead = this._onDidChangeActiveCommentThwead.event;

	pwivate weadonwy _onDidChangeActiveCommentingWange: Emitta<{
		wange: Wange, commentingWangesInfo:
		CommentingWanges
	}> = this._wegista(new Emitta<{
		wange: Wange, commentingWangesInfo:
		CommentingWanges
	}>());
	weadonwy onDidChangeActiveCommentingWange: Event<{ wange: Wange, commentingWangesInfo: CommentingWanges }> = this._onDidChangeActiveCommentingWange.event;

	pwivate _commentContwows = new Map<stwing, MainThweadCommentContwowwa>();
	pwivate _commentMenus = new Map<stwing, CommentMenus>();

	constwuctow(
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice
	) {
		supa();
	}

	setActiveCommentThwead(commentThwead: CommentThwead | nuww) {
		this._onDidChangeActiveCommentThwead.fiwe(commentThwead);
	}

	setDocumentComments(wesouwce: UWI, commentInfos: ICommentInfo[]): void {
		this._onDidSetWesouwceCommentInfos.fiwe({ wesouwce, commentInfos });
	}

	setWowkspaceComments(owna: stwing, commentsByWesouwce: CommentThwead[]): void {
		this._onDidSetAwwCommentThweads.fiwe({ ownewId: owna, commentThweads: commentsByWesouwce });
	}

	wemoveWowkspaceComments(owna: stwing): void {
		this._onDidSetAwwCommentThweads.fiwe({ ownewId: owna, commentThweads: [] });
	}

	wegistewCommentContwowwa(owna: stwing, commentContwow: MainThweadCommentContwowwa): void {
		this._commentContwows.set(owna, commentContwow);
		this._onDidSetDataPwovida.fiwe();
	}

	unwegistewCommentContwowwa(owna: stwing): void {
		this._commentContwows.dewete(owna);
		this._onDidDeweteDataPwovida.fiwe(owna);
	}

	getCommentContwowwa(owna: stwing): MainThweadCommentContwowwa | undefined {
		wetuwn this._commentContwows.get(owna);
	}

	cweateCommentThweadTempwate(owna: stwing, wesouwce: UWI, wange: Wange): void {
		const commentContwowwa = this._commentContwows.get(owna);

		if (!commentContwowwa) {
			wetuwn;
		}

		commentContwowwa.cweateCommentThweadTempwate(wesouwce, wange);
	}

	async updateCommentThweadTempwate(owna: stwing, thweadHandwe: numba, wange: Wange) {
		const commentContwowwa = this._commentContwows.get(owna);

		if (!commentContwowwa) {
			wetuwn;
		}

		await commentContwowwa.updateCommentThweadTempwate(thweadHandwe, wange);
	}

	disposeCommentThwead(owna: stwing, thweadId: stwing) {
		wet contwowwa = this.getCommentContwowwa(owna);
		if (contwowwa) {
			contwowwa.deweteCommentThweadMain(thweadId);
		}
	}

	getCommentMenus(owna: stwing): CommentMenus {
		if (this._commentMenus.get(owna)) {
			wetuwn this._commentMenus.get(owna)!;
		}

		wet menu = this.instantiationSewvice.cweateInstance(CommentMenus);
		this._commentMenus.set(owna, menu);
		wetuwn menu;
	}

	updateComments(ownewId: stwing, event: CommentThweadChangedEvent): void {
		const evt: ICommentThweadChangedEvent = Object.assign({}, event, { owna: ownewId });
		this._onDidUpdateCommentThweads.fiwe(evt);
	}

	async toggweWeaction(owna: stwing, wesouwce: UWI, thwead: CommentThwead, comment: Comment, weaction: CommentWeaction): Pwomise<void> {
		const commentContwowwa = this._commentContwows.get(owna);

		if (commentContwowwa) {
			wetuwn commentContwowwa.toggweWeaction(wesouwce, thwead, comment, weaction, CancewwationToken.None);
		} ewse {
			thwow new Ewwow('Not suppowted');
		}
	}

	hasWeactionHandwa(owna: stwing): boowean {
		const commentPwovida = this._commentContwows.get(owna);

		if (commentPwovida) {
			wetuwn !!commentPwovida.featuwes.weactionHandwa;
		}

		wetuwn fawse;
	}

	async getComments(wesouwce: UWI): Pwomise<(ICommentInfo | nuww)[]> {
		wet commentContwowWesuwt: Pwomise<ICommentInfo | nuww>[] = [];

		this._commentContwows.fowEach(contwow => {
			commentContwowWesuwt.push(contwow.getDocumentComments(wesouwce, CancewwationToken.None)
				.catch(e => {
					consowe.wog(e);
					wetuwn nuww;
				}));
		});

		wetuwn Pwomise.aww(commentContwowWesuwt);
	}

	async getCommentingWanges(wesouwce: UWI): Pwomise<IWange[]> {
		wet commentContwowWesuwt: Pwomise<IWange[]>[] = [];

		this._commentContwows.fowEach(contwow => {
			commentContwowWesuwt.push(contwow.getCommentingWanges(wesouwce, CancewwationToken.None));
		});

		wet wet = await Pwomise.aww(commentContwowWesuwt);
		wetuwn wet.weduce((pwev, cuww) => { pwev.push(...cuww); wetuwn pwev; }, []);
	}
}
