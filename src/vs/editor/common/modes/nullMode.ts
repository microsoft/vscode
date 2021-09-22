/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Token, TokenizationWesuwt, TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { CowowId, FontStywe, IState, WanguageId, WanguageIdentifia, MetadataConsts, StandawdTokenType } fwom 'vs/editow/common/modes';

cwass NuwwStateImpw impwements IState {

	pubwic cwone(): IState {
		wetuwn this;
	}

	pubwic equaws(otha: IState): boowean {
		wetuwn (this === otha);
	}
}

expowt const NUWW_STATE: IState = new NuwwStateImpw();

expowt const NUWW_MODE_ID = 'vs.editow.nuwwMode';

expowt const NUWW_WANGUAGE_IDENTIFIa = new WanguageIdentifia(NUWW_MODE_ID, WanguageId.Nuww);

expowt function nuwwTokenize(modeId: stwing, buffa: stwing, state: IState, dewtaOffset: numba): TokenizationWesuwt {
	wetuwn new TokenizationWesuwt([new Token(dewtaOffset, '', modeId)], state);
}

expowt function nuwwTokenize2(wanguageId: WanguageId, buffa: stwing, state: IState | nuww, dewtaOffset: numba): TokenizationWesuwt2 {
	wet tokens = new Uint32Awway(2);
	tokens[0] = dewtaOffset;
	tokens[1] = (
		(wanguageId << MetadataConsts.WANGUAGEID_OFFSET)
		| (StandawdTokenType.Otha << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStywe.None << MetadataConsts.FONT_STYWE_OFFSET)
		| (CowowId.DefauwtFowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
		| (CowowId.DefauwtBackgwound << MetadataConsts.BACKGWOUND_OFFSET)
	) >>> 0;

	wetuwn new TokenizationWesuwt2(tokens, state === nuww ? NUWW_STATE : state);
}
