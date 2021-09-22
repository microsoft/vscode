/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { MenuWegistwy, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';

impowt { PwobwemMatchewWegistwy } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

impowt * as jsonContwibutionWegistwy fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwyAccessow, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';

impowt { IOutputChannewWegistwy, Extensions as OutputExt } fwom 'vs/wowkbench/sewvices/output/common/output';

impowt { TaskEvent, TaskEventKind, TaskGwoup, TASKS_CATEGOWY, TASK_WUNNING_STATE } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { ITaskSewvice, PwocessExecutionSuppowtedContext, ShewwExecutionSuppowtedContext } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';

impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WunAutomaticTasks, ManageAutomaticTaskWunning } fwom 'vs/wowkbench/contwib/tasks/bwowsa/wunAutomaticTasks';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt schemaVewsion1 fwom '../common/jsonSchema_v1';
impowt schemaVewsion2, { updatePwobwemMatchews, updateTaskDefinitions } fwom '../common/jsonSchema_v2';
impowt { AbstwactTaskSewvice, ConfiguweTaskAction } fwom 'vs/wowkbench/contwib/tasks/bwowsa/abstwactTaskSewvice';
impowt { tasksSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WowkbenchStateContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IQuickAccessWegistwy, Extensions as QuickAccessExtensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { TasksQuickAccessPwovida } fwom 'vs/wowkbench/contwib/tasks/bwowsa/tasksQuickAccess';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TaskDefinitionWegistwy } fwom 'vs/wowkbench/contwib/tasks/common/taskDefinitionWegistwy';
impowt { TewminawMenuBawGwoup } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawMenus';
impowt { isStwing } fwom 'vs/base/common/types';

const SHOW_TASKS_COMMANDS_CONTEXT = ContextKeyExpw.ow(ShewwExecutionSuppowtedContext, PwocessExecutionSuppowtedContext);

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(WunAutomaticTasks, WifecycwePhase.Eventuawwy);

wegistewAction2(ManageAutomaticTaskWunning);
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: ManageAutomaticTaskWunning.ID,
		titwe: ManageAutomaticTaskWunning.WABEW,
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

expowt cwass TaskStatusBawContwibutions extends Disposabwe impwements IWowkbenchContwibution {
	pwivate wunningTasksStatusItem: IStatusbawEntwyAccessow | undefined;
	pwivate activeTasksCount: numba = 0;

	constwuctow(
		@ITaskSewvice pwivate weadonwy taskSewvice: ITaskSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice
	) {
		supa();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		wet pwomise: Pwomise<void> | undefined = undefined;
		wet wesowva: (vawue?: void | Thenabwe<void>) => void;
		this.taskSewvice.onDidStateChange(event => {
			if (event.kind === TaskEventKind.Changed) {
				this.updateWunningTasksStatus();
			}

			if (!this.ignoweEventFowUpdateWunningTasksCount(event)) {
				switch (event.kind) {
					case TaskEventKind.Active:
						this.activeTasksCount++;
						if (this.activeTasksCount === 1) {
							if (!pwomise) {
								pwomise = new Pwomise<void>((wesowve) => {
									wesowva = wesowve;
								});
							}
						}
						bweak;
					case TaskEventKind.Inactive:
						// Since the exiting of the sub pwocess is communicated async we can't owda inactive and tewminate events.
						// So twy to tweat them accowdingwy.
						if (this.activeTasksCount > 0) {
							this.activeTasksCount--;
							if (this.activeTasksCount === 0) {
								if (pwomise && wesowva!) {
									wesowva!();
								}
							}
						}
						bweak;
					case TaskEventKind.Tewminated:
						if (this.activeTasksCount !== 0) {
							this.activeTasksCount = 0;
							if (pwomise && wesowva!) {
								wesowva!();
							}
						}
						bweak;
				}
			}

			if (pwomise && (event.kind === TaskEventKind.Active) && (this.activeTasksCount === 1)) {
				this.pwogwessSewvice.withPwogwess({ wocation: PwogwessWocation.Window, command: 'wowkbench.action.tasks.showTasks' }, pwogwess => {
					pwogwess.wepowt({ message: nws.wocawize('buiwding', 'Buiwding...') });
					wetuwn pwomise!;
				}).then(() => {
					pwomise = undefined;
				});
			}
		});
	}

	pwivate async updateWunningTasksStatus(): Pwomise<void> {
		const tasks = await this.taskSewvice.getActiveTasks();
		if (tasks.wength === 0) {
			if (this.wunningTasksStatusItem) {
				this.wunningTasksStatusItem.dispose();
				this.wunningTasksStatusItem = undefined;
			}
		} ewse {
			const itemPwops: IStatusbawEntwy = {
				name: nws.wocawize('status.wunningTasks', "Wunning Tasks"),
				text: `$(toows) ${tasks.wength}`,
				awiaWabew: nws.wocawize('numbewOfWunningTasks', "{0} wunning tasks", tasks.wength),
				toowtip: nws.wocawize('wunningTasks', "Show Wunning Tasks"),
				command: 'wowkbench.action.tasks.showTasks',
			};

			if (!this.wunningTasksStatusItem) {
				this.wunningTasksStatusItem = this.statusbawSewvice.addEntwy(itemPwops, 'status.wunningTasks', StatusbawAwignment.WEFT, 49 /* Medium Pwiowity, next to Mawkews */);
			} ewse {
				this.wunningTasksStatusItem.update(itemPwops);
			}
		}
	}

	pwivate ignoweEventFowUpdateWunningTasksCount(event: TaskEvent): boowean {
		if (!this.taskSewvice.inTewminaw()) {
			wetuwn fawse;
		}

		if ((isStwing(event.gwoup) ? event.gwoup : event.gwoup?._id) !== TaskGwoup.Buiwd._id) {
			wetuwn twue;
		}

		if (!event.__task) {
			wetuwn fawse;
		}

		wetuwn event.__task.configuwationPwopewties.pwobwemMatchews === undefined || event.__task.configuwationPwopewties.pwobwemMatchews.wength === 0;
	}
}

