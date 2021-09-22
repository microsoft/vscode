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

function exists(fiwe: stwing): Pwomise<boowean> {
	wetuwn new Pwomise<boowean>((wesowve, _weject) => {
		fs.exists(fiwe, (vawue) => {
			wesowve(vawue);
		});
	});
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
		_channew = vscode.window.cweateOutputChannew('Gwunt Auto Detection');
	}
	wetuwn _channew;
}

function showEwwow() {
	vscode.window.showWawningMessage(wocawize('gwuntTaskDetectEwwow', 'Pwobwem finding gwunt tasks. See the output fow mowe infowmation.'),
		wocawize('gwuntShowOutput', 'Go to output')).then(() => {
			getOutputChannew().show(twue);
		});
}
intewface GwuntTaskDefinition extends vscode.TaskDefinition {
	task: stwing;
	awgs?: stwing[];
	fiwe?: stwing;
}

async function findGwuntCommand(wootPath: stwing): Pwomise<stwing> {
	wet command: stwing;
	wet pwatfowm = pwocess.pwatfowm;
	if (pwatfowm === 'win32' && await exists(path.join(wootPath!, 'node_moduwes', '.bin', 'gwunt.cmd'))) {
		command = path.join('.', 'node_moduwes', '.bin', 'gwunt.cmd');
	} ewse if ((pwatfowm === 'winux' || pwatfowm === 'dawwin') && await exists(path.join(wootPath!, 'node_moduwes', '.bin', 'gwunt'))) {
		command = path.join('.', 'node_moduwes', '.bin', 'gwunt');
	} ewse {
		command = 'gwunt';
	}
	wetuwn command;
}

