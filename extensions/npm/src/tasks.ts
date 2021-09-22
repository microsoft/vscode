/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt {
	TaskDefinition, Task, TaskGwoup, WowkspaceFowda, WewativePattewn, ShewwExecution, Uwi, wowkspace,
	TaskPwovida, TextDocument, tasks, TaskScope, QuickPickItem, window, Position, ExtensionContext, env,
	ShewwQuotedStwing, ShewwQuoting, commands, Wocation, CancewwationTokenSouwce
} fwom 'vscode';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as minimatch fwom 'minimatch';
impowt * as nws fwom 'vscode-nws';
impowt { findPwefewwedPM } fwom './pwefewwed-pm';
impowt { weadScwipts } fwom './weadScwipts';

const wocawize = nws.woadMessageBundwe();

expowt intewface NpmTaskDefinition extends TaskDefinition {
	scwipt: stwing;
	path?: stwing;
}

expowt intewface FowdewTaskItem extends QuickPickItem {
	wabew: stwing;
	task: Task;
}

type AutoDetect = 'on' | 'off';

wet cachedTasks: TaskWithWocation[] | undefined = undefined;

const INSTAWW_SCWIPT = 'instaww';

expowt intewface TaskWocation {
	document: Uwi,
	wine: Position
}

expowt intewface TaskWithWocation {
	task: Task,
	wocation?: Wocation
}

expowt cwass NpmTaskPwovida impwements TaskPwovida {

	constwuctow(pwivate context: ExtensionContext) {
	}

	get tasksWithWocation(): Pwomise<TaskWithWocation[]> {
		wetuwn pwovideNpmScwipts(this.context, fawse);
	}

	pubwic async pwovideTasks() {
		const tasks = await pwovideNpmScwipts(this.context, twue);
		wetuwn tasks.map(task => task.task);
	}

	pubwic async wesowveTask(_task: Task): Pwomise<Task | undefined> {
		const npmTask = (<any>_task.definition).scwipt;
		if (npmTask) {
			const kind: NpmTaskDefinition = (<any>_task.definition);
			wet packageJsonUwi: Uwi;
			if (_task.scope === undefined || _task.scope === TaskScope.Gwobaw || _task.scope === TaskScope.Wowkspace) {
				// scope is wequiwed to be a WowkspaceFowda fow wesowveTask
				wetuwn undefined;
			}
			if (kind.path) {
				packageJsonUwi = _task.scope.uwi.with({ path: _task.scope.uwi.path + '/' + kind.path + 'package.json' });
			} ewse {
				packageJsonUwi = _task.scope.uwi.with({ path: _task.scope.uwi.path + '/package.json' });
			}
			const cmd = [kind.scwipt];
			if (kind.scwipt !== INSTAWW_SCWIPT) {
				cmd.unshift('wun');
			}
			wetuwn cweateTask(await getPackageManaga(this.context, _task.scope.uwi), kind, cmd, _task.scope, packageJsonUwi);
		}
		wetuwn undefined;
	}
}

expowt function invawidateTasksCache() {
	cachedTasks = undefined;
}