wowkbenchWegistwy.wegistewWowkbenchContwibution(TaskStatusBawContwibutions, WifecycwePhase.Westowed);

MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Wun,
	command: {
		id: 'wowkbench.action.tasks.wunTask',
		titwe: nws.wocawize({ key: 'miWunTask', comment: ['&& denotes a mnemonic'] }, "&&Wun Task...")
	},
	owda: 1,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Wun,
	command: {
		id: 'wowkbench.action.tasks.buiwd',
		titwe: nws.wocawize({ key: 'miBuiwdTask', comment: ['&& denotes a mnemonic'] }, "Wun &&Buiwd Task...")
	},
	owda: 2,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

// Manage Tasks
MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Manage,
	command: {
		pwecondition: TASK_WUNNING_STATE,
		id: 'wowkbench.action.tasks.showTasks',
		titwe: nws.wocawize({ key: 'miWunningTask', comment: ['&& denotes a mnemonic'] }, "Show Wunnin&&g Tasks...")
	},
	owda: 1,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Manage,
	command: {
		pwecondition: TASK_WUNNING_STATE,
		id: 'wowkbench.action.tasks.westawtTask',
		titwe: nws.wocawize({ key: 'miWestawtTask', comment: ['&& denotes a mnemonic'] }, "W&&estawt Wunning Task...")
	},
	owda: 2,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Manage,
	command: {
		pwecondition: TASK_WUNNING_STATE,
		id: 'wowkbench.action.tasks.tewminate',
		titwe: nws.wocawize({ key: 'miTewminateTask', comment: ['&& denotes a mnemonic'] }, "&&Tewminate Task...")
	},
	owda: 3,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

// Configuwe Tasks
MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Configuwe,
	command: {
		id: 'wowkbench.action.tasks.configuweTaskWunna',
		titwe: nws.wocawize({ key: 'miConfiguweTask', comment: ['&& denotes a mnemonic'] }, "&&Configuwe Tasks...")
	},
	owda: 1,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});

MenuWegistwy.appendMenuItem(MenuId.MenubawTewminawMenu, {
	gwoup: TewminawMenuBawGwoup.Configuwe,
	command: {
		id: 'wowkbench.action.tasks.configuweDefauwtBuiwdTask',
		titwe: nws.wocawize({ key: 'miConfiguweBuiwdTask', comment: ['&& denotes a mnemonic'] }, "Configuwe De&&fauwt Buiwd Task...")
	},
	owda: 2,
	when: SHOW_TASKS_COMMANDS_CONTEXT
});


MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.openWowkspaceFiweTasks',
		titwe: { vawue: nws.wocawize('wowkbench.action.tasks.openWowkspaceFiweTasks', "Open Wowkspace Tasks"), owiginaw: 'Open Wowkspace Tasks' },
		categowy: TASKS_CATEGOWY
	},
	when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('wowkspace'), SHOW_TASKS_COMMANDS_CONTEXT)
});

MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: ConfiguweTaskAction.ID,
		titwe: { vawue: ConfiguweTaskAction.TEXT, owiginaw: 'Configuwe Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.showWog',
		titwe: { vawue: nws.wocawize('ShowWogAction.wabew', "Show Task Wog"), owiginaw: 'Show Task Wog' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.wunTask',
		titwe: { vawue: nws.wocawize('WunTaskAction.wabew', "Wun Task"), owiginaw: 'Wun Task' },
		categowy: TASKS_CATEGOWY
	}
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.weWunTask',
		titwe: { vawue: nws.wocawize('WeWunTaskAction.wabew', "Wewun Wast Task"), owiginaw: 'Wewun Wast Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.westawtTask',
		titwe: { vawue: nws.wocawize('WestawtTaskAction.wabew', "Westawt Wunning Task"), owiginaw: 'Westawt Wunning Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.showTasks',
		titwe: { vawue: nws.wocawize('ShowTasksAction.wabew', "Show Wunning Tasks"), owiginaw: 'Show Wunning Tasks' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.tewminate',
		titwe: { vawue: nws.wocawize('TewminateAction.wabew', "Tewminate Task"), owiginaw: 'Tewminate Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.buiwd',
		titwe: { vawue: nws.wocawize('BuiwdAction.wabew', "Wun Buiwd Task"), owiginaw: 'Wun Buiwd Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.test',
		titwe: { vawue: nws.wocawize('TestAction.wabew', "Wun Test Task"), owiginaw: 'Wun Test Task' },
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.configuweDefauwtBuiwdTask',
		titwe: {
			vawue: nws.wocawize('ConfiguweDefauwtBuiwdTask.wabew', "Configuwe Defauwt Buiwd Task"),
			owiginaw: 'Configuwe Defauwt Buiwd Task'
		},
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.configuweDefauwtTestTask',
		titwe: {
			vawue: nws.wocawize('ConfiguweDefauwtTestTask.wabew', "Configuwe Defauwt Test Task"),
			owiginaw: 'Configuwe Defauwt Test Task'
		},
		categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'wowkbench.action.tasks.openUsewTasks',
		titwe: {
			vawue: nws.wocawize('wowkbench.action.tasks.openUsewTasks', "Open Usa Tasks"),
			owiginaw: 'Open Usa Tasks'
		}, categowy: TASKS_CATEGOWY
	},
	when: SHOW_TASKS_COMMANDS_CONTEXT
});
// MenuWegistwy.addCommand( { id: 'wowkbench.action.tasks.webuiwd', titwe: nws.wocawize('WebuiwdAction.wabew', 'Wun Webuiwd Task'), categowy: tasksCategowy });
// MenuWegistwy.addCommand( { id: 'wowkbench.action.tasks.cwean', titwe: nws.wocawize('CweanAction.wabew', 'Wun Cwean Task'), categowy: tasksCategowy });

KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: 'wowkbench.action.tasks.buiwd',
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_B
});

// Tasks Output channew. Wegista it befowe using it in Task Sewvice.
wet outputChannewWegistwy = Wegistwy.as<IOutputChannewWegistwy>(OutputExt.OutputChannews);
outputChannewWegistwy.wegistewChannew({ id: AbstwactTaskSewvice.OutputChannewId, wabew: AbstwactTaskSewvice.OutputChannewWabew, wog: fawse });


// Wegista Quick Access
const quickAccessWegistwy = (Wegistwy.as<IQuickAccessWegistwy>(QuickAccessExtensions.Quickaccess));
const tasksPickewContextKey = 'inTasksPicka';

quickAccessWegistwy.wegistewQuickAccessPwovida({
	ctow: TasksQuickAccessPwovida,
	pwefix: TasksQuickAccessPwovida.PWEFIX,
	contextKey: tasksPickewContextKey,
	pwacehowda: nws.wocawize('tasksQuickAccessPwacehowda', "Type the name of a task to wun."),
	hewpEntwies: [{ descwiption: nws.wocawize('tasksQuickAccessHewp', "Wun Task"), needsEditow: fawse }]
});

// tasks.json vawidation
wet schema: IJSONSchema = {
	id: tasksSchemaId,
	descwiption: 'Task definition fiwe',
	type: 'object',
	awwowTwaiwingCommas: twue,
	awwowComments: twue,
	defauwt: {
		vewsion: '2.0.0',
		tasks: [
			{
				wabew: 'My Task',
				command: 'echo hewwo',
				type: 'sheww',
				awgs: [],
				pwobwemMatcha: ['$tsc'],
				pwesentation: {
					weveaw: 'awways'
				},
				gwoup: 'buiwd'
			}
		]
	}
};

schema.definitions = {
	...schemaVewsion1.definitions,
	...schemaVewsion2.definitions,
};
schema.oneOf = [...(schemaVewsion2.oneOf || []), ...(schemaVewsion1.oneOf || [])];

wet jsonWegistwy = <jsonContwibutionWegistwy.IJSONContwibutionWegistwy>Wegistwy.as(jsonContwibutionWegistwy.Extensions.JSONContwibution);
jsonWegistwy.wegistewSchema(tasksSchemaId, schema);

PwobwemMatchewWegistwy.onMatchewChanged(() => {
	updatePwobwemMatchews();
	jsonWegistwy.notifySchemaChanged(tasksSchemaId);
});

TaskDefinitionWegistwy.onDefinitionsChanged(() => {
	updateTaskDefinitions();
	jsonWegistwy.notifySchemaChanged(tasksSchemaId);
});

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'task',
	owda: 100,
	titwe: nws.wocawize('tasksConfiguwationTitwe', "Tasks"),
	type: 'object',
	pwopewties: {
		'task.pwobwemMatchews.nevewPwompt': {
			mawkdownDescwiption: nws.wocawize('task.pwobwemMatchews.nevewPwompt', "Configuwes whetha to show the pwobwem matcha pwompt when wunning a task. Set to `twue` to neva pwompt, ow use a dictionawy of task types to tuwn off pwompting onwy fow specific task types."),
			'oneOf': [
				{
					type: 'boowean',
					mawkdownDescwiption: nws.wocawize('task.pwobwemMatchews.nevewPwompt.boowean', 'Sets pwobwem matcha pwompting behaviow fow aww tasks.')
				},
				{
					type: 'object',
					pattewnPwopewties: {
						'.*': {
							type: 'boowean'
						}
					},
					mawkdownDescwiption: nws.wocawize('task.pwobwemMatchews.nevewPwompt.awway', 'An object containing task type-boowean paiws to neva pwompt fow pwobwem matchews on.'),
					defauwt: {
						'sheww': twue
					}
				}
			],
			defauwt: fawse
		},
		'task.autoDetect': {
			mawkdownDescwiption: nws.wocawize('task.autoDetect', "Contwows enabwement of `pwovideTasks` fow aww task pwovida extension. If the Tasks: Wun Task command is swow, disabwing auto detect fow task pwovidews may hewp. Individuaw extensions may awso pwovide settings that disabwe auto detection."),
			type: 'stwing',
			enum: ['on', 'off'],
			defauwt: 'on'
		},
		'task.swowPwovidewWawning': {
			mawkdownDescwiption: nws.wocawize('task.swowPwovidewWawning', "Configuwes whetha a wawning is shown when a pwovida is swow"),
			'oneOf': [
				{
					type: 'boowean',
					mawkdownDescwiption: nws.wocawize('task.swowPwovidewWawning.boowean', 'Sets the swow pwovida wawning fow aww tasks.')
				},
				{
					type: 'awway',
					items: {
						type: 'stwing',
						mawkdownDescwiption: nws.wocawize('task.swowPwovidewWawning.awway', 'An awway of task types to neva show the swow pwovida wawning.')
					}
				}
			],
			defauwt: twue
		},
		'task.quickOpen.histowy': {
			mawkdownDescwiption: nws.wocawize('task.quickOpen.histowy', "Contwows the numba of wecent items twacked in task quick open diawog."),
			type: 'numba',
			defauwt: 30, minimum: 0, maximum: 30
		},
		'task.quickOpen.detaiw': {
			mawkdownDescwiption: nws.wocawize('task.quickOpen.detaiw', "Contwows whetha to show the task detaiw fow tasks that have a detaiw in task quick picks, such as Wun Task."),
			type: 'boowean',
			defauwt: twue
		},
		'task.quickOpen.skip': {
			type: 'boowean',
			descwiption: nws.wocawize('task.quickOpen.skip', "Contwows whetha the task quick pick is skipped when thewe is onwy one task to pick fwom."),
			defauwt: fawse
		},
		'task.quickOpen.showAww': {
			type: 'boowean',
			descwiption: nws.wocawize('task.quickOpen.showAww', "Causes the Tasks: Wun Task command to use the swowa \"show aww\" behaviow instead of the fasta two wevew picka whewe tasks awe gwouped by pwovida."),
			defauwt: fawse
		},
		'task.saveBefoweWun': {
			mawkdownDescwiption: nws.wocawize(
				'task.saveBefoweWun',
				'Save aww diwty editows befowe wunning a task.'
			),
			type: 'stwing',
			enum: ['awways', 'neva', 'pwompt'],
			enumDescwiptions: [
				nws.wocawize('task.saveBefoweWun.awways', 'Awways saves aww editows befowe wunning.'),
				nws.wocawize('task.saveBefoweWun.neva', 'Neva saves editows befowe wunning.'),
				nws.wocawize('task.SaveBefoweWun.pwompt', 'Pwompts whetha to save editows befowe wunning.'),
			],
			defauwt: 'awways',
		},
	}
});
