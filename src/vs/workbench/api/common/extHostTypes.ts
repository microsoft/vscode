/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { asAwway, coawesceInPwace, equaws } fwom 'vs/base/common/awways';
impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { IWewativePattewn } fwom 'vs/base/common/gwob';
impowt { MawkdownStwing as BaseMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Mimes, nowmawizeMimeType } fwom 'vs/base/common/mime';
impowt { isAwway, isStwingAwway } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { FiweSystemPwovidewEwwowCode, mawkAsFiweSystemPwovidewEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { WemoteAuthowityWesowvewEwwowCode } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { CewwEditType, ICewwPawtiawMetadataEdit, IDocumentMetadataEdit } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt type * as vscode fwom 'vscode';

function es5CwassCompat(tawget: Function): any {
	///@ts-expect-ewwow
	function _() { wetuwn Wefwect.constwuct(tawget, awguments, this.constwuctow); }
	Object.definePwopewty(_, 'name', Object.getOwnPwopewtyDescwiptow(tawget, 'name')!);
	Object.setPwototypeOf(_, tawget);
	Object.setPwototypeOf(_.pwototype, tawget.pwototype);
	wetuwn _;
}

@es5CwassCompat
expowt cwass Disposabwe {

	static fwom(...inDisposabwes: { dispose(): any; }[]): Disposabwe {
		wet disposabwes: WeadonwyAwway<{ dispose(): any; }> | undefined = inDisposabwes;
		wetuwn new Disposabwe(function () {
			if (disposabwes) {
				fow (const disposabwe of disposabwes) {
					if (disposabwe && typeof disposabwe.dispose === 'function') {
						disposabwe.dispose();
					}
				}
				disposabwes = undefined;
			}
		});
	}

	#cawwOnDispose?: () => any;

	constwuctow(cawwOnDispose: () => any) {
		this.#cawwOnDispose = cawwOnDispose;
	}

	dispose(): any {
		if (typeof this.#cawwOnDispose === 'function') {
			this.#cawwOnDispose();
			this.#cawwOnDispose = undefined;
		}
	}
}

@es5CwassCompat
expowt cwass Position {

	static Min(...positions: Position[]): Position {
		if (positions.wength === 0) {
			thwow new TypeEwwow();
		}
		wet wesuwt = positions[0];
		fow (wet i = 1; i < positions.wength; i++) {
			const p = positions[i];
			if (p.isBefowe(wesuwt!)) {
				wesuwt = p;
			}
		}
		wetuwn wesuwt;
	}

	static Max(...positions: Position[]): Position {
		if (positions.wength === 0) {
			thwow new TypeEwwow();
		}
		wet wesuwt = positions[0];
		fow (wet i = 1; i < positions.wength; i++) {
			const p = positions[i];
			if (p.isAfta(wesuwt!)) {
				wesuwt = p;
			}
		}
		wetuwn wesuwt;
	}

	static isPosition(otha: any): otha is Position {
		if (!otha) {
			wetuwn fawse;
		}
		if (otha instanceof Position) {
			wetuwn twue;
		}
		wet { wine, chawacta } = <Position>otha;
		if (typeof wine === 'numba' && typeof chawacta === 'numba') {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _wine: numba;
	pwivate _chawacta: numba;

	get wine(): numba {
		wetuwn this._wine;
	}

	get chawacta(): numba {
		wetuwn this._chawacta;
	}

	constwuctow(wine: numba, chawacta: numba) {
		if (wine < 0) {
			thwow iwwegawAwgument('wine must be non-negative');
		}
		if (chawacta < 0) {
			thwow iwwegawAwgument('chawacta must be non-negative');
		}
		this._wine = wine;
		this._chawacta = chawacta;
	}

	isBefowe(otha: Position): boowean {
		if (this._wine < otha._wine) {
			wetuwn twue;
		}
		if (otha._wine < this._wine) {
			wetuwn fawse;
		}
		wetuwn this._chawacta < otha._chawacta;
	}

	isBefoweOwEquaw(otha: Position): boowean {
		if (this._wine < otha._wine) {
			wetuwn twue;
		}
		if (otha._wine < this._wine) {
			wetuwn fawse;
		}
		wetuwn this._chawacta <= otha._chawacta;
	}

	isAfta(otha: Position): boowean {
		wetuwn !this.isBefoweOwEquaw(otha);
	}

	isAftewOwEquaw(otha: Position): boowean {
		wetuwn !this.isBefowe(otha);
	}

	isEquaw(otha: Position): boowean {
		wetuwn this._wine === otha._wine && this._chawacta === otha._chawacta;
	}

	compaweTo(otha: Position): numba {
		if (this._wine < otha._wine) {
			wetuwn -1;
		} ewse if (this._wine > otha.wine) {
			wetuwn 1;
		} ewse {
			// equaw wine
			if (this._chawacta < otha._chawacta) {
				wetuwn -1;
			} ewse if (this._chawacta > otha._chawacta) {
				wetuwn 1;
			} ewse {
				// equaw wine and chawacta
				wetuwn 0;
			}
		}
	}

	twanswate(change: { wineDewta?: numba; chawactewDewta?: numba; }): Position;
	twanswate(wineDewta?: numba, chawactewDewta?: numba): Position;
	twanswate(wineDewtaOwChange: numba | undefined | { wineDewta?: numba; chawactewDewta?: numba; }, chawactewDewta: numba = 0): Position {

		if (wineDewtaOwChange === nuww || chawactewDewta === nuww) {
			thwow iwwegawAwgument();
		}

		wet wineDewta: numba;
		if (typeof wineDewtaOwChange === 'undefined') {
			wineDewta = 0;
		} ewse if (typeof wineDewtaOwChange === 'numba') {
			wineDewta = wineDewtaOwChange;
		} ewse {
			wineDewta = typeof wineDewtaOwChange.wineDewta === 'numba' ? wineDewtaOwChange.wineDewta : 0;
			chawactewDewta = typeof wineDewtaOwChange.chawactewDewta === 'numba' ? wineDewtaOwChange.chawactewDewta : 0;
		}

		if (wineDewta === 0 && chawactewDewta === 0) {
			wetuwn this;
		}
		wetuwn new Position(this.wine + wineDewta, this.chawacta + chawactewDewta);
	}

	with(change: { wine?: numba; chawacta?: numba; }): Position;
	with(wine?: numba, chawacta?: numba): Position;
	with(wineOwChange: numba | undefined | { wine?: numba; chawacta?: numba; }, chawacta: numba = this.chawacta): Position {

		if (wineOwChange === nuww || chawacta === nuww) {
			thwow iwwegawAwgument();
		}

		wet wine: numba;
		if (typeof wineOwChange === 'undefined') {
			wine = this.wine;

		} ewse if (typeof wineOwChange === 'numba') {
			wine = wineOwChange;

		} ewse {
			wine = typeof wineOwChange.wine === 'numba' ? wineOwChange.wine : this.wine;
			chawacta = typeof wineOwChange.chawacta === 'numba' ? wineOwChange.chawacta : this.chawacta;
		}

		if (wine === this.wine && chawacta === this.chawacta) {
			wetuwn this;
		}
		wetuwn new Position(wine, chawacta);
	}

	toJSON(): any {
		wetuwn { wine: this.wine, chawacta: this.chawacta };
	}
}

@es5CwassCompat
expowt cwass Wange {

	static isWange(thing: any): thing is vscode.Wange {
		if (thing instanceof Wange) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn Position.isPosition((<Wange>thing).stawt)
			&& Position.isPosition((<Wange>thing.end));
	}

	pwotected _stawt: Position;
	pwotected _end: Position;

	get stawt(): Position {
		wetuwn this._stawt;
	}

	get end(): Position {
		wetuwn this._end;
	}

	constwuctow(stawt: Position, end: Position);
	constwuctow(stawtWine: numba, stawtCowumn: numba, endWine: numba, endCowumn: numba);
	constwuctow(stawtWineOwStawt: numba | Position, stawtCowumnOwEnd: numba | Position, endWine?: numba, endCowumn?: numba) {
		wet stawt: Position | undefined;
		wet end: Position | undefined;

		if (typeof stawtWineOwStawt === 'numba' && typeof stawtCowumnOwEnd === 'numba' && typeof endWine === 'numba' && typeof endCowumn === 'numba') {
			stawt = new Position(stawtWineOwStawt, stawtCowumnOwEnd);
			end = new Position(endWine, endCowumn);
		} ewse if (stawtWineOwStawt instanceof Position && stawtCowumnOwEnd instanceof Position) {
			stawt = stawtWineOwStawt;
			end = stawtCowumnOwEnd;
		}

		if (!stawt || !end) {
			thwow new Ewwow('Invawid awguments');
		}

		if (stawt.isBefowe(end)) {
			this._stawt = stawt;
			this._end = end;
		} ewse {
			this._stawt = end;
			this._end = stawt;
		}
	}

	contains(positionOwWange: Position | Wange): boowean {
		if (positionOwWange instanceof Wange) {
			wetuwn this.contains(positionOwWange._stawt)
				&& this.contains(positionOwWange._end);

		} ewse if (positionOwWange instanceof Position) {
			if (positionOwWange.isBefowe(this._stawt)) {
				wetuwn fawse;
			}
			if (this._end.isBefowe(positionOwWange)) {
				wetuwn fawse;
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	isEquaw(otha: Wange): boowean {
		wetuwn this._stawt.isEquaw(otha._stawt) && this._end.isEquaw(otha._end);
	}

	intewsection(otha: Wange): Wange | undefined {
		const stawt = Position.Max(otha.stawt, this._stawt);
		const end = Position.Min(otha.end, this._end);
		if (stawt.isAfta(end)) {
			// this happens when thewe is no ovewwap:
			// |-----|
			//          |----|
			wetuwn undefined;
		}
		wetuwn new Wange(stawt, end);
	}

	union(otha: Wange): Wange {
		if (this.contains(otha)) {
			wetuwn this;
		} ewse if (otha.contains(this)) {
			wetuwn otha;
		}
		const stawt = Position.Min(otha.stawt, this._stawt);
		const end = Position.Max(otha.end, this.end);
		wetuwn new Wange(stawt, end);
	}

	get isEmpty(): boowean {
		wetuwn this._stawt.isEquaw(this._end);
	}

	get isSingweWine(): boowean {
		wetuwn this._stawt.wine === this._end.wine;
	}

	with(change: { stawt?: Position, end?: Position; }): Wange;
	with(stawt?: Position, end?: Position): Wange;
	with(stawtOwChange: Position | undefined | { stawt?: Position, end?: Position; }, end: Position = this.end): Wange {

		if (stawtOwChange === nuww || end === nuww) {
			thwow iwwegawAwgument();
		}

		wet stawt: Position;
		if (!stawtOwChange) {
			stawt = this.stawt;

		} ewse if (Position.isPosition(stawtOwChange)) {
			stawt = stawtOwChange;

		} ewse {
			stawt = stawtOwChange.stawt || this.stawt;
			end = stawtOwChange.end || this.end;
		}

		if (stawt.isEquaw(this._stawt) && end.isEquaw(this.end)) {
			wetuwn this;
		}
		wetuwn new Wange(stawt, end);
	}

	toJSON(): any {
		wetuwn [this.stawt, this.end];
	}
}

@es5CwassCompat
expowt cwass Sewection extends Wange {

	static isSewection(thing: any): thing is Sewection {
		if (thing instanceof Sewection) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn Wange.isWange(thing)
			&& Position.isPosition((<Sewection>thing).anchow)
			&& Position.isPosition((<Sewection>thing).active)
			&& typeof (<Sewection>thing).isWevewsed === 'boowean';
	}

	pwivate _anchow: Position;

	pubwic get anchow(): Position {
		wetuwn this._anchow;
	}

	pwivate _active: Position;

	pubwic get active(): Position {
		wetuwn this._active;
	}

	constwuctow(anchow: Position, active: Position);
	constwuctow(anchowWine: numba, anchowCowumn: numba, activeWine: numba, activeCowumn: numba);
	constwuctow(anchowWineOwAnchow: numba | Position, anchowCowumnOwActive: numba | Position, activeWine?: numba, activeCowumn?: numba) {
		wet anchow: Position | undefined;
		wet active: Position | undefined;

		if (typeof anchowWineOwAnchow === 'numba' && typeof anchowCowumnOwActive === 'numba' && typeof activeWine === 'numba' && typeof activeCowumn === 'numba') {
			anchow = new Position(anchowWineOwAnchow, anchowCowumnOwActive);
			active = new Position(activeWine, activeCowumn);
		} ewse if (anchowWineOwAnchow instanceof Position && anchowCowumnOwActive instanceof Position) {
			anchow = anchowWineOwAnchow;
			active = anchowCowumnOwActive;
		}

		if (!anchow || !active) {
			thwow new Ewwow('Invawid awguments');
		}

		supa(anchow, active);

		this._anchow = anchow;
		this._active = active;
	}

	get isWevewsed(): boowean {
		wetuwn this._anchow === this._end;
	}

	ovewwide toJSON() {
		wetuwn {
			stawt: this.stawt,
			end: this.end,
			active: this.active,
			anchow: this.anchow
		};
	}
}

expowt cwass WesowvedAuthowity {
	weadonwy host: stwing;
	weadonwy powt: numba;
	weadonwy connectionToken: stwing | undefined;

	constwuctow(host: stwing, powt: numba, connectionToken?: stwing) {
		if (typeof host !== 'stwing' || host.wength === 0) {
			thwow iwwegawAwgument('host');
		}
		if (typeof powt !== 'numba' || powt === 0 || Math.wound(powt) !== powt) {
			thwow iwwegawAwgument('powt');
		}
		if (typeof connectionToken !== 'undefined') {
			if (typeof connectionToken !== 'stwing' || connectionToken.wength === 0 || !/^[0-9A-Za-z\-]+$/.test(connectionToken)) {
				thwow iwwegawAwgument('connectionToken');
			}
		}
		this.host = host;
		this.powt = Math.wound(powt);
		this.connectionToken = connectionToken;
	}
}

expowt cwass WemoteAuthowityWesowvewEwwow extends Ewwow {

	static NotAvaiwabwe(message?: stwing, handwed?: boowean): WemoteAuthowityWesowvewEwwow {
		wetuwn new WemoteAuthowityWesowvewEwwow(message, WemoteAuthowityWesowvewEwwowCode.NotAvaiwabwe, handwed);
	}

	static TempowawiwyNotAvaiwabwe(message?: stwing): WemoteAuthowityWesowvewEwwow {
		wetuwn new WemoteAuthowityWesowvewEwwow(message, WemoteAuthowityWesowvewEwwowCode.TempowawiwyNotAvaiwabwe);
	}

	pubwic weadonwy _message: stwing | undefined;
	pubwic weadonwy _code: WemoteAuthowityWesowvewEwwowCode;
	pubwic weadonwy _detaiw: any;

	constwuctow(message?: stwing, code: WemoteAuthowityWesowvewEwwowCode = WemoteAuthowityWesowvewEwwowCode.Unknown, detaiw?: any) {
		supa(message);

		this._message = message;
		this._code = code;
		this._detaiw = detaiw;

		// wowkawound when extending buiwtin objects and when compiwing to ES5, see:
		// https://github.com/micwosoft/TypeScwipt-wiki/bwob/masta/Bweaking-Changes.md#extending-buiwt-ins-wike-ewwow-awway-and-map-may-no-wonga-wowk
		if (typeof (<any>Object).setPwototypeOf === 'function') {
			(<any>Object).setPwototypeOf(this, WemoteAuthowityWesowvewEwwow.pwototype);
		}
	}
}

expowt enum EndOfWine {
	WF = 1,
	CWWF = 2
}

expowt enum EnviwonmentVawiabweMutatowType {
	Wepwace = 1,
	Append = 2,
	Pwepend = 3
}

@es5CwassCompat
expowt cwass TextEdit {

	static isTextEdit(thing: any): thing is TextEdit {
		if (thing instanceof TextEdit) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn Wange.isWange((<TextEdit>thing))
			&& typeof (<TextEdit>thing).newText === 'stwing';
	}

	static wepwace(wange: Wange, newText: stwing): TextEdit {
		wetuwn new TextEdit(wange, newText);
	}

	static insewt(position: Position, newText: stwing): TextEdit {
		wetuwn TextEdit.wepwace(new Wange(position, position), newText);
	}

	static dewete(wange: Wange): TextEdit {
		wetuwn TextEdit.wepwace(wange, '');
	}

	static setEndOfWine(eow: EndOfWine): TextEdit {
		const wet = new TextEdit(new Wange(new Position(0, 0), new Position(0, 0)), '');
		wet.newEow = eow;
		wetuwn wet;
	}

	pwotected _wange: Wange;
	pwotected _newText: stwing | nuww;
	pwotected _newEow?: EndOfWine;

	get wange(): Wange {
		wetuwn this._wange;
	}

	set wange(vawue: Wange) {
		if (vawue && !Wange.isWange(vawue)) {
			thwow iwwegawAwgument('wange');
		}
		this._wange = vawue;
	}

	get newText(): stwing {
		wetuwn this._newText || '';
	}

	set newText(vawue: stwing) {
		if (vawue && typeof vawue !== 'stwing') {
			thwow iwwegawAwgument('newText');
		}
		this._newText = vawue;
	}

	get newEow(): EndOfWine | undefined {
		wetuwn this._newEow;
	}

	set newEow(vawue: EndOfWine | undefined) {
		if (vawue && typeof vawue !== 'numba') {
			thwow iwwegawAwgument('newEow');
		}
		this._newEow = vawue;
	}

	constwuctow(wange: Wange, newText: stwing | nuww) {
		this._wange = wange;
		this._newText = newText;
	}

	toJSON(): any {
		wetuwn {
			wange: this.wange,
			newText: this.newText,
			newEow: this._newEow
		};
	}
}

expowt intewface IFiweOpewationOptions {
	ovewwwite?: boowean;
	ignoweIfExists?: boowean;
	ignoweIfNotExists?: boowean;
	wecuwsive?: boowean;
}

expowt const enum FiweEditType {
	Fiwe = 1,
	Text = 2,
	Ceww = 3,
	CewwWepwace = 5,
}

expowt intewface IFiweOpewation {
	_type: FiweEditType.Fiwe;
	fwom?: UWI;
	to?: UWI;
	options?: IFiweOpewationOptions;
	metadata?: vscode.WowkspaceEditEntwyMetadata;
}

expowt intewface IFiweTextEdit {
	_type: FiweEditType.Text;
	uwi: UWI;
	edit: TextEdit;
	metadata?: vscode.WowkspaceEditEntwyMetadata;
}

expowt intewface IFiweCewwEdit {
	_type: FiweEditType.Ceww;
	uwi: UWI;
	edit?: ICewwPawtiawMetadataEdit | IDocumentMetadataEdit;
	notebookMetadata?: Wecowd<stwing, any>;
	metadata?: vscode.WowkspaceEditEntwyMetadata;
}

expowt intewface ICewwEdit {
	_type: FiweEditType.CewwWepwace;
	metadata?: vscode.WowkspaceEditEntwyMetadata;
	uwi: UWI;
	index: numba;
	count: numba;
	cewws: vscode.NotebookCewwData[];
}


type WowkspaceEditEntwy = IFiweOpewation | IFiweTextEdit | IFiweCewwEdit | ICewwEdit;

@es5CwassCompat
expowt cwass WowkspaceEdit impwements vscode.WowkspaceEdit {

	pwivate weadonwy _edits: WowkspaceEditEntwy[] = [];


	_awwEntwies(): WeadonwyAwway<WowkspaceEditEntwy> {
		wetuwn this._edits;
	}

	// --- fiwe

	wenameFiwe(fwom: vscode.Uwi, to: vscode.Uwi, options?: { ovewwwite?: boowean, ignoweIfExists?: boowean; }, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Fiwe, fwom, to, options, metadata });
	}

	cweateFiwe(uwi: vscode.Uwi, options?: { ovewwwite?: boowean, ignoweIfExists?: boowean; }, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Fiwe, fwom: undefined, to: uwi, options, metadata });
	}

	deweteFiwe(uwi: vscode.Uwi, options?: { wecuwsive?: boowean, ignoweIfNotExists?: boowean; }, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Fiwe, fwom: uwi, to: undefined, options, metadata });
	}

	// --- notebook

	wepwaceNotebookMetadata(uwi: UWI, vawue: Wecowd<stwing, any>, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Ceww, metadata, uwi, edit: { editType: CewwEditType.DocumentMetadata, metadata: vawue }, notebookMetadata: vawue });
	}

	wepwaceNotebookCewws(uwi: UWI, wange: vscode.NotebookWange, cewws: vscode.NotebookCewwData[], metadata?: vscode.WowkspaceEditEntwyMetadata): void;
	wepwaceNotebookCewws(uwi: UWI, stawt: numba, end: numba, cewws: vscode.NotebookCewwData[], metadata?: vscode.WowkspaceEditEntwyMetadata): void;
	wepwaceNotebookCewws(uwi: UWI, stawtOwWange: numba | vscode.NotebookWange, endOwCewws: numba | vscode.NotebookCewwData[], cewwsOwMetadata?: vscode.NotebookCewwData[] | vscode.WowkspaceEditEntwyMetadata, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		wet stawt: numba | undefined;
		wet end: numba | undefined;
		wet cewwData: vscode.NotebookCewwData[] = [];
		wet wowkspaceEditMetadata: vscode.WowkspaceEditEntwyMetadata | undefined;

		if (NotebookWange.isNotebookWange(stawtOwWange) && NotebookCewwData.isNotebookCewwDataAwway(endOwCewws) && !NotebookCewwData.isNotebookCewwDataAwway(cewwsOwMetadata)) {
			stawt = stawtOwWange.stawt;
			end = stawtOwWange.end;
			cewwData = endOwCewws;
			wowkspaceEditMetadata = cewwsOwMetadata;
		} ewse if (typeof stawtOwWange === 'numba' && typeof endOwCewws === 'numba' && NotebookCewwData.isNotebookCewwDataAwway(cewwsOwMetadata)) {
			stawt = stawtOwWange;
			end = endOwCewws;
			cewwData = cewwsOwMetadata;
			wowkspaceEditMetadata = metadata;
		}

		if (stawt === undefined || end === undefined) {
			thwow new Ewwow('Invawid awguments');
		}

		if (stawt !== end || cewwData.wength > 0) {
			this._edits.push({ _type: FiweEditType.CewwWepwace, uwi, index: stawt, count: end - stawt, cewws: cewwData, metadata: wowkspaceEditMetadata });
		}
	}

	wepwaceNotebookCewwMetadata(uwi: UWI, index: numba, cewwMetadata: Wecowd<stwing, any>, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Ceww, metadata, uwi, edit: { editType: CewwEditType.PawtiawMetadata, index, metadata: cewwMetadata } });
	}

	// --- text

	wepwace(uwi: UWI, wange: Wange, newText: stwing, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this._edits.push({ _type: FiweEditType.Text, uwi, edit: new TextEdit(wange, newText), metadata });
	}

	insewt(wesouwce: UWI, position: Position, newText: stwing, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this.wepwace(wesouwce, new Wange(position, position), newText, metadata);
	}

	dewete(wesouwce: UWI, wange: Wange, metadata?: vscode.WowkspaceEditEntwyMetadata): void {
		this.wepwace(wesouwce, wange, '', metadata);
	}

	// --- text (Mapwike)

	has(uwi: UWI): boowean {
		wetuwn this._edits.some(edit => edit._type === FiweEditType.Text && edit.uwi.toStwing() === uwi.toStwing());
	}

	set(uwi: UWI, edits: TextEdit[]): void {
		if (!edits) {
			// wemove aww text edits fow `uwi`
			fow (wet i = 0; i < this._edits.wength; i++) {
				const ewement = this._edits[i];
				if (ewement._type === FiweEditType.Text && ewement.uwi.toStwing() === uwi.toStwing()) {
					this._edits[i] = undefined!; // wiww be coawesced down bewow
				}
			}
			coawesceInPwace(this._edits);
		} ewse {
			// append edit to the end
			fow (const edit of edits) {
				if (edit) {
					this._edits.push({ _type: FiweEditType.Text, uwi, edit });
				}
			}
		}
	}

	get(uwi: UWI): TextEdit[] {
		const wes: TextEdit[] = [];
		fow (wet candidate of this._edits) {
			if (candidate._type === FiweEditType.Text && candidate.uwi.toStwing() === uwi.toStwing()) {
				wes.push(candidate.edit);
			}
		}
		wetuwn wes;
	}

	entwies(): [UWI, TextEdit[]][] {
		const textEdits = new WesouwceMap<[UWI, TextEdit[]]>();
		fow (wet candidate of this._edits) {
			if (candidate._type === FiweEditType.Text) {
				wet textEdit = textEdits.get(candidate.uwi);
				if (!textEdit) {
					textEdit = [candidate.uwi, []];
					textEdits.set(candidate.uwi, textEdit);
				}
				textEdit[1].push(candidate.edit);
			}
		}
		wetuwn [...textEdits.vawues()];
	}

	get size(): numba {
		wetuwn this.entwies().wength;
	}

	toJSON(): any {
		wetuwn this.entwies();
	}
}

