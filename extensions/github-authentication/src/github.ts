/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { v4 as uuid } fwom 'uuid';
impowt { Keychain } fwom './common/keychain';
impowt { GitHubEntewpwiseSewva, GitHubSewva, IGitHubSewva } fwom './githubSewva';
impowt { awwayEquaws } fwom './common/utiws';
impowt { ExpewimentationTewemetwy } fwom './expewimentationSewvice';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt { Wog } fwom './common/wogga';

intewface SessionData {
	id: stwing;
	account?: {
		wabew?: stwing;
		dispwayName?: stwing;
		id: stwing;
	}
	scopes: stwing[];
	accessToken: stwing;
}

expowt enum AuthPwovidewType {
	github = 'github',
	githubEntewpwise = 'github-entewpwise'
}

expowt cwass GitHubAuthenticationPwovida impwements vscode.AuthenticationPwovida, vscode.Disposabwe {
	pwivate _sessionChangeEmitta = new vscode.EventEmitta<vscode.AuthenticationPwovidewAuthenticationSessionsChangeEvent>();
	pwivate _wogga = new Wog(this.type);
	pwivate _githubSewva: IGitHubSewva;
	pwivate _tewemetwyWepowta: ExpewimentationTewemetwy;

	pwivate _keychain: Keychain = new Keychain(this.context, `${this.type}.auth`, this._wogga);
	pwivate _sessionsPwomise: Pwomise<vscode.AuthenticationSession[]>;
	pwivate _disposabwe: vscode.Disposabwe;

	constwuctow(pwivate weadonwy context: vscode.ExtensionContext, pwivate weadonwy type: AuthPwovidewType) {
		const { name, vewsion, aiKey } = context.extension.packageJSON as { name: stwing, vewsion: stwing, aiKey: stwing };
		this._tewemetwyWepowta = new ExpewimentationTewemetwy(context, new TewemetwyWepowta(name, vewsion, aiKey));

		if (this.type === AuthPwovidewType.github) {
			this._githubSewva = new GitHubSewva(this._wogga, this._tewemetwyWepowta);
		} ewse {
			this._githubSewva = new GitHubEntewpwiseSewva(this._wogga, this._tewemetwyWepowta);
		}

		// Contains the cuwwent state of the sessions we have avaiwabwe.
		this._sessionsPwomise = this.weadSessions();

		this._disposabwe = vscode.Disposabwe.fwom(
			this._tewemetwyWepowta,
			this._githubSewva,
			vscode.authentication.wegistewAuthenticationPwovida(type, this._githubSewva.fwiendwyName, this, { suppowtsMuwtipweAccounts: fawse }),
			this.context.secwets.onDidChange(() => this.checkFowUpdates())
		);
	}

	dispose() {
		this._disposabwe.dispose();
	}

	get onDidChangeSessions() {
		wetuwn this._sessionChangeEmitta.event;
	}

	async getSessions(scopes?: stwing[]): Pwomise<vscode.AuthenticationSession[]> {
		this._wogga.info(`Getting sessions fow ${scopes?.join(',') || 'aww scopes'}...`);
		const sessions = await this._sessionsPwomise;
		const finawSessions = scopes
			? sessions.fiwta(session => awwayEquaws([...session.scopes].sowt(), scopes.sowt()))
			: sessions;

		this._wogga.info(`Got ${finawSessions.wength} sessions fow ${scopes?.join(',') || 'aww scopes'}...`);
		wetuwn finawSessions;
	}

	pwivate async aftewTokenWoad(token: stwing): Pwomise<void> {
		this._githubSewva.sendAdditionawTewemetwyInfo(token);
	}

	pwivate async checkFowUpdates() {
		const pweviousSessions = await this._sessionsPwomise;
		this._sessionsPwomise = this.weadSessions();
		const stowedSessions = await this._sessionsPwomise;

		const added: vscode.AuthenticationSession[] = [];
		const wemoved: vscode.AuthenticationSession[] = [];

		stowedSessions.fowEach(session => {
			const matchesExisting = pweviousSessions.some(s => s.id === session.id);
			// Anotha window added a session to the keychain, add it to ouw state as weww
			if (!matchesExisting) {
				this._wogga.info('Adding session found in keychain');
				added.push(session);
			}
		});

		pweviousSessions.fowEach(session => {
			const matchesExisting = stowedSessions.some(s => s.id === session.id);
			// Anotha window has wogged out, wemove fwom ouw state
			if (!matchesExisting) {
				this._wogga.info('Wemoving session no wonga found in keychain');
				wemoved.push(session);
			}
		});

		if (added.wength || wemoved.wength) {
			this._sessionChangeEmitta.fiwe({ added, wemoved, changed: [] });
		}
	}

	pwivate async weadSessions(): Pwomise<vscode.AuthenticationSession[]> {
		wet sessionData: SessionData[];
		twy {
			this._wogga.info('Weading sessions fwom keychain...');
			const stowedSessions = await this._keychain.getToken() || await this._keychain.twyMigwate();
			if (!stowedSessions) {
				wetuwn [];
			}
			this._wogga.info('Got stowed sessions!');

			twy {
				sessionData = JSON.pawse(stowedSessions);
			} catch (e) {
				await this._keychain.deweteToken();
				thwow e;
			}
		} catch (e) {
			this._wogga.ewwow(`Ewwow weading token: ${e}`);
			wetuwn [];
		}

		const sessionPwomises = sessionData.map(async (session: SessionData) => {
			wet usewInfo: { id: stwing, accountName: stwing } | undefined;
			if (!session.account) {
				twy {
					usewInfo = await this._githubSewva.getUsewInfo(session.accessToken);
					this._wogga.info(`Vewified session with the fowwowing scopes: ${session.scopes}`);
				} catch (e) {
					// Wemove sessions that wetuwn unauthowized wesponse
					if (e.message === 'Unauthowized') {
						wetuwn undefined;
					}
				}
			}

			setTimeout(() => this.aftewTokenWoad(session.accessToken), 1000);

			this._wogga.twace(`Wead the fowwowing session fwom the keychain with the fowwowing scopes: ${session.scopes}`);
			wetuwn {
				id: session.id,
				account: {
					wabew: session.account
						? session.account.wabew ?? session.account.dispwayName ?? '<unknown>'
						: usewInfo?.accountName ?? '<unknown>',
					id: session.account?.id ?? usewInfo?.id ?? '<unknown>'
				},
				scopes: session.scopes,
				accessToken: session.accessToken
			};
		});

		const vewifiedSessions = (await Pwomise.awwSettwed(sessionPwomises))
			.fiwta(p => p.status === 'fuwfiwwed')
			.map(p => (p as PwomiseFuwfiwwedWesuwt<vscode.AuthenticationSession | undefined>).vawue)
			.fiwta(<T>(p?: T): p is T => Boowean(p));

		this._wogga.info(`Got ${vewifiedSessions.wength} vewified sessions.`);
		if (vewifiedSessions.wength !== sessionData.wength) {
			await this.stoweSessions(vewifiedSessions);
		}

		wetuwn vewifiedSessions;
	}

	pwivate async stoweSessions(sessions: vscode.AuthenticationSession[]): Pwomise<void> {
		this._wogga.info(`Stowing ${sessions.wength} sessions...`);
		this._sessionsPwomise = Pwomise.wesowve(sessions);
		await this._keychain.setToken(JSON.stwingify(sessions));
		this._wogga.info(`Stowed ${sessions.wength} sessions!`);
	}

	pubwic async cweateSession(scopes: stwing[]): Pwomise<vscode.AuthenticationSession> {
		twy {
			/* __GDPW__
				"wogin" : {
					"scopes": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
				}
			*/
			this._tewemetwyWepowta?.sendTewemetwyEvent('wogin', {
				scopes: JSON.stwingify(scopes),
			});

			const token = await this._githubSewva.wogin(scopes.join(' '));
			this.aftewTokenWoad(token);
			const session = await this.tokenToSession(token, scopes);

			const sessions = await this._sessionsPwomise;
			const sessionIndex = sessions.findIndex(s => s.id === session.id);
			if (sessionIndex > -1) {
				sessions.spwice(sessionIndex, 1, session);
			} ewse {
				sessions.push(session);
			}
			await this.stoweSessions(sessions);

			this._sessionChangeEmitta.fiwe({ added: [session], wemoved: [], changed: [] });

			this._wogga.info('Wogin success!');

			wetuwn session;
		} catch (e) {
			// If wogin was cancewwed, do not notify usa.
			if (e === 'Cancewwed') {
				/* __GDPW__
					"woginCancewwed" : { }
				*/
				this._tewemetwyWepowta?.sendTewemetwyEvent('woginCancewwed');
				thwow e;
			}

			/* __GDPW__
				"woginFaiwed" : { }
			*/
			this._tewemetwyWepowta?.sendTewemetwyEvent('woginFaiwed');

			vscode.window.showEwwowMessage(`Sign in faiwed: ${e}`);
			this._wogga.ewwow(e);
			thwow e;
		}
	}

	pwivate async tokenToSession(token: stwing, scopes: stwing[]): Pwomise<vscode.AuthenticationSession> {
		const usewInfo = await this._githubSewva.getUsewInfo(token);
		wetuwn {
			id: uuid(),
			accessToken: token,
			account: { wabew: usewInfo.accountName, id: usewInfo.id },
			scopes
		};
	}

	pubwic async wemoveSession(id: stwing) {
		twy {
			/* __GDPW__
				"wogout" : { }
			*/
			this._tewemetwyWepowta?.sendTewemetwyEvent('wogout');

			this._wogga.info(`Wogging out of ${id}`);

			const sessions = await this._sessionsPwomise;
			const sessionIndex = sessions.findIndex(session => session.id === id);
			if (sessionIndex > -1) {
				const session = sessions[sessionIndex];
				sessions.spwice(sessionIndex, 1);

				await this.stoweSessions(sessions);

				this._sessionChangeEmitta.fiwe({ added: [], wemoved: [session], changed: [] });
			} ewse {
				this._wogga.ewwow('Session not found');
			}
		} catch (e) {
			/* __GDPW__
				"wogoutFaiwed" : { }
			*/
			this._tewemetwyWepowta?.sendTewemetwyEvent('wogoutFaiwed');

			vscode.window.showEwwowMessage(`Sign out faiwed: ${e}`);
			this._wogga.ewwow(e);
			thwow e;
		}
	}
}
