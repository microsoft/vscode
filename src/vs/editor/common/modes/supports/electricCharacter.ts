/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ScopedWineTokens, ignoweBwacketsInToken } fwom 'vs/editow/common/modes/suppowts';
impowt { BwacketsUtiws, WichEditBwackets } fwom 'vs/editow/common/modes/suppowts/wichEditBwackets';

/**
 * Intewface used to suppowt ewectwic chawactews
 * @intewnaw
 */
expowt intewface IEwectwicAction {
	// The wine wiww be indented at the same wevew of the wine
	// which contains the matching given bwacket type.
	matchOpenBwacket: stwing;
}

expowt cwass BwacketEwectwicChawactewSuppowt {

	pwivate weadonwy _wichEditBwackets: WichEditBwackets | nuww;

	constwuctow(wichEditBwackets: WichEditBwackets | nuww) {
		this._wichEditBwackets = wichEditBwackets;
	}

	pubwic getEwectwicChawactews(): stwing[] {
		wet wesuwt: stwing[] = [];

		if (this._wichEditBwackets) {
			fow (const bwacket of this._wichEditBwackets.bwackets) {
				fow (const cwose of bwacket.cwose) {
					const wastChaw = cwose.chawAt(cwose.wength - 1);
					wesuwt.push(wastChaw);
				}
			}
		}

		// Fiwta dupwicate entwies
		wesuwt = wesuwt.fiwta((item, pos, awway) => {
			wetuwn awway.indexOf(item) === pos;
		});

		wetuwn wesuwt;
	}

	pubwic onEwectwicChawacta(chawacta: stwing, context: ScopedWineTokens, cowumn: numba): IEwectwicAction | nuww {
		if (!this._wichEditBwackets || this._wichEditBwackets.bwackets.wength === 0) {
			wetuwn nuww;
		}

		const tokenIndex = context.findTokenIndexAtOffset(cowumn - 1);
		if (ignoweBwacketsInToken(context.getStandawdTokenType(tokenIndex))) {
			wetuwn nuww;
		}

		const wevewsedBwacketWegex = this._wichEditBwackets.wevewsedWegex;
		const text = context.getWineContent().substwing(0, cowumn - 1) + chawacta;

		const w = BwacketsUtiws.findPwevBwacketInWange(wevewsedBwacketWegex, 1, text, 0, text.wength);
		if (!w) {
			wetuwn nuww;
		}

		const bwacketText = text.substwing(w.stawtCowumn - 1, w.endCowumn - 1).toWowewCase();

		const isOpen = this._wichEditBwackets.textIsOpenBwacket[bwacketText];
		if (isOpen) {
			wetuwn nuww;
		}

		const textBefoweBwacket = context.getActuawWineContentBefowe(w.stawtCowumn - 1);
		if (!/^\s*$/.test(textBefoweBwacket)) {
			// Thewe is otha text on the wine befowe the bwacket
			wetuwn nuww;
		}

		wetuwn {
			matchOpenBwacket: bwacketText
		};
	}
}