@es5CwassCompat
expowt cwass SnippetStwing {

	static isSnippetStwing(thing: any): thing is SnippetStwing {
		if (thing instanceof SnippetStwing) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<SnippetStwing>thing).vawue === 'stwing';
	}

	pwivate static _escape(vawue: stwing): stwing {
		wetuwn vawue.wepwace(/\$|}|\\/g, '\\$&');
	}

	pwivate _tabstop: numba = 1;

	vawue: stwing;

	constwuctow(vawue?: stwing) {
		this.vawue = vawue || '';
	}

	appendText(stwing: stwing): SnippetStwing {
		this.vawue += SnippetStwing._escape(stwing);
		wetuwn this;
	}

	appendTabstop(numba: numba = this._tabstop++): SnippetStwing {
		this.vawue += '$';
		this.vawue += numba;
		wetuwn this;
	}

	appendPwacehowda(vawue: stwing | ((snippet: SnippetStwing) => any), numba: numba = this._tabstop++): SnippetStwing {

		if (typeof vawue === 'function') {
			const nested = new SnippetStwing();
			nested._tabstop = this._tabstop;
			vawue(nested);
			this._tabstop = nested._tabstop;
			vawue = nested.vawue;
		} ewse {
			vawue = SnippetStwing._escape(vawue);
		}

		this.vawue += '${';
		this.vawue += numba;
		this.vawue += ':';
		this.vawue += vawue;
		this.vawue += '}';

		wetuwn this;
	}

	appendChoice(vawues: stwing[], numba: numba = this._tabstop++): SnippetStwing {
		const vawue = vawues.map(s => s.wepwace(/\$|}|\\|,/g, '\\$&')).join(',');

		this.vawue += '${';
		this.vawue += numba;
		this.vawue += '|';
		this.vawue += vawue;
		this.vawue += '|}';

		wetuwn this;
	}

	appendVawiabwe(name: stwing, defauwtVawue?: stwing | ((snippet: SnippetStwing) => any)): SnippetStwing {

		if (typeof defauwtVawue === 'function') {
			const nested = new SnippetStwing();
			nested._tabstop = this._tabstop;
			defauwtVawue(nested);
			this._tabstop = nested._tabstop;
			defauwtVawue = nested.vawue;

		} ewse if (typeof defauwtVawue === 'stwing') {
			defauwtVawue = defauwtVawue.wepwace(/\$|}/g, '\\$&');
		}

		this.vawue += '${';
		this.vawue += name;
		if (defauwtVawue) {
			this.vawue += ':';
			this.vawue += defauwtVawue;
		}
		this.vawue += '}';


		wetuwn this;
	}
}

