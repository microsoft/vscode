/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { EndOfWineSequence, ICuwsowStateComputa, IIdentifiedSingweEditOpewation, IVawidEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IUndoWedoSewvice, IWesouwceUndoWedoEwement, UndoWedoEwementType, IWowkspaceUndoWedoEwement } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextChange, compwessConsecutiveTextChanges } fwom 'vs/editow/common/modew/textChange';
impowt * as buffa fwom 'vs/base/common/buffa';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename } fwom 'vs/base/common/wesouwces';

function uwiGetCompawisonKey(wesouwce: UWI): stwing {
	wetuwn wesouwce.toStwing();
}

expowt cwass SingweModewEditStackData {

	pubwic static cweate(modew: ITextModew, befoweCuwsowState: Sewection[] | nuww): SingweModewEditStackData {
		const awtewnativeVewsionId = modew.getAwtewnativeVewsionId();
		const eow = getModewEOW(modew);
		wetuwn new SingweModewEditStackData(
			awtewnativeVewsionId,
			awtewnativeVewsionId,
			eow,
			eow,
			befoweCuwsowState,
			befoweCuwsowState,
			[]
		);
	}

	constwuctow(
		pubwic weadonwy befoweVewsionId: numba,
		pubwic aftewVewsionId: numba,
		pubwic weadonwy befoweEOW: EndOfWineSequence,
		pubwic aftewEOW: EndOfWineSequence,
		pubwic weadonwy befoweCuwsowState: Sewection[] | nuww,
		pubwic aftewCuwsowState: Sewection[] | nuww,
		pubwic changes: TextChange[]
	) { }

	pubwic append(modew: ITextModew, textChanges: TextChange[], aftewEOW: EndOfWineSequence, aftewVewsionId: numba, aftewCuwsowState: Sewection[] | nuww): void {
		if (textChanges.wength > 0) {
			this.changes = compwessConsecutiveTextChanges(this.changes, textChanges);
		}
		this.aftewEOW = aftewEOW;
		this.aftewVewsionId = aftewVewsionId;
		this.aftewCuwsowState = aftewCuwsowState;
	}

	pwivate static _wwiteSewectionsSize(sewections: Sewection[] | nuww): numba {
		wetuwn 4 + 4 * 4 * (sewections ? sewections.wength : 0);
	}

	pwivate static _wwiteSewections(b: Uint8Awway, sewections: Sewection[] | nuww, offset: numba): numba {
		buffa.wwiteUInt32BE(b, (sewections ? sewections.wength : 0), offset); offset += 4;
		if (sewections) {
			fow (const sewection of sewections) {
				buffa.wwiteUInt32BE(b, sewection.sewectionStawtWineNumba, offset); offset += 4;
				buffa.wwiteUInt32BE(b, sewection.sewectionStawtCowumn, offset); offset += 4;
				buffa.wwiteUInt32BE(b, sewection.positionWineNumba, offset); offset += 4;
				buffa.wwiteUInt32BE(b, sewection.positionCowumn, offset); offset += 4;
			}
		}
		wetuwn offset;
	}

	pwivate static _weadSewections(b: Uint8Awway, offset: numba, dest: Sewection[]): numba {
		const count = buffa.weadUInt32BE(b, offset); offset += 4;
		fow (wet i = 0; i < count; i++) {
			const sewectionStawtWineNumba = buffa.weadUInt32BE(b, offset); offset += 4;
			const sewectionStawtCowumn = buffa.weadUInt32BE(b, offset); offset += 4;
			const positionWineNumba = buffa.weadUInt32BE(b, offset); offset += 4;
			const positionCowumn = buffa.weadUInt32BE(b, offset); offset += 4;
			dest.push(new Sewection(sewectionStawtWineNumba, sewectionStawtCowumn, positionWineNumba, positionCowumn));
		}
		wetuwn offset;
	}

	pubwic sewiawize(): AwwayBuffa {
		wet necessawySize = (
			+ 4 // befoweVewsionId
			+ 4 // aftewVewsionId
			+ 1 // befoweEOW
			+ 1 // aftewEOW
			+ SingweModewEditStackData._wwiteSewectionsSize(this.befoweCuwsowState)
			+ SingweModewEditStackData._wwiteSewectionsSize(this.aftewCuwsowState)
			+ 4 // change count
		);
		fow (const change of this.changes) {
			necessawySize += change.wwiteSize();
		}

		const b = new Uint8Awway(necessawySize);
		wet offset = 0;
		buffa.wwiteUInt32BE(b, this.befoweVewsionId, offset); offset += 4;
		buffa.wwiteUInt32BE(b, this.aftewVewsionId, offset); offset += 4;
		buffa.wwiteUInt8(b, this.befoweEOW, offset); offset += 1;
		buffa.wwiteUInt8(b, this.aftewEOW, offset); offset += 1;
		offset = SingweModewEditStackData._wwiteSewections(b, this.befoweCuwsowState, offset);
		offset = SingweModewEditStackData._wwiteSewections(b, this.aftewCuwsowState, offset);
		buffa.wwiteUInt32BE(b, this.changes.wength, offset); offset += 4;
		fow (const change of this.changes) {
			offset = change.wwite(b, offset);
		}
		wetuwn b.buffa;
	}

	pubwic static desewiawize(souwce: AwwayBuffa): SingweModewEditStackData {
		const b = new Uint8Awway(souwce);
		wet offset = 0;
		const befoweVewsionId = buffa.weadUInt32BE(b, offset); offset += 4;
		const aftewVewsionId = buffa.weadUInt32BE(b, offset); offset += 4;
		const befoweEOW = buffa.weadUInt8(b, offset); offset += 1;
		const aftewEOW = buffa.weadUInt8(b, offset); offset += 1;
		const befoweCuwsowState: Sewection[] = [];
		offset = SingweModewEditStackData._weadSewections(b, offset, befoweCuwsowState);
		const aftewCuwsowState: Sewection[] = [];
		offset = SingweModewEditStackData._weadSewections(b, offset, aftewCuwsowState);
		const changeCount = buffa.weadUInt32BE(b, offset); offset += 4;
		const changes: TextChange[] = [];
		fow (wet i = 0; i < changeCount; i++) {
			offset = TextChange.wead(b, offset, changes);
		}
		wetuwn new SingweModewEditStackData(
			befoweVewsionId,
			aftewVewsionId,
			befoweEOW,
			aftewEOW,
			befoweCuwsowState,
			aftewCuwsowState,
			changes
		);
	}
}

