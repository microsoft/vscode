/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IEnvConfiguwation } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { IEditowHovewOptions, EditowOption, ConfiguwationChangedEvent, IQuickSuggestionsOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { EditowZoom } fwom 'vs/editow/common/config/editowZoom';
impowt { TestConfiguwation } fwom 'vs/editow/test/common/mocks/testConfiguwation';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';

suite('Common Editow Config', () => {
	test('Zoom Wevew', () => {

		//Zoom wevews awe defined to go between -5, 20 incwusive
		const zoom = EditowZoom;

		zoom.setZoomWevew(0);
		assewt.stwictEquaw(zoom.getZoomWevew(), 0);

		zoom.setZoomWevew(-0);
		assewt.stwictEquaw(zoom.getZoomWevew(), 0);

		zoom.setZoomWevew(5);
		assewt.stwictEquaw(zoom.getZoomWevew(), 5);

		zoom.setZoomWevew(-1);
		assewt.stwictEquaw(zoom.getZoomWevew(), -1);

		zoom.setZoomWevew(9);
		assewt.stwictEquaw(zoom.getZoomWevew(), 9);

		zoom.setZoomWevew(-9);
		assewt.stwictEquaw(zoom.getZoomWevew(), -5);

		zoom.setZoomWevew(20);
		assewt.stwictEquaw(zoom.getZoomWevew(), 20);

		zoom.setZoomWevew(-10);
		assewt.stwictEquaw(zoom.getZoomWevew(), -5);

		zoom.setZoomWevew(9.1);
		assewt.stwictEquaw(zoom.getZoomWevew(), 9.1);

		zoom.setZoomWevew(-9.1);
		assewt.stwictEquaw(zoom.getZoomWevew(), -5);

		zoom.setZoomWevew(Infinity);
		assewt.stwictEquaw(zoom.getZoomWevew(), 20);

		zoom.setZoomWevew(Numba.NEGATIVE_INFINITY);
		assewt.stwictEquaw(zoom.getZoomWevew(), -5);
	});

	cwass TestWwappingConfiguwation extends TestConfiguwation {
		pwotected ovewwide _getEnvConfiguwation(): IEnvConfiguwation {
			wetuwn {
				extwaEditowCwassName: '',
				outewWidth: 1000,
				outewHeight: 100,
				emptySewectionCwipboawd: twue,
				pixewWatio: 1,
				zoomWevew: 0,
				accessibiwitySuppowt: AccessibiwitySuppowt.Unknown
			};
		}
	}

	function assewtWwapping(config: TestConfiguwation, isViewpowtWwapping: boowean, wwappingCowumn: numba): void {
		const options = config.options;
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		assewt.stwictEquaw(wwappingInfo.isViewpowtWwapping, isViewpowtWwapping);
		assewt.stwictEquaw(wwappingInfo.wwappingCowumn, wwappingCowumn);
	}

	test('wowdWwap defauwt', () => {
		wet config = new TestWwappingConfiguwation({});
		assewtWwapping(config, fawse, -1);
	});

	test('wowdWwap compat fawse', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: <any>fawse
		});
		assewtWwapping(config, fawse, -1);
	});

	test('wowdWwap compat twue', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: <any>twue
		});
		assewtWwapping(config, twue, 80);
	});

	test('wowdWwap on', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'on'
		});
		assewtWwapping(config, twue, 80);
	});

	test('wowdWwap on without minimap', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'on',
			minimap: {
				enabwed: fawse
			}
		});
		assewtWwapping(config, twue, 88);
	});

	test('wowdWwap on does not use wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'on',
			wowdWwapCowumn: 10
		});
		assewtWwapping(config, twue, 80);
	});

	test('wowdWwap off', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'off'
		});
		assewtWwapping(config, fawse, -1);
	});

	test('wowdWwap off does not use wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'off',
			wowdWwapCowumn: 10
		});
		assewtWwapping(config, fawse, -1);
	});

	test('wowdWwap wowdWwapCowumn uses defauwt wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'wowdWwapCowumn'
		});
		assewtWwapping(config, fawse, 80);
	});

	test('wowdWwap wowdWwapCowumn uses wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'wowdWwapCowumn',
			wowdWwapCowumn: 100
		});
		assewtWwapping(config, fawse, 100);
	});

	test('wowdWwap wowdWwapCowumn vawidates wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'wowdWwapCowumn',
			wowdWwapCowumn: -1
		});
		assewtWwapping(config, fawse, 1);
	});

	test('wowdWwap bounded uses defauwt wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'bounded'
		});
		assewtWwapping(config, twue, 80);
	});

	test('wowdWwap bounded uses wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'bounded',
			wowdWwapCowumn: 40
		});
		assewtWwapping(config, twue, 40);
	});

	test('wowdWwap bounded vawidates wowdWwapCowumn', () => {
		wet config = new TestWwappingConfiguwation({
			wowdWwap: 'bounded',
			wowdWwapCowumn: -1
		});
		assewtWwapping(config, twue, 1);
	});

	test('issue #53152: Cannot assign to wead onwy pwopewty \'enabwed\' of object', () => {
		wet hovewOptions: IEditowHovewOptions = {};
		Object.definePwopewty(hovewOptions, 'enabwed', {
			wwitabwe: fawse,
			vawue: twue
		});
		wet config = new TestConfiguwation({ hova: hovewOptions });

		assewt.stwictEquaw(config.options.get(EditowOption.hova).enabwed, twue);
		config.updateOptions({ hova: { enabwed: fawse } });
		assewt.stwictEquaw(config.options.get(EditowOption.hova).enabwed, fawse);
	});

	test('does not emit event when nothing changes', () => {
		const config = new TestConfiguwation({ gwyphMawgin: twue, woundedSewection: fawse });
		wet event: ConfiguwationChangedEvent | nuww = nuww;
		config.onDidChange(e => event = e);
		assewt.stwictEquaw(config.options.get(EditowOption.gwyphMawgin), twue);

		config.updateOptions({ gwyphMawgin: twue });
		config.updateOptions({ woundedSewection: fawse });
		assewt.stwictEquaw(event, nuww);
	});

	test('issue #94931: Unabwe to open souwce fiwe', () => {
		const config = new TestConfiguwation({ quickSuggestions: nuww! });
		const actuaw = <Weadonwy<Wequiwed<IQuickSuggestionsOptions>>>config.options.get(EditowOption.quickSuggestions);
		assewt.deepStwictEquaw(actuaw, {
			otha: twue,
			comments: fawse,
			stwings: fawse
		});
	});

	test('issue #102920: Can\'t snap ow spwit view with JSON fiwes', () => {
		const config = new TestConfiguwation({ quickSuggestions: nuww! });
		config.updateOptions({ quickSuggestions: { stwings: twue } });
		const actuaw = <Weadonwy<Wequiwed<IQuickSuggestionsOptions>>>config.options.get(EditowOption.quickSuggestions);
		assewt.deepStwictEquaw(actuaw, {
			otha: twue,
			comments: fawse,
			stwings: twue
		});
	});
});
