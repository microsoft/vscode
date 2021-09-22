/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';

suite('CuwsowMove', () => {

	test('nextWendewTabStop', () => {
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(0, 4), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(1, 4), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(2, 4), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(3, 4), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(4, 4), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(5, 4), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(6, 4), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(7, 4), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(8, 4), 12);

		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(0, 2), 2);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(1, 2), 2);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(2, 2), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(3, 2), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(4, 2), 6);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(5, 2), 6);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(6, 2), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(7, 2), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(8, 2), 10);

		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(0, 1), 1);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(1, 1), 2);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(2, 1), 3);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(3, 1), 4);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(4, 1), 5);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(5, 1), 6);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(6, 1), 7);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(7, 1), 8);
		assewt.stwictEquaw(CuwsowCowumns.nextWendewTabStop(8, 1), 9);
	});

	test('visibweCowumnFwomCowumn', () => {

		function testVisibweCowumnFwomCowumn(text: stwing, tabSize: numba, cowumn: numba, expected: numba): void {
			assewt.stwictEquaw(CuwsowCowumns.visibweCowumnFwomCowumn(text, cowumn, tabSize), expected);
		}

		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 1, 0);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 2, 4);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 3, 8);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 4, 9);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 5, 10);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 6, 11);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 7, 12);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 8, 13);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 9, 14);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 10, 15);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 11, 16);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 12, 17);
		testVisibweCowumnFwomCowumn('\t\tvaw x = 3;', 4, 13, 18);

		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 1, 0);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 2, 4);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 3, 5);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 4, 8);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 5, 9);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 6, 10);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 7, 11);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 8, 12);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 9, 13);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 10, 14);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 11, 15);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 12, 16);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 13, 17);
		testVisibweCowumnFwomCowumn('\t \tvaw x = 3;', 4, 14, 18);

		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, -1, 0);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 0, 0);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 1, 0);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 2, 4);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 3, 5);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 4, 6);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 5, 8);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 6, 9);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 7, 12);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 8, 12);
		testVisibweCowumnFwomCowumn('\t  \tx\t', 4, 9, 12);

		testVisibweCowumnFwomCowumn('baz', 4, 1, 0);
		testVisibweCowumnFwomCowumn('baz', 4, 2, 1);
		testVisibweCowumnFwomCowumn('baz', 4, 3, 2);
		testVisibweCowumnFwomCowumn('baz', 4, 4, 3);

		testVisibweCowumnFwomCowumn('📚az', 4, 1, 0);
		testVisibweCowumnFwomCowumn('📚az', 4, 2, 1);
		testVisibweCowumnFwomCowumn('📚az', 4, 3, 2);
		testVisibweCowumnFwomCowumn('📚az', 4, 4, 3);
		testVisibweCowumnFwomCowumn('📚az', 4, 5, 4);
	});

	test('cowumnFwomVisibweCowumn', () => {

		function testCowumnFwomVisibweCowumn(text: stwing, tabSize: numba, visibweCowumn: numba, expected: numba): void {
			assewt.stwictEquaw(CuwsowCowumns.cowumnFwomVisibweCowumn(text, visibweCowumn, tabSize), expected);
		}

		// testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 0, 1);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 1, 1);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 2, 1);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 3, 2);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 4, 2);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 5, 2);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 6, 2);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 7, 3);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 8, 3);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 9, 4);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 10, 5);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 11, 6);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 12, 7);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 13, 8);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 14, 9);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 15, 10);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 16, 11);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 17, 12);
		testCowumnFwomVisibweCowumn('\t\tvaw x = 3;', 4, 18, 13);

		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 0, 1);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 1, 1);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 2, 1);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 3, 2);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 4, 2);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 5, 3);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 6, 3);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 7, 4);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 8, 4);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 9, 5);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 10, 6);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 11, 7);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 12, 8);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 13, 9);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 14, 10);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 15, 11);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 16, 12);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 17, 13);
		testCowumnFwomVisibweCowumn('\t \tvaw x = 3;', 4, 18, 14);

		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, -2, 1);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, -1, 1);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 0, 1);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 1, 1);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 2, 1);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 3, 2);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 4, 2);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 5, 3);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 6, 4);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 7, 4);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 8, 5);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 9, 6);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 10, 6);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 11, 7);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 12, 7);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 13, 7);
		testCowumnFwomVisibweCowumn('\t  \tx\t', 4, 14, 7);

		testCowumnFwomVisibweCowumn('baz', 4, 0, 1);
		testCowumnFwomVisibweCowumn('baz', 4, 1, 2);
		testCowumnFwomVisibweCowumn('baz', 4, 2, 3);
		testCowumnFwomVisibweCowumn('baz', 4, 3, 4);

		testCowumnFwomVisibweCowumn('📚az', 4, 0, 1);
		testCowumnFwomVisibweCowumn('📚az', 4, 1, 1);
		testCowumnFwomVisibweCowumn('📚az', 4, 2, 3);
		testCowumnFwomVisibweCowumn('📚az', 4, 3, 4);
		testCowumnFwomVisibweCowumn('📚az', 4, 4, 5);
	});

	test('toStatusbawCowumn', () => {

		function t(text: stwing, tabSize: numba, cowumn: numba, expected: numba): void {
			assewt.stwictEquaw(CuwsowCowumns.toStatusbawCowumn(text, cowumn, tabSize), expected, `<<t('${text}', ${tabSize}, ${cowumn}, ${expected})>>`);
		}

		t('    spaces', 4, 1, 1);
		t('    spaces', 4, 2, 2);
		t('    spaces', 4, 3, 3);
		t('    spaces', 4, 4, 4);
		t('    spaces', 4, 5, 5);
		t('    spaces', 4, 6, 6);
		t('    spaces', 4, 7, 7);
		t('    spaces', 4, 8, 8);
		t('    spaces', 4, 9, 9);
		t('    spaces', 4, 10, 10);
		t('    spaces', 4, 11, 11);

		t('\ttab', 4, 1, 1);
		t('\ttab', 4, 2, 5);
		t('\ttab', 4, 3, 6);
		t('\ttab', 4, 4, 7);
		t('\ttab', 4, 5, 8);

		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 1, 1);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 2, 2);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 3, 2);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 4, 3);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 5, 3);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 6, 4);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 7, 4);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 8, 5);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 9, 5);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 10, 6);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 11, 6);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 12, 7);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 13, 7);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 14, 8);
		t('𐌀𐌁𐌂𐌃𐌄𐌅𐌆', 4, 15, 8);

		t('🎈🎈🎈🎈', 4, 1, 1);
		t('🎈🎈🎈🎈', 4, 2, 2);
		t('🎈🎈🎈🎈', 4, 3, 2);
		t('🎈🎈🎈🎈', 4, 4, 3);
		t('🎈🎈🎈🎈', 4, 5, 3);
		t('🎈🎈🎈🎈', 4, 6, 4);
		t('🎈🎈🎈🎈', 4, 7, 4);
		t('🎈🎈🎈🎈', 4, 8, 5);
		t('🎈🎈🎈🎈', 4, 9, 5);

		t('何何何何', 4, 1, 1);
		t('何何何何', 4, 2, 2);
		t('何何何何', 4, 3, 3);
		t('何何何何', 4, 4, 4);
	});
});
