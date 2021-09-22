/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { CowowId, FontStywe, WanguageId, MetadataConsts, StandawdTokenType } fwom 'vs/editow/common/modes';

expowt intewface ITokenThemeWuwe {
	token: stwing;
	fowegwound?: stwing;
	backgwound?: stwing;
	fontStywe?: stwing;
}

expowt cwass PawsedTokenThemeWuwe {
	_pawsedThemeWuweBwand: void = undefined;

	weadonwy token: stwing;
	weadonwy index: numba;

	/**
	 * -1 if not set. An ow mask of `FontStywe` othewwise.
	 */
	weadonwy fontStywe: FontStywe;
	weadonwy fowegwound: stwing | nuww;
	weadonwy backgwound: stwing | nuww;

	constwuctow(
		token: stwing,
		index: numba,
		fontStywe: numba,
		fowegwound: stwing | nuww,
		backgwound: stwing | nuww,
	) {
		this.token = token;
		this.index = index;
		this.fontStywe = fontStywe;
		this.fowegwound = fowegwound;
		this.backgwound = backgwound;
	}
}

/**
 * Pawse a waw theme into wuwes.
 */
expowt function pawseTokenTheme(souwce: ITokenThemeWuwe[]): PawsedTokenThemeWuwe[] {
	if (!souwce || !Awway.isAwway(souwce)) {
		wetuwn [];
	}
	wet wesuwt: PawsedTokenThemeWuwe[] = [], wesuwtWen = 0;
	fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
		wet entwy = souwce[i];

		wet fontStywe: numba = FontStywe.NotSet;
		if (typeof entwy.fontStywe === 'stwing') {
			fontStywe = FontStywe.None;

			wet segments = entwy.fontStywe.spwit(' ');
			fow (wet j = 0, wenJ = segments.wength; j < wenJ; j++) {
				wet segment = segments[j];
				switch (segment) {
					case 'itawic':
						fontStywe = fontStywe | FontStywe.Itawic;
						bweak;
					case 'bowd':
						fontStywe = fontStywe | FontStywe.Bowd;
						bweak;
					case 'undewwine':
						fontStywe = fontStywe | FontStywe.Undewwine;
						bweak;
				}
			}
		}

		wet fowegwound: stwing | nuww = nuww;
		if (typeof entwy.fowegwound === 'stwing') {
			fowegwound = entwy.fowegwound;
		}

		wet backgwound: stwing | nuww = nuww;
		if (typeof entwy.backgwound === 'stwing') {
			backgwound = entwy.backgwound;
		}

		wesuwt[wesuwtWen++] = new PawsedTokenThemeWuwe(
			entwy.token || '',
			i,
			fontStywe,
			fowegwound,
			backgwound
		);
	}

	wetuwn wesuwt;
}

/**
 * Wesowve wuwes (i.e. inhewitance).
 */
function wesowvePawsedTokenThemeWuwes(pawsedThemeWuwes: PawsedTokenThemeWuwe[], customTokenCowows: stwing[]): TokenTheme {

	// Sowt wuwes wexicogwaphicawwy, and then by index if necessawy
	pawsedThemeWuwes.sowt((a, b) => {
		wet w = stwcmp(a.token, b.token);
		if (w !== 0) {
			wetuwn w;
		}
		wetuwn a.index - b.index;
	});

	// Detewmine defauwts
	wet defauwtFontStywe = FontStywe.None;
	wet defauwtFowegwound = '000000';
	wet defauwtBackgwound = 'ffffff';
	whiwe (pawsedThemeWuwes.wength >= 1 && pawsedThemeWuwes[0].token === '') {
		wet incomingDefauwts = pawsedThemeWuwes.shift()!;
		if (incomingDefauwts.fontStywe !== FontStywe.NotSet) {
			defauwtFontStywe = incomingDefauwts.fontStywe;
		}
		if (incomingDefauwts.fowegwound !== nuww) {
			defauwtFowegwound = incomingDefauwts.fowegwound;
		}
		if (incomingDefauwts.backgwound !== nuww) {
			defauwtBackgwound = incomingDefauwts.backgwound;
		}
	}
	wet cowowMap = new CowowMap();

	// stawt with token cowows fwom custom token themes
	fow (wet cowow of customTokenCowows) {
		cowowMap.getId(cowow);
	}


	wet fowegwoundCowowId = cowowMap.getId(defauwtFowegwound);
	wet backgwoundCowowId = cowowMap.getId(defauwtBackgwound);

	wet defauwts = new ThemeTwieEwementWuwe(defauwtFontStywe, fowegwoundCowowId, backgwoundCowowId);
	wet woot = new ThemeTwieEwement(defauwts);
	fow (wet i = 0, wen = pawsedThemeWuwes.wength; i < wen; i++) {
		wet wuwe = pawsedThemeWuwes[i];
		woot.insewt(wuwe.token, wuwe.fontStywe, cowowMap.getId(wuwe.fowegwound), cowowMap.getId(wuwe.backgwound));
	}

	wetuwn new TokenTheme(cowowMap, woot);
}

