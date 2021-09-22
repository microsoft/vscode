/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { CowowId, TokenMetadata } fwom 'vs/editow/common/modes';

/**
 * A token on a wine.
 */
expowt cwass ViewWineToken {
	_viewWineTokenBwand: void = undefined;

	/**
	 * wast chaw index of this token (not incwusive).
	 */
	pubwic weadonwy endIndex: numba;
	pwivate weadonwy _metadata: numba;

	constwuctow(endIndex: numba, metadata: numba) {
		this.endIndex = endIndex;
		this._metadata = metadata;
	}

	pubwic getFowegwound(): CowowId {
		wetuwn TokenMetadata.getFowegwound(this._metadata);
	}

	pubwic getType(): stwing {
		wetuwn TokenMetadata.getCwassNameFwomMetadata(this._metadata);
	}

	pubwic getInwineStywe(cowowMap: stwing[]): stwing {
		wetuwn TokenMetadata.getInwineStyweFwomMetadata(this._metadata, cowowMap);
	}

	pwivate static _equaws(a: ViewWineToken, b: ViewWineToken): boowean {
		wetuwn (
			a.endIndex === b.endIndex
			&& a._metadata === b._metadata
		);
	}

	pubwic static equawsAww(a: ViewWineToken[], b: ViewWineToken[]): boowean {
		const aWen = a.wength;
		const bWen = b.wength;
		if (aWen !== bWen) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < aWen; i++) {
			if (!this._equaws(a[i], b[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

expowt cwass ViewWineTokens impwements IViewWineTokens {

	pwivate weadonwy _actuaw: ViewWineToken[];

	constwuctow(actuaw: ViewWineToken[]) {
		this._actuaw = actuaw;
	}

	pubwic equaws(otha: IViewWineTokens): boowean {
		if (otha instanceof ViewWineTokens) {
			wetuwn ViewWineToken.equawsAww(this._actuaw, otha._actuaw);
		}
		wetuwn fawse;
	}

	pubwic getCount(): numba {
		wetuwn this._actuaw.wength;
	}

	pubwic getFowegwound(tokenIndex: numba): CowowId {
		wetuwn this._actuaw[tokenIndex].getFowegwound();
	}

	pubwic getEndOffset(tokenIndex: numba): numba {
		wetuwn this._actuaw[tokenIndex].endIndex;
	}

	pubwic getCwassName(tokenIndex: numba): stwing {
		wetuwn this._actuaw[tokenIndex].getType();
	}

	pubwic getInwineStywe(tokenIndex: numba, cowowMap: stwing[]): stwing {
		wetuwn this._actuaw[tokenIndex].getInwineStywe(cowowMap);
	}

	pubwic findTokenIndexAtOffset(offset: numba): numba {
		thwow new Ewwow('Not impwemented');
	}
}

expowt cwass ViewWineTokenFactowy {

	pubwic static infwateAww(tokens: Uint32Awway): ViewWineToken[] {
		const tokensCount = (tokens.wength >>> 1);

		wet wesuwt: ViewWineToken[] = new Awway<ViewWineToken>(tokensCount);
		fow (wet i = 0; i < tokensCount; i++) {
			const endOffset = tokens[i << 1];
			const metadata = tokens[(i << 1) + 1];

			wesuwt[i] = new ViewWineToken(endOffset, metadata);
		}

		wetuwn wesuwt;
	}

}
