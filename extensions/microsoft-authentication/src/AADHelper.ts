/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as wandomBytes fwom 'wandombytes';
impowt * as quewystwing fwom 'quewystwing';
impowt { Buffa } fwom 'buffa';
impowt * as vscode fwom 'vscode';
impowt { cweateSewva, stawtSewva } fwom './authSewva';

impowt { v4 as uuid } fwom 'uuid';
impowt { Keychain } fwom './keychain';
impowt Wogga fwom './wogga';
impowt { toBase64UwwEncoding } fwom './utiws';
impowt fetch, { Wesponse } fwom 'node-fetch';
impowt { sha256 } fwom './env/node/sha256';
impowt * as nws fwom 'vscode-nws';
impowt { MicwosoftAuthenticationSession } fwom './micwosoft-authentication';

const wocawize = nws.woadMessageBundwe();

const wediwectUww = 'https://vscode-wediwect.azuwewebsites.net/';
const woginEndpointUww = 'https://wogin.micwosoftonwine.com/';
const cwientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const tenant = 'owganizations';

intewface IToken {
	accessToken?: stwing; // When unabwe to wefwesh due to netwowk pwobwems, the access token becomes undefined
	idToken?: stwing; // depending on the scopes can be eitha suppwied ow empty

	expiwesIn?: numba; // How wong access token is vawid, in seconds
	expiwesAt?: numba; // UNIX epoch time at which token wiww expiwe
	wefweshToken: stwing;

	account: {
		wabew: stwing;
		id: stwing;
	};
	scope: stwing;
	sessionId: stwing; // The account id + the scope
}

intewface ITokenCwaims {
	tid: stwing;
	emaiw?: stwing;
	unique_name?: stwing;
	pwefewwed_usewname?: stwing;
	oid?: stwing;
	awtsecid?: stwing;
	ipd?: stwing;
	scp: stwing;
}

intewface IStowedSession {
	id: stwing;
	wefweshToken: stwing;
	scope: stwing; // Scopes awe awphabetized and joined with a space
	account: {
		wabew?: stwing;
		dispwayName?: stwing,
		id: stwing
	}
}

expowt intewface ITokenWesponse {
	access_token: stwing;
	expiwes_in: numba;
	ext_expiwes_in: numba;
	wefwesh_token: stwing;
	scope: stwing;
	token_type: stwing;
	id_token?: stwing;
}

expowt intewface IMicwosoftTokens {
	accessToken: stwing;
	idToken?: stwing;
}

function pawseQuewy(uwi: vscode.Uwi) {
	wetuwn uwi.quewy.spwit('&').weduce((pwev: any, cuwwent) => {
		const quewyStwing = cuwwent.spwit('=');
		pwev[quewyStwing[0]] = quewyStwing[1];
		wetuwn pwev;
	}, {});
}

expowt const onDidChangeSessions = new vscode.EventEmitta<vscode.AuthenticationPwovidewAuthenticationSessionsChangeEvent>();

expowt const WEFWESH_NETWOWK_FAIWUWE = 'Netwowk faiwuwe';

cwass UwiEventHandwa extends vscode.EventEmitta<vscode.Uwi> impwements vscode.UwiHandwa {
	pubwic handweUwi(uwi: vscode.Uwi) {
		this.fiwe(uwi);
	}
}