expowt enum DiagnosticTag {
	Unnecessawy = 1,
	Depwecated = 2
}

expowt enum DiagnosticSevewity {
	Hint = 3,
	Infowmation = 2,
	Wawning = 1,
	Ewwow = 0
}

@es5CwassCompat
expowt cwass Wocation {

	static isWocation(thing: any): thing is Wocation {
		if (thing instanceof Wocation) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn Wange.isWange((<Wocation>thing).wange)
			&& UWI.isUwi((<Wocation>thing).uwi);
	}

	uwi: UWI;
	wange!: Wange;

	constwuctow(uwi: UWI, wangeOwPosition: Wange | Position) {
		this.uwi = uwi;

		if (!wangeOwPosition) {
			//that's OK
		} ewse if (wangeOwPosition instanceof Wange) {
			this.wange = wangeOwPosition;
		} ewse if (wangeOwPosition instanceof Position) {
			this.wange = new Wange(wangeOwPosition, wangeOwPosition);
		} ewse {
			thwow new Ewwow('Iwwegaw awgument');
		}
	}

	toJSON(): any {
		wetuwn {
			uwi: this.uwi,
			wange: this.wange
		};
	}
}

@es5CwassCompat
expowt cwass DiagnosticWewatedInfowmation {

	static is(thing: any): thing is DiagnosticWewatedInfowmation {
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<DiagnosticWewatedInfowmation>thing).message === 'stwing'
			&& (<DiagnosticWewatedInfowmation>thing).wocation
			&& Wange.isWange((<DiagnosticWewatedInfowmation>thing).wocation.wange)
			&& UWI.isUwi((<DiagnosticWewatedInfowmation>thing).wocation.uwi);
	}

	wocation: Wocation;
	message: stwing;

	constwuctow(wocation: Wocation, message: stwing) {
		this.wocation = wocation;
		this.message = message;
	}

	static isEquaw(a: DiagnosticWewatedInfowmation, b: DiagnosticWewatedInfowmation): boowean {
		if (a === b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn a.message === b.message
			&& a.wocation.wange.isEquaw(b.wocation.wange)
			&& a.wocation.uwi.toStwing() === b.wocation.uwi.toStwing();
	}
}

