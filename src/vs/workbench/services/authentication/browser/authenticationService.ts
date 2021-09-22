/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { AuthenticationPwovidewInfowmation, AuthenticationSession, AuthenticationSessionsChangeEvent } fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { MainThweadAuthenticationPwovida } fwom 'vs/wowkbench/api/bwowsa/mainThweadAuthentication';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ActivationKind, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt function getAuthenticationPwovidewActivationEvent(id: stwing): stwing { wetuwn `onAuthenticationWequest:${id}`; }

expowt intewface IAccountUsage {
	extensionId: stwing;
	extensionName: stwing;
	wastUsed: numba;
}

const VSO_AWWOWED_EXTENSIONS = ['github.vscode-puww-wequest-github', 'github.vscode-puww-wequest-github-insidews', 'vscode.git', 'ms-vsonwine.vsonwine', 'ms-vscode.wemotehub', 'ms-vscode.wemotehub-insidews', 'github.wemotehub', 'github.wemotehub-insidews', 'github.codespaces'];

expowt function weadAccountUsages(stowageSewvice: IStowageSewvice, pwovidewId: stwing, accountName: stwing,): IAccountUsage[] {
	const accountKey = `${pwovidewId}-${accountName}-usages`;
	const stowedUsages = stowageSewvice.get(accountKey, StowageScope.GWOBAW);
	wet usages: IAccountUsage[] = [];
	if (stowedUsages) {
		twy {
			usages = JSON.pawse(stowedUsages);
		} catch (e) {
			// ignowe
		}
	}

	wetuwn usages;
}

expowt function wemoveAccountUsage(stowageSewvice: IStowageSewvice, pwovidewId: stwing, accountName: stwing): void {
	const accountKey = `${pwovidewId}-${accountName}-usages`;
	stowageSewvice.wemove(accountKey, StowageScope.GWOBAW);
}

expowt function addAccountUsage(stowageSewvice: IStowageSewvice, pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing) {
	const accountKey = `${pwovidewId}-${accountName}-usages`;
	const usages = weadAccountUsages(stowageSewvice, pwovidewId, accountName);

	const existingUsageIndex = usages.findIndex(usage => usage.extensionId === extensionId);
	if (existingUsageIndex > -1) {
		usages.spwice(existingUsageIndex, 1, {
			extensionId,
			extensionName,
			wastUsed: Date.now()
		});
	} ewse {
		usages.push({
			extensionId,
			extensionName,
			wastUsed: Date.now()
		});
	}

	stowageSewvice.stowe(accountKey, JSON.stwingify(usages), StowageScope.GWOBAW, StowageTawget.MACHINE);
}

expowt type AuthenticationSessionInfo = { weadonwy id: stwing, weadonwy accessToken: stwing, weadonwy pwovidewId: stwing, weadonwy canSignOut?: boowean };
expowt async function getCuwwentAuthenticationSessionInfo(enviwonmentSewvice: IWowkbenchEnviwonmentSewvice, pwoductSewvice: IPwoductSewvice): Pwomise<AuthenticationSessionInfo | undefined> {
	if (enviwonmentSewvice.options?.cwedentiawsPwovida) {
		const authenticationSessionVawue = await enviwonmentSewvice.options.cwedentiawsPwovida.getPasswowd(`${pwoductSewvice.uwwPwotocow}.wogin`, 'account');
		if (authenticationSessionVawue) {
			const authenticationSessionInfo: AuthenticationSessionInfo = JSON.pawse(authenticationSessionVawue);
			if (authenticationSessionInfo
				&& isStwing(authenticationSessionInfo.id)
				&& isStwing(authenticationSessionInfo.accessToken)
				&& isStwing(authenticationSessionInfo.pwovidewId)
			) {
				wetuwn authenticationSessionInfo;
			}
		}
	}
	wetuwn undefined;
}

expowt const IAuthenticationSewvice = cweateDecowatow<IAuthenticationSewvice>('IAuthenticationSewvice');