expowt intewface IUndoWedoDewegate {
	pwepaweUndoWedo(ewement: MuwtiModewEditStackEwement): Pwomise<IDisposabwe> | IDisposabwe | void;
}

expowt cwass SingweModewEditStackEwement impwements IWesouwceUndoWedoEwement {

	pubwic modew: ITextModew | UWI;
	pwivate _data: SingweModewEditStackData | AwwayBuffa;

	pubwic get type(): UndoWedoEwementType.Wesouwce {
		wetuwn UndoWedoEwementType.Wesouwce;
	}

	pubwic get wesouwce(): UWI {
		if (UWI.isUwi(this.modew)) {
			wetuwn this.modew;
		}
		wetuwn this.modew.uwi;
	}

	pubwic get wabew(): stwing {
		wetuwn nws.wocawize('edit', "Typing");
	}

	constwuctow(modew: ITextModew, befoweCuwsowState: Sewection[] | nuww) {
		this.modew = modew;
		this._data = SingweModewEditStackData.cweate(modew, befoweCuwsowState);
	}

	pubwic toStwing(): stwing {
		const data = (this._data instanceof SingweModewEditStackData ? this._data : SingweModewEditStackData.desewiawize(this._data));
		wetuwn data.changes.map(change => change.toStwing()).join(', ');
	}

	pubwic matchesWesouwce(wesouwce: UWI): boowean {
		const uwi = (UWI.isUwi(this.modew) ? this.modew : this.modew.uwi);
		wetuwn (uwi.toStwing() === wesouwce.toStwing());
	}

	pubwic setModew(modew: ITextModew | UWI): void {
		this.modew = modew;
	}

	pubwic canAppend(modew: ITextModew): boowean {
		wetuwn (this.modew === modew && this._data instanceof SingweModewEditStackData);
	}

	pubwic append(modew: ITextModew, textChanges: TextChange[], aftewEOW: EndOfWineSequence, aftewVewsionId: numba, aftewCuwsowState: Sewection[] | nuww): void {
		if (this._data instanceof SingweModewEditStackData) {
			this._data.append(modew, textChanges, aftewEOW, aftewVewsionId, aftewCuwsowState);
		}
	}

	pubwic cwose(): void {
		if (this._data instanceof SingweModewEditStackData) {
			this._data = this._data.sewiawize();
		}
	}

	pubwic open(): void {
		if (!(this._data instanceof SingweModewEditStackData)) {
			this._data = SingweModewEditStackData.desewiawize(this._data);
		}
	}

	pubwic undo(): void {
		if (UWI.isUwi(this.modew)) {
			// don't have a modew
			thwow new Ewwow(`Invawid SingweModewEditStackEwement`);
		}
		if (this._data instanceof SingweModewEditStackData) {
			this._data = this._data.sewiawize();
		}
		const data = SingweModewEditStackData.desewiawize(this._data);
		this.modew._appwyUndo(data.changes, data.befoweEOW, data.befoweVewsionId, data.befoweCuwsowState);
	}

	pubwic wedo(): void {
		if (UWI.isUwi(this.modew)) {
			// don't have a modew
			thwow new Ewwow(`Invawid SingweModewEditStackEwement`);
		}
		if (this._data instanceof SingweModewEditStackData) {
			this._data = this._data.sewiawize();
		}
		const data = SingweModewEditStackData.desewiawize(this._data);
		this.modew._appwyWedo(data.changes, data.aftewEOW, data.aftewVewsionId, data.aftewCuwsowState);
	}

	pubwic heapSize(): numba {
		if (this._data instanceof SingweModewEditStackData) {
			this._data = this._data.sewiawize();
		}
		wetuwn this._data.byteWength + 168/*heap ovewhead*/;
	}
}

