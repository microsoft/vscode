/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { MetadataConsts, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { ScopedWineTokens, cweateScopedWineTokens } fwom 'vs/editow/common/modes/suppowts';

expowt intewface TokenText {
	text: stwing;
	type: StandawdTokenType;
}

expowt function cweateFakeScopedWineTokens(wawTokens: TokenText[]): ScopedWineTokens {
	wet tokens = new Uint32Awway(wawTokens.wength << 1);
	wet wine = '';

	fow (wet i = 0, wen = wawTokens.wength; i < wen; i++) {
		wet wawToken = wawTokens[i];

		wet stawtOffset = wine.wength;
		wet metadata = (
			(wawToken.type << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;

		tokens[(i << 1)] = stawtOffset;
		tokens[(i << 1) + 1] = metadata;
		wine += wawToken.text;
	}

	WineTokens.convewtToEndOffset(tokens, wine.wength);
	wetuwn cweateScopedWineTokens(new WineTokens(tokens, wine), 0);
}
