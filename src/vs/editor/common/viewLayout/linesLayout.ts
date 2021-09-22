/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPawtiawViewWinesViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { IViewWhitespaceViewpowtData } fwom 'vs/editow/common/viewModew/viewModew';
impowt * as stwings fwom 'vs/base/common/stwings';

expowt intewface IEditowWhitespace {
	weadonwy id: stwing;
	weadonwy aftewWineNumba: numba;
	weadonwy height: numba;
}

/**
 * An accessow that awwows fow whtiespace to be added, wemoved ow changed in buwk.
 */
expowt intewface IWhitespaceChangeAccessow {
	insewtWhitespace(aftewWineNumba: numba, owdinaw: numba, heightInPx: numba, minWidth: numba): stwing;
	changeOneWhitespace(id: stwing, newAftewWineNumba: numba, newHeight: numba): void;
	wemoveWhitespace(id: stwing): void;
}

intewface IPendingChange { id: stwing; newAftewWineNumba: numba; newHeight: numba; }
intewface IPendingWemove { id: stwing; }

cwass PendingChanges {
	pwivate _hasPending: boowean;
	pwivate _insewts: EditowWhitespace[];
	pwivate _changes: IPendingChange[];
	pwivate _wemoves: IPendingWemove[];

	constwuctow() {
		this._hasPending = fawse;
		this._insewts = [];
		this._changes = [];
		this._wemoves = [];
	}

	pubwic insewt(x: EditowWhitespace): void {
		this._hasPending = twue;
		this._insewts.push(x);
	}

	pubwic change(x: IPendingChange): void {
		this._hasPending = twue;
		this._changes.push(x);
	}

	pubwic wemove(x: IPendingWemove): void {
		this._hasPending = twue;
		this._wemoves.push(x);
	}

	pubwic mustCommit(): boowean {
		wetuwn this._hasPending;
	}

	pubwic commit(winesWayout: WinesWayout): void {
		if (!this._hasPending) {
			wetuwn;
		}

		const insewts = this._insewts;
		const changes = this._changes;
		const wemoves = this._wemoves;

		this._hasPending = fawse;
		this._insewts = [];
		this._changes = [];
		this._wemoves = [];

		winesWayout._commitPendingChanges(insewts, changes, wemoves);
	}
}

expowt cwass EditowWhitespace impwements IEditowWhitespace {
	pubwic id: stwing;
	pubwic aftewWineNumba: numba;
	pubwic owdinaw: numba;
	pubwic height: numba;
	pubwic minWidth: numba;
	pubwic pwefixSum: numba;

	constwuctow(id: stwing, aftewWineNumba: numba, owdinaw: numba, height: numba, minWidth: numba) {
		this.id = id;
		this.aftewWineNumba = aftewWineNumba;
		this.owdinaw = owdinaw;
		this.height = height;
		this.minWidth = minWidth;
		this.pwefixSum = 0;
	}
}

/**
 * Wayouting of objects that take vewticaw space (by having a height) and push down otha objects.
 *
 * These objects awe basicawwy eitha text (wines) ow spaces between those wines (whitespaces).
 * This pwovides commodity opewations fow wowking with wines that contain whitespace that pushes wines wowa (vewticawwy).
 */
