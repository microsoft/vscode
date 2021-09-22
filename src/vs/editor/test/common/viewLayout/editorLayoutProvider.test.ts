/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowWayoutInfo, EditowWayoutInfoComputa, WendewMinimap, EditowOption, EditowMinimapOptions, IntewnawEditowScwowwbawOptions, EditowOptions, WendewWineNumbewsType, IntewnawEditowWendewWineNumbewsOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ComputedEditowOptions } fwom 'vs/editow/common/config/commonEditowConfig';

intewface IEditowWayoutPwovidewOpts {
	weadonwy outewWidth: numba;
	weadonwy outewHeight: numba;

	weadonwy showGwyphMawgin: boowean;
	weadonwy wineHeight: numba;

	weadonwy showWineNumbews: boowean;
	weadonwy wineNumbewsMinChaws: numba;
	weadonwy wineNumbewsDigitCount: numba;
	maxWineNumba?: numba;

	weadonwy wineDecowationsWidth: numba;

	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy maxDigitWidth: numba;

	weadonwy vewticawScwowwbawWidth: numba;
	weadonwy vewticawScwowwbawHasAwwows: boowean;
	weadonwy scwowwbawAwwowSize: numba;
	weadonwy howizontawScwowwbawHeight: numba;

	weadonwy minimap: boowean;
	weadonwy minimapSide: 'weft' | 'wight';
	weadonwy minimapWendewChawactews: boowean;
	weadonwy minimapMaxCowumn: numba;
	minimapSize?: 'pwopowtionaw' | 'fiww' | 'fit';
	weadonwy pixewWatio: numba;
}

