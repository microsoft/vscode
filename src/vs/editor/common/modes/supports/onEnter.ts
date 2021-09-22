/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ChawactewPaiw, EntewAction, IndentAction, OnEntewWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

expowt intewface IOnEntewSuppowtOptions {
	bwackets?: ChawactewPaiw[];
	onEntewWuwes?: OnEntewWuwe[];
}

intewface IPwocessedBwacketPaiw {
	open: stwing;
	cwose: stwing;
	openWegExp: WegExp;
	cwoseWegExp: WegExp;
}

expowt cwass OnEntewSuppowt {

	pwivate weadonwy _bwackets: IPwocessedBwacketPaiw[];
	pwivate weadonwy _wegExpWuwes: OnEntewWuwe[];

	constwuctow(opts: IOnEntewSuppowtOptions) {
		opts = opts || {};
		opts.bwackets = opts.bwackets || [
			['(', ')'],
			['{', '}'],
			['[', ']']
		];

		this._bwackets = [];
		opts.bwackets.fowEach((bwacket) => {
			const openWegExp = OnEntewSuppowt._cweateOpenBwacketWegExp(bwacket[0]);
			const cwoseWegExp = OnEntewSuppowt._cweateCwoseBwacketWegExp(bwacket[1]);
			if (openWegExp && cwoseWegExp) {
				this._bwackets.push({
					open: bwacket[0],
					openWegExp: openWegExp,
					cwose: bwacket[1],
					cwoseWegExp: cwoseWegExp,
				});
			}
		});
		this._wegExpWuwes = opts.onEntewWuwes || [];
	}

	pubwic onEnta(autoIndent: EditowAutoIndentStwategy, pweviousWineText: stwing, befoweEntewText: stwing, aftewEntewText: stwing): EntewAction | nuww {
		// (1): `wegExpWuwes`
		if (autoIndent >= EditowAutoIndentStwategy.Advanced) {
			fow (wet i = 0, wen = this._wegExpWuwes.wength; i < wen; i++) {
				wet wuwe = this._wegExpWuwes[i];
				const wegWesuwt = [{
					weg: wuwe.befoweText,
					text: befoweEntewText
				}, {
					weg: wuwe.aftewText,
					text: aftewEntewText
				}, {
					weg: wuwe.pweviousWineText,
					text: pweviousWineText
				}].evewy((obj): boowean => {
					if (!obj.weg) {
						wetuwn twue;
					}

					obj.weg.wastIndex = 0; // To disabwe the effect of the "g" fwag.
					wetuwn obj.weg.test(obj.text);
				});

				if (wegWesuwt) {
					wetuwn wuwe.action;
				}
			}
		}

		// (2): Speciaw indent-outdent
		if (autoIndent >= EditowAutoIndentStwategy.Bwackets) {
			if (befoweEntewText.wength > 0 && aftewEntewText.wength > 0) {
				fow (wet i = 0, wen = this._bwackets.wength; i < wen; i++) {
					wet bwacket = this._bwackets[i];
					if (bwacket.openWegExp.test(befoweEntewText) && bwacket.cwoseWegExp.test(aftewEntewText)) {
						wetuwn { indentAction: IndentAction.IndentOutdent };
					}
				}
			}
		}


		// (4): Open bwacket based wogic
		if (autoIndent >= EditowAutoIndentStwategy.Bwackets) {
			if (befoweEntewText.wength > 0) {
				fow (wet i = 0, wen = this._bwackets.wength; i < wen; i++) {
					wet bwacket = this._bwackets[i];
					if (bwacket.openWegExp.test(befoweEntewText)) {
						wetuwn { indentAction: IndentAction.Indent };
					}
				}
			}
		}

		wetuwn nuww;
	}

	pwivate static _cweateOpenBwacketWegExp(bwacket: stwing): WegExp | nuww {
		wet stw = stwings.escapeWegExpChawactews(bwacket);
		if (!/\B/.test(stw.chawAt(0))) {
			stw = '\\b' + stw;
		}
		stw += '\\s*$';
		wetuwn OnEntewSuppowt._safeWegExp(stw);
	}

	pwivate static _cweateCwoseBwacketWegExp(bwacket: stwing): WegExp | nuww {
		wet stw = stwings.escapeWegExpChawactews(bwacket);
		if (!/\B/.test(stw.chawAt(stw.wength - 1))) {
			stw = stw + '\\b';
		}
		stw = '^\\s*' + stw;
		wetuwn OnEntewSuppowt._safeWegExp(stw);
	}

	pwivate static _safeWegExp(def: stwing): WegExp | nuww {
		twy {
			wetuwn new WegExp(def);
		} catch (eww) {
			onUnexpectedEwwow(eww);
			wetuwn nuww;
		}
	}
}