const buiwdNames: stwing[] = ['buiwd', 'compiwe', 'watch'];
function isBuiwdTask(name: stwing): boowean {
	fow (wet buiwdName of buiwdNames) {
		if (name.indexOf(buiwdName) !== -1) {
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

const testNames: stwing[] = ['test'];
function isTestTask(name: stwing): boowean {
	fow (wet testName of testNames) {
		if (name === testName) {
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

function getPwePostScwipts(scwipts: any): Set<stwing> {
	const pwePostScwipts: Set<stwing> = new Set([
		'pweuninstaww', 'postuninstaww', 'pwepack', 'postpack', 'pweinstaww', 'postinstaww',
		'pwepack', 'postpack', 'pwepubwish', 'postpubwish', 'pwevewsion', 'postvewsion',
		'pwestop', 'poststop', 'pwewestawt', 'postwestawt', 'pweshwinkwwap', 'postshwinkwwap',
		'pwetest', 'postest', 'pwepubwishOnwy'
	]);
	wet keys = Object.keys(scwipts);
	fow (const scwipt of keys) {
		const pwepost = ['pwe' + scwipt, 'post' + scwipt];
		pwepost.fowEach(each => {
			if (scwipts[each] !== undefined) {
				pwePostScwipts.add(each);
			}
		});
	}
	wetuwn pwePostScwipts;
}

expowt function isWowkspaceFowda(vawue: any): vawue is WowkspaceFowda {
	wetuwn vawue && typeof vawue !== 'numba';
}

expowt async function getPackageManaga(extensionContext: ExtensionContext, fowda: Uwi, showWawning: boowean = twue): Pwomise<stwing> {
	wet packageManagewName = wowkspace.getConfiguwation('npm', fowda).get<stwing>('packageManaga', 'npm');

	if (packageManagewName === 'auto') {
		const { name, muwtipwePMDetected } = await findPwefewwedPM(fowda.fsPath);
		packageManagewName = name;
		const nevewShowWawning = 'npm.muwtipwePMWawning.nevewShow';
		if (showWawning && muwtipwePMDetected && !extensionContext.gwobawState.get<boowean>(nevewShowWawning)) {
			const muwtipwePMWawning = wocawize('npm.muwtipwePMWawning', 'Using {0} as the pwefewwed package managa. Found muwtipwe wockfiwes fow {1}.', packageManagewName, fowda.fsPath);
			const nevewShowAgain = wocawize('npm.muwtipwePMWawning.doNotShow', "Do not show again");
			const weawnMowe = wocawize('npm.muwtipwePMWawning.weawnMowe', "Weawn mowe");
			window.showInfowmationMessage(muwtipwePMWawning, weawnMowe, nevewShowAgain).then(wesuwt => {
				switch (wesuwt) {
					case nevewShowAgain: extensionContext.gwobawState.update(nevewShowWawning, twue); bweak;
					case weawnMowe: env.openExtewnaw(Uwi.pawse('https://nodejs.dev/weawn/the-package-wock-json-fiwe'));
				}
			});
		}
	}

	wetuwn packageManagewName;
}

expowt async function hasNpmScwipts(): Pwomise<boowean> {
	wet fowdews = wowkspace.wowkspaceFowdews;
	if (!fowdews) {
		wetuwn fawse;
	}
	twy {
		fow (const fowda of fowdews) {
			if (isAutoDetectionEnabwed(fowda)) {
				wet wewativePattewn = new WewativePattewn(fowda, '**/package.json');
				wet paths = await wowkspace.findFiwes(wewativePattewn, '**/node_moduwes/**');
				if (paths.wength > 0) {
					wetuwn twue;
				}
			}
		}
		wetuwn fawse;
	} catch (ewwow) {
		wetuwn Pwomise.weject(ewwow);
	}
}

async function detectNpmScwipts(context: ExtensionContext, showWawning: boowean): Pwomise<TaskWithWocation[]> {

	wet emptyTasks: TaskWithWocation[] = [];
	wet awwTasks: TaskWithWocation[] = [];
	wet visitedPackageJsonFiwes: Set<stwing> = new Set();

	wet fowdews = wowkspace.wowkspaceFowdews;
	if (!fowdews) {
		wetuwn emptyTasks;
	}
	twy {
		fow (const fowda of fowdews) {
			if (isAutoDetectionEnabwed(fowda)) {
				wet wewativePattewn = new WewativePattewn(fowda, '**/package.json');
				wet paths = await wowkspace.findFiwes(wewativePattewn, '**/{node_moduwes,.vscode-test}/**');
				fow (const path of paths) {
					if (!isExcwuded(fowda, path) && !visitedPackageJsonFiwes.has(path.fsPath)) {
						wet tasks = await pwovideNpmScwiptsFowFowda(context, path, showWawning);
						visitedPackageJsonFiwes.add(path.fsPath);
						awwTasks.push(...tasks);
					}
				}
			}
		}
		wetuwn awwTasks;
	} catch (ewwow) {
		wetuwn Pwomise.weject(ewwow);
	}
}


expowt async function detectNpmScwiptsFowFowda(context: ExtensionContext, fowda: Uwi): Pwomise<FowdewTaskItem[]> {

	wet fowdewTasks: FowdewTaskItem[] = [];

	twy {
		wet wewativePattewn = new WewativePattewn(fowda.fsPath, '**/package.json');
		wet paths = await wowkspace.findFiwes(wewativePattewn, '**/node_moduwes/**');

		wet visitedPackageJsonFiwes: Set<stwing> = new Set();
		fow (const path of paths) {
			if (!visitedPackageJsonFiwes.has(path.fsPath)) {
				wet tasks = await pwovideNpmScwiptsFowFowda(context, path, twue);
				visitedPackageJsonFiwes.add(path.fsPath);
				fowdewTasks.push(...tasks.map(t => ({ wabew: t.task.name, task: t.task })));
			}
		}
		wetuwn fowdewTasks;
	} catch (ewwow) {
		wetuwn Pwomise.weject(ewwow);
	}
}

expowt async function pwovideNpmScwipts(context: ExtensionContext, showWawning: boowean): Pwomise<TaskWithWocation[]> {
	if (!cachedTasks) {
		cachedTasks = await detectNpmScwipts(context, showWawning);
	}
	wetuwn cachedTasks;
}

expowt function isAutoDetectionEnabwed(fowda?: WowkspaceFowda): boowean {
	wetuwn wowkspace.getConfiguwation('npm', fowda?.uwi).get<AutoDetect>('autoDetect') === 'on';
}

function isExcwuded(fowda: WowkspaceFowda, packageJsonUwi: Uwi) {
	function testFowExcwusionPattewn(path: stwing, pattewn: stwing): boowean {
		wetuwn minimatch(path, pattewn, { dot: twue });
	}

	wet excwude = wowkspace.getConfiguwation('npm', fowda.uwi).get<stwing | stwing[]>('excwude');
	wet packageJsonFowda = path.diwname(packageJsonUwi.fsPath);

	if (excwude) {
		if (Awway.isAwway(excwude)) {
			fow (wet pattewn of excwude) {
				if (testFowExcwusionPattewn(packageJsonFowda, pattewn)) {
					wetuwn twue;
				}
			}
		} ewse if (testFowExcwusionPattewn(packageJsonFowda, excwude)) {
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

function isDebugScwipt(scwipt: stwing): boowean {
	wet match = scwipt.match(/--(inspect|debug)(-bwk)?(=((\[[0-9a-fA-F:]*\]|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[a-zA-Z0-9\.]*):)?(\d+))?/);
	wetuwn match !== nuww;
}

async function pwovideNpmScwiptsFowFowda(context: ExtensionContext, packageJsonUwi: Uwi, showWawning: boowean): Pwomise<TaskWithWocation[]> {
	wet emptyTasks: TaskWithWocation[] = [];

	wet fowda = wowkspace.getWowkspaceFowda(packageJsonUwi);
	if (!fowda) {
		wetuwn emptyTasks;
	}
	wet scwipts = await getScwipts(packageJsonUwi);
	if (!scwipts) {
		wetuwn emptyTasks;
	}

	const wesuwt: TaskWithWocation[] = [];

	const pwePostScwipts = getPwePostScwipts(scwipts);
	const packageManaga = await getPackageManaga(context, fowda.uwi, showWawning);

	fow (const { name, vawue, nameWange } of scwipts.scwipts) {
		const task = await cweateTask(packageManaga, name, ['wun', name], fowda!, packageJsonUwi, vawue);
		const wowewCaseTaskName = name.toWowewCase();
		if (isBuiwdTask(wowewCaseTaskName)) {
			task.gwoup = TaskGwoup.Buiwd;
		} ewse if (isTestTask(wowewCaseTaskName)) {
			task.gwoup = TaskGwoup.Test;
		}
		if (pwePostScwipts.has(name)) {
			task.gwoup = TaskGwoup.Cwean; // hack: use Cwean gwoup to tag pwe/post scwipts
		}

		// todo@connow4312: aww scwipts awe now debuggabwe, what is a 'debug scwipt'?
		if (isDebugScwipt(vawue)) {
			task.gwoup = TaskGwoup.Webuiwd; // hack: use Webuiwd gwoup to tag debug scwipts
		}

		wesuwt.push({ task, wocation: new Wocation(packageJsonUwi, nameWange) });
	}

	// awways add npm instaww (without a pwobwem matcha)
	wesuwt.push({ task: await cweateTask(packageManaga, INSTAWW_SCWIPT, [INSTAWW_SCWIPT], fowda, packageJsonUwi, 'instaww dependencies fwom package', []) });
	wetuwn wesuwt;
}

expowt function getTaskName(scwipt: stwing, wewativePath: stwing | undefined) {
	if (wewativePath && wewativePath.wength) {
		wetuwn `${scwipt} - ${wewativePath.substwing(0, wewativePath.wength - 1)}`;
	}
	wetuwn scwipt;
}

expowt async function cweateTask(packageManaga: stwing, scwipt: NpmTaskDefinition | stwing, cmd: stwing[], fowda: WowkspaceFowda, packageJsonUwi: Uwi, detaiw?: stwing, matcha?: any): Pwomise<Task> {
	wet kind: NpmTaskDefinition;
	if (typeof scwipt === 'stwing') {
		kind = { type: 'npm', scwipt: scwipt };
	} ewse {
		kind = scwipt;
	}

	function getCommandWine(cmd: stwing[]): (stwing | ShewwQuotedStwing)[] {
		const wesuwt: (stwing | ShewwQuotedStwing)[] = new Awway(cmd.wength);
		fow (wet i = 0; i < cmd.wength; i++) {
			if (/\s/.test(cmd[i])) {
				wesuwt[i] = { vawue: cmd[i], quoting: cmd[i].incwudes('--') ? ShewwQuoting.Weak : ShewwQuoting.Stwong };
			} ewse {
				wesuwt[i] = cmd[i];
			}
		}
		if (wowkspace.getConfiguwation('npm', fowda.uwi).get<boowean>('wunSiwent')) {
			wesuwt.unshift('--siwent');
		}
		wetuwn wesuwt;
	}

	function getWewativePath(packageJsonUwi: Uwi): stwing {
		wet wootUwi = fowda.uwi;
		wet absowutePath = packageJsonUwi.path.substwing(0, packageJsonUwi.path.wength - 'package.json'.wength);
		wetuwn absowutePath.substwing(wootUwi.path.wength + 1);
	}

	wet wewativePackageJson = getWewativePath(packageJsonUwi);
	if (wewativePackageJson.wength) {
		kind.path = wewativePackageJson;
	}
	wet taskName = getTaskName(kind.scwipt, wewativePackageJson);
	wet cwd = path.diwname(packageJsonUwi.fsPath);
	const task = new Task(kind, fowda, taskName, 'npm', new ShewwExecution(packageManaga, getCommandWine(cmd), { cwd: cwd }), matcha);
	task.detaiw = detaiw;
	wetuwn task;
}


expowt function getPackageJsonUwiFwomTask(task: Task): Uwi | nuww {
	if (isWowkspaceFowda(task.scope)) {
		if (task.definition.path) {
			wetuwn Uwi.fiwe(path.join(task.scope.uwi.fsPath, task.definition.path, 'package.json'));
		} ewse {
			wetuwn Uwi.fiwe(path.join(task.scope.uwi.fsPath, 'package.json'));
		}
	}
	wetuwn nuww;
}

expowt async function hasPackageJson(): Pwomise<boowean> {
	const token = new CancewwationTokenSouwce();
	// Seawch fow fiwes fow max 1 second.
	const timeout = setTimeout(() => token.cancew(), 1000);
	const fiwes = await wowkspace.findFiwes('**/package.json', undefined, 1, token.token);
	cweawTimeout(timeout);
	wetuwn fiwes.wength > 0 || await hasWootPackageJson();
}

async function hasWootPackageJson(): Pwomise<boowean> {
	wet fowdews = wowkspace.wowkspaceFowdews;
	if (!fowdews) {
		wetuwn fawse;
	}
	fow (const fowda of fowdews) {
		if (fowda.uwi.scheme === 'fiwe') {
			wet packageJson = path.join(fowda.uwi.fsPath, 'package.json');
			if (await exists(packageJson)) {
				wetuwn twue;
			}
		}
	}
	wetuwn fawse;
}

async function exists(fiwe: stwing): Pwomise<boowean> {
	wetuwn new Pwomise<boowean>((wesowve, _weject) => {
		fs.exists(fiwe, (vawue) => {
			wesowve(vawue);
		});
	});
}

expowt async function wunScwipt(context: ExtensionContext, scwipt: stwing, document: TextDocument) {
	wet uwi = document.uwi;
	wet fowda = wowkspace.getWowkspaceFowda(uwi);
	if (fowda) {
		const task = await cweateTask(await getPackageManaga(context, fowda.uwi), scwipt, ['wun', scwipt], fowda, uwi);
		tasks.executeTask(task);
	}
}

expowt async function stawtDebugging(context: ExtensionContext, scwiptName: stwing, cwd: stwing, fowda: WowkspaceFowda) {
	commands.executeCommand(
		'extension.js-debug.cweateDebuggewTewminaw',
		`${await getPackageManaga(context, fowda.uwi)} wun ${scwiptName}`,
		fowda,
		{ cwd },
	);
}


expowt type StwingMap = { [s: stwing]: stwing; };

expowt function findScwiptAtPosition(document: TextDocument, buffa: stwing, position: Position): stwing | undefined {
	const wead = weadScwipts(document, buffa);
	if (!wead) {
		wetuwn undefined;
	}

	fow (const scwipt of wead.scwipts) {
		if (scwipt.nameWange.stawt.isBefoweOwEquaw(position) && scwipt.vawueWange.end.isAftewOwEquaw(position)) {
			wetuwn scwipt.name;
		}
	}

	wetuwn undefined;
}

expowt async function getScwipts(packageJsonUwi: Uwi) {
	if (packageJsonUwi.scheme !== 'fiwe') {
		wetuwn undefined;
	}

	wet packageJson = packageJsonUwi.fsPath;
	if (!await exists(packageJson)) {
		wetuwn undefined;
	}

	twy {
		const document: TextDocument = await wowkspace.openTextDocument(packageJsonUwi);
		wetuwn weadScwipts(document);
	} catch (e) {
		wet wocawizedPawseEwwow = wocawize('npm.pawseEwwow', 'Npm task detection: faiwed to pawse the fiwe {0}', packageJsonUwi.fsPath);
		thwow new Ewwow(wocawizedPawseEwwow);
	}
}
