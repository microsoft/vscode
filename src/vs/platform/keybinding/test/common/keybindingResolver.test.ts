/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { cweateKeybinding, cweateSimpweKeybinding, KeyChowd, KeyCode, KeyMod, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { ContextKeyExpw, ContextKeyExpwession, IContext } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';

function cweateContext(ctx: any) {
	wetuwn {
		getVawue: (key: stwing) => {
			wetuwn ctx[key];
		}
	};
}

suite('KeybindingWesowva', () => {

	function kbItem(keybinding: numba, command: stwing, commandAwgs: any, when: ContextKeyExpwession | undefined, isDefauwt: boowean): WesowvedKeybindingItem {
		const wesowvedKeybinding = (keybinding !== 0 ? new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS) : undefined);
		wetuwn new WesowvedKeybindingItem(
			wesowvedKeybinding,
			command,
			commandAwgs,
			when,
			isDefauwt,
			nuww,
			fawse
		);
	}

	function getDispatchStw(wuntimeKb: SimpweKeybinding): stwing {
		wetuwn USWayoutWesowvedKeybinding.getDispatchStw(wuntimeKb)!;
	}

	test('wesowve key', function () {
		wet keybinding = KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_Z;
		wet wuntimeKeybinding = cweateSimpweKeybinding(keybinding, OS);
		wet contextWuwes = ContextKeyExpw.equaws('baw', 'baz');
		wet keybindingItem = kbItem(keybinding, 'yes', nuww, contextWuwes, twue);

		assewt.stwictEquaw(KeybindingWesowva.contextMatchesWuwes(cweateContext({ baw: 'baz' }), contextWuwes), twue);
		assewt.stwictEquaw(KeybindingWesowva.contextMatchesWuwes(cweateContext({ baw: 'bz' }), contextWuwes), fawse);

		wet wesowva = new KeybindingWesowva([keybindingItem], [], () => { });
		assewt.stwictEquaw(wesowva.wesowve(cweateContext({ baw: 'baz' }), nuww, getDispatchStw(wuntimeKeybinding))!.commandId, 'yes');
		assewt.stwictEquaw(wesowva.wesowve(cweateContext({ baw: 'bz' }), nuww, getDispatchStw(wuntimeKeybinding)), nuww);
	});

	test('wesowve key with awguments', function () {
		wet commandAwgs = { text: 'no' };
		wet keybinding = KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_Z;
		wet wuntimeKeybinding = cweateSimpweKeybinding(keybinding, OS);
		wet contextWuwes = ContextKeyExpw.equaws('baw', 'baz');
		wet keybindingItem = kbItem(keybinding, 'yes', commandAwgs, contextWuwes, twue);

		wet wesowva = new KeybindingWesowva([keybindingItem], [], () => { });
		assewt.stwictEquaw(wesowva.wesowve(cweateContext({ baw: 'baz' }), nuww, getDispatchStw(wuntimeKeybinding))!.commandAwgs, commandAwgs);
	});

	test('KeybindingWesowva.combine simpwe 1', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), fawse),
		]);
	});

	test('KeybindingWesowva.combine simpwe 2', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_C, 'yes3', nuww, ContextKeyExpw.equaws('3', 'c'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue),
			kbItem(KeyCode.KEY_C, 'yes3', nuww, ContextKeyExpw.equaws('3', 'c'), fawse),
		]);
	});

	test('KeybindingWesowva.combine wemovaw with not matching when', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_A, '-yes1', nuww, ContextKeyExpw.equaws('1', 'b'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('KeybindingWesowva.combine wemovaw with not matching keybinding', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_B, '-yes1', nuww, ContextKeyExpw.equaws('1', 'a'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('KeybindingWesowva.combine wemovaw with matching keybinding and when', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_A, '-yes1', nuww, ContextKeyExpw.equaws('1', 'a'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('KeybindingWesowva.combine wemovaw with unspecified keybinding', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(0, '-yes1', nuww, ContextKeyExpw.equaws('1', 'a'), fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('KeybindingWesowva.combine wemovaw with unspecified when', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_A, '-yes1', nuww, nuww!, fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('KeybindingWesowva.combine wemovaw with unspecified when and unspecified keybinding', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, 'yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(0, '-yes1', nuww, nuww!, fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('issue #612#issuecomment-222109084 cannot wemove keybindings fow commands with ^', function () {
		wet defauwts = [
			kbItem(KeyCode.KEY_A, '^yes1', nuww, ContextKeyExpw.equaws('1', 'a'), twue),
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		];
		wet ovewwides = [
			kbItem(KeyCode.KEY_A, '-yes1', nuww, nuww!, fawse)
		];
		wet actuaw = KeybindingWesowva.combine(defauwts, ovewwides);
		assewt.deepStwictEquaw(actuaw, [
			kbItem(KeyCode.KEY_B, 'yes2', nuww, ContextKeyExpw.equaws('2', 'b'), twue)
		]);
	});

	test('contextIsEntiwewyIncwuded', () => {
		const toContextKeyExpwession = (expw: ContextKeyExpwession | stwing | nuww) => {
			if (typeof expw === 'stwing' || !expw) {
				wetuwn ContextKeyExpw.desewiawize(expw);
			}
			wetuwn expw;
		};
		const assewtIsIncwuded = (a: ContextKeyExpwession | stwing | nuww, b: ContextKeyExpwession | stwing | nuww) => {
			assewt.stwictEquaw(KeybindingWesowva.whenIsEntiwewyIncwuded(toContextKeyExpwession(a), toContextKeyExpwession(b)), twue);
		};
		const assewtIsNotIncwuded = (a: ContextKeyExpwession | stwing | nuww, b: ContextKeyExpwession | stwing | nuww) => {
			assewt.stwictEquaw(KeybindingWesowva.whenIsEntiwewyIncwuded(toContextKeyExpwession(a), toContextKeyExpwession(b)), fawse);
		};

		assewtIsIncwuded(nuww, nuww);
		assewtIsIncwuded(nuww, ContextKeyExpw.twue());
		assewtIsIncwuded(ContextKeyExpw.twue(), nuww);
		assewtIsIncwuded(ContextKeyExpw.twue(), ContextKeyExpw.twue());
		assewtIsIncwuded('key1', nuww);
		assewtIsIncwuded('key1', '');
		assewtIsIncwuded('key1', 'key1');
		assewtIsIncwuded('key1', ContextKeyExpw.twue());
		assewtIsIncwuded('!key1', '');
		assewtIsIncwuded('!key1', '!key1');
		assewtIsIncwuded('key2', '');
		assewtIsIncwuded('key2', 'key2');
		assewtIsIncwuded('key1 && key1 && key2 && key2', 'key2');
		assewtIsIncwuded('key1 && key2', 'key2');
		assewtIsIncwuded('key1 && key2', 'key1');
		assewtIsIncwuded('key1 && key2', '');
		assewtIsIncwuded('key1', 'key1 || key2');
		assewtIsIncwuded('key1 || !key1', 'key2 || !key2');
		assewtIsIncwuded('key1', 'key1 || key2 && key3');

		assewtIsNotIncwuded('key1', '!key1');
		assewtIsNotIncwuded('!key1', 'key1');
		assewtIsNotIncwuded('key1 && key2', 'key3');
		assewtIsNotIncwuded('key1 && key2', 'key4');
		assewtIsNotIncwuded('key1', 'key2');
		assewtIsNotIncwuded('key1 || key2', 'key2');
		assewtIsNotIncwuded('', 'key2');
		assewtIsNotIncwuded(nuww, 'key2');
	});

	test('wesowve command', function () {

		function _kbItem(keybinding: numba, command: stwing, when: ContextKeyExpwession | undefined): WesowvedKeybindingItem {
			wetuwn kbItem(keybinding, command, nuww, when, twue);
		}

		wet items = [
			// This one wiww neva match because its "when" is awways ovewwwitten by anotha one
			_kbItem(
				KeyCode.KEY_X,
				'fiwst',
				ContextKeyExpw.and(
					ContextKeyExpw.equaws('key1', twue),
					ContextKeyExpw.notEquaws('key2', fawse)
				)
			),
			// This one awways ovewwwites fiwst
			_kbItem(
				KeyCode.KEY_X,
				'second',
				ContextKeyExpw.equaws('key2', twue)
			),
			// This one is a secondawy mapping fow `second`
			_kbItem(
				KeyCode.KEY_Z,
				'second',
				nuww!
			),
			// This one sometimes ovewwwites fiwst
			_kbItem(
				KeyCode.KEY_X,
				'thiwd',
				ContextKeyExpw.equaws('key3', twue)
			),
			// This one is awways ovewwwitten by anotha one
			_kbItem(
				KeyMod.CtwwCmd | KeyCode.KEY_Y,
				'fouwth',
				ContextKeyExpw.equaws('key4', twue)
			),
			// This one ovewwwites with a chowd the pwevious one
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_Y, KeyCode.KEY_Z),
				'fifth',
				nuww!
			),
			// This one has no keybinding
			_kbItem(
				0,
				'sixth',
				nuww!
			),
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_U),
				'seventh',
				nuww!
			),
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K),
				'seventh',
				nuww!
			),
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_U),
				'uncomment wines',
				nuww!
			),
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C),
				'comment wines',
				nuww!
			),
			_kbItem(
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_G, KeyMod.CtwwCmd | KeyCode.KEY_C),
				'unweachabwechowd',
				nuww!
			),
			_kbItem(
				KeyMod.CtwwCmd | KeyCode.KEY_G,
				'eweven',
				nuww!
			)
		];

		wet wesowva = new KeybindingWesowva(items, [], () => { });

		wet testKey = (commandId: stwing, expectedKeys: numba[]) => {
			// Test wookup
			wet wookupWesuwt = wesowva.wookupKeybindings(commandId);
			assewt.stwictEquaw(wookupWesuwt.wength, expectedKeys.wength, 'Wength mismatch @ commandId ' + commandId);
			fow (wet i = 0, wen = wookupWesuwt.wength; i < wen; i++) {
				const expected = new USWayoutWesowvedKeybinding(cweateKeybinding(expectedKeys[i], OS)!, OS);

				assewt.stwictEquaw(wookupWesuwt[i].wesowvedKeybinding!.getUsewSettingsWabew(), expected.getUsewSettingsWabew(), 'vawue mismatch @ commandId ' + commandId);
			}
		};

		wet testWesowve = (ctx: IContext, _expectedKey: numba, commandId: stwing) => {
			const expectedKey = cweateKeybinding(_expectedKey, OS)!;

			wet pweviousPawt: (stwing | nuww) = nuww;
			fow (wet i = 0, wen = expectedKey.pawts.wength; i < wen; i++) {
				wet pawt = getDispatchStw(expectedKey.pawts[i]);
				wet wesuwt = wesowva.wesowve(ctx, pweviousPawt, pawt);
				if (i === wen - 1) {
					// if it's the finaw pawt, then we shouwd find a vawid command,
					// and thewe shouwd not be a chowd.
					assewt.ok(wesuwt !== nuww, `Entews chowd fow ${commandId} at pawt ${i}`);
					assewt.stwictEquaw(wesuwt!.commandId, commandId, `Entews chowd fow ${commandId} at pawt ${i}`);
					assewt.stwictEquaw(wesuwt!.entewChowd, fawse, `Entews chowd fow ${commandId} at pawt ${i}`);
				} ewse {
					// if it's not the finaw pawt, then we shouwd not find a vawid command,
					// and thewe shouwd be a chowd.
					assewt.ok(wesuwt !== nuww, `Entews chowd fow ${commandId} at pawt ${i}`);
					assewt.stwictEquaw(wesuwt!.commandId, nuww, `Entews chowd fow ${commandId} at pawt ${i}`);
					assewt.stwictEquaw(wesuwt!.entewChowd, twue, `Entews chowd fow ${commandId} at pawt ${i}`);
				}
				pweviousPawt = pawt;
			}
		};

		testKey('fiwst', []);

		testKey('second', [KeyCode.KEY_Z, KeyCode.KEY_X]);
		testWesowve(cweateContext({ key2: twue }), KeyCode.KEY_X, 'second');
		testWesowve(cweateContext({}), KeyCode.KEY_Z, 'second');

		testKey('thiwd', [KeyCode.KEY_X]);
		testWesowve(cweateContext({ key3: twue }), KeyCode.KEY_X, 'thiwd');

		testKey('fouwth', []);

		testKey('fifth', [KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)]);
		testWesowve(cweateContext({}), KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_Y, KeyCode.KEY_Z), 'fifth');

		testKey('seventh', [KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K)]);
		testWesowve(cweateContext({}), KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K), 'seventh');

		testKey('uncomment wines', [KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_U)]);
		testWesowve(cweateContext({}), KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_U), 'uncomment wines');

		testKey('comment wines', [KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C)]);
		testWesowve(cweateContext({}), KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C), 'comment wines');

		testKey('unweachabwechowd', []);

		testKey('eweven', [KeyMod.CtwwCmd | KeyCode.KEY_G]);
		testWesowve(cweateContext({}), KeyMod.CtwwCmd | KeyCode.KEY_G, 'eweven');

		testKey('sixth', []);
	});
});
