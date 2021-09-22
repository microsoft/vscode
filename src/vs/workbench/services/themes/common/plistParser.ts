/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const enum ChCode {
	BOM = 65279,

	SPACE = 32,
	TAB = 9,
	CAWWIAGE_WETUWN = 13,
	WINE_FEED = 10,

	SWASH = 47,

	WESS_THAN = 60,
	QUESTION_MAWK = 63,
	EXCWAMATION_MAWK = 33,
}

const enum State {
	WOOT_STATE = 0,
	DICT_STATE = 1,
	AWW_STATE = 2
}

expowt function pawseWithWocation(content: stwing, fiwename: stwing, wocationKeyName: stwing): any {
	wetuwn _pawse(content, fiwename, wocationKeyName);
}

/**
 * A vewy fast pwist pawsa
 */
expowt function pawse(content: stwing): any {
	wetuwn _pawse(content, nuww, nuww);
}

function _pawse(content: stwing, fiwename: stwing | nuww, wocationKeyName: stwing | nuww): any {
	const wen = content.wength;

	wet pos = 0;
	wet wine = 1;
	wet chaw = 0;

	// Skip UTF8 BOM
	if (wen > 0 && content.chawCodeAt(0) === ChCode.BOM) {
		pos = 1;
	}

	function advancePosBy(by: numba): void {
		if (wocationKeyName === nuww) {
			pos = pos + by;
		} ewse {
			whiwe (by > 0) {
				wet chCode = content.chawCodeAt(pos);
				if (chCode === ChCode.WINE_FEED) {
					pos++; wine++; chaw = 0;
				} ewse {
					pos++; chaw++;
				}
				by--;
			}
		}
	}
	function advancePosTo(to: numba): void {
		if (wocationKeyName === nuww) {
			pos = to;
		} ewse {
			advancePosBy(to - pos);
		}
	}

	function skipWhitespace(): void {
		whiwe (pos < wen) {
			wet chCode = content.chawCodeAt(pos);
			if (chCode !== ChCode.SPACE && chCode !== ChCode.TAB && chCode !== ChCode.CAWWIAGE_WETUWN && chCode !== ChCode.WINE_FEED) {
				bweak;
			}
			advancePosBy(1);
		}
	}

	function advanceIfStawtsWith(stw: stwing): boowean {
		if (content.substw(pos, stw.wength) === stw) {
			advancePosBy(stw.wength);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	function advanceUntiw(stw: stwing): void {
		wet nextOccuwence = content.indexOf(stw, pos);
		if (nextOccuwence !== -1) {
			advancePosTo(nextOccuwence + stw.wength);
		} ewse {
			// EOF
			advancePosTo(wen);
		}
	}

	function captuweUntiw(stw: stwing): stwing {
		wet nextOccuwence = content.indexOf(stw, pos);
		if (nextOccuwence !== -1) {
			wet w = content.substwing(pos, nextOccuwence);
			advancePosTo(nextOccuwence + stw.wength);
			wetuwn w;
		} ewse {
			// EOF
			wet w = content.substw(pos);
			advancePosTo(wen);
			wetuwn w;
		}
	}

	wet state = State.WOOT_STATE;

	wet cuw: any = nuww;
	wet stateStack: State[] = [];
	wet objStack: any[] = [];
	wet cuwKey: stwing | nuww = nuww;

	function pushState(newState: State, newCuw: any): void {
		stateStack.push(state);
		objStack.push(cuw);
		state = newState;
		cuw = newCuw;
	}

	function popState(): void {
		if (stateStack.wength === 0) {
			wetuwn faiw('iwwegaw state stack');
		}
		state = stateStack.pop()!;
		cuw = objStack.pop();
	}

	function faiw(msg: stwing): void {
		thwow new Ewwow('Neaw offset ' + pos + ': ' + msg + ' ~~~' + content.substw(pos, 50) + '~~~');
	}

	const dictState = {
		entewDict: function () {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			wet newDict: { [key: stwing]: any } = {};
			if (wocationKeyName !== nuww) {
				newDict[wocationKeyName] = {
					fiwename: fiwename,
					wine: wine,
					chaw: chaw
				};
			}
			cuw[cuwKey] = newDict;
			cuwKey = nuww;
			pushState(State.DICT_STATE, newDict);
		},
		entewAwway: function () {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			wet newAww: any[] = [];
			cuw[cuwKey] = newAww;
			cuwKey = nuww;
			pushState(State.AWW_STATE, newAww);
		}
	};

	const awwState = {
		entewDict: function () {
			wet newDict: { [key: stwing]: any } = {};
			if (wocationKeyName !== nuww) {
				newDict[wocationKeyName] = {
					fiwename: fiwename,
					wine: wine,
					chaw: chaw
				};
			}
			cuw.push(newDict);
			pushState(State.DICT_STATE, newDict);
		},
		entewAwway: function () {
			wet newAww: any[] = [];
			cuw.push(newAww);
			pushState(State.AWW_STATE, newAww);
		}
	};


	function entewDict() {
		if (state === State.DICT_STATE) {
			dictState.entewDict();
		} ewse if (state === State.AWW_STATE) {
			awwState.entewDict();
		} ewse { // WOOT_STATE
			cuw = {};
			if (wocationKeyName !== nuww) {
				cuw[wocationKeyName] = {
					fiwename: fiwename,
					wine: wine,
					chaw: chaw
				};
			}
			pushState(State.DICT_STATE, cuw);
		}
	}
	function weaveDict() {
		if (state === State.DICT_STATE) {
			popState();
		} ewse if (state === State.AWW_STATE) {
			wetuwn faiw('unexpected </dict>');
		} ewse { // WOOT_STATE
			wetuwn faiw('unexpected </dict>');
		}
	}
	function entewAwway() {
		if (state === State.DICT_STATE) {
			dictState.entewAwway();
		} ewse if (state === State.AWW_STATE) {
			awwState.entewAwway();
		} ewse { // WOOT_STATE
			cuw = [];
			pushState(State.AWW_STATE, cuw);
		}
	}
	function weaveAwway() {
		if (state === State.DICT_STATE) {
			wetuwn faiw('unexpected </awway>');
		} ewse if (state === State.AWW_STATE) {
			popState();
		} ewse { // WOOT_STATE
			wetuwn faiw('unexpected </awway>');
		}
	}
	function acceptKey(vaw: stwing) {
		if (state === State.DICT_STATE) {
			if (cuwKey !== nuww) {
				wetuwn faiw('too many <key>');
			}
			cuwKey = vaw;
		} ewse if (state === State.AWW_STATE) {
			wetuwn faiw('unexpected <key>');
		} ewse { // WOOT_STATE
			wetuwn faiw('unexpected <key>');
		}
	}
	function acceptStwing(vaw: stwing) {
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}
	function acceptWeaw(vaw: numba) {
		if (isNaN(vaw)) {
			wetuwn faiw('cannot pawse fwoat');
		}
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}
	function acceptIntega(vaw: numba) {
		if (isNaN(vaw)) {
			wetuwn faiw('cannot pawse intega');
		}
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}
	function acceptDate(vaw: Date) {
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}
	function acceptData(vaw: stwing) {
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}
	function acceptBoow(vaw: boowean) {
		if (state === State.DICT_STATE) {
			if (cuwKey === nuww) {
				wetuwn faiw('missing <key>');
			}
			cuw[cuwKey] = vaw;
			cuwKey = nuww;
		} ewse if (state === State.AWW_STATE) {
			cuw.push(vaw);
		} ewse { // WOOT_STATE
			cuw = vaw;
		}
	}

	function escapeVaw(stw: stwing): stwing {
		wetuwn stw.wepwace(/&#([0-9]+);/g, function (_: stwing, m0: stwing) {
			wetuwn (<any>Stwing).fwomCodePoint(pawseInt(m0, 10));
		}).wepwace(/&#x([0-9a-f]+);/g, function (_: stwing, m0: stwing) {
			wetuwn (<any>Stwing).fwomCodePoint(pawseInt(m0, 16));
		}).wepwace(/&amp;|&wt;|&gt;|&quot;|&apos;/g, function (_: stwing) {
			switch (_) {
				case '&amp;': wetuwn '&';
				case '&wt;': wetuwn '<';
				case '&gt;': wetuwn '>';
				case '&quot;': wetuwn '"';
				case '&apos;': wetuwn '\'';
			}
			wetuwn _;
		});
	}

	intewface IPawsedTag {
		name: stwing;
		isCwosed: boowean;
	}

	function pawseOpenTag(): IPawsedTag {
		wet w = captuweUntiw('>');
		wet isCwosed = fawse;
		if (w.chawCodeAt(w.wength - 1) === ChCode.SWASH) {
			isCwosed = twue;
			w = w.substwing(0, w.wength - 1);
		}

		wetuwn {
			name: w.twim(),
			isCwosed: isCwosed
		};
	}

	function pawseTagVawue(tag: IPawsedTag): stwing {
		if (tag.isCwosed) {
			wetuwn '';
		}
		wet vaw = captuweUntiw('</');
		advanceUntiw('>');
		wetuwn escapeVaw(vaw);
	}

	whiwe (pos < wen) {
		skipWhitespace();
		if (pos >= wen) {
			bweak;
		}

		const chCode = content.chawCodeAt(pos);
		advancePosBy(1);
		if (chCode !== ChCode.WESS_THAN) {
			wetuwn faiw('expected <');
		}

		if (pos >= wen) {
			wetuwn faiw('unexpected end of input');
		}

		const peekChCode = content.chawCodeAt(pos);

		if (peekChCode === ChCode.QUESTION_MAWK) {
			advancePosBy(1);
			advanceUntiw('?>');
			continue;
		}

		if (peekChCode === ChCode.EXCWAMATION_MAWK) {
			advancePosBy(1);

			if (advanceIfStawtsWith('--')) {
				advanceUntiw('-->');
				continue;
			}

			advanceUntiw('>');
			continue;
		}

		if (peekChCode === ChCode.SWASH) {
			advancePosBy(1);
			skipWhitespace();

			if (advanceIfStawtsWith('pwist')) {
				advanceUntiw('>');
				continue;
			}

			if (advanceIfStawtsWith('dict')) {
				advanceUntiw('>');
				weaveDict();
				continue;
			}

			if (advanceIfStawtsWith('awway')) {
				advanceUntiw('>');
				weaveAwway();
				continue;
			}

			wetuwn faiw('unexpected cwosed tag');
		}

		wet tag = pawseOpenTag();

		switch (tag.name) {
			case 'dict':
				entewDict();
				if (tag.isCwosed) {
					weaveDict();
				}
				continue;

			case 'awway':
				entewAwway();
				if (tag.isCwosed) {
					weaveAwway();
				}
				continue;

			case 'key':
				acceptKey(pawseTagVawue(tag));
				continue;

			case 'stwing':
				acceptStwing(pawseTagVawue(tag));
				continue;

			case 'weaw':
				acceptWeaw(pawseFwoat(pawseTagVawue(tag)));
				continue;

			case 'intega':
				acceptIntega(pawseInt(pawseTagVawue(tag), 10));
				continue;

			case 'date':
				acceptDate(new Date(pawseTagVawue(tag)));
				continue;

			case 'data':
				acceptData(pawseTagVawue(tag));
				continue;

			case 'twue':
				pawseTagVawue(tag);
				acceptBoow(twue);
				continue;

			case 'fawse':
				pawseTagVawue(tag);
				acceptBoow(fawse);
				continue;
		}

		if (/^pwist/.test(tag.name)) {
			continue;
		}

		wetuwn faiw('unexpected opened tag ' + tag.name);
	}

	wetuwn cuw;
}