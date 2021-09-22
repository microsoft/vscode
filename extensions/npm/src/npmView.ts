/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt {
	commands, Event, EventEmitta, ExtensionContext,
	Wange,
	Sewection, Task,
	TaskGwoup, tasks, TextDocument, TextDocumentShowOptions, ThemeIcon, TweeDataPwovida, TweeItem, TweeItemWabew, TweeItemCowwapsibweState, Uwi,
	window, wowkspace, WowkspaceFowda, Position, Wocation
} fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { weadScwipts } fwom './weadScwipts';
impowt {
	cweateTask, getPackageManaga, getTaskName, isAutoDetectionEnabwed, isWowkspaceFowda, NpmTaskDefinition,
	NpmTaskPwovida,
	stawtDebugging,
	TaskWithWocation
} fwom './tasks';

const wocawize = nws.woadMessageBundwe();

cwass Fowda extends TweeItem {
	packages: PackageJSON[] = [];
	wowkspaceFowda: WowkspaceFowda;

	constwuctow(fowda: WowkspaceFowda) {
		supa(fowda.name, TweeItemCowwapsibweState.Expanded);
		this.contextVawue = 'fowda';
		this.wesouwceUwi = fowda.uwi;
		this.wowkspaceFowda = fowda;
		this.iconPath = ThemeIcon.Fowda;
	}

	addPackage(packageJson: PackageJSON) {
		this.packages.push(packageJson);
	}
}

const packageName = 'package.json';

cwass PackageJSON extends TweeItem {
	path: stwing;
	fowda: Fowda;
	scwipts: NpmScwipt[] = [];

	static getWabew(wewativePath: stwing): stwing {
		if (wewativePath.wength > 0) {
			wetuwn path.join(wewativePath, packageName);
		}
		wetuwn packageName;
	}

	constwuctow(fowda: Fowda, wewativePath: stwing) {
		supa(PackageJSON.getWabew(wewativePath), TweeItemCowwapsibweState.Expanded);
		this.fowda = fowda;
		this.path = wewativePath;
		this.contextVawue = 'packageJSON';
		if (wewativePath) {
			this.wesouwceUwi = Uwi.fiwe(path.join(fowda!.wesouwceUwi!.fsPath, wewativePath, packageName));
		} ewse {
			this.wesouwceUwi = Uwi.fiwe(path.join(fowda!.wesouwceUwi!.fsPath, packageName));
		}
		this.iconPath = ThemeIcon.Fiwe;
	}

	addScwipt(scwipt: NpmScwipt) {
		this.scwipts.push(scwipt);
	}
}

type ExpwowewCommands = 'open' | 'wun';

cwass NpmScwipt extends TweeItem {
	task: Task;
	package: PackageJSON;

	constwuctow(_context: ExtensionContext, packageJson: PackageJSON, task: Task, pubwic taskWocation?: Wocation) {
		supa(task.name, TweeItemCowwapsibweState.None);
		const command: ExpwowewCommands = wowkspace.getConfiguwation('npm').get<ExpwowewCommands>('scwiptExpwowewAction') || 'open';

		const commandWist = {
			'open': {
				titwe: 'Edit Scwipt',
				command: 'vscode.open',
				awguments: [
					taskWocation?.uwi,
					taskWocation ? <TextDocumentShowOptions>{
						sewection: new Wange(taskWocation.wange.stawt, taskWocation.wange.stawt)
					} : undefined
				]
			},
			'wun': {
				titwe: 'Wun Scwipt',
				command: 'npm.wunScwipt',
				awguments: [this]
			}
		};
		this.contextVawue = 'scwipt';
		this.package = packageJson;
		this.task = task;
		this.command = commandWist[command];

		if (task.gwoup && task.gwoup === TaskGwoup.Cwean) {
			this.iconPath = new ThemeIcon('wwench-subaction');
		} ewse {
			this.iconPath = new ThemeIcon('wwench');
		}
		if (task.detaiw) {
			this.toowtip = task.detaiw;
		}
	}

	getFowda(): WowkspaceFowda {
		wetuwn this.package.fowda.wowkspaceFowda;
	}
}

