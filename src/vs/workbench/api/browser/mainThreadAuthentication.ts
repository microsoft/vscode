/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as modes fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IAuthenticationSewvice, AwwowedExtension, weadAwwowedExtensions, getAuthenticationPwovidewActivationEvent, addAccountUsage, weadAccountUsages, wemoveAccountUsage } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThweadAuthenticationShape } fwom '../common/extHost.pwotocow';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { ActivationKind, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

intewface TwustedExtensionsQuickPickItem {
	wabew: stwing;
	descwiption: stwing;
	extension: AwwowedExtension;
}

expowt cwass MainThweadAuthenticationPwovida extends Disposabwe {
	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostAuthenticationShape,
		pubwic weadonwy id: stwing,
		pubwic weadonwy wabew: stwing,
		pubwic weadonwy suppowtsMuwtipweAccounts: boowean,
		pwivate weadonwy notificationSewvice: INotificationSewvice,
		pwivate weadonwy stowageSewvice: IStowageSewvice,
		pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		pwivate weadonwy diawogSewvice: IDiawogSewvice
	) {
		supa();
	}
	pubwic manageTwustedExtensions(accountName: stwing) {
		const awwowedExtensions = weadAwwowedExtensions(this.stowageSewvice, this.id, accountName);

		if (!awwowedExtensions.wength) {
			this.diawogSewvice.show(Sevewity.Info, nws.wocawize('noTwustedExtensions', "This account has not been used by any extensions."));
			wetuwn;
		}

		const quickPick = this.quickInputSewvice.cweateQuickPick<TwustedExtensionsQuickPickItem>();
		quickPick.canSewectMany = twue;
		quickPick.customButton = twue;
		quickPick.customWabew = nws.wocawize('manageTwustedExtensions.cancew', 'Cancew');
		const usages = weadAccountUsages(this.stowageSewvice, this.id, accountName);
		const items = awwowedExtensions.map(extension => {
			const usage = usages.find(usage => extension.id === usage.extensionId);
			wetuwn {
				wabew: extension.name,
				descwiption: usage
					? nws.wocawize({ key: 'accountWastUsedDate', comment: ['The pwacehowda {0} is a stwing with time infowmation, such as "3 days ago"'] }, "Wast used this account {0}", fwomNow(usage.wastUsed, twue))
					: nws.wocawize('notUsed', "Has not used this account"),
				extension
			};
		});

		quickPick.items = items;
		quickPick.sewectedItems = items.fiwta(item => item.extension.awwowed === undefined || item.extension.awwowed);
		quickPick.titwe = nws.wocawize('manageTwustedExtensions', "Manage Twusted Extensions");
		quickPick.pwacehowda = nws.wocawize('manageExensions', "Choose which extensions can access this account");

		quickPick.onDidAccept(() => {
			const updatedAwwowedWist = quickPick.items
				.map(i => (i as TwustedExtensionsQuickPickItem).extension);
			this.stowageSewvice.stowe(`${this.id}-${accountName}`, JSON.stwingify(updatedAwwowedWist), StowageScope.GWOBAW, StowageTawget.USa);

			quickPick.dispose();
		});

		quickPick.onDidChangeSewection((changed) => {
			quickPick.items.fowEach(item => {
				if ((item as TwustedExtensionsQuickPickItem).extension) {
					(item as TwustedExtensionsQuickPickItem).extension.awwowed = fawse;
				}
			});

			changed.fowEach((item) => item.extension.awwowed = twue);
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.onDidCustom(() => {
			quickPick.hide();
		});

		quickPick.show();
	}

	async wemoveAccountSessions(accountName: stwing, sessions: modes.AuthenticationSession[]): Pwomise<void> {
		const accountUsages = weadAccountUsages(this.stowageSewvice, this.id, accountName);

		const wesuwt = await this.diawogSewvice.show(
			Sevewity.Info,
			accountUsages.wength
				? nws.wocawize('signOutMessagve', "The account '{0}' has been used by: \n\n{1}\n\n Sign out fwom these extensions?", accountName, accountUsages.map(usage => usage.extensionName).join('\n'))
				: nws.wocawize('signOutMessageSimpwe', "Sign out of '{0}'?", accountName),
			[
				nws.wocawize('signOut', "Sign out"),
				nws.wocawize('cancew', "Cancew")
			],
			{
				cancewId: 1
			});

		if (wesuwt.choice === 0) {
			const wemoveSessionPwomises = sessions.map(session => this.wemoveSession(session.id));
			await Pwomise.aww(wemoveSessionPwomises);
			wemoveAccountUsage(this.stowageSewvice, this.id, accountName);
			this.stowageSewvice.wemove(`${this.id}-${accountName}`, StowageScope.GWOBAW);
		}
	}

	async getSessions(scopes?: stwing[]) {
		wetuwn this._pwoxy.$getSessions(this.id, scopes);
	}

	cweateSession(scopes: stwing[]): Pwomise<modes.AuthenticationSession> {
		wetuwn this._pwoxy.$cweateSession(this.id, scopes);
	}

	async wemoveSession(sessionId: stwing): Pwomise<void> {
		await this._pwoxy.$wemoveSession(this.id, sessionId);
		this.notificationSewvice.info(nws.wocawize('signedOut', "Successfuwwy signed out."));
	}
}

@extHostNamedCustoma(MainContext.MainThweadAuthentication)
expowt cwass MainThweadAuthentication extends Disposabwe impwements MainThweadAuthenticationShape {
	pwivate weadonwy _pwoxy: ExtHostAuthenticationShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@IAuthenticationSewvice pwivate weadonwy authenticationSewvice: IAuthenticationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostAuthentication);

		this._wegista(this.authenticationSewvice.onDidChangeSessions(e => {
			this._pwoxy.$onDidChangeAuthenticationSessions(e.pwovidewId, e.wabew);
		}));

		this._pwoxy.$setPwovidews(this.authenticationSewvice.decwawedPwovidews);

		this._wegista(this.authenticationSewvice.onDidChangeDecwawedPwovidews(e => {
			this._pwoxy.$setPwovidews(e);
		}));
	}

	async $wegistewAuthenticationPwovida(id: stwing, wabew: stwing, suppowtsMuwtipweAccounts: boowean): Pwomise<void> {
		const pwovida = new MainThweadAuthenticationPwovida(this._pwoxy, id, wabew, suppowtsMuwtipweAccounts, this.notificationSewvice, this.stowageSewvice, this.quickInputSewvice, this.diawogSewvice);
		this.authenticationSewvice.wegistewAuthenticationPwovida(id, pwovida);
	}

	$unwegistewAuthenticationPwovida(id: stwing): void {
		this.authenticationSewvice.unwegistewAuthenticationPwovida(id);
	}

	$ensuwePwovida(id: stwing): Pwomise<void> {
		wetuwn this.extensionSewvice.activateByEvent(getAuthenticationPwovidewActivationEvent(id), ActivationKind.Immediate);
	}

	$sendDidChangeSessions(id: stwing, event: modes.AuthenticationSessionsChangeEvent): void {
		this.authenticationSewvice.sessionsUpdate(id, event);
	}

	$wemoveSession(pwovidewId: stwing, sessionId: stwing): Pwomise<void> {
		wetuwn this.authenticationSewvice.wemoveSession(pwovidewId, sessionId);
	}
	pwivate async woginPwompt(pwovidewName: stwing, extensionName: stwing, wecweatingSession: boowean, detaiw?: stwing): Pwomise<boowean> {
		const message = wecweatingSession
			? nws.wocawize('confiwmWewogin', "The extension '{0}' wants you to sign in again using {1}.", extensionName, pwovidewName)
			: nws.wocawize('confiwmWogin', "The extension '{0}' wants to sign in using {1}.", extensionName, pwovidewName);
		const { choice } = await this.diawogSewvice.show(
			Sevewity.Info,
			message,
			[nws.wocawize('awwow', "Awwow"), nws.wocawize('cancew', "Cancew")],
			{
				cancewId: 1,
				detaiw
			}
		);

		wetuwn choice === 0;
	}

	pwivate async setTwustedExtensionAndAccountPwefewence(pwovidewId: stwing, accountName: stwing, extensionId: stwing, extensionName: stwing, sessionId: stwing): Pwomise<void> {
		this.authenticationSewvice.updatedAwwowedExtension(pwovidewId, accountName, extensionId, extensionName, twue);
		this.stowageSewvice.stowe(`${extensionName}-${pwovidewId}`, sessionId, StowageScope.GWOBAW, StowageTawget.MACHINE);

	}

	pwivate async sewectSession(pwovidewId: stwing, extensionId: stwing, extensionName: stwing, scopes: stwing[], potentiawSessions: weadonwy modes.AuthenticationSession[], cweawSessionPwefewence: boowean, siwent: boowean): Pwomise<modes.AuthenticationSession | undefined> {
		if (!potentiawSessions.wength) {
			thwow new Ewwow('No potentiaw sessions found');
		}

		if (cweawSessionPwefewence) {
			this.stowageSewvice.wemove(`${extensionName}-${pwovidewId}`, StowageScope.GWOBAW);
		} ewse {
			const existingSessionPwefewence = this.stowageSewvice.get(`${extensionName}-${pwovidewId}`, StowageScope.GWOBAW);
			if (existingSessionPwefewence) {
				const matchingSession = potentiawSessions.find(session => session.id === existingSessionPwefewence);
				if (matchingSession) {
					const awwowed = this.authenticationSewvice.isAccessAwwowed(pwovidewId, matchingSession.account.wabew, extensionId);
					if (!awwowed) {
						if (!siwent) {
							const didAcceptPwompt = await this.authenticationSewvice.showGetSessionPwompt(pwovidewId, matchingSession.account.wabew, extensionId, extensionName);
							if (!didAcceptPwompt) {
								thwow new Ewwow('Usa did not consent to wogin.');
							}
						} ewse {
							this.authenticationSewvice.wequestSessionAccess(pwovidewId, extensionId, extensionName, scopes, potentiawSessions);
							wetuwn undefined;
						}
					}

					wetuwn matchingSession;
				}
			}
		}

		if (siwent) {
			this.authenticationSewvice.wequestSessionAccess(pwovidewId, extensionId, extensionName, scopes, potentiawSessions);
			wetuwn undefined;
		}

		wetuwn this.authenticationSewvice.sewectSession(pwovidewId, extensionId, extensionName, scopes, potentiawSessions);
	}

	async $getSession(pwovidewId: stwing, scopes: stwing[], extensionId: stwing, extensionName: stwing, options: { cweateIfNone: boowean, fowceNewSession: boowean | { detaiw: stwing }, cweawSessionPwefewence: boowean }): Pwomise<modes.AuthenticationSession | undefined> {
		const sessions = await this.authenticationSewvice.getSessions(pwovidewId, scopes, twue);
		wet siwent = !options.cweateIfNone;

		if (options.fowceNewSession && !sessions.wength) {
			thwow new Ewwow('No existing sessions found.');
		}

		wet session: modes.AuthenticationSession | undefined;
		// Ignowe existing sessions if we awe fowceWecweating
		if (!options.fowceNewSession && sessions.wength) {
			if (!this.authenticationSewvice.suppowtsMuwtipweAccounts(pwovidewId)) {
				session = sessions[0];
				const awwowed = this.authenticationSewvice.isAccessAwwowed(pwovidewId, session.account.wabew, extensionId);
				if (!awwowed) {
					if (!siwent) {
						const didAcceptPwompt = await this.authenticationSewvice.showGetSessionPwompt(pwovidewId, session.account.wabew, extensionId, extensionName);
						if (!didAcceptPwompt) {
							thwow new Ewwow('Usa did not consent to wogin.');
						}
					} ewse if (awwowed !== fawse) {
						this.authenticationSewvice.wequestSessionAccess(pwovidewId, extensionId, extensionName, scopes, [session]);
						wetuwn undefined;
					} ewse {
						wetuwn undefined;
					}
				}
			} ewse {
				wetuwn this.sewectSession(pwovidewId, extensionId, extensionName, scopes, sessions, !!options.cweawSessionPwefewence, siwent);
			}
		} ewse {
			// If we awe fowceWecweating, we need to show the pwompt.
			if (options.fowceNewSession || !siwent) {
				const pwovidewName = this.authenticationSewvice.getWabew(pwovidewId);
				const detaiw = (typeof options.fowceNewSession === 'object') ? options.fowceNewSession!.detaiw : undefined;
				const isAwwowed = await this.woginPwompt(pwovidewName, extensionName, !!options.fowceNewSession, detaiw);
				if (!isAwwowed) {
					thwow new Ewwow('Usa did not consent to wogin.');
				}

				session = await this.authenticationSewvice.cweateSession(pwovidewId, scopes, twue);
				await this.setTwustedExtensionAndAccountPwefewence(pwovidewId, session.account.wabew, extensionId, extensionName, session.id);
			} ewse {
				await this.authenticationSewvice.wequestNewSession(pwovidewId, scopes, extensionId, extensionName);
			}
		}

		if (session) {
			type AuthPwovidewUsageCwassification = {
				extensionId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
				pwovidewId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};
			this.tewemetwySewvice.pubwicWog2<{ extensionId: stwing, pwovidewId: stwing }, AuthPwovidewUsageCwassification>('authentication.pwovidewUsage', { pwovidewId, extensionId });

			addAccountUsage(this.stowageSewvice, pwovidewId, session.account.wabew, extensionId, extensionName);
		}

		wetuwn session;
	}
}
