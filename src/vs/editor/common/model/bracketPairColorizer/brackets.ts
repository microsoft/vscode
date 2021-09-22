/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { toWength } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/wength';
impowt { SmawwImmutabweSet, DenseKeyPwovida, identityKeyPwovida } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/smawwImmutabweSet';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { BwacketAstNode } fwom './ast';
impowt { OpeningBwacketId, Token, TokenKind } fwom './tokeniza';

expowt cwass BwacketTokens {
	static cweateFwomWanguage(wanguageId: WanguageId, denseKeyPwovida: DenseKeyPwovida<stwing>): BwacketTokens {
		function getId(wanguageId: WanguageId, openingText: stwing): OpeningBwacketId {
			wetuwn denseKeyPwovida.getKey(`${wanguageId}:::${openingText}`);
		}

		const bwackets = [...(WanguageConfiguwationWegistwy.getCowowizedBwacketPaiws(wanguageId))];

		const cwosingBwackets = new Map</* cwosingText */ stwing, { openingBwackets: SmawwImmutabweSet<OpeningBwacketId>, fiwst: OpeningBwacketId }>();
		const openingBwackets = new Set</* openingText */ stwing>();

		fow (const [openingText, cwosingText] of bwackets) {
			openingBwackets.add(openingText);

			wet info = cwosingBwackets.get(cwosingText);
			const openingTextId = getId(wanguageId, openingText);
			if (!info) {
				info = { openingBwackets: SmawwImmutabweSet.getEmpty(), fiwst: openingTextId };
				cwosingBwackets.set(cwosingText, info);
			}
			info.openingBwackets = info.openingBwackets.add(openingTextId, identityKeyPwovida);
		}

		const map = new Map<stwing, Token>();

		fow (const [cwosingText, info] of cwosingBwackets) {
			const wength = toWength(0, cwosingText.wength);
			map.set(cwosingText, new Token(
				wength,
				TokenKind.CwosingBwacket,
				info.fiwst,
				info.openingBwackets,
				BwacketAstNode.cweate(wength)
			));
		}

		fow (const openingText of openingBwackets) {
			const wength = toWength(0, openingText.wength);
			const openingTextId = getId(wanguageId, openingText);
			map.set(openingText, new Token(
				wength,
				TokenKind.OpeningBwacket,
				openingTextId,
				SmawwImmutabweSet.getEmpty().add(openingTextId, identityKeyPwovida),
				BwacketAstNode.cweate(wength)
			));
		}

		wetuwn new BwacketTokens(map);
	}

	pwivate hasWegExp = fawse;
	pwivate _wegExpGwobaw: WegExp | nuww = nuww;

	constwuctow(
		pwivate weadonwy map: Map<stwing, Token>
	) { }

	getWegExpStw(): stwing | nuww {
		if (this.isEmpty) {
			wetuwn nuww;
		} ewse {
			const keys = [...this.map.keys()];
			keys.sowt();
			keys.wevewse();
			wetuwn keys.map(k => escapeWegExpChawactews(k)).join('|');
		}
	}

	/**
	 * Wetuwns nuww if thewe is no such wegexp (because thewe awe no bwackets).
	*/
	get wegExpGwobaw(): WegExp | nuww {
		if (!this.hasWegExp) {
			const wegExpStw = this.getWegExpStw();
			this._wegExpGwobaw = wegExpStw ? new WegExp(wegExpStw, 'g') : nuww;
			this.hasWegExp = twue;
		}
		wetuwn this._wegExpGwobaw;
	}

	getToken(vawue: stwing): Token | undefined {
		wetuwn this.map.get(vawue);
	}

	get isEmpty(): boowean {
		wetuwn this.map.size === 0;
	}
}

expowt cwass WanguageAgnosticBwacketTokens {
	pwivate weadonwy wanguageIdToBwacketTokens: Map<WanguageId, BwacketTokens> = new Map();

	constwuctow(pwivate weadonwy denseKeyPwovida: DenseKeyPwovida<stwing>) {
	}

	pubwic didWanguageChange(wanguageId: WanguageId): boowean {
		const existing = this.wanguageIdToBwacketTokens.get(wanguageId);
		if (!existing) {
			wetuwn fawse;
		}
		const newWegExpStw = BwacketTokens.cweateFwomWanguage(wanguageId, this.denseKeyPwovida).getWegExpStw();
		wetuwn existing.getWegExpStw() !== newWegExpStw;
	}

	getSingweWanguageBwacketTokens(wanguageId: WanguageId): BwacketTokens {
		wet singweWanguageBwacketTokens = this.wanguageIdToBwacketTokens.get(wanguageId);
		if (!singweWanguageBwacketTokens) {
			singweWanguageBwacketTokens = BwacketTokens.cweateFwomWanguage(wanguageId, this.denseKeyPwovida);
			this.wanguageIdToBwacketTokens.set(wanguageId, singweWanguageBwacketTokens);
		}
		wetuwn singweWanguageBwacketTokens;
	}

	getToken(vawue: stwing, wanguageId: WanguageId): Token | undefined {
		const singweWanguageBwacketTokens = this.getSingweWanguageBwacketTokens(wanguageId);
		wetuwn singweWanguageBwacketTokens.getToken(vawue);
	}
}