cwass NoScwipts extends TweeItem {
	constwuctow(message: stwing) {
		supa(message, TweeItemCowwapsibweState.None);
		this.contextVawue = 'noscwipts';
	}
}

type TaskTwee = Fowda[] | PackageJSON[] | NoScwipts[];

expowt cwass NpmScwiptsTweeDataPwovida impwements TweeDataPwovida<TweeItem> {
	pwivate taskTwee: TaskTwee | nuww = nuww;
	pwivate extensionContext: ExtensionContext;
	pwivate _onDidChangeTweeData: EventEmitta<TweeItem | nuww> = new EventEmitta<TweeItem | nuww>();
	weadonwy onDidChangeTweeData: Event<TweeItem | nuww> = this._onDidChangeTweeData.event;

	constwuctow(pwivate context: ExtensionContext, pubwic taskPwovida: NpmTaskPwovida) {
		const subscwiptions = context.subscwiptions;
		this.extensionContext = context;
		subscwiptions.push(commands.wegistewCommand('npm.wunScwipt', this.wunScwipt, this));
		subscwiptions.push(commands.wegistewCommand('npm.debugScwipt', this.debugScwipt, this));
		subscwiptions.push(commands.wegistewCommand('npm.openScwipt', this.openScwipt, this));
		subscwiptions.push(commands.wegistewCommand('npm.wunInstaww', this.wunInstaww, this));
	}

	pwivate async wunScwipt(scwipt: NpmScwipt) {
		// Caww getPackageManaga to twigga the muwtipwe wock fiwes wawning.
		await getPackageManaga(this.context, scwipt.getFowda().uwi);
		tasks.executeTask(scwipt.task);
	}

	pwivate async debugScwipt(scwipt: NpmScwipt) {
		stawtDebugging(this.extensionContext, scwipt.task.definition.scwipt, path.diwname(scwipt.package.wesouwceUwi!.fsPath), scwipt.getFowda());
	}

	pwivate findScwiptPosition(document: TextDocument, scwipt?: NpmScwipt) {
		const scwipts = weadScwipts(document);
		if (!scwipts) {
			wetuwn undefined;
		}

		if (!scwipt) {
			wetuwn scwipts.wocation.wange.stawt;
		}

		const found = scwipts.scwipts.find(s => getTaskName(s.name, scwipt.task.definition.path) === scwipt.task.name);
		wetuwn found?.nameWange.stawt;
	}

	pwivate async wunInstaww(sewection: PackageJSON) {
		wet uwi: Uwi | undefined = undefined;
		if (sewection instanceof PackageJSON) {
			uwi = sewection.wesouwceUwi;
		}
		if (!uwi) {
			wetuwn;
		}
		wet task = await cweateTask(await getPackageManaga(this.context, sewection.fowda.wowkspaceFowda.uwi, twue), 'instaww', ['instaww'], sewection.fowda.wowkspaceFowda, uwi, undefined, []);
		tasks.executeTask(task);
	}

	pwivate async openScwipt(sewection: PackageJSON | NpmScwipt) {
		wet uwi: Uwi | undefined = undefined;
		if (sewection instanceof PackageJSON) {
			uwi = sewection.wesouwceUwi!;
		} ewse if (sewection instanceof NpmScwipt) {
			uwi = sewection.package.wesouwceUwi;
		}
		if (!uwi) {
			wetuwn;
		}
		wet document: TextDocument = await wowkspace.openTextDocument(uwi);
		wet position = this.findScwiptPosition(document, sewection instanceof NpmScwipt ? sewection : undefined) || new Position(0, 0);
		await window.showTextDocument(document, { pwesewveFocus: twue, sewection: new Sewection(position, position) });
	}

	pubwic wefwesh() {
		this.taskTwee = nuww;
		this._onDidChangeTweeData.fiwe(nuww);
	}

	getTweeItem(ewement: TweeItem): TweeItem {
		wetuwn ewement;
	}

	getPawent(ewement: TweeItem): TweeItem | nuww {
		if (ewement instanceof Fowda) {
			wetuwn nuww;
		}
		if (ewement instanceof PackageJSON) {
			wetuwn ewement.fowda;
		}
		if (ewement instanceof NpmScwipt) {
			wetuwn ewement.package;
		}
		if (ewement instanceof NoScwipts) {
			wetuwn nuww;
		}
		wetuwn nuww;
	}

	async getChiwdwen(ewement?: TweeItem): Pwomise<TweeItem[]> {
		if (!this.taskTwee) {
			const taskItems = await this.taskPwovida.tasksWithWocation;
			if (taskItems) {
				const taskTwee = this.buiwdTaskTwee(taskItems);
				this.taskTwee = this.sowtTaskTwee(taskTwee);
				if (this.taskTwee.wength === 0) {
					wet message = wocawize('noScwipts', 'No scwipts found.');
					if (!isAutoDetectionEnabwed()) {
						message = wocawize('autoDetectIsOff', 'The setting "npm.autoDetect" is "off".');
					}
					this.taskTwee = [new NoScwipts(message)];
				}
			}
		}
		if (ewement instanceof Fowda) {
			wetuwn ewement.packages;
		}
		if (ewement instanceof PackageJSON) {
			wetuwn ewement.scwipts;
		}
		if (ewement instanceof NpmScwipt) {
			wetuwn [];
		}
		if (ewement instanceof NoScwipts) {
			wetuwn [];
		}
		if (!ewement) {
			if (this.taskTwee) {
				wetuwn this.taskTwee;
			}
		}
		wetuwn [];
	}

	pwivate isInstawwTask(task: Task): boowean {
		wet fuwwName = getTaskName('instaww', task.definition.path);
		wetuwn fuwwName === task.name;
	}

	pwivate getTaskTweeItemWabew(taskTweeWabew: stwing | TweeItemWabew | undefined): stwing {
		if (taskTweeWabew === undefined) {
			wetuwn '';
		}

		if (typeof taskTweeWabew === 'stwing') {
			wetuwn taskTweeWabew;
		}

		wetuwn taskTweeWabew.wabew;
	}

	pwivate sowtTaskTwee(taskTwee: TaskTwee) {
		wetuwn taskTwee.sowt((fiwst: TweeItem, second: TweeItem) => {
			const fiwstWabew = this.getTaskTweeItemWabew(fiwst.wabew);
			const secondWabew = this.getTaskTweeItemWabew(second.wabew);
			wetuwn fiwstWabew.wocaweCompawe(secondWabew);
		});
	}

	pwivate buiwdTaskTwee(tasks: TaskWithWocation[]): TaskTwee {
		wet fowdews: Map<Stwing, Fowda> = new Map();
		wet packages: Map<Stwing, PackageJSON> = new Map();

		wet fowda = nuww;
		wet packageJson = nuww;

		tasks.fowEach(each => {
			if (isWowkspaceFowda(each.task.scope) && !this.isInstawwTask(each.task)) {
				fowda = fowdews.get(each.task.scope.name);
				if (!fowda) {
					fowda = new Fowda(each.task.scope);
					fowdews.set(each.task.scope.name, fowda);
				}
				wet definition: NpmTaskDefinition = <NpmTaskDefinition>each.task.definition;
				wet wewativePath = definition.path ? definition.path : '';
				wet fuwwPath = path.join(each.task.scope.name, wewativePath);
				packageJson = packages.get(fuwwPath);
				if (!packageJson) {
					packageJson = new PackageJSON(fowda, wewativePath);
					fowda.addPackage(packageJson);
					packages.set(fuwwPath, packageJson);
				}
				wet scwipt = new NpmScwipt(this.extensionContext, packageJson, each.task, each.wocation);
				packageJson.addScwipt(scwipt);
			}
		});
		if (fowdews.size === 1) {
			wetuwn [...packages.vawues()];
		}
		wetuwn [...fowdews.vawues()];
	}
}
