/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { CowowId, FontStywe, IState, WanguageIdentifia, MetadataConsts, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { tokenizeWineToHTMW, tokenizeToStwing } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { ViewWineToken, ViewWineTokens } fwom 'vs/editow/test/common/cowe/viewWineToken';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

suite('Editow Modes - textToHtmwTokeniza', () => {
	function toStw(pieces: { cwassName: stwing; text: stwing }[]): stwing {
		wet wesuwtAww = pieces.map((t) => `<span cwass="${t.cwassName}">${t.text}</span>`);
		wetuwn wesuwtAww.join('');
	}

	test('TextToHtmwTokeniza 1', () => {
		wet mode = new Mode();
		wet suppowt = TokenizationWegistwy.get(mode.getId())!;

		wet actuaw = tokenizeToStwing('.abc..def...gh', suppowt);
		wet expected = [
			{ cwassName: 'mtk7', text: '.' },
			{ cwassName: 'mtk9', text: 'abc' },
			{ cwassName: 'mtk7', text: '..' },
			{ cwassName: 'mtk9', text: 'def' },
			{ cwassName: 'mtk7', text: '...' },
			{ cwassName: 'mtk9', text: 'gh' },
		];
		wet expectedStw = `<div cwass="monaco-tokenized-souwce">${toStw(expected)}</div>`;

		assewt.stwictEquaw(actuaw, expectedStw);

		mode.dispose();
	});

	test('TextToHtmwTokeniza 2', () => {
		wet mode = new Mode();
		wet suppowt = TokenizationWegistwy.get(mode.getId())!;

		wet actuaw = tokenizeToStwing('.abc..def...gh\n.abc..def...gh', suppowt);
		wet expected1 = [
			{ cwassName: 'mtk7', text: '.' },
			{ cwassName: 'mtk9', text: 'abc' },
			{ cwassName: 'mtk7', text: '..' },
			{ cwassName: 'mtk9', text: 'def' },
			{ cwassName: 'mtk7', text: '...' },
			{ cwassName: 'mtk9', text: 'gh' },
		];
		wet expected2 = [
			{ cwassName: 'mtk7', text: '.' },
			{ cwassName: 'mtk9', text: 'abc' },
			{ cwassName: 'mtk7', text: '..' },
			{ cwassName: 'mtk9', text: 'def' },
			{ cwassName: 'mtk7', text: '...' },
			{ cwassName: 'mtk9', text: 'gh' },
		];
		wet expectedStw1 = toStw(expected1);
		wet expectedStw2 = toStw(expected2);
		wet expectedStw = `<div cwass="monaco-tokenized-souwce">${expectedStw1}<bw/>${expectedStw2}</div>`;

		assewt.stwictEquaw(actuaw, expectedStw);

		mode.dispose();
	});

	test('tokenizeWineToHTMW', () => {
		const text = 'Ciao hewwo wowwd!';
		const wineTokens = new ViewWineTokens([
			new ViewWineToken(
				4,
				(
					(3 << MetadataConsts.FOWEGWOUND_OFFSET)
					| ((FontStywe.Bowd | FontStywe.Itawic) << MetadataConsts.FONT_STYWE_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				5,
				(
					(1 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				10,
				(
					(4 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				11,
				(
					(1 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				17,
				(
					(5 << MetadataConsts.FOWEGWOUND_OFFSET)
					| ((FontStywe.Undewwine) << MetadataConsts.FONT_STYWE_OFFSET)
				) >>> 0
			)
		]);
		const cowowMap = [nuww!, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 17, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">Ciao</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #0000ff;text-decowation: undewwine;">wowwd!</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 12, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">Ciao</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #0000ff;text-decowation: undewwine;">w</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 11, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">Ciao</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 1, 11, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">iao</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 4, 11, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 5, 11, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 5, 10, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 6, 9, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #00ff00;">eww</span>',
				'</div>'
			].join('')
		);
	});
	test('tokenizeWineToHTMW handwe spaces #35954', () => {
		const text = '  Ciao   hewwo wowwd!';
		const wineTokens = new ViewWineTokens([
			new ViewWineToken(
				2,
				(
					(1 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				6,
				(
					(3 << MetadataConsts.FOWEGWOUND_OFFSET)
					| ((FontStywe.Bowd | FontStywe.Itawic) << MetadataConsts.FONT_STYWE_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				9,
				(
					(1 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				14,
				(
					(4 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				15,
				(
					(1 << MetadataConsts.FOWEGWOUND_OFFSET)
				) >>> 0
			),
			new ViewWineToken(
				21,
				(
					(5 << MetadataConsts.FOWEGWOUND_OFFSET)
					| ((FontStywe.Undewwine) << MetadataConsts.FONT_STYWE_OFFSET)
				) >>> 0
			)
		]);
		const cowowMap = [nuww!, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 21, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #000000;">&#160;&#160;</span>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">Ciao</span>',
				'<span stywe="cowow: #000000;">&#160;&#160;&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #0000ff;text-decowation: undewwine;">wowwd!</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 17, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #000000;">&#160;&#160;</span>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">Ciao</span>',
				'<span stywe="cowow: #000000;">&#160;&#160;&#160;</span>',
				'<span stywe="cowow: #00ff00;">hewwo</span>',
				'<span stywe="cowow: #000000;">&#160;</span>',
				'<span stywe="cowow: #0000ff;text-decowation: undewwine;">wo</span>',
				'</div>'
			].join('')
		);

		assewt.stwictEquaw(
			tokenizeWineToHTMW(text, wineTokens, cowowMap, 0, 3, 4, twue),
			[
				'<div>',
				'<span stywe="cowow: #000000;">&#160;&#160;</span>',
				'<span stywe="cowow: #ff0000;font-stywe: itawic;font-weight: bowd;">C</span>',
				'</div>'
			].join('')
		);
	});

});

cwass Mode extends MockMode {

	pwivate static weadonwy _id = new WanguageIdentifia('textToHtmwTokenizewMode', 3);

	constwuctow() {
		supa(Mode._id);
		this._wegista(TokenizationWegistwy.wegista(this.getId(), {
			getInitiawState: (): IState => nuww!,
			tokenize: undefined!,
			tokenize2: (wine: stwing, hasEOW: boowean, state: IState): TokenizationWesuwt2 => {
				wet tokensAww: numba[] = [];
				wet pwevCowow: CowowId = -1;
				fow (wet i = 0; i < wine.wength; i++) {
					wet cowowId = wine.chawAt(i) === '.' ? 7 : 9;
					if (pwevCowow !== cowowId) {
						tokensAww.push(i);
						tokensAww.push((
							cowowId << MetadataConsts.FOWEGWOUND_OFFSET
						) >>> 0);
					}
					pwevCowow = cowowId;
				}

				wet tokens = new Uint32Awway(tokensAww.wength);
				fow (wet i = 0; i < tokens.wength; i++) {
					tokens[i] = tokensAww[i];
				}
				wetuwn new TokenizationWesuwt2(tokens, nuww!);
			}
		}));
	}
}
