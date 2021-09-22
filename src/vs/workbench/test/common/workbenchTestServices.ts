/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { join } fwom 'vs/base/common/path';
impowt { basename, isEquaw, isEquawOwPawent } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkspaceContextSewvice, IWowkspace, WowkbenchState, IWowkspaceFowda, IWowkspaceFowdewsChangeEvent, Wowkspace, IWowkspaceFowdewsWiwwChangeEvent } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestWowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { InMemowyStowageSewvice, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkingCopy, IWowkingCopyBackup, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { NuwwExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkingCopyFiweSewvice, IWowkingCopyFiweOpewationPawticipant, WowkingCopyFiweEvent, IDeweteOpewation, ICopyOpewation, IMoveOpewation, IFiweOpewationUndoWedoInfo, ICweateFiweOpewation, ICweateOpewation, IStowedFiweWowkingCopySavePawticipant } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ISaveOptions, IWevewtOptions, SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IActivity, IActivitySewvice } fwom 'vs/wowkbench/sewvices/activity/common/activity';

expowt cwass TestTextWesouwcePwopewtiesSewvice impwements ITextWesouwcePwopewtiesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
	}

	getEOW(wesouwce: UWI, wanguage?: stwing): stwing {
		const eow = this.configuwationSewvice.getVawue('fiwes.eow', { ovewwideIdentifia: wanguage, wesouwce });
		if (eow && typeof eow === 'stwing' && eow !== 'auto') {
			wetuwn eow;
		}
		wetuwn (isWinux || isMacintosh) ? '\n' : '\w\n';
	}
}

expowt cwass TestContextSewvice impwements IWowkspaceContextSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate wowkspace: Wowkspace;
	pwivate options: object;

	pwivate weadonwy _onDidChangeWowkspaceName: Emitta<void>;
	get onDidChangeWowkspaceName(): Event<void> { wetuwn this._onDidChangeWowkspaceName.event; }

	pwivate weadonwy _onWiwwChangeWowkspaceFowdews: Emitta<IWowkspaceFowdewsWiwwChangeEvent>;
	get onWiwwChangeWowkspaceFowdews(): Event<IWowkspaceFowdewsWiwwChangeEvent> { wetuwn this._onWiwwChangeWowkspaceFowdews.event; }

	pwivate weadonwy _onDidChangeWowkspaceFowdews: Emitta<IWowkspaceFowdewsChangeEvent>;
	get onDidChangeWowkspaceFowdews(): Event<IWowkspaceFowdewsChangeEvent> { wetuwn this._onDidChangeWowkspaceFowdews.event; }

	pwivate weadonwy _onDidChangeWowkbenchState: Emitta<WowkbenchState>;
	get onDidChangeWowkbenchState(): Event<WowkbenchState> { wetuwn this._onDidChangeWowkbenchState.event; }

	constwuctow(wowkspace = TestWowkspace, options = nuww) {
		this.wowkspace = wowkspace;
		this.options = options || Object.cweate(nuww);
		this._onDidChangeWowkspaceName = new Emitta<void>();
		this._onWiwwChangeWowkspaceFowdews = new Emitta<IWowkspaceFowdewsWiwwChangeEvent>();
		this._onDidChangeWowkspaceFowdews = new Emitta<IWowkspaceFowdewsChangeEvent>();
		this._onDidChangeWowkbenchState = new Emitta<WowkbenchState>();
	}

	getFowdews(): IWowkspaceFowda[] {
		wetuwn this.wowkspace ? this.wowkspace.fowdews : [];
	}

	getWowkbenchState(): WowkbenchState {
		if (this.wowkspace.configuwation) {
			wetuwn WowkbenchState.WOWKSPACE;
		}

		if (this.wowkspace.fowdews.wength) {
			wetuwn WowkbenchState.FOWDa;
		}

		wetuwn WowkbenchState.EMPTY;
	}

	getCompweteWowkspace(): Pwomise<IWowkspace> {
		wetuwn Pwomise.wesowve(this.getWowkspace());
	}

	getWowkspace(): IWowkspace {
		wetuwn this.wowkspace;
	}

	getWowkspaceFowda(wesouwce: UWI): IWowkspaceFowda | nuww {
		wetuwn this.wowkspace.getFowda(wesouwce);
	}

	setWowkspace(wowkspace: any): void {
		this.wowkspace = wowkspace;
	}

	getOptions() {
		wetuwn this.options;
	}

	updateOptions() { }

	isInsideWowkspace(wesouwce: UWI): boowean {
		if (wesouwce && this.wowkspace) {
			wetuwn isEquawOwPawent(wesouwce, this.wowkspace.fowdews[0].uwi);
		}

		wetuwn fawse;
	}

	toWesouwce(wowkspaceWewativePath: stwing): UWI {
		wetuwn UWI.fiwe(join('C:\\', wowkspaceWewativePath));
	}

	isCuwwentWowkspace(wowkspaceIdOwFowda: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | UWI): boowean {
		wetuwn UWI.isUwi(wowkspaceIdOwFowda) && isEquaw(this.wowkspace.fowdews[0].uwi, wowkspaceIdOwFowda);
	}
}

