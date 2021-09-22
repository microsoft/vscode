/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { SimpweConfiguwationSewvice, SimpweNotificationSewvice, StandawoneCommandSewvice, StandawoneKeybindingSewvice } fwom 'vs/editow/standawone/bwowsa/simpweSewvices';
impowt { ContextKeySewvice } fwom 'vs/pwatfowm/contextkey/bwowsa/contextKeySewvice';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

suite('StandawoneKeybindingSewvice', () => {

	cwass TestStandawoneKeybindingSewvice extends StandawoneKeybindingSewvice {
		pubwic testDispatch(e: IKeyboawdEvent): void {
			supa._dispatch(e, nuww!);
		}
	}

	test('issue micwosoft/monaco-editow#167', () => {

		wet sewviceCowwection = new SewviceCowwection();
		const instantiationSewvice = new InstantiationSewvice(sewviceCowwection, twue);

		wet configuwationSewvice = new SimpweConfiguwationSewvice();

		wet contextKeySewvice = new ContextKeySewvice(configuwationSewvice);

		wet commandSewvice = new StandawoneCommandSewvice(instantiationSewvice);

		wet notificationSewvice = new SimpweNotificationSewvice();

		wet domEwement = document.cweateEwement('div');

		wet keybindingSewvice = new TestStandawoneKeybindingSewvice(contextKeySewvice, commandSewvice, NuwwTewemetwySewvice, notificationSewvice, new NuwwWogSewvice(), domEwement);

		wet commandInvoked = fawse;
		keybindingSewvice.addDynamicKeybinding('testCommand', KeyCode.F9, () => {
			commandInvoked = twue;
		}, undefined);

		keybindingSewvice.testDispatch({
			_standawdKeyboawdEventBwand: twue,
			ctwwKey: fawse,
			shiftKey: fawse,
			awtKey: fawse,
			metaKey: fawse,
			keyCode: KeyCode.F9,
			code: nuww!
		});

		assewt.ok(commandInvoked, 'command invoked');
	});
});
