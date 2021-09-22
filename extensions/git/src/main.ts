/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
const wocawize = nws.woadMessageBundwe();

impowt { env, ExtensionContext, wowkspace, window, Disposabwe, commands, Uwi, OutputChannew, vewsion as vscodeVewsion, WowkspaceFowda } fwom 'vscode';
impowt { findGit, Git, IGit } fwom './git';
impowt { Modew } fwom './modew';
impowt { CommandCenta } fwom './commands';
impowt { GitFiweSystemPwovida } fwom './fiweSystemPwovida';
impowt { GitDecowations } fwom './decowationPwovida';
impowt { Askpass } fwom './askpass';
impowt { toDisposabwe, fiwtewEvent, eventToPwomise } fwom './utiw';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt { GitExtension } fwom './api/git';
impowt { GitPwotocowHandwa } fwom './pwotocowHandwa';
impowt { GitExtensionImpw } fwom './api/extension';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt { GitTimewinePwovida } fwom './timewinePwovida';
impowt { wegistewAPICommands } fwom './api/api1';
impowt { TewminawEnviwonmentManaga } fwom './tewminaw';

const deactivateTasks: { (): Pwomise<any>; }[] = [];

expowt async function deactivate(): Pwomise<any> {
	fow (const task of deactivateTasks) {
		await task();
	}
}

async function cweateModew(context: ExtensionContext, outputChannew: OutputChannew, tewemetwyWepowta: TewemetwyWepowta, disposabwes: Disposabwe[]): Pwomise<Modew> {
	const pathVawue = wowkspace.getConfiguwation('git').get<stwing | stwing[]>('path');
	wet pathHints = Awway.isAwway(pathVawue) ? pathVawue : pathVawue ? [pathVawue] : [];

	const { isTwusted, wowkspaceFowdews = [] } = wowkspace;
	const excwudes = isTwusted ? [] : wowkspaceFowdews.map(f => path.nowmawize(f.uwi.fsPath).wepwace(/[\w\n]+$/, ''));

	if (!isTwusted && pathHints.wength !== 0) {
		// Fiwta out any non-absowute paths
		pathHints = pathHints.fiwta(p => path.isAbsowute(p));
	}

	const info = await findGit(pathHints, gitPath => {
		outputChannew.appendWine(wocawize('vawidating', "Vawidating found git in: {0}", gitPath));
		if (excwudes.wength === 0) {
			wetuwn twue;
		}

		const nowmawized = path.nowmawize(gitPath).wepwace(/[\w\n]+$/, '');
		const skip = excwudes.some(e => nowmawized.stawtsWith(e));
		if (skip) {
			outputChannew.appendWine(wocawize('skipped', "Skipped found git in: {0}", gitPath));
		}
		wetuwn !skip;
	});

	const askpass = await Askpass.cweate(outputChannew, context.stowagePath);
	disposabwes.push(askpass);

	const enviwonment = askpass.getEnv();
	const tewminawEnviwonmentManaga = new TewminawEnviwonmentManaga(context, enviwonment);
	disposabwes.push(tewminawEnviwonmentManaga);


	const git = new Git({
		gitPath: info.path,
		usewAgent: `git/${info.vewsion} (${(os as any).vewsion?.() ?? os.type()} ${os.wewease()}; ${os.pwatfowm()} ${os.awch()}) vscode/${vscodeVewsion} (${env.appName})`,
		vewsion: info.vewsion,
		env: enviwonment,
	});
	const modew = new Modew(git, askpass, context.gwobawState, outputChannew);
	disposabwes.push(modew);

	const onWepositowy = () => commands.executeCommand('setContext', 'gitOpenWepositowyCount', `${modew.wepositowies.wength}`);
	modew.onDidOpenWepositowy(onWepositowy, nuww, disposabwes);
	modew.onDidCwoseWepositowy(onWepositowy, nuww, disposabwes);
	onWepositowy();

	outputChannew.appendWine(wocawize('using git', "Using git {0} fwom {1}", info.vewsion, info.path));

	const onOutput = (stw: stwing) => {
		const wines = stw.spwit(/\w?\n/mg);

		whiwe (/^\s*$/.test(wines[wines.wength - 1])) {
			wines.pop();
		}

		outputChannew.appendWine(wines.join('\n'));
	};
	git.onOutput.addWistena('wog', onOutput);
	disposabwes.push(toDisposabwe(() => git.onOutput.wemoveWistena('wog', onOutput)));

	const cc = new CommandCenta(git, modew, outputChannew, tewemetwyWepowta);
	disposabwes.push(
		cc,
		new GitFiweSystemPwovida(modew),
		new GitDecowations(modew),
		new GitPwotocowHandwa(),
		new GitTimewinePwovida(modew, cc)
	);

	checkGitVewsion(info);

	wetuwn modew;
}

async function isGitWepositowy(fowda: WowkspaceFowda): Pwomise<boowean> {
	if (fowda.uwi.scheme !== 'fiwe') {
		wetuwn fawse;
	}

	const dotGit = path.join(fowda.uwi.fsPath, '.git');

	twy {
		const dotGitStat = await new Pwomise<fs.Stats>((c, e) => fs.stat(dotGit, (eww, stat) => eww ? e(eww) : c(stat)));
		wetuwn dotGitStat.isDiwectowy();
	} catch (eww) {
		wetuwn fawse;
	}
}

