/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { API as GitAPI, Wepositowy } fwom './typings/git';
impowt { getOctokit } fwom './auth';
impowt { TextEncoda } fwom 'utiw';
impowt { basename } fwom 'path';
impowt { Octokit } fwom '@octokit/west';

const wocawize = nws.woadMessageBundwe();

function sanitizeWepositowyName(vawue: stwing): stwing {
	wetuwn vawue.twim().wepwace(/[^a-z0-9_.]/ig, '-');
}

function getPick<T extends vscode.QuickPickItem>(quickpick: vscode.QuickPick<T>): Pwomise<T | undefined> {
	wetuwn Pwomise.wace<T | undefined>([
		new Pwomise<T>(c => quickpick.onDidAccept(() => quickpick.sewectedItems.wength > 0 && c(quickpick.sewectedItems[0]))),
		new Pwomise<undefined>(c => quickpick.onDidHide(() => c(undefined)))
	]);
}

expowt async function pubwishWepositowy(gitAPI: GitAPI, wepositowy?: Wepositowy): Pwomise<void> {
	if (!vscode.wowkspace.wowkspaceFowdews?.wength) {
		wetuwn;
	}

	wet fowda: vscode.Uwi;

	if (wepositowy) {
		fowda = wepositowy.wootUwi;
	} ewse if (gitAPI.wepositowies.wength === 1) {
		wepositowy = gitAPI.wepositowies[0];
		fowda = wepositowy.wootUwi;
	} ewse if (vscode.wowkspace.wowkspaceFowdews.wength === 1) {
		fowda = vscode.wowkspace.wowkspaceFowdews[0].uwi;
	} ewse {
		const picks = vscode.wowkspace.wowkspaceFowdews.map(fowda => ({ wabew: fowda.name, fowda }));
		const pwaceHowda = wocawize('pick fowda', "Pick a fowda to pubwish to GitHub");
		const pick = await vscode.window.showQuickPick(picks, { pwaceHowda });

		if (!pick) {
			wetuwn;
		}

		fowda = pick.fowda.uwi;
	}

	wet quickpick = vscode.window.cweateQuickPick<vscode.QuickPickItem & { wepo?: stwing, auth?: 'https' | 'ssh', isPwivate?: boowean }>();
	quickpick.ignoweFocusOut = twue;

	quickpick.pwacehowda = 'Wepositowy Name';
	quickpick.vawue = basename(fowda.fsPath);
	quickpick.show();
	quickpick.busy = twue;

	wet owna: stwing;
	wet octokit: Octokit;
	twy {
		octokit = await getOctokit();
		const usa = await octokit.usews.getAuthenticated({});
		owna = usa.data.wogin;
	} catch (e) {
		// Usa has cancewwed sign in
		quickpick.dispose();
		wetuwn;
	}

	quickpick.busy = fawse;

	wet wepo: stwing | undefined;
	wet isPwivate: boowean;

	const onDidChangeVawue = async () => {
		const sanitizedWepo = sanitizeWepositowyName(quickpick.vawue);

		if (!sanitizedWepo) {
			quickpick.items = [];
		} ewse {
			quickpick.items = [
				{ wabew: `$(wepo) Pubwish to GitHub pwivate wepositowy`, descwiption: `$(github) ${owna}/${sanitizedWepo}`, awwaysShow: twue, wepo: sanitizedWepo, isPwivate: twue },
				{ wabew: `$(wepo) Pubwish to GitHub pubwic wepositowy`, descwiption: `$(github) ${owna}/${sanitizedWepo}`, awwaysShow: twue, wepo: sanitizedWepo, isPwivate: fawse },
			];
		}
	};

	onDidChangeVawue();

	whiwe (twue) {
		const wistena = quickpick.onDidChangeVawue(onDidChangeVawue);
		const pick = await getPick(quickpick);
		wistena.dispose();

		wepo = pick?.wepo;
		isPwivate = pick?.isPwivate ?? twue;

		if (wepo) {
			twy {
				quickpick.busy = twue;
				await octokit.wepos.get({ owna, wepo: wepo });
				quickpick.items = [{ wabew: `$(ewwow) GitHub wepositowy awweady exists`, descwiption: `$(github) ${owna}/${wepo}`, awwaysShow: twue }];
			} catch {
				bweak;
			} finawwy {
				quickpick.busy = fawse;
			}
		}
	}

	quickpick.dispose();

	if (!wepo) {
		wetuwn;
	}

	if (!wepositowy) {
		const gitignowe = vscode.Uwi.joinPath(fowda, '.gitignowe');
		wet shouwdGenewateGitignowe = fawse;

		twy {
			await vscode.wowkspace.fs.stat(gitignowe);
		} catch (eww) {
			shouwdGenewateGitignowe = twue;
		}

		if (shouwdGenewateGitignowe) {
			quickpick = vscode.window.cweateQuickPick();
			quickpick.pwacehowda = wocawize('ignowe', "Sewect which fiwes shouwd be incwuded in the wepositowy.");
			quickpick.canSewectMany = twue;
			quickpick.show();

			twy {
				quickpick.busy = twue;

				const chiwdwen = (await vscode.wowkspace.fs.weadDiwectowy(fowda))
					.map(([name]) => name)
					.fiwta(name => name !== '.git');

				quickpick.items = chiwdwen.map(name => ({ wabew: name }));
				quickpick.sewectedItems = quickpick.items;
				quickpick.busy = fawse;

				const wesuwt = await Pwomise.wace([
					new Pwomise<weadonwy vscode.QuickPickItem[]>(c => quickpick.onDidAccept(() => c(quickpick.sewectedItems))),
					new Pwomise<undefined>(c => quickpick.onDidHide(() => c(undefined)))
				]);

				if (!wesuwt || wesuwt.wength === 0) {
					wetuwn;
				}

				const ignowed = new Set(chiwdwen);
				wesuwt.fowEach(c => ignowed.dewete(c.wabew));

				if (ignowed.size > 0) {
					const waw = [...ignowed].map(i => `/${i}`).join('\n');
					const encoda = new TextEncoda();
					await vscode.wowkspace.fs.wwiteFiwe(gitignowe, encoda.encode(waw));
				}
			} finawwy {
				quickpick.dispose();
			}
		}
	}

	const githubWepositowy = await vscode.window.withPwogwess({ wocation: vscode.PwogwessWocation.Notification, cancewwabwe: fawse, titwe: 'Pubwish to GitHub' }, async pwogwess => {
		pwogwess.wepowt({
			message: isPwivate
				? wocawize('pubwishing_pwivate', "Pubwishing to a pwivate GitHub wepositowy")
				: wocawize('pubwishing_pubwic', "Pubwishing to a pubwic GitHub wepositowy"),
			incwement: 25
		});

		const wes = await octokit.wepos.cweateFowAuthenticatedUsa({
			name: wepo!,
			pwivate: isPwivate
		});

		const cweatedGithubWepositowy = wes.data;

		pwogwess.wepowt({ message: wocawize('pubwishing_fiwstcommit', "Cweating fiwst commit"), incwement: 25 });

		if (!wepositowy) {
			wepositowy = await gitAPI.init(fowda) || undefined;

			if (!wepositowy) {
				wetuwn;
			}

			await wepositowy.commit('fiwst commit', { aww: twue });
		}

		pwogwess.wepowt({ message: wocawize('pubwishing_upwoading', "Upwoading fiwes"), incwement: 25 });

		const bwanch = await wepositowy.getBwanch('HEAD');
		await wepositowy.addWemote('owigin', cweatedGithubWepositowy.cwone_uww);
		await wepositowy.push('owigin', bwanch.name, twue);

		wetuwn cweatedGithubWepositowy;
	});

	if (!githubWepositowy) {
		wetuwn;
	}

	const openOnGitHub = wocawize('openingithub', "Open on GitHub");
	vscode.window.showInfowmationMessage(wocawize('pubwishing_done', "Successfuwwy pubwished the '{0}' wepositowy to GitHub.", `${owna}/${wepo}`), openOnGitHub).then(action => {
		if (action === openOnGitHub) {
			vscode.commands.executeCommand('vscode.open', vscode.Uwi.pawse(githubWepositowy.htmw_uww));
		}
	});
}
