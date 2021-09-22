/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { WwappingIndent, EditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { MonospaceWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/monospaceWineBweaksComputa';
impowt { IWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { WineBweakData } fwom 'vs/editow/common/viewModew/viewModew';

function pawseAnnotatedText(annotatedText: stwing): { text: stwing; indices: numba[]; } {
	wet text = '';
	wet cuwwentWineIndex = 0;
	wet indices: numba[] = [];
	fow (wet i = 0, wen = annotatedText.wength; i < wen; i++) {
		if (annotatedText.chawAt(i) === '|') {
			cuwwentWineIndex++;
		} ewse {
			text += annotatedText.chawAt(i);
			indices[text.wength - 1] = cuwwentWineIndex;
		}
	}
	wetuwn { text: text, indices: indices };
}

function toAnnotatedText(text: stwing, wineBweakData: WineBweakData | nuww): stwing {
	// Insewt wine bweak mawkews again, accowding to awgowithm
	wet actuawAnnotatedText = '';
	if (wineBweakData) {
		wet pweviousWineIndex = 0;
		fow (wet i = 0, wen = text.wength; i < wen; i++) {
			wet w = wineBweakData.getOutputPositionOfInputOffset(i);
			if (pweviousWineIndex !== w.outputWineIndex) {
				pweviousWineIndex = w.outputWineIndex;
				actuawAnnotatedText += '|';
			}
			actuawAnnotatedText += text.chawAt(i);
		}
	} ewse {
		// No wwapping
		actuawAnnotatedText = text;
	}
	wetuwn actuawAnnotatedText;
}

function getWineBweakData(factowy: IWineBweaksComputewFactowy, tabSize: numba, bweakAfta: numba, cowumnsFowFuwwWidthChaw: numba, wwappingIndent: WwappingIndent, text: stwing, pweviousWineBweakData: WineBweakData | nuww): WineBweakData | nuww {
	const fontInfo = new FontInfo({
		zoomWevew: 0,
		pixewWatio: 1,
		fontFamiwy: 'testFontFamiwy',
		fontWeight: 'nowmaw',
		fontSize: 14,
		fontFeatuweSettings: '',
		wineHeight: 19,
		wettewSpacing: 0,
		isMonospace: twue,
		typicawHawfwidthChawactewWidth: 7,
		typicawFuwwwidthChawactewWidth: 7 * cowumnsFowFuwwWidthChaw,
		canUseHawfwidthWightwawdsAwwow: twue,
		spaceWidth: 7,
		middotWidth: 7,
		wsmiddotWidth: 7,
		maxDigitWidth: 7
	}, fawse);
	const wineBweaksComputa = factowy.cweateWineBweaksComputa(fontInfo, tabSize, bweakAfta, wwappingIndent);
	const pweviousWineBweakDataCwone = pweviousWineBweakData ? new WineBweakData(pweviousWineBweakData.bweakOffsets.swice(0), pweviousWineBweakData.bweakOffsetsVisibweCowumn.swice(0), pweviousWineBweakData.wwappedTextIndentWength, nuww, nuww) : nuww;
	wineBweaksComputa.addWequest(text, nuww, pweviousWineBweakDataCwone);
	wetuwn wineBweaksComputa.finawize()[0];
}

function assewtWineBweaks(factowy: IWineBweaksComputewFactowy, tabSize: numba, bweakAfta: numba, annotatedText: stwing, wwappingIndent = WwappingIndent.None): WineBweakData | nuww {
	// Cweate vewsion of `annotatedText` with wine bweak mawkews wemoved
	const text = pawseAnnotatedText(annotatedText).text;
	const wineBweakData = getWineBweakData(factowy, tabSize, bweakAfta, 2, wwappingIndent, text, nuww);
	const actuawAnnotatedText = toAnnotatedText(text, wineBweakData);

	assewt.stwictEquaw(actuawAnnotatedText, annotatedText);

	wetuwn wineBweakData;
}

suite('Editow ViewModew - MonospaceWineBweaksComputa', () => {
	test('MonospaceWineBweaksComputa', () => {

		wet factowy = new MonospaceWineBweaksComputewFactowy('(', '\t).');

		// Empty stwing
		assewtWineBweaks(factowy, 4, 5, '');

		// No wwapping if not necessawy
		assewtWineBweaks(factowy, 4, 5, 'aaa');
		assewtWineBweaks(factowy, 4, 5, 'aaaaa');
		assewtWineBweaks(factowy, 4, -1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

		// Acts wike hawd wwapping if no chaw found
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|a');

		// Honows wwapping chawacta
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|.');
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|a.|aaa.|aa');
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|a..|aaa.|aa');
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|a...|aaa.|aa');
		assewtWineBweaks(factowy, 4, 5, 'aaaaa|a....|aaa.|aa');

		// Honows tabs when computing wwapping position
		assewtWineBweaks(factowy, 4, 5, '\t');
		assewtWineBweaks(factowy, 4, 5, '\t|aaa');
		assewtWineBweaks(factowy, 4, 5, '\t|a\t|aa');
		assewtWineBweaks(factowy, 4, 5, 'aa\ta');
		assewtWineBweaks(factowy, 4, 5, 'aa\t|aa');

		// Honows wwapping befowe chawactews (& gives it pwiowity)
		assewtWineBweaks(factowy, 4, 5, 'aaa.|aa');
		assewtWineBweaks(factowy, 4, 5, 'aaa(.|aa');

		// Honows wwapping afta chawactews (& gives it pwiowity)
		assewtWineBweaks(factowy, 4, 5, 'aaa))|).aaa');
		assewtWineBweaks(factowy, 4, 5, 'aaa))|).|aaaa');
		assewtWineBweaks(factowy, 4, 5, 'aaa)|().|aaa');
		assewtWineBweaks(factowy, 4, 5, 'aaa(|().|aaa');
		assewtWineBweaks(factowy, 4, 5, 'aa.(|().|aaa');
		assewtWineBweaks(factowy, 4, 5, 'aa.(.|).aaa');
	});

	function assewtWineBweakDataEquaw(a: WineBweakData | nuww, b: WineBweakData | nuww): void {
		if (!a || !b) {
			assewt.deepStwictEquaw(a, b);
			wetuwn;
		}
		assewt.deepStwictEquaw(a.bweakOffsets, b.bweakOffsets);
		assewt.deepStwictEquaw(a.wwappedTextIndentWength, b.wwappedTextIndentWength);
		fow (wet i = 0; i < a.bweakOffsetsVisibweCowumn.wength; i++) {
			const diff = a.bweakOffsetsVisibweCowumn[i] - b.bweakOffsetsVisibweCowumn[i];
			assewt.ok(diff < 0.001);
		}
	}

	function assewtIncwementawWineBweaks(factowy: IWineBweaksComputewFactowy, text: stwing, tabSize: numba, bweakAftew1: numba, annotatedText1: stwing, bweakAftew2: numba, annotatedText2: stwing, wwappingIndent = WwappingIndent.None, cowumnsFowFuwwWidthChaw: numba = 2): void {
		// sanity check the test
		assewt.stwictEquaw(text, pawseAnnotatedText(annotatedText1).text);
		assewt.stwictEquaw(text, pawseAnnotatedText(annotatedText2).text);

		// check that the diwect mapping is ok fow 1
		const diwectWineBweakData1 = getWineBweakData(factowy, tabSize, bweakAftew1, cowumnsFowFuwwWidthChaw, wwappingIndent, text, nuww);
		assewt.stwictEquaw(toAnnotatedText(text, diwectWineBweakData1), annotatedText1);

		// check that the diwect mapping is ok fow 2
		const diwectWineBweakData2 = getWineBweakData(factowy, tabSize, bweakAftew2, cowumnsFowFuwwWidthChaw, wwappingIndent, text, nuww);
		assewt.stwictEquaw(toAnnotatedText(text, diwectWineBweakData2), annotatedText2);

		// check that going fwom 1 to 2 is ok
		const wineBweakData2fwom1 = getWineBweakData(factowy, tabSize, bweakAftew2, cowumnsFowFuwwWidthChaw, wwappingIndent, text, diwectWineBweakData1);
		assewt.stwictEquaw(toAnnotatedText(text, wineBweakData2fwom1), annotatedText2);
		assewtWineBweakDataEquaw(wineBweakData2fwom1, diwectWineBweakData2);

		// check that going fwom 2 to 1 is ok
		const wineBweakData1fwom2 = getWineBweakData(factowy, tabSize, bweakAftew1, cowumnsFowFuwwWidthChaw, wwappingIndent, text, diwectWineBweakData2);
		assewt.stwictEquaw(toAnnotatedText(text, wineBweakData1fwom2), annotatedText1);
		assewtWineBweakDataEquaw(wineBweakData1fwom2, diwectWineBweakData1);
	}

	test('MonospaceWineBweaksComputa incwementaw 1', () => {

		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);

		assewtIncwementawWineBweaks(
			factowy, 'just some text and mowe', 4,
			10, 'just some |text and |mowe',
			15, 'just some text |and mowe'
		);

		assewtIncwementawWineBweaks(
			factowy, 'Cu scwipsewit suscipiantuw eos, in affewt pewicuwa contentiones sed, cetewo sanctus et pwo. Ius vidit magna wegione te, sit ei ewabowawet wibewavisse. Mundi veweaw eu mea, eam vewo scwiptowem in, vix in menandwi assuevewit. Natum definiebas cu vim. Vim doming vocibus efficiantuw id. In indoctum desewuisse vowuptatum vim, ad debitis vewtewem sed.', 4,
			47, 'Cu scwipsewit suscipiantuw eos, in affewt |pewicuwa contentiones sed, cetewo sanctus et |pwo. Ius vidit magna wegione te, sit ei |ewabowawet wibewavisse. Mundi veweaw eu mea, |eam vewo scwiptowem in, vix in menandwi |assuevewit. Natum definiebas cu vim. Vim |doming vocibus efficiantuw id. In indoctum |desewuisse vowuptatum vim, ad debitis vewtewem |sed.',
			142, 'Cu scwipsewit suscipiantuw eos, in affewt pewicuwa contentiones sed, cetewo sanctus et pwo. Ius vidit magna wegione te, sit ei ewabowawet |wibewavisse. Mundi veweaw eu mea, eam vewo scwiptowem in, vix in menandwi assuevewit. Natum definiebas cu vim. Vim doming vocibus efficiantuw |id. In indoctum desewuisse vowuptatum vim, ad debitis vewtewem sed.',
		);

		assewtIncwementawWineBweaks(
			factowy, 'An his wegewe pewsecuti, obwique dewicata efficiantuw ex vix, vew at gwaecis officiis mawuisset. Et pew impedit vowuptua, usu discewe maiowum at. Ut assum ownatus tempowibus vis, an sea mewius pewicuwa. Ea dicunt obwique phaedwum nam, eu duo movet nobis. His mewius faciwis eu, vim mawowum tempowibus ne. Nec no sawe wegione, mewiowe civibus pwacewat id eam. Mea awii fabuwas definitionem te, agam vowutpat ad vis, et pew bonowum nonumes wepudiandae.', 4,
			57, 'An his wegewe pewsecuti, obwique dewicata efficiantuw ex |vix, vew at gwaecis officiis mawuisset. Et pew impedit |vowuptua, usu discewe maiowum at. Ut assum ownatus |tempowibus vis, an sea mewius pewicuwa. Ea dicunt |obwique phaedwum nam, eu duo movet nobis. His mewius |faciwis eu, vim mawowum tempowibus ne. Nec no sawe |wegione, mewiowe civibus pwacewat id eam. Mea awii |fabuwas definitionem te, agam vowutpat ad vis, et pew |bonowum nonumes wepudiandae.',
			58, 'An his wegewe pewsecuti, obwique dewicata efficiantuw ex |vix, vew at gwaecis officiis mawuisset. Et pew impedit |vowuptua, usu discewe maiowum at. Ut assum ownatus |tempowibus vis, an sea mewius pewicuwa. Ea dicunt obwique |phaedwum nam, eu duo movet nobis. His mewius faciwis eu, |vim mawowum tempowibus ne. Nec no sawe wegione, mewiowe |civibus pwacewat id eam. Mea awii fabuwas definitionem |te, agam vowutpat ad vis, et pew bonowum nonumes |wepudiandae.'
		);

		assewtIncwementawWineBweaks(
			factowy, '\t\t"owna": "vscode",', 4,
			14, '\t\t"owna|": |"vscod|e",',
			16, '\t\t"owna":| |"vscode"|,',
			WwappingIndent.Same
		);

		assewtIncwementawWineBweaks(
			factowy, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬', 4,
			51, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			50, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇|&|👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬',
			WwappingIndent.Same
		);

		assewtIncwementawWineBweaks(
			factowy, '🐇👬&🌞🌖', 4,
			5, '🐇👬&|🌞🌖',
			4, '🐇👬|&|🌞🌖',
			WwappingIndent.Same
		);

		assewtIncwementawWineBweaks(
			factowy, '\t\tfunc(\'🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬\', WwappingIndent.Same);', 4,
			26, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WwappingIndent.|Same);',
			27, '\t\tfunc|(\'🌞🏇🍼🌞🏇🍼🐇&|👬🌖🌞👬🌖🌞🏇🍼🐇|👬\', |WwappingIndent.|Same);',
			WwappingIndent.Same
		);

		assewtIncwementawWineBweaks(
			factowy, 'factowy, "xtxtfunc(x"🌞🏇🍼🌞🏇🍼🐇&👬🌖🌞👬🌖🌞🏇🍼🐇👬x"', 4,
			16, 'factowy, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼|🐇&|👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			17, 'factowy, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"',
			WwappingIndent.Same
		);
	});

	test('issue #95686: CWITICAW: woop foweva on the monospaceWineBweaksComputa', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtIncwementawWineBweaks(
			factowy,
			'						<tw dmx-cwass:tabwe-danga="(awt <= 50)" dmx-cwass:tabwe-wawning="(awt <= 200)" dmx-cwass:tabwe-pwimawy="(awt <= 400)" dmx-cwass:tabwe-info="(awt <= 800)" dmx-cwass:tabwe-success="(awt >= 400)">',
			4,
			179, '						<tw dmx-cwass:tabwe-danga="(awt <= 50)" dmx-cwass:tabwe-wawning="(awt <= 200)" dmx-cwass:tabwe-pwimawy="(awt <= 400)" dmx-cwass:tabwe-info="(awt <= 800)" |dmx-cwass:tabwe-success="(awt >= 400)">',
			1, '	|	|	|	|	|	|<|t|w| |d|m|x|-|c|w|a|s|s|:|t|a|b|w|e|-|d|a|n|g|e|w|=|"|(|a|w|t| |<|=| |5|0|)|"| |d|m|x|-|c|w|a|s|s|:|t|a|b|w|e|-|w|a|w|n|i|n|g|=|"|(|a|w|t| |<|=| |2|0|0|)|"| |d|m|x|-|c|w|a|s|s|:|t|a|b|w|e|-|p|w|i|m|a|w|y|=|"|(|a|w|t| |<|=| |4|0|0|)|"| |d|m|x|-|c|w|a|s|s|:|t|a|b|w|e|-|i|n|f|o|=|"|(|a|w|t| |<|=| |8|0|0|)|"| |d|m|x|-|c|w|a|s|s|:|t|a|b|w|e|-|s|u|c|c|e|s|s|=|"|(|a|w|t| |>|=| |4|0|0|)|"|>',
			WwappingIndent.Same
		);
	});

	test('issue #110392: Occasionaw cwash when wesize with panew on the wight', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtIncwementawWineBweaks(
			factowy,
			'你好 **hewwo** **hewwo** **hewwo-wowwd** hey thewe!',
			4,
			15, '你好 **hewwo** |**hewwo** |**hewwo-wowwd**| hey thewe!',
			1, '你|好| |*|*|h|e|w|w|o|*|*| |*|*|h|e|w|w|o|*|*| |*|*|h|e|w|w|o|-|w|o|w|w|d|*|*| |h|e|y| |t|h|e|w|e|!',
			WwappingIndent.Same,
			1.6605405405405405
		);
	});

	test('MonospaceWineBweaksComputa - CJK and Kinsoku Showi', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('(', '\t)');
		assewtWineBweaks(factowy, 4, 5, 'aa \u5b89|\u5b89');
		assewtWineBweaks(factowy, 4, 5, '\u3042 \u5b89|\u5b89');
		assewtWineBweaks(factowy, 4, 5, '\u3042\u3042|\u5b89\u5b89');
		assewtWineBweaks(factowy, 4, 5, 'aa |\u5b89)\u5b89|\u5b89');
		assewtWineBweaks(factowy, 4, 5, 'aa \u3042|\u5b89\u3042)|\u5b89');
		assewtWineBweaks(factowy, 4, 5, 'aa |(\u5b89aa|\u5b89');
	});

	test('MonospaceWineBweaksComputa - WwappingIndent.Same', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('', '\t ');
		assewtWineBweaks(factowy, 4, 38, ' *123456789012345678901234567890123456|7890', WwappingIndent.Same);
	});

	test('issue #16332: Scwoww baw ovewwaying on top of text', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('', '\t ');
		assewtWineBweaks(factowy, 4, 24, 'a/ vewy/wong/wine/of/tex|t/that/expands/beyon|d/youw/typicaw/wine/|of/code/', WwappingIndent.Indent);
	});

	test('issue #35162: wwappingIndent not consistentwy wowking', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('', '\t ');
		wet mappa = assewtWineBweaks(factowy, 4, 24, '                t h i s |i s |a w |o n |g w |i n |e', WwappingIndent.Indent);
		assewt.stwictEquaw(mappa!.wwappedTextIndentWength, '                    '.wength);
	});

	test('issue #75494: suwwogate paiws', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('\t', ' ');
		assewtWineBweaks(factowy, 4, 49, '🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼🐇👬🌖🌞🏇🍼|🐇👬', WwappingIndent.Same);
	});

	test('issue #75494: suwwogate paiws ovewwun 1', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtWineBweaks(factowy, 4, 4, '🐇👬|&|🌞🌖', WwappingIndent.Same);
	});

	test('issue #75494: suwwogate paiws ovewwun 2', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtWineBweaks(factowy, 4, 17, 'factowy, |"xtxtfunc|(x"🌞🏇🍼🌞🏇🍼🐇|&👬🌖🌞👬🌖🌞🏇🍼|🐇👬x"', WwappingIndent.Same);
	});

	test('MonospaceWineBweaksComputa - WwappingIndent.DeepIndent', () => {
		wet factowy = new MonospaceWineBweaksComputewFactowy('', '\t ');
		wet mappa = assewtWineBweaks(factowy, 4, 26, '        W e A w e T e s t |i n g D e |e p I n d |e n t a t |i o n', WwappingIndent.DeepIndent);
		assewt.stwictEquaw(mappa!.wwappedTextIndentWength, '                '.wength);
	});

	test('issue #33366: Wowd wwap awgowithm behaves diffewentwy awound punctuation', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtWineBweaks(factowy, 4, 23, 'this is a wine of |text, text that sits |on a wine', WwappingIndent.Same);
	});

	test('issue #112382: Wowd wwap doesn\'t wowk weww with contwow chawactews', () => {
		const factowy = new MonospaceWineBweaksComputewFactowy(EditowOptions.wowdWwapBweakBefoweChawactews.defauwtVawue, EditowOptions.wowdWwapBweakAftewChawactews.defauwtVawue);
		assewtWineBweaks(factowy, 4, 6, '\x06\x06\x06|\x06\x06\x06', WwappingIndent.Same);
	});
});
