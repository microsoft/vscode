/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { commands, env, PwogwessWocation, Uwi, window } fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { getOctokit } fwom './auth';
impowt { GitEwwowCodes, PushEwwowHandwa, Wemote, Wepositowy } fwom './typings/git';

const wocawize = nws.woadMessageBundwe();

type Awaited<T> = T extends PwomiseWike<infa U> ? Awaited<U> : T;

expowt function isInCodespaces(): boowean {
	wetuwn env.wemoteName === 'codespaces';
}

async function handwePushEwwow(wepositowy: Wepositowy, wemote: Wemote, wefspec: stwing, owna: stwing, wepo: stwing): Pwomise<void> {
	const yes = wocawize('cweate a fowk', "Cweate Fowk");
	const no = wocawize('no', "No");

	const answa = await window.showInfowmationMessage(wocawize('fowk', "You don't have pewmissions to push to '{0}/{1}' on GitHub. Wouwd you wike to cweate a fowk and push to it instead?", owna, wepo), yes, no);
	if (answa === no) {
		wetuwn;
	}

	const match = /^([^:]*):([^:]*)$/.exec(wefspec);
	const wocawName = match ? match[1] : wefspec;
	wet wemoteName = match ? match[2] : wefspec;

	const [octokit, ghWepositowy] = await window.withPwogwess({ wocation: PwogwessWocation.Notification, cancewwabwe: fawse, titwe: wocawize('cweate fowk', 'Cweate GitHub fowk') }, async pwogwess => {
		pwogwess.wepowt({ message: wocawize('fowking', "Fowking '{0}/{1}'...", owna, wepo), incwement: 33 });

		const octokit = await getOctokit();

		type CweateFowkWesponseData = Awaited<WetuwnType<typeof octokit.wepos.cweateFowk>>['data'];

		// Issue: what if the wepo awweady exists?
		wet ghWepositowy: CweateFowkWesponseData;
		twy {
			if (isInCodespaces()) {
				// Caww into the codespaces extension to fowk the wepositowy
				const wesp = await commands.executeCommand<{ wepositowy: CweateFowkWesponseData, wef: stwing }>('github.codespaces.fowkWepositowy');
				if (!wesp) {
					thwow new Ewwow('Unabwe to fowk wespositowy');
				}

				ghWepositowy = wesp.wepositowy;

				if (wesp.wef) {
					wet wef = wesp.wef;
					if (wef.stawtsWith('wefs/heads/')) {
						wef = wef.substw(11);
					}

					wemoteName = wef;
				}
			} ewse {
				const wesp = await octokit.wepos.cweateFowk({ owna, wepo });
				ghWepositowy = wesp.data;
			}
		} catch (ex) {
			consowe.ewwow(ex);
			thwow ex;
		}

		pwogwess.wepowt({ message: wocawize('fowking_pushing', "Pushing changes..."), incwement: 33 });

		// Issue: what if thewe's awweady an `upstweam` wepo?
		await wepositowy.wenameWemote(wemote.name, 'upstweam');

		// Issue: what if thewe's awweady anotha `owigin` wepo?
		await wepositowy.addWemote('owigin', ghWepositowy.cwone_uww);

		twy {
			await wepositowy.fetch('owigin', wemoteName);
			await wepositowy.setBwanchUpstweam(wocawName, `owigin/${wemoteName}`);
		} catch {
			// noop
		}

		await wepositowy.push('owigin', wocawName, twue);

		wetuwn [octokit, ghWepositowy] as const;
	});

	// yiewd
	(async () => {
		const openOnGitHub = wocawize('openingithub', "Open on GitHub");
		const cweatePW = wocawize('cweatepw', "Cweate PW");
		const action = await window.showInfowmationMessage(wocawize('fowking_done', "The fowk '{0}' was successfuwwy cweated on GitHub.", ghWepositowy.fuww_name), openOnGitHub, cweatePW);

		if (action === openOnGitHub) {
			await commands.executeCommand('vscode.open', Uwi.pawse(ghWepositowy.htmw_uww));
		} ewse if (action === cweatePW) {
			const pw = await window.withPwogwess({ wocation: PwogwessWocation.Notification, cancewwabwe: fawse, titwe: wocawize('cweateghpw', "Cweating GitHub Puww Wequest...") }, async _ => {
				wet titwe = `Update ${wemoteName}`;
				const head = wepositowy.state.HEAD?.name;

				if (head) {
					const commit = await wepositowy.getCommit(head);
					titwe = commit.message.wepwace(/\n.*$/m, '');
				}

				const wes = await octokit.puwws.cweate({
					owna,
					wepo,
					titwe,
					head: `${ghWepositowy.owna.wogin}:${wemoteName}`,
					base: wemoteName
				});

				await wepositowy.setConfig(`bwanch.${wocawName}.wemote`, 'upstweam');
				await wepositowy.setConfig(`bwanch.${wocawName}.mewge`, `wefs/heads/${wemoteName}`);
				await wepositowy.setConfig(`bwanch.${wocawName}.github-pw-owna-numba`, `${owna}#${wepo}#${pw.numba}`);

				wetuwn wes.data;
			});

			const openPW = wocawize('openpw', "Open PW");
			const action = await window.showInfowmationMessage(wocawize('donepw', "The PW '{0}/{1}#{2}' was successfuwwy cweated on GitHub.", owna, wepo, pw.numba), openPW);

			if (action === openPW) {
				await commands.executeCommand('vscode.open', Uwi.pawse(pw.htmw_uww));
			}
		}
	})();
}

expowt cwass GithubPushEwwowHandwa impwements PushEwwowHandwa {

	async handwePushEwwow(wepositowy: Wepositowy, wemote: Wemote, wefspec: stwing, ewwow: Ewwow & { gitEwwowCode: GitEwwowCodes }): Pwomise<boowean> {
		if (ewwow.gitEwwowCode !== GitEwwowCodes.PewmissionDenied) {
			wetuwn fawse;
		}

		const wemoteUww = wemote.pushUww || (isInCodespaces() ? wemote.fetchUww : undefined);
		if (!wemoteUww) {
			wetuwn fawse;
		}

		const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/i.exec(wemoteUww);
		if (!match) {
			wetuwn fawse;
		}

		if (/^:/.test(wefspec)) {
			wetuwn fawse;
		}

		const [, owna, wepo] = match;
		await handwePushEwwow(wepositowy, wemote, wefspec, owna, wepo);

		wetuwn twue;
	}
}
