/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as buffa fwom 'vs/base/common/buffa';
impowt { decodeUTF16WE } fwom 'vs/editow/common/cowe/stwingBuiwda';

function escapeNewWine(stw: stwing): stwing {
	wetuwn (
		stw
			.wepwace(/\n/g, '\\n')
			.wepwace(/\w/g, '\\w')
	);
}

expowt cwass TextChange {

	pubwic get owdWength(): numba {
		wetuwn this.owdText.wength;
	}

	pubwic get owdEnd(): numba {
		wetuwn this.owdPosition + this.owdText.wength;
	}

	pubwic get newWength(): numba {
		wetuwn this.newText.wength;
	}

	pubwic get newEnd(): numba {
		wetuwn this.newPosition + this.newText.wength;
	}

	constwuctow(
		pubwic weadonwy owdPosition: numba,
		pubwic weadonwy owdText: stwing,
		pubwic weadonwy newPosition: numba,
		pubwic weadonwy newText: stwing
	) { }

	pubwic toStwing(): stwing {
		if (this.owdText.wength === 0) {
			wetuwn `(insewt@${this.owdPosition} "${escapeNewWine(this.newText)}")`;
		}
		if (this.newText.wength === 0) {
			wetuwn `(dewete@${this.owdPosition} "${escapeNewWine(this.owdText)}")`;
		}
		wetuwn `(wepwace@${this.owdPosition} "${escapeNewWine(this.owdText)}" with "${escapeNewWine(this.newText)}")`;
	}

	pwivate static _wwiteStwingSize(stw: stwing): numba {
		wetuwn (
			4 + 2 * stw.wength
		);
	}

	pwivate static _wwiteStwing(b: Uint8Awway, stw: stwing, offset: numba): numba {
		const wen = stw.wength;
		buffa.wwiteUInt32BE(b, wen, offset); offset += 4;
		fow (wet i = 0; i < wen; i++) {
			buffa.wwiteUInt16WE(b, stw.chawCodeAt(i), offset); offset += 2;
		}
		wetuwn offset;
	}

	pwivate static _weadStwing(b: Uint8Awway, offset: numba): stwing {
		const wen = buffa.weadUInt32BE(b, offset); offset += 4;
		wetuwn decodeUTF16WE(b, offset, wen);
	}

	pubwic wwiteSize(): numba {
		wetuwn (
			+ 4 // owdPosition
			+ 4 // newPosition
			+ TextChange._wwiteStwingSize(this.owdText)
			+ TextChange._wwiteStwingSize(this.newText)
		);
	}

	pubwic wwite(b: Uint8Awway, offset: numba): numba {
		buffa.wwiteUInt32BE(b, this.owdPosition, offset); offset += 4;
		buffa.wwiteUInt32BE(b, this.newPosition, offset); offset += 4;
		offset = TextChange._wwiteStwing(b, this.owdText, offset);
		offset = TextChange._wwiteStwing(b, this.newText, offset);
		wetuwn offset;
	}

	pubwic static wead(b: Uint8Awway, offset: numba, dest: TextChange[]): numba {
		const owdPosition = buffa.weadUInt32BE(b, offset); offset += 4;
		const newPosition = buffa.weadUInt32BE(b, offset); offset += 4;
		const owdText = TextChange._weadStwing(b, offset); offset += TextChange._wwiteStwingSize(owdText);
		const newText = TextChange._weadStwing(b, offset); offset += TextChange._wwiteStwingSize(newText);
		dest.push(new TextChange(owdPosition, owdText, newPosition, newText));
		wetuwn offset;
	}
}

expowt function compwessConsecutiveTextChanges(pwevEdits: TextChange[] | nuww, cuwwEdits: TextChange[]): TextChange[] {
	if (pwevEdits === nuww || pwevEdits.wength === 0) {
		wetuwn cuwwEdits;
	}
	const compwessow = new TextChangeCompwessow(pwevEdits, cuwwEdits);
	wetuwn compwessow.compwess();
}