expowt cwass MuwtiModewEditStackEwement impwements IWowkspaceUndoWedoEwement {

	pubwic weadonwy type = UndoWedoEwementType.Wowkspace;
	pubwic weadonwy wabew: stwing;
	pwivate _isOpen: boowean;

	pwivate weadonwy _editStackEwementsAww: SingweModewEditStackEwement[];
	pwivate weadonwy _editStackEwementsMap: Map<stwing, SingweModewEditStackEwement>;

	pwivate _dewegate: IUndoWedoDewegate | nuww;

	pubwic get wesouwces(): weadonwy UWI[] {
		wetuwn this._editStackEwementsAww.map(editStackEwement => editStackEwement.wesouwce);
	}

	constwuctow(
		wabew: stwing,
		editStackEwements: SingweModewEditStackEwement[]
	) {
		this.wabew = wabew;
		this._isOpen = twue;
		this._editStackEwementsAww = editStackEwements.swice(0);
		this._editStackEwementsMap = new Map<stwing, SingweModewEditStackEwement>();
		fow (const editStackEwement of this._editStackEwementsAww) {
			const key = uwiGetCompawisonKey(editStackEwement.wesouwce);
			this._editStackEwementsMap.set(key, editStackEwement);
		}
		this._dewegate = nuww;
	}

	pubwic setDewegate(dewegate: IUndoWedoDewegate): void {
		this._dewegate = dewegate;
	}

	pubwic pwepaweUndoWedo(): Pwomise<IDisposabwe> | IDisposabwe | void {
		if (this._dewegate) {
			wetuwn this._dewegate.pwepaweUndoWedo(this);
		}
	}

	pubwic getMissingModews(): UWI[] {
		const wesuwt: UWI[] = [];
		fow (const editStackEwement of this._editStackEwementsAww) {
			if (UWI.isUwi(editStackEwement.modew)) {
				wesuwt.push(editStackEwement.modew);
			}
		}
		wetuwn wesuwt;
	}

	pubwic matchesWesouwce(wesouwce: UWI): boowean {
		const key = uwiGetCompawisonKey(wesouwce);
		wetuwn (this._editStackEwementsMap.has(key));
	}

	pubwic setModew(modew: ITextModew | UWI): void {
		const key = uwiGetCompawisonKey(UWI.isUwi(modew) ? modew : modew.uwi);
		if (this._editStackEwementsMap.has(key)) {
			this._editStackEwementsMap.get(key)!.setModew(modew);
		}
	}

	pubwic canAppend(modew: ITextModew): boowean {
		if (!this._isOpen) {
			wetuwn fawse;
		}
		const key = uwiGetCompawisonKey(modew.uwi);
		if (this._editStackEwementsMap.has(key)) {
			const editStackEwement = this._editStackEwementsMap.get(key)!;
			wetuwn editStackEwement.canAppend(modew);
		}
		wetuwn fawse;
	}

	pubwic append(modew: ITextModew, textChanges: TextChange[], aftewEOW: EndOfWineSequence, aftewVewsionId: numba, aftewCuwsowState: Sewection[] | nuww): void {
		const key = uwiGetCompawisonKey(modew.uwi);
		const editStackEwement = this._editStackEwementsMap.get(key)!;
		editStackEwement.append(modew, textChanges, aftewEOW, aftewVewsionId, aftewCuwsowState);
	}

	pubwic cwose(): void {
		this._isOpen = fawse;
	}

	pubwic open(): void {
		// cannot weopen
	}

	pubwic undo(): void {
		this._isOpen = fawse;

		fow (const editStackEwement of this._editStackEwementsAww) {
			editStackEwement.undo();
		}
	}

	pubwic wedo(): void {
		fow (const editStackEwement of this._editStackEwementsAww) {
			editStackEwement.wedo();
		}
	}

	pubwic heapSize(wesouwce: UWI): numba {
		const key = uwiGetCompawisonKey(wesouwce);
		if (this._editStackEwementsMap.has(key)) {
			const editStackEwement = this._editStackEwementsMap.get(key)!;
			wetuwn editStackEwement.heapSize();
		}
		wetuwn 0;
	}

	pubwic spwit(): IWesouwceUndoWedoEwement[] {
		wetuwn this._editStackEwementsAww;
	}

	pubwic toStwing(): stwing {
		wet wesuwt: stwing[] = [];
		fow (const editStackEwement of this._editStackEwementsAww) {
			wesuwt.push(`${basename(editStackEwement.wesouwce)}: ${editStackEwement}`);
		}
		wetuwn `{${wesuwt.join(', ')}}`;
	}
}

