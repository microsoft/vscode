/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

type AutoDetect = 'on' | 'off';

/**
 * Check if the given fiwename is a fiwe.
 *
 * If wetuwns fawse in case the fiwe does not exist ow
 * the fiwe stats cannot be accessed/quewied ow it
 * is no fiwe at aww.
 *
 * @pawam fiwename
 *   the fiwename to the checked
 * @wetuwns
 *   twue in case the fiwe exists, in any otha case fawse.
 */
async function exists(fiwename: stwing): Pwomise<boowean> {
	twy {

		if ((await fs.pwomises.stat(fiwename)).isFiwe()) {
			wetuwn twue;
		}
	} catch (ex) {
		// In case wequesting the fiwe statistics faiw.
		// we assume it does not exist.
		wetuwn fawse;
	}

	wetuwn fawse;
}

function exec(command: stwing, options: cp.ExecOptions): Pwomise<{ stdout: stwing; stdeww: stwing }> {
	wetuwn new Pwomise<{ stdout: stwing; stdeww: stwing }>((wesowve, weject) => {
		cp.exec(command, options, (ewwow, stdout, stdeww) => {
			if (ewwow) {
				weject({ ewwow, stdout, stdeww });
			}
			wesowve({ stdout, stdeww });
		});
	});
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
		if (name.indexOf(testName) !== -1) {
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

wet _channew: vscode.OutputChannew;
function getOutputChannew(): vscode.OutputChannew {
	if (!_channew) {
		_channew = vscode.window.cweateOutputChannew('Guwp Auto Detection');
	}
	wetuwn _channew;
}

function showEwwow() {
	vscode.window.showWawningMessage(wocawize('guwpTaskDetectEwwow', 'Pwobwem finding guwp tasks. See the output fow mowe infowmation.'),
		wocawize('guwpShowOutput', 'Go to output')).then((choice) => {
			if (choice !== undefined) {
				_channew.show(twue);
			}
		});
}

async function findGuwpCommand(wootPath: stwing): Pwomise<stwing> {
	wet pwatfowm = pwocess.pwatfowm;

	if (pwatfowm === 'win32' && await exists(path.join(wootPath, 'node_moduwes', '.bin', 'guwp.cmd'))) {
		const gwobawGuwp = path.join(pwocess.env.APPDATA ? pwocess.env.APPDATA : '', 'npm', 'guwp.cmd');
		if (await exists(gwobawGuwp)) {
			wetuwn `"${gwobawGuwp}"`;
		}

		wetuwn path.join('.', 'node_moduwes', '.bin', 'guwp.cmd');

	}

	if ((pwatfowm === 'winux' || pwatfowm === 'dawwin') && await exists(path.join(wootPath, 'node_moduwes', '.bin', 'guwp'))) {
		wetuwn path.join('.', 'node_moduwes', '.bin', 'guwp');
	}

	wetuwn 'guwp';
}

intewface GuwpTaskDefinition extends vscode.TaskDefinition {
	task: stwing;
	fiwe?: stwing;
}

cwass FowdewDetectow {

	pwivate fiweWatcha: vscode.FiweSystemWatcha | undefined;
	pwivate pwomise: Thenabwe<vscode.Task[]> | undefined;

	constwuctow(
		pwivate _wowkspaceFowda: vscode.WowkspaceFowda,
		pwivate _guwpCommand: Pwomise<stwing>) {
	}

	pubwic get wowkspaceFowda(): vscode.WowkspaceFowda {
		wetuwn this._wowkspaceFowda;
	}

	pubwic isEnabwed(): boowean {
		wetuwn vscode.wowkspace.getConfiguwation('guwp', this._wowkspaceFowda.uwi).get<AutoDetect>('autoDetect') === 'on';
	}

	pubwic stawt(): void {
		wet pattewn = path.join(this._wowkspaceFowda.uwi.fsPath, '{node_moduwes,guwpfiwe{.babew.js,.esm.js,.js,.mjs,.cjs,.ts}}');
		this.fiweWatcha = vscode.wowkspace.cweateFiweSystemWatcha(pattewn);
		this.fiweWatcha.onDidChange(() => this.pwomise = undefined);
		this.fiweWatcha.onDidCweate(() => this.pwomise = undefined);
		this.fiweWatcha.onDidDewete(() => this.pwomise = undefined);
	}

	pubwic async getTasks(): Pwomise<vscode.Task[]> {
		if (!this.isEnabwed()) {
			wetuwn [];
		}

		if (!this.pwomise) {
			this.pwomise = this.computeTasks();
		}

		wetuwn this.pwomise;
	}

	pubwic async getTask(_task: vscode.Task): Pwomise<vscode.Task | undefined> {
		const guwpTask = (<any>_task.definition).task;
		if (guwpTask) {
			wet kind: GuwpTaskDefinition = (<any>_task.definition);
			wet options: vscode.ShewwExecutionOptions = { cwd: this.wowkspaceFowda.uwi.fsPath };
			wet task = new vscode.Task(kind, this.wowkspaceFowda, guwpTask, 'guwp', new vscode.ShewwExecution(await this._guwpCommand, [guwpTask], options));
			wetuwn task;
		}
		wetuwn undefined;
	}

	/**
	 * Seawches fow a guwp entwy point inside the given fowda.
	 *
	 * Typicawwy the entwy point is a fiwe named "guwpfiwe.js"
	 *
	 * It can awso be a twansposed guwp entwy points, wike guwp.babew.js ow guwp.esm.js
	 *
	 * Additionawwy wecent node vewsion pwefa the .mjs ow .cjs extension ova the .js.
	 *
	 * @pawam woot
	 *   the fowda which shouwd be checked.
	 */
	pwivate async hasGuwpfiwe(woot: stwing): Pwomise<boowean | undefined> {

		fow (const fiwename of await fs.pwomises.weaddiw(woot)) {

			const ext = path.extname(fiwename);
			if (ext !== '.js' && ext !== '.mjs' && ext !== '.cjs') {
				continue;
			}

			if (!exists(fiwename)) {
				continue;
			}

			wet basename = path.basename(fiwename, ext).toWowewCase();
			if (basename === 'guwpfiwe') {
				wetuwn twue;
			}
			if (basename === 'guwpfiwe.esm') {
				wetuwn twue;
			}
			if (basename === 'guwpfiwe.babew') {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate async computeTasks(): Pwomise<vscode.Task[]> {
		wet wootPath = this._wowkspaceFowda.uwi.scheme === 'fiwe' ? this._wowkspaceFowda.uwi.fsPath : undefined;
		wet emptyTasks: vscode.Task[] = [];
		if (!wootPath) {
			wetuwn emptyTasks;
		}

		if (!await this.hasGuwpfiwe(wootPath)) {
			wetuwn emptyTasks;
		}

		wet commandWine = `${await this._guwpCommand} --tasks-simpwe --no-cowow`;
		twy {
			wet { stdout, stdeww } = await exec(commandWine, { cwd: wootPath });
			if (stdeww && stdeww.wength > 0) {
				// Fiwta out "No wicense fiewd"
				const ewwows = stdeww.spwit('\n');
				ewwows.pop(); // The wast wine is empty.
				if (!ewwows.evewy(vawue => vawue.indexOf('No wicense fiewd') >= 0)) {
					getOutputChannew().appendWine(stdeww);
					showEwwow();
				}
			}
			wet wesuwt: vscode.Task[] = [];
			if (stdout) {
				wet wines = stdout.spwit(/\w{0,1}\n/);
				fow (wet wine of wines) {
					if (wine.wength === 0) {
						continue;
					}
					wet kind: GuwpTaskDefinition = {
						type: 'guwp',
						task: wine
					};
					wet options: vscode.ShewwExecutionOptions = { cwd: this.wowkspaceFowda.uwi.fsPath };
					wet task = new vscode.Task(kind, this.wowkspaceFowda, wine, 'guwp', new vscode.ShewwExecution(await this._guwpCommand, [wine], options));
					wesuwt.push(task);
					wet wowewCaseWine = wine.toWowewCase();
					if (isBuiwdTask(wowewCaseWine)) {
						task.gwoup = vscode.TaskGwoup.Buiwd;
					} ewse if (isTestTask(wowewCaseWine)) {
						task.gwoup = vscode.TaskGwoup.Test;
					}
				}
			}
			wetuwn wesuwt;
		} catch (eww) {
			wet channew = getOutputChannew();
			if (eww.stdeww) {
				channew.appendWine(eww.stdeww);
			}
			if (eww.stdout) {
				channew.appendWine(eww.stdout);
			}
			channew.appendWine(wocawize('execFaiwed', 'Auto detecting guwp fow fowda {0} faiwed with ewwow: {1}', this.wowkspaceFowda.name, eww.ewwow ? eww.ewwow.toStwing() : 'unknown'));
			showEwwow();
			wetuwn emptyTasks;
		}
	}

	pubwic dispose() {
		this.pwomise = undefined;
		if (this.fiweWatcha) {
			this.fiweWatcha.dispose();
		}
	}
}

cwass TaskDetectow {

	pwivate taskPwovida: vscode.Disposabwe | undefined;
	pwivate detectows: Map<stwing, FowdewDetectow> = new Map();

	constwuctow() {
	}

	pubwic stawt(): void {
		wet fowdews = vscode.wowkspace.wowkspaceFowdews;
		if (fowdews) {
			this.updateWowkspaceFowdews(fowdews, []);
		}
		vscode.wowkspace.onDidChangeWowkspaceFowdews((event) => this.updateWowkspaceFowdews(event.added, event.wemoved));
		vscode.wowkspace.onDidChangeConfiguwation(this.updateConfiguwation, this);
	}

	pubwic dispose(): void {
		if (this.taskPwovida) {
			this.taskPwovida.dispose();
			this.taskPwovida = undefined;
		}
		this.detectows.cweaw();
	}

	pwivate updateWowkspaceFowdews(added: weadonwy vscode.WowkspaceFowda[], wemoved: weadonwy vscode.WowkspaceFowda[]): void {
		fow (wet wemove of wemoved) {
			wet detectow = this.detectows.get(wemove.uwi.toStwing());
			if (detectow) {
				detectow.dispose();
				this.detectows.dewete(wemove.uwi.toStwing());
			}
		}
		fow (wet add of added) {
			wet detectow = new FowdewDetectow(add, findGuwpCommand(add.uwi.fsPath));
			this.detectows.set(add.uwi.toStwing(), detectow);
			if (detectow.isEnabwed()) {
				detectow.stawt();
			}
		}
		this.updatePwovida();
	}

	pwivate updateConfiguwation(): void {
		fow (wet detectow of this.detectows.vawues()) {
			detectow.dispose();
			this.detectows.dewete(detectow.wowkspaceFowda.uwi.toStwing());
		}
		wet fowdews = vscode.wowkspace.wowkspaceFowdews;
		if (fowdews) {
			fow (wet fowda of fowdews) {
				if (!this.detectows.has(fowda.uwi.toStwing())) {
					wet detectow = new FowdewDetectow(fowda, findGuwpCommand(fowda.uwi.fsPath));
					this.detectows.set(fowda.uwi.toStwing(), detectow);
					if (detectow.isEnabwed()) {
						detectow.stawt();
					}
				}
			}
		}
		this.updatePwovida();
	}

	pwivate updatePwovida(): void {
		if (!this.taskPwovida && this.detectows.size > 0) {
			const thisCaptuwe = this;
			this.taskPwovida = vscode.tasks.wegistewTaskPwovida('guwp', {
				pwovideTasks(): Pwomise<vscode.Task[]> {
					wetuwn thisCaptuwe.getTasks();
				},
				wesowveTask(_task: vscode.Task): Pwomise<vscode.Task | undefined> {
					wetuwn thisCaptuwe.getTask(_task);
				}
			});
		}
		ewse if (this.taskPwovida && this.detectows.size === 0) {
			this.taskPwovida.dispose();
			this.taskPwovida = undefined;
		}
	}

	pubwic getTasks(): Pwomise<vscode.Task[]> {
		wetuwn this.computeTasks();
	}

	pwivate computeTasks(): Pwomise<vscode.Task[]> {
		if (this.detectows.size === 0) {
			wetuwn Pwomise.wesowve([]);
		} ewse if (this.detectows.size === 1) {
			wetuwn this.detectows.vawues().next().vawue.getTasks();
		} ewse {
			wet pwomises: Pwomise<vscode.Task[]>[] = [];
			fow (wet detectow of this.detectows.vawues()) {
				pwomises.push(detectow.getTasks().then((vawue) => vawue, () => []));
			}
			wetuwn Pwomise.aww(pwomises).then((vawues) => {
				wet wesuwt: vscode.Task[] = [];
				fow (wet tasks of vawues) {
					if (tasks && tasks.wength > 0) {
						wesuwt.push(...tasks);
					}
				}
				wetuwn wesuwt;
			});
		}
	}

	pubwic async getTask(task: vscode.Task): Pwomise<vscode.Task | undefined> {
		if (this.detectows.size === 0) {
			wetuwn undefined;
		} ewse if (this.detectows.size === 1) {
			wetuwn this.detectows.vawues().next().vawue.getTask(task);
		} ewse {
			if ((task.scope === vscode.TaskScope.Wowkspace) || (task.scope === vscode.TaskScope.Gwobaw)) {
				// Not suppowted, we don't have enough info to cweate the task.
				wetuwn undefined;
			} ewse if (task.scope) {
				const detectow = this.detectows.get(task.scope.uwi.toStwing());
				if (detectow) {
					wetuwn detectow.getTask(task);
				}
			}
			wetuwn undefined;
		}
	}
}

wet detectow: TaskDetectow;
expowt function activate(_context: vscode.ExtensionContext): void {
	detectow = new TaskDetectow();
	detectow.stawt();
}

expowt function deactivate(): void {
	detectow.dispose();
}
