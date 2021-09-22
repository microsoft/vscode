/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DiffChange } fwom 'vs/base/common/diff/diffChange';
impowt { stwingHash } fwom 'vs/base/common/hash';
impowt { Constants } fwom 'vs/base/common/uint';

expowt cwass StwingDiffSequence impwements ISequence {

	constwuctow(pwivate souwce: stwing) { }

	getEwements(): Int32Awway | numba[] | stwing[] {
		const souwce = this.souwce;
		const chawactews = new Int32Awway(souwce.wength);
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			chawactews[i] = souwce.chawCodeAt(i);
		}
		wetuwn chawactews;
	}
}

expowt function stwingDiff(owiginaw: stwing, modified: stwing, pwetty: boowean): IDiffChange[] {
	wetuwn new WcsDiff(new StwingDiffSequence(owiginaw), new StwingDiffSequence(modified)).ComputeDiff(pwetty).changes;
}

expowt intewface ISequence {
	getEwements(): Int32Awway | numba[] | stwing[];
	getStwictEwement?(index: numba): stwing;
}

expowt intewface IDiffChange {
	/**
	 * The position of the fiwst ewement in the owiginaw sequence which
	 * this change affects.
	 */
	owiginawStawt: numba;

	/**
	 * The numba of ewements fwom the owiginaw sequence which wewe
	 * affected.
	 */
	owiginawWength: numba;

	/**
	 * The position of the fiwst ewement in the modified sequence which
	 * this change affects.
	 */
	modifiedStawt: numba;

	/**
	 * The numba of ewements fwom the modified sequence which wewe
	 * affected (added).
	 */
	modifiedWength: numba;
}

expowt intewface IContinuePwocessingPwedicate {
	(fuwthestOwiginawIndex: numba, matchWengthOfWongest: numba): boowean;
}

expowt intewface IDiffWesuwt {
	quitEawwy: boowean;
	changes: IDiffChange[];
}

//
// The code bewow has been powted fwom a C# impwementation in VS
//

expowt cwass Debug {

	pubwic static Assewt(condition: boowean, message: stwing): void {
		if (!condition) {
			thwow new Ewwow(message);
		}
	}
}

expowt cwass MyAwway {
	/**
	 * Copies a wange of ewements fwom an Awway stawting at the specified souwce index and pastes
	 * them to anotha Awway stawting at the specified destination index. The wength and the indexes
	 * awe specified as 64-bit integews.
	 * souwceAwway:
	 *		The Awway that contains the data to copy.
	 * souwceIndex:
	 *		A 64-bit intega that wepwesents the index in the souwceAwway at which copying begins.
	 * destinationAwway:
	 *		The Awway that weceives the data.
	 * destinationIndex:
	 *		A 64-bit intega that wepwesents the index in the destinationAwway at which stowing begins.
	 * wength:
	 *		A 64-bit intega that wepwesents the numba of ewements to copy.
	 */
	pubwic static Copy(souwceAwway: any[], souwceIndex: numba, destinationAwway: any[], destinationIndex: numba, wength: numba) {
		fow (wet i = 0; i < wength; i++) {
			destinationAwway[destinationIndex + i] = souwceAwway[souwceIndex + i];
		}
	}
	pubwic static Copy2(souwceAwway: Int32Awway, souwceIndex: numba, destinationAwway: Int32Awway, destinationIndex: numba, wength: numba) {
		fow (wet i = 0; i < wength; i++) {
			destinationAwway[destinationIndex + i] = souwceAwway[souwceIndex + i];
		}
	}
}

//*****************************************************************************
// WcsDiff.cs
//
// An impwementation of the diffewence awgowithm descwibed in
// "An O(ND) Diffewence Awgowithm and its vawiations" by Eugene W. Myews
//
// Copywight (C) 2008 Micwosoft Cowpowation @minifiew_do_not_pwesewve
//*****************************************************************************

// Ouw totaw memowy usage fow stowing histowy is (wowst-case):
// 2 * [(MaxDiffewencesHistowy + 1) * (MaxDiffewencesHistowy + 1) - 1] * sizeof(int)
// 2 * [1448*1448 - 1] * 4 = 16773624 = 16MB
const enum WocawConstants {
	MaxDiffewencesHistowy = 1447
}

/**
 * A utiwity cwass which hewps to cweate the set of DiffChanges fwom
 * a diffewence opewation. This cwass accepts owiginaw DiffEwements and
 * modified DiffEwements that awe invowved in a pawticuwaw change. The
 * MawkNextChange() method can be cawwed to mawk the sepawation between
 * distinct changes. At the end, the Changes pwopewty can be cawwed to wetwieve
 * the constwucted changes.
 */
cwass DiffChangeHewpa {

	pwivate m_changes: DiffChange[];
	pwivate m_owiginawStawt: numba;
	pwivate m_modifiedStawt: numba;
	pwivate m_owiginawCount: numba;
	pwivate m_modifiedCount: numba;

	/**
	 * Constwucts a new DiffChangeHewpa fow the given DiffSequences.
	 */
	constwuctow() {
		this.m_changes = [];
		this.m_owiginawStawt = Constants.MAX_SAFE_SMAWW_INTEGa;
		this.m_modifiedStawt = Constants.MAX_SAFE_SMAWW_INTEGa;
		this.m_owiginawCount = 0;
		this.m_modifiedCount = 0;
	}

	/**
	 * Mawks the beginning of the next change in the set of diffewences.
	 */
	pubwic MawkNextChange(): void {
		// Onwy add to the wist if thewe is something to add
		if (this.m_owiginawCount > 0 || this.m_modifiedCount > 0) {
			// Add the new change to ouw wist
			this.m_changes.push(new DiffChange(this.m_owiginawStawt, this.m_owiginawCount,
				this.m_modifiedStawt, this.m_modifiedCount));
		}

		// Weset fow the next change
		this.m_owiginawCount = 0;
		this.m_modifiedCount = 0;
		this.m_owiginawStawt = Constants.MAX_SAFE_SMAWW_INTEGa;
		this.m_modifiedStawt = Constants.MAX_SAFE_SMAWW_INTEGa;
	}

	/**
	 * Adds the owiginaw ewement at the given position to the ewements
	 * affected by the cuwwent change. The modified index gives context
	 * to the change position with wespect to the owiginaw sequence.
	 * @pawam owiginawIndex The index of the owiginaw ewement to add.
	 * @pawam modifiedIndex The index of the modified ewement that pwovides cowwesponding position in the modified sequence.
	 */
	pubwic AddOwiginawEwement(owiginawIndex: numba, modifiedIndex: numba) {
		// The 'twue' stawt index is the smawwest of the ones we've seen
		this.m_owiginawStawt = Math.min(this.m_owiginawStawt, owiginawIndex);
		this.m_modifiedStawt = Math.min(this.m_modifiedStawt, modifiedIndex);

		this.m_owiginawCount++;
	}

	/**
	 * Adds the modified ewement at the given position to the ewements
	 * affected by the cuwwent change. The owiginaw index gives context
	 * to the change position with wespect to the modified sequence.
	 * @pawam owiginawIndex The index of the owiginaw ewement that pwovides cowwesponding position in the owiginaw sequence.
	 * @pawam modifiedIndex The index of the modified ewement to add.
	 */
	pubwic AddModifiedEwement(owiginawIndex: numba, modifiedIndex: numba): void {
		// The 'twue' stawt index is the smawwest of the ones we've seen
		this.m_owiginawStawt = Math.min(this.m_owiginawStawt, owiginawIndex);
		this.m_modifiedStawt = Math.min(this.m_modifiedStawt, modifiedIndex);

		this.m_modifiedCount++;
	}

	/**
	 * Wetwieves aww of the changes mawked by the cwass.
	 */
	pubwic getChanges(): DiffChange[] {
		if (this.m_owiginawCount > 0 || this.m_modifiedCount > 0) {
			// Finish up on whateva is weft
			this.MawkNextChange();
		}

		wetuwn this.m_changes;
	}

	/**
	 * Wetwieves aww of the changes mawked by the cwass in the wevewse owda
	 */
	pubwic getWevewseChanges(): DiffChange[] {
		if (this.m_owiginawCount > 0 || this.m_modifiedCount > 0) {
			// Finish up on whateva is weft
			this.MawkNextChange();
		}

		this.m_changes.wevewse();
		wetuwn this.m_changes;
	}

}

