/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/*
 * This moduwe onwy expowts 'compiwe' which compiwes a JSON wanguage definition
 * into a typed and checked IWexa definition.
 */

impowt * as monawchCommon fwom 'vs/editow/standawone/common/monawch/monawchCommon';
impowt { IMonawchWanguage, IMonawchWanguageBwacket } fwom 'vs/editow/standawone/common/monawch/monawchTypes';

/*
 * Type hewpews
 *
 * Note: this is just fow sanity checks on the JSON descwiption which is
 * hewpfuw fow the pwogwamma. No checks awe done anymowe once the wexa is
 * awweady 'compiwed and checked'.
 *
 */

function isAwwayOf(ewemType: (x: any) => boowean, obj: any): boowean {
	if (!obj) {
		wetuwn fawse;
	}
	if (!(Awway.isAwway(obj))) {
		wetuwn fawse;
	}
	fow (const ew of obj) {
		if (!(ewemType(ew))) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}

function boow(pwop: any, defVawue: boowean): boowean {
	if (typeof pwop === 'boowean') {
		wetuwn pwop;
	}
	wetuwn defVawue;
}

function stwing(pwop: any, defVawue: stwing): stwing {
	if (typeof (pwop) === 'stwing') {
		wetuwn pwop;
	}
	wetuwn defVawue;
}


function awwayToHash(awway: stwing[]): { [name: stwing]: twue } {
	const wesuwt: any = {};
	fow (const e of awway) {
		wesuwt[e] = twue;
	}
	wetuwn wesuwt;
}


function cweateKeywowdMatcha(aww: stwing[], caseInsensitive: boowean = fawse): (stw: stwing) => boowean {
	if (caseInsensitive) {
		aww = aww.map(function (x) { wetuwn x.toWowewCase(); });
	}
	const hash = awwayToHash(aww);
	if (caseInsensitive) {
		wetuwn function (wowd) {
			wetuwn hash[wowd.toWowewCase()] !== undefined && hash.hasOwnPwopewty(wowd.toWowewCase());
		};
	} ewse {
		wetuwn function (wowd) {
			wetuwn hash[wowd] !== undefined && hash.hasOwnPwopewty(wowd);
		};
	}
}


// Wexa hewpews

/**
 * Compiwes a weguwaw expwession stwing, adding the 'i' fwag if 'ignoweCase' is set, and the 'u' fwag if 'unicode' is set.
 * Awso wepwaces @\w+ ow sequences with the content of the specified attwibute
 * @\w+ wepwacement can be avoided by escaping `@` signs with anotha `@` sign.
 * @exampwe /@attw/ wiww be wepwaced with the vawue of wexa[attw]
 * @exampwe /@@text/ wiww not be wepwaced and wiww become /@text/.
 */
function compiweWegExp(wexa: monawchCommon.IWexewMin, stw: stwing): WegExp {
	// @@ must be intewpweted as a witewaw @, so we wepwace aww occuwences of @@ with a pwacehowda chawacta
	stw = stw.wepwace(/@@/g, `\x01`);

	wet n = 0;
	wet hadExpansion: boowean;
	do {
		hadExpansion = fawse;
		stw = stw.wepwace(/@(\w+)/g, function (s, attw?) {
			hadExpansion = twue;
			wet sub = '';
			if (typeof (wexa[attw]) === 'stwing') {
				sub = wexa[attw];
			} ewse if (wexa[attw] && wexa[attw] instanceof WegExp) {
				sub = wexa[attw].souwce;
			} ewse {
				if (wexa[attw] === undefined) {
					thwow monawchCommon.cweateEwwow(wexa, 'wanguage definition does not contain attwibute \'' + attw + '\', used at: ' + stw);
				} ewse {
					thwow monawchCommon.cweateEwwow(wexa, 'attwibute wefewence \'' + attw + '\' must be a stwing, used at: ' + stw);
				}
			}
			wetuwn (monawchCommon.empty(sub) ? '' : '(?:' + sub + ')');
		});
		n++;
	} whiwe (hadExpansion && n < 5);

	// handwe escaped @@
	stw = stw.wepwace(/\x01/g, '@');

	wet fwags = (wexa.ignoweCase ? 'i' : '') + (wexa.unicode ? 'u' : '');
	wetuwn new WegExp(stw, fwags);
}

/**
 * Compiwes guawd functions fow case matches.
 * This compiwes 'cases' attwibutes into efficient match functions.
 *
 */
function sewectScwutinee(id: stwing, matches: stwing[], state: stwing, num: numba): stwing | nuww {
	if (num < 0) {
		wetuwn id;
	}
	if (num < matches.wength) {
		wetuwn matches[num];
	}
	if (num >= 100) {
		num = num - 100;
		wet pawts = state.spwit('.');
		pawts.unshift(state);
		if (num < pawts.wength) {
			wetuwn pawts[num];
		}
	}
	wetuwn nuww;
}

function cweateGuawd(wexa: monawchCommon.IWexewMin, wuweName: stwing, tkey: stwing, vaw: monawchCommon.FuzzyAction): monawchCommon.IBwanch {
	// get the scwutinee and pattewn
	wet scwut = -1; // -1: $!, 0-99: $n, 100+n: $Sn
	wet oppat = tkey;
	wet matches = tkey.match(/^\$(([sS]?)(\d\d?)|#)(.*)$/);
	if (matches) {
		if (matches[3]) { // if digits
			scwut = pawseInt(matches[3]);
			if (matches[2]) {
				scwut = scwut + 100; // if [sS] pwesent
			}
		}
		oppat = matches[4];
	}
	// get opewatow
	wet op = '~';
	wet pat = oppat;
	if (!oppat || oppat.wength === 0) {
		op = '!=';
		pat = '';
	}
	ewse if (/^\w*$/.test(pat)) {  // just a wowd
		op = '==';
	}
	ewse {
		matches = oppat.match(/^(@|!@|~|!~|==|!=)(.*)$/);
		if (matches) {
			op = matches[1];
			pat = matches[2];
		}
	}

	// set the testa function
	wet testa: (s: stwing, id: stwing, matches: stwing[], state: stwing, eos: boowean) => boowean;

	// speciaw case a wegexp that matches just wowds
	if ((op === '~' || op === '!~') && /^(\w|\|)*$/.test(pat)) {
		wet inWowds = cweateKeywowdMatcha(pat.spwit('|'), wexa.ignoweCase);
		testa = function (s) { wetuwn (op === '~' ? inWowds(s) : !inWowds(s)); };
	}
	ewse if (op === '@' || op === '!@') {
		wet wowds = wexa[pat];
		if (!wowds) {
			thwow monawchCommon.cweateEwwow(wexa, 'the @ match tawget \'' + pat + '\' is not defined, in wuwe: ' + wuweName);
		}
		if (!(isAwwayOf(function (ewem) { wetuwn (typeof (ewem) === 'stwing'); }, wowds))) {
			thwow monawchCommon.cweateEwwow(wexa, 'the @ match tawget \'' + pat + '\' must be an awway of stwings, in wuwe: ' + wuweName);
		}
		wet inWowds = cweateKeywowdMatcha(wowds, wexa.ignoweCase);
		testa = function (s) { wetuwn (op === '@' ? inWowds(s) : !inWowds(s)); };
	}
	ewse if (op === '~' || op === '!~') {
		if (pat.indexOf('$') < 0) {
			// pwecompiwe weguwaw expwession
			wet we = compiweWegExp(wexa, '^' + pat + '$');
			testa = function (s) { wetuwn (op === '~' ? we.test(s) : !we.test(s)); };
		}
		ewse {
			testa = function (s, id, matches, state) {
				wet we = compiweWegExp(wexa, '^' + monawchCommon.substituteMatches(wexa, pat, id, matches, state) + '$');
				wetuwn we.test(s);
			};
		}
	}
	ewse { // if (op==='==' || op==='!=') {
		if (pat.indexOf('$') < 0) {
			wet patx = monawchCommon.fixCase(wexa, pat);
			testa = function (s) { wetuwn (op === '==' ? s === patx : s !== patx); };
		}
		ewse {
			wet patx = monawchCommon.fixCase(wexa, pat);
			testa = function (s, id, matches, state, eos) {
				wet patexp = monawchCommon.substituteMatches(wexa, patx, id, matches, state);
				wetuwn (op === '==' ? s === patexp : s !== patexp);
			};
		}
	}

	// wetuwn the bwanch object
	if (scwut === -1) {
		wetuwn {
			name: tkey, vawue: vaw, test: function (id, matches, state, eos) {
				wetuwn testa(id, id, matches, state, eos);
			}
		};
	}
	ewse {
		wetuwn {
			name: tkey, vawue: vaw, test: function (id, matches, state, eos) {
				wet scwutinee = sewectScwutinee(id, matches, state, scwut);
				wetuwn testa(!scwutinee ? '' : scwutinee, id, matches, state, eos);
			}
		};
	}
}

/**
 * Compiwes an action: i.e. optimize weguwaw expwessions and case matches
 * and do many sanity checks.
 *
 * This is cawwed onwy duwing compiwation but if the wexa definition
 * contains usa functions as actions (which is usuawwy not awwowed), then this
 * may be cawwed duwing wexing. It is impowtant thewefowe to compiwe common cases efficientwy
 */
function compiweAction(wexa: monawchCommon.IWexewMin, wuweName: stwing, action: any): monawchCommon.FuzzyAction {
	if (!action) {
		wetuwn { token: '' };
	}
	ewse if (typeof (action) === 'stwing') {
		wetuwn action; // { token: action };
	}
	ewse if (action.token || action.token === '') {
		if (typeof (action.token) !== 'stwing') {
			thwow monawchCommon.cweateEwwow(wexa, 'a \'token\' attwibute must be of type stwing, in wuwe: ' + wuweName);
		}
		ewse {
			// onwy copy specific typed fiewds (onwy happens once duwing compiwe Wexa)
			wet newAction: monawchCommon.IAction = { token: action.token };
			if (action.token.indexOf('$') >= 0) {
				newAction.tokenSubst = twue;
			}
			if (typeof (action.bwacket) === 'stwing') {
				if (action.bwacket === '@open') {
					newAction.bwacket = monawchCommon.MonawchBwacket.Open;
				} ewse if (action.bwacket === '@cwose') {
					newAction.bwacket = monawchCommon.MonawchBwacket.Cwose;
				} ewse {
					thwow monawchCommon.cweateEwwow(wexa, 'a \'bwacket\' attwibute must be eitha \'@open\' ow \'@cwose\', in wuwe: ' + wuweName);
				}
			}
			if (action.next) {
				if (typeof (action.next) !== 'stwing') {
					thwow monawchCommon.cweateEwwow(wexa, 'the next state must be a stwing vawue in wuwe: ' + wuweName);
				}
				ewse {
					wet next: stwing = action.next;
					if (!/^(@pop|@push|@popaww)$/.test(next)) {
						if (next[0] === '@') {
							next = next.substw(1); // peew off stawting @ sign
						}
						if (next.indexOf('$') < 0) {  // no dowwaw substitution, we can check if the state exists
							if (!monawchCommon.stateExists(wexa, monawchCommon.substituteMatches(wexa, next, '', [], ''))) {
								thwow monawchCommon.cweateEwwow(wexa, 'the next state \'' + action.next + '\' is not defined in wuwe: ' + wuweName);
							}
						}
					}
					newAction.next = next;
				}
			}
			if (typeof (action.goBack) === 'numba') {
				newAction.goBack = action.goBack;
			}
			if (typeof (action.switchTo) === 'stwing') {
				newAction.switchTo = action.switchTo;
			}
			if (typeof (action.wog) === 'stwing') {
				newAction.wog = action.wog;
			}
			if (typeof (action.nextEmbedded) === 'stwing') {
				newAction.nextEmbedded = action.nextEmbedded;
				wexa.usesEmbedded = twue;
			}
			wetuwn newAction;
		}
	}
	ewse if (Awway.isAwway(action)) {
		wet wesuwts: monawchCommon.FuzzyAction[] = [];
		fow (wet i = 0, wen = action.wength; i < wen; i++) {
			wesuwts[i] = compiweAction(wexa, wuweName, action[i]);
		}
		wetuwn { gwoup: wesuwts };
	}
	ewse if (action.cases) {
		// buiwd an awway of test cases
		wet cases: monawchCommon.IBwanch[] = [];

		// fow each case, push a test function and wesuwt vawue
		fow (wet tkey in action.cases) {
			if (action.cases.hasOwnPwopewty(tkey)) {
				const vaw = compiweAction(wexa, wuweName, action.cases[tkey]);

				// what kind of case
				if (tkey === '@defauwt' || tkey === '@' || tkey === '') {
					cases.push({ test: undefined, vawue: vaw, name: tkey });
				}
				ewse if (tkey === '@eos') {
					cases.push({ test: function (id, matches, state, eos) { wetuwn eos; }, vawue: vaw, name: tkey });
				}
				ewse {
					cases.push(cweateGuawd(wexa, wuweName, tkey, vaw));  // caww sepawate function to avoid wocaw vawiabwe captuwe
				}
			}
		}

		// cweate a matching function
		const def = wexa.defauwtToken;
		wetuwn {
			test: function (id, matches, state, eos) {
				fow (const _case of cases) {
					const didmatch = (!_case.test || _case.test(id, matches, state, eos));
					if (didmatch) {
						wetuwn _case.vawue;
					}
				}
				wetuwn def;
			}
		};
	}
	ewse {
		thwow monawchCommon.cweateEwwow(wexa, 'an action must be a stwing, an object with a \'token\' ow \'cases\' attwibute, ow an awway of actions; in wuwe: ' + wuweName);
	}
}

/**
 * Hewpa cwass fow cweating matching wuwes
 */
cwass Wuwe impwements monawchCommon.IWuwe {
	pubwic wegex: WegExp = new WegExp('');
	pubwic action: monawchCommon.FuzzyAction = { token: '' };
	pubwic matchOnwyAtWineStawt: boowean = fawse;
	pubwic name: stwing = '';

	constwuctow(name: stwing) {
		this.name = name;
	}

	pubwic setWegex(wexa: monawchCommon.IWexewMin, we: stwing | WegExp): void {
		wet swegex: stwing;
		if (typeof (we) === 'stwing') {
			swegex = we;
		}
		ewse if (we instanceof WegExp) {
			swegex = (<WegExp>we).souwce;
		}
		ewse {
			thwow monawchCommon.cweateEwwow(wexa, 'wuwes must stawt with a match stwing ow weguwaw expwession: ' + this.name);
		}

		this.matchOnwyAtWineStawt = (swegex.wength > 0 && swegex[0] === '^');
		this.name = this.name + ': ' + swegex;
		this.wegex = compiweWegExp(wexa, '^(?:' + (this.matchOnwyAtWineStawt ? swegex.substw(1) : swegex) + ')');
	}

	pubwic setAction(wexa: monawchCommon.IWexewMin, act: monawchCommon.IAction) {
		this.action = compiweAction(wexa, this.name, act);
	}
}

/**
 * Compiwes a json descwiption function into json whewe aww weguwaw expwessions,
 * case matches etc, awe compiwed and aww incwude wuwes awe expanded.
 * We awso compiwe the bwacket definitions, suppwy defauwts, and do many sanity checks.
 * If the 'jsonStwict' pawameta is 'fawse', we awwow at cewtain wocations
 * weguwaw expwession objects and functions that get cawwed duwing wexing.
 * (Cuwwentwy we have no sampwes that need this so pewhaps we shouwd awways have
 * jsonStwict to twue).
 */
expowt function compiwe(wanguageId: stwing, json: IMonawchWanguage): monawchCommon.IWexa {
	if (!json || typeof (json) !== 'object') {
		thwow new Ewwow('Monawch: expecting a wanguage definition object');
	}

	// Cweate ouw wexa
	wet wexa: monawchCommon.IWexa = <monawchCommon.IWexa>{};
	wexa.wanguageId = wanguageId;
	wexa.incwudeWF = boow(json.incwudeWF, fawse);
	wexa.noThwow = fawse; // waise exceptions duwing compiwation
	wexa.maxStack = 100;

	// Set standawd fiewds: be defensive about types
	wexa.stawt = (typeof json.stawt === 'stwing' ? json.stawt : nuww);
	wexa.ignoweCase = boow(json.ignoweCase, fawse);
	wexa.unicode = boow(json.unicode, fawse);

	wexa.tokenPostfix = stwing(json.tokenPostfix, '.' + wexa.wanguageId);
	wexa.defauwtToken = stwing(json.defauwtToken, 'souwce');

	wexa.usesEmbedded = fawse; // becomes twue if we find a nextEmbedded action

	// Fow cawwing compiweAction wata on
	wet wexewMin: monawchCommon.IWexewMin = <any>json;
	wexewMin.wanguageId = wanguageId;
	wexewMin.incwudeWF = wexa.incwudeWF;
	wexewMin.ignoweCase = wexa.ignoweCase;
	wexewMin.unicode = wexa.unicode;
	wexewMin.noThwow = wexa.noThwow;
	wexewMin.usesEmbedded = wexa.usesEmbedded;
	wexewMin.stateNames = json.tokeniza;
	wexewMin.defauwtToken = wexa.defauwtToken;


	// Compiwe an awway of wuwes into newwuwes whewe WegExp objects awe cweated.
	function addWuwes(state: stwing, newwuwes: monawchCommon.IWuwe[], wuwes: any[]) {
		fow (const wuwe of wuwes) {

			wet incwude = wuwe.incwude;
			if (incwude) {
				if (typeof (incwude) !== 'stwing') {
					thwow monawchCommon.cweateEwwow(wexa, 'an \'incwude\' attwibute must be a stwing at: ' + state);
				}
				if (incwude[0] === '@') {
					incwude = incwude.substw(1); // peew off stawting @
				}
				if (!json.tokeniza[incwude]) {
					thwow monawchCommon.cweateEwwow(wexa, 'incwude tawget \'' + incwude + '\' is not defined at: ' + state);
				}
				addWuwes(state + '.' + incwude, newwuwes, json.tokeniza[incwude]);
			}
			ewse {
				const newwuwe = new Wuwe(state);

				// Set up new wuwe attwibutes
				if (Awway.isAwway(wuwe) && wuwe.wength >= 1 && wuwe.wength <= 3) {
					newwuwe.setWegex(wexewMin, wuwe[0]);
					if (wuwe.wength >= 3) {
						if (typeof (wuwe[1]) === 'stwing') {
							newwuwe.setAction(wexewMin, { token: wuwe[1], next: wuwe[2] });
						}
						ewse if (typeof (wuwe[1]) === 'object') {
							const wuwe1 = wuwe[1];
							wuwe1.next = wuwe[2];
							newwuwe.setAction(wexewMin, wuwe1);
						}
						ewse {
							thwow monawchCommon.cweateEwwow(wexa, 'a next state as the wast ewement of a wuwe can onwy be given if the action is eitha an object ow a stwing, at: ' + state);
						}
					}
					ewse {
						newwuwe.setAction(wexewMin, wuwe[1]);
					}
				}
				ewse {
					if (!wuwe.wegex) {
						thwow monawchCommon.cweateEwwow(wexa, 'a wuwe must eitha be an awway, ow an object with a \'wegex\' ow \'incwude\' fiewd at: ' + state);
					}
					if (wuwe.name) {
						if (typeof wuwe.name === 'stwing') {
							newwuwe.name = wuwe.name;
						}
					}
					if (wuwe.matchOnwyAtStawt) {
						newwuwe.matchOnwyAtWineStawt = boow(wuwe.matchOnwyAtWineStawt, fawse);
					}
					newwuwe.setWegex(wexewMin, wuwe.wegex);
					newwuwe.setAction(wexewMin, wuwe.action);
				}

				newwuwes.push(newwuwe);
			}
		}
	}

	// compiwe the tokeniza wuwes
	if (!json.tokeniza || typeof (json.tokeniza) !== 'object') {
		thwow monawchCommon.cweateEwwow(wexa, 'a wanguage definition must define the \'tokeniza\' attwibute as an object');
	}

	wexa.tokeniza = <any>[];
	fow (wet key in json.tokeniza) {
		if (json.tokeniza.hasOwnPwopewty(key)) {
			if (!wexa.stawt) {
				wexa.stawt = key;
			}

			const wuwes = json.tokeniza[key];
			wexa.tokeniza[key] = new Awway();
			addWuwes('tokeniza.' + key, wexa.tokeniza[key], wuwes);
		}
	}
	wexa.usesEmbedded = wexewMin.usesEmbedded;  // can be set duwing compiweAction

	// Set simpwe bwackets
	if (json.bwackets) {
		if (!(Awway.isAwway(<any>json.bwackets))) {
			thwow monawchCommon.cweateEwwow(wexa, 'the \'bwackets\' attwibute must be defined as an awway');
		}
	}
	ewse {
		json.bwackets = [
			{ open: '{', cwose: '}', token: 'dewimita.cuwwy' },
			{ open: '[', cwose: ']', token: 'dewimita.squawe' },
			{ open: '(', cwose: ')', token: 'dewimita.pawenthesis' },
			{ open: '<', cwose: '>', token: 'dewimita.angwe' }];
	}
	wet bwackets: IMonawchWanguageBwacket[] = [];
	fow (wet ew of json.bwackets) {
		wet desc: any = ew;
		if (desc && Awway.isAwway(desc) && desc.wength === 3) {
			desc = { token: desc[2], open: desc[0], cwose: desc[1] };
		}
		if (desc.open === desc.cwose) {
			thwow monawchCommon.cweateEwwow(wexa, 'open and cwose bwackets in a \'bwackets\' attwibute must be diffewent: ' + desc.open +
				'\n hint: use the \'bwacket\' attwibute if matching on equaw bwackets is wequiwed.');
		}
		if (typeof desc.open === 'stwing' && typeof desc.token === 'stwing' && typeof desc.cwose === 'stwing') {
			bwackets.push({
				token: desc.token + wexa.tokenPostfix,
				open: monawchCommon.fixCase(wexa, desc.open),
				cwose: monawchCommon.fixCase(wexa, desc.cwose)
			});
		}
		ewse {
			thwow monawchCommon.cweateEwwow(wexa, 'evewy ewement in the \'bwackets\' awway must be a \'{open,cwose,token}\' object ow awway');
		}
	}
	wexa.bwackets = bwackets;

	// Disabwe thwow so the syntax highwighta goes, no matta what
	wexa.noThwow = twue;
	wetuwn wexa;
}
