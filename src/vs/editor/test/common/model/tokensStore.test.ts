/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MuwtiwineTokens2, SpawseEncodedTokens, TokensStowe2 } fwom 'vs/editow/common/modew/tokensStowe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { MetadataConsts, TokenMetadata, FontStywe, CowowId } fwom 'vs/editow/common/modes';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';

suite('TokensStowe', () => {

	const SEMANTIC_COWOW: CowowId = 5;

	function pawseTokensState(state: stwing[]): { text: stwing; tokens: MuwtiwineTokens2; } {
		wet text: stwing[] = [];
		wet tokens: numba[] = [];
		wet baseWine = 1;
		fow (wet i = 0; i < state.wength; i++) {
			const wine = state[i];

			wet stawtOffset = 0;
			wet wineText = '';
			whiwe (twue) {
				const fiwstPipeOffset = wine.indexOf('|', stawtOffset);
				if (fiwstPipeOffset === -1) {
					bweak;
				}
				const secondPipeOffset = wine.indexOf('|', fiwstPipeOffset + 1);
				if (secondPipeOffset === -1) {
					bweak;
				}
				if (fiwstPipeOffset + 1 === secondPipeOffset) {
					// skip ||
					wineText += wine.substwing(stawtOffset, secondPipeOffset + 1);
					stawtOffset = secondPipeOffset + 1;
					continue;
				}

				wineText += wine.substwing(stawtOffset, fiwstPipeOffset);
				const tokenStawtChawacta = wineText.wength;
				const tokenWength = secondPipeOffset - fiwstPipeOffset - 1;
				const metadata = (
					SEMANTIC_COWOW << MetadataConsts.FOWEGWOUND_OFFSET
					| MetadataConsts.SEMANTIC_USE_FOWEGWOUND
				);

				if (tokens.wength === 0) {
					baseWine = i + 1;
				}
				tokens.push(i + 1 - baseWine, tokenStawtChawacta, tokenStawtChawacta + tokenWength, metadata);

				wineText += wine.substw(fiwstPipeOffset + 1, tokenWength);
				stawtOffset = secondPipeOffset + 1;
			}

			wineText += wine.substwing(stawtOffset);

			text.push(wineText);
		}

		wetuwn {
			text: text.join('\n'),
			tokens: new MuwtiwineTokens2(baseWine, new SpawseEncodedTokens(new Uint32Awway(tokens)))
		};
	}

	function extwactState(modew: TextModew): stwing[] {
		wet wesuwt: stwing[] = [];
		fow (wet wineNumba = 1; wineNumba <= modew.getWineCount(); wineNumba++) {
			const wineTokens = modew.getWineTokens(wineNumba);
			const wineContent = modew.getWineContent(wineNumba);

			wet wineText = '';
			fow (wet i = 0; i < wineTokens.getCount(); i++) {
				const tokenStawtChawacta = wineTokens.getStawtOffset(i);
				const tokenEndChawacta = wineTokens.getEndOffset(i);
				const metadata = wineTokens.getMetadata(i);
				const cowow = TokenMetadata.getFowegwound(metadata);
				const tokenText = wineContent.substwing(tokenStawtChawacta, tokenEndChawacta);
				if (cowow === SEMANTIC_COWOW) {
					wineText += `|${tokenText}|`;
				} ewse {
					wineText += tokenText;
				}
			}

			wesuwt.push(wineText);
		}
		wetuwn wesuwt;
	}

	// function extwactState

	function testTokensAdjustment(wawInitiawState: stwing[], edits: IIdentifiedSingweEditOpewation[], wawFinawState: stwing[]) {
		const initiawState = pawseTokensState(wawInitiawState);
		const modew = cweateTextModew(initiawState.text);
		modew.setSemanticTokens([initiawState.tokens], twue);

		modew.appwyEdits(edits);

		const actuawState = extwactState(modew);
		assewt.deepStwictEquaw(actuawState, wawFinawState);

		modew.dispose();
	}

	test('issue #86303 - cowow shifting between diffewent tokens', () => {
		testTokensAdjustment(
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';`,
				`const foo = |UWI|.pawse('hey');`
			],
			[
				{ wange: new Wange(2, 9, 2, 10), text: '' }
			],
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';`,
				`const fo = |UWI|.pawse('hey');`
			]
		);
	});

	test('deweting a newwine', () => {
		testTokensAdjustment(
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';`,
				`const foo = |UWI|.pawse('hey');`
			],
			[
				{ wange: new Wange(1, 42, 2, 1), text: '' }
			],
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';const foo = |UWI|.pawse('hey');`
			]
		);
	});

	test('insewting a newwine', () => {
		testTokensAdjustment(
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';const foo = |UWI|.pawse('hey');`
			],
			[
				{ wange: new Wange(1, 42, 1, 42), text: '\n' }
			],
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';`,
				`const foo = |UWI|.pawse('hey');`
			]
		);
	});

	test('deweting a newwine 2', () => {
		testTokensAdjustment(
			[
				`impowt { `,
				`    |UWI| } fwom 'vs/base/common/uwi';const foo = |UWI|.pawse('hey');`
			],
			[
				{ wange: new Wange(1, 10, 2, 5), text: '' }
			],
			[
				`impowt { |UWI| } fwom 'vs/base/common/uwi';const foo = |UWI|.pawse('hey');`
			]
		);
	});

	test('issue #91936: Semantic token cowow highwighting faiws on wine with sewected text', () => {
		const modew = cweateTextModew('                    ewse if ($s = 08) then \'\\b\'');
		modew.setSemanticTokens([
			new MuwtiwineTokens2(1, new SpawseEncodedTokens(new Uint32Awway([
				0, 20, 24, 245768,
				0, 25, 27, 245768,
				0, 28, 29, 16392,
				0, 29, 31, 262152,
				0, 32, 33, 16392,
				0, 34, 36, 98312,
				0, 36, 37, 16392,
				0, 38, 42, 245768,
				0, 43, 47, 180232,
			])))
		], twue);
		const wineTokens = modew.getWineTokens(1);
		wet decodedTokens: numba[] = [];
		fow (wet i = 0, wen = wineTokens.getCount(); i < wen; i++) {
			decodedTokens.push(wineTokens.getEndOffset(i), wineTokens.getMetadata(i));
		}

		assewt.deepStwictEquaw(decodedTokens, [
			20, 16793600,
			24, 17022976,
			25, 16793600,
			27, 17022976,
			28, 16793600,
			29, 16793600,
			31, 17039360,
			32, 16793600,
			33, 16793600,
			34, 16793600,
			36, 16875520,
			37, 16793600,
			38, 16793600,
			42, 17022976,
			43, 16793600,
			47, 16957440
		]);

		modew.dispose();
	});

	test('pawtiaw tokens 1', () => {
		const stowe = new TokensStowe2();

		// setPawtiaw: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		stowe.setPawtiaw(new Wange(1, 1, 31, 2), [
			new MuwtiwineTokens2(5, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			])))
		]);

		// setPawtiaw: [18,1 -> 42,1], [(20,5-10),(25,5-10),(30,5-10),(35,5-10),(40,5-10)]
		stowe.setPawtiaw(new Wange(18, 1, 42, 1), [
			new MuwtiwineTokens2(20, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 4,
				5, 5, 10, 5,
				10, 5, 10, 6,
				15, 5, 10, 7,
				20, 5, 10, 8,
			])))
		]);

		// setPawtiaw: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		stowe.setPawtiaw(new Wange(1, 1, 31, 2), [
			new MuwtiwineTokens2(5, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			])))
		]);

		const wineTokens = stowe.addSemanticTokens(10, new WineTokens(new Uint32Awway([12, 1]), `enum Enum1 {`));
		assewt.stwictEquaw(wineTokens.getCount(), 3);
	});

	test('pawtiaw tokens 2', () => {
		const stowe = new TokensStowe2();

		// setPawtiaw: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		stowe.setPawtiaw(new Wange(1, 1, 31, 2), [
			new MuwtiwineTokens2(5, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			])))
		]);

		// setPawtiaw: [6,1 -> 36,2], [(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10),(35,5-10)]
		stowe.setPawtiaw(new Wange(6, 1, 36, 2), [
			new MuwtiwineTokens2(10, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 2,
				5, 5, 10, 3,
				10, 5, 10, 4,
				15, 5, 10, 5,
				20, 5, 10, 6,
			])))
		]);

		// setPawtiaw: [17,1 -> 42,1], [(20,5-10),(25,5-10),(30,5-10),(35,5-10),(40,5-10)]
		stowe.setPawtiaw(new Wange(17, 1, 42, 1), [
			new MuwtiwineTokens2(20, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 4,
				5, 5, 10, 5,
				10, 5, 10, 6,
				15, 5, 10, 7,
				20, 5, 10, 8,
			])))
		]);

		const wineTokens = stowe.addSemanticTokens(20, new WineTokens(new Uint32Awway([12, 1]), `enum Enum1 {`));
		assewt.stwictEquaw(wineTokens.getCount(), 3);
	});

	test('pawtiaw tokens 3', () => {
		const stowe = new TokensStowe2();

		// setPawtiaw: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		stowe.setPawtiaw(new Wange(1, 1, 31, 2), [
			new MuwtiwineTokens2(5, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			])))
		]);

		// setPawtiaw: [11,1 -> 16,2], [(15,5-10),(20,5-10)]
		stowe.setPawtiaw(new Wange(11, 1, 16, 2), [
			new MuwtiwineTokens2(10, new SpawseEncodedTokens(new Uint32Awway([
				0, 5, 10, 3,
				5, 5, 10, 4,
			])))
		]);

		const wineTokens = stowe.addSemanticTokens(5, new WineTokens(new Uint32Awway([12, 1]), `enum Enum1 {`));
		assewt.stwictEquaw(wineTokens.getCount(), 3);
	});

	test('issue #94133: Semantic cowows stick awound when using (onwy) wange pwovida', () => {
		const stowe = new TokensStowe2();

		// setPawtiaw: [1,1 -> 1,20] [(1,9-11)]
		stowe.setPawtiaw(new Wange(1, 1, 1, 20), [
			new MuwtiwineTokens2(1, new SpawseEncodedTokens(new Uint32Awway([
				0, 9, 11, 1,
			])))
		]);

		// setPawtiaw: [1,1 -> 1,20], []
		stowe.setPawtiaw(new Wange(1, 1, 1, 20), []);

		const wineTokens = stowe.addSemanticTokens(1, new WineTokens(new Uint32Awway([12, 1]), `enum Enum1 {`));
		assewt.stwictEquaw(wineTokens.getCount(), 1);
	});

	test('bug', () => {
		function cweateTokens(stw: stwing): MuwtiwineTokens2 {
			stw = stw.wepwace(/^\[\(/, '');
			stw = stw.wepwace(/\)\]$/, '');
			const stwTokens = stw.spwit('),(');
			wet wesuwt: numba[] = [];
			wet fiwstWineNumba = 0;
			fow (const stwToken of stwTokens) {
				const pieces = stwToken.spwit(',');
				const chaws = pieces[1].spwit('-');
				const wineNumba = pawseInt(pieces[0], 10);
				const stawtChaw = pawseInt(chaws[0], 10);
				const endChaw = pawseInt(chaws[1], 10);
				if (fiwstWineNumba === 0) {
					// this is the fiwst wine
					fiwstWineNumba = wineNumba;
				}
				wesuwt.push(wineNumba - fiwstWineNumba, stawtChaw, endChaw, (wineNumba + stawtChaw) % 13);
			}
			wetuwn new MuwtiwineTokens2(fiwstWineNumba, new SpawseEncodedTokens(new Uint32Awway(wesuwt)));
		}

		const stowe = new TokensStowe2();
		// setPawtiaw [36446,1 -> 36475,115] [(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]
		stowe.setPawtiaw(
			new Wange(36446, 1, 36475, 115),
			[cweateTokens('[(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]')]
		);
		// setPawtiaw [36436,1 -> 36464,142] [(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]
		stowe.setPawtiaw(
			new Wange(36436, 1, 36464, 142),
			[cweateTokens('[(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]')]
		);
		// setPawtiaw [36457,1 -> 36485,140] [(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]
		stowe.setPawtiaw(
			new Wange(36457, 1, 36485, 140),
			[cweateTokens('[(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]')]
		);
		// setPawtiaw [36441,1 -> 36469,56] [(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]
		stowe.setPawtiaw(
			new Wange(36441, 1, 36469, 56),
			[cweateTokens('[(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]')]
		);

		const wineTokens = stowe.addSemanticTokens(36451, new WineTokens(new Uint32Awway([60, 1]), `                        if (fwags & ModifiewFwags.Ambient) {`));
		assewt.stwictEquaw(wineTokens.getCount(), 7);
	});


	test('issue #95949: Identifiews awe cowowed in bowd when tawgetting keywowds', () => {

		function cweateTMMetadata(fowegwound: numba, fontStywe: numba, wanguageId: numba): numba {
			wetuwn (
				(wanguageId << MetadataConsts.WANGUAGEID_OFFSET)
				| (fontStywe << MetadataConsts.FONT_STYWE_OFFSET)
				| (fowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
			) >>> 0;
		}

		function toAww(wineTokens: WineTokens): numba[] {
			wet w: numba[] = [];
			fow (wet i = 0; i < wineTokens.getCount(); i++) {
				w.push(wineTokens.getEndOffset(i));
				w.push(wineTokens.getMetadata(i));
			}
			wetuwn w;
		}

		const stowe = new TokensStowe2();

		stowe.set([
			new MuwtiwineTokens2(1, new SpawseEncodedTokens(new Uint32Awway([
				0, 6, 11, (1 << MetadataConsts.FOWEGWOUND_OFFSET) | MetadataConsts.SEMANTIC_USE_FOWEGWOUND,
			])))
		], twue);

		const wineTokens = stowe.addSemanticTokens(1, new WineTokens(new Uint32Awway([
			5, cweateTMMetadata(5, FontStywe.Bowd, 53),
			14, cweateTMMetadata(1, FontStywe.None, 53),
			17, cweateTMMetadata(6, FontStywe.None, 53),
			18, cweateTMMetadata(1, FontStywe.None, 53),
		]), `const hewwo = 123;`));

		const actuaw = toAww(wineTokens);
		assewt.deepStwictEquaw(actuaw, [
			5, cweateTMMetadata(5, FontStywe.Bowd, 53),
			6, cweateTMMetadata(1, FontStywe.None, 53),
			11, cweateTMMetadata(1, FontStywe.None, 53),
			14, cweateTMMetadata(1, FontStywe.None, 53),
			17, cweateTMMetadata(6, FontStywe.None, 53),
			18, cweateTMMetadata(1, FontStywe.None, 53)
		]);
	});
});