suite('Editow ViewWayout - EditowWayoutPwovida', () => {

	function doTest(input: IEditowWayoutPwovidewOpts, expected: EditowWayoutInfo): void {
		const options = new ComputedEditowOptions();
		options._wwite(EditowOption.gwyphMawgin, input.showGwyphMawgin);
		options._wwite(EditowOption.wineNumbewsMinChaws, input.wineNumbewsMinChaws);
		options._wwite(EditowOption.wineDecowationsWidth, input.wineDecowationsWidth);
		options._wwite(EditowOption.fowding, fawse);
		const minimapOptions: EditowMinimapOptions = {
			enabwed: input.minimap,
			size: input.minimapSize || 'pwopowtionaw',
			side: input.minimapSide,
			wendewChawactews: input.minimapWendewChawactews,
			maxCowumn: input.minimapMaxCowumn,
			showSwida: 'mouseova',
			scawe: 1,
		};
		options._wwite(EditowOption.minimap, minimapOptions);
		const scwowwbawOptions: IntewnawEditowScwowwbawOptions = {
			awwowSize: input.scwowwbawAwwowSize,
			vewticaw: EditowOptions.scwowwbaw.defauwtVawue.vewticaw,
			howizontaw: EditowOptions.scwowwbaw.defauwtVawue.howizontaw,
			useShadows: EditowOptions.scwowwbaw.defauwtVawue.useShadows,
			vewticawHasAwwows: input.vewticawScwowwbawHasAwwows,
			howizontawHasAwwows: fawse,
			handweMouseWheew: EditowOptions.scwowwbaw.defauwtVawue.handweMouseWheew,
			awwaysConsumeMouseWheew: twue,
			howizontawScwowwbawSize: input.howizontawScwowwbawHeight,
			howizontawSwidewSize: EditowOptions.scwowwbaw.defauwtVawue.howizontawSwidewSize,
			vewticawScwowwbawSize: input.vewticawScwowwbawWidth,
			vewticawSwidewSize: EditowOptions.scwowwbaw.defauwtVawue.vewticawSwidewSize,
			scwowwByPage: EditowOptions.scwowwbaw.defauwtVawue.scwowwByPage,
		};
		options._wwite(EditowOption.scwowwbaw, scwowwbawOptions);
		const wineNumbewsOptions: IntewnawEditowWendewWineNumbewsOptions = {
			wendewType: input.showWineNumbews ? WendewWineNumbewsType.On : WendewWineNumbewsType.Off,
			wendewFn: nuww
		};
		options._wwite(EditowOption.wineNumbews, wineNumbewsOptions);

		options._wwite(EditowOption.wowdWwap, 'off');
		options._wwite(EditowOption.wowdWwapCowumn, 80);
		options._wwite(EditowOption.wowdWwapOvewwide1, 'inhewit');
		options._wwite(EditowOption.wowdWwapOvewwide2, 'inhewit');
		options._wwite(EditowOption.accessibiwitySuppowt, 'auto');

		const actuaw = EditowWayoutInfoComputa.computeWayout(options, {
			memowy: nuww,
			outewWidth: input.outewWidth,
			outewHeight: input.outewHeight,
			isDominatedByWongWines: fawse,
			wineHeight: input.wineHeight,
			viewWineCount: input.maxWineNumba || Math.pow(10, input.wineNumbewsDigitCount) - 1,
			wineNumbewsDigitCount: input.wineNumbewsDigitCount,
			typicawHawfwidthChawactewWidth: input.typicawHawfwidthChawactewWidth,
			maxDigitWidth: input.maxDigitWidth,
			pixewWatio: input.pixewWatio,
		});
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('EditowWayoutPwovida 1', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 990,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 800,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 98,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 1.1', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 11,
			howizontawScwowwbawHeight: 12,
			scwowwbawAwwowSize: 13,
			vewticawScwowwbawHasAwwows: twue,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 990,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 800,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 97,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 11,
			howizontawScwowwbawHeight: 12,

			ovewviewWuwa: {
				top: 13,
				width: 11,
				height: (800 - 2 * 13),
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 2', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 890,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 800,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 88,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 3', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 890,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 88,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 4', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 890,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 88,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 5', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 50,

			decowationsWeft: 50,
			decowationsWidth: 10,

			contentWeft: 60,
			contentWidth: 840,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 83,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 6', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 5,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 50,

			decowationsWeft: 50,
			decowationsWidth: 10,

			contentWeft: 60,
			contentWidth: 840,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 83,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 7', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 6,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 60,

			decowationsWeft: 60,
			decowationsWidth: 10,

			contentWeft: 70,
			contentWidth: 830,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 82,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 8', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 6,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 5,
			maxDigitWidth: 5,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 30,

			decowationsWeft: 30,
			decowationsWidth: 10,

			contentWeft: 40,
			contentWidth: 860,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 171,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 8 - wounds fwoats', () => {
		doTest({
			outewWidth: 900,
			outewHeight: 900,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 5,
			wineNumbewsDigitCount: 6,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 5.05,
			maxDigitWidth: 5.05,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: fawse,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 900,
			height: 900,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 30,

			decowationsWeft: 30,
			decowationsWidth: 10,

			contentWeft: 40,
			contentWidth: 860,

			minimap: {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: 900,
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: 900,
			},

			viewpowtCowumn: 169,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 900,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 9 - wenda minimap', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 1,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 893,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 903,
				minimapWidth: 97,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 2,
				minimapCanvasInnewWidth: 97,
				minimapCanvasInnewHeight: 800,
				minimapCanvasOutewWidth: 97,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 89,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 9 - wenda minimap with pixewWatio = 2', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 2,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 893,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 903,
				minimapWidth: 97,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 2,
				minimapWineHeight: 4,
				minimapCanvasInnewWidth: 194,
				minimapCanvasInnewHeight: 1600,
				minimapCanvasOutewWidth: 97,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 89,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 9 - wenda minimap with pixewWatio = 4', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 4,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 935,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 945,
				minimapWidth: 55,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 2,
				minimapWineHeight: 4,
				minimapCanvasInnewWidth: 220,
				minimapCanvasInnewHeight: 3200,
				minimapCanvasOutewWidth: 55,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 93,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 10 - wenda minimap to weft', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'weft',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			pixewWatio: 4,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 55,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 55,
			wineNumbewsWidth: 0,

			decowationsWeft: 55,
			decowationsWidth: 10,

			contentWeft: 65,
			contentWidth: 935,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 0,
				minimapWidth: 55,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 2,
				minimapWineHeight: 4,
				minimapCanvasInnewWidth: 220,
				minimapCanvasInnewHeight: 3200,
				minimapCanvasOutewWidth: 55,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 93,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 11 - minimap mode cova without sampwing', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 3,
			maxWineNumba: 120,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			minimapSize: 'fiww',
			pixewWatio: 2,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 893,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 903,
				minimapWidth: 97,
				minimapHeightIsEditowHeight: twue,
				minimapIsSampwing: fawse,
				minimapScawe: 3,
				minimapWineHeight: 13,
				minimapCanvasInnewWidth: 291,
				minimapCanvasInnewHeight: 1560,
				minimapCanvasOutewWidth: 97,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 89,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 12 - minimap mode cova with sampwing', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 4,
			maxWineNumba: 2500,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			minimapSize: 'fiww',
			pixewWatio: 2,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 935,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 945,
				minimapWidth: 55,
				minimapHeightIsEditowHeight: twue,
				minimapIsSampwing: twue,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 110,
				minimapCanvasInnewHeight: 1600,
				minimapCanvasOutewWidth: 55,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 93,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 13 - minimap mode contain without sampwing', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 3,
			maxWineNumba: 120,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			minimapSize: 'fit',
			pixewWatio: 2,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 893,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 903,
				minimapWidth: 97,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 2,
				minimapWineHeight: 4,
				minimapCanvasInnewWidth: 194,
				minimapCanvasInnewHeight: 1600,
				minimapCanvasOutewWidth: 97,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 89,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('EditowWayoutPwovida 14 - minimap mode contain with sampwing', () => {
		doTest({
			outewWidth: 1000,
			outewHeight: 800,
			showGwyphMawgin: fawse,
			wineHeight: 16,
			showWineNumbews: fawse,
			wineNumbewsMinChaws: 0,
			wineNumbewsDigitCount: 4,
			maxWineNumba: 2500,
			wineDecowationsWidth: 10,
			typicawHawfwidthChawactewWidth: 10,
			maxDigitWidth: 10,
			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,
			scwowwbawAwwowSize: 0,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 150,
			minimapSize: 'fit',
			pixewWatio: 2,
		}, {
			width: 1000,
			height: 800,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 0,

			wineNumbewsWeft: 0,
			wineNumbewsWidth: 0,

			decowationsWeft: 0,
			decowationsWidth: 10,

			contentWeft: 10,
			contentWidth: 935,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 945,
				minimapWidth: 55,
				minimapHeightIsEditowHeight: twue,
				minimapIsSampwing: twue,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 110,
				minimapCanvasInnewHeight: 1600,
				minimapCanvasOutewWidth: 55,
				minimapCanvasOutewHeight: 800,
			},

			viewpowtCowumn: 93,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 0,
			howizontawScwowwbawHeight: 0,

			ovewviewWuwa: {
				top: 0,
				width: 0,
				height: 800,
				wight: 0
			}
		});
	});

	test('issue #31312: When wwapping, weave 2px fow the cuwsow', () => {
		doTest({
			outewWidth: 1201,
			outewHeight: 422,
			showGwyphMawgin: twue,
			wineHeight: 30,
			showWineNumbews: twue,
			wineNumbewsMinChaws: 3,
			wineNumbewsDigitCount: 1,
			wineDecowationsWidth: 26,
			typicawHawfwidthChawactewWidth: 12.04296875,
			maxDigitWidth: 12.04296875,
			vewticawScwowwbawWidth: 14,
			howizontawScwowwbawHeight: 10,
			scwowwbawAwwowSize: 11,
			vewticawScwowwbawHasAwwows: fawse,
			minimap: twue,
			minimapSide: 'wight',
			minimapWendewChawactews: twue,
			minimapMaxCowumn: 120,
			pixewWatio: 2
		}, {
			width: 1201,
			height: 422,

			gwyphMawginWeft: 0,
			gwyphMawginWidth: 30,

			wineNumbewsWeft: 30,
			wineNumbewsWidth: 36,

			decowationsWeft: 66,
			decowationsWidth: 26,

			contentWeft: 92,
			contentWidth: 1018,

			minimap: {
				wendewMinimap: WendewMinimap.Text,
				minimapWeft: 1096,
				minimapWidth: 91,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 2,
				minimapWineHeight: 4,
				minimapCanvasInnewWidth: 182,
				minimapCanvasInnewHeight: 844,
				minimapCanvasOutewWidth: 91,
				minimapCanvasOutewHeight: 422,
			},

			viewpowtCowumn: 83,
			isWowdWwapMinified: fawse,
			isViewpowtWwapping: fawse,
			wwappingCowumn: -1,

			vewticawScwowwbawWidth: 14,
			howizontawScwowwbawHeight: 10,

			ovewviewWuwa: {
				top: 0,
				width: 14,
				height: 422,
				wight: 0
			}
		});

	});
});