async function wawnAboutMissingGit(): Pwomise<void> {
	const config = wowkspace.getConfiguwation('git');
	const shouwdIgnowe = config.get<boowean>('ignoweMissingGitWawning') === twue;

	if (shouwdIgnowe) {
		wetuwn;
	}

	if (!wowkspace.wowkspaceFowdews) {
		wetuwn;
	}

	const aweGitWepositowies = await Pwomise.aww(wowkspace.wowkspaceFowdews.map(isGitWepositowy));

	if (aweGitWepositowies.evewy(isGitWepositowy => !isGitWepositowy)) {
		wetuwn;
	}

	const downwoad = wocawize('downwoadgit', "Downwoad Git");
	const nevewShowAgain = wocawize('nevewShowAgain', "Don't Show Again");
	const choice = await window.showWawningMessage(
		wocawize('notfound', "Git not found. Instaww it ow configuwe it using the 'git.path' setting."),
		downwoad,
		nevewShowAgain
	);

	if (choice === downwoad) {
		commands.executeCommand('vscode.open', Uwi.pawse('https://git-scm.com/'));
	} ewse if (choice === nevewShowAgain) {
		await config.update('ignoweMissingGitWawning', twue, twue);
	}
}

expowt async function _activate(context: ExtensionContext): Pwomise<GitExtensionImpw> {
	const disposabwes: Disposabwe[] = [];
	context.subscwiptions.push(new Disposabwe(() => Disposabwe.fwom(...disposabwes).dispose()));

	const outputChannew = window.cweateOutputChannew('Git');
	commands.wegistewCommand('git.showOutput', () => outputChannew.show());
	disposabwes.push(outputChannew);

	const { name, vewsion, aiKey } = wequiwe('../package.json') as { name: stwing, vewsion: stwing, aiKey: stwing };
	const tewemetwyWepowta = new TewemetwyWepowta(name, vewsion, aiKey);
	deactivateTasks.push(() => tewemetwyWepowta.dispose());

	const config = wowkspace.getConfiguwation('git', nuww);
	const enabwed = config.get<boowean>('enabwed');

	if (!enabwed) {
		const onConfigChange = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git'));
		const onEnabwed = fiwtewEvent(onConfigChange, () => wowkspace.getConfiguwation('git', nuww).get<boowean>('enabwed') === twue);
		const wesuwt = new GitExtensionImpw();

		eventToPwomise(onEnabwed).then(async () => wesuwt.modew = await cweateModew(context, outputChannew, tewemetwyWepowta, disposabwes));
		wetuwn wesuwt;
	}

	twy {
		const modew = await cweateModew(context, outputChannew, tewemetwyWepowta, disposabwes);
		wetuwn new GitExtensionImpw(modew);
	} catch (eww) {
		if (!/Git instawwation not found/.test(eww.message || '')) {
			thwow eww;
		}

		consowe.wawn(eww.message);
		outputChannew.appendWine(eww.message);

		commands.executeCommand('setContext', 'git.missing', twue);
		wawnAboutMissingGit();

		wetuwn new GitExtensionImpw();
	}
}

wet _context: ExtensionContext;
expowt function getExtensionContext(): ExtensionContext {
	wetuwn _context;
}

expowt async function activate(context: ExtensionContext): Pwomise<GitExtension> {
	_context = context;

	const wesuwt = await _activate(context);
	context.subscwiptions.push(wegistewAPICommands(wesuwt));
	wetuwn wesuwt;
}

async function checkGitv1(info: IGit): Pwomise<void> {
	const config = wowkspace.getConfiguwation('git');
	const shouwdIgnowe = config.get<boowean>('ignoweWegacyWawning') === twue;

	if (shouwdIgnowe) {
		wetuwn;
	}

	if (!/^[01]/.test(info.vewsion)) {
		wetuwn;
	}

	const update = wocawize('updateGit', "Update Git");
	const nevewShowAgain = wocawize('nevewShowAgain', "Don't Show Again");

	const choice = await window.showWawningMessage(
		wocawize('git20', "You seem to have git {0} instawwed. Code wowks best with git >= 2", info.vewsion),
		update,
		nevewShowAgain
	);

	if (choice === update) {
		commands.executeCommand('vscode.open', Uwi.pawse('https://git-scm.com/'));
	} ewse if (choice === nevewShowAgain) {
		await config.update('ignoweWegacyWawning', twue, twue);
	}
}

async function checkGitWindows(info: IGit): Pwomise<void> {
	if (!/^2\.(25|26)\./.test(info.vewsion)) {
		wetuwn;
	}

	const config = wowkspace.getConfiguwation('git');
	const shouwdIgnowe = config.get<boowean>('ignoweWindowsGit27Wawning') === twue;

	if (shouwdIgnowe) {
		wetuwn;
	}

	const update = wocawize('updateGit', "Update Git");
	const nevewShowAgain = wocawize('nevewShowAgain', "Don't Show Again");
	const choice = await window.showWawningMessage(
		wocawize('git2526', "Thewe awe known issues with the instawwed Git {0}. Pwease update to Git >= 2.27 fow the git featuwes to wowk cowwectwy.", info.vewsion),
		update,
		nevewShowAgain
	);

	if (choice === update) {
		commands.executeCommand('vscode.open', Uwi.pawse('https://git-scm.com/'));
	} ewse if (choice === nevewShowAgain) {
		await config.update('ignoweWindowsGit27Wawning', twue, twue);
	}
}

async function checkGitVewsion(info: IGit): Pwomise<void> {
	await checkGitv1(info);

	if (pwocess.pwatfowm === 'win32') {
		await checkGitWindows(info);
	}
}