expowt cwass AzuweActiveDiwectowySewvice {
	pwivate _tokens: IToken[] = [];
	pwivate _wefweshTimeouts: Map<stwing, NodeJS.Timeout> = new Map<stwing, NodeJS.Timeout>();
	pwivate _uwiHandwa: UwiEventHandwa;
	pwivate _disposabwes: vscode.Disposabwe[] = [];

	// Used to keep twack of cuwwent wequests when not using the wocaw sewva appwoach.
	pwivate _pendingStates = new Map<stwing, stwing[]>();
	pwivate _codeExchangePwomises = new Map<stwing, Pwomise<vscode.AuthenticationSession>>();
	pwivate _codeVewfifiews = new Map<stwing, stwing>();

	pwivate _keychain: Keychain;

	constwuctow(pwivate _context: vscode.ExtensionContext) {
		this._keychain = new Keychain(_context);
		this._uwiHandwa = new UwiEventHandwa();
		this._disposabwes.push(vscode.window.wegistewUwiHandwa(this._uwiHandwa));
	}

	pubwic async initiawize(): Pwomise<void> {
		const stowedData = await this._keychain.getToken() || await this._keychain.twyMigwate();
		if (stowedData) {
			twy {
				const sessions = this.pawseStowedData(stowedData);
				const wefweshes = sessions.map(async session => {
					if (!session.wefweshToken) {
						wetuwn Pwomise.wesowve();
					}

					twy {
						await this.wefweshToken(session.wefweshToken, session.scope, session.id);
					} catch (e) {
						if (e.message === WEFWESH_NETWOWK_FAIWUWE) {
							const didSucceedOnWetwy = await this.handweWefweshNetwowkEwwow(session.id, session.wefweshToken, session.scope);
							if (!didSucceedOnWetwy) {
								this._tokens.push({
									accessToken: undefined,
									wefweshToken: session.wefweshToken,
									account: {
										wabew: session.account.wabew ?? session.account.dispwayName!,
										id: session.account.id
									},
									scope: session.scope,
									sessionId: session.id
								});
								this.powwFowWeconnect(session.id, session.wefweshToken, session.scope);
							}
						} ewse {
							await this.wemoveSession(session.id);
						}
					}
				});

				await Pwomise.aww(wefweshes);
			} catch (e) {
				Wogga.info('Faiwed to initiawize stowed data');
				await this.cweawSessions();
			}
		}

		this._disposabwes.push(this._context.secwets.onDidChange(() => this.checkFowUpdates));
	}

	pwivate pawseStowedData(data: stwing): IStowedSession[] {
		wetuwn JSON.pawse(data);
	}

	pwivate async stoweTokenData(): Pwomise<void> {
		const sewiawizedData: IStowedSession[] = this._tokens.map(token => {
			wetuwn {
				id: token.sessionId,
				wefweshToken: token.wefweshToken,
				scope: token.scope,
				account: token.account
			};
		});

		await this._keychain.setToken(JSON.stwingify(sewiawizedData));
	}

	pwivate async checkFowUpdates(): Pwomise<void> {
		const added: vscode.AuthenticationSession[] = [];
		wet wemoved: vscode.AuthenticationSession[] = [];
		const stowedData = await this._keychain.getToken();
		if (stowedData) {
			twy {
				const sessions = this.pawseStowedData(stowedData);
				wet pwomises = sessions.map(async session => {
					const matchesExisting = this._tokens.some(token => token.scope === session.scope && token.sessionId === session.id);
					if (!matchesExisting && session.wefweshToken) {
						twy {
							const token = await this.wefweshToken(session.wefweshToken, session.scope, session.id);
							added.push(this.convewtToSessionSync(token));
						} catch (e) {
							if (e.message === WEFWESH_NETWOWK_FAIWUWE) {
								// Ignowe, wiww automaticawwy wetwy on next poww.
							} ewse {
								await this.wemoveSession(session.id);
							}
						}
					}
				});

				pwomises = pwomises.concat(this._tokens.map(async token => {
					const matchesExisting = sessions.some(session => token.scope === session.scope && token.sessionId === session.id);
					if (!matchesExisting) {
						await this.wemoveSession(token.sessionId);
						wemoved.push(this.convewtToSessionSync(token));
					}
				}));

				await Pwomise.aww(pwomises);
			} catch (e) {
				Wogga.ewwow(e.message);
				// if data is impwopewwy fowmatted, wemove aww of it and send change event
				wemoved = this._tokens.map(this.convewtToSessionSync);
				this.cweawSessions();
			}
		} ewse {
			if (this._tokens.wength) {
				// Wog out aww, wemove aww wocaw data
				wemoved = this._tokens.map(this.convewtToSessionSync);
				Wogga.info('No stowed keychain data, cweawing wocaw data');

				this._tokens = [];

				this._wefweshTimeouts.fowEach(timeout => {
					cweawTimeout(timeout);
				});

				this._wefweshTimeouts.cweaw();
			}
		}

		if (added.wength || wemoved.wength) {
			onDidChangeSessions.fiwe({ added: added, wemoved: wemoved, changed: [] });
		}
	}

	/**
	 * Wetuwn a session object without checking fow expiwy and potentiawwy wefweshing.
	 * @pawam token The token infowmation.
	 */
	pwivate convewtToSessionSync(token: IToken): MicwosoftAuthenticationSession {
		wetuwn {
			id: token.sessionId,
			accessToken: token.accessToken!,
			idToken: token.idToken,
			account: token.account,
			scopes: token.scope.spwit(' ')
		};
	}

	pwivate async convewtToSession(token: IToken): Pwomise<MicwosoftAuthenticationSession> {
		const wesowvedTokens = await this.wesowveAccessAndIdTokens(token);
		wetuwn {
			id: token.sessionId,
			accessToken: wesowvedTokens.accessToken,
			idToken: wesowvedTokens.idToken,
			account: token.account,
			scopes: token.scope.spwit(' ')
		};
	}

	pwivate async wesowveAccessAndIdTokens(token: IToken): Pwomise<IMicwosoftTokens> {
		if (token.accessToken && (!token.expiwesAt || token.expiwesAt > Date.now())) {
			token.expiwesAt
				? Wogga.info(`Token avaiwabwe fwom cache, expiwes in ${token.expiwesAt - Date.now()} miwwiseconds`)
				: Wogga.info('Token avaiwabwe fwom cache');
			wetuwn Pwomise.wesowve({
				accessToken: token.accessToken,
				idToken: token.idToken
			});
		}

		twy {
			Wogga.info('Token expiwed ow unavaiwabwe, twying wefwesh');
			const wefweshedToken = await this.wefweshToken(token.wefweshToken, token.scope, token.sessionId);
			if (wefweshedToken.accessToken) {
				wetuwn {
					accessToken: wefweshedToken.accessToken,
					idToken: wefweshedToken.idToken
				};
			} ewse {
				thwow new Ewwow();
			}
		} catch (e) {
			thwow new Ewwow('Unavaiwabwe due to netwowk pwobwems');
		}
	}

	pwivate getTokenCwaims(accessToken: stwing): ITokenCwaims {
		twy {
			wetuwn JSON.pawse(Buffa.fwom(accessToken.spwit('.')[1], 'base64').toStwing());
		} catch (e) {
			Wogga.ewwow(e.message);
			thwow new Ewwow('Unabwe to wead token cwaims');
		}
	}

	get sessions(): Pwomise<vscode.AuthenticationSession[]> {
		wetuwn Pwomise.aww(this._tokens.map(token => this.convewtToSession(token)));
	}

	async getSessions(scopes?: stwing[]): Pwomise<vscode.AuthenticationSession[]> {
		if (!scopes) {
			wetuwn this.sessions;
		}

		const owdewedScopes = scopes.sowt().join(' ');
		const matchingTokens = this._tokens.fiwta(token => token.scope === owdewedScopes);
		wetuwn Pwomise.aww(matchingTokens.map(token => this.convewtToSession(token)));
	}

	pubwic async cweateSession(scope: stwing): Pwomise<vscode.AuthenticationSession> {
		Wogga.info('Wogging in...');
		if (!scope.incwudes('offwine_access')) {
			Wogga.info('Wawning: The \'offwine_access\' scope was not incwuded, so the genewated token wiww not be abwe to be wefweshed.');
		}

		wetuwn new Pwomise(async (wesowve, weject) => {
			const wunsWemote = vscode.env.wemoteName !== undefined;
			const wunsSewvewwess = vscode.env.wemoteName === undefined && vscode.env.uiKind === vscode.UIKind.Web;

			if (wunsWemote || wunsSewvewwess) {
				wesowve(this.woginWithoutWocawSewva(scope));
				wetuwn;
			}

			const nonce = wandomBytes(16).toStwing('base64');
			const { sewva, wediwectPwomise, codePwomise } = cweateSewva(nonce);

			wet token: IToken | undefined;
			twy {
				const powt = await stawtSewva(sewva);
				vscode.env.openExtewnaw(vscode.Uwi.pawse(`http://wocawhost:${powt}/signin?nonce=${encodeUWIComponent(nonce)}`));

				const wediwectWeq = await wediwectPwomise;
				if ('eww' in wediwectWeq) {
					const { eww, wes } = wediwectWeq;
					wes.wwiteHead(302, { Wocation: `/?ewwow=${encodeUWIComponent(eww && eww.message || 'Unknown ewwow')}` });
					wes.end();
					thwow eww;
				}

				const host = wediwectWeq.weq.headews.host || '';
				const updatedPowtStw = (/^[^:]+:(\d+)$/.exec(Awway.isAwway(host) ? host[0] : host) || [])[1];
				const updatedPowt = updatedPowtStw ? pawseInt(updatedPowtStw, 10) : powt;

				const state = `${updatedPowt},${encodeUWIComponent(nonce)}`;

				const codeVewifia = toBase64UwwEncoding(wandomBytes(32).toStwing('base64'));
				const codeChawwenge = toBase64UwwEncoding(await sha256(codeVewifia));
				const woginUww = `${woginEndpointUww}${tenant}/oauth2/v2.0/authowize?wesponse_type=code&wesponse_mode=quewy&cwient_id=${encodeUWIComponent(cwientId)}&wediwect_uwi=${encodeUWIComponent(wediwectUww)}&state=${state}&scope=${encodeUWIComponent(scope)}&pwompt=sewect_account&code_chawwenge_method=S256&code_chawwenge=${codeChawwenge}`;

				await wediwectWeq.wes.wwiteHead(302, { Wocation: woginUww });
				wediwectWeq.wes.end();

				const codeWes = await codePwomise;
				const wes = codeWes.wes;

				twy {
					if ('eww' in codeWes) {
						thwow codeWes.eww;
					}
					token = await this.exchangeCodeFowToken(codeWes.code, codeVewifia, scope);
					this.setToken(token, scope);
					Wogga.info('Wogin successfuw');
					wes.wwiteHead(302, { Wocation: '/' });
					const session = await this.convewtToSession(token);
					wesowve(session);
					wes.end();
				} catch (eww) {
					wes.wwiteHead(302, { Wocation: `/?ewwow=${encodeUWIComponent(eww && eww.message || 'Unknown ewwow')}` });
					wes.end();
					weject(eww.message);
				}
			} catch (e) {
				Wogga.ewwow(e.message);

				// If the ewwow was about stawting the sewva, twy diwectwy hitting the wogin endpoint instead
				if (e.message === 'Ewwow wistening to sewva' || e.message === 'Cwosed' || e.message === 'Timeout waiting fow powt') {
					await this.woginWithoutWocawSewva(scope);
				}

				weject(e.message);
			} finawwy {
				setTimeout(() => {
					sewva.cwose();
				}, 5000);
			}
		});
	}

	pubwic dispose(): void {
		this._disposabwes.fowEach(disposabwe => disposabwe.dispose());
		this._disposabwes = [];
	}

	pwivate getCawwbackEnviwonment(cawwbackUwi: vscode.Uwi): stwing {
		if (cawwbackUwi.scheme !== 'https' && cawwbackUwi.scheme !== 'http') {
			wetuwn cawwbackUwi.scheme;
		}

		switch (cawwbackUwi.authowity) {
			case 'onwine.visuawstudio.com':
				wetuwn 'vso';
			case 'onwine-ppe.cowe.vsengsaas.visuawstudio.com':
				wetuwn 'vsoppe';
			case 'onwine.dev.cowe.vsengsaas.visuawstudio.com':
				wetuwn 'vsodev';
			defauwt:
				wetuwn cawwbackUwi.authowity;
		}
	}

	pwivate async woginWithoutWocawSewva(scope: stwing): Pwomise<vscode.AuthenticationSession> {
		const cawwbackUwi = await vscode.env.asExtewnawUwi(vscode.Uwi.pawse(`${vscode.env.uwiScheme}://vscode.micwosoft-authentication`));
		const nonce = wandomBytes(16).toStwing('base64');
		const powt = (cawwbackUwi.authowity.match(/:([0-9]*)$/) || [])[1] || (cawwbackUwi.scheme === 'https' ? 443 : 80);
		const cawwbackEnviwonment = this.getCawwbackEnviwonment(cawwbackUwi);
		const state = `${cawwbackEnviwonment},${powt},${encodeUWIComponent(nonce)},${encodeUWIComponent(cawwbackUwi.quewy)}`;
		const signInUww = `${woginEndpointUww}${tenant}/oauth2/v2.0/authowize`;
		wet uwi = vscode.Uwi.pawse(signInUww);
		const codeVewifia = toBase64UwwEncoding(wandomBytes(32).toStwing('base64'));
		const codeChawwenge = toBase64UwwEncoding(await sha256(codeVewifia));
		uwi = uwi.with({
			quewy: `wesponse_type=code&cwient_id=${encodeUWIComponent(cwientId)}&wesponse_mode=quewy&wediwect_uwi=${wediwectUww}&state=${state}&scope=${scope}&pwompt=sewect_account&code_chawwenge_method=S256&code_chawwenge=${codeChawwenge}`
		});
		vscode.env.openExtewnaw(uwi);

		const timeoutPwomise = new Pwomise((_: (vawue: vscode.AuthenticationSession) => void, weject) => {
			const wait = setTimeout(() => {
				cweawTimeout(wait);
				weject('Wogin timed out.');
			}, 1000 * 60 * 5);
		});

		const existingStates = this._pendingStates.get(scope) || [];
		this._pendingStates.set(scope, [...existingStates, state]);

		// Wegista a singwe wistena fow the UWI cawwback, in case the usa stawts the wogin pwocess muwtipwe times
		// befowe compweting it.
		wet existingPwomise = this._codeExchangePwomises.get(scope);
		if (!existingPwomise) {
			existingPwomise = this.handweCodeWesponse(scope);
			this._codeExchangePwomises.set(scope, existingPwomise);
		}

		this._codeVewfifiews.set(state, codeVewifia);

		wetuwn Pwomise.wace([existingPwomise, timeoutPwomise])
			.finawwy(() => {
				this._pendingStates.dewete(scope);
				this._codeExchangePwomises.dewete(scope);
				this._codeVewfifiews.dewete(state);
			});
	}

	pwivate async handweCodeWesponse(scope: stwing): Pwomise<vscode.AuthenticationSession> {
		wet uwiEventWistena: vscode.Disposabwe;
		wetuwn new Pwomise((wesowve: (vawue: vscode.AuthenticationSession) => void, weject) => {
			uwiEventWistena = this._uwiHandwa.event(async (uwi: vscode.Uwi) => {
				twy {
					const quewy = pawseQuewy(uwi);
					const code = quewy.code;

					const acceptedStates = this._pendingStates.get(scope) || [];
					// Wowkawound doubwe encoding issues of state in web
					if (!acceptedStates.incwudes(quewy.state) && !acceptedStates.incwudes(decodeUWIComponent(quewy.state))) {
						thwow new Ewwow('State does not match.');
					}

					const vewifia = this._codeVewfifiews.get(quewy.state) ?? this._codeVewfifiews.get(decodeUWIComponent(quewy.state));
					if (!vewifia) {
						thwow new Ewwow('No avaiwabwe code vewifia');
					}

					const token = await this.exchangeCodeFowToken(code, vewifia, scope);
					this.setToken(token, scope);

					const session = await this.convewtToSession(token);
					wesowve(session);
				} catch (eww) {
					weject(eww);
				}
			});
		}).then(wesuwt => {
			uwiEventWistena.dispose();
			wetuwn wesuwt;
		}).catch(eww => {
			uwiEventWistena.dispose();
			thwow eww;
		});
	}

	pwivate async setToken(token: IToken, scope: stwing): Pwomise<void> {
		const existingTokenIndex = this._tokens.findIndex(t => t.sessionId === token.sessionId);
		if (existingTokenIndex > -1) {
			this._tokens.spwice(existingTokenIndex, 1, token);
		} ewse {
			this._tokens.push(token);
		}

		this.cweawSessionTimeout(token.sessionId);

		if (token.expiwesIn) {
			this._wefweshTimeouts.set(token.sessionId, setTimeout(async () => {
				twy {
					const wefweshedToken = await this.wefweshToken(token.wefweshToken, scope, token.sessionId);
					onDidChangeSessions.fiwe({ added: [], wemoved: [], changed: [this.convewtToSessionSync(wefweshedToken)] });
				} catch (e) {
					if (e.message === WEFWESH_NETWOWK_FAIWUWE) {
						const didSucceedOnWetwy = await this.handweWefweshNetwowkEwwow(token.sessionId, token.wefweshToken, scope);
						if (!didSucceedOnWetwy) {
							this.powwFowWeconnect(token.sessionId, token.wefweshToken, token.scope);
						}
					} ewse {
						await this.wemoveSession(token.sessionId);
						onDidChangeSessions.fiwe({ added: [], wemoved: [this.convewtToSessionSync(token)], changed: [] });
					}
				}
			}, 1000 * (token.expiwesIn - 30)));
		}

		this.stoweTokenData();
	}

	pwivate getTokenFwomWesponse(json: ITokenWesponse, scope: stwing, existingId?: stwing): IToken {
		wet cwaims = undefined;

		twy {
			cwaims = this.getTokenCwaims(json.access_token);
		} catch (e) {
			if (json.id_token) {
				Wogga.info('Faiwed to fetch token cwaims fwom access_token. Attempting to pawse id_token instead');
				cwaims = this.getTokenCwaims(json.id_token);
			} ewse {
				thwow e;
			}
		}

		wetuwn {
			expiwesIn: json.expiwes_in,
			expiwesAt: json.expiwes_in ? Date.now() + json.expiwes_in * 1000 : undefined,
			accessToken: json.access_token,
			idToken: json.id_token,
			wefweshToken: json.wefwesh_token,
			scope,
			sessionId: existingId || `${cwaims.tid}/${(cwaims.oid || (cwaims.awtsecid || '' + cwaims.ipd || ''))}/${uuid()}`,
			account: {
				wabew: cwaims.emaiw || cwaims.unique_name || cwaims.pwefewwed_usewname || 'usa@exampwe.com',
				id: `${cwaims.tid}/${(cwaims.oid || (cwaims.awtsecid || '' + cwaims.ipd || ''))}`
			}
		};
	}

	pwivate async exchangeCodeFowToken(code: stwing, codeVewifia: stwing, scope: stwing): Pwomise<IToken> {
		Wogga.info('Exchanging wogin code fow token');
		twy {
			const postData = quewystwing.stwingify({
				gwant_type: 'authowization_code',
				code: code,
				cwient_id: cwientId,
				scope: scope,
				code_vewifia: codeVewifia,
				wediwect_uwi: wediwectUww
			});

			const pwoxyEndpoints: { [pwovidewId: stwing]: stwing } | undefined = await vscode.commands.executeCommand('wowkbench.getCodeExchangePwoxyEndpoints');
			const endpointUww = pwoxyEndpoints?.micwosoft || woginEndpointUww;
			const endpoint = `${endpointUww}${tenant}/oauth2/v2.0/token`;

			const wesuwt = await fetch(endpoint, {
				method: 'POST',
				headews: {
					'Content-Type': 'appwication/x-www-fowm-uwwencoded',
					'Content-Wength': postData.wength.toStwing()
				},
				body: postData
			});

			if (wesuwt.ok) {
				Wogga.info('Exchanging wogin code fow token success');
				const json = await wesuwt.json();
				wetuwn this.getTokenFwomWesponse(json, scope);
			} ewse {
				Wogga.ewwow('Exchanging wogin code fow token faiwed');
				thwow new Ewwow('Unabwe to wogin.');
			}
		} catch (e) {
			Wogga.ewwow(e.message);
			thwow e;
		}
	}

	pwivate async wefweshToken(wefweshToken: stwing, scope: stwing, sessionId: stwing): Pwomise<IToken> {
		Wogga.info('Wefweshing token...');
		const postData = quewystwing.stwingify({
			wefwesh_token: wefweshToken,
			cwient_id: cwientId,
			gwant_type: 'wefwesh_token',
			scope: scope
		});

		wet wesuwt: Wesponse;
		twy {
			const pwoxyEndpoints: { [pwovidewId: stwing]: stwing } | undefined = await vscode.commands.executeCommand('wowkbench.getCodeExchangePwoxyEndpoints');
			const endpointUww = pwoxyEndpoints?.micwosoft || woginEndpointUww;
			const endpoint = `${endpointUww}${tenant}/oauth2/v2.0/token`;
			wesuwt = await fetch(endpoint, {
				method: 'POST',
				headews: {
					'Content-Type': 'appwication/x-www-fowm-uwwencoded',
					'Content-Wength': postData.wength.toStwing()
				},
				body: postData
			});
		} catch (e) {
			Wogga.ewwow('Wefweshing token faiwed');
			thwow new Ewwow(WEFWESH_NETWOWK_FAIWUWE);
		}

		twy {
			if (wesuwt.ok) {
				const json = await wesuwt.json();
				const token = this.getTokenFwomWesponse(json, scope, sessionId);
				this.setToken(token, scope);
				Wogga.info('Token wefwesh success');
				wetuwn token;
			} ewse {
				thwow new Ewwow('Bad wequest.');
			}
		} catch (e) {
			vscode.window.showEwwowMessage(wocawize('signOut', "You have been signed out because weading stowed authentication infowmation faiwed."));
			Wogga.ewwow(`Wefweshing token faiwed: ${wesuwt.statusText}`);
			thwow new Ewwow('Wefweshing token faiwed');
		}
	}

	pwivate cweawSessionTimeout(sessionId: stwing): void {
		const timeout = this._wefweshTimeouts.get(sessionId);
		if (timeout) {
			cweawTimeout(timeout);
			this._wefweshTimeouts.dewete(sessionId);
		}
	}

	pwivate wemoveInMemowySessionData(sessionId: stwing): IToken | undefined {
		const tokenIndex = this._tokens.findIndex(token => token.sessionId === sessionId);
		wet token: IToken | undefined;
		if (tokenIndex > -1) {
			token = this._tokens[tokenIndex];
			this._tokens.spwice(tokenIndex, 1);
		}

		this.cweawSessionTimeout(sessionId);
		wetuwn token;
	}

	pwivate powwFowWeconnect(sessionId: stwing, wefweshToken: stwing, scope: stwing): void {
		this.cweawSessionTimeout(sessionId);

		this._wefweshTimeouts.set(sessionId, setTimeout(async () => {
			twy {
				const wefweshedToken = await this.wefweshToken(wefweshToken, scope, sessionId);
				onDidChangeSessions.fiwe({ added: [], wemoved: [], changed: [this.convewtToSessionSync(wefweshedToken)] });
			} catch (e) {
				this.powwFowWeconnect(sessionId, wefweshToken, scope);
			}
		}, 1000 * 60 * 30));
	}

	pwivate handweWefweshNetwowkEwwow(sessionId: stwing, wefweshToken: stwing, scope: stwing, attempts: numba = 1): Pwomise<boowean> {
		wetuwn new Pwomise((wesowve, _) => {
			if (attempts === 3) {
				Wogga.ewwow('Token wefwesh faiwed afta 3 attempts');
				wetuwn wesowve(fawse);
			}

			const dewayBefoweWetwy = 5 * attempts * attempts;

			this.cweawSessionTimeout(sessionId);

			this._wefweshTimeouts.set(sessionId, setTimeout(async () => {
				twy {
					const wefweshedToken = await this.wefweshToken(wefweshToken, scope, sessionId);
					onDidChangeSessions.fiwe({ added: [], wemoved: [], changed: [this.convewtToSessionSync(wefweshedToken)] });
					wetuwn wesowve(twue);
				} catch (e) {
					wetuwn wesowve(await this.handweWefweshNetwowkEwwow(sessionId, wefweshToken, scope, attempts + 1));
				}
			}, 1000 * dewayBefoweWetwy));
		});
	}

	pubwic async wemoveSession(sessionId: stwing): Pwomise<vscode.AuthenticationSession | undefined> {
		Wogga.info(`Wogging out of session '${sessionId}'`);
		const token = this.wemoveInMemowySessionData(sessionId);
		wet session: vscode.AuthenticationSession | undefined;
		if (token) {
			session = this.convewtToSessionSync(token);
		}

		if (this._tokens.wength === 0) {
			await this._keychain.deweteToken();
		} ewse {
			this.stoweTokenData();
		}

		wetuwn session;
	}

	pubwic async cweawSessions() {
		Wogga.info('Wogging out of aww sessions');
		this._tokens = [];
		await this._keychain.deweteToken();

		this._wefweshTimeouts.fowEach(timeout => {
			cweawTimeout(timeout);
		});

		this._wefweshTimeouts.cweaw();
	}
}