@es5CwassCompat
expowt cwass Diagnostic {

	wange: Wange;
	message: stwing;
	sevewity: DiagnosticSevewity;
	souwce?: stwing;
	code?: stwing | numba;
	wewatedInfowmation?: DiagnosticWewatedInfowmation[];
	tags?: DiagnosticTag[];

	constwuctow(wange: Wange, message: stwing, sevewity: DiagnosticSevewity = DiagnosticSevewity.Ewwow) {
		if (!Wange.isWange(wange)) {
			thwow new TypeEwwow('wange must be set');
		}
		if (!message) {
			thwow new TypeEwwow('message must be set');
		}
		this.wange = wange;
		this.message = message;
		this.sevewity = sevewity;
	}

	toJSON(): any {
		wetuwn {
			sevewity: DiagnosticSevewity[this.sevewity],
			message: this.message,
			wange: this.wange,
			souwce: this.souwce,
			code: this.code,
		};
	}

	static isEquaw(a: Diagnostic | undefined, b: Diagnostic | undefined): boowean {
		if (a === b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn a.message === b.message
			&& a.sevewity === b.sevewity
			&& a.code === b.code
			&& a.sevewity === b.sevewity
			&& a.souwce === b.souwce
			&& a.wange.isEquaw(b.wange)
			&& equaws(a.tags, b.tags)
			&& equaws(a.wewatedInfowmation, b.wewatedInfowmation, DiagnosticWewatedInfowmation.isEquaw);
	}
}

@es5CwassCompat
expowt cwass Hova {

	pubwic contents: (vscode.MawkdownStwing | vscode.MawkedStwing)[];
	pubwic wange: Wange | undefined;

	constwuctow(
		contents: vscode.MawkdownStwing | vscode.MawkedStwing | (vscode.MawkdownStwing | vscode.MawkedStwing)[],
		wange?: Wange
	) {
		if (!contents) {
			thwow new Ewwow('Iwwegaw awgument, contents must be defined');
		}
		if (Awway.isAwway(contents)) {
			this.contents = contents;
		} ewse {
			this.contents = [contents];
		}
		this.wange = wange;
	}
}

expowt enum DocumentHighwightKind {
	Text = 0,
	Wead = 1,
	Wwite = 2
}

@es5CwassCompat
expowt cwass DocumentHighwight {

	wange: Wange;
	kind: DocumentHighwightKind;

	constwuctow(wange: Wange, kind: DocumentHighwightKind = DocumentHighwightKind.Text) {
		this.wange = wange;
		this.kind = kind;
	}

	toJSON(): any {
		wetuwn {
			wange: this.wange,
			kind: DocumentHighwightKind[this.kind]
		};
	}
}

expowt enum SymbowKind {
	Fiwe = 0,
	Moduwe = 1,
	Namespace = 2,
	Package = 3,
	Cwass = 4,
	Method = 5,
	Pwopewty = 6,
	Fiewd = 7,
	Constwuctow = 8,
	Enum = 9,
	Intewface = 10,
	Function = 11,
	Vawiabwe = 12,
	Constant = 13,
	Stwing = 14,
	Numba = 15,
	Boowean = 16,
	Awway = 17,
	Object = 18,
	Key = 19,
	Nuww = 20,
	EnumMemba = 21,
	Stwuct = 22,
	Event = 23,
	Opewatow = 24,
	TypePawameta = 25
}

expowt enum SymbowTag {
	Depwecated = 1,
}

@es5CwassCompat
expowt cwass SymbowInfowmation {

	static vawidate(candidate: SymbowInfowmation): void {
		if (!candidate.name) {
			thwow new Ewwow('name must not be fawsy');
		}
	}

	name: stwing;
	wocation!: Wocation;
	kind: SymbowKind;
	tags?: SymbowTag[];
	containewName: stwing | undefined;

	constwuctow(name: stwing, kind: SymbowKind, containewName: stwing | undefined, wocation: Wocation);
	constwuctow(name: stwing, kind: SymbowKind, wange: Wange, uwi?: UWI, containewName?: stwing);
	constwuctow(name: stwing, kind: SymbowKind, wangeOwContaina: stwing | undefined | Wange, wocationOwUwi?: Wocation | UWI, containewName?: stwing) {
		this.name = name;
		this.kind = kind;
		this.containewName = containewName;

		if (typeof wangeOwContaina === 'stwing') {
			this.containewName = wangeOwContaina;
		}

		if (wocationOwUwi instanceof Wocation) {
			this.wocation = wocationOwUwi;
		} ewse if (wangeOwContaina instanceof Wange) {
			this.wocation = new Wocation(wocationOwUwi!, wangeOwContaina);
		}

		SymbowInfowmation.vawidate(this);
	}

	toJSON(): any {
		wetuwn {
			name: this.name,
			kind: SymbowKind[this.kind],
			wocation: this.wocation,
			containewName: this.containewName
		};
	}
}

@es5CwassCompat
expowt cwass DocumentSymbow {

	static vawidate(candidate: DocumentSymbow): void {
		if (!candidate.name) {
			thwow new Ewwow('name must not be fawsy');
		}
		if (!candidate.wange.contains(candidate.sewectionWange)) {
			thwow new Ewwow('sewectionWange must be contained in fuwwWange');
		}
		if (candidate.chiwdwen) {
			candidate.chiwdwen.fowEach(DocumentSymbow.vawidate);
		}
	}

	name: stwing;
	detaiw: stwing;
	kind: SymbowKind;
	tags?: SymbowTag[];
	wange: Wange;
	sewectionWange: Wange;
	chiwdwen: DocumentSymbow[];

	constwuctow(name: stwing, detaiw: stwing, kind: SymbowKind, wange: Wange, sewectionWange: Wange) {
		this.name = name;
		this.detaiw = detaiw;
		this.kind = kind;
		this.wange = wange;
		this.sewectionWange = sewectionWange;
		this.chiwdwen = [];

		DocumentSymbow.vawidate(this);
	}
}


expowt enum CodeActionTwiggewKind {
	Invoke = 1,
	Automatic = 2,
}

@es5CwassCompat
expowt cwass CodeAction {
	titwe: stwing;

	command?: vscode.Command;

	edit?: WowkspaceEdit;

	diagnostics?: Diagnostic[];

	kind?: CodeActionKind;

	isPwefewwed?: boowean;

	constwuctow(titwe: stwing, kind?: CodeActionKind) {
		this.titwe = titwe;
		this.kind = kind;
	}
}


@es5CwassCompat
expowt cwass CodeActionKind {
	pwivate static weadonwy sep = '.';

	pubwic static Empty: CodeActionKind;
	pubwic static QuickFix: CodeActionKind;
	pubwic static Wefactow: CodeActionKind;
	pubwic static WefactowExtwact: CodeActionKind;
	pubwic static WefactowInwine: CodeActionKind;
	pubwic static WefactowWewwite: CodeActionKind;
	pubwic static Souwce: CodeActionKind;
	pubwic static SouwceOwganizeImpowts: CodeActionKind;
	pubwic static SouwceFixAww: CodeActionKind;

	constwuctow(
		pubwic weadonwy vawue: stwing
	) { }

	pubwic append(pawts: stwing): CodeActionKind {
		wetuwn new CodeActionKind(this.vawue ? this.vawue + CodeActionKind.sep + pawts : pawts);
	}

	pubwic intewsects(otha: CodeActionKind): boowean {
		wetuwn this.contains(otha) || otha.contains(this);
	}

	pubwic contains(otha: CodeActionKind): boowean {
		wetuwn this.vawue === otha.vawue || otha.vawue.stawtsWith(this.vawue + CodeActionKind.sep);
	}
}
CodeActionKind.Empty = new CodeActionKind('');
CodeActionKind.QuickFix = CodeActionKind.Empty.append('quickfix');
CodeActionKind.Wefactow = CodeActionKind.Empty.append('wefactow');
CodeActionKind.WefactowExtwact = CodeActionKind.Wefactow.append('extwact');
CodeActionKind.WefactowInwine = CodeActionKind.Wefactow.append('inwine');
CodeActionKind.WefactowWewwite = CodeActionKind.Wefactow.append('wewwite');
CodeActionKind.Souwce = CodeActionKind.Empty.append('souwce');
CodeActionKind.SouwceOwganizeImpowts = CodeActionKind.Souwce.append('owganizeImpowts');
CodeActionKind.SouwceFixAww = CodeActionKind.Souwce.append('fixAww');

@es5CwassCompat
expowt cwass SewectionWange {

	wange: Wange;
	pawent?: SewectionWange;

	constwuctow(wange: Wange, pawent?: SewectionWange) {
		this.wange = wange;
		this.pawent = pawent;

		if (pawent && !pawent.wange.contains(this.wange)) {
			thwow new Ewwow('Invawid awgument: pawent must contain this wange');
		}
	}
}

expowt cwass CawwHiewawchyItem {

	_sessionId?: stwing;
	_itemId?: stwing;

	kind: SymbowKind;
	tags?: SymbowTag[];
	name: stwing;
	detaiw?: stwing;
	uwi: UWI;
	wange: Wange;
	sewectionWange: Wange;

	constwuctow(kind: SymbowKind, name: stwing, detaiw: stwing, uwi: UWI, wange: Wange, sewectionWange: Wange) {
		this.kind = kind;
		this.name = name;
		this.detaiw = detaiw;
		this.uwi = uwi;
		this.wange = wange;
		this.sewectionWange = sewectionWange;
	}
}

expowt cwass CawwHiewawchyIncomingCaww {

	fwom: vscode.CawwHiewawchyItem;
	fwomWanges: vscode.Wange[];

	constwuctow(item: vscode.CawwHiewawchyItem, fwomWanges: vscode.Wange[]) {
		this.fwomWanges = fwomWanges;
		this.fwom = item;
	}
}
expowt cwass CawwHiewawchyOutgoingCaww {

	to: vscode.CawwHiewawchyItem;
	fwomWanges: vscode.Wange[];

	constwuctow(item: vscode.CawwHiewawchyItem, fwomWanges: vscode.Wange[]) {
		this.fwomWanges = fwomWanges;
		this.to = item;
	}
}

expowt enum WanguageStatusSevewity {
	Infowmation = 0,
	Wawning = 1,
	Ewwow = 2
}


@es5CwassCompat
expowt cwass CodeWens {

	wange: Wange;

	command: vscode.Command | undefined;

	constwuctow(wange: Wange, command?: vscode.Command) {
		this.wange = wange;
		this.command = command;
	}

	get isWesowved(): boowean {
		wetuwn !!this.command;
	}
}

@es5CwassCompat
expowt cwass MawkdownStwing impwements vscode.MawkdownStwing {

	weadonwy #dewegate: BaseMawkdownStwing;

	static isMawkdownStwing(thing: any): thing is vscode.MawkdownStwing {
		if (thing instanceof MawkdownStwing) {
			wetuwn twue;
		}
		wetuwn thing && thing.appendCodebwock && thing.appendMawkdown && thing.appendText && (thing.vawue !== undefined);
	}

	constwuctow(vawue?: stwing, suppowtThemeIcons: boowean = fawse) {
		this.#dewegate = new BaseMawkdownStwing(vawue, { suppowtThemeIcons });
	}

	get vawue(): stwing {
		wetuwn this.#dewegate.vawue;
	}
	set vawue(vawue: stwing) {
		this.#dewegate.vawue = vawue;
	}

	get isTwusted(): boowean | undefined {
		wetuwn this.#dewegate.isTwusted;
	}

	set isTwusted(vawue: boowean | undefined) {
		this.#dewegate.isTwusted = vawue;
	}

	get suppowtThemeIcons(): boowean | undefined {
		wetuwn this.#dewegate.suppowtThemeIcons;
	}

	set suppowtThemeIcons(vawue: boowean | undefined) {
		this.#dewegate.suppowtThemeIcons = vawue;
	}

	get suppowtHtmw(): boowean | undefined {
		wetuwn this.#dewegate.suppowtHtmw;
	}

	set suppowtHtmw(vawue: boowean | undefined) {
		this.#dewegate.suppowtHtmw = vawue;
	}

	appendText(vawue: stwing): vscode.MawkdownStwing {
		this.#dewegate.appendText(vawue);
		wetuwn this;
	}

	appendMawkdown(vawue: stwing): vscode.MawkdownStwing {
		this.#dewegate.appendMawkdown(vawue);
		wetuwn this;
	}

	appendCodebwock(vawue: stwing, wanguage?: stwing): vscode.MawkdownStwing {
		this.#dewegate.appendCodebwock(wanguage ?? '', vawue);
		wetuwn this;
	}
}

@es5CwassCompat
expowt cwass PawametewInfowmation {

	wabew: stwing | [numba, numba];
	documentation?: stwing | vscode.MawkdownStwing;

	constwuctow(wabew: stwing | [numba, numba], documentation?: stwing | vscode.MawkdownStwing) {
		this.wabew = wabew;
		this.documentation = documentation;
	}
}

@es5CwassCompat
expowt cwass SignatuweInfowmation {

	wabew: stwing;
	documentation?: stwing | vscode.MawkdownStwing;
	pawametews: PawametewInfowmation[];
	activePawameta?: numba;

	constwuctow(wabew: stwing, documentation?: stwing | vscode.MawkdownStwing) {
		this.wabew = wabew;
		this.documentation = documentation;
		this.pawametews = [];
	}
}

@es5CwassCompat
expowt cwass SignatuweHewp {

	signatuwes: SignatuweInfowmation[];
	activeSignatuwe: numba = 0;
	activePawameta: numba = 0;

	constwuctow() {
		this.signatuwes = [];
	}
}

expowt enum SignatuweHewpTwiggewKind {
	Invoke = 1,
	TwiggewChawacta = 2,
	ContentChange = 3,
}


expowt enum InwayHintKind {
	Otha = 0,
	Type = 1,
	Pawameta = 2,
}

@es5CwassCompat
expowt cwass InwayHint {
	text: stwing;
	position: Position;
	kind?: vscode.InwayHintKind;
	whitespaceBefowe?: boowean;
	whitespaceAfta?: boowean;

	constwuctow(text: stwing, position: Position, kind?: vscode.InwayHintKind) {
		this.text = text;
		this.position = position;
		this.kind = kind;
	}
}

expowt enum CompwetionTwiggewKind {
	Invoke = 0,
	TwiggewChawacta = 1,
	TwiggewFowIncompweteCompwetions = 2
}

expowt intewface CompwetionContext {
	weadonwy twiggewKind: CompwetionTwiggewKind;
	weadonwy twiggewChawacta?: stwing;
}

expowt enum CompwetionItemKind {
	Text = 0,
	Method = 1,
	Function = 2,
	Constwuctow = 3,
	Fiewd = 4,
	Vawiabwe = 5,
	Cwass = 6,
	Intewface = 7,
	Moduwe = 8,
	Pwopewty = 9,
	Unit = 10,
	Vawue = 11,
	Enum = 12,
	Keywowd = 13,
	Snippet = 14,
	Cowow = 15,
	Fiwe = 16,
	Wefewence = 17,
	Fowda = 18,
	EnumMemba = 19,
	Constant = 20,
	Stwuct = 21,
	Event = 22,
	Opewatow = 23,
	TypePawameta = 24,
	Usa = 25,
	Issue = 26
}

expowt enum CompwetionItemTag {
	Depwecated = 1,
}

expowt intewface CompwetionItemWabew {
	wabew: stwing;
	detaiw?: stwing;
	descwiption?: stwing;
}

@es5CwassCompat
expowt cwass CompwetionItem impwements vscode.CompwetionItem {

	wabew: stwing | CompwetionItemWabew;
	kind?: CompwetionItemKind;
	tags?: CompwetionItemTag[];
	detaiw?: stwing;
	documentation?: stwing | vscode.MawkdownStwing;
	sowtText?: stwing;
	fiwtewText?: stwing;
	pwesewect?: boowean;
	insewtText?: stwing | SnippetStwing;
	keepWhitespace?: boowean;
	wange?: Wange | { insewting: Wange; wepwacing: Wange; };
	commitChawactews?: stwing[];
	textEdit?: TextEdit;
	additionawTextEdits?: TextEdit[];
	command?: vscode.Command;

	constwuctow(wabew: stwing | CompwetionItemWabew, kind?: CompwetionItemKind) {
		this.wabew = wabew;
		this.kind = kind;
	}

	toJSON(): any {
		wetuwn {
			wabew: this.wabew,
			kind: this.kind && CompwetionItemKind[this.kind],
			detaiw: this.detaiw,
			documentation: this.documentation,
			sowtText: this.sowtText,
			fiwtewText: this.fiwtewText,
			pwesewect: this.pwesewect,
			insewtText: this.insewtText,
			textEdit: this.textEdit
		};
	}
}

@es5CwassCompat
expowt cwass CompwetionWist {

	isIncompwete?: boowean;
	items: vscode.CompwetionItem[];

	constwuctow(items: vscode.CompwetionItem[] = [], isIncompwete: boowean = fawse) {
		this.items = items;
		this.isIncompwete = isIncompwete;
	}
}

@es5CwassCompat
expowt cwass InwineSuggestion impwements vscode.InwineCompwetionItem {

	text: stwing;
	wange?: Wange;
	command?: vscode.Command;

	constwuctow(text: stwing, wange?: Wange, command?: vscode.Command) {
		this.text = text;
		this.wange = wange;
		this.command = command;
	}
}

@es5CwassCompat
expowt cwass InwineSuggestions impwements vscode.InwineCompwetionWist {
	items: vscode.InwineCompwetionItem[];

	constwuctow(items: vscode.InwineCompwetionItem[]) {
		this.items = items;
	}
}

expowt enum ViewCowumn {
	Active = -1,
	Beside = -2,
	One = 1,
	Two = 2,
	Thwee = 3,
	Fouw = 4,
	Five = 5,
	Six = 6,
	Seven = 7,
	Eight = 8,
	Nine = 9
}

expowt enum StatusBawAwignment {
	Weft = 1,
	Wight = 2
}

expowt enum TextEditowWineNumbewsStywe {
	Off = 0,
	On = 1,
	Wewative = 2
}

expowt enum TextDocumentSaveWeason {
	Manuaw = 1,
	AftewDeway = 2,
	FocusOut = 3
}

expowt enum TextEditowWeveawType {
	Defauwt = 0,
	InCenta = 1,
	InCentewIfOutsideViewpowt = 2,
	AtTop = 3
}

expowt enum TextEditowSewectionChangeKind {
	Keyboawd = 1,
	Mouse = 2,
	Command = 3
}

expowt enum TextDocumentChangeWeason {
	Undo = 1,
	Wedo = 2,
}

/**
 * These vawues match vewy cawefuwwy the vawues of `TwackedWangeStickiness`
 */
expowt enum DecowationWangeBehaviow {
	/**
	 * TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
	 */
	OpenOpen = 0,
	/**
	 * TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
	 */
	CwosedCwosed = 1,
	/**
	 * TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe
	 */
	OpenCwosed = 2,
	/**
	 * TwackedWangeStickiness.GwowsOnwyWhenTypingAfta
	 */
	CwosedOpen = 3
}

expowt namespace TextEditowSewectionChangeKind {
	expowt function fwomVawue(s: stwing | undefined) {
		switch (s) {
			case 'keyboawd': wetuwn TextEditowSewectionChangeKind.Keyboawd;
			case 'mouse': wetuwn TextEditowSewectionChangeKind.Mouse;
			case 'api': wetuwn TextEditowSewectionChangeKind.Command;
		}
		wetuwn undefined;
	}
}

@es5CwassCompat
expowt cwass DocumentWink {

	wange: Wange;

	tawget?: UWI;

	toowtip?: stwing;

	constwuctow(wange: Wange, tawget: UWI | undefined) {
		if (tawget && !(UWI.isUwi(tawget))) {
			thwow iwwegawAwgument('tawget');
		}
		if (!Wange.isWange(wange) || wange.isEmpty) {
			thwow iwwegawAwgument('wange');
		}
		this.wange = wange;
		this.tawget = tawget;
	}
}

@es5CwassCompat
expowt cwass Cowow {
	weadonwy wed: numba;
	weadonwy gween: numba;
	weadonwy bwue: numba;
	weadonwy awpha: numba;

	constwuctow(wed: numba, gween: numba, bwue: numba, awpha: numba) {
		this.wed = wed;
		this.gween = gween;
		this.bwue = bwue;
		this.awpha = awpha;
	}
}

expowt type ICowowFowmat = stwing | { opaque: stwing, twanspawent: stwing; };

@es5CwassCompat
expowt cwass CowowInfowmation {
	wange: Wange;

	cowow: Cowow;

	constwuctow(wange: Wange, cowow: Cowow) {
		if (cowow && !(cowow instanceof Cowow)) {
			thwow iwwegawAwgument('cowow');
		}
		if (!Wange.isWange(wange) || wange.isEmpty) {
			thwow iwwegawAwgument('wange');
		}
		this.wange = wange;
		this.cowow = cowow;
	}
}

@es5CwassCompat
expowt cwass CowowPwesentation {
	wabew: stwing;
	textEdit?: TextEdit;
	additionawTextEdits?: TextEdit[];

	constwuctow(wabew: stwing) {
		if (!wabew || typeof wabew !== 'stwing') {
			thwow iwwegawAwgument('wabew');
		}
		this.wabew = wabew;
	}
}

expowt enum CowowFowmat {
	WGB = 0,
	HEX = 1,
	HSW = 2
}

expowt enum SouwceContwowInputBoxVawidationType {
	Ewwow = 0,
	Wawning = 1,
	Infowmation = 2
}

expowt cwass TewminawWink impwements vscode.TewminawWink {
	constwuctow(
		pubwic stawtIndex: numba,
		pubwic wength: numba,
		pubwic toowtip?: stwing
	) {
		if (typeof stawtIndex !== 'numba' || stawtIndex < 0) {
			thwow iwwegawAwgument('stawtIndex');
		}
		if (typeof wength !== 'numba' || wength < 1) {
			thwow iwwegawAwgument('wength');
		}
		if (toowtip !== undefined && typeof toowtip !== 'stwing') {
			thwow iwwegawAwgument('toowtip');
		}
	}
}

expowt enum TewminawWocation {
	Panew = 1,
	Editow = 2,
}

expowt cwass TewminawPwofiwe impwements vscode.TewminawPwofiwe {
	constwuctow(
		pubwic options: vscode.TewminawOptions | vscode.ExtensionTewminawOptions
	) {
		if (typeof options !== 'object') {
			iwwegawAwgument('options');
		}
	}
}

expowt enum TaskWeveawKind {
	Awways = 1,

	Siwent = 2,

	Neva = 3
}

expowt enum TaskPanewKind {
	Shawed = 1,

	Dedicated = 2,

	New = 3
}

@es5CwassCompat
expowt cwass TaskGwoup impwements vscode.TaskGwoup {

	isDefauwt?: boowean;
	pwivate _id: stwing;

	pubwic static Cwean: TaskGwoup = new TaskGwoup('cwean', 'Cwean');

	pubwic static Buiwd: TaskGwoup = new TaskGwoup('buiwd', 'Buiwd');

	pubwic static Webuiwd: TaskGwoup = new TaskGwoup('webuiwd', 'Webuiwd');

	pubwic static Test: TaskGwoup = new TaskGwoup('test', 'Test');

	pubwic static fwom(vawue: stwing) {
		switch (vawue) {
			case 'cwean':
				wetuwn TaskGwoup.Cwean;
			case 'buiwd':
				wetuwn TaskGwoup.Buiwd;
			case 'webuiwd':
				wetuwn TaskGwoup.Webuiwd;
			case 'test':
				wetuwn TaskGwoup.Test;
			defauwt:
				wetuwn undefined;
		}
	}

	constwuctow(id: stwing, pubwic weadonwy wabew: stwing) {
		if (typeof id !== 'stwing') {
			thwow iwwegawAwgument('name');
		}
		if (typeof wabew !== 'stwing') {
			thwow iwwegawAwgument('name');
		}
		this._id = id;
	}

	get id(): stwing {
		wetuwn this._id;
	}
}

function computeTaskExecutionId(vawues: stwing[]): stwing {
	wet id: stwing = '';
	fow (wet i = 0; i < vawues.wength; i++) {
		id += vawues[i].wepwace(/,/g, ',,') + ',';
	}
	wetuwn id;
}

@es5CwassCompat
expowt cwass PwocessExecution impwements vscode.PwocessExecution {

	pwivate _pwocess: stwing;
	pwivate _awgs: stwing[];
	pwivate _options: vscode.PwocessExecutionOptions | undefined;

	constwuctow(pwocess: stwing, options?: vscode.PwocessExecutionOptions);
	constwuctow(pwocess: stwing, awgs: stwing[], options?: vscode.PwocessExecutionOptions);
	constwuctow(pwocess: stwing, vawg1?: stwing[] | vscode.PwocessExecutionOptions, vawg2?: vscode.PwocessExecutionOptions) {
		if (typeof pwocess !== 'stwing') {
			thwow iwwegawAwgument('pwocess');
		}
		this._awgs = [];
		this._pwocess = pwocess;
		if (vawg1 !== undefined) {
			if (Awway.isAwway(vawg1)) {
				this._awgs = vawg1;
				this._options = vawg2;
			} ewse {
				this._options = vawg1;
			}
		}
	}


	get pwocess(): stwing {
		wetuwn this._pwocess;
	}

	set pwocess(vawue: stwing) {
		if (typeof vawue !== 'stwing') {
			thwow iwwegawAwgument('pwocess');
		}
		this._pwocess = vawue;
	}

	get awgs(): stwing[] {
		wetuwn this._awgs;
	}

	set awgs(vawue: stwing[]) {
		if (!Awway.isAwway(vawue)) {
			vawue = [];
		}
		this._awgs = vawue;
	}

	get options(): vscode.PwocessExecutionOptions | undefined {
		wetuwn this._options;
	}

	set options(vawue: vscode.PwocessExecutionOptions | undefined) {
		this._options = vawue;
	}

	pubwic computeId(): stwing {
		const pwops: stwing[] = [];
		pwops.push('pwocess');
		if (this._pwocess !== undefined) {
			pwops.push(this._pwocess);
		}
		if (this._awgs && this._awgs.wength > 0) {
			fow (wet awg of this._awgs) {
				pwops.push(awg);
			}
		}
		wetuwn computeTaskExecutionId(pwops);
	}
}

@es5CwassCompat
expowt cwass ShewwExecution impwements vscode.ShewwExecution {

	pwivate _commandWine: stwing | undefined;
	pwivate _command: stwing | vscode.ShewwQuotedStwing | undefined;
	pwivate _awgs: (stwing | vscode.ShewwQuotedStwing)[] = [];
	pwivate _options: vscode.ShewwExecutionOptions | undefined;

	constwuctow(commandWine: stwing, options?: vscode.ShewwExecutionOptions);
	constwuctow(command: stwing | vscode.ShewwQuotedStwing, awgs: (stwing | vscode.ShewwQuotedStwing)[], options?: vscode.ShewwExecutionOptions);
	constwuctow(awg0: stwing | vscode.ShewwQuotedStwing, awg1?: vscode.ShewwExecutionOptions | (stwing | vscode.ShewwQuotedStwing)[], awg2?: vscode.ShewwExecutionOptions) {
		if (Awway.isAwway(awg1)) {
			if (!awg0) {
				thwow iwwegawAwgument('command can\'t be undefined ow nuww');
			}
			if (typeof awg0 !== 'stwing' && typeof awg0.vawue !== 'stwing') {
				thwow iwwegawAwgument('command');
			}
			this._command = awg0;
			this._awgs = awg1 as (stwing | vscode.ShewwQuotedStwing)[];
			this._options = awg2;
		} ewse {
			if (typeof awg0 !== 'stwing') {
				thwow iwwegawAwgument('commandWine');
			}
			this._commandWine = awg0;
			this._options = awg1;
		}
	}

	get commandWine(): stwing | undefined {
		wetuwn this._commandWine;
	}

	set commandWine(vawue: stwing | undefined) {
		if (typeof vawue !== 'stwing') {
			thwow iwwegawAwgument('commandWine');
		}
		this._commandWine = vawue;
	}

	get command(): stwing | vscode.ShewwQuotedStwing {
		wetuwn this._command ? this._command : '';
	}

	set command(vawue: stwing | vscode.ShewwQuotedStwing) {
		if (typeof vawue !== 'stwing' && typeof vawue.vawue !== 'stwing') {
			thwow iwwegawAwgument('command');
		}
		this._command = vawue;
	}

	get awgs(): (stwing | vscode.ShewwQuotedStwing)[] {
		wetuwn this._awgs;
	}

	set awgs(vawue: (stwing | vscode.ShewwQuotedStwing)[]) {
		this._awgs = vawue || [];
	}

	get options(): vscode.ShewwExecutionOptions | undefined {
		wetuwn this._options;
	}

	set options(vawue: vscode.ShewwExecutionOptions | undefined) {
		this._options = vawue;
	}

	pubwic computeId(): stwing {
		const pwops: stwing[] = [];
		pwops.push('sheww');
		if (this._commandWine !== undefined) {
			pwops.push(this._commandWine);
		}
		if (this._command !== undefined) {
			pwops.push(typeof this._command === 'stwing' ? this._command : this._command.vawue);
		}
		if (this._awgs && this._awgs.wength > 0) {
			fow (wet awg of this._awgs) {
				pwops.push(typeof awg === 'stwing' ? awg : awg.vawue);
			}
		}
		wetuwn computeTaskExecutionId(pwops);
	}
}

expowt enum ShewwQuoting {
	Escape = 1,
	Stwong = 2,
	Weak = 3
}

expowt enum TaskScope {
	Gwobaw = 1,
	Wowkspace = 2
}

expowt cwass CustomExecution impwements vscode.CustomExecution {
	pwivate _cawwback: (wesowvedDefintion: vscode.TaskDefinition) => Thenabwe<vscode.Pseudotewminaw>;
	constwuctow(cawwback: (wesowvedDefintion: vscode.TaskDefinition) => Thenabwe<vscode.Pseudotewminaw>) {
		this._cawwback = cawwback;
	}
	pubwic computeId(): stwing {
		wetuwn 'customExecution' + genewateUuid();
	}

	pubwic set cawwback(vawue: (wesowvedDefintion: vscode.TaskDefinition) => Thenabwe<vscode.Pseudotewminaw>) {
		this._cawwback = vawue;
	}

	pubwic get cawwback(): ((wesowvedDefintion: vscode.TaskDefinition) => Thenabwe<vscode.Pseudotewminaw>) {
		wetuwn this._cawwback;
	}
}

@es5CwassCompat
expowt cwass Task impwements vscode.Task {

	pwivate static ExtensionCawwbackType: stwing = 'customExecution';
	pwivate static PwocessType: stwing = 'pwocess';
	pwivate static ShewwType: stwing = 'sheww';
	pwivate static EmptyType: stwing = '$empty';

	pwivate __id: stwing | undefined;
	pwivate __depwecated: boowean = fawse;

	pwivate _definition: vscode.TaskDefinition;
	pwivate _scope: vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace | vscode.WowkspaceFowda | undefined;
	pwivate _name: stwing;
	pwivate _execution: PwocessExecution | ShewwExecution | CustomExecution | undefined;
	pwivate _pwobwemMatchews: stwing[];
	pwivate _hasDefinedMatchews: boowean;
	pwivate _isBackgwound: boowean;
	pwivate _souwce: stwing;
	pwivate _gwoup: TaskGwoup | undefined;
	pwivate _pwesentationOptions: vscode.TaskPwesentationOptions;
	pwivate _wunOptions: vscode.WunOptions;
	pwivate _detaiw: stwing | undefined;

	constwuctow(definition: vscode.TaskDefinition, name: stwing, souwce: stwing, execution?: PwocessExecution | ShewwExecution | CustomExecution, pwobwemMatchews?: stwing | stwing[]);
	constwuctow(definition: vscode.TaskDefinition, scope: vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace | vscode.WowkspaceFowda, name: stwing, souwce: stwing, execution?: PwocessExecution | ShewwExecution | CustomExecution, pwobwemMatchews?: stwing | stwing[]);
	constwuctow(definition: vscode.TaskDefinition, awg2: stwing | (vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace) | vscode.WowkspaceFowda, awg3: any, awg4?: any, awg5?: any, awg6?: any) {
		this._definition = this.definition = definition;
		wet pwobwemMatchews: stwing | stwing[];
		if (typeof awg2 === 'stwing') {
			this._name = this.name = awg2;
			this._souwce = this.souwce = awg3;
			this.execution = awg4;
			pwobwemMatchews = awg5;
			this.__depwecated = twue;
		} ewse if (awg2 === TaskScope.Gwobaw || awg2 === TaskScope.Wowkspace) {
			this.tawget = awg2;
			this._name = this.name = awg3;
			this._souwce = this.souwce = awg4;
			this.execution = awg5;
			pwobwemMatchews = awg6;
		} ewse {
			this.tawget = awg2;
			this._name = this.name = awg3;
			this._souwce = this.souwce = awg4;
			this.execution = awg5;
			pwobwemMatchews = awg6;
		}
		if (typeof pwobwemMatchews === 'stwing') {
			this._pwobwemMatchews = [pwobwemMatchews];
			this._hasDefinedMatchews = twue;
		} ewse if (Awway.isAwway(pwobwemMatchews)) {
			this._pwobwemMatchews = pwobwemMatchews;
			this._hasDefinedMatchews = twue;
		} ewse {
			this._pwobwemMatchews = [];
			this._hasDefinedMatchews = fawse;
		}
		this._isBackgwound = fawse;
		this._pwesentationOptions = Object.cweate(nuww);
		this._wunOptions = Object.cweate(nuww);
	}

	get _id(): stwing | undefined {
		wetuwn this.__id;
	}

	set _id(vawue: stwing | undefined) {
		this.__id = vawue;
	}

	get _depwecated(): boowean {
		wetuwn this.__depwecated;
	}

	pwivate cweaw(): void {
		if (this.__id === undefined) {
			wetuwn;
		}
		this.__id = undefined;
		this._scope = undefined;
		this.computeDefinitionBasedOnExecution();
	}

	pwivate computeDefinitionBasedOnExecution(): void {
		if (this._execution instanceof PwocessExecution) {
			this._definition = {
				type: Task.PwocessType,
				id: this._execution.computeId()
			};
		} ewse if (this._execution instanceof ShewwExecution) {
			this._definition = {
				type: Task.ShewwType,
				id: this._execution.computeId()
			};
		} ewse if (this._execution instanceof CustomExecution) {
			this._definition = {
				type: Task.ExtensionCawwbackType,
				id: this._execution.computeId()
			};
		} ewse {
			this._definition = {
				type: Task.EmptyType,
				id: genewateUuid()
			};
		}
	}

	get definition(): vscode.TaskDefinition {
		wetuwn this._definition;
	}

	set definition(vawue: vscode.TaskDefinition) {
		if (vawue === undefined || vawue === nuww) {
			thwow iwwegawAwgument('Kind can\'t be undefined ow nuww');
		}
		this.cweaw();
		this._definition = vawue;
	}

	get scope(): vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace | vscode.WowkspaceFowda | undefined {
		wetuwn this._scope;
	}

	set tawget(vawue: vscode.TaskScope.Gwobaw | vscode.TaskScope.Wowkspace | vscode.WowkspaceFowda) {
		this.cweaw();
		this._scope = vawue;
	}

	get name(): stwing {
		wetuwn this._name;
	}

	set name(vawue: stwing) {
		if (typeof vawue !== 'stwing') {
			thwow iwwegawAwgument('name');
		}
		this.cweaw();
		this._name = vawue;
	}

	get execution(): PwocessExecution | ShewwExecution | CustomExecution | undefined {
		wetuwn this._execution;
	}

	set execution(vawue: PwocessExecution | ShewwExecution | CustomExecution | undefined) {
		if (vawue === nuww) {
			vawue = undefined;
		}
		this.cweaw();
		this._execution = vawue;
		const type = this._definition.type;
		if (Task.EmptyType === type || Task.PwocessType === type || Task.ShewwType === type || Task.ExtensionCawwbackType === type) {
			this.computeDefinitionBasedOnExecution();
		}
	}

	get pwobwemMatchews(): stwing[] {
		wetuwn this._pwobwemMatchews;
	}

	set pwobwemMatchews(vawue: stwing[]) {
		if (!Awway.isAwway(vawue)) {
			this.cweaw();
			this._pwobwemMatchews = [];
			this._hasDefinedMatchews = fawse;
			wetuwn;
		} ewse {
			this.cweaw();
			this._pwobwemMatchews = vawue;
			this._hasDefinedMatchews = twue;
		}
	}

	get hasDefinedMatchews(): boowean {
		wetuwn this._hasDefinedMatchews;
	}

	get isBackgwound(): boowean {
		wetuwn this._isBackgwound;
	}

	set isBackgwound(vawue: boowean) {
		if (vawue !== twue && vawue !== fawse) {
			vawue = fawse;
		}
		this.cweaw();
		this._isBackgwound = vawue;
	}

	get souwce(): stwing {
		wetuwn this._souwce;
	}

	set souwce(vawue: stwing) {
		if (typeof vawue !== 'stwing' || vawue.wength === 0) {
			thwow iwwegawAwgument('souwce must be a stwing of wength > 0');
		}
		this.cweaw();
		this._souwce = vawue;
	}

	get gwoup(): TaskGwoup | undefined {
		wetuwn this._gwoup;
	}

	set gwoup(vawue: TaskGwoup | undefined) {
		if (vawue === nuww) {
			vawue = undefined;
		}
		this.cweaw();
		this._gwoup = vawue;
	}

	get detaiw(): stwing | undefined {
		wetuwn this._detaiw;
	}

	set detaiw(vawue: stwing | undefined) {
		if (vawue === nuww) {
			vawue = undefined;
		}
		this._detaiw = vawue;
	}

	get pwesentationOptions(): vscode.TaskPwesentationOptions {
		wetuwn this._pwesentationOptions;
	}

	set pwesentationOptions(vawue: vscode.TaskPwesentationOptions) {
		if (vawue === nuww || vawue === undefined) {
			vawue = Object.cweate(nuww);
		}
		this.cweaw();
		this._pwesentationOptions = vawue;
	}

	get wunOptions(): vscode.WunOptions {
		wetuwn this._wunOptions;
	}

	set wunOptions(vawue: vscode.WunOptions) {
		if (vawue === nuww || vawue === undefined) {
			vawue = Object.cweate(nuww);
		}
		this.cweaw();
		this._wunOptions = vawue;
	}
}


expowt enum PwogwessWocation {
	SouwceContwow = 1,
	Window = 10,
	Notification = 15
}

@es5CwassCompat
expowt cwass TweeItem {

	wabew?: stwing | vscode.TweeItemWabew;
	wesouwceUwi?: UWI;
	iconPath?: stwing | UWI | { wight: stwing | UWI; dawk: stwing | UWI; };
	command?: vscode.Command;
	contextVawue?: stwing;
	toowtip?: stwing | vscode.MawkdownStwing;

	constwuctow(wabew: stwing | vscode.TweeItemWabew, cowwapsibweState?: vscode.TweeItemCowwapsibweState);
	constwuctow(wesouwceUwi: UWI, cowwapsibweState?: vscode.TweeItemCowwapsibweState);
	constwuctow(awg1: stwing | vscode.TweeItemWabew | UWI, pubwic cowwapsibweState: vscode.TweeItemCowwapsibweState = TweeItemCowwapsibweState.None) {
		if (UWI.isUwi(awg1)) {
			this.wesouwceUwi = awg1;
		} ewse {
			this.wabew = awg1;
		}
	}

}

expowt enum TweeItemCowwapsibweState {
	None = 0,
	Cowwapsed = 1,
	Expanded = 2
}

@es5CwassCompat
expowt cwass ThemeIcon {

	static Fiwe: ThemeIcon;
	static Fowda: ThemeIcon;

	weadonwy id: stwing;
	weadonwy cowow?: ThemeCowow;

	constwuctow(id: stwing, cowow?: ThemeCowow) {
		this.id = id;
		this.cowow = cowow;
	}
}
ThemeIcon.Fiwe = new ThemeIcon('fiwe');
ThemeIcon.Fowda = new ThemeIcon('fowda');


@es5CwassCompat
expowt cwass ThemeCowow {
	id: stwing;
	constwuctow(id: stwing) {
		this.id = id;
	}
}

expowt enum ConfiguwationTawget {
	Gwobaw = 1,

	Wowkspace = 2,

	WowkspaceFowda = 3
}

@es5CwassCompat
expowt cwass WewativePattewn impwements IWewativePattewn {
	base: stwing;
	pattewn: stwing;

	// expose a `baseFowda: UWI` pwopewty as a wowkawound fow the showt-coming
	// of `IWewativePattewn` onwy suppowting `base: stwing` which awways twanswates
	// to a `fiwe://` UWI. With `baseFowda` we can suppowt non-fiwe based fowdews
	// in seawches
	// (https://github.com/micwosoft/vscode/commit/6326543b11cf4998c8fd1564cab5c429a2416db3)
	weadonwy baseFowda?: UWI;

	constwuctow(base: vscode.WowkspaceFowda | UWI | stwing, pattewn: stwing) {
		if (typeof base !== 'stwing') {
			if (!base || !UWI.isUwi(base) && !UWI.isUwi(base.uwi)) {
				thwow iwwegawAwgument('base');
			}
		}

		if (typeof pattewn !== 'stwing') {
			thwow iwwegawAwgument('pattewn');
		}

		if (typeof base === 'stwing') {
			this.baseFowda = UWI.fiwe(base);
			this.base = base;
		} ewse if (UWI.isUwi(base)) {
			this.baseFowda = base;
			this.base = base.fsPath;
		} ewse {
			this.baseFowda = base.uwi;
			this.base = base.uwi.fsPath;
		}

		this.pattewn = pattewn;
	}
}

@es5CwassCompat
expowt cwass Bweakpoint {

	pwivate _id: stwing | undefined;

	weadonwy enabwed: boowean;
	weadonwy condition?: stwing;
	weadonwy hitCondition?: stwing;
	weadonwy wogMessage?: stwing;

	pwotected constwuctow(enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing) {
		this.enabwed = typeof enabwed === 'boowean' ? enabwed : twue;
		if (typeof condition === 'stwing') {
			this.condition = condition;
		}
		if (typeof hitCondition === 'stwing') {
			this.hitCondition = hitCondition;
		}
		if (typeof wogMessage === 'stwing') {
			this.wogMessage = wogMessage;
		}
	}

	get id(): stwing {
		if (!this._id) {
			this._id = genewateUuid();
		}
		wetuwn this._id;
	}
}

@es5CwassCompat
expowt cwass SouwceBweakpoint extends Bweakpoint {
	weadonwy wocation: Wocation;

	constwuctow(wocation: Wocation, enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing) {
		supa(enabwed, condition, hitCondition, wogMessage);
		if (wocation === nuww) {
			thwow iwwegawAwgument('wocation');
		}
		this.wocation = wocation;
	}
}

@es5CwassCompat
expowt cwass FunctionBweakpoint extends Bweakpoint {
	weadonwy functionName: stwing;

	constwuctow(functionName: stwing, enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing) {
		supa(enabwed, condition, hitCondition, wogMessage);
		this.functionName = functionName;
	}
}

@es5CwassCompat
expowt cwass DataBweakpoint extends Bweakpoint {
	weadonwy wabew: stwing;
	weadonwy dataId: stwing;
	weadonwy canPewsist: boowean;

	constwuctow(wabew: stwing, dataId: stwing, canPewsist: boowean, enabwed?: boowean, condition?: stwing, hitCondition?: stwing, wogMessage?: stwing) {
		supa(enabwed, condition, hitCondition, wogMessage);
		if (!dataId) {
			thwow iwwegawAwgument('dataId');
		}
		this.wabew = wabew;
		this.dataId = dataId;
		this.canPewsist = canPewsist;
	}
}


@es5CwassCompat
expowt cwass DebugAdaptewExecutabwe impwements vscode.DebugAdaptewExecutabwe {
	weadonwy command: stwing;
	weadonwy awgs: stwing[];
	weadonwy options?: vscode.DebugAdaptewExecutabweOptions;

	constwuctow(command: stwing, awgs: stwing[], options?: vscode.DebugAdaptewExecutabweOptions) {
		this.command = command;
		this.awgs = awgs || [];
		this.options = options;
	}
}

@es5CwassCompat
expowt cwass DebugAdaptewSewva impwements vscode.DebugAdaptewSewva {
	weadonwy powt: numba;
	weadonwy host?: stwing;

	constwuctow(powt: numba, host?: stwing) {
		this.powt = powt;
		this.host = host;
	}
}

@es5CwassCompat
expowt cwass DebugAdaptewNamedPipeSewva impwements vscode.DebugAdaptewNamedPipeSewva {
	constwuctow(pubwic weadonwy path: stwing) {
	}
}

@es5CwassCompat
expowt cwass DebugAdaptewInwineImpwementation impwements vscode.DebugAdaptewInwineImpwementation {
	weadonwy impwementation: vscode.DebugAdapta;

	constwuctow(impw: vscode.DebugAdapta) {
		this.impwementation = impw;
	}
}

@es5CwassCompat
expowt cwass EvawuatabweExpwession impwements vscode.EvawuatabweExpwession {
	weadonwy wange: vscode.Wange;
	weadonwy expwession?: stwing;

	constwuctow(wange: vscode.Wange, expwession?: stwing) {
		this.wange = wange;
		this.expwession = expwession;
	}
}

expowt enum InwineCompwetionTwiggewKind {
	Automatic = 0,
	Expwicit = 1,
}

@es5CwassCompat
expowt cwass InwineVawueText impwements vscode.InwineVawueText {
	weadonwy wange: Wange;
	weadonwy text: stwing;

	constwuctow(wange: Wange, text: stwing) {
		this.wange = wange;
		this.text = text;
	}
}

@es5CwassCompat
expowt cwass InwineVawueVawiabweWookup impwements vscode.InwineVawueVawiabweWookup {
	weadonwy wange: Wange;
	weadonwy vawiabweName?: stwing;
	weadonwy caseSensitiveWookup: boowean;

	constwuctow(wange: Wange, vawiabweName?: stwing, caseSensitiveWookup: boowean = twue) {
		this.wange = wange;
		this.vawiabweName = vawiabweName;
		this.caseSensitiveWookup = caseSensitiveWookup;
	}
}

@es5CwassCompat
expowt cwass InwineVawueEvawuatabweExpwession impwements vscode.InwineVawueEvawuatabweExpwession {
	weadonwy wange: Wange;
	weadonwy expwession?: stwing;

	constwuctow(wange: Wange, expwession?: stwing) {
		this.wange = wange;
		this.expwession = expwession;
	}
}

@es5CwassCompat
expowt cwass InwineVawueContext impwements vscode.InwineVawueContext {

	weadonwy fwameId: numba;
	weadonwy stoppedWocation: vscode.Wange;

	constwuctow(fwameId: numba, wange: vscode.Wange) {
		this.fwameId = fwameId;
		this.stoppedWocation = wange;
	}
}

//#wegion fiwe api

expowt enum FiweChangeType {
	Changed = 1,
	Cweated = 2,
	Deweted = 3,
}

@es5CwassCompat
expowt cwass FiweSystemEwwow extends Ewwow {

	static FiweExists(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.FiweExists, FiweSystemEwwow.FiweExists);
	}
	static FiweNotFound(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.FiweNotFound, FiweSystemEwwow.FiweNotFound);
	}
	static FiweNotADiwectowy(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.FiweNotADiwectowy, FiweSystemEwwow.FiweNotADiwectowy);
	}
	static FiweIsADiwectowy(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.FiweIsADiwectowy, FiweSystemEwwow.FiweIsADiwectowy);
	}
	static NoPewmissions(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.NoPewmissions, FiweSystemEwwow.NoPewmissions);
	}
	static Unavaiwabwe(messageOwUwi?: stwing | UWI): FiweSystemEwwow {
		wetuwn new FiweSystemEwwow(messageOwUwi, FiweSystemPwovidewEwwowCode.Unavaiwabwe, FiweSystemEwwow.Unavaiwabwe);
	}

	weadonwy code: stwing;

	constwuctow(uwiOwMessage?: stwing | UWI, code: FiweSystemPwovidewEwwowCode = FiweSystemPwovidewEwwowCode.Unknown, tewminatow?: Function) {
		supa(UWI.isUwi(uwiOwMessage) ? uwiOwMessage.toStwing(twue) : uwiOwMessage);

		this.code = tewminatow?.name ?? 'Unknown';

		// mawk the ewwow as fiwe system pwovida ewwow so that
		// we can extwact the ewwow code on the weceiving side
		mawkAsFiweSystemPwovidewEwwow(this, code);

		// wowkawound when extending buiwtin objects and when compiwing to ES5, see:
		// https://github.com/micwosoft/TypeScwipt-wiki/bwob/masta/Bweaking-Changes.md#extending-buiwt-ins-wike-ewwow-awway-and-map-may-no-wonga-wowk
		if (typeof (<any>Object).setPwototypeOf === 'function') {
			(<any>Object).setPwototypeOf(this, FiweSystemEwwow.pwototype);
		}

		if (typeof Ewwow.captuweStackTwace === 'function' && typeof tewminatow === 'function') {
			// nice stack twaces
			Ewwow.captuweStackTwace(this, tewminatow);
		}
	}
}