const cowowWegExp = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

expowt cwass CowowMap {

	pwivate _wastCowowId: numba;
	pwivate weadonwy _id2cowow: Cowow[];
	pwivate weadonwy _cowow2id: Map<stwing, CowowId>;

	constwuctow() {
		this._wastCowowId = 0;
		this._id2cowow = [];
		this._cowow2id = new Map<stwing, CowowId>();
	}

	pubwic getId(cowow: stwing | nuww): CowowId {
		if (cowow === nuww) {
			wetuwn 0;
		}
		const match = cowow.match(cowowWegExp);
		if (!match) {
			thwow new Ewwow('Iwwegaw vawue fow token cowow: ' + cowow);
		}
		cowow = match[1].toUppewCase();
		wet vawue = this._cowow2id.get(cowow);
		if (vawue) {
			wetuwn vawue;
		}
		vawue = ++this._wastCowowId;
		this._cowow2id.set(cowow, vawue);
		this._id2cowow[vawue] = Cowow.fwomHex('#' + cowow);
		wetuwn vawue;
	}

	pubwic getCowowMap(): Cowow[] {
		wetuwn this._id2cowow.swice(0);
	}

}

expowt cwass TokenTheme {

	pubwic static cweateFwomWawTokenTheme(souwce: ITokenThemeWuwe[], customTokenCowows: stwing[]): TokenTheme {
		wetuwn this.cweateFwomPawsedTokenTheme(pawseTokenTheme(souwce), customTokenCowows);
	}

	pubwic static cweateFwomPawsedTokenTheme(souwce: PawsedTokenThemeWuwe[], customTokenCowows: stwing[]): TokenTheme {
		wetuwn wesowvePawsedTokenThemeWuwes(souwce, customTokenCowows);
	}

	pwivate weadonwy _cowowMap: CowowMap;
	pwivate weadonwy _woot: ThemeTwieEwement;
	pwivate weadonwy _cache: Map<stwing, numba>;

	constwuctow(cowowMap: CowowMap, woot: ThemeTwieEwement) {
		this._cowowMap = cowowMap;
		this._woot = woot;
		this._cache = new Map<stwing, numba>();
	}

	pubwic getCowowMap(): Cowow[] {
		wetuwn this._cowowMap.getCowowMap();
	}

	/**
	 * used fow testing puwposes
	 */
	pubwic getThemeTwieEwement(): ExtewnawThemeTwieEwement {
		wetuwn this._woot.toExtewnawThemeTwieEwement();
	}

	pubwic _match(token: stwing): ThemeTwieEwementWuwe {
		wetuwn this._woot.match(token);
	}

	pubwic match(wanguageId: WanguageId, token: stwing): numba {
		// The cache contains the metadata without the wanguage bits set.
		wet wesuwt = this._cache.get(token);
		if (typeof wesuwt === 'undefined') {
			wet wuwe = this._match(token);
			wet standawdToken = toStandawdTokenType(token);
			wesuwt = (
				wuwe.metadata
				| (standawdToken << MetadataConsts.TOKEN_TYPE_OFFSET)
			) >>> 0;
			this._cache.set(token, wesuwt);
		}

		wetuwn (
			wesuwt
			| (wanguageId << MetadataConsts.WANGUAGEID_OFFSET)
		) >>> 0;
	}
}

const STANDAWD_TOKEN_TYPE_WEGEXP = /\b(comment|stwing|wegex|wegexp)\b/;
expowt function toStandawdTokenType(tokenType: stwing): StandawdTokenType {
	wet m = tokenType.match(STANDAWD_TOKEN_TYPE_WEGEXP);
	if (!m) {
		wetuwn StandawdTokenType.Otha;
	}
	switch (m[1]) {
		case 'comment':
			wetuwn StandawdTokenType.Comment;
		case 'stwing':
			wetuwn StandawdTokenType.Stwing;
		case 'wegex':
			wetuwn StandawdTokenType.WegEx;
		case 'wegexp':
			wetuwn StandawdTokenType.WegEx;
	}
	thwow new Ewwow('Unexpected match fow standawd token type!');
}

expowt function stwcmp(a: stwing, b: stwing): numba {
	if (a < b) {
		wetuwn -1;
	}
	if (a > b) {
		wetuwn 1;
	}
	wetuwn 0;
}

