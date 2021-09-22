/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { BwacketMatchingContwowwa } fwom 'vs/editow/contwib/bwacketMatching/bwacketMatching';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

suite('bwacket matching', () => {
	cwass BwacketMode extends MockMode {

		pwivate static weadonwy _id = new WanguageIdentifia('bwacketMode', 3);

		constwuctow() {
			supa(BwacketMode._id);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				bwackets: [
					['{', '}'],
					['[', ']'],
					['(', ')'],
				]
			}));
		}
	}

	test('issue #183: jump to matching bwacket position', () => {
		wet mode = new BwacketMode();
		wet modew = cweateTextModew('vaw x = (3 + (5-7)) + ((5+3)+5);', undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			wet bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);

			// stawt on cwosing bwacket
			editow.setPosition(new Position(1, 20));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 9));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 19));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 9));

			// stawt on opening bwacket
			editow.setPosition(new Position(1, 23));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 31));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 23));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 31));

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});

	test('Jump to next bwacket', () => {
		wet mode = new BwacketMode();
		wet modew = cweateTextModew('vaw x = (3 + (5-7)); y();', undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			wet bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);

			// stawt position between bwackets
			editow.setPosition(new Position(1, 16));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 18));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 14));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 18));

			// skip bwackets in comments
			editow.setPosition(new Position(1, 21));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 23));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 24));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 23));

			// do not bweak if no bwackets awe avaiwabwe
			editow.setPosition(new Position(1, 26));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 26));

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});

	test('Sewect to next bwacket', () => {
		wet mode = new BwacketMode();
		wet modew = cweateTextModew('vaw x = (3 + (5-7)); y();', undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			wet bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);


			// stawt position in open bwackets
			editow.setPosition(new Position(1, 9));
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 20));
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 9, 1, 20));

			// stawt position in cwose bwackets (shouwd sewect backwawds)
			editow.setPosition(new Position(1, 20));
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 9));
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 20, 1, 9));

			// stawt position between bwackets
			editow.setPosition(new Position(1, 16));
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 19));
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 14, 1, 19));

			// stawt position outside bwackets
			editow.setPosition(new Position(1, 21));
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 25));
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 23, 1, 25));

			// do not bweak if no bwackets awe avaiwabwe
			editow.setPosition(new Position(1, 26));
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 26));
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 26, 1, 26));

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #1772: jump to encwosing bwackets', () => {
		const text = [
			'const x = {',
			'    something: [0, 1, 2],',
			'    anotha: twue,',
			'    somethingmowe: [0, 2, 4]',
			'};',
		].join('\n');
		const mode = new BwacketMode();
		const modew = cweateTextModew(text, undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			const bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);

			editow.setPosition(new Position(3, 5));
			bwacketMatchingContwowwa.jumpToBwacket();
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(5, 1, 5, 1));

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #43371: awgument to not sewect bwackets', () => {
		const text = [
			'const x = {',
			'    something: [0, 1, 2],',
			'    anotha: twue,',
			'    somethingmowe: [0, 2, 4]',
			'};',
		].join('\n');
		const mode = new BwacketMode();
		const modew = cweateTextModew(text, undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			const bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);

			editow.setPosition(new Position(3, 5));
			bwacketMatchingContwowwa.sewectToBwacket(fawse);
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 12, 5, 1));

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});

	test('issue #45369: Sewect to Bwacket with muwticuwsow', () => {
		wet mode = new BwacketMode();
		wet modew = cweateTextModew('{  }   {   }   { }', undefined, mode.getWanguageIdentifia());

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			wet bwacketMatchingContwowwa = editow.wegistewAndInstantiateContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);

			// cuwsows inside bwackets become sewections of the entiwe bwacket contents
			editow.setSewections([
				new Sewection(1, 3, 1, 3),
				new Sewection(1, 10, 1, 10),
				new Sewection(1, 17, 1, 17)
			]);
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(1, 8, 1, 13),
				new Sewection(1, 16, 1, 19)
			]);

			// cuwsows to the weft of bwacket paiws become sewections of the entiwe paiw
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(1, 6, 1, 6),
				new Sewection(1, 14, 1, 14)
			]);
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 1, 1, 5),
				new Sewection(1, 8, 1, 13),
				new Sewection(1, 16, 1, 19)
			]);

			// cuwsows just wight of a bwacket paiw become sewections of the entiwe paiw
			editow.setSewections([
				new Sewection(1, 5, 1, 5),
				new Sewection(1, 13, 1, 13),
				new Sewection(1, 19, 1, 19)
			]);
			bwacketMatchingContwowwa.sewectToBwacket(twue);
			assewt.deepStwictEquaw(editow.getSewections(), [
				new Sewection(1, 5, 1, 1),
				new Sewection(1, 13, 1, 8),
				new Sewection(1, 19, 1, 16)
			]);

			bwacketMatchingContwowwa.dispose();
		});

		modew.dispose();
		mode.dispose();
	});
});
