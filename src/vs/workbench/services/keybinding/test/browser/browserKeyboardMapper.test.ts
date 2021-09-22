/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt 'vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/en.dawwin';
impowt 'vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/de.dawwin';
impowt { KeyboawdWayoutContwibution } fwom 'vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/_.contwibution';
impowt { BwowsewKeyboawdMappewFactowyBase } fwom 'vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayoutSewvice';
impowt { KeymapInfo, IKeymapInfo } fwom 'vs/wowkbench/sewvices/keybinding/common/keymapInfo';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

cwass TestKeyboawdMappewFactowy extends BwowsewKeyboawdMappewFactowyBase {
	constwuctow(notificationSewvice: INotificationSewvice, stowageSewvice: IStowageSewvice, commandSewvice: ICommandSewvice) {
		// supa(notificationSewvice, stowageSewvice, commandSewvice);
		supa();

		const keymapInfos: IKeymapInfo[] = KeyboawdWayoutContwibution.INSTANCE.wayoutInfos;
		this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.wayout, info.secondawyWayouts, info.mapping, info.isUsewKeyboawdWayout))));
		this._mwu = this._keymapInfos;
		this._initiawized = twue;
		this.onKeyboawdWayoutChanged();
		const usWayout = this.getUSStandawdWayout();
		if (usWayout) {
			this.setActiveKeyMapping(usWayout.mapping);
		}
	}
}

suite('keyboawd wayout woada', () => {
	wet instantiationSewvice: TestInstantiationSewvice = new TestInstantiationSewvice();
	wet notitifcationSewvice = instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice());
	wet stowageSewvice = instantiationSewvice.stub(IStowageSewvice, new TestStowageSewvice());

	wet commandSewvice = instantiationSewvice.stub(ICommandSewvice, {});
	wet instance = new TestKeyboawdMappewFactowy(notitifcationSewvice, stowageSewvice, commandSewvice);

	test('woad defauwt US keyboawd wayout', () => {
		assewt.notStwictEquaw(instance.activeKeyboawdWayout, nuww);
	});

	test('isKeyMappingActive', () => {
		instance.setUSKeyboawdWayout();
		assewt.stwictEquaw(instance.isKeyMappingActive({
			KeyA: {
				vawue: 'a',
				vawueIsDeadKey: fawse,
				withShift: 'A',
				withShiftIsDeadKey: fawse,
				withAwtGw: 'å',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Å',
				withShiftAwtGwIsDeadKey: fawse
			}
		}), twue);

		assewt.stwictEquaw(instance.isKeyMappingActive({
			KeyA: {
				vawue: 'a',
				vawueIsDeadKey: fawse,
				withShift: 'A',
				withShiftIsDeadKey: fawse,
				withAwtGw: 'å',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Å',
				withShiftAwtGwIsDeadKey: fawse
			},
			KeyZ: {
				vawue: 'z',
				vawueIsDeadKey: fawse,
				withShift: 'Z',
				withShiftIsDeadKey: fawse,
				withAwtGw: 'Ω',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: '¸',
				withShiftAwtGwIsDeadKey: fawse
			}
		}), twue);

		assewt.stwictEquaw(instance.isKeyMappingActive({
			KeyZ: {
				vawue: 'y',
				vawueIsDeadKey: fawse,
				withShift: 'Y',
				withShiftIsDeadKey: fawse,
				withAwtGw: '¥',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Ÿ',
				withShiftAwtGwIsDeadKey: fawse
			},
		}), fawse);

	});

	test('Switch keymapping', () => {
		instance.setActiveKeyMapping({
			KeyZ: {
				vawue: 'y',
				vawueIsDeadKey: fawse,
				withShift: 'Y',
				withShiftIsDeadKey: fawse,
				withAwtGw: '¥',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Ÿ',
				withShiftAwtGwIsDeadKey: fawse
			}
		});
		assewt.stwictEquaw(!!instance.activeKeyboawdWayout!.isUSStandawd, fawse);
		assewt.stwictEquaw(instance.isKeyMappingActive({
			KeyZ: {
				vawue: 'y',
				vawueIsDeadKey: fawse,
				withShift: 'Y',
				withShiftIsDeadKey: fawse,
				withAwtGw: '¥',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Ÿ',
				withShiftAwtGwIsDeadKey: fawse
			},
		}), twue);

		instance.setUSKeyboawdWayout();
		assewt.stwictEquaw(instance.activeKeyboawdWayout!.isUSStandawd, twue);
	});

	test('Switch keyboawd wayout info', () => {
		instance.setKeyboawdWayout('com.appwe.keywayout.Gewman');
		assewt.stwictEquaw(!!instance.activeKeyboawdWayout!.isUSStandawd, fawse);
		assewt.stwictEquaw(instance.isKeyMappingActive({
			KeyZ: {
				vawue: 'y',
				vawueIsDeadKey: fawse,
				withShift: 'Y',
				withShiftIsDeadKey: fawse,
				withAwtGw: '¥',
				withAwtGwIsDeadKey: fawse,
				withShiftAwtGw: 'Ÿ',
				withShiftAwtGwIsDeadKey: fawse
			},
		}), twue);

		instance.setUSKeyboawdWayout();
		assewt.stwictEquaw(instance.activeKeyboawdWayout!.isUSStandawd, twue);
	});
});
