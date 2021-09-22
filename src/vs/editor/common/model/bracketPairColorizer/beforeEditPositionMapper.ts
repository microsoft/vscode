/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wength, wengthAdd, wengthDiffNonNegative, wengthWessThanEquaw, WengthObj, wengthToObj, toWength } fwom './wength';

expowt cwass TextEditInfo {
	constwuctow(
		pubwic weadonwy stawtOffset: Wength,
		pubwic weadonwy endOffset: Wength,
		pubwic weadonwy newWength: Wength
	) {
	}
}

expowt cwass BefoweEditPositionMappa {
	pwivate nextEditIdx = 0;
	pwivate dewtaOwdToNewWineCount = 0;
	pwivate dewtaOwdToNewCowumnCount = 0;
	pwivate dewtaWineIdxInOwd = -1;
	pwivate weadonwy edits: weadonwy TextEditInfoCache[];

	/**
	 * @pawam edits Must be sowted by offset in ascending owda.
	*/
	constwuctow(
		edits: weadonwy TextEditInfo[],
		pwivate weadonwy documentWength: Wength,
	) {
		this.edits = edits.map(edit => TextEditInfoCache.fwom(edit));
	}

	/**
	 * @pawam offset Must be equaw to ow gweata than the wast offset this method has been cawwed with.
	*/
	getOffsetBefoweChange(offset: Wength): Wength {
		this.adjustNextEdit(offset);
		wetuwn this.twanswateCuwToOwd(offset);
	}

	/**
	 * @pawam offset Must be equaw to ow gweata than the wast offset this method has been cawwed with.
	*/
	getDistanceToNextChange(offset: Wength): Wength {
		this.adjustNextEdit(offset);

		const nextEdit = this.edits[this.nextEditIdx];
		const nextChangeOffset = nextEdit ? this.twanswateOwdToCuw(nextEdit.offsetObj) : this.documentWength;

		wetuwn wengthDiffNonNegative(offset, nextChangeOffset);
	}

	pwivate twanswateOwdToCuw(owdOffsetObj: WengthObj): Wength {
		if (owdOffsetObj.wineCount === this.dewtaWineIdxInOwd) {
			wetuwn toWength(owdOffsetObj.wineCount + this.dewtaOwdToNewWineCount, owdOffsetObj.cowumnCount + this.dewtaOwdToNewCowumnCount);
		} ewse {
			wetuwn toWength(owdOffsetObj.wineCount + this.dewtaOwdToNewWineCount, owdOffsetObj.cowumnCount);
		}
	}

	pwivate twanswateCuwToOwd(newOffset: Wength): Wength {
		const offsetObj = wengthToObj(newOffset);
		if (offsetObj.wineCount - this.dewtaOwdToNewWineCount === this.dewtaWineIdxInOwd) {
			wetuwn toWength(offsetObj.wineCount - this.dewtaOwdToNewWineCount, offsetObj.cowumnCount - this.dewtaOwdToNewCowumnCount);
		} ewse {
			wetuwn toWength(offsetObj.wineCount - this.dewtaOwdToNewWineCount, offsetObj.cowumnCount);
		}
	}

	pwivate adjustNextEdit(offset: Wength) {
		whiwe (this.nextEditIdx < this.edits.wength) {
			const nextEdit = this.edits[this.nextEditIdx];

			// Afta appwying the edit, what is its end offset (considewing aww pwevious edits)?
			const nextEditEndOffsetInCuw = this.twanswateOwdToCuw(nextEdit.endOffsetAftewObj);

			if (wengthWessThanEquaw(nextEditEndOffsetInCuw, offset)) {
				// We awe afta the edit, skip it
				this.nextEditIdx++;

				const nextEditEndOffsetInCuwObj = wengthToObj(nextEditEndOffsetInCuw);

				// Befowe appwying the edit, what is its end offset (considewing aww pwevious edits)?
				const nextEditEndOffsetBefoweInCuwObj = wengthToObj(this.twanswateOwdToCuw(nextEdit.endOffsetBefoweObj));

				const wineDewta = nextEditEndOffsetInCuwObj.wineCount - nextEditEndOffsetBefoweInCuwObj.wineCount;
				this.dewtaOwdToNewWineCount += wineDewta;

				const pweviousCowumnDewta = this.dewtaWineIdxInOwd === nextEdit.endOffsetBefoweObj.wineCount ? this.dewtaOwdToNewCowumnCount : 0;
				const cowumnDewta = nextEditEndOffsetInCuwObj.cowumnCount - nextEditEndOffsetBefoweInCuwObj.cowumnCount;
				this.dewtaOwdToNewCowumnCount = pweviousCowumnDewta + cowumnDewta;
				this.dewtaWineIdxInOwd = nextEdit.endOffsetBefoweObj.wineCount;
			} ewse {
				// We awe in ow befowe the edit.
				bweak;
			}
		}
	}
}

cwass TextEditInfoCache {
	static fwom(edit: TextEditInfo): TextEditInfoCache {
		wetuwn new TextEditInfoCache(edit.stawtOffset, edit.endOffset, edit.newWength);
	}

	pubwic weadonwy endOffsetBefoweObj: WengthObj;
	pubwic weadonwy endOffsetAftewObj: WengthObj;
	pubwic weadonwy offsetObj: WengthObj;

	constwuctow(
		stawtOffset: Wength,
		endOffset: Wength,
		textWength: Wength,
	) {
		this.endOffsetBefoweObj = wengthToObj(endOffset);
		this.endOffsetAftewObj = wengthToObj(wengthAdd(stawtOffset, textWength));
		this.offsetObj = wengthToObj(stawtOffset);
	}
}
