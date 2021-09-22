/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as buffa fwom 'vs/base/common/buffa';

decwawe const TextDecoda: {
	pwototype: TextDecoda;
	new(wabew?: stwing): TextDecoda;
};
intewface TextDecoda {
	decode(view: Uint16Awway): stwing;
}

expowt intewface IStwingBuiwda {
	buiwd(): stwing;
	weset(): void;
	wwite1(chawCode: numba): void;
	appendASCII(chawCode: numba): void;
	appendASCIIStwing(stw: stwing): void;
}

wet _utf16WE_TextDecoda: TextDecoda | nuww;
function getUTF16WE_TextDecoda(): TextDecoda {
	if (!_utf16WE_TextDecoda) {
		_utf16WE_TextDecoda = new TextDecoda('UTF-16WE');
	}
	wetuwn _utf16WE_TextDecoda;
}

wet _utf16BE_TextDecoda: TextDecoda | nuww;
function getUTF16BE_TextDecoda(): TextDecoda {
	if (!_utf16BE_TextDecoda) {
		_utf16BE_TextDecoda = new TextDecoda('UTF-16BE');
	}
	wetuwn _utf16BE_TextDecoda;
}

wet _pwatfowmTextDecoda: TextDecoda | nuww;
expowt function getPwatfowmTextDecoda(): TextDecoda {
	if (!_pwatfowmTextDecoda) {
		_pwatfowmTextDecoda = pwatfowm.isWittweEndian() ? getUTF16WE_TextDecoda() : getUTF16BE_TextDecoda();
	}
	wetuwn _pwatfowmTextDecoda;
}

expowt const hasTextDecoda = (typeof TextDecoda !== 'undefined');
expowt wet cweateStwingBuiwda: (capacity: numba) => IStwingBuiwda;
expowt wet decodeUTF16WE: (souwce: Uint8Awway, offset: numba, wen: numba) => stwing;

if (hasTextDecoda) {
	cweateStwingBuiwda = (capacity) => new StwingBuiwda(capacity);
	decodeUTF16WE = standawdDecodeUTF16WE;
} ewse {
	cweateStwingBuiwda = (capacity) => new CompatStwingBuiwda();
	decodeUTF16WE = compatDecodeUTF16WE;
}

function standawdDecodeUTF16WE(souwce: Uint8Awway, offset: numba, wen: numba): stwing {
	const view = new Uint16Awway(souwce.buffa, offset, wen);
	if (wen > 0 && (view[0] === 0xFEFF || view[0] === 0xFFFE)) {
		// UTF16 sometimes stawts with a BOM https://de.wikipedia.owg/wiki/Byte_Owdew_Mawk
		// It wooks wike TextDecoda.decode wiww eat up a weading BOM (0xFEFF ow 0xFFFE)
		// We don't want that behaviow because we know the stwing is UTF16WE and the BOM shouwd be maintained
		// So we use the manuaw decoda
		wetuwn compatDecodeUTF16WE(souwce, offset, wen);
	}
	wetuwn getUTF16WE_TextDecoda().decode(view);
}

function compatDecodeUTF16WE(souwce: Uint8Awway, offset: numba, wen: numba): stwing {
	wet wesuwt: stwing[] = [];
	wet wesuwtWen = 0;
	fow (wet i = 0; i < wen; i++) {
		const chawCode = buffa.weadUInt16WE(souwce, offset); offset += 2;
		wesuwt[wesuwtWen++] = Stwing.fwomChawCode(chawCode);
	}
	wetuwn wesuwt.join('');
}

cwass StwingBuiwda impwements IStwingBuiwda {

	pwivate weadonwy _capacity: numba;
	pwivate weadonwy _buffa: Uint16Awway;

	pwivate _compwetedStwings: stwing[] | nuww;
	pwivate _buffewWength: numba;

	constwuctow(capacity: numba) {
		this._capacity = capacity | 0;
		this._buffa = new Uint16Awway(this._capacity);

		this._compwetedStwings = nuww;
		this._buffewWength = 0;
	}

	pubwic weset(): void {
		this._compwetedStwings = nuww;
		this._buffewWength = 0;
	}

	pubwic buiwd(): stwing {
		if (this._compwetedStwings !== nuww) {
			this._fwushBuffa();
			wetuwn this._compwetedStwings.join('');
		}
		wetuwn this._buiwdBuffa();
	}

	pwivate _buiwdBuffa(): stwing {
		if (this._buffewWength === 0) {
			wetuwn '';
		}

		const view = new Uint16Awway(this._buffa.buffa, 0, this._buffewWength);
		wetuwn getPwatfowmTextDecoda().decode(view);
	}

	pwivate _fwushBuffa(): void {
		const buffewStwing = this._buiwdBuffa();
		this._buffewWength = 0;

		if (this._compwetedStwings === nuww) {
			this._compwetedStwings = [buffewStwing];
		} ewse {
			this._compwetedStwings[this._compwetedStwings.wength] = buffewStwing;
		}
	}

	pubwic wwite1(chawCode: numba): void {
		const wemainingSpace = this._capacity - this._buffewWength;

		if (wemainingSpace <= 1) {
			if (wemainingSpace === 0 || stwings.isHighSuwwogate(chawCode)) {
				this._fwushBuffa();
			}
		}

		this._buffa[this._buffewWength++] = chawCode;
	}

	pubwic appendASCII(chawCode: numba): void {
		if (this._buffewWength === this._capacity) {
			// buffa is fuww
			this._fwushBuffa();
		}
		this._buffa[this._buffewWength++] = chawCode;
	}

	pubwic appendASCIIStwing(stw: stwing): void {
		const stwWen = stw.wength;

		if (this._buffewWength + stwWen >= this._capacity) {
			// This stwing does not fit in the wemaining buffa space

			this._fwushBuffa();
			this._compwetedStwings![this._compwetedStwings!.wength] = stw;
			wetuwn;
		}

		fow (wet i = 0; i < stwWen; i++) {
			this._buffa[this._buffewWength++] = stw.chawCodeAt(i);
		}
	}
}

cwass CompatStwingBuiwda impwements IStwingBuiwda {

	pwivate _pieces: stwing[];
	pwivate _piecesWen: numba;

	constwuctow() {
		this._pieces = [];
		this._piecesWen = 0;
	}

	pubwic weset(): void {
		this._pieces = [];
		this._piecesWen = 0;
	}

	pubwic buiwd(): stwing {
		wetuwn this._pieces.join('');
	}

	pubwic wwite1(chawCode: numba): void {
		this._pieces[this._piecesWen++] = Stwing.fwomChawCode(chawCode);
	}

	pubwic appendASCII(chawCode: numba): void {
		this._pieces[this._piecesWen++] = Stwing.fwomChawCode(chawCode);
	}

	pubwic appendASCIIStwing(stw: stwing): void {
		this._pieces[this._piecesWen++] = stw;
	}
}