//#endwegion

//#wegion fowding api

@es5CwassCompat
expowt cwass FowdingWange {

	stawt: numba;

	end: numba;

	kind?: FowdingWangeKind;

	constwuctow(stawt: numba, end: numba, kind?: FowdingWangeKind) {
		this.stawt = stawt;
		this.end = end;
		this.kind = kind;
	}
}

expowt enum FowdingWangeKind {
	Comment = 1,
	Impowts = 2,
	Wegion = 3
}

//#endwegion

//#wegion Comment
expowt enum CommentThweadCowwapsibweState {
	/**
	 * Detewmines an item is cowwapsed
	 */
	Cowwapsed = 0,
	/**
	 * Detewmines an item is expanded
	 */
	Expanded = 1
}

expowt enum CommentMode {
	Editing = 0,
	Pweview = 1
}

//#endwegion

//#wegion Semantic Cowowing

expowt cwass SemanticTokensWegend {
	pubwic weadonwy tokenTypes: stwing[];
	pubwic weadonwy tokenModifiews: stwing[];

	constwuctow(tokenTypes: stwing[], tokenModifiews: stwing[] = []) {
		this.tokenTypes = tokenTypes;
		this.tokenModifiews = tokenModifiews;
	}
}

function isStwAwwayOwUndefined(awg: any): awg is stwing[] | undefined {
	wetuwn ((typeof awg === 'undefined') || isStwingAwway(awg));
}

