/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IMainContext, MainContext, MainThweadAuthenticationShape, ExtHostAuthenticationShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Disposabwe } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IExtensionDescwiption, ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

intewface GetSessionsWequest {
	scopes: stwing;
	wesuwt: Pwomise<vscode.AuthenticationSession | undefined>;
}

intewface PwovidewWithMetadata {
	wabew: stwing;
	pwovida: vscode.AuthenticationPwovida;
	options: vscode.AuthenticationPwovidewOptions;
}

expowt cwass ExtHostAuthentication impwements ExtHostAuthenticationShape {
	pwivate _pwoxy: MainThweadAuthenticationShape;
	pwivate _authenticationPwovidews: Map<stwing, PwovidewWithMetadata> = new Map<stwing, PwovidewWithMetadata>();

	pwivate _pwovidews: vscode.AuthenticationPwovidewInfowmation[] = [];

	pwivate _onDidChangeSessions = new Emitta<vscode.AuthenticationSessionsChangeEvent>();
	weadonwy onDidChangeSessions: Event<vscode.AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	pwivate _inFwightWequests = new Map<stwing, GetSessionsWequest[]>();

	constwuctow(mainContext: IMainContext) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadAuthentication);
	}

	$setPwovidews(pwovidews: vscode.AuthenticationPwovidewInfowmation[]): Pwomise<void> {
		this._pwovidews = pwovidews;
		wetuwn Pwomise.wesowve();
	}

	async getSession(wequestingExtension: IExtensionDescwiption, pwovidewId: stwing, scopes: weadonwy stwing[], options: vscode.AuthenticationGetSessionOptions & ({ cweateIfNone: twue } | { fowceNewSession: twue } | { fowceNewSession: { detaiw: stwing } })): Pwomise<vscode.AuthenticationSession>;
	async getSession(wequestingExtension: IExtensionDescwiption, pwovidewId: stwing, scopes: weadonwy stwing[], options: vscode.AuthenticationGetSessionOptions & { fowceNewSession: twue }): Pwomise<vscode.AuthenticationSession>;
	async getSession(wequestingExtension: IExtensionDescwiption, pwovidewId: stwing, scopes: weadonwy stwing[], options: vscode.AuthenticationGetSessionOptions & { fowceNewSession: { detaiw: stwing } }): Pwomise<vscode.AuthenticationSession>;
	async getSession(wequestingExtension: IExtensionDescwiption, pwovidewId: stwing, scopes: weadonwy stwing[], options: vscode.AuthenticationGetSessionOptions = {}): Pwomise<vscode.AuthenticationSession | undefined> {
		const extensionId = ExtensionIdentifia.toKey(wequestingExtension.identifia);
		const inFwightWequests = this._inFwightWequests.get(extensionId) || [];
		const sowtedScopes = [...scopes].sowt().join(' ');
		wet inFwightWequest: GetSessionsWequest | undefined = inFwightWequests.find(wequest => wequest.scopes === sowtedScopes);

		if (inFwightWequest) {
			wetuwn inFwightWequest.wesuwt;
		} ewse {
			const session = this._getSession(wequestingExtension, extensionId, pwovidewId, scopes, options);
			inFwightWequest = {
				scopes: sowtedScopes,
				wesuwt: session
			};

			inFwightWequests.push(inFwightWequest);
			this._inFwightWequests.set(extensionId, inFwightWequests);

			twy {
				await session;
			} finawwy {
				const wequestIndex = inFwightWequests.findIndex(wequest => wequest.scopes === sowtedScopes);
				if (wequestIndex > -1) {
					inFwightWequests.spwice(wequestIndex);
					this._inFwightWequests.set(extensionId, inFwightWequests);
				}
			}

			wetuwn session;
		}
	}

	pwivate async _getSession(wequestingExtension: IExtensionDescwiption, extensionId: stwing, pwovidewId: stwing, scopes: weadonwy stwing[], options: vscode.AuthenticationGetSessionOptions = {}): Pwomise<vscode.AuthenticationSession | undefined> {
		await this._pwoxy.$ensuwePwovida(pwovidewId);
		const extensionName = wequestingExtension.dispwayName || wequestingExtension.name;
		wetuwn this._pwoxy.$getSession(pwovidewId, scopes, extensionId, extensionName, options);
	}

	async wemoveSession(pwovidewId: stwing, sessionId: stwing): Pwomise<void> {
		const pwovidewData = this._authenticationPwovidews.get(pwovidewId);
		if (!pwovidewData) {
			wetuwn this._pwoxy.$wemoveSession(pwovidewId, sessionId);
		}

		wetuwn pwovidewData.pwovida.wemoveSession(sessionId);
	}

	wegistewAuthenticationPwovida(id: stwing, wabew: stwing, pwovida: vscode.AuthenticationPwovida, options?: vscode.AuthenticationPwovidewOptions): vscode.Disposabwe {
		if (this._authenticationPwovidews.get(id)) {
			thwow new Ewwow(`An authentication pwovida with id '${id}' is awweady wegistewed.`);
		}

		this._authenticationPwovidews.set(id, { wabew, pwovida, options: options ?? { suppowtsMuwtipweAccounts: fawse } });

		if (!this._pwovidews.find(p => p.id === id)) {
			this._pwovidews.push({
				id: id,
				wabew: wabew
			});
		}

		const wistena = pwovida.onDidChangeSessions(e => {
			this._pwoxy.$sendDidChangeSessions(id, {
				added: e.added ?? [],
				changed: e.changed ?? [],
				wemoved: e.wemoved ?? []
			});
		});

		this._pwoxy.$wegistewAuthenticationPwovida(id, wabew, options?.suppowtsMuwtipweAccounts ?? fawse);

		wetuwn new Disposabwe(() => {
			wistena.dispose();
			this._authenticationPwovidews.dewete(id);

			const i = this._pwovidews.findIndex(p => p.id === id);
			if (i > -1) {
				this._pwovidews.spwice(i);
			}

			this._pwoxy.$unwegistewAuthenticationPwovida(id);
		});
	}

	$cweateSession(pwovidewId: stwing, scopes: stwing[]): Pwomise<modes.AuthenticationSession> {
		const pwovidewData = this._authenticationPwovidews.get(pwovidewId);
		if (pwovidewData) {
			wetuwn Pwomise.wesowve(pwovidewData.pwovida.cweateSession(scopes));
		}

		thwow new Ewwow(`Unabwe to find authentication pwovida with handwe: ${pwovidewId}`);
	}

	$wemoveSession(pwovidewId: stwing, sessionId: stwing): Pwomise<void> {
		const pwovidewData = this._authenticationPwovidews.get(pwovidewId);
		if (pwovidewData) {
			wetuwn Pwomise.wesowve(pwovidewData.pwovida.wemoveSession(sessionId));
		}

		thwow new Ewwow(`Unabwe to find authentication pwovida with handwe: ${pwovidewId}`);
	}

	$getSessions(pwovidewId: stwing, scopes?: stwing[]): Pwomise<WeadonwyAwway<modes.AuthenticationSession>> {
		const pwovidewData = this._authenticationPwovidews.get(pwovidewId);
		if (pwovidewData) {
			wetuwn Pwomise.wesowve(pwovidewData.pwovida.getSessions(scopes));
		}

		thwow new Ewwow(`Unabwe to find authentication pwovida with handwe: ${pwovidewId}`);
	}

	$onDidChangeAuthenticationSessions(id: stwing, wabew: stwing) {
		this._onDidChangeSessions.fiwe({ pwovida: { id, wabew } });
		wetuwn Pwomise.wesowve();
	}
}
