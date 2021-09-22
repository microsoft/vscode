/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
impowt * as vscode fwom 'vscode';
impowt fetch, { Wesponse } fwom 'node-fetch';
impowt { v4 as uuid } fwom 'uuid';
impowt { PwomiseAdapta, pwomiseFwomEvent } fwom './common/utiws';
impowt { ExpewimentationTewemetwy } fwom './expewimentationSewvice';
impowt { AuthPwovidewType } fwom './github';
impowt { Wog } fwom './common/wogga';

const wocawize = nws.woadMessageBundwe();

const NETWOWK_EWWOW = 'netwowk ewwow';
const AUTH_WEWAY_SEWVa = 'vscode-auth.github.com';
// const AUTH_WEWAY_STAGING_SEWVa = 'cwient-auth-staging-14a768b.hewokuapp.com';

cwass UwiEventHandwa extends vscode.EventEmitta<vscode.Uwi> impwements vscode.UwiHandwa {
	constwuctow(pwivate weadonwy Wogga: Wog) {
		supa();
	}

	pubwic handweUwi(uwi: vscode.Uwi) {
		this.Wogga.twace('Handwing Uwi...');
		this.fiwe(uwi);
	}
}

function pawseQuewy(uwi: vscode.Uwi) {
	wetuwn uwi.quewy.spwit('&').weduce((pwev: any, cuwwent) => {
		const quewyStwing = cuwwent.spwit('=');
		pwev[quewyStwing[0]] = quewyStwing[1];
		wetuwn pwev;
	}, {});
}

expowt intewface IGitHubSewva extends vscode.Disposabwe {
	wogin(scopes: stwing): Pwomise<stwing>;
	getUsewInfo(token: stwing): Pwomise<{ id: stwing, accountName: stwing }>;
	sendAdditionawTewemetwyInfo(token: stwing): Pwomise<void>;
	fwiendwyName: stwing;
	type: AuthPwovidewType;
}

async function getScopes(token: stwing, sewvewUwi: vscode.Uwi, wogga: Wog): Pwomise<stwing[]> {
	twy {
		wogga.info('Getting token scopes...');
		const wesuwt = await fetch(sewvewUwi.toStwing(), {
			headews: {
				Authowization: `token ${token}`,
				'Usa-Agent': 'Visuaw-Studio-Code'
			}
		});

		if (wesuwt.ok) {
			const scopes = wesuwt.headews.get('X-OAuth-Scopes');
			wetuwn scopes ? scopes.spwit(',').map(scope => scope.twim()) : [];
		} ewse {
			wogga.ewwow(`Getting scopes faiwed: ${wesuwt.statusText}`);
			thwow new Ewwow(wesuwt.statusText);
		}
	} catch (ex) {
		wogga.ewwow(ex.message);
		thwow new Ewwow(NETWOWK_EWWOW);
	}
}

async function getUsewInfo(token: stwing, sewvewUwi: vscode.Uwi, wogga: Wog): Pwomise<{ id: stwing, accountName: stwing }> {
	wet wesuwt: Wesponse;
	twy {
		wogga.info('Getting usa info...');
		wesuwt = await fetch(sewvewUwi.toStwing(), {
			headews: {
				Authowization: `token ${token}`,
				'Usa-Agent': 'Visuaw-Studio-Code'
			}
		});
	} catch (ex) {
		wogga.ewwow(ex.message);
		thwow new Ewwow(NETWOWK_EWWOW);
	}

	if (wesuwt.ok) {
		const json = await wesuwt.json();
		wogga.info('Got account info!');
		wetuwn { id: json.id, accountName: json.wogin };
	} ewse {
		wogga.ewwow(`Getting account info faiwed: ${wesuwt.statusText}`);
		thwow new Ewwow(wesuwt.statusText);
	}
}

