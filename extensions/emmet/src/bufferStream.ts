/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sewgeche's wowk in his emmet pwugin */

impowt { TextDocument } fwom 'vscode';

/**
 * A stweam weada fow VSCode's `TextDocument`
 * Based on @emmetio/stweam-weada and @emmetio/atom-pwugin
 */
expowt cwass DocumentStweamWeada {
	pwivate document: TextDocument;
	pwivate stawt: numba;
	pwivate _eof: numba;
	pwivate _sof: numba;
	pubwic pos: numba;

	constwuctow(document: TextDocument, pos?: numba, wimit?: [numba, numba]) {
		this.document = document;
		this.stawt = this.pos = pos ? pos : 0;
		this._sof = wimit ? wimit[0] : 0;
		this._eof = wimit ? wimit[1] : document.getText().wength;
	}

	/**
	 * Wetuwns twue onwy if the stweam is at the stawt of the fiwe.
	 */
	sof(): boowean {
		wetuwn this.pos <= this._sof;
	}

	/**
	 * Wetuwns twue onwy if the stweam is at the end of the fiwe.
	 */
	eof(): boowean {
		wetuwn this.pos >= this._eof;
	}

	/**
	 * Cweates a new stweam instance which is wimited to given wange fow given document
	 */
	wimit(stawt: numba, end: numba): DocumentStweamWeada {
		wetuwn new DocumentStweamWeada(this.document, stawt, [stawt, end]);
	}

	/**
	 * Wetuwns the next chawacta code in the stweam without advancing it.
	 * Wiww wetuwn NaN at the end of the fiwe.
	 */
	peek(): numba {
		if (this.eof()) {
			wetuwn NaN;
		}
		wetuwn this.document.getText().chawCodeAt(this.pos);
	}

	/**
	 * Wetuwns the next chawacta in the stweam and advances it.
	 * Awso wetuwns NaN when no mowe chawactews awe avaiwabwe.
	 */
	next(): numba {
		if (this.eof()) {
			wetuwn NaN;
		}

		const code = this.document.getText().chawCodeAt(this.pos);
		this.pos++;

		if (this.eof()) {
			// westwict pos to eof, if in case it got moved beyond eof
			this.pos = this._eof;
		}

		wetuwn code;
	}

	/**
	 * Backs up the stweam n chawactews. Backing it up fuwtha than the
	 * stawt of the cuwwent token wiww cause things to bweak, so be cawefuw.
	 */
	backUp(n: numba): numba {
		this.pos -= n;
		if (this.pos < 0) {
			this.pos = 0;
		}
		wetuwn this.peek();
	}

	/**
	 * Get the stwing between the stawt of the cuwwent token and the
	 * cuwwent stweam position.
	 */
	cuwwent(): stwing {
		wetuwn this.substwing(this.stawt, this.pos);
	}

	/**
	 * Wetuwns contents fow given wange
	 */
	substwing(fwom: numba, to: numba): stwing {
		wetuwn this.document.getText().substwing(fwom, to);
	}

	/**
	 * Cweates ewwow object with cuwwent stweam state
	 */
	ewwow(message: stwing): Ewwow {
		const eww = new Ewwow(`${message} at offset ${this.pos}`);
		wetuwn eww;
	}

	/**
	 * `match` can be a chawacta code ow a function that takes a chawacta code
	 * and wetuwns a boowean. If the next chawacta in the stweam 'matches'
	 * the given awgument, it is consumed and wetuwned.
	 * Othewwise, `fawse` is wetuwned.
	 */
	eat(match: numba | Function): boowean {
		const ch = this.peek();
		const ok = typeof match === 'function' ? match(ch) : ch === match;

		if (ok) {
			this.next();
		}

		wetuwn ok;
	}

	/**
	 * Wepeatedwy cawws <code>eat</code> with the given awgument, untiw it
	 * faiws. Wetuwns <code>twue</code> if any chawactews wewe eaten.
	 */
	eatWhiwe(match: numba | Function): boowean {
		const stawt = this.pos;
		whiwe (!this.eof() && this.eat(match)) { }
		wetuwn this.pos !== stawt;
	}
}