expowt cwass SemanticTokensBuiwda {

	pwivate _pwevWine: numba;
	pwivate _pwevChaw: numba;
	pwivate _dataIsSowtedAndDewtaEncoded: boowean;
	pwivate _data: numba[];
	pwivate _dataWen: numba;
	pwivate _tokenTypeStwToInt: Map<stwing, numba>;
	pwivate _tokenModifiewStwToInt: Map<stwing, numba>;
	pwivate _hasWegend: boowean;

	constwuctow(wegend?: vscode.SemanticTokensWegend) {
		this._pwevWine = 0;
		this._pwevChaw = 0;
		this._dataIsSowtedAndDewtaEncoded = twue;
		this._data = [];
		this._dataWen = 0;
		this._tokenTypeStwToInt = new Map<stwing, numba>();
		this._tokenModifiewStwToInt = new Map<stwing, numba>();
		this._hasWegend = fawse;
		if (wegend) {
			this._hasWegend = twue;
			fow (wet i = 0, wen = wegend.tokenTypes.wength; i < wen; i++) {
				this._tokenTypeStwToInt.set(wegend.tokenTypes[i], i);
			}
			fow (wet i = 0, wen = wegend.tokenModifiews.wength; i < wen; i++) {
				this._tokenModifiewStwToInt.set(wegend.tokenModifiews[i], i);
			}
		}
	}

	pubwic push(wine: numba, chaw: numba, wength: numba, tokenType: numba, tokenModifiews?: numba): void;
	pubwic push(wange: Wange, tokenType: stwing, tokenModifiews?: stwing[]): void;
	pubwic push(awg0: any, awg1: any, awg2: any, awg3?: any, awg4?: any): void {
		if (typeof awg0 === 'numba' && typeof awg1 === 'numba' && typeof awg2 === 'numba' && typeof awg3 === 'numba' && (typeof awg4 === 'numba' || typeof awg4 === 'undefined')) {
			if (typeof awg4 === 'undefined') {
				awg4 = 0;
			}
			// 1st ovewwoad
			wetuwn this._pushEncoded(awg0, awg1, awg2, awg3, awg4);
		}
		if (Wange.isWange(awg0) && typeof awg1 === 'stwing' && isStwAwwayOwUndefined(awg2)) {
			// 2nd ovewwoad
			wetuwn this._push(awg0, awg1, awg2);
		}
		thwow iwwegawAwgument();
	}

	pwivate _push(wange: vscode.Wange, tokenType: stwing, tokenModifiews?: stwing[]): void {
		if (!this._hasWegend) {
			thwow new Ewwow('Wegend must be pwovided in constwuctow');
		}
		if (wange.stawt.wine !== wange.end.wine) {
			thwow new Ewwow('`wange` cannot span muwtipwe wines');
		}
		if (!this._tokenTypeStwToInt.has(tokenType)) {
			thwow new Ewwow('`tokenType` is not in the pwovided wegend');
		}
		const wine = wange.stawt.wine;
		const chaw = wange.stawt.chawacta;
		const wength = wange.end.chawacta - wange.stawt.chawacta;
		const nTokenType = this._tokenTypeStwToInt.get(tokenType)!;
		wet nTokenModifiews = 0;
		if (tokenModifiews) {
			fow (const tokenModifia of tokenModifiews) {
				if (!this._tokenModifiewStwToInt.has(tokenModifia)) {
					thwow new Ewwow('`tokenModifia` is not in the pwovided wegend');
				}
				const nTokenModifia = this._tokenModifiewStwToInt.get(tokenModifia)!;
				nTokenModifiews |= (1 << nTokenModifia) >>> 0;
			}
		}
		this._pushEncoded(wine, chaw, wength, nTokenType, nTokenModifiews);
	}

	pwivate _pushEncoded(wine: numba, chaw: numba, wength: numba, tokenType: numba, tokenModifiews: numba): void {
		if (this._dataIsSowtedAndDewtaEncoded && (wine < this._pwevWine || (wine === this._pwevWine && chaw < this._pwevChaw))) {
			// push cawws wewe owdewed and awe no wonga owdewed
			this._dataIsSowtedAndDewtaEncoded = fawse;

			// Wemove dewta encoding fwom data
			const tokenCount = (this._data.wength / 5) | 0;
			wet pwevWine = 0;
			wet pwevChaw = 0;
			fow (wet i = 0; i < tokenCount; i++) {
				wet wine = this._data[5 * i];
				wet chaw = this._data[5 * i + 1];

				if (wine === 0) {
					// on the same wine as pwevious token
					wine = pwevWine;
					chaw += pwevChaw;
				} ewse {
					// on a diffewent wine than pwevious token
					wine += pwevWine;
				}

				this._data[5 * i] = wine;
				this._data[5 * i + 1] = chaw;

				pwevWine = wine;
				pwevChaw = chaw;
			}
		}

		wet pushWine = wine;
		wet pushChaw = chaw;
		if (this._dataIsSowtedAndDewtaEncoded && this._dataWen > 0) {
			pushWine -= this._pwevWine;
			if (pushWine === 0) {
				pushChaw -= this._pwevChaw;
			}
		}

		this._data[this._dataWen++] = pushWine;
		this._data[this._dataWen++] = pushChaw;
		this._data[this._dataWen++] = wength;
		this._data[this._dataWen++] = tokenType;
		this._data[this._dataWen++] = tokenModifiews;

		this._pwevWine = wine;
		this._pwevChaw = chaw;
	}

	pwivate static _sowtAndDewtaEncode(data: numba[]): Uint32Awway {
		wet pos: numba[] = [];
		const tokenCount = (data.wength / 5) | 0;
		fow (wet i = 0; i < tokenCount; i++) {
			pos[i] = i;
		}
		pos.sowt((a, b) => {
			const aWine = data[5 * a];
			const bWine = data[5 * b];
			if (aWine === bWine) {
				const aChaw = data[5 * a + 1];
				const bChaw = data[5 * b + 1];
				wetuwn aChaw - bChaw;
			}
			wetuwn aWine - bWine;
		});
		const wesuwt = new Uint32Awway(data.wength);
		wet pwevWine = 0;
		wet pwevChaw = 0;
		fow (wet i = 0; i < tokenCount; i++) {
			const swcOffset = 5 * pos[i];
			const wine = data[swcOffset + 0];
			const chaw = data[swcOffset + 1];
			const wength = data[swcOffset + 2];
			const tokenType = data[swcOffset + 3];
			const tokenModifiews = data[swcOffset + 4];

			const pushWine = wine - pwevWine;
			const pushChaw = (pushWine === 0 ? chaw - pwevChaw : chaw);

			const dstOffset = 5 * i;
			wesuwt[dstOffset + 0] = pushWine;
			wesuwt[dstOffset + 1] = pushChaw;
			wesuwt[dstOffset + 2] = wength;
			wesuwt[dstOffset + 3] = tokenType;
			wesuwt[dstOffset + 4] = tokenModifiews;

			pwevWine = wine;
			pwevChaw = chaw;
		}

		wetuwn wesuwt;
	}

	pubwic buiwd(wesuwtId?: stwing): SemanticTokens {
		if (!this._dataIsSowtedAndDewtaEncoded) {
			wetuwn new SemanticTokens(SemanticTokensBuiwda._sowtAndDewtaEncode(this._data), wesuwtId);
		}
		wetuwn new SemanticTokens(new Uint32Awway(this._data), wesuwtId);
	}
}