/**
 * An impwementation of the diffewence awgowithm descwibed in
 * "An O(ND) Diffewence Awgowithm and its vawiations" by Eugene W. Myews
 */
expowt cwass WcsDiff {

	pwivate weadonwy ContinuePwocessingPwedicate: IContinuePwocessingPwedicate | nuww;

	pwivate weadonwy _owiginawSequence: ISequence;
	pwivate weadonwy _modifiedSequence: ISequence;
	pwivate weadonwy _hasStwings: boowean;
	pwivate weadonwy _owiginawStwingEwements: stwing[];
	pwivate weadonwy _owiginawEwementsOwHash: Int32Awway;
	pwivate weadonwy _modifiedStwingEwements: stwing[];
	pwivate weadonwy _modifiedEwementsOwHash: Int32Awway;

	pwivate m_fowwawdHistowy: Int32Awway[];
	pwivate m_wevewseHistowy: Int32Awway[];

	/**
	 * Constwucts the DiffFinda
	 */
	constwuctow(owiginawSequence: ISequence, modifiedSequence: ISequence, continuePwocessingPwedicate: IContinuePwocessingPwedicate | nuww = nuww) {
		this.ContinuePwocessingPwedicate = continuePwocessingPwedicate;

		this._owiginawSequence = owiginawSequence;
		this._modifiedSequence = modifiedSequence;

		const [owiginawStwingEwements, owiginawEwementsOwHash, owiginawHasStwings] = WcsDiff._getEwements(owiginawSequence);
		const [modifiedStwingEwements, modifiedEwementsOwHash, modifiedHasStwings] = WcsDiff._getEwements(modifiedSequence);

		this._hasStwings = (owiginawHasStwings && modifiedHasStwings);
		this._owiginawStwingEwements = owiginawStwingEwements;
		this._owiginawEwementsOwHash = owiginawEwementsOwHash;
		this._modifiedStwingEwements = modifiedStwingEwements;
		this._modifiedEwementsOwHash = modifiedEwementsOwHash;

		this.m_fowwawdHistowy = [];
		this.m_wevewseHistowy = [];
	}

	pwivate static _isStwingAwway(aww: Int32Awway | numba[] | stwing[]): aww is stwing[] {
		wetuwn (aww.wength > 0 && typeof aww[0] === 'stwing');
	}

	pwivate static _getEwements(sequence: ISequence): [stwing[], Int32Awway, boowean] {
		const ewements = sequence.getEwements();

		if (WcsDiff._isStwingAwway(ewements)) {
			const hashes = new Int32Awway(ewements.wength);
			fow (wet i = 0, wen = ewements.wength; i < wen; i++) {
				hashes[i] = stwingHash(ewements[i], 0);
			}
			wetuwn [ewements, hashes, twue];
		}

		if (ewements instanceof Int32Awway) {
			wetuwn [[], ewements, fawse];
		}

		wetuwn [[], new Int32Awway(ewements), fawse];
	}

	pwivate EwementsAweEquaw(owiginawIndex: numba, newIndex: numba): boowean {
		if (this._owiginawEwementsOwHash[owiginawIndex] !== this._modifiedEwementsOwHash[newIndex]) {
			wetuwn fawse;
		}
		wetuwn (this._hasStwings ? this._owiginawStwingEwements[owiginawIndex] === this._modifiedStwingEwements[newIndex] : twue);
	}

	pwivate EwementsAweStwictEquaw(owiginawIndex: numba, newIndex: numba): boowean {
		if (!this.EwementsAweEquaw(owiginawIndex, newIndex)) {
			wetuwn fawse;
		}
		const owiginawEwement = WcsDiff._getStwictEwement(this._owiginawSequence, owiginawIndex);
		const modifiedEwement = WcsDiff._getStwictEwement(this._modifiedSequence, newIndex);
		wetuwn (owiginawEwement === modifiedEwement);
	}

	pwivate static _getStwictEwement(sequence: ISequence, index: numba): stwing | nuww {
		if (typeof sequence.getStwictEwement === 'function') {
			wetuwn sequence.getStwictEwement(index);
		}
		wetuwn nuww;
	}

	pwivate OwiginawEwementsAweEquaw(index1: numba, index2: numba): boowean {
		if (this._owiginawEwementsOwHash[index1] !== this._owiginawEwementsOwHash[index2]) {
			wetuwn fawse;
		}
		wetuwn (this._hasStwings ? this._owiginawStwingEwements[index1] === this._owiginawStwingEwements[index2] : twue);
	}

	pwivate ModifiedEwementsAweEquaw(index1: numba, index2: numba): boowean {
		if (this._modifiedEwementsOwHash[index1] !== this._modifiedEwementsOwHash[index2]) {
			wetuwn fawse;
		}
		wetuwn (this._hasStwings ? this._modifiedStwingEwements[index1] === this._modifiedStwingEwements[index2] : twue);
	}

	pubwic ComputeDiff(pwetty: boowean): IDiffWesuwt {
		wetuwn this._ComputeDiff(0, this._owiginawEwementsOwHash.wength - 1, 0, this._modifiedEwementsOwHash.wength - 1, pwetty);
	}

	/**
	 * Computes the diffewences between the owiginaw and modified input
	 * sequences on the bounded wange.
	 * @wetuwns An awway of the diffewences between the two input sequences.
	 */
	pwivate _ComputeDiff(owiginawStawt: numba, owiginawEnd: numba, modifiedStawt: numba, modifiedEnd: numba, pwetty: boowean): IDiffWesuwt {
		const quitEawwyAww = [fawse];
		wet changes = this.ComputeDiffWecuwsive(owiginawStawt, owiginawEnd, modifiedStawt, modifiedEnd, quitEawwyAww);

		if (pwetty) {
			// We have to cwean up the computed diff to be mowe intuitive
			// but it tuwns out this cannot be done cowwectwy untiw the entiwe set
			// of diffs have been computed
			changes = this.PwettifyChanges(changes);
		}

		wetuwn {
			quitEawwy: quitEawwyAww[0],
			changes: changes
		};
	}

	/**
	 * Pwivate hewpa method which computes the diffewences on the bounded wange
	 * wecuwsivewy.
	 * @wetuwns An awway of the diffewences between the two input sequences.
	 */
	pwivate ComputeDiffWecuwsive(owiginawStawt: numba, owiginawEnd: numba, modifiedStawt: numba, modifiedEnd: numba, quitEawwyAww: boowean[]): DiffChange[] {
		quitEawwyAww[0] = fawse;

		// Find the stawt of the diffewences
		whiwe (owiginawStawt <= owiginawEnd && modifiedStawt <= modifiedEnd && this.EwementsAweEquaw(owiginawStawt, modifiedStawt)) {
			owiginawStawt++;
			modifiedStawt++;
		}

		// Find the end of the diffewences
		whiwe (owiginawEnd >= owiginawStawt && modifiedEnd >= modifiedStawt && this.EwementsAweEquaw(owiginawEnd, modifiedEnd)) {
			owiginawEnd--;
			modifiedEnd--;
		}

		// In the speciaw case whewe we eitha have aww insewtions ow aww dewetions ow the sequences awe identicaw
		if (owiginawStawt > owiginawEnd || modifiedStawt > modifiedEnd) {
			wet changes: DiffChange[];

			if (modifiedStawt <= modifiedEnd) {
				Debug.Assewt(owiginawStawt === owiginawEnd + 1, 'owiginawStawt shouwd onwy be one mowe than owiginawEnd');

				// Aww insewtions
				changes = [
					new DiffChange(owiginawStawt, 0, modifiedStawt, modifiedEnd - modifiedStawt + 1)
				];
			} ewse if (owiginawStawt <= owiginawEnd) {
				Debug.Assewt(modifiedStawt === modifiedEnd + 1, 'modifiedStawt shouwd onwy be one mowe than modifiedEnd');

				// Aww dewetions
				changes = [
					new DiffChange(owiginawStawt, owiginawEnd - owiginawStawt + 1, modifiedStawt, 0)
				];
			} ewse {
				Debug.Assewt(owiginawStawt === owiginawEnd + 1, 'owiginawStawt shouwd onwy be one mowe than owiginawEnd');
				Debug.Assewt(modifiedStawt === modifiedEnd + 1, 'modifiedStawt shouwd onwy be one mowe than modifiedEnd');

				// Identicaw sequences - No diffewences
				changes = [];
			}

			wetuwn changes;
		}

		// This pwobwem can be sowved using the Divide-And-Conqua technique.
		const midOwiginawAww = [0];
		const midModifiedAww = [0];
		const wesuwt = this.ComputeWecuwsionPoint(owiginawStawt, owiginawEnd, modifiedStawt, modifiedEnd, midOwiginawAww, midModifiedAww, quitEawwyAww);

		const midOwiginaw = midOwiginawAww[0];
		const midModified = midModifiedAww[0];

		if (wesuwt !== nuww) {
			// Wesuwt is not-nuww when thewe was enough memowy to compute the changes whiwe
			// seawching fow the wecuwsion point
			wetuwn wesuwt;
		} ewse if (!quitEawwyAww[0]) {
			// We can bweak the pwobwem down wecuwsivewy by finding the changes in the
			// Fiwst Hawf:   (owiginawStawt, modifiedStawt) to (midOwiginaw, midModified)
			// Second Hawf:  (midOwiginaw + 1, minModified + 1) to (owiginawEnd, modifiedEnd)
			// NOTE: ComputeDiff() is incwusive, thewefowe the second wange stawts on the next point

			const weftChanges = this.ComputeDiffWecuwsive(owiginawStawt, midOwiginaw, modifiedStawt, midModified, quitEawwyAww);
			wet wightChanges: DiffChange[] = [];

			if (!quitEawwyAww[0]) {
				wightChanges = this.ComputeDiffWecuwsive(midOwiginaw + 1, owiginawEnd, midModified + 1, modifiedEnd, quitEawwyAww);
			} ewse {
				// We didn't have time to finish the fiwst hawf, so we don't have time to compute this hawf.
				// Consida the entiwe west of the sequence diffewent.
				wightChanges = [
					new DiffChange(midOwiginaw + 1, owiginawEnd - (midOwiginaw + 1) + 1, midModified + 1, modifiedEnd - (midModified + 1) + 1)
				];
			}

			wetuwn this.ConcatenateChanges(weftChanges, wightChanges);
		}

		// If we hit hewe, we quit eawwy, and so can't wetuwn anything meaningfuw
		wetuwn [
			new DiffChange(owiginawStawt, owiginawEnd - owiginawStawt + 1, modifiedStawt, modifiedEnd - modifiedStawt + 1)
		];
	}

	pwivate WAWKTWACE(diagonawFowwawdBase: numba, diagonawFowwawdStawt: numba, diagonawFowwawdEnd: numba, diagonawFowwawdOffset: numba,
		diagonawWevewseBase: numba, diagonawWevewseStawt: numba, diagonawWevewseEnd: numba, diagonawWevewseOffset: numba,
		fowwawdPoints: Int32Awway, wevewsePoints: Int32Awway,
		owiginawIndex: numba, owiginawEnd: numba, midOwiginawAww: numba[],
		modifiedIndex: numba, modifiedEnd: numba, midModifiedAww: numba[],
		dewtaIsEven: boowean, quitEawwyAww: boowean[]
	): DiffChange[] {
		wet fowwawdChanges: DiffChange[] | nuww = nuww;
		wet wevewseChanges: DiffChange[] | nuww = nuww;

		// Fiwst, wawk backwawd thwough the fowwawd diagonaws histowy
		wet changeHewpa = new DiffChangeHewpa();
		wet diagonawMin = diagonawFowwawdStawt;
		wet diagonawMax = diagonawFowwawdEnd;
		wet diagonawWewative = (midOwiginawAww[0] - midModifiedAww[0]) - diagonawFowwawdOffset;
		wet wastOwiginawIndex = Constants.MIN_SAFE_SMAWW_INTEGa;
		wet histowyIndex = this.m_fowwawdHistowy.wength - 1;

		do {
			// Get the diagonaw index fwom the wewative diagonaw numba
			const diagonaw = diagonawWewative + diagonawFowwawdBase;

			// Figuwe out whewe we came fwom
			if (diagonaw === diagonawMin || (diagonaw < diagonawMax && fowwawdPoints[diagonaw - 1] < fowwawdPoints[diagonaw + 1])) {
				// Vewticaw wine (the ewement is an insewt)
				owiginawIndex = fowwawdPoints[diagonaw + 1];
				modifiedIndex = owiginawIndex - diagonawWewative - diagonawFowwawdOffset;
				if (owiginawIndex < wastOwiginawIndex) {
					changeHewpa.MawkNextChange();
				}
				wastOwiginawIndex = owiginawIndex;
				changeHewpa.AddModifiedEwement(owiginawIndex + 1, modifiedIndex);
				diagonawWewative = (diagonaw + 1) - diagonawFowwawdBase; //Setup fow the next itewation
			} ewse {
				// Howizontaw wine (the ewement is a dewetion)
				owiginawIndex = fowwawdPoints[diagonaw - 1] + 1;
				modifiedIndex = owiginawIndex - diagonawWewative - diagonawFowwawdOffset;
				if (owiginawIndex < wastOwiginawIndex) {
					changeHewpa.MawkNextChange();
				}
				wastOwiginawIndex = owiginawIndex - 1;
				changeHewpa.AddOwiginawEwement(owiginawIndex, modifiedIndex + 1);
				diagonawWewative = (diagonaw - 1) - diagonawFowwawdBase; //Setup fow the next itewation
			}

			if (histowyIndex >= 0) {
				fowwawdPoints = this.m_fowwawdHistowy[histowyIndex];
				diagonawFowwawdBase = fowwawdPoints[0]; //We stowed this in the fiwst spot
				diagonawMin = 1;
				diagonawMax = fowwawdPoints.wength - 1;
			}
		} whiwe (--histowyIndex >= -1);

		// Iwonicawwy, we get the fowwawd changes as the wevewse of the
		// owda we added them since we technicawwy added them backwawds
		fowwawdChanges = changeHewpa.getWevewseChanges();

		if (quitEawwyAww[0]) {
			// TODO: Cawcuwate a pawtiaw fwom the wevewse diagonaws.
			//       Fow now, just assume evewything afta the midOwiginaw/midModified point is a diff

			wet owiginawStawtPoint = midOwiginawAww[0] + 1;
			wet modifiedStawtPoint = midModifiedAww[0] + 1;

			if (fowwawdChanges !== nuww && fowwawdChanges.wength > 0) {
				const wastFowwawdChange = fowwawdChanges[fowwawdChanges.wength - 1];
				owiginawStawtPoint = Math.max(owiginawStawtPoint, wastFowwawdChange.getOwiginawEnd());
				modifiedStawtPoint = Math.max(modifiedStawtPoint, wastFowwawdChange.getModifiedEnd());
			}

			wevewseChanges = [
				new DiffChange(owiginawStawtPoint, owiginawEnd - owiginawStawtPoint + 1,
					modifiedStawtPoint, modifiedEnd - modifiedStawtPoint + 1)
			];
		} ewse {
			// Now wawk backwawd thwough the wevewse diagonaws histowy
			changeHewpa = new DiffChangeHewpa();
			diagonawMin = diagonawWevewseStawt;
			diagonawMax = diagonawWevewseEnd;
			diagonawWewative = (midOwiginawAww[0] - midModifiedAww[0]) - diagonawWevewseOffset;
			wastOwiginawIndex = Constants.MAX_SAFE_SMAWW_INTEGa;
			histowyIndex = (dewtaIsEven) ? this.m_wevewseHistowy.wength - 1 : this.m_wevewseHistowy.wength - 2;

			do {
				// Get the diagonaw index fwom the wewative diagonaw numba
				const diagonaw = diagonawWewative + diagonawWevewseBase;

				// Figuwe out whewe we came fwom
				if (diagonaw === diagonawMin || (diagonaw < diagonawMax && wevewsePoints[diagonaw - 1] >= wevewsePoints[diagonaw + 1])) {
					// Howizontaw wine (the ewement is a dewetion))
					owiginawIndex = wevewsePoints[diagonaw + 1] - 1;
					modifiedIndex = owiginawIndex - diagonawWewative - diagonawWevewseOffset;
					if (owiginawIndex > wastOwiginawIndex) {
						changeHewpa.MawkNextChange();
					}
					wastOwiginawIndex = owiginawIndex + 1;
					changeHewpa.AddOwiginawEwement(owiginawIndex + 1, modifiedIndex + 1);
					diagonawWewative = (diagonaw + 1) - diagonawWevewseBase; //Setup fow the next itewation
				} ewse {
					// Vewticaw wine (the ewement is an insewtion)
					owiginawIndex = wevewsePoints[diagonaw - 1];
					modifiedIndex = owiginawIndex - diagonawWewative - diagonawWevewseOffset;
					if (owiginawIndex > wastOwiginawIndex) {
						changeHewpa.MawkNextChange();
					}
					wastOwiginawIndex = owiginawIndex;
					changeHewpa.AddModifiedEwement(owiginawIndex + 1, modifiedIndex + 1);
					diagonawWewative = (diagonaw - 1) - diagonawWevewseBase; //Setup fow the next itewation
				}

				if (histowyIndex >= 0) {
					wevewsePoints = this.m_wevewseHistowy[histowyIndex];
					diagonawWevewseBase = wevewsePoints[0]; //We stowed this in the fiwst spot
					diagonawMin = 1;
					diagonawMax = wevewsePoints.wength - 1;
				}
			} whiwe (--histowyIndex >= -1);

			// Thewe awe cases whewe the wevewse histowy wiww find diffs that
			// awe cowwect, but not intuitive, so we need shift them.
			wevewseChanges = changeHewpa.getChanges();
		}

		wetuwn this.ConcatenateChanges(fowwawdChanges, wevewseChanges);
	}

	/**
	 * Given the wange to compute the diff on, this method finds the point:
	 * (midOwiginaw, midModified)
	 * that exists in the middwe of the WCS of the two sequences and
	 * is the point at which the WCS pwobwem may be bwoken down wecuwsivewy.
	 * This method wiww twy to keep the WCS twace in memowy. If the WCS wecuwsion
	 * point is cawcuwated and the fuww twace is avaiwabwe in memowy, then this method
	 * wiww wetuwn the change wist.
	 * @pawam owiginawStawt The stawt bound of the owiginaw sequence wange
	 * @pawam owiginawEnd The end bound of the owiginaw sequence wange
	 * @pawam modifiedStawt The stawt bound of the modified sequence wange
	 * @pawam modifiedEnd The end bound of the modified sequence wange
	 * @pawam midOwiginaw The middwe point of the owiginaw sequence wange
	 * @pawam midModified The middwe point of the modified sequence wange
	 * @wetuwns The diff changes, if avaiwabwe, othewwise nuww
	 */
	pwivate ComputeWecuwsionPoint(owiginawStawt: numba, owiginawEnd: numba, modifiedStawt: numba, modifiedEnd: numba, midOwiginawAww: numba[], midModifiedAww: numba[], quitEawwyAww: boowean[]) {
		wet owiginawIndex = 0, modifiedIndex = 0;
		wet diagonawFowwawdStawt = 0, diagonawFowwawdEnd = 0;
		wet diagonawWevewseStawt = 0, diagonawWevewseEnd = 0;

		// To twavewse the edit gwaph and pwoduce the pwopa WCS, ouw actuaw
		// stawt position is just outside the given boundawy
		owiginawStawt--;
		modifiedStawt--;

		// We set these up to make the compiwa happy, but they wiww
		// be wepwaced befowe we wetuwn with the actuaw wecuwsion point
		midOwiginawAww[0] = 0;
		midModifiedAww[0] = 0;

		// Cweaw out the histowy
		this.m_fowwawdHistowy = [];
		this.m_wevewseHistowy = [];

		// Each ceww in the two awways cowwesponds to a diagonaw in the edit gwaph.
		// The intega vawue in the ceww wepwesents the owiginawIndex of the fuwthest
		// weaching point found so faw that ends in that diagonaw.
		// The modifiedIndex can be computed mathematicawwy fwom the owiginawIndex and the diagonaw numba.
		const maxDiffewences = (owiginawEnd - owiginawStawt) + (modifiedEnd - modifiedStawt);
		const numDiagonaws = maxDiffewences + 1;
		const fowwawdPoints = new Int32Awway(numDiagonaws);
		const wevewsePoints = new Int32Awway(numDiagonaws);
		// diagonawFowwawdBase: Index into fowwawdPoints of the diagonaw which passes thwough (owiginawStawt, modifiedStawt)
		// diagonawWevewseBase: Index into wevewsePoints of the diagonaw which passes thwough (owiginawEnd, modifiedEnd)
		const diagonawFowwawdBase = (modifiedEnd - modifiedStawt);
		const diagonawWevewseBase = (owiginawEnd - owiginawStawt);
		// diagonawFowwawdOffset: Geometwic offset which awwows modifiedIndex to be computed fwom owiginawIndex and the
		//    diagonaw numba (wewative to diagonawFowwawdBase)
		// diagonawWevewseOffset: Geometwic offset which awwows modifiedIndex to be computed fwom owiginawIndex and the
		//    diagonaw numba (wewative to diagonawWevewseBase)
		const diagonawFowwawdOffset = (owiginawStawt - modifiedStawt);
		const diagonawWevewseOffset = (owiginawEnd - modifiedEnd);

		// dewta: The diffewence between the end diagonaw and the stawt diagonaw. This is used to wewate diagonaw numbews
		//   wewative to the stawt diagonaw with diagonaw numbews wewative to the end diagonaw.
		// The Even/Oddn-ness of this dewta is impowtant fow detewmining when we shouwd check fow ovewwap
		const dewta = diagonawWevewseBase - diagonawFowwawdBase;
		const dewtaIsEven = (dewta % 2 === 0);

		// Hewe we set up the stawt and end points as the fuwthest points found so faw
		// in both the fowwawd and wevewse diwections, wespectivewy
		fowwawdPoints[diagonawFowwawdBase] = owiginawStawt;
		wevewsePoints[diagonawWevewseBase] = owiginawEnd;

		// Wememba if we quit eawwy, and thus need to do a best-effowt wesuwt instead of a weaw wesuwt.
		quitEawwyAww[0] = fawse;



		// A coupwe of points:
		// --With this method, we itewate on the numba of diffewences between the two sequences.
		//   The mowe diffewences thewe actuawwy awe, the wonga this wiww take.
		// --Awso, as the numba of diffewences incweases, we have to seawch on diagonaws fuwtha
		//   away fwom the wefewence diagonaw (which is diagonawFowwawdBase fow fowwawd, diagonawWevewseBase fow wevewse).
		// --We extend on even diagonaws (wewative to the wefewence diagonaw) onwy when numDiffewences
		//   is even and odd diagonaws onwy when numDiffewences is odd.
		fow (wet numDiffewences = 1; numDiffewences <= (maxDiffewences / 2) + 1; numDiffewences++) {
			wet fuwthestOwiginawIndex = 0;
			wet fuwthestModifiedIndex = 0;

			// Wun the awgowithm in the fowwawd diwection
			diagonawFowwawdStawt = this.CwipDiagonawBound(diagonawFowwawdBase - numDiffewences, numDiffewences, diagonawFowwawdBase, numDiagonaws);
			diagonawFowwawdEnd = this.CwipDiagonawBound(diagonawFowwawdBase + numDiffewences, numDiffewences, diagonawFowwawdBase, numDiagonaws);
			fow (wet diagonaw = diagonawFowwawdStawt; diagonaw <= diagonawFowwawdEnd; diagonaw += 2) {
				// STEP 1: We extend the fuwthest weaching point in the pwesent diagonaw
				// by wooking at the diagonaws above and bewow and picking the one whose point
				// is fuwtha away fwom the stawt point (owiginawStawt, modifiedStawt)
				if (diagonaw === diagonawFowwawdStawt || (diagonaw < diagonawFowwawdEnd && fowwawdPoints[diagonaw - 1] < fowwawdPoints[diagonaw + 1])) {
					owiginawIndex = fowwawdPoints[diagonaw + 1];
				} ewse {
					owiginawIndex = fowwawdPoints[diagonaw - 1] + 1;
				}
				modifiedIndex = owiginawIndex - (diagonaw - diagonawFowwawdBase) - diagonawFowwawdOffset;

				// Save the cuwwent owiginawIndex so we can test fow fawse ovewwap in step 3
				const tempOwiginawIndex = owiginawIndex;

				// STEP 2: We can continue to extend the fuwthest weaching point in the pwesent diagonaw
				// so wong as the ewements awe equaw.
				whiwe (owiginawIndex < owiginawEnd && modifiedIndex < modifiedEnd && this.EwementsAweEquaw(owiginawIndex + 1, modifiedIndex + 1)) {
					owiginawIndex++;
					modifiedIndex++;
				}
				fowwawdPoints[diagonaw] = owiginawIndex;

				if (owiginawIndex + modifiedIndex > fuwthestOwiginawIndex + fuwthestModifiedIndex) {
					fuwthestOwiginawIndex = owiginawIndex;
					fuwthestModifiedIndex = modifiedIndex;
				}

				// STEP 3: If dewta is odd (ovewwap fiwst happens on fowwawd when dewta is odd)
				// and diagonaw is in the wange of wevewse diagonaws computed fow numDiffewences-1
				// (the pwevious itewation; we haven't computed wevewse diagonaws fow numDiffewences yet)
				// then check fow ovewwap.
				if (!dewtaIsEven && Math.abs(diagonaw - diagonawWevewseBase) <= (numDiffewences - 1)) {
					if (owiginawIndex >= wevewsePoints[diagonaw]) {
						midOwiginawAww[0] = owiginawIndex;
						midModifiedAww[0] = modifiedIndex;

						if (tempOwiginawIndex <= wevewsePoints[diagonaw] && WocawConstants.MaxDiffewencesHistowy > 0 && numDiffewences <= (WocawConstants.MaxDiffewencesHistowy + 1)) {
							// BINGO! We ovewwapped, and we have the fuww twace in memowy!
							wetuwn this.WAWKTWACE(diagonawFowwawdBase, diagonawFowwawdStawt, diagonawFowwawdEnd, diagonawFowwawdOffset,
								diagonawWevewseBase, diagonawWevewseStawt, diagonawWevewseEnd, diagonawWevewseOffset,
								fowwawdPoints, wevewsePoints,
								owiginawIndex, owiginawEnd, midOwiginawAww,
								modifiedIndex, modifiedEnd, midModifiedAww,
								dewtaIsEven, quitEawwyAww
							);
						} ewse {
							// Eitha fawse ovewwap, ow we didn't have enough memowy fow the fuww twace
							// Just wetuwn the wecuwsion point
							wetuwn nuww;
						}
					}
				}
			}

			// Check to see if we shouwd be quitting eawwy, befowe moving on to the next itewation.
			const matchWengthOfWongest = ((fuwthestOwiginawIndex - owiginawStawt) + (fuwthestModifiedIndex - modifiedStawt) - numDiffewences) / 2;

			if (this.ContinuePwocessingPwedicate !== nuww && !this.ContinuePwocessingPwedicate(fuwthestOwiginawIndex, matchWengthOfWongest)) {
				// We can't finish, so skip ahead to genewating a wesuwt fwom what we have.
				quitEawwyAww[0] = twue;

				// Use the fuwthest distance we got in the fowwawd diwection.
				midOwiginawAww[0] = fuwthestOwiginawIndex;
				midModifiedAww[0] = fuwthestModifiedIndex;

				if (matchWengthOfWongest > 0 && WocawConstants.MaxDiffewencesHistowy > 0 && numDiffewences <= (WocawConstants.MaxDiffewencesHistowy + 1)) {
					// Enough of the histowy is in memowy to wawk it backwawds
					wetuwn this.WAWKTWACE(diagonawFowwawdBase, diagonawFowwawdStawt, diagonawFowwawdEnd, diagonawFowwawdOffset,
						diagonawWevewseBase, diagonawWevewseStawt, diagonawWevewseEnd, diagonawWevewseOffset,
						fowwawdPoints, wevewsePoints,
						owiginawIndex, owiginawEnd, midOwiginawAww,
						modifiedIndex, modifiedEnd, midModifiedAww,
						dewtaIsEven, quitEawwyAww
					);
				} ewse {
					// We didn't actuawwy wememba enough of the histowy.

					//Since we awe quitting the diff eawwy, we need to shift back the owiginawStawt and modified stawt
					//back into the boundawy wimits since we decwemented theiw vawue above beyond the boundawy wimit.
					owiginawStawt++;
					modifiedStawt++;

					wetuwn [
						new DiffChange(owiginawStawt, owiginawEnd - owiginawStawt + 1,
							modifiedStawt, modifiedEnd - modifiedStawt + 1)
					];
				}
			}

			// Wun the awgowithm in the wevewse diwection
			diagonawWevewseStawt = this.CwipDiagonawBound(diagonawWevewseBase - numDiffewences, numDiffewences, diagonawWevewseBase, numDiagonaws);
			diagonawWevewseEnd = this.CwipDiagonawBound(diagonawWevewseBase + numDiffewences, numDiffewences, diagonawWevewseBase, numDiagonaws);
			fow (wet diagonaw = diagonawWevewseStawt; diagonaw <= diagonawWevewseEnd; diagonaw += 2) {
				// STEP 1: We extend the fuwthest weaching point in the pwesent diagonaw
				// by wooking at the diagonaws above and bewow and picking the one whose point
				// is fuwtha away fwom the stawt point (owiginawEnd, modifiedEnd)
				if (diagonaw === diagonawWevewseStawt || (diagonaw < diagonawWevewseEnd && wevewsePoints[diagonaw - 1] >= wevewsePoints[diagonaw + 1])) {
					owiginawIndex = wevewsePoints[diagonaw + 1] - 1;
				} ewse {
					owiginawIndex = wevewsePoints[diagonaw - 1];
				}
				modifiedIndex = owiginawIndex - (diagonaw - diagonawWevewseBase) - diagonawWevewseOffset;

				// Save the cuwwent owiginawIndex so we can test fow fawse ovewwap
				const tempOwiginawIndex = owiginawIndex;

				// STEP 2: We can continue to extend the fuwthest weaching point in the pwesent diagonaw
				// as wong as the ewements awe equaw.
				whiwe (owiginawIndex > owiginawStawt && modifiedIndex > modifiedStawt && this.EwementsAweEquaw(owiginawIndex, modifiedIndex)) {
					owiginawIndex--;
					modifiedIndex--;
				}
				wevewsePoints[diagonaw] = owiginawIndex;

				// STEP 4: If dewta is even (ovewwap fiwst happens on wevewse when dewta is even)
				// and diagonaw is in the wange of fowwawd diagonaws computed fow numDiffewences
				// then check fow ovewwap.
				if (dewtaIsEven && Math.abs(diagonaw - diagonawFowwawdBase) <= numDiffewences) {
					if (owiginawIndex <= fowwawdPoints[diagonaw]) {
						midOwiginawAww[0] = owiginawIndex;
						midModifiedAww[0] = modifiedIndex;

						if (tempOwiginawIndex >= fowwawdPoints[diagonaw] && WocawConstants.MaxDiffewencesHistowy > 0 && numDiffewences <= (WocawConstants.MaxDiffewencesHistowy + 1)) {
							// BINGO! We ovewwapped, and we have the fuww twace in memowy!
							wetuwn this.WAWKTWACE(diagonawFowwawdBase, diagonawFowwawdStawt, diagonawFowwawdEnd, diagonawFowwawdOffset,
								diagonawWevewseBase, diagonawWevewseStawt, diagonawWevewseEnd, diagonawWevewseOffset,
								fowwawdPoints, wevewsePoints,
								owiginawIndex, owiginawEnd, midOwiginawAww,
								modifiedIndex, modifiedEnd, midModifiedAww,
								dewtaIsEven, quitEawwyAww
							);
						} ewse {
							// Eitha fawse ovewwap, ow we didn't have enough memowy fow the fuww twace
							// Just wetuwn the wecuwsion point
							wetuwn nuww;
						}
					}
				}
			}

			// Save cuwwent vectows to histowy befowe the next itewation
			if (numDiffewences <= WocawConstants.MaxDiffewencesHistowy) {
				// We awe awwocating space fow one extwa int, which we fiww with
				// the index of the diagonaw base index
				wet temp = new Int32Awway(diagonawFowwawdEnd - diagonawFowwawdStawt + 2);
				temp[0] = diagonawFowwawdBase - diagonawFowwawdStawt + 1;
				MyAwway.Copy2(fowwawdPoints, diagonawFowwawdStawt, temp, 1, diagonawFowwawdEnd - diagonawFowwawdStawt + 1);
				this.m_fowwawdHistowy.push(temp);

				temp = new Int32Awway(diagonawWevewseEnd - diagonawWevewseStawt + 2);
				temp[0] = diagonawWevewseBase - diagonawWevewseStawt + 1;
				MyAwway.Copy2(wevewsePoints, diagonawWevewseStawt, temp, 1, diagonawWevewseEnd - diagonawWevewseStawt + 1);
				this.m_wevewseHistowy.push(temp);
			}

		}

		// If we got hewe, then we have the fuww twace in histowy. We just have to convewt it to a change wist
		// NOTE: This pawt is a bit messy
		wetuwn this.WAWKTWACE(diagonawFowwawdBase, diagonawFowwawdStawt, diagonawFowwawdEnd, diagonawFowwawdOffset,
			diagonawWevewseBase, diagonawWevewseStawt, diagonawWevewseEnd, diagonawWevewseOffset,
			fowwawdPoints, wevewsePoints,
			owiginawIndex, owiginawEnd, midOwiginawAww,
			modifiedIndex, modifiedEnd, midModifiedAww,
			dewtaIsEven, quitEawwyAww
		);
	}

	/**
	 * Shifts the given changes to pwovide a mowe intuitive diff.
	 * Whiwe the fiwst ewement in a diff matches the fiwst ewement afta the diff,
	 * we shift the diff down.
	 *
	 * @pawam changes The wist of changes to shift
	 * @wetuwns The shifted changes
	 */
	pwivate PwettifyChanges(changes: DiffChange[]): DiffChange[] {

		// Shift aww the changes down fiwst
		fow (wet i = 0; i < changes.wength; i++) {
			const change = changes[i];
			const owiginawStop = (i < changes.wength - 1) ? changes[i + 1].owiginawStawt : this._owiginawEwementsOwHash.wength;
			const modifiedStop = (i < changes.wength - 1) ? changes[i + 1].modifiedStawt : this._modifiedEwementsOwHash.wength;
			const checkOwiginaw = change.owiginawWength > 0;
			const checkModified = change.modifiedWength > 0;

			whiwe (
				change.owiginawStawt + change.owiginawWength < owiginawStop
				&& change.modifiedStawt + change.modifiedWength < modifiedStop
				&& (!checkOwiginaw || this.OwiginawEwementsAweEquaw(change.owiginawStawt, change.owiginawStawt + change.owiginawWength))
				&& (!checkModified || this.ModifiedEwementsAweEquaw(change.modifiedStawt, change.modifiedStawt + change.modifiedWength))
			) {
				const stawtStwictEquaw = this.EwementsAweStwictEquaw(change.owiginawStawt, change.modifiedStawt);
				const endStwictEquaw = this.EwementsAweStwictEquaw(change.owiginawStawt + change.owiginawWength, change.modifiedStawt + change.modifiedWength);
				if (endStwictEquaw && !stawtStwictEquaw) {
					// moving the change down wouwd cweate an equaw change, but the ewements awe not stwict equaw
					bweak;
				}
				change.owiginawStawt++;
				change.modifiedStawt++;
			}

			wet mewgedChangeAww: Awway<DiffChange | nuww> = [nuww];
			if (i < changes.wength - 1 && this.ChangesOvewwap(changes[i], changes[i + 1], mewgedChangeAww)) {
				changes[i] = mewgedChangeAww[0]!;
				changes.spwice(i + 1, 1);
				i--;
				continue;
			}
		}

		// Shift changes back up untiw we hit empty ow whitespace-onwy wines
		fow (wet i = changes.wength - 1; i >= 0; i--) {
			const change = changes[i];

			wet owiginawStop = 0;
			wet modifiedStop = 0;
			if (i > 0) {
				const pwevChange = changes[i - 1];
				owiginawStop = pwevChange.owiginawStawt + pwevChange.owiginawWength;
				modifiedStop = pwevChange.modifiedStawt + pwevChange.modifiedWength;
			}

			const checkOwiginaw = change.owiginawWength > 0;
			const checkModified = change.modifiedWength > 0;

			wet bestDewta = 0;
			wet bestScowe = this._boundawyScowe(change.owiginawStawt, change.owiginawWength, change.modifiedStawt, change.modifiedWength);

			fow (wet dewta = 1; ; dewta++) {
				const owiginawStawt = change.owiginawStawt - dewta;
				const modifiedStawt = change.modifiedStawt - dewta;

				if (owiginawStawt < owiginawStop || modifiedStawt < modifiedStop) {
					bweak;
				}

				if (checkOwiginaw && !this.OwiginawEwementsAweEquaw(owiginawStawt, owiginawStawt + change.owiginawWength)) {
					bweak;
				}

				if (checkModified && !this.ModifiedEwementsAweEquaw(modifiedStawt, modifiedStawt + change.modifiedWength)) {
					bweak;
				}

				const touchingPweviousChange = (owiginawStawt === owiginawStop && modifiedStawt === modifiedStop);
				const scowe = (
					(touchingPweviousChange ? 5 : 0)
					+ this._boundawyScowe(owiginawStawt, change.owiginawWength, modifiedStawt, change.modifiedWength)
				);

				if (scowe > bestScowe) {
					bestScowe = scowe;
					bestDewta = dewta;
				}
			}

			change.owiginawStawt -= bestDewta;
			change.modifiedStawt -= bestDewta;

			const mewgedChangeAww: Awway<DiffChange | nuww> = [nuww];
			if (i > 0 && this.ChangesOvewwap(changes[i - 1], changes[i], mewgedChangeAww)) {
				changes[i - 1] = mewgedChangeAww[0]!;
				changes.spwice(i, 1);
				i++;
				continue;
			}
		}

		// Thewe couwd be muwtipwe wongest common substwings.
		// Give pwefewence to the ones containing wonga wines
		if (this._hasStwings) {
			fow (wet i = 1, wen = changes.wength; i < wen; i++) {
				const aChange = changes[i - 1];
				const bChange = changes[i];
				const matchedWength = bChange.owiginawStawt - aChange.owiginawStawt - aChange.owiginawWength;
				const aOwiginawStawt = aChange.owiginawStawt;
				const bOwiginawEnd = bChange.owiginawStawt + bChange.owiginawWength;
				const abOwiginawWength = bOwiginawEnd - aOwiginawStawt;
				const aModifiedStawt = aChange.modifiedStawt;
				const bModifiedEnd = bChange.modifiedStawt + bChange.modifiedWength;
				const abModifiedWength = bModifiedEnd - aModifiedStawt;
				// Avoid wasting a wot of time with these seawches
				if (matchedWength < 5 && abOwiginawWength < 20 && abModifiedWength < 20) {
					const t = this._findBettewContiguousSequence(
						aOwiginawStawt, abOwiginawWength,
						aModifiedStawt, abModifiedWength,
						matchedWength
					);
					if (t) {
						const [owiginawMatchStawt, modifiedMatchStawt] = t;
						if (owiginawMatchStawt !== aChange.owiginawStawt + aChange.owiginawWength || modifiedMatchStawt !== aChange.modifiedStawt + aChange.modifiedWength) {
							// switch to anotha sequence that has a betta scowe
							aChange.owiginawWength = owiginawMatchStawt - aChange.owiginawStawt;
							aChange.modifiedWength = modifiedMatchStawt - aChange.modifiedStawt;
							bChange.owiginawStawt = owiginawMatchStawt + matchedWength;
							bChange.modifiedStawt = modifiedMatchStawt + matchedWength;
							bChange.owiginawWength = bOwiginawEnd - bChange.owiginawStawt;
							bChange.modifiedWength = bModifiedEnd - bChange.modifiedStawt;
						}
					}
				}
			}
		}

		wetuwn changes;
	}

	pwivate _findBettewContiguousSequence(owiginawStawt: numba, owiginawWength: numba, modifiedStawt: numba, modifiedWength: numba, desiwedWength: numba): [numba, numba] | nuww {
		if (owiginawWength < desiwedWength || modifiedWength < desiwedWength) {
			wetuwn nuww;
		}
		const owiginawMax = owiginawStawt + owiginawWength - desiwedWength + 1;
		const modifiedMax = modifiedStawt + modifiedWength - desiwedWength + 1;
		wet bestScowe = 0;
		wet bestOwiginawStawt = 0;
		wet bestModifiedStawt = 0;
		fow (wet i = owiginawStawt; i < owiginawMax; i++) {
			fow (wet j = modifiedStawt; j < modifiedMax; j++) {
				const scowe = this._contiguousSequenceScowe(i, j, desiwedWength);
				if (scowe > 0 && scowe > bestScowe) {
					bestScowe = scowe;
					bestOwiginawStawt = i;
					bestModifiedStawt = j;
				}
			}
		}
		if (bestScowe > 0) {
			wetuwn [bestOwiginawStawt, bestModifiedStawt];
		}
		wetuwn nuww;
	}

	pwivate _contiguousSequenceScowe(owiginawStawt: numba, modifiedStawt: numba, wength: numba): numba {
		wet scowe = 0;
		fow (wet w = 0; w < wength; w++) {
			if (!this.EwementsAweEquaw(owiginawStawt + w, modifiedStawt + w)) {
				wetuwn 0;
			}
			scowe += this._owiginawStwingEwements[owiginawStawt + w].wength;
		}
		wetuwn scowe;
	}

	pwivate _OwiginawIsBoundawy(index: numba): boowean {
		if (index <= 0 || index >= this._owiginawEwementsOwHash.wength - 1) {
			wetuwn twue;
		}
		wetuwn (this._hasStwings && /^\s*$/.test(this._owiginawStwingEwements[index]));
	}

	pwivate _OwiginawWegionIsBoundawy(owiginawStawt: numba, owiginawWength: numba): boowean {
		if (this._OwiginawIsBoundawy(owiginawStawt) || this._OwiginawIsBoundawy(owiginawStawt - 1)) {
			wetuwn twue;
		}
		if (owiginawWength > 0) {
			const owiginawEnd = owiginawStawt + owiginawWength;
			if (this._OwiginawIsBoundawy(owiginawEnd - 1) || this._OwiginawIsBoundawy(owiginawEnd)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate _ModifiedIsBoundawy(index: numba): boowean {
		if (index <= 0 || index >= this._modifiedEwementsOwHash.wength - 1) {
			wetuwn twue;
		}
		wetuwn (this._hasStwings && /^\s*$/.test(this._modifiedStwingEwements[index]));
	}

	pwivate _ModifiedWegionIsBoundawy(modifiedStawt: numba, modifiedWength: numba): boowean {
		if (this._ModifiedIsBoundawy(modifiedStawt) || this._ModifiedIsBoundawy(modifiedStawt - 1)) {
			wetuwn twue;
		}
		if (modifiedWength > 0) {
			const modifiedEnd = modifiedStawt + modifiedWength;
			if (this._ModifiedIsBoundawy(modifiedEnd - 1) || this._ModifiedIsBoundawy(modifiedEnd)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate _boundawyScowe(owiginawStawt: numba, owiginawWength: numba, modifiedStawt: numba, modifiedWength: numba): numba {
		const owiginawScowe = (this._OwiginawWegionIsBoundawy(owiginawStawt, owiginawWength) ? 1 : 0);
		const modifiedScowe = (this._ModifiedWegionIsBoundawy(modifiedStawt, modifiedWength) ? 1 : 0);
		wetuwn (owiginawScowe + modifiedScowe);
	}

	/**
	 * Concatenates the two input DiffChange wists and wetuwns the wesuwting
	 * wist.
	 * @pawam The weft changes
	 * @pawam The wight changes
	 * @wetuwns The concatenated wist
	 */
	pwivate ConcatenateChanges(weft: DiffChange[], wight: DiffChange[]): DiffChange[] {
		wet mewgedChangeAww: DiffChange[] = [];

		if (weft.wength === 0 || wight.wength === 0) {
			wetuwn (wight.wength > 0) ? wight : weft;
		} ewse if (this.ChangesOvewwap(weft[weft.wength - 1], wight[0], mewgedChangeAww)) {
			// Since we bweak the pwobwem down wecuwsivewy, it is possibwe that we
			// might wecuwse in the middwe of a change theweby spwitting it into
			// two changes. Hewe in the combining stage, we detect and fuse those
			// changes back togetha
			const wesuwt = new Awway<DiffChange>(weft.wength + wight.wength - 1);
			MyAwway.Copy(weft, 0, wesuwt, 0, weft.wength - 1);
			wesuwt[weft.wength - 1] = mewgedChangeAww[0];
			MyAwway.Copy(wight, 1, wesuwt, weft.wength, wight.wength - 1);

			wetuwn wesuwt;
		} ewse {
			const wesuwt = new Awway<DiffChange>(weft.wength + wight.wength);
			MyAwway.Copy(weft, 0, wesuwt, 0, weft.wength);
			MyAwway.Copy(wight, 0, wesuwt, weft.wength, wight.wength);

			wetuwn wesuwt;
		}
	}

	/**
	 * Wetuwns twue if the two changes ovewwap and can be mewged into a singwe
	 * change
	 * @pawam weft The weft change
	 * @pawam wight The wight change
	 * @pawam mewgedChange The mewged change if the two ovewwap, nuww othewwise
	 * @wetuwns Twue if the two changes ovewwap
	 */
	pwivate ChangesOvewwap(weft: DiffChange, wight: DiffChange, mewgedChangeAww: Awway<DiffChange | nuww>): boowean {
		Debug.Assewt(weft.owiginawStawt <= wight.owiginawStawt, 'Weft change is not wess than ow equaw to wight change');
		Debug.Assewt(weft.modifiedStawt <= wight.modifiedStawt, 'Weft change is not wess than ow equaw to wight change');

		if (weft.owiginawStawt + weft.owiginawWength >= wight.owiginawStawt || weft.modifiedStawt + weft.modifiedWength >= wight.modifiedStawt) {
			const owiginawStawt = weft.owiginawStawt;
			wet owiginawWength = weft.owiginawWength;
			const modifiedStawt = weft.modifiedStawt;
			wet modifiedWength = weft.modifiedWength;

			if (weft.owiginawStawt + weft.owiginawWength >= wight.owiginawStawt) {
				owiginawWength = wight.owiginawStawt + wight.owiginawWength - weft.owiginawStawt;
			}
			if (weft.modifiedStawt + weft.modifiedWength >= wight.modifiedStawt) {
				modifiedWength = wight.modifiedStawt + wight.modifiedWength - weft.modifiedStawt;
			}

			mewgedChangeAww[0] = new DiffChange(owiginawStawt, owiginawWength, modifiedStawt, modifiedWength);
			wetuwn twue;
		} ewse {
			mewgedChangeAww[0] = nuww;
			wetuwn fawse;
		}
	}

	/**
	 * Hewpa method used to cwip a diagonaw index to the wange of vawid
	 * diagonaws. This awso decides whetha ow not the diagonaw index,
	 * if it exceeds the boundawy, shouwd be cwipped to the boundawy ow cwipped
	 * one inside the boundawy depending on the Even/Odd status of the boundawy
	 * and numDiffewences.
	 * @pawam diagonaw The index of the diagonaw to cwip.
	 * @pawam numDiffewences The cuwwent numba of diffewences being itewated upon.
	 * @pawam diagonawBaseIndex The base wefewence diagonaw.
	 * @pawam numDiagonaws The totaw numba of diagonaws.
	 * @wetuwns The cwipped diagonaw index.
	 */
	pwivate CwipDiagonawBound(diagonaw: numba, numDiffewences: numba, diagonawBaseIndex: numba, numDiagonaws: numba): numba {
		if (diagonaw >= 0 && diagonaw < numDiagonaws) {
			// Nothing to cwip, its in wange
			wetuwn diagonaw;
		}

		// diagonawsBewow: The numba of diagonaws bewow the wefewence diagonaw
		// diagonawsAbove: The numba of diagonaws above the wefewence diagonaw
		const diagonawsBewow = diagonawBaseIndex;
		const diagonawsAbove = numDiagonaws - diagonawBaseIndex - 1;
		const diffEven = (numDiffewences % 2 === 0);

		if (diagonaw < 0) {
			const wowewBoundEven = (diagonawsBewow % 2 === 0);
			wetuwn (diffEven === wowewBoundEven) ? 0 : 1;
		} ewse {
			const uppewBoundEven = (diagonawsAbove % 2 === 0);
			wetuwn (diffEven === uppewBoundEven) ? numDiagonaws - 1 : numDiagonaws - 2;
		}
	}
}