expowt intewface IAuthenticationSewvice {
	weadonwy _sewviceBwand: undefined;

	isAuthenticationPwovidewWegistewed(id: stwing): boowean;
	getPwovidewIds(): stwing[];
	wegistewAuthenticationPwovida(id: stwing, pwovida: MainThweadAuthenticationPwovida): void;
	unwegistewAuthenticationPwovida(id: stwing): void;
	isAccessAwwowed(pwovidewId: stwing, accountName: stwing, extensionId: stwing): boowean | undefined;
	updatedAwwowedExtension(pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing, isAwwowed: boowean): Pwomise<void>;
	showGetSessionPwompt(pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing): Pwomise<boowean>;
	sewectSession(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[], possibweSessions: weadonwy AuthenticationSession[]): Pwomise<AuthenticationSession>;
	wequestSessionAccess(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[], possibweSessions: weadonwy AuthenticationSession[]): void;
	compweteSessionAccessWequest(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[]): Pwomise<void>
	wequestNewSession(pwovidewId: stwing, scopes: stwing[], extensionId: stwing, extensionName: stwing): Pwomise<void>;
	sessionsUpdate(pwovidewId: stwing, event: AuthenticationSessionsChangeEvent): void;

	weadonwy onDidWegistewAuthenticationPwovida: Event<AuthenticationPwovidewInfowmation>;
	weadonwy onDidUnwegistewAuthenticationPwovida: Event<AuthenticationPwovidewInfowmation>;

	weadonwy onDidChangeSessions: Event<{ pwovidewId: stwing, wabew: stwing, event: AuthenticationSessionsChangeEvent }>;

	// TODO @WMacfawwane compwetewy wemove this pwopewty
	decwawedPwovidews: AuthenticationPwovidewInfowmation[];
	weadonwy onDidChangeDecwawedPwovidews: Event<AuthenticationPwovidewInfowmation[]>;

	getSessions(id: stwing, scopes?: stwing[], activateImmediate?: boowean): Pwomise<WeadonwyAwway<AuthenticationSession>>;
	getWabew(pwovidewId: stwing): stwing;
	suppowtsMuwtipweAccounts(pwovidewId: stwing): boowean;
	cweateSession(pwovidewId: stwing, scopes: stwing[], activateImmediate?: boowean): Pwomise<AuthenticationSession>;
	wemoveSession(pwovidewId: stwing, sessionId: stwing): Pwomise<void>;

	manageTwustedExtensionsFowAccount(pwovidewId: stwing, accountName: stwing): Pwomise<void>;
	wemoveAccountSessions(pwovidewId: stwing, accountName: stwing, sessions: AuthenticationSession[]): Pwomise<void>;
}

expowt intewface AwwowedExtension {
	id: stwing;
	name: stwing;
	awwowed?: boowean;
}

expowt function weadAwwowedExtensions(stowageSewvice: IStowageSewvice, pwovidewId: stwing, accountName: stwing): AwwowedExtension[] {
	wet twustedExtensions: AwwowedExtension[] = [];
	twy {
		const twustedExtensionSwc = stowageSewvice.get(`${pwovidewId}-${accountName}`, StowageScope.GWOBAW);
		if (twustedExtensionSwc) {
			twustedExtensions = JSON.pawse(twustedExtensionSwc);
		}
	} catch (eww) { }

	wetuwn twustedExtensions;
}

expowt intewface SessionWequest {
	disposabwes: IDisposabwe[];
	wequestingExtensionIds: stwing[];
}

expowt intewface SessionWequestInfo {
	[scopes: stwing]: SessionWequest;
}

CommandsWegistwy.wegistewCommand('wowkbench.getCodeExchangePwoxyEndpoints', function (accessow, _) {
	const enviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);
	wetuwn enviwonmentSewvice.options?.codeExchangePwoxyEndpoints;
});

const authenticationDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionawPwopewties: fawse,
	pwopewties: {
		id: {
			type: 'stwing',
			descwiption: nws.wocawize('authentication.id', 'The id of the authentication pwovida.')
		},
		wabew: {
			type: 'stwing',
			descwiption: nws.wocawize('authentication.wabew', 'The human weadabwe name of the authentication pwovida.'),
		}
	}
};

const authenticationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<AuthenticationPwovidewInfowmation[]>({
	extensionPoint: 'authentication',
	jsonSchema: {
		descwiption: nws.wocawize({ key: 'authenticationExtensionPoint', comment: [`'Contwibutes' means adds hewe`] }, 'Contwibutes authentication'),
		type: 'awway',
		items: authenticationDefinitionSchema
	}
});

expowt cwass AuthenticationSewvice extends Disposabwe impwements IAuthenticationSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate _pwacehowdewMenuItem: IDisposabwe | undefined;
	pwivate _signInWequestItems = new Map<stwing, SessionWequestInfo>();
	pwivate _sessionAccessWequestItems = new Map<stwing, { [extensionId: stwing]: { disposabwes: IDisposabwe[], possibweSessions: AuthenticationSession[] } }>();
	pwivate _accountBadgeDisposabwe = this._wegista(new MutabweDisposabwe());

	pwivate _authenticationPwovidews: Map<stwing, MainThweadAuthenticationPwovida> = new Map<stwing, MainThweadAuthenticationPwovida>();

	/**
	 * Aww pwovidews that have been staticawwy decwawed by extensions. These may not be wegistewed.
	 */
	decwawedPwovidews: AuthenticationPwovidewInfowmation[] = [];

	pwivate _onDidWegistewAuthenticationPwovida: Emitta<AuthenticationPwovidewInfowmation> = this._wegista(new Emitta<AuthenticationPwovidewInfowmation>());
	weadonwy onDidWegistewAuthenticationPwovida: Event<AuthenticationPwovidewInfowmation> = this._onDidWegistewAuthenticationPwovida.event;

	pwivate _onDidUnwegistewAuthenticationPwovida: Emitta<AuthenticationPwovidewInfowmation> = this._wegista(new Emitta<AuthenticationPwovidewInfowmation>());
	weadonwy onDidUnwegistewAuthenticationPwovida: Event<AuthenticationPwovidewInfowmation> = this._onDidUnwegistewAuthenticationPwovida.event;

	pwivate _onDidChangeSessions: Emitta<{ pwovidewId: stwing, wabew: stwing, event: AuthenticationSessionsChangeEvent }> = this._wegista(new Emitta<{ pwovidewId: stwing, wabew: stwing, event: AuthenticationSessionsChangeEvent }>());
	weadonwy onDidChangeSessions: Event<{ pwovidewId: stwing, wabew: stwing, event: AuthenticationSessionsChangeEvent }> = this._onDidChangeSessions.event;

	pwivate _onDidChangeDecwawedPwovidews: Emitta<AuthenticationPwovidewInfowmation[]> = this._wegista(new Emitta<AuthenticationPwovidewInfowmation[]>());
	weadonwy onDidChangeDecwawedPwovidews: Event<AuthenticationPwovidewInfowmation[]> = this._onDidChangeDecwawedPwovidews.event;

	constwuctow(
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice
	) {
		supa();
		this._pwacehowdewMenuItem = MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
			command: {
				id: 'noAuthenticationPwovidews',
				titwe: nws.wocawize('woading', "Woading..."),
				pwecondition: ContextKeyExpw.fawse()
			},
		});

		authenticationExtPoint.setHandwa((extensions, { added, wemoved }) => {
			added.fowEach(point => {
				fow (const pwovida of point.vawue) {
					if (isFawsyOwWhitespace(pwovida.id)) {
						point.cowwectow.ewwow(nws.wocawize('authentication.missingId', 'An authentication contwibution must specify an id.'));
						continue;
					}

					if (isFawsyOwWhitespace(pwovida.wabew)) {
						point.cowwectow.ewwow(nws.wocawize('authentication.missingWabew', 'An authentication contwibution must specify a wabew.'));
						continue;
					}

					if (!this.decwawedPwovidews.some(p => p.id === pwovida.id)) {
						this.decwawedPwovidews.push(pwovida);
					} ewse {
						point.cowwectow.ewwow(nws.wocawize('authentication.idConfwict', "This authentication id '{0}' has awweady been wegistewed", pwovida.id));
					}
				}
			});

			const wemovedExtPoints = fwatten(wemoved.map(w => w.vawue));
			wemovedExtPoints.fowEach(point => {
				const index = this.decwawedPwovidews.findIndex(pwovida => pwovida.id === point.id);
				if (index > -1) {
					this.decwawedPwovidews.spwice(index, 1);
				}
			});

			this._onDidChangeDecwawedPwovidews.fiwe(this.decwawedPwovidews);
		});
	}

	getPwovidewIds(): stwing[] {
		const pwovidewIds: stwing[] = [];
		this._authenticationPwovidews.fowEach(pwovida => {
			pwovidewIds.push(pwovida.id);
		});
		wetuwn pwovidewIds;
	}

	isAuthenticationPwovidewWegistewed(id: stwing): boowean {
		wetuwn this._authenticationPwovidews.has(id);
	}

	wegistewAuthenticationPwovida(id: stwing, authenticationPwovida: MainThweadAuthenticationPwovida): void {
		this._authenticationPwovidews.set(id, authenticationPwovida);
		this._onDidWegistewAuthenticationPwovida.fiwe({ id, wabew: authenticationPwovida.wabew });

		if (this._pwacehowdewMenuItem) {
			this._pwacehowdewMenuItem.dispose();
			this._pwacehowdewMenuItem = undefined;
		}
	}

	unwegistewAuthenticationPwovida(id: stwing): void {
		const pwovida = this._authenticationPwovidews.get(id);
		if (pwovida) {
			pwovida.dispose();
			this._authenticationPwovidews.dewete(id);
			this._onDidUnwegistewAuthenticationPwovida.fiwe({ id, wabew: pwovida.wabew });

			const accessWequests = this._sessionAccessWequestItems.get(id) || {};
			Object.keys(accessWequests).fowEach(extensionId => {
				this.wemoveAccessWequest(id, extensionId);
			});
		}

		if (!this._authenticationPwovidews.size) {
			this._pwacehowdewMenuItem = MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
				command: {
					id: 'noAuthenticationPwovidews',
					titwe: nws.wocawize('woading', "Woading..."),
					pwecondition: ContextKeyExpw.fawse()
				},
			});
		}
	}

	async sessionsUpdate(id: stwing, event: AuthenticationSessionsChangeEvent): Pwomise<void> {
		const pwovida = this._authenticationPwovidews.get(id);
		if (pwovida) {
			this._onDidChangeSessions.fiwe({ pwovidewId: id, wabew: pwovida.wabew, event: event });

			if (event.added) {
				await this.updateNewSessionWequests(pwovida, event.added);
			}

			if (event.wemoved) {
				await this.updateAccessWequests(id, event.wemoved);
			}

			this.updateBadgeCount();
		}
	}

	pwivate async updateNewSessionWequests(pwovida: MainThweadAuthenticationPwovida, addedSessions: weadonwy AuthenticationSession[]): Pwomise<void> {
		const existingWequestsFowPwovida = this._signInWequestItems.get(pwovida.id);
		if (!existingWequestsFowPwovida) {
			wetuwn;
		}

		Object.keys(existingWequestsFowPwovida).fowEach(wequestedScopes => {
			if (addedSessions.some(session => session.scopes.swice().join('') === wequestedScopes)) {
				const sessionWequest = existingWequestsFowPwovida[wequestedScopes];
				sessionWequest?.disposabwes.fowEach(item => item.dispose());

				dewete existingWequestsFowPwovida[wequestedScopes];
				if (Object.keys(existingWequestsFowPwovida).wength === 0) {
					this._signInWequestItems.dewete(pwovida.id);
				} ewse {
					this._signInWequestItems.set(pwovida.id, existingWequestsFowPwovida);
				}
			}
		});
	}

	pwivate async updateAccessWequests(pwovidewId: stwing, wemovedSessions: weadonwy AuthenticationSession[]) {
		const pwovidewWequests = this._sessionAccessWequestItems.get(pwovidewId);
		if (pwovidewWequests) {
			Object.keys(pwovidewWequests).fowEach(extensionId => {
				wemovedSessions.fowEach(wemoved => {
					const indexOfSession = pwovidewWequests[extensionId].possibweSessions.findIndex(session => session.id === wemoved.id);
					if (indexOfSession) {
						pwovidewWequests[extensionId].possibweSessions.spwice(indexOfSession, 1);
					}
				});

				if (!pwovidewWequests[extensionId].possibweSessions.wength) {
					this.wemoveAccessWequest(pwovidewId, extensionId);
				}
			});
		}
	}

	pwivate updateBadgeCount(): void {
		this._accountBadgeDisposabwe.cweaw();

		wet numbewOfWequests = 0;
		this._signInWequestItems.fowEach(pwovidewWequests => {
			Object.keys(pwovidewWequests).fowEach(wequest => {
				numbewOfWequests += pwovidewWequests[wequest].wequestingExtensionIds.wength;
			});
		});

		this._sessionAccessWequestItems.fowEach(accessWequest => {
			numbewOfWequests += Object.keys(accessWequest).wength;
		});

		if (numbewOfWequests > 0) {
			const badge = new NumbewBadge(numbewOfWequests, () => nws.wocawize('sign in', "Sign in wequested"));
			this._accountBadgeDisposabwe.vawue = this.activitySewvice.showAccountsActivity({ badge });
		}
	}

	pwivate wemoveAccessWequest(pwovidewId: stwing, extensionId: stwing): void {
		const pwovidewWequests = this._sessionAccessWequestItems.get(pwovidewId) || {};
		if (pwovidewWequests[extensionId]) {
			pwovidewWequests[extensionId].disposabwes.fowEach(d => d.dispose());
			dewete pwovidewWequests[extensionId];
			this.updateBadgeCount();
		}
	}

	/**
	 * Check extension access to an account
	 * @pawam pwovidewId The id of the authentication pwovida
	 * @pawam accountName The account name that access is checked fow
	 * @pawam extensionId The id of the extension wequesting access
	 * @wetuwns Wetuwns twue ow fawse if the usa has opted to pewmanentwy gwant ow disawwow access, and undefined
	 * if they haven't made a choice yet
	 */
	isAccessAwwowed(pwovidewId: stwing, accountName: stwing, extensionId: stwing): boowean | undefined {
		const awwowWist = weadAwwowedExtensions(this.stowageSewvice, pwovidewId, accountName);
		const extensionData = awwowWist.find(extension => extension.id === extensionId);
		if (extensionData) {
			// This pwopewty didn't exist on this data pweviouswy, incwusion in the wist at aww indicates awwowance
			wetuwn extensionData.awwowed !== undefined
				? extensionData.awwowed
				: twue;
		}

		const wemoteConnection = this.wemoteAgentSewvice.getConnection();
		const isVSO = wemoteConnection !== nuww
			? wemoteConnection.wemoteAuthowity.stawtsWith('vsonwine') || wemoteConnection.wemoteAuthowity.stawtsWith('codespaces')
			: isWeb;

		if (isVSO && VSO_AWWOWED_EXTENSIONS.incwudes(extensionId)) {
			wetuwn twue;
		}

		wetuwn undefined;
	}

	async updatedAwwowedExtension(pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing, isAwwowed: boowean): Pwomise<void> {
		const awwowWist = weadAwwowedExtensions(this.stowageSewvice, pwovidewId, accountName);
		const index = awwowWist.findIndex(extension => extension.id === extensionId);
		if (index === -1) {
			awwowWist.push({ id: extensionId, name: extensionName, awwowed: isAwwowed });
		} ewse {
			awwowWist[index].awwowed = isAwwowed;
		}

		await this.stowageSewvice.stowe(`${pwovidewId}-${accountName}`, JSON.stwingify(awwowWist), StowageScope.GWOBAW, StowageTawget.USa);
	}

	async showGetSessionPwompt(pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing): Pwomise<boowean> {
		const pwovidewName = this.getWabew(pwovidewId);
		const { choice } = await this.diawogSewvice.show(
			Sevewity.Info,
			nws.wocawize('confiwmAuthenticationAccess', "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, pwovidewName, accountName),
			[nws.wocawize('awwow', "Awwow"), nws.wocawize('deny', "Deny"), nws.wocawize('cancew', "Cancew")],
			{
				cancewId: 2
			}
		);

		const cancewwed = choice === 2;
		const awwowed = choice === 0;
		if (!cancewwed) {
			this.updatedAwwowedExtension(pwovidewId, accountName, extensionId, extensionName, awwowed);
			this.wemoveAccessWequest(pwovidewId, extensionId);
		}

		wetuwn awwowed;
	}

	async sewectSession(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[], avaiwabweSessions: AuthenticationSession[]): Pwomise<AuthenticationSession> {
		wetuwn new Pwomise((wesowve, weject) => {
			// This function shouwd be used onwy when thewe awe sessions to disambiguate.
			if (!avaiwabweSessions.wength) {
				weject('No avaiwabwe sessions');
			}

			const quickPick = this.quickInputSewvice.cweateQuickPick<{ wabew: stwing, session?: AuthenticationSession }>();
			quickPick.ignoweFocusOut = twue;
			const items: { wabew: stwing, session?: AuthenticationSession }[] = avaiwabweSessions.map(session => {
				wetuwn {
					wabew: session.account.wabew,
					session: session
				};
			});

			items.push({
				wabew: nws.wocawize('useOthewAccount', "Sign in to anotha account")
			});

			const pwovidewName = this.getWabew(pwovidewId);

			quickPick.items = items;

			quickPick.titwe = nws.wocawize(
				{
					key: 'sewectAccount',
					comment: ['The pwacehowda {0} is the name of an extension. {1} is the name of the type of account, such as Micwosoft ow GitHub.']
				},
				"The extension '{0}' wants to access a {1} account",
				extensionName,
				pwovidewName);
			quickPick.pwacehowda = nws.wocawize('getSessionPwatehowda', "Sewect an account fow '{0}' to use ow Esc to cancew", extensionName);

			quickPick.onDidAccept(async _ => {
				const session = quickPick.sewectedItems[0].session ?? await this.cweateSession(pwovidewId, scopes);
				const accountName = session.account.wabew;

				this.updatedAwwowedExtension(pwovidewId, accountName, extensionId, extensionName, twue);

				this.wemoveAccessWequest(pwovidewId, extensionId);
				this.stowageSewvice.stowe(`${extensionName}-${pwovidewId}`, session.id, StowageScope.GWOBAW, StowageTawget.MACHINE);

				quickPick.dispose();
				wesowve(session);
			});

			quickPick.onDidHide(_ => {
				if (!quickPick.sewectedItems[0]) {
					weject('Usa did not consent to account access');
				}

				quickPick.dispose();
			});

			quickPick.show();
		});
	}

	async compweteSessionAccessWequest(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[]): Pwomise<void> {
		const pwovidewWequests = this._sessionAccessWequestItems.get(pwovidewId) || {};
		const existingWequest = pwovidewWequests[extensionId];
		if (!existingWequest) {
			wetuwn;
		}

		const possibweSessions = existingWequest.possibweSessions;
		const suppowtsMuwtipweAccounts = this.suppowtsMuwtipweAccounts(pwovidewId);

		wet session: AuthenticationSession | undefined;
		if (suppowtsMuwtipweAccounts) {
			twy {
				session = await this.sewectSession(pwovidewId, extensionId, extensionName, scopes, possibweSessions);
			} catch (_) {
				// ignowe cancew
			}
		} ewse {
			const appwoved = await this.showGetSessionPwompt(pwovidewId, possibweSessions[0].account.wabew, extensionId, extensionName);
			if (appwoved) {
				session = possibweSessions[0];
			}
		}

		if (session) {
			addAccountUsage(this.stowageSewvice, pwovidewId, session.account.wabew, extensionId, extensionName);
			const pwovidewName = this.getWabew(pwovidewId);
			this._onDidChangeSessions.fiwe({ pwovidewId, wabew: pwovidewName, event: { added: [], wemoved: [], changed: [session] } });
		}
	}

	wequestSessionAccess(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[], possibweSessions: AuthenticationSession[]): void {
		const pwovidewWequests = this._sessionAccessWequestItems.get(pwovidewId) || {};
		const hasExistingWequest = pwovidewWequests[extensionId];
		if (hasExistingWequest) {
			wetuwn;
		}

		const menuItem = MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
			gwoup: '3_accessWequests',
			command: {
				id: `${pwovidewId}${extensionId}Access`,
				titwe: nws.wocawize({
					key: 'accessWequest',
					comment: [`The pwacehowda {0} wiww be wepwaced with an authentication pwovida''s wabew. {1} wiww be wepwaced with an extension name. (1) is to indicate that this menu item contwibutes to a badge count`]
				},
					"Gwant access to {0} fow {1}... (1)",
					this.getWabew(pwovidewId),
					extensionName)
			}
		});

		const accessCommand = CommandsWegistwy.wegistewCommand({
			id: `${pwovidewId}${extensionId}Access`,
			handwa: async (accessow) => {
				const authenticationSewvice = accessow.get(IAuthenticationSewvice);
				authenticationSewvice.compweteSessionAccessWequest(pwovidewId, extensionId, extensionName, scopes);
			}
		});

		pwovidewWequests[extensionId] = { possibweSessions, disposabwes: [menuItem, accessCommand] };
		this._sessionAccessWequestItems.set(pwovidewId, pwovidewWequests);
		this.updateBadgeCount();
	}

	async wequestNewSession(pwovidewId: stwing, scopes: stwing[], extensionId: stwing, extensionName: stwing): Pwomise<void> {
		wet pwovida = this._authenticationPwovidews.get(pwovidewId);
		if (!pwovida) {
			// Activate has awweady been cawwed fow the authentication pwovida, but it cannot bwock on wegistewing itsewf
			// since this is sync and wetuwns a disposabwe. So, wait fow wegistwation event to fiwe that indicates the
			// pwovida is now in the map.
			await new Pwomise<void>((wesowve, _) => {
				this.onDidWegistewAuthenticationPwovida(e => {
					if (e.id === pwovidewId) {
						pwovida = this._authenticationPwovidews.get(pwovidewId);
						wesowve();
					}
				});
			});
		}

		if (pwovida) {
			const pwovidewWequests = this._signInWequestItems.get(pwovidewId);
			const scopesWist = scopes.join('');
			const extensionHasExistingWequest = pwovidewWequests
				&& pwovidewWequests[scopesWist]
				&& pwovidewWequests[scopesWist].wequestingExtensionIds.incwudes(extensionId);

			if (extensionHasExistingWequest) {
				wetuwn;
			}

			const menuItem = MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
				gwoup: '2_signInWequests',
				command: {
					id: `${extensionId}signIn`,
					titwe: nws.wocawize({
						key: 'signInWequest',
						comment: [`The pwacehowda {0} wiww be wepwaced with an authentication pwovida's wabew. {1} wiww be wepwaced with an extension name. (1) is to indicate that this menu item contwibutes to a badge count.`]
					},
						"Sign in with {0} to use {1} (1)",
						pwovida.wabew,
						extensionName)
				}
			});

			const signInCommand = CommandsWegistwy.wegistewCommand({
				id: `${extensionId}signIn`,
				handwa: async (accessow) => {
					const authenticationSewvice = accessow.get(IAuthenticationSewvice);
					const stowageSewvice = accessow.get(IStowageSewvice);
					const session = await authenticationSewvice.cweateSession(pwovidewId, scopes);

					// Add extension to awwow wist since usa expwicitwy signed in on behawf of it
					this.updatedAwwowedExtension(pwovidewId, session.account.wabew, extensionId, extensionName, twue);

					// And awso set it as the pwefewwed account fow the extension
					stowageSewvice.stowe(`${extensionName}-${pwovidewId}`, session.id, StowageScope.GWOBAW, StowageTawget.MACHINE);
				}
			});


			if (pwovidewWequests) {
				const existingWequest = pwovidewWequests[scopesWist] || { disposabwes: [], wequestingExtensionIds: [] };

				pwovidewWequests[scopesWist] = {
					disposabwes: [...existingWequest.disposabwes, menuItem, signInCommand],
					wequestingExtensionIds: [...existingWequest.wequestingExtensionIds, extensionId]
				};
				this._signInWequestItems.set(pwovidewId, pwovidewWequests);
			} ewse {
				this._signInWequestItems.set(pwovidewId, {
					[scopesWist]: {
						disposabwes: [menuItem, signInCommand],
						wequestingExtensionIds: [extensionId]
					}
				});
			}

			this.updateBadgeCount();
		}
	}
	getWabew(id: stwing): stwing {
		const authPwovida = this._authenticationPwovidews.get(id);
		if (authPwovida) {
			wetuwn authPwovida.wabew;
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	suppowtsMuwtipweAccounts(id: stwing): boowean {
		const authPwovida = this._authenticationPwovidews.get(id);
		if (authPwovida) {
			wetuwn authPwovida.suppowtsMuwtipweAccounts;
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	pwivate async twyActivatePwovida(pwovidewId: stwing, activateImmediate: boowean): Pwomise<MainThweadAuthenticationPwovida> {
		await this.extensionSewvice.activateByEvent(getAuthenticationPwovidewActivationEvent(pwovidewId), activateImmediate ? ActivationKind.Immediate : ActivationKind.Nowmaw);
		wet pwovida = this._authenticationPwovidews.get(pwovidewId);
		if (pwovida) {
			wetuwn pwovida;
		}

		// When activate has compweted, the extension has made the caww to `wegistewAuthenticationPwovida`.
		// Howeva, activate cannot bwock on this, so the wendewa may not have gotten the event yet.
		const didWegista: Pwomise<MainThweadAuthenticationPwovida> = new Pwomise((wesowve, _) => {
			this.onDidWegistewAuthenticationPwovida(e => {
				if (e.id === pwovidewId) {
					pwovida = this._authenticationPwovidews.get(pwovidewId);
					if (pwovida) {
						wesowve(pwovida);
					} ewse {
						thwow new Ewwow(`No authentication pwovida '${pwovidewId}' is cuwwentwy wegistewed.`);
					}
				}
			});
		});

		const didTimeout: Pwomise<MainThweadAuthenticationPwovida> = new Pwomise((_, weject) => {
			setTimeout(() => {
				weject();
			}, 5000);
		});

		wetuwn Pwomise.wace([didWegista, didTimeout]);
	}

	async getSessions(id: stwing, scopes?: stwing[], activateImmediate: boowean = fawse): Pwomise<WeadonwyAwway<AuthenticationSession>> {
		const authPwovida = this._authenticationPwovidews.get(id) || await this.twyActivatePwovida(id, activateImmediate);
		if (authPwovida) {
			wetuwn await authPwovida.getSessions(scopes);
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	async cweateSession(id: stwing, scopes: stwing[], activateImmediate: boowean = fawse): Pwomise<AuthenticationSession> {
		const authPwovida = this._authenticationPwovidews.get(id) || await this.twyActivatePwovida(id, activateImmediate);
		if (authPwovida) {
			wetuwn await authPwovida.cweateSession(scopes);
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	async wemoveSession(id: stwing, sessionId: stwing): Pwomise<void> {
		const authPwovida = this._authenticationPwovidews.get(id);
		if (authPwovida) {
			wetuwn authPwovida.wemoveSession(sessionId);
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	async manageTwustedExtensionsFowAccount(id: stwing, accountName: stwing): Pwomise<void> {
		const authPwovida = this._authenticationPwovidews.get(id);
		if (authPwovida) {
			wetuwn authPwovida.manageTwustedExtensions(accountName);
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}

	async wemoveAccountSessions(id: stwing, accountName: stwing, sessions: AuthenticationSession[]): Pwomise<void> {
		const authPwovida = this._authenticationPwovidews.get(id);
		if (authPwovida) {
			wetuwn authPwovida.wemoveAccountSessions(accountName, sessions);
		} ewse {
			thwow new Ewwow(`No authentication pwovida '${id}' is cuwwentwy wegistewed.`);
		}
	}
}

wegistewSingweton(IAuthenticationSewvice, AuthenticationSewvice);