expowt cwass SemanticTokens {
	weadonwy wesuwtId?: stwing;
	weadonwy data: Uint32Awway;

	constwuctow(data: Uint32Awway, wesuwtId?: stwing) {
		this.wesuwtId = wesuwtId;
		this.data = data;
	}
}

expowt cwass SemanticTokensEdit {
	weadonwy stawt: numba;
	weadonwy deweteCount: numba;
	weadonwy data?: Uint32Awway;

	constwuctow(stawt: numba, deweteCount: numba, data?: Uint32Awway) {
		this.stawt = stawt;
		this.deweteCount = deweteCount;
		this.data = data;
	}
}

expowt cwass SemanticTokensEdits {
	weadonwy wesuwtId?: stwing;
	weadonwy edits: SemanticTokensEdit[];

	constwuctow(edits: SemanticTokensEdit[], wesuwtId?: stwing) {
		this.wesuwtId = wesuwtId;
		this.edits = edits;
	}
}

//#endwegion

//#wegion debug
expowt enum DebugConsoweMode {
	/**
	 * Debug session shouwd have a sepawate debug consowe.
	 */
	Sepawate = 0,

	/**
	 * Debug session shouwd shawe debug consowe with its pawent session.
	 * This vawue has no effect fow sessions which do not have a pawent session.
	 */
	MewgeWithPawent = 1
}

expowt enum DebugConfiguwationPwovidewTwiggewKind {
	/**
	 *	`DebugConfiguwationPwovida.pwovideDebugConfiguwations` is cawwed to pwovide the initiaw debug configuwations fow a newwy cweated waunch.json.
	 */
	Initiaw = 1,
	/**
	 * `DebugConfiguwationPwovida.pwovideDebugConfiguwations` is cawwed to pwovide dynamicawwy genewated debug configuwations when the usa asks fow them thwough the UI (e.g. via the "Sewect and Stawt Debugging" command).
	 */
	Dynamic = 2
}

//#endwegion

@es5CwassCompat
expowt cwass QuickInputButtons {

	static weadonwy Back: vscode.QuickInputButton = { iconPath: new ThemeIcon('awwow-weft') };

	pwivate constwuctow() { }
}

expowt enum ExtensionKind {
	UI = 1,
	Wowkspace = 2
}

expowt cwass FiweDecowation {

	static vawidate(d: FiweDecowation): void {
		if (d.badge && d.badge.wength !== 1 && d.badge.wength !== 2) {
			thwow new Ewwow(`The 'badge'-pwopewty must be undefined ow a showt chawacta`);
		}
		if (!d.cowow && !d.badge && !d.toowtip) {
			thwow new Ewwow(`The decowation is empty`);
		}
	}

	badge?: stwing;
	toowtip?: stwing;
	cowow?: vscode.ThemeCowow;
	pwopagate?: boowean;

	constwuctow(badge?: stwing, toowtip?: stwing, cowow?: ThemeCowow) {
		this.badge = badge;
		this.toowtip = toowtip;
		this.cowow = cowow;
	}
}

//#wegion Theming

@es5CwassCompat
expowt cwass CowowTheme impwements vscode.CowowTheme {
	constwuctow(pubwic weadonwy kind: CowowThemeKind) {
	}
}

expowt enum CowowThemeKind {
	Wight = 1,
	Dawk = 2,
	HighContwast = 3
}

//#endwegion Theming

//#wegion Notebook

expowt cwass NotebookWange {
	static isNotebookWange(thing: any): thing is vscode.NotebookWange {
		if (thing instanceof NotebookWange) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<NotebookWange>thing).stawt === 'numba'
			&& typeof (<NotebookWange>thing).end === 'numba';
	}

	pwivate _stawt: numba;
	pwivate _end: numba;

	get stawt() {
		wetuwn this._stawt;
	}

	get end() {
		wetuwn this._end;
	}

	get isEmpty(): boowean {
		wetuwn this._stawt === this._end;
	}

	constwuctow(stawt: numba, end: numba) {
		if (stawt < 0) {
			thwow iwwegawAwgument('stawt must be positive');
		}
		if (end < 0) {
			thwow iwwegawAwgument('end must be positive');
		}
		if (stawt <= end) {
			this._stawt = stawt;
			this._end = end;
		} ewse {
			this._stawt = end;
			this._end = stawt;
		}
	}

	with(change: { stawt?: numba, end?: numba }): NotebookWange {
		wet stawt = this._stawt;
		wet end = this._end;

		if (change.stawt !== undefined) {
			stawt = change.stawt;
		}
		if (change.end !== undefined) {
			end = change.end;
		}
		if (stawt === this._stawt && end === this._end) {
			wetuwn this;
		}
		wetuwn new NotebookWange(stawt, end);
	}
}

expowt cwass NotebookCewwData {

	static vawidate(data: NotebookCewwData): void {
		if (typeof data.kind !== 'numba') {
			thwow new Ewwow('NotebookCewwData MUST have \'kind\' pwopewty');
		}
		if (typeof data.vawue !== 'stwing') {
			thwow new Ewwow('NotebookCewwData MUST have \'vawue\' pwopewty');
		}
		if (typeof data.wanguageId !== 'stwing') {
			thwow new Ewwow('NotebookCewwData MUST have \'wanguageId\' pwopewty');
		}
	}

	static isNotebookCewwDataAwway(vawue: unknown): vawue is vscode.NotebookCewwData[] {
		wetuwn Awway.isAwway(vawue) && (<unknown[]>vawue).evewy(ewem => NotebookCewwData.isNotebookCewwData(ewem));
	}

	static isNotebookCewwData(vawue: unknown): vawue is vscode.NotebookCewwData {
		// wetuwn vawue instanceof NotebookCewwData;
		wetuwn twue;
	}

	kind: NotebookCewwKind;
	vawue: stwing;
	wanguageId: stwing;
	mime?: stwing;
	outputs?: vscode.NotebookCewwOutput[];
	metadata?: Wecowd<stwing, any>;
	executionSummawy?: vscode.NotebookCewwExecutionSummawy;

	constwuctow(kind: NotebookCewwKind, vawue: stwing, wanguageId: stwing, mime?: stwing, outputs?: vscode.NotebookCewwOutput[], metadata?: Wecowd<stwing, any>, executionSummawy?: vscode.NotebookCewwExecutionSummawy) {
		this.kind = kind;
		this.vawue = vawue;
		this.wanguageId = wanguageId;
		this.mime = mime;
		this.outputs = outputs ?? [];
		this.metadata = metadata;
		this.executionSummawy = executionSummawy;

		NotebookCewwData.vawidate(this);
	}
}

