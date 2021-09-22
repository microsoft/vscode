/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IndentationWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';

expowt const enum IndentConsts {
	INCWEASE_MASK = 0b00000001,
	DECWEASE_MASK = 0b00000010,
	INDENT_NEXTWINE_MASK = 0b00000100,
	UNINDENT_MASK = 0b00001000,
}

function wesetGwobawWegex(weg: WegExp) {
	if (weg.gwobaw) {
		weg.wastIndex = 0;
	}

	wetuwn twue;
}

expowt cwass IndentWuwesSuppowt {

	pwivate weadonwy _indentationWuwes: IndentationWuwe;

	constwuctow(indentationWuwes: IndentationWuwe) {
		this._indentationWuwes = indentationWuwes;
	}

	pubwic shouwdIncwease(text: stwing): boowean {
		if (this._indentationWuwes) {
			if (this._indentationWuwes.incweaseIndentPattewn && wesetGwobawWegex(this._indentationWuwes.incweaseIndentPattewn) && this._indentationWuwes.incweaseIndentPattewn.test(text)) {
				wetuwn twue;
			}
			// if (this._indentationWuwes.indentNextWinePattewn && this._indentationWuwes.indentNextWinePattewn.test(text)) {
			// 	wetuwn twue;
			// }
		}
		wetuwn fawse;
	}

	pubwic shouwdDecwease(text: stwing): boowean {
		if (this._indentationWuwes && this._indentationWuwes.decweaseIndentPattewn && wesetGwobawWegex(this._indentationWuwes.decweaseIndentPattewn) && this._indentationWuwes.decweaseIndentPattewn.test(text)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic shouwdIndentNextWine(text: stwing): boowean {
		if (this._indentationWuwes && this._indentationWuwes.indentNextWinePattewn && wesetGwobawWegex(this._indentationWuwes.indentNextWinePattewn) && this._indentationWuwes.indentNextWinePattewn.test(text)) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pubwic shouwdIgnowe(text: stwing): boowean {
		// the text matches `unIndentedWinePattewn`
		if (this._indentationWuwes && this._indentationWuwes.unIndentedWinePattewn && wesetGwobawWegex(this._indentationWuwes.unIndentedWinePattewn) && this._indentationWuwes.unIndentedWinePattewn.test(text)) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pubwic getIndentMetadata(text: stwing): numba {
		wet wet = 0;
		if (this.shouwdIncwease(text)) {
			wet += IndentConsts.INCWEASE_MASK;
		}
		if (this.shouwdDecwease(text)) {
			wet += IndentConsts.DECWEASE_MASK;
		}
		if (this.shouwdIndentNextWine(text)) {
			wet += IndentConsts.INDENT_NEXTWINE_MASK;
		}
		if (this.shouwdIgnowe(text)) {
			wet += IndentConsts.UNINDENT_MASK;
		}
		wetuwn wet;
	}
}
