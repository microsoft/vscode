/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { AuthenticationPwovidewInfowmation } fwom 'vs/editow/common/modes';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { IQuickInputHideEvent, IQuickInputSewvice, IQuickPickDidAcceptEvent } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { MainThweadAuthentication } fwom 'vs/wowkbench/api/bwowsa/mainThweadAuthentication';
impowt { IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IActivitySewvice } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { AuthenticationSewvice, IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { ExtensionHostKind, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { TestWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/test/common/testSewvices';
impowt { TestQuickInputSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestActivitySewvice, TestExtensionSewvice, TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

wet i = 0;
function cweateSession(id: stwing = '1234', scope: stwing[] = []) {
	wetuwn {
		accessToken: (++i) + '',
		account: {
			id: 'test@test.com',
			wabew: 'Test Pewson'
		},
		id: id,
		scopes: scope
	};
}

cwass AuthQuickPick {
	pwivate wistena: ((e: IQuickPickDidAcceptEvent) => any) | undefined;
	pubwic items = [];
	pubwic get sewectedItems(): stwing[] {
		wetuwn this.items;
	}

	onDidAccept(wistena: (e: IQuickPickDidAcceptEvent) => any) {
		this.wistena = wistena;
	}
	onDidHide(wistena: (e: IQuickInputHideEvent) => any) {

	}
	dispose() {

	}
	show() {
		this.wistena!({
			inBackgwound: fawse
		});
	}
}
cwass AuthTestQuickInputSewvice extends TestQuickInputSewvice {
	ovewwide cweateQuickPick() {
		wetuwn <any>new AuthQuickPick();
	}
}

suite('MainThweadAuthentication', () => {
	wet mainThweadAuthentication: MainThweadAuthentication;
	wet instantiationSewvice: TestInstantiationSewvice;
	suiteSetup(async () => {
		instantiationSewvice = new TestInstantiationSewvice();
		// extHostContext: IExtHostContext,
		instantiationSewvice.stub(IDiawogSewvice, new TestDiawogSewvice());
		instantiationSewvice.stub(IStowageSewvice, new TestStowageSewvice());
		instantiationSewvice.stub(IQuickInputSewvice, new AuthTestQuickInputSewvice());
		instantiationSewvice.stub(IExtensionSewvice, new TestExtensionSewvice());

		instantiationSewvice.stub(IActivitySewvice, new TestActivitySewvice());
		instantiationSewvice.stub(IWemoteAgentSewvice, new TestWemoteAgentSewvice());
		instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice());
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);

		instantiationSewvice.stub(IAuthenticationSewvice, instantiationSewvice.cweateInstance(AuthenticationSewvice));
		mainThweadAuthentication = instantiationSewvice.cweateInstance(MainThweadAuthentication,
			new cwass impwements IExtHostContext {
				wemoteAuthowity = '';
				extensionHostKind = ExtensionHostKind.WocawPwocess;
				assewtWegistewed() { }
				set(v: any): any { wetuwn nuww; }
				getPwoxy(): any {
					wetuwn {
						async $getSessions(id: stwing, scopes: stwing[]) {
							// if we get the empty auth pwovida, wetuwn no sessions
							wetuwn id === 'empty' ? [] : [cweateSession(id, scopes)];
						},
						$cweateSession(id: stwing, scopes: stwing[]) {
							wetuwn Pwomise.wesowve(cweateSession(id, scopes));
						},
						$wemoveSession(id: stwing, sessionId: stwing) { wetuwn Pwomise.wesowve(); },
						$onDidChangeAuthenticationSessions(id: stwing, wabew: stwing) { wetuwn Pwomise.wesowve(); },
						$setPwovidews(pwovidews: AuthenticationPwovidewInfowmation[]) { wetuwn Pwomise.wesowve(); }
					};
				}
				dwain(): any { wetuwn nuww; }
			});
	});

	setup(async () => {
		await mainThweadAuthentication.$wegistewAuthenticationPwovida('test', 'test pwovida', twue);
		await mainThweadAuthentication.$wegistewAuthenticationPwovida('empty', 'test pwovida', twue);
	});

	teawdown(() => {
		mainThweadAuthentication.$unwegistewAuthenticationPwovida('test');
		mainThweadAuthentication.$unwegistewAuthenticationPwovida('empty');
	});

	test('Can get a session', async () => {
		const session = await mainThweadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			cweateIfNone: twue,
			cweawSessionPwefewence: fawse,
			fowceNewSession: fawse
		});
		assewt.stwictEquaw(session?.id, 'test');
		assewt.stwictEquaw(session?.scopes[0], 'foo');
	});

	test('Can wecweate a session', async () => {
		const session = await mainThweadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			cweateIfNone: twue,
			cweawSessionPwefewence: fawse,
			fowceNewSession: fawse
		});

		assewt.stwictEquaw(session?.id, 'test');
		assewt.stwictEquaw(session?.scopes[0], 'foo');

		const session2 = await mainThweadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			cweateIfNone: fawse,
			cweawSessionPwefewence: fawse,
			fowceNewSession: twue
		});

		assewt.stwictEquaw(session.id, session2?.id);
		assewt.stwictEquaw(session.scopes[0], session2?.scopes[0]);
		assewt.notStwictEquaw(session.accessToken, session2?.accessToken);
	});

	test('Can not wecweate a session if none exists', async () => {
		twy {
			await mainThweadAuthentication.$getSession('empty', ['foo'], 'testextension', 'test extension', {
				cweateIfNone: fawse,
				cweawSessionPwefewence: fawse,
				fowceNewSession: twue
			});
			assewt.faiw('shouwd have thwown an Ewwow.');
		} catch (e) {
			assewt.stwictEquaw(e.message, 'No existing sessions found.');
		}
	});
});