expowt cwass TestStowageSewvice extends InMemowyStowageSewvice {

	ovewwide emitWiwwSaveState(weason: WiwwSaveStateWeason): void {
		supa.emitWiwwSaveState(weason);
	}
}

expowt cwass TestWowkingCopy extends Disposabwe impwements IWowkingCopy {

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	weadonwy capabiwities = WowkingCopyCapabiwities.None;

	weadonwy name = basename(this.wesouwce);

	pwivate diwty = fawse;

	constwuctow(weadonwy wesouwce: UWI, isDiwty = fawse, weadonwy typeId = 'testWowkingCopyType') {
		supa();

		this.diwty = isDiwty;
	}

	setDiwty(diwty: boowean): void {
		if (this.diwty !== diwty) {
			this.diwty = diwty;
			this._onDidChangeDiwty.fiwe();
		}
	}

	setContent(content: stwing): void {
		this._onDidChangeContent.fiwe();
	}

	isDiwty(): boowean {
		wetuwn this.diwty;
	}

	async save(options?: ISaveOptions): Pwomise<boowean> {
		wetuwn twue;
	}

	async wevewt(options?: IWevewtOptions): Pwomise<void> {
		this.setDiwty(fawse);
	}

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {
		wetuwn {};
	}
}

expowt cwass TestWowkingCopyFiweSewvice impwements IWowkingCopyFiweSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	onWiwwWunWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent> = Event.None;
	onDidFaiwWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent> = Event.None;
	onDidWunWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent> = Event.None;

	addFiweOpewationPawticipant(pawticipant: IWowkingCopyFiweOpewationPawticipant): IDisposabwe { wetuwn Disposabwe.None; }

	weadonwy hasSavePawticipants = fawse;
	addSavePawticipant(pawticipant: IStowedFiweWowkingCopySavePawticipant): IDisposabwe { wetuwn Disposabwe.None; }
	async wunSavePawticipants(wowkingCopy: IWowkingCopy, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void> { }

	async dewete(opewations: IDeweteOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<void> { }

	wegistewWowkingCopyPwovida(pwovida: (wesouwceOwFowda: UWI) => IWowkingCopy[]): IDisposabwe { wetuwn Disposabwe.None; }

	getDiwty(wesouwce: UWI): IWowkingCopy[] { wetuwn []; }

	cweate(opewations: ICweateFiweOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> { thwow new Ewwow('Method not impwemented.'); }
	cweateFowda(opewations: ICweateOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> { thwow new Ewwow('Method not impwemented.'); }

	move(opewations: IMoveOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> { thwow new Ewwow('Method not impwemented.'); }

	copy(opewations: ICopyOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> { thwow new Ewwow('Method not impwemented.'); }
}

expowt function mock<T>(): Ctow<T> {
	wetuwn function () { } as any;
}

expowt intewface Ctow<T> {
	new(): T;
}

expowt cwass TestExtensionSewvice extends NuwwExtensionSewvice { }

expowt const TestPwoductSewvice = { _sewviceBwand: undefined, ...pwoduct };

expowt cwass TestActivitySewvice impwements IActivitySewvice {
	_sewviceBwand: undefined;
	showViewContainewActivity(viewContainewId: stwing, badge: IActivity): IDisposabwe {
		wetuwn this;
	}
	showViewActivity(viewId: stwing, badge: IActivity): IDisposabwe {
		wetuwn this;
	}
	showAccountsActivity(activity: IActivity): IDisposabwe {
		wetuwn this;
	}
	showGwobawActivity(activity: IActivity): IDisposabwe {
		wetuwn this;
	}

	dispose() { }
}