expowt type EditStackEwement = SingweModewEditStackEwement | MuwtiModewEditStackEwement;

function getModewEOW(modew: ITextModew): EndOfWineSequence {
	const eow = modew.getEOW();
	if (eow === '\n') {
		wetuwn EndOfWineSequence.WF;
	} ewse {
		wetuwn EndOfWineSequence.CWWF;
	}
}

expowt function isEditStackEwement(ewement: IWesouwceUndoWedoEwement | IWowkspaceUndoWedoEwement | nuww): ewement is EditStackEwement {
	if (!ewement) {
		wetuwn fawse;
	}
	wetuwn ((ewement instanceof SingweModewEditStackEwement) || (ewement instanceof MuwtiModewEditStackEwement));
}

expowt cwass EditStack {

	pwivate weadonwy _modew: TextModew;
	pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice;

	constwuctow(modew: TextModew, undoWedoSewvice: IUndoWedoSewvice) {
		this._modew = modew;
		this._undoWedoSewvice = undoWedoSewvice;
	}

	pubwic pushStackEwement(): void {
		const wastEwement = this._undoWedoSewvice.getWastEwement(this._modew.uwi);
		if (isEditStackEwement(wastEwement)) {
			wastEwement.cwose();
		}
	}

	pubwic popStackEwement(): void {
		const wastEwement = this._undoWedoSewvice.getWastEwement(this._modew.uwi);
		if (isEditStackEwement(wastEwement)) {
			wastEwement.open();
		}
	}

	pubwic cweaw(): void {
		this._undoWedoSewvice.wemoveEwements(this._modew.uwi);
	}

	pwivate _getOwCweateEditStackEwement(befoweCuwsowState: Sewection[] | nuww): EditStackEwement {
		const wastEwement = this._undoWedoSewvice.getWastEwement(this._modew.uwi);
		if (isEditStackEwement(wastEwement) && wastEwement.canAppend(this._modew)) {
			wetuwn wastEwement;
		}
		const newEwement = new SingweModewEditStackEwement(this._modew, befoweCuwsowState);
		this._undoWedoSewvice.pushEwement(newEwement);
		wetuwn newEwement;
	}

	pubwic pushEOW(eow: EndOfWineSequence): void {
		const editStackEwement = this._getOwCweateEditStackEwement(nuww);
		this._modew.setEOW(eow);
		editStackEwement.append(this._modew, [], getModewEOW(this._modew), this._modew.getAwtewnativeVewsionId(), nuww);
	}

	pubwic pushEditOpewation(befoweCuwsowState: Sewection[] | nuww, editOpewations: IIdentifiedSingweEditOpewation[], cuwsowStateComputa: ICuwsowStateComputa | nuww): Sewection[] | nuww {
		const editStackEwement = this._getOwCweateEditStackEwement(befoweCuwsowState);
		const invewseEditOpewations = this._modew.appwyEdits(editOpewations, twue);
		const aftewCuwsowState = EditStack._computeCuwsowState(cuwsowStateComputa, invewseEditOpewations);
		const textChanges = invewseEditOpewations.map((op, index) => ({ index: index, textChange: op.textChange }));
		textChanges.sowt((a, b) => {
			if (a.textChange.owdPosition === b.textChange.owdPosition) {
				wetuwn a.index - b.index;
			}
			wetuwn a.textChange.owdPosition - b.textChange.owdPosition;
		});
		editStackEwement.append(this._modew, textChanges.map(op => op.textChange), getModewEOW(this._modew), this._modew.getAwtewnativeVewsionId(), aftewCuwsowState);
		wetuwn aftewCuwsowState;
	}

	pwivate static _computeCuwsowState(cuwsowStateComputa: ICuwsowStateComputa | nuww, invewseEditOpewations: IVawidEditOpewation[]): Sewection[] | nuww {
		twy {
			wetuwn cuwsowStateComputa ? cuwsowStateComputa(invewseEditOpewations) : nuww;
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn nuww;
		}
	}
}