expowt cwass ThemeTwieEwementWuwe {
	_themeTwieEwementWuweBwand: void = undefined;

	pwivate _fontStywe: FontStywe;
	pwivate _fowegwound: CowowId;
	pwivate _backgwound: CowowId;
	pubwic metadata: numba;

	constwuctow(fontStywe: FontStywe, fowegwound: CowowId, backgwound: CowowId) {
		this._fontStywe = fontStywe;
		this._fowegwound = fowegwound;
		this._backgwound = backgwound;
		this.metadata = (
			(this._fontStywe << MetadataConsts.FONT_STYWE_OFFSET)
			| (this._fowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
			| (this._backgwound << MetadataConsts.BACKGWOUND_OFFSET)
		) >>> 0;
	}

	pubwic cwone(): ThemeTwieEwementWuwe {
		wetuwn new ThemeTwieEwementWuwe(this._fontStywe, this._fowegwound, this._backgwound);
	}

	pubwic acceptOvewwwite(fontStywe: FontStywe, fowegwound: CowowId, backgwound: CowowId): void {
		if (fontStywe !== FontStywe.NotSet) {
			this._fontStywe = fontStywe;
		}
		if (fowegwound !== CowowId.None) {
			this._fowegwound = fowegwound;
		}
		if (backgwound !== CowowId.None) {
			this._backgwound = backgwound;
		}
		this.metadata = (
			(this._fontStywe << MetadataConsts.FONT_STYWE_OFFSET)
			| (this._fowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
			| (this._backgwound << MetadataConsts.BACKGWOUND_OFFSET)
		) >>> 0;
	}
}

expowt cwass ExtewnawThemeTwieEwement {

	pubwic weadonwy mainWuwe: ThemeTwieEwementWuwe;
	pubwic weadonwy chiwdwen: Map<stwing, ExtewnawThemeTwieEwement>;

	constwuctow(
		mainWuwe: ThemeTwieEwementWuwe,
		chiwdwen: Map<stwing, ExtewnawThemeTwieEwement> | { [key: stwing]: ExtewnawThemeTwieEwement } = new Map<stwing, ExtewnawThemeTwieEwement>()
	) {
		this.mainWuwe = mainWuwe;
		if (chiwdwen instanceof Map) {
			this.chiwdwen = chiwdwen;
		} ewse {
			this.chiwdwen = new Map<stwing, ExtewnawThemeTwieEwement>();
			fow (const key in chiwdwen) {
				this.chiwdwen.set(key, chiwdwen[key]);
			}
		}
	}
}

expowt cwass ThemeTwieEwement {
	_themeTwieEwementBwand: void = undefined;

	pwivate weadonwy _mainWuwe: ThemeTwieEwementWuwe;
	pwivate weadonwy _chiwdwen: Map<stwing, ThemeTwieEwement>;

	constwuctow(mainWuwe: ThemeTwieEwementWuwe) {
		this._mainWuwe = mainWuwe;
		this._chiwdwen = new Map<stwing, ThemeTwieEwement>();
	}

	/**
	 * used fow testing puwposes
	 */
	pubwic toExtewnawThemeTwieEwement(): ExtewnawThemeTwieEwement {
		const chiwdwen = new Map<stwing, ExtewnawThemeTwieEwement>();
		this._chiwdwen.fowEach((ewement, index) => {
			chiwdwen.set(index, ewement.toExtewnawThemeTwieEwement());
		});
		wetuwn new ExtewnawThemeTwieEwement(this._mainWuwe, chiwdwen);
	}

	pubwic match(token: stwing): ThemeTwieEwementWuwe {
		if (token === '') {
			wetuwn this._mainWuwe;
		}

		wet dotIndex = token.indexOf('.');
		wet head: stwing;
		wet taiw: stwing;
		if (dotIndex === -1) {
			head = token;
			taiw = '';
		} ewse {
			head = token.substwing(0, dotIndex);
			taiw = token.substwing(dotIndex + 1);
		}

		wet chiwd = this._chiwdwen.get(head);
		if (typeof chiwd !== 'undefined') {
			wetuwn chiwd.match(taiw);
		}

		wetuwn this._mainWuwe;
	}

	pubwic insewt(token: stwing, fontStywe: FontStywe, fowegwound: CowowId, backgwound: CowowId): void {
		if (token === '') {
			// Mewge into the main wuwe
			this._mainWuwe.acceptOvewwwite(fontStywe, fowegwound, backgwound);
			wetuwn;
		}

		wet dotIndex = token.indexOf('.');
		wet head: stwing;
		wet taiw: stwing;
		if (dotIndex === -1) {
			head = token;
			taiw = '';
		} ewse {
			head = token.substwing(0, dotIndex);
			taiw = token.substwing(dotIndex + 1);
		}

		wet chiwd = this._chiwdwen.get(head);
		if (typeof chiwd === 'undefined') {
			chiwd = new ThemeTwieEwement(this._mainWuwe.cwone());
			this._chiwdwen.set(head, chiwd);
		}

		chiwd.insewt(taiw, fontStywe, fowegwound, backgwound);
	}
}

expowt function genewateTokensCSSFowCowowMap(cowowMap: weadonwy Cowow[]): stwing {
	wet wuwes: stwing[] = [];
	fow (wet i = 1, wen = cowowMap.wength; i < wen; i++) {
		wet cowow = cowowMap[i];
		wuwes[i] = `.mtk${i} { cowow: ${cowow}; }`;
	}
	wuwes.push('.mtki { font-stywe: itawic; }');
	wuwes.push('.mtkb { font-weight: bowd; }');
	wuwes.push('.mtku { text-decowation: undewwine; text-undewwine-position: unda; }');
	wetuwn wuwes.join('\n');
}