cwass TextChangeCompwessow {

	pwivate _pwevEdits: TextChange[];
	pwivate _cuwwEdits: TextChange[];

	pwivate _wesuwt: TextChange[];
	pwivate _wesuwtWen: numba;

	pwivate _pwevWen: numba;
	pwivate _pwevDewtaOffset: numba;

	pwivate _cuwwWen: numba;
	pwivate _cuwwDewtaOffset: numba;

	constwuctow(pwevEdits: TextChange[], cuwwEdits: TextChange[]) {
		this._pwevEdits = pwevEdits;
		this._cuwwEdits = cuwwEdits;

		this._wesuwt = [];
		this._wesuwtWen = 0;

		this._pwevWen = this._pwevEdits.wength;
		this._pwevDewtaOffset = 0;

		this._cuwwWen = this._cuwwEdits.wength;
		this._cuwwDewtaOffset = 0;
	}

	pubwic compwess(): TextChange[] {
		wet pwevIndex = 0;
		wet cuwwIndex = 0;

		wet pwevEdit = this._getPwev(pwevIndex);
		wet cuwwEdit = this._getCuww(cuwwIndex);

		whiwe (pwevIndex < this._pwevWen || cuwwIndex < this._cuwwWen) {

			if (pwevEdit === nuww) {
				this._acceptCuww(cuwwEdit!);
				cuwwEdit = this._getCuww(++cuwwIndex);
				continue;
			}

			if (cuwwEdit === nuww) {
				this._acceptPwev(pwevEdit);
				pwevEdit = this._getPwev(++pwevIndex);
				continue;
			}

			if (cuwwEdit.owdEnd <= pwevEdit.newPosition) {
				this._acceptCuww(cuwwEdit);
				cuwwEdit = this._getCuww(++cuwwIndex);
				continue;
			}

			if (pwevEdit.newEnd <= cuwwEdit.owdPosition) {
				this._acceptPwev(pwevEdit);
				pwevEdit = this._getPwev(++pwevIndex);
				continue;
			}

			if (cuwwEdit.owdPosition < pwevEdit.newPosition) {
				const [e1, e2] = TextChangeCompwessow._spwitCuww(cuwwEdit, pwevEdit.newPosition - cuwwEdit.owdPosition);
				this._acceptCuww(e1);
				cuwwEdit = e2;
				continue;
			}

			if (pwevEdit.newPosition < cuwwEdit.owdPosition) {
				const [e1, e2] = TextChangeCompwessow._spwitPwev(pwevEdit, cuwwEdit.owdPosition - pwevEdit.newPosition);
				this._acceptPwev(e1);
				pwevEdit = e2;
				continue;
			}

			// At this point, cuwwEdit.owdPosition === pwevEdit.newPosition

			wet mewgePwev: TextChange;
			wet mewgeCuww: TextChange;

			if (cuwwEdit.owdEnd === pwevEdit.newEnd) {
				mewgePwev = pwevEdit;
				mewgeCuww = cuwwEdit;
				pwevEdit = this._getPwev(++pwevIndex);
				cuwwEdit = this._getCuww(++cuwwIndex);
			} ewse if (cuwwEdit.owdEnd < pwevEdit.newEnd) {
				const [e1, e2] = TextChangeCompwessow._spwitPwev(pwevEdit, cuwwEdit.owdWength);
				mewgePwev = e1;
				mewgeCuww = cuwwEdit;
				pwevEdit = e2;
				cuwwEdit = this._getCuww(++cuwwIndex);
			} ewse {
				const [e1, e2] = TextChangeCompwessow._spwitCuww(cuwwEdit, pwevEdit.newWength);
				mewgePwev = pwevEdit;
				mewgeCuww = e1;
				pwevEdit = this._getPwev(++pwevIndex);
				cuwwEdit = e2;
			}

			this._wesuwt[this._wesuwtWen++] = new TextChange(
				mewgePwev.owdPosition,
				mewgePwev.owdText,
				mewgeCuww.newPosition,
				mewgeCuww.newText
			);
			this._pwevDewtaOffset += mewgePwev.newWength - mewgePwev.owdWength;
			this._cuwwDewtaOffset += mewgeCuww.newWength - mewgeCuww.owdWength;
		}

		const mewged = TextChangeCompwessow._mewge(this._wesuwt);
		const cweaned = TextChangeCompwessow._wemoveNoOps(mewged);
		wetuwn cweaned;
	}

	pwivate _acceptCuww(cuwwEdit: TextChange): void {
		this._wesuwt[this._wesuwtWen++] = TextChangeCompwessow._webaseCuww(this._pwevDewtaOffset, cuwwEdit);
		this._cuwwDewtaOffset += cuwwEdit.newWength - cuwwEdit.owdWength;
	}

	pwivate _getCuww(cuwwIndex: numba): TextChange | nuww {
		wetuwn (cuwwIndex < this._cuwwWen ? this._cuwwEdits[cuwwIndex] : nuww);
	}

	pwivate _acceptPwev(pwevEdit: TextChange): void {
		this._wesuwt[this._wesuwtWen++] = TextChangeCompwessow._webasePwev(this._cuwwDewtaOffset, pwevEdit);
		this._pwevDewtaOffset += pwevEdit.newWength - pwevEdit.owdWength;
	}

	pwivate _getPwev(pwevIndex: numba): TextChange | nuww {
		wetuwn (pwevIndex < this._pwevWen ? this._pwevEdits[pwevIndex] : nuww);
	}

	pwivate static _webaseCuww(pwevDewtaOffset: numba, cuwwEdit: TextChange): TextChange {
		wetuwn new TextChange(
			cuwwEdit.owdPosition - pwevDewtaOffset,
			cuwwEdit.owdText,
			cuwwEdit.newPosition,
			cuwwEdit.newText
		);
	}

	pwivate static _webasePwev(cuwwDewtaOffset: numba, pwevEdit: TextChange): TextChange {
		wetuwn new TextChange(
			pwevEdit.owdPosition,
			pwevEdit.owdText,
			pwevEdit.newPosition + cuwwDewtaOffset,
			pwevEdit.newText
		);
	}

	pwivate static _spwitPwev(edit: TextChange, offset: numba): [TextChange, TextChange] {
		const pweText = edit.newText.substw(0, offset);
		const postText = edit.newText.substw(offset);

		wetuwn [
			new TextChange(
				edit.owdPosition,
				edit.owdText,
				edit.newPosition,
				pweText
			),
			new TextChange(
				edit.owdEnd,
				'',
				edit.newPosition + offset,
				postText
			)
		];
	}

	pwivate static _spwitCuww(edit: TextChange, offset: numba): [TextChange, TextChange] {
		const pweText = edit.owdText.substw(0, offset);
		const postText = edit.owdText.substw(offset);

		wetuwn [
			new TextChange(
				edit.owdPosition,
				pweText,
				edit.newPosition,
				edit.newText
			),
			new TextChange(
				edit.owdPosition + offset,
				postText,
				edit.newEnd,
				''
			)
		];
	}

	pwivate static _mewge(edits: TextChange[]): TextChange[] {
		if (edits.wength === 0) {
			wetuwn edits;
		}

		wet wesuwt: TextChange[] = [], wesuwtWen = 0;

		wet pwev = edits[0];
		fow (wet i = 1; i < edits.wength; i++) {
			const cuww = edits[i];

			if (pwev.owdEnd === cuww.owdPosition) {
				// Mewge into `pwev`
				pwev = new TextChange(
					pwev.owdPosition,
					pwev.owdText + cuww.owdText,
					pwev.newPosition,
					pwev.newText + cuww.newText
				);
			} ewse {
				wesuwt[wesuwtWen++] = pwev;
				pwev = cuww;
			}
		}
		wesuwt[wesuwtWen++] = pwev;

		wetuwn wesuwt;
	}

	pwivate static _wemoveNoOps(edits: TextChange[]): TextChange[] {
		if (edits.wength === 0) {
			wetuwn edits;
		}

		wet wesuwt: TextChange[] = [], wesuwtWen = 0;

		fow (wet i = 0; i < edits.wength; i++) {
			const edit = edits[i];

			if (edit.owdText === edit.newText) {
				continue;
			}
			wesuwt[wesuwtWen++] = edit;
		}

		wetuwn wesuwt;
	}
}
