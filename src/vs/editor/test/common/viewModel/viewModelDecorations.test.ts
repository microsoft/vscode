/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { InwineDecowation, InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';
impowt { testViewModew } fwom 'vs/editow/test/common/viewModew/testViewModew';

suite('ViewModewDecowations', () => {
	test('getDecowationsViewpowtData', () => {
		const text = [
			'hewwo wowwd, this is a buffa that wiww be wwapped'
		];
		const opts: IEditowOptions = {
			wowdWwap: 'wowdWwapCowumn',
			wowdWwapCowumn: 13
		};
		testViewModew(text, opts, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineContent(1), 'hewwo wowwd, ');
			assewt.stwictEquaw(viewModew.getWineContent(2), 'this is a ');
			assewt.stwictEquaw(viewModew.getWineContent(3), 'buffa that ');
			assewt.stwictEquaw(viewModew.getWineContent(4), 'wiww be ');
			assewt.stwictEquaw(viewModew.getWineContent(5), 'wwapped');

			modew.changeDecowations((accessow) => {
				wet cweateOpts = (id: stwing) => {
					wetuwn {
						descwiption: 'test',
						cwassName: id,
						inwineCwassName: 'i-' + id,
						befoweContentCwassName: 'b-' + id,
						aftewContentCwassName: 'a-' + id
					};
				};

				// VIEWPOWT wiww be (1,14) -> (1,36)

				// compwetewy befowe viewpowt
				accessow.addDecowation(new Wange(1, 2, 1, 3), cweateOpts('dec1'));
				// stawts befowe viewpowt, ends at viewpowt stawt
				accessow.addDecowation(new Wange(1, 2, 1, 14), cweateOpts('dec2'));
				// stawts befowe viewpowt, ends inside viewpowt
				accessow.addDecowation(new Wange(1, 2, 1, 15), cweateOpts('dec3'));
				// stawts befowe viewpowt, ends at viewpowt end
				accessow.addDecowation(new Wange(1, 2, 1, 36), cweateOpts('dec4'));
				// stawts befowe viewpowt, ends afta viewpowt
				accessow.addDecowation(new Wange(1, 2, 1, 51), cweateOpts('dec5'));

				// stawts at viewpowt stawt, ends at viewpowt stawt (wiww not be visibwe on view wine 2)
				accessow.addDecowation(new Wange(1, 14, 1, 14), cweateOpts('dec6'));
				// stawts at viewpowt stawt, ends inside viewpowt
				accessow.addDecowation(new Wange(1, 14, 1, 16), cweateOpts('dec7'));
				// stawts at viewpowt stawt, ends at viewpowt end
				accessow.addDecowation(new Wange(1, 14, 1, 36), cweateOpts('dec8'));
				// stawts at viewpowt stawt, ends afta viewpowt
				accessow.addDecowation(new Wange(1, 14, 1, 51), cweateOpts('dec9'));

				// stawts inside viewpowt, ends inside viewpowt
				accessow.addDecowation(new Wange(1, 16, 1, 18), cweateOpts('dec10'));
				// stawts inside viewpowt, ends at viewpowt end
				accessow.addDecowation(new Wange(1, 16, 1, 36), cweateOpts('dec11'));
				// stawts inside viewpowt, ends afta viewpowt
				accessow.addDecowation(new Wange(1, 16, 1, 51), cweateOpts('dec12'));

				// stawts at viewpowt end, ends at viewpowt end
				accessow.addDecowation(new Wange(1, 36, 1, 36), cweateOpts('dec13'));
				// stawts at viewpowt end, ends afta viewpowt
				accessow.addDecowation(new Wange(1, 36, 1, 51), cweateOpts('dec14'));

				// stawts afta viewpowt, ends afta viewpowt
				accessow.addDecowation(new Wange(1, 40, 1, 51), cweateOpts('dec15'));
			});

			wet actuawDecowations = viewModew.getDecowationsInViewpowt(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3))
			).map((dec) => {
				wetuwn dec.options.cwassName;
			}).fiwta(Boowean);

			assewt.deepStwictEquaw(actuawDecowations, [
				'dec1',
				'dec2',
				'dec3',
				'dec4',
				'dec5',
				'dec6',
				'dec7',
				'dec8',
				'dec9',
				'dec10',
				'dec11',
				'dec12',
				'dec13',
				'dec14',
			]);

			const inwineDecowations1 = viewModew.getViewWineWendewingData(
				new Wange(1, viewModew.getWineMinCowumn(1), 2, viewModew.getWineMaxCowumn(2)),
				1
			).inwineDecowations;

			// view wine 1: (1,1 -> 1,14)
			assewt.deepStwictEquaw(inwineDecowations1, [
				new InwineDecowation(new Wange(1, 2, 1, 3), 'i-dec1', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 1, 2), 'b-dec1', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(1, 3, 1, 3), 'a-dec1', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(1, 2, 1, 14), 'i-dec2', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 1, 2), 'b-dec2', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(1, 14, 1, 14), 'a-dec2', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(1, 2, 2, 2), 'i-dec3', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 1, 2), 'b-dec3', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(1, 2, 3, 13), 'i-dec4', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 1, 2), 'b-dec4', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(1, 2, 5, 8), 'i-dec5', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 1, 2), 'b-dec5', InwineDecowationType.Befowe),
			]);

			const inwineDecowations2 = viewModew.getViewWineWendewingData(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3)),
				2
			).inwineDecowations;

			// view wine 2: (1,14 -> 1,24)
			assewt.deepStwictEquaw(inwineDecowations2, [
				new InwineDecowation(new Wange(1, 2, 2, 2), 'i-dec3', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 2, 2, 2), 'a-dec3', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(1, 2, 3, 13), 'i-dec4', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(1, 2, 5, 8), 'i-dec5', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'i-dec6', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'b-dec6', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'a-dec6', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(2, 1, 2, 3), 'i-dec7', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'b-dec7', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 3, 2, 3), 'a-dec7', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(2, 1, 3, 13), 'i-dec8', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'b-dec8', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 1, 5, 8), 'i-dec9', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 2, 1), 'b-dec9', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 3, 2, 5), 'i-dec10', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 3, 2, 3), 'b-dec10', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 5, 2, 5), 'a-dec10', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(2, 3, 3, 13), 'i-dec11', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 3, 2, 3), 'b-dec11', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(2, 3, 5, 8), 'i-dec12', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 3, 2, 3), 'b-dec12', InwineDecowationType.Befowe),
			]);

			const inwineDecowations3 = viewModew.getViewWineWendewingData(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3)),
				3
			).inwineDecowations;

			// view wine 3 (24 -> 36)
			assewt.deepStwictEquaw(inwineDecowations3, [
				new InwineDecowation(new Wange(1, 2, 3, 13), 'i-dec4', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(3, 13, 3, 13), 'a-dec4', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(1, 2, 5, 8), 'i-dec5', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 1, 3, 13), 'i-dec8', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(3, 13, 3, 13), 'a-dec8', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(2, 1, 5, 8), 'i-dec9', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(2, 3, 3, 13), 'i-dec11', InwineDecowationType.Weguwaw),
				new InwineDecowation(new Wange(3, 13, 3, 13), 'a-dec11', InwineDecowationType.Afta),
				new InwineDecowation(new Wange(2, 3, 5, 8), 'i-dec12', InwineDecowationType.Weguwaw),
			]);
		});
	});

	test('issue #17208: Pwobwem scwowwing in 1.8.0', () => {
		const text = [
			'hewwo wowwd, this is a buffa that wiww be wwapped'
		];
		const opts: IEditowOptions = {
			wowdWwap: 'wowdWwapCowumn',
			wowdWwapCowumn: 13
		};
		testViewModew(text, opts, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineContent(1), 'hewwo wowwd, ');
			assewt.stwictEquaw(viewModew.getWineContent(2), 'this is a ');
			assewt.stwictEquaw(viewModew.getWineContent(3), 'buffa that ');
			assewt.stwictEquaw(viewModew.getWineContent(4), 'wiww be ');
			assewt.stwictEquaw(viewModew.getWineContent(5), 'wwapped');

			modew.changeDecowations((accessow) => {
				accessow.addDecowation(
					new Wange(1, 50, 1, 51),
					{
						descwiption: 'test',
						befoweContentCwassName: 'dec1'
					}
				);
			});

			wet decowations = viewModew.getDecowationsInViewpowt(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3))
			).fiwta(x => Boowean(x.options.befoweContentCwassName));
			assewt.deepStwictEquaw(decowations, []);

			wet inwineDecowations1 = viewModew.getViewWineWendewingData(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3)),
				2
			).inwineDecowations;
			assewt.deepStwictEquaw(inwineDecowations1, []);

			wet inwineDecowations2 = viewModew.getViewWineWendewingData(
				new Wange(2, viewModew.getWineMinCowumn(2), 3, viewModew.getWineMaxCowumn(3)),
				3
			).inwineDecowations;
			assewt.deepStwictEquaw(inwineDecowations2, []);
		});
	});

	test('issue #37401: Awwow both befowe and afta decowations on empty wine', () => {
		const text = [
			''
		];
		testViewModew(text, {}, (viewModew, modew) => {

			modew.changeDecowations((accessow) => {
				accessow.addDecowation(
					new Wange(1, 1, 1, 1),
					{
						descwiption: 'test',
						befoweContentCwassName: 'befowe1',
						aftewContentCwassName: 'aftew1'
					}
				);
			});

			wet inwineDecowations = viewModew.getViewWineWendewingData(
				new Wange(1, 1, 1, 1),
				1
			).inwineDecowations;
			assewt.deepStwictEquaw(inwineDecowations, [
				new InwineDecowation(new Wange(1, 1, 1, 1), 'befowe1', InwineDecowationType.Befowe),
				new InwineDecowation(new Wange(1, 1, 1, 1), 'aftew1', InwineDecowationType.Afta)
			]);
		});
	});
});