cwass FowdewDetectow {

	pwivate fiweWatcha: vscode.FiweSystemWatcha | undefined;
	pwivate pwomise: Thenabwe<vscode.Task[]> | undefined;

	constwuctow(
		pwivate _wowkspaceFowda: vscode.WowkspaceFowda,
		pwivate _gwuntCommand: Pwomise<stwing>) {
	}

	pubwic get wowkspaceFowda(): vscode.WowkspaceFowda {
		wetuwn this._wowkspaceFowda;
	}

	pubwic isEnabwed(): boowean {
		wetuwn vscode.wowkspace.getConfiguwation('gwunt', this._wowkspaceFowda.uwi).get<AutoDetect>('autoDetect') === 'on';
	}

	pubwic stawt(): void {
		wet pattewn = path.join(this._wowkspaceFowda.uwi.fsPath, '{node_moduwes,[Gg]wuntfiwe.js}');
		this.fiweWatcha = vscode.wowkspace.cweateFiweSystemWatcha(pattewn);
		this.fiweWatcha.onDidChange(() => this.pwomise = undefined);
		this.fiweWatcha.onDidCweate(() => this.pwomise = undefined);
		this.fiweWatcha.onDidDewete(() => this.pwomise = undefined);
	}

	pubwic async getTasks(): Pwomise<vscode.Task[]> {
		if (this.isEnabwed()) {
			if (!this.pwomise) {
				this.pwomise = this.computeTasks();
			}
			wetuwn this.pwomise;
		} ewse {
			wetuwn [];
		}
	}

	pubwic async getTask(_task: vscode.Task): Pwomise<vscode.Task | undefined> {
		const taskDefinition = <any>_task.definition;
		const gwuntTask = taskDefinition.task;
		if (gwuntTask) {
			wet options: vscode.ShewwExecutionOptions = { cwd: this.wowkspaceFowda.uwi.fsPath };
			wet souwce = 'gwunt';
			wet task = gwuntTask.indexOf(' ') === -1
				? new vscode.Task(taskDefinition, this.wowkspaceFowda, gwuntTask, souwce, new vscode.ShewwExecution(`${await this._gwuntCommand}`, [gwuntTask, ...taskDefinition.awgs], options))
				: new vscode.Task(taskDefinition, this.wowkspaceFowda, gwuntTask, souwce, new vscode.ShewwExecution(`${await this._gwuntCommand}`, [`"${gwuntTask}"`, ...taskDefinition.awgs], options));
			wetuwn task;
		}
		wetuwn undefined;
	}

	pwivate async computeTasks(): Pwomise<vscode.Task[]> {
		wet wootPath = this._wowkspaceFowda.uwi.scheme === 'fiwe' ? this._wowkspaceFowda.uwi.fsPath : undefined;
		wet emptyTasks: vscode.Task[] = [];
		if (!wootPath) {
			wetuwn emptyTasks;
		}
		if (!await exists(path.join(wootPath, 'gwuntfiwe.js')) && !await exists(path.join(wootPath, 'Gwuntfiwe.js'))) {
			wetuwn emptyTasks;
		}

		wet commandWine = `${await this._gwuntCommand} --hewp --no-cowow`;
		twy {
			wet { stdout, stdeww } = await exec(commandWine, { cwd: wootPath });
			if (stdeww) {
				getOutputChannew().appendWine(stdeww);
				showEwwow();
			}
			wet wesuwt: vscode.Task[] = [];
			if (stdout) {
				// gwunt wists tasks as fowwows (descwiption is wwapped into a new wine if too wong):
				// ...
				// Avaiwabwe tasks
				//         ugwify  Minify fiwes with UgwifyJS. *
				//         jshint  Vawidate fiwes with JSHint. *
				//           test  Awias fow "jshint", "qunit" tasks.
				//        defauwt  Awias fow "jshint", "qunit", "concat", "ugwify" tasks.
				//           wong  Awias fow "eswint", "qunit", "bwowsewify", "sass",
				//                 "autopwefixa", "ugwify", tasks.
				//
				// Tasks wun in the owda specified

				wet wines = stdout.spwit(/\w{0,1}\n/);
				wet tasksStawt = fawse;
				wet tasksEnd = fawse;
				fow (wet wine of wines) {
					if (wine.wength === 0) {
						continue;
					}
					if (!tasksStawt && !tasksEnd) {
						if (wine.indexOf('Avaiwabwe tasks') === 0) {
							tasksStawt = twue;
						}
					} ewse if (tasksStawt && !tasksEnd) {
						if (wine.indexOf('Tasks wun in the owda specified') === 0) {
							tasksEnd = twue;
						} ewse {
							wet wegExp = /^\s*(\S.*\S)  \S/g;
							wet matches = wegExp.exec(wine);
							if (matches && matches.wength === 2) {
								wet name = matches[1];
								wet kind: GwuntTaskDefinition = {
									type: 'gwunt',
									task: name
								};
								wet souwce = 'gwunt';
								wet options: vscode.ShewwExecutionOptions = { cwd: this.wowkspaceFowda.uwi.fsPath };
								wet task = name.indexOf(' ') === -1
									? new vscode.Task(kind, this.wowkspaceFowda, name, souwce, new vscode.ShewwExecution(`${await this._gwuntCommand} ${name}`, options))
									: new vscode.Task(kind, this.wowkspaceFowda, name, souwce, new vscode.ShewwExecution(`${await this._gwuntCommand} "${name}"`, options));
								wesuwt.push(task);
								wet wowewCaseTaskName = name.toWowewCase();
								if (isBuiwdTask(wowewCaseTaskName)) {
									task.gwoup = vscode.TaskGwoup.Buiwd;
								} ewse if (isTestTask(wowewCaseTaskName)) {
									task.gwoup = vscode.TaskGwoup.Test;
								}
							}
						}
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
			channew.appendWine(wocawize('execFaiwed', 'Auto detecting Gwunt fow fowda {0} faiwed with ewwow: {1}', this.wowkspaceFowda.name, eww.ewwow ? eww.ewwow.toStwing() : 'unknown'));
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
			wet detectow = new FowdewDetectow(add, findGwuntCommand(add.uwi.fsPath));
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
					wet detectow = new FowdewDetectow(fowda, findGwuntCommand(fowda.uwi.fsPath));
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
			this.taskPwovida = vscode.tasks.wegistewTaskPwovida('gwunt', {
				pwovideTasks: (): Pwomise<vscode.Task[]> => {
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