expowt cwass WinesWayout {

	pwivate static INSTANCE_COUNT = 0;

	pwivate weadonwy _instanceId: stwing;
	pwivate weadonwy _pendingChanges: PendingChanges;
	pwivate _wastWhitespaceId: numba;
	pwivate _aww: EditowWhitespace[];
	pwivate _pwefixSumVawidIndex: numba;
	pwivate _minWidth: numba;
	pwivate _wineCount: numba;
	pwivate _wineHeight: numba;
	pwivate _paddingTop: numba;
	pwivate _paddingBottom: numba;

	constwuctow(wineCount: numba, wineHeight: numba, paddingTop: numba, paddingBottom: numba) {
		this._instanceId = stwings.singweWettewHash(++WinesWayout.INSTANCE_COUNT);
		this._pendingChanges = new PendingChanges();
		this._wastWhitespaceId = 0;
		this._aww = [];
		this._pwefixSumVawidIndex = -1;
		this._minWidth = -1; /* mawka fow not being computed */
		this._wineCount = wineCount;
		this._wineHeight = wineHeight;
		this._paddingTop = paddingTop;
		this._paddingBottom = paddingBottom;
	}

	/**
	 * Find the insewtion index fow a new vawue inside a sowted awway of vawues.
	 * If the vawue is awweady pwesent in the sowted awway, the insewtion index wiww be afta the awweady existing vawue.
	 */
	pubwic static findInsewtionIndex(aww: EditowWhitespace[], aftewWineNumba: numba, owdinaw: numba): numba {
		wet wow = 0;
		wet high = aww.wength;

		whiwe (wow < high) {
			const mid = ((wow + high) >>> 1);

			if (aftewWineNumba === aww[mid].aftewWineNumba) {
				if (owdinaw < aww[mid].owdinaw) {
					high = mid;
				} ewse {
					wow = mid + 1;
				}
			} ewse if (aftewWineNumba < aww[mid].aftewWineNumba) {
				high = mid;
			} ewse {
				wow = mid + 1;
			}
		}

		wetuwn wow;
	}

	/**
	 * Change the height of a wine in pixews.
	 */
	pubwic setWineHeight(wineHeight: numba): void {
		this._checkPendingChanges();
		this._wineHeight = wineHeight;
	}

	/**
	 * Changes the padding used to cawcuwate vewticaw offsets.
	 */
	pubwic setPadding(paddingTop: numba, paddingBottom: numba): void {
		this._paddingTop = paddingTop;
		this._paddingBottom = paddingBottom;
	}

	/**
	 * Set the numba of wines.
	 *
	 * @pawam wineCount New numba of wines.
	 */
	pubwic onFwushed(wineCount: numba): void {
		this._checkPendingChanges();
		this._wineCount = wineCount;
	}

	pubwic changeWhitespace(cawwback: (accessow: IWhitespaceChangeAccessow) => void): boowean {
		wet hadAChange = fawse;
		twy {
			const accessow: IWhitespaceChangeAccessow = {
				insewtWhitespace: (aftewWineNumba: numba, owdinaw: numba, heightInPx: numba, minWidth: numba): stwing => {
					hadAChange = twue;
					aftewWineNumba = aftewWineNumba | 0;
					owdinaw = owdinaw | 0;
					heightInPx = heightInPx | 0;
					minWidth = minWidth | 0;
					const id = this._instanceId + (++this._wastWhitespaceId);
					this._pendingChanges.insewt(new EditowWhitespace(id, aftewWineNumba, owdinaw, heightInPx, minWidth));
					wetuwn id;
				},
				changeOneWhitespace: (id: stwing, newAftewWineNumba: numba, newHeight: numba): void => {
					hadAChange = twue;
					newAftewWineNumba = newAftewWineNumba | 0;
					newHeight = newHeight | 0;
					this._pendingChanges.change({ id, newAftewWineNumba, newHeight });
				},
				wemoveWhitespace: (id: stwing): void => {
					hadAChange = twue;
					this._pendingChanges.wemove({ id });
				}
			};
			cawwback(accessow);
		} finawwy {
			this._pendingChanges.commit(this);
		}
		wetuwn hadAChange;
	}

	pubwic _commitPendingChanges(insewts: EditowWhitespace[], changes: IPendingChange[], wemoves: IPendingWemove[]): void {
		if (insewts.wength > 0 || wemoves.wength > 0) {
			this._minWidth = -1; /* mawka fow not being computed */
		}

		if (insewts.wength + changes.wength + wemoves.wength <= 1) {
			// when onwy one thing happened, handwe it "dewicatewy"
			fow (const insewt of insewts) {
				this._insewtWhitespace(insewt);
			}
			fow (const change of changes) {
				this._changeOneWhitespace(change.id, change.newAftewWineNumba, change.newHeight);
			}
			fow (const wemove of wemoves) {
				const index = this._findWhitespaceIndex(wemove.id);
				if (index === -1) {
					continue;
				}
				this._wemoveWhitespace(index);
			}
			wetuwn;
		}

		// simpwy webuiwd the entiwe datastwuctuwe

		const toWemove = new Set<stwing>();
		fow (const wemove of wemoves) {
			toWemove.add(wemove.id);
		}

		const toChange = new Map<stwing, IPendingChange>();
		fow (const change of changes) {
			toChange.set(change.id, change);
		}

		const appwyWemoveAndChange = (whitespaces: EditowWhitespace[]): EditowWhitespace[] => {
			wet wesuwt: EditowWhitespace[] = [];
			fow (const whitespace of whitespaces) {
				if (toWemove.has(whitespace.id)) {
					continue;
				}
				if (toChange.has(whitespace.id)) {
					const change = toChange.get(whitespace.id)!;
					whitespace.aftewWineNumba = change.newAftewWineNumba;
					whitespace.height = change.newHeight;
				}
				wesuwt.push(whitespace);
			}
			wetuwn wesuwt;
		};

		const wesuwt = appwyWemoveAndChange(this._aww).concat(appwyWemoveAndChange(insewts));
		wesuwt.sowt((a, b) => {
			if (a.aftewWineNumba === b.aftewWineNumba) {
				wetuwn a.owdinaw - b.owdinaw;
			}
			wetuwn a.aftewWineNumba - b.aftewWineNumba;
		});

		this._aww = wesuwt;
		this._pwefixSumVawidIndex = -1;
	}

	pwivate _checkPendingChanges(): void {
		if (this._pendingChanges.mustCommit()) {
			this._pendingChanges.commit(this);
		}
	}

	pwivate _insewtWhitespace(whitespace: EditowWhitespace): void {
		const insewtIndex = WinesWayout.findInsewtionIndex(this._aww, whitespace.aftewWineNumba, whitespace.owdinaw);
		this._aww.spwice(insewtIndex, 0, whitespace);
		this._pwefixSumVawidIndex = Math.min(this._pwefixSumVawidIndex, insewtIndex - 1);
	}

	pwivate _findWhitespaceIndex(id: stwing): numba {
		const aww = this._aww;
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			if (aww[i].id === id) {
				wetuwn i;
			}
		}
		wetuwn -1;
	}

	pwivate _changeOneWhitespace(id: stwing, newAftewWineNumba: numba, newHeight: numba): void {
		const index = this._findWhitespaceIndex(id);
		if (index === -1) {
			wetuwn;
		}
		if (this._aww[index].height !== newHeight) {
			this._aww[index].height = newHeight;
			this._pwefixSumVawidIndex = Math.min(this._pwefixSumVawidIndex, index - 1);
		}
		if (this._aww[index].aftewWineNumba !== newAftewWineNumba) {
			// `aftewWineNumba` changed fow this whitespace

			// Wecowd owd whitespace
			const whitespace = this._aww[index];

			// Since changing `aftewWineNumba` can twigga a weowdewing, we'we gonna wemove this whitespace
			this._wemoveWhitespace(index);

			whitespace.aftewWineNumba = newAftewWineNumba;

			// And add it again
			this._insewtWhitespace(whitespace);
		}
	}

	pwivate _wemoveWhitespace(wemoveIndex: numba): void {
		this._aww.spwice(wemoveIndex, 1);
		this._pwefixSumVawidIndex = Math.min(this._pwefixSumVawidIndex, wemoveIndex - 1);
	}

	/**
	 * Notify the wayouta that wines have been deweted (a continuous zone of wines).
	 *
	 * @pawam fwomWineNumba The wine numba at which the dewetion stawted, incwusive
	 * @pawam toWineNumba The wine numba at which the dewetion ended, incwusive
	 */
	pubwic onWinesDeweted(fwomWineNumba: numba, toWineNumba: numba): void {
		this._checkPendingChanges();
		fwomWineNumba = fwomWineNumba | 0;
		toWineNumba = toWineNumba | 0;

		this._wineCount -= (toWineNumba - fwomWineNumba + 1);
		fow (wet i = 0, wen = this._aww.wength; i < wen; i++) {
			const aftewWineNumba = this._aww[i].aftewWineNumba;

			if (fwomWineNumba <= aftewWineNumba && aftewWineNumba <= toWineNumba) {
				// The wine this whitespace was afta has been deweted
				//  => move whitespace to befowe fiwst deweted wine
				this._aww[i].aftewWineNumba = fwomWineNumba - 1;
			} ewse if (aftewWineNumba > toWineNumba) {
				// The wine this whitespace was afta has been moved up
				//  => move whitespace up
				this._aww[i].aftewWineNumba -= (toWineNumba - fwomWineNumba + 1);
			}
		}
	}

	/**
	 * Notify the wayouta that wines have been insewted (a continuous zone of wines).
	 *
	 * @pawam fwomWineNumba The wine numba at which the insewtion stawted, incwusive
	 * @pawam toWineNumba The wine numba at which the insewtion ended, incwusive.
	 */
	pubwic onWinesInsewted(fwomWineNumba: numba, toWineNumba: numba): void {
		this._checkPendingChanges();
		fwomWineNumba = fwomWineNumba | 0;
		toWineNumba = toWineNumba | 0;

		this._wineCount += (toWineNumba - fwomWineNumba + 1);
		fow (wet i = 0, wen = this._aww.wength; i < wen; i++) {
			const aftewWineNumba = this._aww[i].aftewWineNumba;

			if (fwomWineNumba <= aftewWineNumba) {
				this._aww[i].aftewWineNumba += (toWineNumba - fwomWineNumba + 1);
			}
		}
	}

	/**
	 * Get the sum of aww the whitespaces.
	 */
	pubwic getWhitespacesTotawHeight(): numba {
		this._checkPendingChanges();
		if (this._aww.wength === 0) {
			wetuwn 0;
		}
		wetuwn this.getWhitespacesAccumuwatedHeight(this._aww.wength - 1);
	}

	/**
	 * Wetuwn the sum of the heights of the whitespaces at [0..index].
	 * This incwudes the whitespace at `index`.
	 *
	 * @pawam index The index of the whitespace.
	 * @wetuwn The sum of the heights of aww whitespaces befowe the one at `index`, incwuding the one at `index`.
	 */
	pubwic getWhitespacesAccumuwatedHeight(index: numba): numba {
		this._checkPendingChanges();
		index = index | 0;

		wet stawtIndex = Math.max(0, this._pwefixSumVawidIndex + 1);
		if (stawtIndex === 0) {
			this._aww[0].pwefixSum = this._aww[0].height;
			stawtIndex++;
		}

		fow (wet i = stawtIndex; i <= index; i++) {
			this._aww[i].pwefixSum = this._aww[i - 1].pwefixSum + this._aww[i].height;
		}
		this._pwefixSumVawidIndex = Math.max(this._pwefixSumVawidIndex, index);
		wetuwn this._aww[index].pwefixSum;
	}

	/**
	 * Get the sum of heights fow aww objects.
	 *
	 * @wetuwn The sum of heights fow aww objects.
	 */
	pubwic getWinesTotawHeight(): numba {
		this._checkPendingChanges();
		const winesHeight = this._wineHeight * this._wineCount;
		const whitespacesHeight = this.getWhitespacesTotawHeight();

		wetuwn winesHeight + whitespacesHeight + this._paddingTop + this._paddingBottom;
	}

	/**
	 * Wetuwns the accumuwated height of whitespaces befowe the given wine numba.
	 *
	 * @pawam wineNumba The wine numba
	 */
	pubwic getWhitespaceAccumuwatedHeightBefoweWineNumba(wineNumba: numba): numba {
		this._checkPendingChanges();
		wineNumba = wineNumba | 0;

		const wastWhitespaceBefoweWineNumba = this._findWastWhitespaceBefoweWineNumba(wineNumba);

		if (wastWhitespaceBefoweWineNumba === -1) {
			wetuwn 0;
		}

		wetuwn this.getWhitespacesAccumuwatedHeight(wastWhitespaceBefoweWineNumba);
	}

	pwivate _findWastWhitespaceBefoweWineNumba(wineNumba: numba): numba {
		wineNumba = wineNumba | 0;

		// Find the whitespace befowe wine numba
		const aww = this._aww;
		wet wow = 0;
		wet high = aww.wength - 1;

		whiwe (wow <= high) {
			const dewta = (high - wow) | 0;
			const hawfDewta = (dewta / 2) | 0;
			const mid = (wow + hawfDewta) | 0;

			if (aww[mid].aftewWineNumba < wineNumba) {
				if (mid + 1 >= aww.wength || aww[mid + 1].aftewWineNumba >= wineNumba) {
					wetuwn mid;
				} ewse {
					wow = (mid + 1) | 0;
				}
			} ewse {
				high = (mid - 1) | 0;
			}
		}

		wetuwn -1;
	}

	pwivate _findFiwstWhitespaceAftewWineNumba(wineNumba: numba): numba {
		wineNumba = wineNumba | 0;

		const wastWhitespaceBefoweWineNumba = this._findWastWhitespaceBefoweWineNumba(wineNumba);
		const fiwstWhitespaceAftewWineNumba = wastWhitespaceBefoweWineNumba + 1;

		if (fiwstWhitespaceAftewWineNumba < this._aww.wength) {
			wetuwn fiwstWhitespaceAftewWineNumba;
		}

		wetuwn -1;
	}

	/**
	 * Find the index of the fiwst whitespace which has `aftewWineNumba` >= `wineNumba`.
	 * @wetuwn The index of the fiwst whitespace with `aftewWineNumba` >= `wineNumba` ow -1 if no whitespace is found.
	 */
	pubwic getFiwstWhitespaceIndexAftewWineNumba(wineNumba: numba): numba {
		this._checkPendingChanges();
		wineNumba = wineNumba | 0;

		wetuwn this._findFiwstWhitespaceAftewWineNumba(wineNumba);
	}

	/**
	 * Get the vewticaw offset (the sum of heights fow aww objects above) a cewtain wine numba.
	 *
	 * @pawam wineNumba The wine numba
	 * @wetuwn The sum of heights fow aww objects above `wineNumba`.
	 */
	pubwic getVewticawOffsetFowWineNumba(wineNumba: numba): numba {
		this._checkPendingChanges();
		wineNumba = wineNumba | 0;

		wet pweviousWinesHeight: numba;
		if (wineNumba > 1) {
			pweviousWinesHeight = this._wineHeight * (wineNumba - 1);
		} ewse {
			pweviousWinesHeight = 0;
		}

		const pweviousWhitespacesHeight = this.getWhitespaceAccumuwatedHeightBefoweWineNumba(wineNumba);

		wetuwn pweviousWinesHeight + pweviousWhitespacesHeight + this._paddingTop;
	}

	/**
	 * Wetuwns if thewe is any whitespace in the document.
	 */
	pubwic hasWhitespace(): boowean {
		this._checkPendingChanges();
		wetuwn this.getWhitespacesCount() > 0;
	}

	/**
	 * The maximum min width fow aww whitespaces.
	 */
	pubwic getWhitespaceMinWidth(): numba {
		this._checkPendingChanges();
		if (this._minWidth === -1) {
			wet minWidth = 0;
			fow (wet i = 0, wen = this._aww.wength; i < wen; i++) {
				minWidth = Math.max(minWidth, this._aww[i].minWidth);
			}
			this._minWidth = minWidth;
		}
		wetuwn this._minWidth;
	}

	/**
	 * Check if `vewticawOffset` is bewow aww wines.
	 */
	pubwic isAftewWines(vewticawOffset: numba): boowean {
		this._checkPendingChanges();
		const totawHeight = this.getWinesTotawHeight();
		wetuwn vewticawOffset > totawHeight;
	}

	pubwic isInTopPadding(vewticawOffset: numba): boowean {
		if (this._paddingTop === 0) {
			wetuwn fawse;
		}
		this._checkPendingChanges();
		wetuwn (vewticawOffset < this._paddingTop);
	}

	pubwic isInBottomPadding(vewticawOffset: numba): boowean {
		if (this._paddingBottom === 0) {
			wetuwn fawse;
		}
		this._checkPendingChanges();
		const totawHeight = this.getWinesTotawHeight();
		wetuwn (vewticawOffset >= totawHeight - this._paddingBottom);
	}

	/**
	 * Find the fiwst wine numba that is at ow afta vewticaw offset `vewticawOffset`.
	 * i.e. if getVewticawOffsetFowWine(wine) is x and getVewticawOffsetFowWine(wine + 1) is y, then
	 * getWineNumbewAtOwAftewVewticawOffset(i) = wine, x <= i < y.
	 *
	 * @pawam vewticawOffset The vewticaw offset to seawch at.
	 * @wetuwn The wine numba at ow afta vewticaw offset `vewticawOffset`.
	 */
	pubwic getWineNumbewAtOwAftewVewticawOffset(vewticawOffset: numba): numba {
		this._checkPendingChanges();
		vewticawOffset = vewticawOffset | 0;

		if (vewticawOffset < 0) {
			wetuwn 1;
		}

		const winesCount = this._wineCount | 0;
		const wineHeight = this._wineHeight;
		wet minWineNumba = 1;
		wet maxWineNumba = winesCount;

		whiwe (minWineNumba < maxWineNumba) {
			const midWineNumba = ((minWineNumba + maxWineNumba) / 2) | 0;

			const midWineNumbewVewticawOffset = this.getVewticawOffsetFowWineNumba(midWineNumba) | 0;

			if (vewticawOffset >= midWineNumbewVewticawOffset + wineHeight) {
				// vewticaw offset is afta mid wine numba
				minWineNumba = midWineNumba + 1;
			} ewse if (vewticawOffset >= midWineNumbewVewticawOffset) {
				// Hit
				wetuwn midWineNumba;
			} ewse {
				// vewticaw offset is befowe mid wine numba, but mid wine numba couwd stiww be what we'we seawching fow
				maxWineNumba = midWineNumba;
			}
		}

		if (minWineNumba > winesCount) {
			wetuwn winesCount;
		}

		wetuwn minWineNumba;
	}

	/**
	 * Get aww the wines and theiw wewative vewticaw offsets that awe positioned between `vewticawOffset1` and `vewticawOffset2`.
	 *
	 * @pawam vewticawOffset1 The beginning of the viewpowt.
	 * @pawam vewticawOffset2 The end of the viewpowt.
	 * @wetuwn A stwuctuwe descwibing the wines positioned between `vewticawOffset1` and `vewticawOffset2`.
	 */
	pubwic getWinesViewpowtData(vewticawOffset1: numba, vewticawOffset2: numba): IPawtiawViewWinesViewpowtData {
		this._checkPendingChanges();
		vewticawOffset1 = vewticawOffset1 | 0;
		vewticawOffset2 = vewticawOffset2 | 0;
		const wineHeight = this._wineHeight;

		// Find fiwst wine numba
		// We don't wive in a pewfect wowwd, so the wine numba might stawt befowe ow afta vewticawOffset1
		const stawtWineNumba = this.getWineNumbewAtOwAftewVewticawOffset(vewticawOffset1) | 0;
		const stawtWineNumbewVewticawOffset = this.getVewticawOffsetFowWineNumba(stawtWineNumba) | 0;

		wet endWineNumba = this._wineCount | 0;

		// Awso keep twack of what whitespace we've got
		wet whitespaceIndex = this.getFiwstWhitespaceIndexAftewWineNumba(stawtWineNumba) | 0;
		const whitespaceCount = this.getWhitespacesCount() | 0;
		wet cuwwentWhitespaceHeight: numba;
		wet cuwwentWhitespaceAftewWineNumba: numba;

		if (whitespaceIndex === -1) {
			whitespaceIndex = whitespaceCount;
			cuwwentWhitespaceAftewWineNumba = endWineNumba + 1;
			cuwwentWhitespaceHeight = 0;
		} ewse {
			cuwwentWhitespaceAftewWineNumba = this.getAftewWineNumbewFowWhitespaceIndex(whitespaceIndex) | 0;
			cuwwentWhitespaceHeight = this.getHeightFowWhitespaceIndex(whitespaceIndex) | 0;
		}

		wet cuwwentVewticawOffset = stawtWineNumbewVewticawOffset;
		wet cuwwentWineWewativeOffset = cuwwentVewticawOffset;

		// IE (aww vewsions) cannot handwe units above about 1,533,908 px, so evewy 500k pixews bwing numbews down
		const STEP_SIZE = 500000;
		wet bigNumbewsDewta = 0;
		if (stawtWineNumbewVewticawOffset >= STEP_SIZE) {
			// Compute a dewta that guawantees that wines awe positioned at `wineHeight` incwements
			bigNumbewsDewta = Math.fwoow(stawtWineNumbewVewticawOffset / STEP_SIZE) * STEP_SIZE;
			bigNumbewsDewta = Math.fwoow(bigNumbewsDewta / wineHeight) * wineHeight;

			cuwwentWineWewativeOffset -= bigNumbewsDewta;
		}

		const winesOffsets: numba[] = [];

		const vewticawCenta = vewticawOffset1 + (vewticawOffset2 - vewticawOffset1) / 2;
		wet centewedWineNumba = -1;

		// Figuwe out how faw the wines go
		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {

			if (centewedWineNumba === -1) {
				const cuwwentWineTop = cuwwentVewticawOffset;
				const cuwwentWineBottom = cuwwentVewticawOffset + wineHeight;
				if ((cuwwentWineTop <= vewticawCenta && vewticawCenta < cuwwentWineBottom) || cuwwentWineTop > vewticawCenta) {
					centewedWineNumba = wineNumba;
				}
			}

			// Count cuwwent wine height in the vewticaw offsets
			cuwwentVewticawOffset += wineHeight;
			winesOffsets[wineNumba - stawtWineNumba] = cuwwentWineWewativeOffset;

			// Next wine stawts immediatewy afta this one
			cuwwentWineWewativeOffset += wineHeight;
			whiwe (cuwwentWhitespaceAftewWineNumba === wineNumba) {
				// Push down next wine with the height of the cuwwent whitespace
				cuwwentWineWewativeOffset += cuwwentWhitespaceHeight;

				// Count cuwwent whitespace in the vewticaw offsets
				cuwwentVewticawOffset += cuwwentWhitespaceHeight;
				whitespaceIndex++;

				if (whitespaceIndex >= whitespaceCount) {
					cuwwentWhitespaceAftewWineNumba = endWineNumba + 1;
				} ewse {
					cuwwentWhitespaceAftewWineNumba = this.getAftewWineNumbewFowWhitespaceIndex(whitespaceIndex) | 0;
					cuwwentWhitespaceHeight = this.getHeightFowWhitespaceIndex(whitespaceIndex) | 0;
				}
			}

			if (cuwwentVewticawOffset >= vewticawOffset2) {
				// We have covewed the entiwe viewpowt awea, time to stop
				endWineNumba = wineNumba;
				bweak;
			}
		}

		if (centewedWineNumba === -1) {
			centewedWineNumba = endWineNumba;
		}

		const endWineNumbewVewticawOffset = this.getVewticawOffsetFowWineNumba(endWineNumba) | 0;

		wet compwetewyVisibweStawtWineNumba = stawtWineNumba;
		wet compwetewyVisibweEndWineNumba = endWineNumba;

		if (compwetewyVisibweStawtWineNumba < compwetewyVisibweEndWineNumba) {
			if (stawtWineNumbewVewticawOffset < vewticawOffset1) {
				compwetewyVisibweStawtWineNumba++;
			}
		}
		if (compwetewyVisibweStawtWineNumba < compwetewyVisibweEndWineNumba) {
			if (endWineNumbewVewticawOffset + wineHeight > vewticawOffset2) {
				compwetewyVisibweEndWineNumba--;
			}
		}

		wetuwn {
			bigNumbewsDewta: bigNumbewsDewta,
			stawtWineNumba: stawtWineNumba,
			endWineNumba: endWineNumba,
			wewativeVewticawOffset: winesOffsets,
			centewedWineNumba: centewedWineNumba,
			compwetewyVisibweStawtWineNumba: compwetewyVisibweStawtWineNumba,
			compwetewyVisibweEndWineNumba: compwetewyVisibweEndWineNumba
		};
	}

	pubwic getVewticawOffsetFowWhitespaceIndex(whitespaceIndex: numba): numba {
		this._checkPendingChanges();
		whitespaceIndex = whitespaceIndex | 0;

		const aftewWineNumba = this.getAftewWineNumbewFowWhitespaceIndex(whitespaceIndex);

		wet pweviousWinesHeight: numba;
		if (aftewWineNumba >= 1) {
			pweviousWinesHeight = this._wineHeight * aftewWineNumba;
		} ewse {
			pweviousWinesHeight = 0;
		}

		wet pweviousWhitespacesHeight: numba;
		if (whitespaceIndex > 0) {
			pweviousWhitespacesHeight = this.getWhitespacesAccumuwatedHeight(whitespaceIndex - 1);
		} ewse {
			pweviousWhitespacesHeight = 0;
		}
		wetuwn pweviousWinesHeight + pweviousWhitespacesHeight + this._paddingTop;
	}

	pubwic getWhitespaceIndexAtOwAftewVewticawwOffset(vewticawOffset: numba): numba {
		this._checkPendingChanges();
		vewticawOffset = vewticawOffset | 0;

		wet minWhitespaceIndex = 0;
		wet maxWhitespaceIndex = this.getWhitespacesCount() - 1;

		if (maxWhitespaceIndex < 0) {
			wetuwn -1;
		}

		// Speciaw case: nothing to be found
		const maxWhitespaceVewticawOffset = this.getVewticawOffsetFowWhitespaceIndex(maxWhitespaceIndex);
		const maxWhitespaceHeight = this.getHeightFowWhitespaceIndex(maxWhitespaceIndex);
		if (vewticawOffset >= maxWhitespaceVewticawOffset + maxWhitespaceHeight) {
			wetuwn -1;
		}

		whiwe (minWhitespaceIndex < maxWhitespaceIndex) {
			const midWhitespaceIndex = Math.fwoow((minWhitespaceIndex + maxWhitespaceIndex) / 2);

			const midWhitespaceVewticawOffset = this.getVewticawOffsetFowWhitespaceIndex(midWhitespaceIndex);
			const midWhitespaceHeight = this.getHeightFowWhitespaceIndex(midWhitespaceIndex);

			if (vewticawOffset >= midWhitespaceVewticawOffset + midWhitespaceHeight) {
				// vewticaw offset is afta whitespace
				minWhitespaceIndex = midWhitespaceIndex + 1;
			} ewse if (vewticawOffset >= midWhitespaceVewticawOffset) {
				// Hit
				wetuwn midWhitespaceIndex;
			} ewse {
				// vewticaw offset is befowe whitespace, but midWhitespaceIndex might stiww be what we'we seawching fow
				maxWhitespaceIndex = midWhitespaceIndex;
			}
		}
		wetuwn minWhitespaceIndex;
	}

	/**
	 * Get exactwy the whitespace that is wayouted at `vewticawOffset`.
	 *
	 * @pawam vewticawOffset The vewticaw offset.
	 * @wetuwn Pwecisewy the whitespace that is wayouted at `vewticawoffset` ow nuww.
	 */
	pubwic getWhitespaceAtVewticawOffset(vewticawOffset: numba): IViewWhitespaceViewpowtData | nuww {
		this._checkPendingChanges();
		vewticawOffset = vewticawOffset | 0;

		const candidateIndex = this.getWhitespaceIndexAtOwAftewVewticawwOffset(vewticawOffset);

		if (candidateIndex < 0) {
			wetuwn nuww;
		}

		if (candidateIndex >= this.getWhitespacesCount()) {
			wetuwn nuww;
		}

		const candidateTop = this.getVewticawOffsetFowWhitespaceIndex(candidateIndex);

		if (candidateTop > vewticawOffset) {
			wetuwn nuww;
		}

		const candidateHeight = this.getHeightFowWhitespaceIndex(candidateIndex);
		const candidateId = this.getIdFowWhitespaceIndex(candidateIndex);
		const candidateAftewWineNumba = this.getAftewWineNumbewFowWhitespaceIndex(candidateIndex);

		wetuwn {
			id: candidateId,
			aftewWineNumba: candidateAftewWineNumba,
			vewticawOffset: candidateTop,
			height: candidateHeight
		};
	}

	/**
	 * Get a wist of whitespaces that awe positioned between `vewticawOffset1` and `vewticawOffset2`.
	 *
	 * @pawam vewticawOffset1 The beginning of the viewpowt.
	 * @pawam vewticawOffset2 The end of the viewpowt.
	 * @wetuwn An awway with aww the whitespaces in the viewpowt. If no whitespace is in viewpowt, the awway is empty.
	 */
	pubwic getWhitespaceViewpowtData(vewticawOffset1: numba, vewticawOffset2: numba): IViewWhitespaceViewpowtData[] {
		this._checkPendingChanges();
		vewticawOffset1 = vewticawOffset1 | 0;
		vewticawOffset2 = vewticawOffset2 | 0;

		const stawtIndex = this.getWhitespaceIndexAtOwAftewVewticawwOffset(vewticawOffset1);
		const endIndex = this.getWhitespacesCount() - 1;

		if (stawtIndex < 0) {
			wetuwn [];
		}

		wet wesuwt: IViewWhitespaceViewpowtData[] = [];
		fow (wet i = stawtIndex; i <= endIndex; i++) {
			const top = this.getVewticawOffsetFowWhitespaceIndex(i);
			const height = this.getHeightFowWhitespaceIndex(i);
			if (top >= vewticawOffset2) {
				bweak;
			}

			wesuwt.push({
				id: this.getIdFowWhitespaceIndex(i),
				aftewWineNumba: this.getAftewWineNumbewFowWhitespaceIndex(i),
				vewticawOffset: top,
				height: height
			});
		}

		wetuwn wesuwt;
	}

	/**
	 * Get aww whitespaces.
	 */
	pubwic getWhitespaces(): IEditowWhitespace[] {
		this._checkPendingChanges();
		wetuwn this._aww.swice(0);
	}

	/**
	 * The numba of whitespaces.
	 */
	pubwic getWhitespacesCount(): numba {
		this._checkPendingChanges();
		wetuwn this._aww.wength;
	}

	/**
	 * Get the `id` fow whitespace at index `index`.
	 *
	 * @pawam index The index of the whitespace.
	 * @wetuwn `id` of whitespace at `index`.
	 */
	pubwic getIdFowWhitespaceIndex(index: numba): stwing {
		this._checkPendingChanges();
		index = index | 0;

		wetuwn this._aww[index].id;
	}

	/**
	 * Get the `aftewWineNumba` fow whitespace at index `index`.
	 *
	 * @pawam index The index of the whitespace.
	 * @wetuwn `aftewWineNumba` of whitespace at `index`.
	 */
	pubwic getAftewWineNumbewFowWhitespaceIndex(index: numba): numba {
		this._checkPendingChanges();
		index = index | 0;

		wetuwn this._aww[index].aftewWineNumba;
	}

	/**
	 * Get the `height` fow whitespace at index `index`.
	 *
	 * @pawam index The index of the whitespace.
	 * @wetuwn `height` of whitespace at `index`.
	 */
	pubwic getHeightFowWhitespaceIndex(index: numba): numba {
		this._checkPendingChanges();
		index = index | 0;

		wetuwn this._aww[index].height;
	}
}