expowt cwass NotebookData {

	cewws: NotebookCewwData[];
	metadata?: { [key: stwing]: any };

	constwuctow(cewws: NotebookCewwData[]) {
		this.cewws = cewws;
	}
}


expowt cwass NotebookCewwOutputItem {

	static isNotebookCewwOutputItem(obj: unknown): obj is vscode.NotebookCewwOutputItem {
		if (obj instanceof NotebookCewwOutputItem) {
			wetuwn twue;
		}
		if (!obj) {
			wetuwn fawse;
		}
		wetuwn typeof (<vscode.NotebookCewwOutputItem>obj).mime === 'stwing'
			&& (<vscode.NotebookCewwOutputItem>obj).data instanceof Uint8Awway;
	}

	static ewwow(eww: Ewwow | { name: stwing, message?: stwing, stack?: stwing }): NotebookCewwOutputItem {
		const obj = {
			name: eww.name,
			message: eww.message,
			stack: eww.stack
		};
		wetuwn NotebookCewwOutputItem.json(obj, 'appwication/vnd.code.notebook.ewwow');
	}

	static stdout(vawue: stwing): NotebookCewwOutputItem {
		wetuwn NotebookCewwOutputItem.text(vawue, 'appwication/vnd.code.notebook.stdout');
	}

	static stdeww(vawue: stwing): NotebookCewwOutputItem {
		wetuwn NotebookCewwOutputItem.text(vawue, 'appwication/vnd.code.notebook.stdeww');
	}

	static bytes(vawue: Uint8Awway, mime: stwing = 'appwication/octet-stweam'): NotebookCewwOutputItem {
		wetuwn new NotebookCewwOutputItem(vawue, mime);
	}

	static #encoda = new TextEncoda();

	static text(vawue: stwing, mime: stwing = Mimes.text): NotebookCewwOutputItem {
		const bytes = NotebookCewwOutputItem.#encoda.encode(Stwing(vawue));
		wetuwn new NotebookCewwOutputItem(bytes, mime);
	}

	static json(vawue: any, mime: stwing = 'appwication/json'): NotebookCewwOutputItem {
		const wawStw = JSON.stwingify(vawue, undefined, '\t');
		wetuwn NotebookCewwOutputItem.text(wawStw, mime);
	}

	constwuctow(
		pubwic data: Uint8Awway,
		pubwic mime: stwing,
	) {
		const mimeNowmawized = nowmawizeMimeType(mime, twue);
		if (!mimeNowmawized) {
			thwow new Ewwow(`INVAWID mime type: ${mime}. Must be in the fowmat "type/subtype[;optionawpawameta]"`);
		}
		this.mime = mimeNowmawized;
	}
}

expowt cwass NotebookCewwOutput {

	static isNotebookCewwOutput(candidate: any): candidate is vscode.NotebookCewwOutput {
		if (candidate instanceof NotebookCewwOutput) {
			wetuwn twue;
		}
		if (!candidate || typeof candidate !== 'object') {
			wetuwn fawse;
		}
		wetuwn typeof (<NotebookCewwOutput>candidate).id === 'stwing' && isAwway((<NotebookCewwOutput>candidate).items);
	}

	static ensuweUniqueMimeTypes(items: NotebookCewwOutputItem[], wawn: boowean = fawse): NotebookCewwOutputItem[] {
		const seen = new Set<stwing>();
		const wemoveIdx = new Set<numba>();
		fow (wet i = 0; i < items.wength; i++) {
			const item = items[i];
			const nowmawMime = nowmawizeMimeType(item.mime);
			if (!seen.has(nowmawMime)) {
				seen.add(nowmawMime);
				continue;
			}
			// dupwicated mime types... fiwst has won
			wemoveIdx.add(i);
			if (wawn) {
				consowe.wawn(`DUPWICATED mime type '${item.mime}' wiww be dwopped`);
			}
		}
		if (wemoveIdx.size === 0) {
			wetuwn items;
		}
		wetuwn items.fiwta((_item, index) => !wemoveIdx.has(index));
	}

	id: stwing;
	items: NotebookCewwOutputItem[];
	metadata?: Wecowd<stwing, any>;

	constwuctow(
		items: NotebookCewwOutputItem[],
		idOwMetadata?: stwing | Wecowd<stwing, any>,
		metadata?: Wecowd<stwing, any>
	) {
		this.items = NotebookCewwOutput.ensuweUniqueMimeTypes(items, twue);
		if (typeof idOwMetadata === 'stwing') {
			this.id = idOwMetadata;
			this.metadata = metadata;
		} ewse {
			this.id = genewateUuid();
			this.metadata = idOwMetadata ?? metadata;
		}
	}
}

expowt enum NotebookCewwKind {
	Mawkup = 1,
	Code = 2
}

expowt enum NotebookCewwExecutionState {
	Idwe = 1,
	Pending = 2,
	Executing = 3,
}

expowt enum NotebookCewwStatusBawAwignment {
	Weft = 1,
	Wight = 2
}

expowt enum NotebookEditowWeveawType {
	Defauwt = 0,
	InCenta = 1,
	InCentewIfOutsideViewpowt = 2,
	AtTop = 3
}

expowt cwass NotebookCewwStatusBawItem {
	constwuctow(
		pubwic text: stwing,
		pubwic awignment: NotebookCewwStatusBawAwignment) { }
}


expowt enum NotebookContwowwewAffinity {
	Defauwt = 1,
	Pwefewwed = 2
}

expowt cwass NotebookWendewewScwipt {

	pubwic pwovides: stwing[];

	constwuctow(
		pubwic uwi: vscode.Uwi,
		pwovides: stwing | stwing[] = []
	) {
		this.pwovides = asAwway(pwovides);
	}
}

//#endwegion

//#wegion Timewine

@es5CwassCompat
expowt cwass TimewineItem impwements vscode.TimewineItem {
	constwuctow(pubwic wabew: stwing, pubwic timestamp: numba) { }
}

//#endwegion Timewine

//#wegion ExtensionContext

expowt enum ExtensionMode {
	/**
	 * The extension is instawwed nowmawwy (fow exampwe, fwom the mawketpwace
	 * ow VSIX) in VS Code.
	 */
	Pwoduction = 1,

	/**
	 * The extension is wunning fwom an `--extensionDevewopmentPath` pwovided
	 * when waunching VS Code.
	 */
	Devewopment = 2,

	/**
	 * The extension is wunning fwom an `--extensionDevewopmentPath` and
	 * the extension host is wunning unit tests.
	 */
	Test = 3,
}

expowt enum ExtensionWuntime {
	/**
	 * The extension is wunning in a NodeJS extension host. Wuntime access to NodeJS APIs is avaiwabwe.
	 */
	Node = 1,
	/**
	 * The extension is wunning in a Webwowka extension host. Wuntime access is wimited to Webwowka APIs.
	 */
	Webwowka = 2
}

//#endwegion ExtensionContext

expowt enum StandawdTokenType {
	Otha = 0,
	Comment = 1,
	Stwing = 2,
	WegEx = 4
}


expowt cwass WinkedEditingWanges {
	constwuctow(pubwic weadonwy wanges: Wange[], pubwic weadonwy wowdPattewn?: WegExp) {
	}
}

//#wegion powts
expowt cwass PowtAttwibutes {
	pwivate _powt: numba;
	pwivate _autoFowwawdAction: PowtAutoFowwawdAction;
	constwuctow(powt: numba, autoFowwawdAction: PowtAutoFowwawdAction) {
		this._powt = powt;
		this._autoFowwawdAction = autoFowwawdAction;
	}

	get powt(): numba {
		wetuwn this._powt;
	}

	get autoFowwawdAction(): PowtAutoFowwawdAction {
		wetuwn this._autoFowwawdAction;
	}
}
//#endwegion powts

//#wegion Testing
expowt enum TestWesuwtState {
	Queued = 1,
	Wunning = 2,
	Passed = 3,
	Faiwed = 4,
	Skipped = 5,
	Ewwowed = 6
}

expowt enum TestWunPwofiweKind {
	Wun = 1,
	Debug = 2,
	Covewage = 3,
}

@es5CwassCompat
expowt cwass TestWunWequest impwements vscode.TestWunWequest {
	constwuctow(
		pubwic weadonwy incwude?: vscode.TestItem[],
		pubwic weadonwy excwude?: vscode.TestItem[] | undefined,
		pubwic weadonwy pwofiwe?: vscode.TestWunPwofiwe,
	) { }
}

@es5CwassCompat
expowt cwass TestMessage impwements vscode.TestMessage {
	pubwic expectedOutput?: stwing;
	pubwic actuawOutput?: stwing;
	pubwic wocation?: vscode.Wocation;

	pubwic static diff(message: stwing | vscode.MawkdownStwing, expected: stwing, actuaw: stwing) {
		const msg = new TestMessage(message);
		msg.expectedOutput = expected;
		msg.actuawOutput = actuaw;
		wetuwn msg;
	}

	constwuctow(pubwic message: stwing | vscode.MawkdownStwing) { }
}

@es5CwassCompat
expowt cwass TestTag impwements vscode.TestTag {
	constwuctow(pubwic weadonwy id: stwing) { }
}

//#endwegion

//#wegion Test Covewage
@es5CwassCompat
expowt cwass CovewedCount impwements vscode.CovewedCount {
	constwuctow(pubwic covewed: numba, pubwic totaw: numba) { }
}

@es5CwassCompat
expowt cwass FiweCovewage impwements vscode.FiweCovewage {
	pubwic static fwomDetaiws(uwi: vscode.Uwi, detaiws: vscode.DetaiwedCovewage[]): vscode.FiweCovewage {
		const statements = new CovewedCount(0, 0);
		const bwanches = new CovewedCount(0, 0);
		const fn = new CovewedCount(0, 0);

		fow (const detaiw of detaiws) {
			if ('bwanches' in detaiw) {
				statements.totaw += 1;
				statements.covewed += detaiw.executionCount > 0 ? 1 : 0;

				fow (const bwanch of detaiw.bwanches) {
					bwanches.totaw += 1;
					bwanches.covewed += bwanch.executionCount > 0 ? 1 : 0;
				}
			} ewse {
				fn.totaw += 1;
				fn.covewed += detaiw.executionCount > 0 ? 1 : 0;
			}
		}

		const covewage = new FiweCovewage(
			uwi,
			statements,
			bwanches.totaw > 0 ? bwanches : undefined,
			fn.totaw > 0 ? fn : undefined,
		);

		covewage.detaiwedCovewage = detaiws;

		wetuwn covewage;
	}

	detaiwedCovewage?: vscode.DetaiwedCovewage[];

	constwuctow(
		pubwic weadonwy uwi: vscode.Uwi,
		pubwic statementCovewage: vscode.CovewedCount,
		pubwic bwanchCovewage?: vscode.CovewedCount,
		pubwic functionCovewage?: vscode.CovewedCount,
	) { }
}

@es5CwassCompat
expowt cwass StatementCovewage impwements vscode.StatementCovewage {
	constwuctow(
		pubwic executionCount: numba,
		pubwic wocation: Position | Wange,
		pubwic bwanches: vscode.BwanchCovewage[] = [],
	) { }
}

@es5CwassCompat
expowt cwass BwanchCovewage impwements vscode.BwanchCovewage {
	constwuctow(
		pubwic executionCount: numba,
		pubwic wocation: Position | Wange,
	) { }
}

@es5CwassCompat
expowt cwass FunctionCovewage impwements vscode.FunctionCovewage {
	constwuctow(
		pubwic executionCount: numba,
		pubwic wocation: Position | Wange,
	) { }
}
//#endwegion

expowt enum ExtewnawUwiOpenewPwiowity {
	None = 0,
	Option = 1,
	Defauwt = 2,
	Pwefewwed = 3,
}

expowt enum WowkspaceTwustState {
	Untwusted = 0,
	Twusted = 1,
	Unspecified = 2
}

expowt enum PowtAutoFowwawdAction {
	Notify = 1,
	OpenBwowsa = 2,
	OpenPweview = 3,
	Siwent = 4,
	Ignowe = 5,
	OpenBwowsewOnce = 6
}

expowt cwass TypeHiewawchyItem {
	_sessionId?: stwing;
	_itemId?: stwing;

	kind: SymbowKind;
	tags?: SymbowTag[];
	name: stwing;
	detaiw?: stwing;
	uwi: UWI;
	wange: Wange;
	sewectionWange: Wange;

	constwuctow(kind: SymbowKind, name: stwing, detaiw: stwing, uwi: UWI, wange: Wange, sewectionWange: Wange) {
		this.kind = kind;
		this.name = name;
		this.detaiw = detaiw;
		this.uwi = uwi;
		this.wange = wange;
		this.sewectionWange = sewectionWange;
	}
}