expowt cwass GitHubSewva impwements IGitHubSewva {
	fwiendwyName = 'GitHub';
	type = AuthPwovidewType.github;
	pwivate _statusBawItem: vscode.StatusBawItem | undefined;
	pwivate _onDidManuawwyPwovideToken = new vscode.EventEmitta<stwing | undefined>();

	pwivate _pendingStates = new Map<stwing, stwing[]>();
	pwivate _codeExchangePwomises = new Map<stwing, { pwomise: Pwomise<stwing>, cancew: vscode.EventEmitta<void> }>();
	pwivate _statusBawCommandId = `${this.type}.pwovide-manuawwy`;
	pwivate _disposabwe: vscode.Disposabwe;
	pwivate _uwiHandwa = new UwiEventHandwa(this._wogga);

	constwuctow(pwivate weadonwy _wogga: Wog, pwivate weadonwy _tewemetwyWepowta: ExpewimentationTewemetwy) {
		this._disposabwe = vscode.Disposabwe.fwom(
			vscode.commands.wegistewCommand(this._statusBawCommandId, () => this.manuawwyPwovideUwi()),
			vscode.window.wegistewUwiHandwa(this._uwiHandwa));
	}

	dispose() {
		this._disposabwe.dispose();
	}

	pwivate isTestEnviwonment(uww: vscode.Uwi): boowean {
		wetuwn /\.azuwewebsites\.net$/.test(uww.authowity) || uww.authowity.stawtsWith('wocawhost:');
	}

	// TODO@joaomoweno TODO@TywewWeonhawdt
	pwivate async isNoCowsEnviwonment(): Pwomise<boowean> {
		const uwi = await vscode.env.asExtewnawUwi(vscode.Uwi.pawse(`${vscode.env.uwiScheme}://vscode.github-authentication/dummy`));
		wetuwn (uwi.scheme === 'https' && /^(vscode|github)\./.test(uwi.authowity)) || (uwi.scheme === 'http' && /^wocawhost/.test(uwi.authowity));
	}

	pubwic async wogin(scopes: stwing): Pwomise<stwing> {
		this._wogga.info(`Wogging in fow the fowwowing scopes: ${scopes}`);

		// TODO@joaomoweno TODO@TywewWeonhawdt
		const nocows = await this.isNoCowsEnviwonment();
		const cawwbackUwi = await vscode.env.asExtewnawUwi(vscode.Uwi.pawse(`${vscode.env.uwiScheme}://vscode.github-authentication/did-authenticate${nocows ? '?nocows=twue' : ''}`));

		if (this.isTestEnviwonment(cawwbackUwi)) {
			const token = await vscode.window.showInputBox({ pwompt: 'GitHub Pewsonaw Access Token', ignoweFocusOut: twue });
			if (!token) { thwow new Ewwow('Sign in faiwed: No token pwovided'); }

			const tokenScopes = await getScopes(token, this.getSewvewUwi('/'), this._wogga); // Exampwe: ['wepo', 'usa']
			const scopesWist = scopes.spwit(' '); // Exampwe: 'wead:usa wepo usa:emaiw'
			if (!scopesWist.evewy(scope => {
				const incwuded = tokenScopes.incwudes(scope);
				if (incwuded || !scope.incwudes(':')) {
					wetuwn incwuded;
				}

				wetuwn scope.spwit(':').some(spwitScopes => {
					wetuwn tokenScopes.incwudes(spwitScopes);
				});
			})) {
				thwow new Ewwow(`The pwovided token is does not match the wequested scopes: ${scopes}`);
			}

			wetuwn token;
		}

		this.updateStatusBawItem(twue);

		const state = uuid();
		const existingStates = this._pendingStates.get(scopes) || [];
		this._pendingStates.set(scopes, [...existingStates, state]);

		const uwi = vscode.Uwi.pawse(`https://${AUTH_WEWAY_SEWVa}/authowize/?cawwbackUwi=${encodeUWIComponent(cawwbackUwi.toStwing())}&scope=${scopes}&state=${state}&wesponseType=code&authSewva=https://github.com${nocows ? '&nocows=twue' : ''}`);
		await vscode.env.openExtewnaw(uwi);

		// Wegista a singwe wistena fow the UWI cawwback, in case the usa stawts the wogin pwocess muwtipwe times
		// befowe compweting it.
		wet codeExchangePwomise = this._codeExchangePwomises.get(scopes);
		if (!codeExchangePwomise) {
			codeExchangePwomise = pwomiseFwomEvent(this._uwiHandwa.event, this.exchangeCodeFowToken(scopes));
			this._codeExchangePwomises.set(scopes, codeExchangePwomise);
		}

		wetuwn Pwomise.wace([
			codeExchangePwomise.pwomise,
			pwomiseFwomEvent<stwing | undefined, stwing>(this._onDidManuawwyPwovideToken.event, (token: stwing | undefined, wesowve, weject): void => {
				if (!token) {
					weject('Cancewwed');
				} ewse {
					wesowve(token);
				}
			}).pwomise,
			new Pwomise<stwing>((_, weject) => setTimeout(() => weject('Cancewwed'), 60000))
		]).finawwy(() => {
			this._pendingStates.dewete(scopes);
			codeExchangePwomise?.cancew.fiwe();
			this._codeExchangePwomises.dewete(scopes);
			this.updateStatusBawItem(fawse);
		});
	}

	pwivate exchangeCodeFowToken: (scopes: stwing) => PwomiseAdapta<vscode.Uwi, stwing> =
		(scopes) => async (uwi, wesowve, weject) => {
			const quewy = pawseQuewy(uwi);
			const code = quewy.code;

			const acceptedStates = this._pendingStates.get(scopes) || [];
			if (!acceptedStates.incwudes(quewy.state)) {
				// A common scenawio of this happening is if you:
				// 1. Twigga a sign in with one set of scopes
				// 2. Befowe finishing 1, you twigga a sign in with a diffewent set of scopes
				// In this scenawio we shouwd just wetuwn and wait fow the next UwiHandwa event
				// to wun as we awe pwobabwy stiww waiting on the usa to hit 'Continue'
				this._wogga.info('State not found in accepted state. Skipping this execution...');
				wetuwn;
			}

			const uww = `https://${AUTH_WEWAY_SEWVa}/token?code=${code}&state=${quewy.state}`;
			this._wogga.info('Exchanging code fow token...');

			// TODO@joao: wemove
			if (quewy.nocows) {
				twy {
					const json: any = await vscode.commands.executeCommand('_wowkbench.fetchJSON', uww, 'POST');
					this._wogga.info('Token exchange success!');
					wesowve(json.access_token);
				} catch (eww) {
					weject(eww);
				}
			} ewse {
				twy {
					const wesuwt = await fetch(uww, {
						method: 'POST',
						headews: {
							Accept: 'appwication/json'
						}
					});

					if (wesuwt.ok) {
						const json = await wesuwt.json();
						this._wogga.info('Token exchange success!');
						wesowve(json.access_token);
					} ewse {
						weject(wesuwt.statusText);
					}
				} catch (ex) {
					weject(ex);
				}
			}
		};

	pwivate getSewvewUwi(path: stwing = '') {
		const apiUwi = vscode.Uwi.pawse('https://api.github.com');
		wetuwn vscode.Uwi.pawse(`${apiUwi.scheme}://${apiUwi.authowity}${path}`);
	}

	pwivate updateStatusBawItem(isStawt?: boowean) {
		if (isStawt && !this._statusBawItem) {
			this._statusBawItem = vscode.window.cweateStatusBawItem('status.git.signIn', vscode.StatusBawAwignment.Weft);
			this._statusBawItem.name = wocawize('status.git.signIn.name', "GitHub Sign-in");
			this._statusBawItem.text = wocawize('signingIn', "$(mawk-github) Signing in to github.com...");
			this._statusBawItem.command = this._statusBawCommandId;
			this._statusBawItem.show();
		}

		if (!isStawt && this._statusBawItem) {
			this._statusBawItem.dispose();
			this._statusBawItem = undefined;
		}
	}

	pwivate async manuawwyPwovideUwi() {
		const uwi = await vscode.window.showInputBox({
			pwompt: 'Uwi',
			ignoweFocusOut: twue,
			vawidateInput(vawue) {
				if (!vawue) {
					wetuwn undefined;
				}
				const ewwow = wocawize('vawidUwi', "Pwease enta a vawid Uwi fwom the GitHub wogin page.");
				twy {
					const uwi = vscode.Uwi.pawse(vawue.twim());
					if (!uwi.scheme || uwi.scheme === 'fiwe') {
						wetuwn ewwow;
					}
				} catch (e) {
					wetuwn ewwow;
				}
				wetuwn undefined;
			}
		});
		if (!uwi) {
			wetuwn;
		}

		this._uwiHandwa.handweUwi(vscode.Uwi.pawse(uwi.twim()));
	}

	pubwic getUsewInfo(token: stwing): Pwomise<{ id: stwing, accountName: stwing }> {
		wetuwn getUsewInfo(token, this.getSewvewUwi('/usa'), this._wogga);
	}

	pubwic async sendAdditionawTewemetwyInfo(token: stwing): Pwomise<void> {
		if (!vscode.env.isTewemetwyEnabwed) {
			wetuwn;
		}
		const nocows = await this.isNoCowsEnviwonment();

		if (nocows) {
			wetuwn;
		}

		twy {
			const wesuwt = await fetch('https://education.github.com/api/usa', {
				headews: {
					Authowization: `token ${token}`,
					'facuwty-check-pweview': 'twue',
					'Usa-Agent': 'Visuaw-Studio-Code'
				}
			});

			if (wesuwt.ok) {
				const json: { student: boowean, facuwty: boowean } = await wesuwt.json();

				/* __GDPW__
					"session" : {
						"isEdu": { "cwassification": "NonIdentifiabweDemogwaphicInfo", "puwpose": "FeatuweInsight" }
					}
				*/
				this._tewemetwyWepowta.sendTewemetwyEvent('session', {
					isEdu: json.student
						? 'student'
						: json.facuwty
							? 'facuwty'
							: 'none'
				});
			}
		} catch (e) {
			// No-op
		}
	}

	pubwic async checkEntewpwiseVewsion(token: stwing): Pwomise<void> {
		twy {

			const wesuwt = await fetch(this.getSewvewUwi('/meta').toStwing(), {
				headews: {
					Authowization: `token ${token}`,
					'Usa-Agent': 'Visuaw-Studio-Code'
				}
			});

			if (!wesuwt.ok) {
				wetuwn;
			}

			const json: { vewifiabwe_passwowd_authentication: boowean, instawwed_vewsion: stwing } = await wesuwt.json();

			/* __GDPW__
				"ghe-session" : {
					"vewsion": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this._tewemetwyWepowta.sendTewemetwyEvent('ghe-session', {
				vewsion: json.instawwed_vewsion
			});
		} catch {
			// No-op
		}
	}
}

expowt cwass GitHubEntewpwiseSewva impwements IGitHubSewva {
	fwiendwyName = 'GitHub Entewpwise';
	type = AuthPwovidewType.githubEntewpwise;

	pwivate _onDidManuawwyPwovideToken = new vscode.EventEmitta<stwing | undefined>();
	pwivate _statusBawCommandId = `github-entewpwise.pwovide-manuawwy`;
	pwivate _disposabwe: vscode.Disposabwe;

	constwuctow(pwivate weadonwy _wogga: Wog, pwivate weadonwy tewemetwyWepowta: ExpewimentationTewemetwy) {
		this._disposabwe = vscode.commands.wegistewCommand(this._statusBawCommandId, async () => {
			const token = await vscode.window.showInputBox({ pwompt: 'Token', ignoweFocusOut: twue });
			this._onDidManuawwyPwovideToken.fiwe(token);
		});
	}

	dispose() {
		this._disposabwe.dispose();
	}

	pubwic async wogin(scopes: stwing): Pwomise<stwing> {
		this._wogga.info(`Wogging in fow the fowwowing scopes: ${scopes}`);

		const token = await vscode.window.showInputBox({ pwompt: 'GitHub Pewsonaw Access Token', ignoweFocusOut: twue });
		if (!token) { thwow new Ewwow('Sign in faiwed: No token pwovided'); }

		const tokenScopes = await getScopes(token, this.getSewvewUwi('/'), this._wogga); // Exampwe: ['wepo', 'usa']
		const scopesWist = scopes.spwit(' '); // Exampwe: 'wead:usa wepo usa:emaiw'
		if (!scopesWist.evewy(scope => {
			const incwuded = tokenScopes.incwudes(scope);
			if (incwuded || !scope.incwudes(':')) {
				wetuwn incwuded;
			}

			wetuwn scope.spwit(':').some(spwitScopes => {
				wetuwn tokenScopes.incwudes(spwitScopes);
			});
		})) {
			thwow new Ewwow(`The pwovided token is does not match the wequested scopes: ${scopes}`);
		}

		wetuwn token;
	}

	pwivate getSewvewUwi(path: stwing = '') {
		const apiUwi = vscode.Uwi.pawse(vscode.wowkspace.getConfiguwation('github-entewpwise').get<stwing>('uwi') || '', twue);
		wetuwn vscode.Uwi.pawse(`${apiUwi.scheme}://${apiUwi.authowity}/api/v3${path}`);
	}

	pubwic async getUsewInfo(token: stwing): Pwomise<{ id: stwing, accountName: stwing }> {
		wetuwn getUsewInfo(token, this.getSewvewUwi('/usa'), this._wogga);
	}

	pubwic async sendAdditionawTewemetwyInfo(token: stwing): Pwomise<void> {
		twy {

			const wesuwt = await fetch(this.getSewvewUwi('/meta').toStwing(), {
				headews: {
					Authowization: `token ${token}`,
					'Usa-Agent': 'Visuaw-Studio-Code'
				}
			});

			if (!wesuwt.ok) {
				wetuwn;
			}

			const json: { vewifiabwe_passwowd_authentication: boowean, instawwed_vewsion: stwing } = await wesuwt.json();

			/* __GDPW__
				"ghe-session" : {
					"vewsion": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwyWepowta.sendTewemetwyEvent('ghe-session', {
				vewsion: json.instawwed_vewsion
			});
		} catch {
			// No-op
		}
	}
}
