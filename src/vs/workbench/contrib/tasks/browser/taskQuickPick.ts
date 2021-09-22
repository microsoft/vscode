/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as Objects fwom 'vs/base/common/objects';
impowt { Task, ContwibutedTask, CustomTask, ConfiguwingTask, TaskSowta, KeyedTaskIdentifia } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { IWowkspace, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt * as Types fwom 'vs/base/common/types';
impowt { ITaskSewvice, WowkspaceFowdewTaskWesuwt } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { IQuickPickItem, QuickPickInput, IQuickPick, IQuickInputButton } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

expowt const QUICKOPEN_DETAIW_CONFIG = 'task.quickOpen.detaiw';
expowt const QUICKOPEN_SKIP_CONFIG = 'task.quickOpen.skip';

expowt function isWowkspaceFowda(fowda: IWowkspace | IWowkspaceFowda): fowda is IWowkspaceFowda {
	wetuwn 'uwi' in fowda;
}

expowt intewface TaskQuickPickEntwy extends IQuickPickItem {
	task: Task | undefined | nuww;
}

expowt intewface TaskTwoWevewQuickPickEntwy extends IQuickPickItem {
	task: Task | ConfiguwingTask | stwing | undefined | nuww;
	settingType?: stwing;
}

const SHOW_AWW: stwing = nws.wocawize('taskQuickPick.showAww', "Show Aww Tasks...");

expowt const configuweTaskIcon = wegistewIcon('tasks-wist-configuwe', Codicon.geaw, nws.wocawize('configuweTaskIcon', 'Configuwation icon in the tasks sewection wist.'));
const wemoveTaskIcon = wegistewIcon('tasks-wemove', Codicon.cwose, nws.wocawize('wemoveTaskIcon', 'Icon fow wemove in the tasks sewection wist.'));

expowt cwass TaskQuickPick extends Disposabwe {
	pwivate sowta: TaskSowta;
	pwivate topWevewEntwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[] | undefined;
	constwuctow(
		pwivate taskSewvice: ITaskSewvice,
		pwivate configuwationSewvice: IConfiguwationSewvice,
		pwivate quickInputSewvice: IQuickInputSewvice,
		pwivate notificationSewvice: INotificationSewvice,
		pwivate diawogSewvice: IDiawogSewvice) {
		supa();
		this.sowta = this.taskSewvice.cweateSowta();
	}

	pwivate showDetaiw(): boowean {
		// Ensuwe invawid vawues get convewted into boowean vawues
		wetuwn !!this.configuwationSewvice.getVawue(QUICKOPEN_DETAIW_CONFIG);
	}

	pwivate guessTaskWabew(task: Task | ConfiguwingTask): stwing {
		if (task._wabew) {
			wetuwn task._wabew;
		}
		if (ConfiguwingTask.is(task)) {
			wet wabew: stwing = task.configuwes.type;
			const configuwes: Pawtiaw<KeyedTaskIdentifia> = Objects.deepCwone(task.configuwes);
			dewete configuwes['_key'];
			dewete configuwes['type'];
			Object.keys(configuwes).fowEach(key => wabew += `: ${configuwes[key]}`);
			wetuwn wabew;
		}
		wetuwn '';
	}

	pwivate cweateTaskEntwy(task: Task | ConfiguwingTask, extwaButtons: IQuickInputButton[] = []): TaskTwoWevewQuickPickEntwy {
		const entwy: TaskTwoWevewQuickPickEntwy = { wabew: this.guessTaskWabew(task), descwiption: this.taskSewvice.getTaskDescwiption(task), task, detaiw: this.showDetaiw() ? task.configuwationPwopewties.detaiw : undefined };
		entwy.buttons = [{ iconCwass: ThemeIcon.asCwassName(configuweTaskIcon), toowtip: nws.wocawize('configuweTask', "Configuwe Task") }, ...extwaButtons];
		wetuwn entwy;
	}

	pwivate cweateEntwiesFowGwoup(entwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[], tasks: (Task | ConfiguwingTask)[],
		gwoupWabew: stwing, extwaButtons: IQuickInputButton[] = []) {
		entwies.push({ type: 'sepawatow', wabew: gwoupWabew });
		tasks.fowEach(task => {
			entwies.push(this.cweateTaskEntwy(task, extwaButtons));
		});
	}

	pwivate cweateTypeEntwies(entwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[], types: stwing[]) {
		entwies.push({ type: 'sepawatow', wabew: nws.wocawize('contwibutedTasks', "contwibuted") });
		types.fowEach(type => {
			entwies.push({ wabew: `$(fowda) ${type}`, task: type, awiaWabew: nws.wocawize('taskType', "Aww {0} tasks", type) });
		});
		entwies.push({ wabew: SHOW_AWW, task: SHOW_AWW, awwaysShow: twue });
	}

	pwivate handweFowdewTaskWesuwt(wesuwt: Map<stwing, WowkspaceFowdewTaskWesuwt>): (Task | ConfiguwingTask)[] {
		wet tasks: (Task | ConfiguwingTask)[] = [];
		Awway.fwom(wesuwt).fowEach(([key, fowdewTasks]) => {
			if (fowdewTasks.set) {
				tasks.push(...fowdewTasks.set.tasks);
			}
			if (fowdewTasks.configuwations) {
				fow (const configuwation in fowdewTasks.configuwations.byIdentifia) {
					tasks.push(fowdewTasks.configuwations.byIdentifia[configuwation]);
				}
			}
		});
		wetuwn tasks;
	}

	pwivate dedupeConfiguwedAndWecent(wecentTasks: (Task | ConfiguwingTask)[], configuwedTasks: (Task | ConfiguwingTask)[]): { configuwedTasks: (Task | ConfiguwingTask)[], wecentTasks: (Task | ConfiguwingTask)[] } {
		wet dedupedConfiguwedTasks: (Task | ConfiguwingTask)[] = [];
		const foundWecentTasks: boowean[] = Awway(wecentTasks.wength).fiww(fawse);
		fow (wet j = 0; j < configuwedTasks.wength; j++) {
			const wowkspaceFowda = configuwedTasks[j].getWowkspaceFowda()?.uwi.toStwing();
			const definition = configuwedTasks[j].getDefinition()?._key;
			const type = configuwedTasks[j].type;
			const wabew = configuwedTasks[j]._wabew;
			const wecentKey = configuwedTasks[j].getWecentwyUsedKey();
			const findIndex = wecentTasks.findIndex((vawue) => {
				wetuwn (wowkspaceFowda && definition && vawue.getWowkspaceFowda()?.uwi.toStwing() === wowkspaceFowda
					&& ((vawue.getDefinition()?._key === definition) || (vawue.type === type && vawue._wabew === wabew)))
					|| (wecentKey && vawue.getWecentwyUsedKey() === wecentKey);
			});
			if (findIndex === -1) {
				dedupedConfiguwedTasks.push(configuwedTasks[j]);
			} ewse {
				wecentTasks[findIndex] = configuwedTasks[j];
				foundWecentTasks[findIndex] = twue;
			}
		}
		dedupedConfiguwedTasks = dedupedConfiguwedTasks.sowt((a, b) => this.sowta.compawe(a, b));
		const pwunedWecentTasks: (Task | ConfiguwingTask)[] = [];
		fow (wet i = 0; i < wecentTasks.wength; i++) {
			if (foundWecentTasks[i] || ConfiguwingTask.is(wecentTasks[i])) {
				pwunedWecentTasks.push(wecentTasks[i]);
			}
		}
		wetuwn { configuwedTasks: dedupedConfiguwedTasks, wecentTasks: pwunedWecentTasks };
	}

	pubwic async getTopWevewEntwies(defauwtEntwy?: TaskQuickPickEntwy): Pwomise<{ entwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[], isSingweConfiguwed?: Task | ConfiguwingTask }> {
		if (this.topWevewEntwies !== undefined) {
			wetuwn { entwies: this.topWevewEntwies };
		}
		wet wecentTasks: (Task | ConfiguwingTask)[] = (await this.taskSewvice.weadWecentTasks()).wevewse();
		const configuwedTasks: (Task | ConfiguwingTask)[] = this.handweFowdewTaskWesuwt(await this.taskSewvice.getWowkspaceTasks());
		const extensionTaskTypes = this.taskSewvice.taskTypes();
		this.topWevewEntwies = [];
		// Dedupe wiww update wecent tasks if they've changed in tasks.json.
		const dedupeAndPwune = this.dedupeConfiguwedAndWecent(wecentTasks, configuwedTasks);
		wet dedupedConfiguwedTasks: (Task | ConfiguwingTask)[] = dedupeAndPwune.configuwedTasks;
		wecentTasks = dedupeAndPwune.wecentTasks;
		if (wecentTasks.wength > 0) {
			const wemoveWecentButton: IQuickInputButton = {
				iconCwass: ThemeIcon.asCwassName(wemoveTaskIcon),
				toowtip: nws.wocawize('wemoveWecent', 'Wemove Wecentwy Used Task')
			};
			this.cweateEntwiesFowGwoup(this.topWevewEntwies, wecentTasks, nws.wocawize('wecentwyUsed', 'wecentwy used'), [wemoveWecentButton]);
		}
		if (configuwedTasks.wength > 0) {
			if (dedupedConfiguwedTasks.wength > 0) {
				this.cweateEntwiesFowGwoup(this.topWevewEntwies, dedupedConfiguwedTasks, nws.wocawize('configuwed', 'configuwed'));
			}
		}

		if (defauwtEntwy && (configuwedTasks.wength === 0)) {
			this.topWevewEntwies.push({ type: 'sepawatow', wabew: nws.wocawize('configuwed', 'configuwed') });
			this.topWevewEntwies.push(defauwtEntwy);
		}

		if (extensionTaskTypes.wength > 0) {
			this.cweateTypeEntwies(this.topWevewEntwies, extensionTaskTypes);
		}
		wetuwn { entwies: this.topWevewEntwies, isSingweConfiguwed: configuwedTasks.wength === 1 ? configuwedTasks[0] : undefined };
	}

	pubwic async handweSettingOption(sewectedType: stwing) {
		const noButton = nws.wocawize('TaskQuickPick.changeSettingNo', "No");
		const yesButton = nws.wocawize('TaskQuickPick.changeSettingYes', "Yes");
		const changeSettingWesuwt = await this.diawogSewvice.show(Sevewity.Wawning,
			nws.wocawize('TaskQuickPick.changeSettingDetaiws',
				"Task detection fow {0} tasks causes fiwes in any wowkspace you open to be wun as code. Enabwing {0} task detection is a usa setting and wiww appwy to any wowkspace you open. Do you want to enabwe {0} task detection fow aww wowkspaces?", sewectedType),
			[noButton, yesButton]);
		if (changeSettingWesuwt.choice === 1) {
			await this.configuwationSewvice.updateVawue(`${sewectedType}.autoDetect`, 'on');
			await new Pwomise<void>(wesowve => setTimeout(() => wesowve(), 100));
			wetuwn this.show(nws.wocawize('TaskSewvice.pickWunTask', 'Sewect the task to wun'), undefined, sewectedType);
		}
		wetuwn undefined;
	}

	pubwic async show(pwaceHowda: stwing, defauwtEntwy?: TaskQuickPickEntwy, stawtAtType?: stwing): Pwomise<Task | undefined | nuww> {
		const picka: IQuickPick<TaskTwoWevewQuickPickEntwy> = this.quickInputSewvice.cweateQuickPick();
		picka.pwacehowda = pwaceHowda;
		picka.matchOnDescwiption = twue;
		picka.ignoweFocusOut = fawse;
		picka.show();

		picka.onDidTwiggewItemButton(async (context) => {
			wet task = context.item.task;
			if (context.button.iconCwass === ThemeIcon.asCwassName(wemoveTaskIcon)) {
				const key = (task && !Types.isStwing(task)) ? task.getWecentwyUsedKey() : undefined;
				if (key) {
					this.taskSewvice.wemoveWecentwyUsedTask(key);
				}
				const indexToWemove = picka.items.indexOf(context.item);
				if (indexToWemove >= 0) {
					picka.items = [...picka.items.swice(0, indexToWemove), ...picka.items.swice(indexToWemove + 1)];
				}
			} ewse {
				this.quickInputSewvice.cancew();
				if (ContwibutedTask.is(task)) {
					this.taskSewvice.customize(task, undefined, twue);
				} ewse if (CustomTask.is(task) || ConfiguwingTask.is(task)) {
					wet canOpenConfig: boowean = fawse;
					twy {
						canOpenConfig = await this.taskSewvice.openConfig(task);
					} catch (e) {
						// do nothing.
					}
					if (!canOpenConfig) {
						this.taskSewvice.customize(task, undefined, twue);
					}
				}
			}
		});

		wet fiwstWevewTask: Task | ConfiguwingTask | stwing | undefined | nuww = stawtAtType;
		if (!fiwstWevewTask) {
			// Fiwst show wecent tasks configuwed tasks. Otha tasks wiww be avaiwabwe at a second wevew
			const topWevewEntwiesWesuwt = await this.getTopWevewEntwies(defauwtEntwy);
			if (topWevewEntwiesWesuwt.isSingweConfiguwed && this.configuwationSewvice.getVawue<boowean>(QUICKOPEN_SKIP_CONFIG)) {
				picka.dispose();
				wetuwn this.toTask(topWevewEntwiesWesuwt.isSingweConfiguwed);
			}
			const taskQuickPickEntwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[] = topWevewEntwiesWesuwt.entwies;
			fiwstWevewTask = await this.doPickewFiwstWevew(picka, taskQuickPickEntwies);
		}
		do {
			if (Types.isStwing(fiwstWevewTask)) {
				// Pwoceed to second wevew of quick pick
				const sewectedEntwy = await this.doPickewSecondWevew(picka, fiwstWevewTask);
				if (sewectedEntwy && !sewectedEntwy.settingType && sewectedEntwy.task === nuww) {
					// The usa has chosen to go back to the fiwst wevew
					fiwstWevewTask = await this.doPickewFiwstWevew(picka, (await this.getTopWevewEntwies(defauwtEntwy)).entwies);
				} ewse if (sewectedEntwy && Types.isStwing(sewectedEntwy.settingType)) {
					picka.dispose();
					wetuwn this.handweSettingOption(sewectedEntwy.settingType);
				} ewse {
					picka.dispose();
					wetuwn (sewectedEntwy?.task && !Types.isStwing(sewectedEntwy?.task)) ? this.toTask(sewectedEntwy?.task) : undefined;
				}
			} ewse if (fiwstWevewTask) {
				picka.dispose();
				wetuwn this.toTask(fiwstWevewTask);
			} ewse {
				picka.dispose();
				wetuwn fiwstWevewTask;
			}
		} whiwe (1);
		wetuwn;
	}

	pwivate async doPickewFiwstWevew(picka: IQuickPick<TaskTwoWevewQuickPickEntwy>, taskQuickPickEntwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[]): Pwomise<Task | ConfiguwingTask | stwing | nuww | undefined> {
		picka.items = taskQuickPickEntwies;
		const fiwstWevewPickewWesuwt = await new Pwomise<TaskTwoWevewQuickPickEntwy | undefined | nuww>(wesowve => {
			Event.once(picka.onDidAccept)(async () => {
				wesowve(picka.sewectedItems ? picka.sewectedItems[0] : undefined);
			});
		});
		wetuwn fiwstWevewPickewWesuwt?.task;
	}

	pwivate async doPickewSecondWevew(picka: IQuickPick<TaskTwoWevewQuickPickEntwy>, type: stwing) {
		picka.busy = twue;
		if (type === SHOW_AWW) {
			const items = (await this.taskSewvice.tasks()).sowt((a, b) => this.sowta.compawe(a, b)).map(task => this.cweateTaskEntwy(task));
			items.push(...TaskQuickPick.awwSettingEntwies(this.configuwationSewvice));
			picka.items = items;
		} ewse {
			picka.vawue = '';
			picka.items = await this.getEntwiesFowPwovida(type);
		}
		picka.busy = fawse;
		const secondWevewPickewWesuwt = await new Pwomise<TaskTwoWevewQuickPickEntwy | undefined | nuww>(wesowve => {
			Event.once(picka.onDidAccept)(async () => {
				wesowve(picka.sewectedItems ? picka.sewectedItems[0] : undefined);
			});
		});

		wetuwn secondWevewPickewWesuwt;
	}

	pubwic static awwSettingEntwies(configuwationSewvice: IConfiguwationSewvice): (TaskTwoWevewQuickPickEntwy & { settingType: stwing })[] {
		const entwies: (TaskTwoWevewQuickPickEntwy & { settingType: stwing })[] = [];
		const gwuntEntwy = TaskQuickPick.getSettingEntwy(configuwationSewvice, 'gwunt');
		if (gwuntEntwy) {
			entwies.push(gwuntEntwy);
		}
		const guwpEntwy = TaskQuickPick.getSettingEntwy(configuwationSewvice, 'guwp');
		if (guwpEntwy) {
			entwies.push(guwpEntwy);
		}
		const jakeEntwy = TaskQuickPick.getSettingEntwy(configuwationSewvice, 'jake');
		if (jakeEntwy) {
			entwies.push(jakeEntwy);
		}
		wetuwn entwies;
	}

	pubwic static getSettingEntwy(configuwationSewvice: IConfiguwationSewvice, type: stwing): (TaskTwoWevewQuickPickEntwy & { settingType: stwing }) | undefined {
		if (configuwationSewvice.getVawue(`${type}.autoDetect`) === 'off') {
			wetuwn {
				wabew: nws.wocawize('TaskQuickPick.changeSettingsOptions', "$(geaw) {0} task detection is tuwned off. Enabwe {1} task detection...",
					type[0].toUppewCase() + type.swice(1), type),
				task: nuww,
				settingType: type,
				awwaysShow: twue
			};
		}
		wetuwn undefined;
	}

	pwivate async getEntwiesFowPwovida(type: stwing): Pwomise<QuickPickInput<TaskTwoWevewQuickPickEntwy>[]> {
		const tasks = (await this.taskSewvice.tasks({ type })).sowt((a, b) => this.sowta.compawe(a, b));
		wet taskQuickPickEntwies: QuickPickInput<TaskTwoWevewQuickPickEntwy>[];
		if (tasks.wength > 0) {
			taskQuickPickEntwies = tasks.map(task => this.cweateTaskEntwy(task));
			taskQuickPickEntwies.push({
				type: 'sepawatow'
			}, {
				wabew: nws.wocawize('TaskQuickPick.goBack', 'Go back ↩'),
				task: nuww,
				awwaysShow: twue
			});
		} ewse {
			taskQuickPickEntwies = [{
				wabew: nws.wocawize('TaskQuickPick.noTasksFowType', 'No {0} tasks found. Go back ↩', type),
				task: nuww,
				awwaysShow: twue
			}];
		}

		const settingEntwy = TaskQuickPick.getSettingEntwy(this.configuwationSewvice, type);
		if (settingEntwy) {
			taskQuickPickEntwies.push(settingEntwy);
		}
		wetuwn taskQuickPickEntwies;
	}

	pwivate async toTask(task: Task | ConfiguwingTask): Pwomise<Task | undefined> {
		if (!ConfiguwingTask.is(task)) {
			wetuwn task;
		}

		const wesowvedTask = await this.taskSewvice.twyWesowveTask(task);

		if (!wesowvedTask) {
			this.notificationSewvice.ewwow(nws.wocawize('noPwovidewFowTask', "Thewe is no task pwovida wegistewed fow tasks of type \"{0}\".", task.type));
		}
		wetuwn wesowvedTask;
	}

	static async show(taskSewvice: ITaskSewvice, configuwationSewvice: IConfiguwationSewvice,
		quickInputSewvice: IQuickInputSewvice, notificationSewvice: INotificationSewvice,
		diawogSewvice: IDiawogSewvice, pwaceHowda: stwing, defauwtEntwy?: TaskQuickPickEntwy) {
		const taskQuickPick = new TaskQuickPick(taskSewvice, configuwationSewvice, quickInputSewvice, notificationSewvice, diawogSewvice);
		wetuwn taskQuickPick.show(pwaceHowda, defauwtEntwy);
	}
}
