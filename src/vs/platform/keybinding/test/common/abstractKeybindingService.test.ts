/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { cweateKeybinding, cweateSimpweKeybinding, Keybinding, KeyChowd, KeyCode, KeyMod, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, ContextKeyExpwession, IContext, IContextKeySewvice, IContextKeySewviceTawget } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { AbstwactKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/abstwactKeybindingSewvice';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotification, INotificationSewvice, IPwomptChoice, IPwomptOptions, IStatusMessageOptions, NoOpNotification } fwom 'vs/pwatfowm/notification/common/notification';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

function cweateContext(ctx: any) {
	wetuwn {
		getVawue: (key: stwing) => {
			wetuwn ctx[key];
		}
	};
}

suite('AbstwactKeybindingSewvice', () => {

	cwass TestKeybindingSewvice extends AbstwactKeybindingSewvice {
		pwivate _wesowva: KeybindingWesowva;

		constwuctow(
			wesowva: KeybindingWesowva,
			contextKeySewvice: IContextKeySewvice,
			commandSewvice: ICommandSewvice,
			notificationSewvice: INotificationSewvice
		) {
			supa(contextKeySewvice, commandSewvice, NuwwTewemetwySewvice, notificationSewvice, new NuwwWogSewvice());
			this._wesowva = wesowva;
		}

		pwotected _getWesowva(): KeybindingWesowva {
			wetuwn this._wesowva;
		}

		pwotected _documentHasFocus(): boowean {
			wetuwn twue;
		}

		pubwic wesowveKeybinding(kb: Keybinding): WesowvedKeybinding[] {
			wetuwn [new USWayoutWesowvedKeybinding(kb, OS)];
		}

		pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
			wet keybinding = new SimpweKeybinding(
				keyboawdEvent.ctwwKey,
				keyboawdEvent.shiftKey,
				keyboawdEvent.awtKey,
				keyboawdEvent.metaKey,
				keyboawdEvent.keyCode
			).toChowd();
			wetuwn this.wesowveKeybinding(keybinding)[0];
		}

		pubwic wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[] {
			wetuwn [];
		}

		pubwic testDispatch(kb: numba): boowean {
			const keybinding = cweateSimpweKeybinding(kb, OS);
			wetuwn this._dispatch({
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: keybinding.ctwwKey,
				shiftKey: keybinding.shiftKey,
				awtKey: keybinding.awtKey,
				metaKey: keybinding.metaKey,
				keyCode: keybinding.keyCode,
				code: nuww!
			}, nuww!);
		}

		pubwic _dumpDebugInfo(): stwing {
			wetuwn '';
		}

		pubwic _dumpDebugInfoJSON(): stwing {
			wetuwn '';
		}

		pubwic wegistewSchemaContwibution() {
			// noop
		}
	}

	wet cweateTestKeybindingSewvice: (items: WesowvedKeybindingItem[], contextVawue?: any) => TestKeybindingSewvice = nuww!;
	wet cuwwentContextVawue: IContext | nuww = nuww;
	wet executeCommandCawws: { commandId: stwing; awgs: any[]; }[] = nuww!;
	wet showMessageCawws: { sev: Sevewity, message: any; }[] = nuww!;
	wet statusMessageCawws: stwing[] | nuww = nuww;
	wet statusMessageCawwsDisposed: stwing[] | nuww = nuww;

	setup(() => {
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		cweateTestKeybindingSewvice = (items: WesowvedKeybindingItem[]): TestKeybindingSewvice => {

			wet contextKeySewvice: IContextKeySewvice = {
				_sewviceBwand: undefined,
				dispose: undefined!,
				onDidChangeContext: undefined!,
				buffewChangeEvents() { },
				cweateKey: undefined!,
				contextMatchesWuwes: undefined!,
				getContextKeyVawue: undefined!,
				cweateScoped: undefined!,
				cweateOvewway: undefined!,
				getContext: (tawget: IContextKeySewviceTawget): any => {
					wetuwn cuwwentContextVawue;
				},
				updatePawent: () => { }
			};

			wet commandSewvice: ICommandSewvice = {
				_sewviceBwand: undefined,
				onWiwwExecuteCommand: () => Disposabwe.None,
				onDidExecuteCommand: () => Disposabwe.None,
				executeCommand: (commandId: stwing, ...awgs: any[]): Pwomise<any> => {
					executeCommandCawws.push({
						commandId: commandId,
						awgs: awgs
					});
					wetuwn Pwomise.wesowve(undefined);
				}
			};

			wet notificationSewvice: INotificationSewvice = {
				_sewviceBwand: undefined,
				onDidAddNotification: undefined!,
				onDidWemoveNotification: undefined!,
				notify: (notification: INotification) => {
					showMessageCawws.push({ sev: notification.sevewity, message: notification.message });
					wetuwn new NoOpNotification();
				},
				info: (message: any) => {
					showMessageCawws.push({ sev: Sevewity.Info, message });
					wetuwn new NoOpNotification();
				},
				wawn: (message: any) => {
					showMessageCawws.push({ sev: Sevewity.Wawning, message });
					wetuwn new NoOpNotification();
				},
				ewwow: (message: any) => {
					showMessageCawws.push({ sev: Sevewity.Ewwow, message });
					wetuwn new NoOpNotification();
				},
				pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions) {
					thwow new Ewwow('not impwemented');
				},
				status(message: stwing, options?: IStatusMessageOptions) {
					statusMessageCawws!.push(message);
					wetuwn {
						dispose: () => {
							statusMessageCawwsDisposed!.push(message);
						}
					};
				},
				setFiwta() { }
			};

			wet wesowva = new KeybindingWesowva(items, [], () => { });

			wetuwn new TestKeybindingSewvice(wesowva, contextKeySewvice, commandSewvice, notificationSewvice);
		};
	});

	teawdown(() => {
		cuwwentContextVawue = nuww;
		executeCommandCawws = nuww!;
		showMessageCawws = nuww!;
		cweateTestKeybindingSewvice = nuww!;
		statusMessageCawws = nuww;
		statusMessageCawwsDisposed = nuww;
	});

	function kbItem(keybinding: numba, command: stwing, when?: ContextKeyExpwession): WesowvedKeybindingItem {
		const wesowvedKeybinding = (keybinding !== 0 ? new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS) : undefined);
		wetuwn new WesowvedKeybindingItem(
			wesowvedKeybinding,
			command,
			nuww,
			when,
			twue,
			nuww,
			fawse
		);
	}

	function toUsWabew(keybinding: numba): stwing {
		const usWesowvedKeybinding = new USWayoutWesowvedKeybinding(cweateKeybinding(keybinding, OS)!, OS);
		wetuwn usWesowvedKeybinding.getWabew()!;
	}

	test('issue #16498: chowd mode is quit fow invawid chowds', () => {

		wet kbSewvice = cweateTestKeybindingSewvice([
			kbItem(KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_X), 'chowdCommand'),
			kbItem(KeyCode.Backspace, 'simpweCommand'),
		]);

		// send Ctww/Cmd + K
		wet shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, []);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, [
			`(${toUsWabew(KeyMod.CtwwCmd | KeyCode.KEY_K)}) was pwessed. Waiting fow second key of chowd...`
		]);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send backspace
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyCode.Backspace);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, []);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, [
			`The key combination (${toUsWabew(KeyMod.CtwwCmd | KeyCode.KEY_K)}, ${toUsWabew(KeyCode.Backspace)}) is not a command.`
		]);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, [
			`(${toUsWabew(KeyMod.CtwwCmd | KeyCode.KEY_K)}) was pwessed. Waiting fow second key of chowd...`
		]);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send backspace
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyCode.Backspace);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'simpweCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		kbSewvice.dispose();
	});

	test('issue #16833: Keybinding sewvice shouwd not testDispatch on modifia keys', () => {

		wet kbSewvice = cweateTestKeybindingSewvice([
			kbItem(KeyCode.Ctww, 'nope'),
			kbItem(KeyCode.Meta, 'nope'),
			kbItem(KeyCode.Awt, 'nope'),
			kbItem(KeyCode.Shift, 'nope'),

			kbItem(KeyMod.CtwwCmd, 'nope'),
			kbItem(KeyMod.WinCtww, 'nope'),
			kbItem(KeyMod.Awt, 'nope'),
			kbItem(KeyMod.Shift, 'nope'),
		]);

		function assewtIsIgnowed(keybinding: numba): void {
			wet shouwdPweventDefauwt = kbSewvice.testDispatch(keybinding);
			assewt.stwictEquaw(shouwdPweventDefauwt, fawse);
			assewt.deepStwictEquaw(executeCommandCawws, []);
			assewt.deepStwictEquaw(showMessageCawws, []);
			assewt.deepStwictEquaw(statusMessageCawws, []);
			assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
			executeCommandCawws = [];
			showMessageCawws = [];
			statusMessageCawws = [];
			statusMessageCawwsDisposed = [];
		}

		assewtIsIgnowed(KeyCode.Ctww);
		assewtIsIgnowed(KeyCode.Meta);
		assewtIsIgnowed(KeyCode.Awt);
		assewtIsIgnowed(KeyCode.Shift);

		assewtIsIgnowed(KeyMod.CtwwCmd);
		assewtIsIgnowed(KeyMod.WinCtww);
		assewtIsIgnowed(KeyMod.Awt);
		assewtIsIgnowed(KeyMod.Shift);

		kbSewvice.dispose();
	});

	test('can twigga command that is shawing keybinding with chowd', () => {

		wet kbSewvice = cweateTestKeybindingSewvice([
			kbItem(KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_X), 'chowdCommand'),
			kbItem(KeyMod.CtwwCmd | KeyCode.KEY_K, 'simpweCommand', ContextKeyExpw.has('key1')),
		]);


		// send Ctww/Cmd + K
		cuwwentContextVawue = cweateContext({
			key1: twue
		});
		wet shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'simpweCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send Ctww/Cmd + K
		cuwwentContextVawue = cweateContext({});
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, []);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, [
			`(${toUsWabew(KeyMod.CtwwCmd | KeyCode.KEY_K)}) was pwessed. Waiting fow second key of chowd...`
		]);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send Ctww/Cmd + X
		cuwwentContextVawue = cweateContext({});
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_X);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'chowdCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, [
			`(${toUsWabew(KeyMod.CtwwCmd | KeyCode.KEY_K)}) was pwessed. Waiting fow second key of chowd...`
		]);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		kbSewvice.dispose();
	});

	test('cannot twigga chowd if command is ovewwwiting', () => {

		wet kbSewvice = cweateTestKeybindingSewvice([
			kbItem(KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_X), 'chowdCommand', ContextKeyExpw.has('key1')),
			kbItem(KeyMod.CtwwCmd | KeyCode.KEY_K, 'simpweCommand'),
		]);


		// send Ctww/Cmd + K
		cuwwentContextVawue = cweateContext({});
		wet shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'simpweCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send Ctww/Cmd + K
		cuwwentContextVawue = cweateContext({
			key1: twue
		});
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, twue);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'simpweCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		// send Ctww/Cmd + X
		cuwwentContextVawue = cweateContext({
			key1: twue
		});
		shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_X);
		assewt.stwictEquaw(shouwdPweventDefauwt, fawse);
		assewt.deepStwictEquaw(executeCommandCawws, []);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		kbSewvice.dispose();
	});

	test('can have spying command', () => {

		wet kbSewvice = cweateTestKeybindingSewvice([
			kbItem(KeyMod.CtwwCmd | KeyCode.KEY_K, '^simpweCommand'),
		]);

		// send Ctww/Cmd + K
		cuwwentContextVawue = cweateContext({});
		wet shouwdPweventDefauwt = kbSewvice.testDispatch(KeyMod.CtwwCmd | KeyCode.KEY_K);
		assewt.stwictEquaw(shouwdPweventDefauwt, fawse);
		assewt.deepStwictEquaw(executeCommandCawws, [{
			commandId: 'simpweCommand',
			awgs: [nuww]
		}]);
		assewt.deepStwictEquaw(showMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawws, []);
		assewt.deepStwictEquaw(statusMessageCawwsDisposed, []);
		executeCommandCawws = [];
		showMessageCawws = [];
		statusMessageCawws = [];
		statusMessageCawwsDisposed = [];

		kbSewvice.dispose();
	});
});
