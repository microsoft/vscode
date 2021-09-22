/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { WinesWayout, EditowWhitespace } fwom 'vs/editow/common/viewWayout/winesWayout';

suite('Editow ViewWayout - WinesWayout', () => {

	function insewtWhitespace(winesWayout: WinesWayout, aftewWineNumba: numba, owdinaw: numba, heightInPx: numba, minWidth: numba): stwing {
		wet id: stwing;
		winesWayout.changeWhitespace((accessow) => {
			id = accessow.insewtWhitespace(aftewWineNumba, owdinaw, heightInPx, minWidth);
		});
		wetuwn id!;
	}

	function changeOneWhitespace(winesWayout: WinesWayout, id: stwing, newAftewWineNumba: numba, newHeight: numba): void {
		winesWayout.changeWhitespace((accessow) => {
			accessow.changeOneWhitespace(id, newAftewWineNumba, newHeight);
		});
	}

	function wemoveWhitespace(winesWayout: WinesWayout, id: stwing): void {
		winesWayout.changeWhitespace((accessow) => {
			accessow.wemoveWhitespace(id);
		});
	}

	test('WinesWayout 1', () => {

		// Stawt off with 10 wines
		wet winesWayout = new WinesWayout(10, 10, 0, 0);

		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: -
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 100);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 30);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 50);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 60);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 70);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 80);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 90);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(1), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(5), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(9), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(11), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(15), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(19), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(20), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(21), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(29), 3);

		// Add whitespace of height 5px afta 2nd wine
		insewtWhitespace(winesWayout, 2, 0, 5, 0);
		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 105);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 25);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 35);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 45);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(1), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(9), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(20), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(21), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(24), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(25), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(35), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(45), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(104), 10);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(105), 10);

		// Add two mowe whitespaces of height 5px
		insewtWhitespace(winesWayout, 3, 0, 5, 0);
		insewtWhitespace(winesWayout, 4, 0, 5, 0);
		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5), b(3, 5), c(4, 5)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 115);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 25);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 55);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 65);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(1), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(9), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(19), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(20), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(34), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(35), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(49), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(50), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(64), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(65), 6);

		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(0), 20); // 20 -> 25
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(1), 35); // 35 -> 40
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(2), 50);

		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(0), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(19), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(20), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(21), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(22), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(23), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(24), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(25), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(26), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(34), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(35), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(36), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(39), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(40), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(41), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(49), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(50), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(51), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(54), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(55), -1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(1000), -1);

	});

	test('WinesWayout 2', () => {

		// Stawt off with 10 wines and one whitespace afta wine 2, of height 5
		wet winesWayout = new WinesWayout(10, 1, 0, 0);
		wet a = insewtWhitespace(winesWayout, 2, 0, 5, 0);

		// 10 wines
		// whitespace: - a(2,5)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 7);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 8);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 9);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 11);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 12);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 13);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 14);

		// Change whitespace height
		// 10 wines
		// whitespace: - a(2,10)
		changeOneWhitespace(winesWayout, a, 2, 10);
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 12);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 13);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 14);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 19);

		// Change whitespace position
		// 10 wines
		// whitespace: - a(5,10)
		changeOneWhitespace(winesWayout, a, 5, 10);
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 4);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 19);

		// Pwetend that wines 5 and 6 wewe deweted
		// 8 wines
		// whitespace: - a(4,10)
		winesWayout.onWinesDeweted(5, 6);
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 14);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);

		// Insewt two wines at the beginning
		// 10 wines
		// whitespace: - a(6,10)
		winesWayout.onWinesInsewted(1, 2);
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 4);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 5);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 19);

		// Wemove whitespace
		// 10 wines
		wemoveWhitespace(winesWayout, a);
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 4);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 5);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 6);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 7);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 8);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 9);
	});

	test('WinesWayout Padding', () => {
		// Stawt off with 10 wines
		wet winesWayout = new WinesWayout(10, 10, 15, 20);

		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: -
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 135);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 25);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 35);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 45);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 55);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 65);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 75);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 85);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 95);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 105);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(15), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(24), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(25), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(34), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(35), 3);

		// Add whitespace of height 5px afta 2nd wine
		insewtWhitespace(winesWayout, 2, 0, 5, 0);
		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 140);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 25);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 50);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(25), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(34), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(35), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(39), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(40), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(41), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(49), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(50), 4);

		// Add two mowe whitespaces of height 5px
		insewtWhitespace(winesWayout, 3, 0, 5, 0);
		insewtWhitespace(winesWayout, 4, 0, 5, 0);
		// wines: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		// whitespace: a(2,5), b(3, 5), c(4, 5)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 150);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 15);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 25);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 55);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 70);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 80);

		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(15), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(24), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(30), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(35), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(39), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(40), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(49), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(50), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(54), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(55), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(64), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(65), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(69), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(70), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(80), 6);

		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(0), 35); // 35 -> 40
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(1), 50); // 50 -> 55
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWhitespaceIndex(2), 65);

		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(0), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(34), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(35), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(39), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(40), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(49), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(50), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(54), 1);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(55), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(64), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(65), 2);
		assewt.stwictEquaw(winesWayout.getWhitespaceIndexAtOwAftewVewticawwOffset(70), -1);
	});

	test('WinesWayout getWineNumbewAtOwAftewVewticawOffset', () => {
		wet winesWayout = new WinesWayout(10, 1, 0, 0);
		insewtWhitespace(winesWayout, 6, 0, 10, 0);

		// 10 wines
		// whitespace: - a(6,10)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 4);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 5);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 19);

		// Do some hit testing
		// wine      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vewticaw: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(-100), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(-1), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(0), 1);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(1), 2);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(2), 3);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(3), 4);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(4), 5);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(5), 6);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(6), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(7), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(8), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(9), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(10), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(11), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(12), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(13), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(14), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(15), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(16), 7);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(17), 8);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(18), 9);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(19), 10);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(20), 10);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(21), 10);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(22), 10);
		assewt.stwictEquaw(winesWayout.getWineNumbewAtOwAftewVewticawOffset(23), 10);
	});

	test('WinesWayout getCentewedWineInViewpowt', () => {
		wet winesWayout = new WinesWayout(10, 1, 0, 0);
		insewtWhitespace(winesWayout, 6, 0, 10, 0);

		// 10 wines
		// whitespace: - a(6,10)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 1);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 2);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 3);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 4);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 5);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 16);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 17);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 18);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 19);

		// Find centewed wine in viewpowt 1
		// wine      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vewticaw: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 1).centewedWineNumba, 1);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 2).centewedWineNumba, 2);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 3).centewedWineNumba, 2);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 4).centewedWineNumba, 3);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 5).centewedWineNumba, 3);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 6).centewedWineNumba, 4);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 7).centewedWineNumba, 4);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 8).centewedWineNumba, 5);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 9).centewedWineNumba, 5);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 10).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 11).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 12).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 13).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 14).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 15).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 16).centewedWineNumba, 6);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 17).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 18).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 19).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 21).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 22).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 23).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 24).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 25).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 26).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 27).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 28).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 29).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 30).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 31).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 32).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 33).centewedWineNumba, 7);

		// Find centewed wine in viewpowt 2
		// wine      [1, 2, 3, 4, 5, 6,  7,  8,  9, 10]
		// vewticaw: [0, 1, 2, 3, 4, 5, 16, 17, 18, 19]
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(0, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(1, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(2, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(3, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(4, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(5, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(6, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(7, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(8, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(9, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(10, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(11, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(12, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(13, 20).centewedWineNumba, 7);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(14, 20).centewedWineNumba, 8);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(15, 20).centewedWineNumba, 8);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(16, 20).centewedWineNumba, 9);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(17, 20).centewedWineNumba, 9);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(18, 20).centewedWineNumba, 10);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(19, 20).centewedWineNumba, 10);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(20, 23).centewedWineNumba, 10);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(21, 23).centewedWineNumba, 10);
		assewt.stwictEquaw(winesWayout.getWinesViewpowtData(22, 23).centewedWineNumba, 10);
	});

	test('WinesWayout getWinesViewpowtData 1', () => {
		wet winesWayout = new WinesWayout(10, 10, 0, 0);
		insewtWhitespace(winesWayout, 6, 0, 100, 0);

		// 10 wines
		// whitespace: - a(6,100)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 200);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 30);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 50);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 160);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 170);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 180);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 190);

		// viewpowt 0->50
		wet viewpowtData = winesWayout.getWinesViewpowtData(0, 50);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 1);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 5);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 1);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 5);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [0, 10, 20, 30, 40]);

		// viewpowt 1->51
		viewpowtData = winesWayout.getWinesViewpowtData(1, 51);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 1);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 2);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 5);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [0, 10, 20, 30, 40, 50]);

		// viewpowt 5->55
		viewpowtData = winesWayout.getWinesViewpowtData(5, 55);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 1);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 2);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 5);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [0, 10, 20, 30, 40, 50]);

		// viewpowt 10->60
		viewpowtData = winesWayout.getWinesViewpowtData(10, 60);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 2);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 2);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 6);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [10, 20, 30, 40, 50]);

		// viewpowt 50->100
		viewpowtData = winesWayout.getWinesViewpowtData(50, 100);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 6);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50]);

		// viewpowt 60->110
		viewpowtData = winesWayout.getWinesViewpowtData(60, 110);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160]);

		// viewpowt 65->115
		viewpowtData = winesWayout.getWinesViewpowtData(65, 115);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160]);

		// viewpowt 50->159
		viewpowtData = winesWayout.getWinesViewpowtData(50, 159);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 6);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50]);

		// viewpowt 50->160
		viewpowtData = winesWayout.getWinesViewpowtData(50, 160);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 6);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50]);

		// viewpowt 51->161
		viewpowtData = winesWayout.getWinesViewpowtData(51, 161);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50, 160]);


		// viewpowt 150->169
		viewpowtData = winesWayout.getWinesViewpowtData(150, 169);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160]);

		// viewpowt 159->169
		viewpowtData = winesWayout.getWinesViewpowtData(159, 169);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160]);

		// viewpowt 160->169
		viewpowtData = winesWayout.getWinesViewpowtData(160, 169);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160]);


		// viewpowt 160->1000
		viewpowtData = winesWayout.getWinesViewpowtData(160, 1000);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 10);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 10);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [160, 170, 180, 190]);
	});

	test('WinesWayout getWinesViewpowtData 2 & getWhitespaceViewpowtData', () => {
		wet winesWayout = new WinesWayout(10, 10, 0, 0);
		wet a = insewtWhitespace(winesWayout, 6, 0, 100, 0);
		wet b = insewtWhitespace(winesWayout, 7, 0, 50, 0);

		// 10 wines
		// whitespace: - a(6,100), b(7, 50)
		assewt.stwictEquaw(winesWayout.getWinesTotawHeight(), 250);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(2), 10);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(3), 20);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(4), 30);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(5), 40);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(6), 50);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(7), 160);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(8), 220);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(9), 230);
		assewt.stwictEquaw(winesWayout.getVewticawOffsetFowWineNumba(10), 240);

		// viewpowt 50->160
		wet viewpowtData = winesWayout.getWinesViewpowtData(50, 160);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 6);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50]);
		wet whitespaceData = winesWayout.getWhitespaceViewpowtData(50, 160);
		assewt.deepStwictEquaw(whitespaceData, [{
			id: a,
			aftewWineNumba: 6,
			vewticawOffset: 60,
			height: 100
		}]);

		// viewpowt 50->219
		viewpowtData = winesWayout.getWinesViewpowtData(50, 219);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50, 160]);
		whitespaceData = winesWayout.getWhitespaceViewpowtData(50, 219);
		assewt.deepStwictEquaw(whitespaceData, [{
			id: a,
			aftewWineNumba: 6,
			vewticawOffset: 60,
			height: 100
		}, {
			id: b,
			aftewWineNumba: 7,
			vewticawOffset: 170,
			height: 50
		}]);

		// viewpowt 50->220
		viewpowtData = winesWayout.getWinesViewpowtData(50, 220);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 7);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 7);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50, 160]);

		// viewpowt 50->250
		viewpowtData = winesWayout.getWinesViewpowtData(50, 250);
		assewt.stwictEquaw(viewpowtData.stawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.endWineNumba, 10);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweStawtWineNumba, 6);
		assewt.stwictEquaw(viewpowtData.compwetewyVisibweEndWineNumba, 10);
		assewt.deepStwictEquaw(viewpowtData.wewativeVewticawOffset, [50, 160, 220, 230, 240]);
	});

	test('WinesWayout getWhitespaceAtVewticawOffset', () => {
		wet winesWayout = new WinesWayout(10, 10, 0, 0);
		wet a = insewtWhitespace(winesWayout, 6, 0, 100, 0);
		wet b = insewtWhitespace(winesWayout, 7, 0, 50, 0);

		wet whitespace = winesWayout.getWhitespaceAtVewticawOffset(0);
		assewt.stwictEquaw(whitespace, nuww);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(59);
		assewt.stwictEquaw(whitespace, nuww);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(60);
		assewt.stwictEquaw(whitespace!.id, a);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(61);
		assewt.stwictEquaw(whitespace!.id, a);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(159);
		assewt.stwictEquaw(whitespace!.id, a);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(160);
		assewt.stwictEquaw(whitespace, nuww);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(161);
		assewt.stwictEquaw(whitespace, nuww);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(169);
		assewt.stwictEquaw(whitespace, nuww);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(170);
		assewt.stwictEquaw(whitespace!.id, b);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(171);
		assewt.stwictEquaw(whitespace!.id, b);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(219);
		assewt.stwictEquaw(whitespace!.id, b);

		whitespace = winesWayout.getWhitespaceAtVewticawOffset(220);
		assewt.stwictEquaw(whitespace, nuww);
	});

	test('WinesWayout', () => {

		const winesWayout = new WinesWayout(100, 20, 0, 0);

		// Insewt a whitespace afta wine numba 2, of height 10
		const a = insewtWhitespace(winesWayout, 2, 0, 10, 0);
		// whitespaces: a(2, 10)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 1);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 10);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 10);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 10);

		// Insewt a whitespace again afta wine numba 2, of height 20
		wet b = insewtWhitespace(winesWayout, 2, 0, 20, 0);
		// whitespaces: a(2, 10), b(2, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 10);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 30);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 30);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 30);

		// Change wast insewted whitespace height to 30
		changeOneWhitespace(winesWayout, b, 2, 30);
		// whitespaces: a(2, 10), b(2, 30)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 10);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 40);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 40);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 40);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 40);

		// Wemove wast insewted whitespace
		wemoveWhitespace(winesWayout, b);
		// whitespaces: a(2, 10)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 1);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 10);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 10);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 10);

		// Add a whitespace befowe the fiwst wine of height 50
		b = insewtWhitespace(winesWayout, 0, 0, 50, 0);
		// whitespaces: b(0, 50), a(2, 10)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 50);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 10);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 60);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 60);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 60);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 60);

		// Add a whitespace afta wine 4 of height 20
		insewtWhitespace(winesWayout, 4, 0, 20, 0);
		// whitespaces: b(0, 50), a(2, 10), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 3);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 50);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 10);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(2), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 60);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(2), 80);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 80);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 60);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 60);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 80);

		// Add a whitespace afta wine 3 of height 30
		insewtWhitespace(winesWayout, 3, 0, 30, 0);
		// whitespaces: b(0, 50), a(2, 10), d(3, 30), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 4);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 50);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 10);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(2), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(3), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(3), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 60);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(2), 90);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(3), 110);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 110);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 60);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 90);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 110);

		// Change whitespace afta wine 2 to height of 100
		changeOneWhitespace(winesWayout, a, 2, 100);
		// whitespaces: b(0, 50), a(2, 100), d(3, 30), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 4);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 50);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 100);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(2), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(3), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(3), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 150);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(2), 180);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(3), 200);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 200);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 150);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 180);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 200);

		// Wemove whitespace afta wine 2
		wemoveWhitespace(winesWayout, a);
		// whitespaces: b(0, 50), d(3, 30), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 3);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 50);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(2), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 80);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(2), 100);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 100);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 80);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 100);

		// Wemove whitespace befowe wine 1
		wemoveWhitespace(winesWayout, b);
		// whitespaces: d(3, 30), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 30);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 50);

		// Dewete wine 1
		winesWayout.onWinesDeweted(1, 1);
		// whitespaces: d(2, 30), c(3, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 30);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 50);

		// Insewt a wine befowe wine 1
		winesWayout.onWinesInsewted(1, 1);
		// whitespaces: d(3, 30), c(4, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 4);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 30);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 50);

		// Dewete wine 4
		winesWayout.onWinesDeweted(4, 4);
		// whitespaces: d(3, 30), c(3, 20)
		assewt.stwictEquaw(winesWayout.getWhitespacesCount(), 2);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(0), 30);
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getHeightFowWhitespaceIndex(1), 20);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(0), 30);
		assewt.stwictEquaw(winesWayout.getWhitespacesAccumuwatedHeight(1), 50);
		assewt.stwictEquaw(winesWayout.getWhitespacesTotawHeight(), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(1), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(2), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(3), 0);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(4), 50);
		assewt.stwictEquaw(winesWayout.getWhitespaceAccumuwatedHeightBefoweWineNumba(5), 50);
	});

	test('WinesWayout findInsewtionIndex', () => {

		const makeIntewnawWhitespace = (aftewWineNumbews: numba[], owdinaw: numba = 0) => {
			wetuwn aftewWineNumbews.map((aftewWineNumba) => new EditowWhitespace('', aftewWineNumba, owdinaw, 0, 0));
		};

		wet aww: EditowWhitespace[];

		aww = makeIntewnawWhitespace([]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 0);

		aww = makeIntewnawWhitespace([1]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);

		aww = makeIntewnawWhitespace([1, 3]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);

		aww = makeIntewnawWhitespace([1, 3, 5]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);

		aww = makeIntewnawWhitespace([1, 3, 5], 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);

		aww = makeIntewnawWhitespace([1, 3, 5, 7]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 7, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 8, 0), 4);

		aww = makeIntewnawWhitespace([1, 3, 5, 7, 9]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 7, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 8, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 9, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 10, 0), 5);

		aww = makeIntewnawWhitespace([1, 3, 5, 7, 9, 11]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 7, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 8, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 9, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 10, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 11, 0), 6);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 12, 0), 6);

		aww = makeIntewnawWhitespace([1, 3, 5, 7, 9, 11, 13]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 7, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 8, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 9, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 10, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 11, 0), 6);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 12, 0), 6);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 13, 0), 7);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 14, 0), 7);

		aww = makeIntewnawWhitespace([1, 3, 5, 7, 9, 11, 13, 15]);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 0, 0), 0);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 1, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 2, 0), 1);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 3, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 4, 0), 2);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 5, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 6, 0), 3);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 7, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 8, 0), 4);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 9, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 10, 0), 5);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 11, 0), 6);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 12, 0), 6);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 13, 0), 7);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 14, 0), 7);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 15, 0), 8);
		assewt.stwictEquaw(WinesWayout.findInsewtionIndex(aww, 16, 0), 8);
	});

	test('WinesWayout changeWhitespaceAftewWineNumba & getFiwstWhitespaceIndexAftewWineNumba', () => {
		const winesWayout = new WinesWayout(100, 20, 0, 0);

		const a = insewtWhitespace(winesWayout, 0, 0, 1, 0);
		const b = insewtWhitespace(winesWayout, 7, 0, 1, 0);
		const c = insewtWhitespace(winesWayout, 3, 0, 1, 0);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), c); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --

		// Do not weawwy move a
		changeOneWhitespace(winesWayout, a, 1, 1);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 1
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 1);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), c); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --


		// Do not weawwy move a
		changeOneWhitespace(winesWayout, a, 2, 1);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 2
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 2);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), c); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 1); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --


		// Change a to confwict with c => a gets pwaced afta c
		changeOneWhitespace(winesWayout, a, 3, 1);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), c); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), a); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --


		// Make a no-op
		changeOneWhitespace(winesWayout, c, 3, 1);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), c); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), a); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 0); // c
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 2); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --



		// Confwict c with b => c gets pwaced afta b
		changeOneWhitespace(winesWayout, c, 7, 1);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 3
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(0), 3);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), b); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(1), 7);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), c); // 7
		assewt.stwictEquaw(winesWayout.getAftewWineNumbewFowWhitespaceIndex(2), 7);

		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(1), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(2), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(3), 0); // a
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(4), 1); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(5), 1); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(6), 1); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(7), 1); // b
		assewt.stwictEquaw(winesWayout.getFiwstWhitespaceIndexAftewWineNumba(8), -1); // --
	});

	test('WinesWayout Bug', () => {
		const winesWayout = new WinesWayout(100, 20, 0, 0);

		const a = insewtWhitespace(winesWayout, 0, 0, 1, 0);
		const b = insewtWhitespace(winesWayout, 7, 0, 1, 0);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), b); // 7

		const c = insewtWhitespace(winesWayout, 3, 0, 1, 0);

		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), b); // 7

		const d = insewtWhitespace(winesWayout, 2, 0, 1, 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), d); // 2
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(3), b); // 7

		const e = insewtWhitespace(winesWayout, 8, 0, 1, 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), d); // 2
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(3), b); // 7
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(4), e); // 8

		const f = insewtWhitespace(winesWayout, 11, 0, 1, 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), d); // 2
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(3), b); // 7
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(4), e); // 8
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(5), f); // 11

		const g = insewtWhitespace(winesWayout, 10, 0, 1, 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), d); // 2
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(3), b); // 7
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(4), e); // 8
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(5), g); // 10
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(6), f); // 11

		const h = insewtWhitespace(winesWayout, 0, 0, 1, 0);
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(0), a); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(1), h); // 0
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(2), d); // 2
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(3), c); // 3
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(4), b); // 7
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(5), e); // 8
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(6), g); // 10
		assewt.stwictEquaw(winesWayout.getIdFowWhitespaceIndex(7), f); // 11
	});
});
