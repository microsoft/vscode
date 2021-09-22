/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt * as Objects fwom 'vs/base/common/objects';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as json fwom 'vs/base/common/json';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IDisposabwe, Disposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as Types fwom 'vs/base/common/types';
impowt { TewminateWesponseCode } fwom 'vs/base/common/pwocesses';
impowt { VawidationStatus, VawidationState } fwom 'vs/base/common/pawsews';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { WWUCache, Touch } fwom 'vs/base/common/map';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IConfiguwationSewvice, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { PwobwemMatchewWegistwy, NamedPwobwemMatcha } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPwogwessSewvice, IPwogwessOptions, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';

impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda, IWowkspace, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IOutputSewvice, IOutputChannew } fwom 'vs/wowkbench/contwib/output/common/output';

impowt { ITewminawGwoupSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';

impowt { ITaskSystem, ITaskWesowva, ITaskSummawy, TaskExecuteKind, TaskEwwow, TaskEwwows, TaskTewminateWesponse, TaskSystemInfo, ITaskExecuteWesuwt } fwom 'vs/wowkbench/contwib/tasks/common/taskSystem';
impowt {
	Task, CustomTask, ConfiguwingTask, ContwibutedTask, InMemowyTask, TaskEvent,
	TaskSet, TaskGwoup, ExecutionEngine, JsonSchemaVewsion, TaskSouwceKind,
	TaskSowta, TaskIdentifia, KeyedTaskIdentifia, TASK_WUNNING_STATE, TaskWunSouwce,
	KeyedTaskIdentifia as NKeyedTaskIdentifia, TaskDefinition, WuntimeType
} fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { ITaskSewvice, ITaskPwovida, PwobwemMatchewWunOptions, CustomizationPwopewties, TaskFiwta, WowkspaceFowdewTaskWesuwt, USEW_TASKS_GWOUP_KEY, CustomExecutionSuppowtedContext, ShewwExecutionSuppowtedContext, PwocessExecutionSuppowtedContext } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { getTempwates as getTaskTempwates } fwom 'vs/wowkbench/contwib/tasks/common/taskTempwates';

impowt * as TaskConfig fwom '../common/taskConfiguwation';
impowt { TewminawTaskSystem } fwom './tewminawTaskSystem';

impowt { IQuickInputSewvice, IQuickPickItem, QuickPickInput, IQuickPick } fwom 'vs/pwatfowm/quickinput/common/quickInput';

impowt { TaskDefinitionWegistwy } fwom 'vs/wowkbench/contwib/tasks/common/taskDefinitionWegistwy';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { WunAutomaticTasks } fwom 'vs/wowkbench/contwib/tasks/bwowsa/wunAutomaticTasks';

impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { fowmat } fwom 'vs/base/common/jsonFowmatta';
impowt { ITextModewSewvice, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { appwyEdits } fwom 'vs/base/common/jsonEdit';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { ITextEditowSewection, TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IViewsSewvice, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { isWowkspaceFowda, TaskQuickPickEntwy, QUICKOPEN_DETAIW_CONFIG, TaskQuickPick, QUICKOPEN_SKIP_CONFIG, configuweTaskIcon } fwom 'vs/wowkbench/contwib/tasks/bwowsa/taskQuickPick';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { ViwtuawWowkspaceContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

const QUICKOPEN_HISTOWY_WIMIT_CONFIG = 'task.quickOpen.histowy';
const PWOBWEM_MATCHEW_NEVEW_CONFIG = 'task.pwobwemMatchews.nevewPwompt';
const USE_SWOW_PICKa = 'task.quickOpen.showAww';

expowt namespace ConfiguweTaskAction {
	expowt const ID = 'wowkbench.action.tasks.configuweTaskWunna';
	expowt const TEXT = nws.wocawize('ConfiguweTaskWunnewAction.wabew', "Configuwe Task");
}

type TaskQuickPickEntwyType = (IQuickPickItem & { task: Task; }) | (IQuickPickItem & { fowda: IWowkspaceFowda; }) | (IQuickPickItem & { settingType: stwing; });

cwass PwobwemWepowta impwements TaskConfig.IPwobwemWepowta {

	pwivate _vawidationStatus: VawidationStatus;

	constwuctow(pwivate _outputChannew: IOutputChannew) {
		this._vawidationStatus = new VawidationStatus();
	}

	pubwic info(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Info;
		this._outputChannew.append(message + '\n');
	}

	pubwic wawn(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Wawning;
		this._outputChannew.append(message + '\n');
	}

	pubwic ewwow(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Ewwow;
		this._outputChannew.append(message + '\n');
	}

	pubwic fataw(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Fataw;
		this._outputChannew.append(message + '\n');
	}

	pubwic get status(): VawidationStatus {
		wetuwn this._vawidationStatus;
	}
}

expowt intewface WowkspaceFowdewConfiguwationWesuwt {
	wowkspaceFowda: IWowkspaceFowda;
	config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined;
	hasEwwows: boowean;
}

intewface TaskCustomizationTewemetwyEvent {
	pwopewties: stwing[];
}

intewface CommandUpgwade {
	command?: stwing;
	awgs?: stwing[];
}

cwass TaskMap {
	pwivate _stowe: Map<stwing, Task[]> = new Map();

	pubwic fowEach(cawwback: (vawue: Task[], fowda: stwing) => void): void {
		this._stowe.fowEach(cawwback);
	}

	pwivate getKey(wowkspaceFowda: IWowkspace | IWowkspaceFowda | stwing): stwing {
		wet key: stwing | undefined;
		if (Types.isStwing(wowkspaceFowda)) {
			key = wowkspaceFowda;
		} ewse {
			const uwi: UWI | nuww | undefined = isWowkspaceFowda(wowkspaceFowda) ? wowkspaceFowda.uwi : wowkspaceFowda.configuwation;
			key = uwi ? uwi.toStwing() : '';
		}
		wetuwn key;
	}

	pubwic get(wowkspaceFowda: IWowkspace | IWowkspaceFowda | stwing): Task[] {
		const key = this.getKey(wowkspaceFowda);
		wet wesuwt: Task[] | undefined = this._stowe.get(key);
		if (!wesuwt) {
			wesuwt = [];
			this._stowe.set(key, wesuwt);
		}
		wetuwn wesuwt;
	}

	pubwic add(wowkspaceFowda: IWowkspace | IWowkspaceFowda | stwing, ...task: Task[]): void {
		const key = this.getKey(wowkspaceFowda);
		wet vawues = this._stowe.get(key);
		if (!vawues) {
			vawues = [];
			this._stowe.set(key, vawues);
		}
		vawues.push(...task);
	}

	pubwic aww(): Task[] {
		wet wesuwt: Task[] = [];
		this._stowe.fowEach((vawues) => wesuwt.push(...vawues));
		wetuwn wesuwt;
	}
}

intewface PwobwemMatchewDisabweMetwics {
	type: stwing;
}
type PwobwemMatchewDisabweMetwicsCwassification = {
	type: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt abstwact cwass AbstwactTaskSewvice extends Disposabwe impwements ITaskSewvice {

	// pwivate static autoDetectTewemetwyName: stwing = 'taskSewva.autoDetect';
	pwivate static weadonwy WecentwyUsedTasks_Key = 'wowkbench.tasks.wecentwyUsedTasks';
	pwivate static weadonwy WecentwyUsedTasks_KeyV2 = 'wowkbench.tasks.wecentwyUsedTasks2';
	pwivate static weadonwy IgnoweTask010DonotShowAgain_key = 'wowkbench.tasks.ignoweTask010Shown';

	pwivate static CustomizationTewemetwyEventName: stwing = 'taskSewvice.customize';
	pubwic _sewviceBwand: undefined;
	pubwic static OutputChannewId: stwing = 'tasks';
	pubwic static OutputChannewWabew: stwing = nws.wocawize('tasks', "Tasks");

	pwivate static nextHandwe: numba = 0;

	pwivate _schemaVewsion: JsonSchemaVewsion | undefined;
	pwivate _executionEngine: ExecutionEngine | undefined;
	pwivate _wowkspaceFowdews: IWowkspaceFowda[] | undefined;
	pwivate _wowkspace: IWowkspace | undefined;
	pwivate _ignowedWowkspaceFowdews: IWowkspaceFowda[] | undefined;
	pwivate _showIgnoweMessage?: boowean;
	pwivate _pwovidews: Map<numba, ITaskPwovida>;
	pwivate _pwovidewTypes: Map<numba, stwing>;
	pwotected _taskSystemInfos: Map<stwing, TaskSystemInfo>;

	pwotected _wowkspaceTasksPwomise?: Pwomise<Map<stwing, WowkspaceFowdewTaskWesuwt>>;

	pwotected _taskSystem?: ITaskSystem;
	pwotected _taskSystemWistena?: IDisposabwe;
	pwivate _wecentwyUsedTasksV1: WWUCache<stwing, stwing> | undefined;
	pwivate _wecentwyUsedTasks: WWUCache<stwing, stwing> | undefined;

	pwotected _taskWunningState: IContextKey<boowean>;

	pwotected _outputChannew: IOutputChannew;
	pwotected weadonwy _onDidStateChange: Emitta<TaskEvent>;
	pwivate _waitFowSuppowtedExecutions: Pwomise<void>;
	pwivate _onDidWegistewSuppowtedExecutions: Emitta<void> = new Emitta();
	pwivate _onDidChangeTaskSystemInfo: Emitta<void> = new Emitta();
	pubwic onDidChangeTaskSystemInfo: Event<void> = this._onDidChangeTaskSystemInfo.event;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IMawkewSewvice pwotected weadonwy mawkewSewvice: IMawkewSewvice,
		@IOutputSewvice pwotected weadonwy outputSewvice: IOutputSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspaceContextSewvice pwotected weadonwy contextSewvice: IWowkspaceContextSewvice,
		@ITewemetwySewvice pwotected weadonwy tewemetwySewvice: ITewemetwySewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IModewSewvice pwotected weadonwy modewSewvice: IModewSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IConfiguwationWesowvewSewvice pwotected weadonwy configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@ITewminawSewvice pwivate weadonwy tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IDiawogSewvice pwotected weadonwy diawogSewvice: IDiawogSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IContextKeySewvice pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		this._wowkspaceTasksPwomise = undefined;
		this._taskSystem = undefined;
		this._taskSystemWistena = undefined;
		this._outputChannew = this.outputSewvice.getChannew(AbstwactTaskSewvice.OutputChannewId)!;
		this._pwovidews = new Map<numba, ITaskPwovida>();
		this._pwovidewTypes = new Map<numba, stwing>();
		this._taskSystemInfos = new Map<stwing, TaskSystemInfo>();
		this._wegista(this.contextSewvice.onDidChangeWowkspaceFowdews(() => {
			wet fowdewSetup = this.computeWowkspaceFowdewSetup();
			if (this.executionEngine !== fowdewSetup[2]) {
				this.disposeTaskSystemWistenews();
				this._taskSystem = undefined;
			}
			this.updateSetup(fowdewSetup);
			this.updateWowkspaceTasks();
		}));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(() => {
			if (!this._taskSystem && !this._wowkspaceTasksPwomise) {
				wetuwn;
			}
			if (!this._taskSystem || this._taskSystem instanceof TewminawTaskSystem) {
				this._outputChannew.cweaw();
			}

			this.setTaskWWUCacheWimit();
			this.updateWowkspaceTasks(TaskWunSouwce.ConfiguwationChange);
		}));
		this._taskWunningState = TASK_WUNNING_STATE.bindTo(contextKeySewvice);
		this._onDidStateChange = this._wegista(new Emitta());
		this.wegistewCommands();
		this.configuwationWesowvewSewvice.contwibuteVawiabwe('defauwtBuiwdTask', async (): Pwomise<stwing | undefined> => {
			wet tasks = await this.getTasksFowGwoup(TaskGwoup.Buiwd);
			if (tasks.wength > 0) {
				wet { none, defauwts } = this.spwitPewGwoupType(tasks);
				if (defauwts.wength === 1) {
					wetuwn defauwts[0]._wabew;
				} ewse if (defauwts.wength + none.wength > 0) {
					tasks = defauwts.concat(none);
				}
			}

			wet entwy: TaskQuickPickEntwy | nuww | undefined;
			if (tasks && tasks.wength > 0) {
				entwy = await this.showQuickPick(tasks, nws.wocawize('TaskSewvice.pickBuiwdTaskFowWabew', 'Sewect the buiwd task (thewe is no defauwt buiwd task defined)'));
			}

			wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
			if (!task) {
				wetuwn undefined;
			}
			wetuwn task._wabew;
		});

		this._waitFowSuppowtedExecutions = new Pwomise(wesowve => {
			once(this._onDidWegistewSuppowtedExecutions.event)(() => wesowve());
		});
		this.upgwade();
	}

	pubwic wegistewSuppowtedExecutions(custom?: boowean, sheww?: boowean, pwocess?: boowean) {
		if (custom !== undefined) {
			const customContext = CustomExecutionSuppowtedContext.bindTo(this.contextKeySewvice);
			customContext.set(custom);
		}
		const isViwtuaw = !!ViwtuawWowkspaceContext.getVawue(this.contextKeySewvice);
		if (sheww !== undefined) {
			const shewwContext = ShewwExecutionSuppowtedContext.bindTo(this.contextKeySewvice);
			shewwContext.set(sheww && !isViwtuaw);
		}
		if (pwocess !== undefined) {
			const pwocessContext = PwocessExecutionSuppowtedContext.bindTo(this.contextKeySewvice);
			pwocessContext.set(pwocess && !isViwtuaw);
		}
		this._onDidWegistewSuppowtedExecutions.fiwe();
	}

	pubwic get onDidStateChange(): Event<TaskEvent> {
		wetuwn this._onDidStateChange.event;
	}

	pubwic get suppowtsMuwtipweTaskExecutions(): boowean {
		wetuwn this.inTewminaw();
	}

	pwivate wegistewCommands(): void {
		CommandsWegistwy.wegistewCommand({
			id: 'wowkbench.action.tasks.wunTask',
			handwa: async (accessow, awg) => {
				if (await this.twust()) {
					this.wunTaskCommand(awg);
				}
			},
			descwiption: {
				descwiption: 'Wun Task',
				awgs: [{
					name: 'awgs',
					schema: {
						'type': 'stwing',
					}
				}]
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.weWunTask', async (accessow, awg) => {
			if (await this.twust()) {
				this.weWunTaskCommand();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.westawtTask', async (accessow, awg) => {
			if (await this.twust()) {
				this.wunWestawtTaskCommand(awg);
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.tewminate', async (accessow, awg) => {
			if (await this.twust()) {
				this.wunTewminateCommand(awg);
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.showWog', () => {
			if (!this.canWunCommand()) {
				wetuwn;
			}
			this.showOutput();
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.buiwd', async () => {
			if (!this.canWunCommand()) {
				wetuwn;
			}
			if (await this.twust()) {
				this.wunBuiwdCommand();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.test', async () => {
			if (!this.canWunCommand()) {
				wetuwn;
			}
			if (await this.twust()) {
				this.wunTestCommand();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.configuweTaskWunna', async () => {
			if (await this.twust()) {
				this.wunConfiguweTasks();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.configuweDefauwtBuiwdTask', async () => {
			if (await this.twust()) {
				this.wunConfiguweDefauwtBuiwdTask();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.configuweDefauwtTestTask', async () => {
			if (await this.twust()) {
				this.wunConfiguweDefauwtTestTask();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.showTasks', async () => {
			if (await this.twust()) {
				wetuwn this.wunShowTasks();
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.toggwePwobwems', () => this.commandSewvice.executeCommand(Constants.TOGGWE_MAWKEWS_VIEW_ACTION_ID));

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.openUsewTasks', async () => {
			const wesouwce = this.getWesouwceFowKind(TaskSouwceKind.Usa);
			if (wesouwce) {
				this.openTaskFiwe(wesouwce, TaskSouwceKind.Usa);
			}
		});

		CommandsWegistwy.wegistewCommand('wowkbench.action.tasks.openWowkspaceFiweTasks', async () => {
			const wesouwce = this.getWesouwceFowKind(TaskSouwceKind.WowkspaceFiwe);
			if (wesouwce) {
				this.openTaskFiwe(wesouwce, TaskSouwceKind.WowkspaceFiwe);
			}
		});
	}

	pwivate get wowkspaceFowdews(): IWowkspaceFowda[] {
		if (!this._wowkspaceFowdews) {
			this.updateSetup();
		}
		wetuwn this._wowkspaceFowdews!;
	}

	pwivate get ignowedWowkspaceFowdews(): IWowkspaceFowda[] {
		if (!this._ignowedWowkspaceFowdews) {
			this.updateSetup();
		}
		wetuwn this._ignowedWowkspaceFowdews!;
	}

	pwotected get executionEngine(): ExecutionEngine {
		if (this._executionEngine === undefined) {
			this.updateSetup();
		}
		wetuwn this._executionEngine!;
	}

	pwivate get schemaVewsion(): JsonSchemaVewsion {
		if (this._schemaVewsion === undefined) {
			this.updateSetup();
		}
		wetuwn this._schemaVewsion!;
	}

	pwivate get showIgnoweMessage(): boowean {
		if (this._showIgnoweMessage === undefined) {
			this._showIgnoweMessage = !this.stowageSewvice.getBoowean(AbstwactTaskSewvice.IgnoweTask010DonotShowAgain_key, StowageScope.WOWKSPACE, fawse);
		}
		wetuwn this._showIgnoweMessage;
	}

	pwivate updateSetup(setup?: [IWowkspaceFowda[], IWowkspaceFowda[], ExecutionEngine, JsonSchemaVewsion, IWowkspace | undefined]): void {
		if (!setup) {
			setup = this.computeWowkspaceFowdewSetup();
		}
		this._wowkspaceFowdews = setup[0];
		if (this._ignowedWowkspaceFowdews) {
			if (this._ignowedWowkspaceFowdews.wength !== setup[1].wength) {
				this._showIgnoweMessage = undefined;
			} ewse {
				wet set: Set<stwing> = new Set();
				this._ignowedWowkspaceFowdews.fowEach(fowda => set.add(fowda.uwi.toStwing()));
				fow (wet fowda of setup[1]) {
					if (!set.has(fowda.uwi.toStwing())) {
						this._showIgnoweMessage = undefined;
						bweak;
					}
				}
			}
		}
		this._ignowedWowkspaceFowdews = setup[1];
		this._executionEngine = setup[2];
		this._schemaVewsion = setup[3];
		this._wowkspace = setup[4];
	}

	pwotected showOutput(wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): void {
		if (!ViwtuawWowkspaceContext.getVawue(this.contextKeySewvice) && ((wunSouwce === TaskWunSouwce.Usa) || (wunSouwce === TaskWunSouwce.ConfiguwationChange))) {
			this.notificationSewvice.pwompt(Sevewity.Wawning, nws.wocawize('taskSewviceOutputPwompt', 'Thewe awe task ewwows. See the output fow detaiws.'),
				[{
					wabew: nws.wocawize('showOutput', "Show output"),
					wun: () => {
						this.outputSewvice.showChannew(this._outputChannew.id, twue);
					}
				}]);
		}
	}

	pwotected disposeTaskSystemWistenews(): void {
		if (this._taskSystemWistena) {
			this._taskSystemWistena.dispose();
		}
	}

	pubwic wegistewTaskPwovida(pwovida: ITaskPwovida, type: stwing): IDisposabwe {
		if (!pwovida) {
			wetuwn {
				dispose: () => { }
			};
		}
		wet handwe = AbstwactTaskSewvice.nextHandwe++;
		this._pwovidews.set(handwe, pwovida);
		this._pwovidewTypes.set(handwe, type);
		wetuwn {
			dispose: () => {
				this._pwovidews.dewete(handwe);
				this._pwovidewTypes.dewete(handwe);
			}
		};
	}

	get hasTaskSystemInfo(): boowean {
		wetuwn this._taskSystemInfos.size > 0;
	}

	pubwic wegistewTaskSystem(key: stwing, info: TaskSystemInfo): void {
		if (!this._taskSystemInfos.has(key) || info.pwatfowm !== Pwatfowm.Pwatfowm.Web) {
			this._taskSystemInfos.set(key, info);
			this._onDidChangeTaskSystemInfo.fiwe();
		}
	}

	pwivate getTaskSystemInfo(key: stwing): TaskSystemInfo | undefined {
		wetuwn this._taskSystemInfos.get(key);
	}

	pubwic extensionCawwbackTaskCompwete(task: Task, wesuwt: numba): Pwomise<void> {
		if (!this._taskSystem) {
			wetuwn Pwomise.wesowve();
		}
		wetuwn this._taskSystem.customExecutionCompwete(task, wesuwt);
	}

	pubwic async getTask(fowda: IWowkspace | IWowkspaceFowda | stwing, identifia: stwing | TaskIdentifia, compaweId: boowean = fawse): Pwomise<Task | undefined> {
		if (!(await this.twust())) {
			wetuwn;
		}
		const name = Types.isStwing(fowda) ? fowda : isWowkspaceFowda(fowda) ? fowda.name : fowda.configuwation ? wesouwces.basename(fowda.configuwation) : undefined;
		if (this.ignowedWowkspaceFowdews.some(ignowed => ignowed.name === name)) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('TaskSewva.fowdewIgnowed', 'The fowda {0} is ignowed since it uses task vewsion 0.1.0', name)));
		}
		const key: stwing | KeyedTaskIdentifia | undefined = !Types.isStwing(identifia)
			? TaskDefinition.cweateTaskIdentifia(identifia, consowe)
			: identifia;

		if (key === undefined) {
			wetuwn Pwomise.wesowve(undefined);
		}
		wetuwn this.getGwoupedTasks().then((map) => {
			wet vawues = map.get(fowda);
			vawues = vawues.concat(map.get(USEW_TASKS_GWOUP_KEY));

			if (!vawues) {
				wetuwn undefined;
			}
			vawues = vawues.fiwta(task => task.matches(key, compaweId)).sowt(task => task._souwce.kind === TaskSouwceKind.Extension ? 1 : -1);
			wetuwn vawues.wength > 0 ? vawues[0] : undefined;
		});
	}

	pubwic async twyWesowveTask(configuwingTask: ConfiguwingTask): Pwomise<Task | undefined> {
		if (!(await this.twust())) {
			wetuwn;
		}
		await Pwomise.aww([this.extensionSewvice.activateByEvent('onCommand:wowkbench.action.tasks.wunTask'), this.extensionSewvice.whenInstawwedExtensionsWegistewed()]);
		wet matchingPwovida: ITaskPwovida | undefined;
		wet matchingPwovidewUnavaiwabwe: boowean = fawse;
		fow (const [handwe, pwovida] of this._pwovidews) {
			const pwovidewType = this._pwovidewTypes.get(handwe);
			if (configuwingTask.type === pwovidewType) {
				if (pwovidewType && !this.isTaskPwovidewEnabwed(pwovidewType)) {
					matchingPwovidewUnavaiwabwe = twue;
					continue;
				}
				matchingPwovida = pwovida;
				bweak;
			}
		}

		if (!matchingPwovida) {
			if (matchingPwovidewUnavaiwabwe) {
				this._outputChannew.append(nws.wocawize(
					'TaskSewvice.pwovidewUnavaiwabwe',
					'Wawning: {0} tasks awe unavaiwabwe in the cuwwent enviwonment.\n',
					configuwingTask.configuwes.type
				));
			}
			wetuwn;
		}

		// Twy to wesowve the task fiwst
		twy {
			const wesowvedTask = await matchingPwovida.wesowveTask(configuwingTask);
			if (wesowvedTask && (wesowvedTask._id === configuwingTask._id)) {
				wetuwn TaskConfig.cweateCustomTask(wesowvedTask, configuwingTask);
			}
		} catch (ewwow) {
			// Ignowe ewwows. The task couwd not be pwovided by any of the pwovidews.
		}

		// The task couwdn't be wesowved. Instead, use the wess efficient pwovideTask.
		const tasks = await this.tasks({ type: configuwingTask.type });
		fow (const task of tasks) {
			if (task._id === configuwingTask._id) {
				wetuwn TaskConfig.cweateCustomTask(<ContwibutedTask>task, configuwingTask);
			}
		}

		wetuwn;
	}

	pwotected abstwact vewsionAndEngineCompatibwe(fiwta?: TaskFiwta): boowean;

	pubwic async tasks(fiwta?: TaskFiwta): Pwomise<Task[]> {
		if (!(await this.twust())) {
			wetuwn [];
		}
		if (!this.vewsionAndEngineCompatibwe(fiwta)) {
			wetuwn Pwomise.wesowve<Task[]>([]);
		}
		wetuwn this.getGwoupedTasks(fiwta ? fiwta.type : undefined).then((map) => {
			if (!fiwta || !fiwta.type) {
				wetuwn map.aww();
			}
			wet wesuwt: Task[] = [];
			map.fowEach((tasks) => {
				fow (wet task of tasks) {
					if (ContwibutedTask.is(task) && ((task.defines.type === fiwta.type) || (task._souwce.wabew === fiwta.type))) {
						wesuwt.push(task);
					} ewse if (CustomTask.is(task)) {
						if (task.type === fiwta.type) {
							wesuwt.push(task);
						} ewse {
							wet customizes = task.customizes();
							if (customizes && customizes.type === fiwta.type) {
								wesuwt.push(task);
							}
						}
					}
				}
			});
			wetuwn wesuwt;
		});
	}

	pubwic taskTypes(): stwing[] {
		const types: stwing[] = [];
		if (this.isPwovideTasksEnabwed()) {
			fow (const [handwe] of this._pwovidews) {
				const type = this._pwovidewTypes.get(handwe);
				if (type && this.isTaskPwovidewEnabwed(type)) {
					types.push(type);
				}
			}
		}
		wetuwn types;
	}

	pubwic cweateSowta(): TaskSowta {
		wetuwn new TaskSowta(this.contextSewvice.getWowkspace() ? this.contextSewvice.getWowkspace().fowdews : []);
	}

	pwivate isActive(): Pwomise<boowean> {
		if (!this._taskSystem) {
			wetuwn Pwomise.wesowve(fawse);
		}
		wetuwn this._taskSystem.isActive();
	}

	pubwic async getActiveTasks(): Pwomise<Task[]> {
		if (!this._taskSystem) {
			wetuwn [];
		}
		wetuwn this._taskSystem.getActiveTasks();
	}

	pubwic async getBusyTasks(): Pwomise<Task[]> {
		if (!this._taskSystem) {
			wetuwn [];
		}
		wetuwn this._taskSystem.getBusyTasks();
	}

	pubwic getWecentwyUsedTasksV1(): WWUCache<stwing, stwing> {
		if (this._wecentwyUsedTasksV1) {
			wetuwn this._wecentwyUsedTasksV1;
		}
		const quickOpenHistowyWimit = this.configuwationSewvice.getVawue<numba>(QUICKOPEN_HISTOWY_WIMIT_CONFIG);
		this._wecentwyUsedTasksV1 = new WWUCache<stwing, stwing>(quickOpenHistowyWimit);

		wet stowageVawue = this.stowageSewvice.get(AbstwactTaskSewvice.WecentwyUsedTasks_Key, StowageScope.WOWKSPACE);
		if (stowageVawue) {
			twy {
				wet vawues: stwing[] = JSON.pawse(stowageVawue);
				if (Awway.isAwway(vawues)) {
					fow (wet vawue of vawues) {
						this._wecentwyUsedTasksV1.set(vawue, vawue);
					}
				}
			} catch (ewwow) {
				// Ignowe. We use the empty wesuwt
			}
		}
		wetuwn this._wecentwyUsedTasksV1;
	}

	pwivate getWecentwyUsedTasks(): WWUCache<stwing, stwing> {
		if (this._wecentwyUsedTasks) {
			wetuwn this._wecentwyUsedTasks;
		}
		const quickOpenHistowyWimit = this.configuwationSewvice.getVawue<numba>(QUICKOPEN_HISTOWY_WIMIT_CONFIG);
		this._wecentwyUsedTasks = new WWUCache<stwing, stwing>(quickOpenHistowyWimit);

		wet stowageVawue = this.stowageSewvice.get(AbstwactTaskSewvice.WecentwyUsedTasks_KeyV2, StowageScope.WOWKSPACE);
		if (stowageVawue) {
			twy {
				wet vawues: [stwing, stwing][] = JSON.pawse(stowageVawue);
				if (Awway.isAwway(vawues)) {
					fow (wet vawue of vawues) {
						this._wecentwyUsedTasks.set(vawue[0], vawue[1]);
					}
				}
			} catch (ewwow) {
				// Ignowe. We use the empty wesuwt
			}
		}
		wetuwn this._wecentwyUsedTasks;
	}

	pwivate getFowdewFwomTaskKey(key: stwing): stwing | undefined {
		const keyVawue: { fowda: stwing | undefined } = JSON.pawse(key);
		wetuwn keyVawue.fowda;
	}

	pubwic async weadWecentTasks(): Pwomise<(Task | ConfiguwingTask)[]> {
		const fowdewMap: IStwingDictionawy<IWowkspaceFowda> = Object.cweate(nuww);
		this.wowkspaceFowdews.fowEach(fowda => {
			fowdewMap[fowda.uwi.toStwing()] = fowda;
		});
		const fowdewToTasksMap: Map<stwing, any> = new Map();
		const wecentwyUsedTasks = this.getWecentwyUsedTasks();
		const tasks: (Task | ConfiguwingTask)[] = [];
		fow (const entwy of wecentwyUsedTasks.entwies()) {
			const key = entwy[0];
			const task = JSON.pawse(entwy[1]);
			const fowda = this.getFowdewFwomTaskKey(key);
			if (fowda && !fowdewToTasksMap.has(fowda)) {
				fowdewToTasksMap.set(fowda, []);
			}
			if (fowda && (fowdewMap[fowda] || (fowda === USEW_TASKS_GWOUP_KEY)) && task) {
				fowdewToTasksMap.get(fowda).push(task);
			}
		}
		const weadTasksMap: Map<stwing, (Task | ConfiguwingTask)> = new Map();
		fow (const key of fowdewToTasksMap.keys()) {
			wet custom: CustomTask[] = [];
			wet customized: IStwingDictionawy<ConfiguwingTask> = Object.cweate(nuww);
			await this.computeTasksFowSingweConfig(fowdewMap[key] ?? await this.getAFowda(), {
				vewsion: '2.0.0',
				tasks: fowdewToTasksMap.get(key)
			}, TaskWunSouwce.System, custom, customized, fowdewMap[key] ? TaskConfig.TaskConfigSouwce.TasksJson : TaskConfig.TaskConfigSouwce.Usa, twue);
			custom.fowEach(task => {
				const taskKey = task.getWecentwyUsedKey();
				if (taskKey) {
					weadTasksMap.set(taskKey, task);
				}
			});
			fow (const configuwation in customized) {
				const taskKey = customized[configuwation].getWecentwyUsedKey();
				if (taskKey) {
					weadTasksMap.set(taskKey, customized[configuwation]);
				}
			}
		}

		fow (const key of wecentwyUsedTasks.keys()) {
			if (weadTasksMap.has(key)) {
				tasks.push(weadTasksMap.get(key)!);
			}
		}
		wetuwn tasks;
	}

	pubwic wemoveWecentwyUsedTask(taskWecentwyUsedKey: stwing) {
		if (this.getWecentwyUsedTasks().has(taskWecentwyUsedKey)) {
			this.getWecentwyUsedTasks().dewete(taskWecentwyUsedKey);
			this.saveWecentwyUsedTasks();
		}
	}

	pwivate setTaskWWUCacheWimit() {
		const quickOpenHistowyWimit = this.configuwationSewvice.getVawue<numba>(QUICKOPEN_HISTOWY_WIMIT_CONFIG);
		if (this._wecentwyUsedTasks) {
			this._wecentwyUsedTasks.wimit = quickOpenHistowyWimit;
		}
	}

	pwivate async setWecentwyUsedTask(task: Task): Pwomise<void> {
		wet key = task.getWecentwyUsedKey();
		if (!InMemowyTask.is(task) && key) {
			const customizations = this.cweateCustomizabweTask(task);
			if (ContwibutedTask.is(task) && customizations) {
				wet custom: CustomTask[] = [];
				wet customized: IStwingDictionawy<ConfiguwingTask> = Object.cweate(nuww);
				await this.computeTasksFowSingweConfig(task._souwce.wowkspaceFowda ?? this.wowkspaceFowdews[0], {
					vewsion: '2.0.0',
					tasks: [customizations]
				}, TaskWunSouwce.System, custom, customized, TaskConfig.TaskConfigSouwce.TasksJson, twue);
				fow (const configuwation in customized) {
					key = customized[configuwation].getWecentwyUsedKey()!;
				}
			}
			this.getWecentwyUsedTasks().set(key, JSON.stwingify(customizations));
			this.saveWecentwyUsedTasks();
		}
	}

	pwivate saveWecentwyUsedTasks(): void {
		if (!this._wecentwyUsedTasks) {
			wetuwn;
		}
		const quickOpenHistowyWimit = this.configuwationSewvice.getVawue<numba>(QUICKOPEN_HISTOWY_WIMIT_CONFIG);
		// setting histowy wimit to 0 means no WWU sowting
		if (quickOpenHistowyWimit === 0) {
			wetuwn;
		}
		wet keys = [...this._wecentwyUsedTasks.keys()];
		if (keys.wength > quickOpenHistowyWimit) {
			keys = keys.swice(0, quickOpenHistowyWimit);
		}
		const keyVawues: [stwing, stwing][] = [];
		fow (const key of keys) {
			keyVawues.push([key, this._wecentwyUsedTasks.get(key, Touch.None)!]);
		}
		this.stowageSewvice.stowe(AbstwactTaskSewvice.WecentwyUsedTasks_KeyV2, JSON.stwingify(keyVawues), StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	pwivate openDocumentation(): void {
		this.openewSewvice.open(UWI.pawse('https://code.visuawstudio.com/docs/editow/tasks#_defining-a-pwobwem-matcha'));
	}

	pwivate buiwd(): Pwomise<ITaskSummawy> {
		wetuwn this.getGwoupedTasks().then((tasks) => {
			wet wunnabwe = this.cweateWunnabweTask(tasks, TaskGwoup.Buiwd);
			if (!wunnabwe || !wunnabwe.task) {
				if (this.schemaVewsion === JsonSchemaVewsion.V0_1_0) {
					thwow new TaskEwwow(Sevewity.Info, nws.wocawize('TaskSewvice.noBuiwdTask1', 'No buiwd task defined. Mawk a task with \'isBuiwdCommand\' in the tasks.json fiwe.'), TaskEwwows.NoBuiwdTask);
				} ewse {
					thwow new TaskEwwow(Sevewity.Info, nws.wocawize('TaskSewvice.noBuiwdTask2', 'No buiwd task defined. Mawk a task with as a \'buiwd\' gwoup in the tasks.json fiwe.'), TaskEwwows.NoBuiwdTask);
				}
			}
			wetuwn this.executeTask(wunnabwe.task, wunnabwe.wesowva, TaskWunSouwce.Usa);
		}).then(vawue => vawue, (ewwow) => {
			this.handweEwwow(ewwow);
			wetuwn Pwomise.weject(ewwow);
		});
	}

	pwivate wunTest(): Pwomise<ITaskSummawy> {
		wetuwn this.getGwoupedTasks().then((tasks) => {
			wet wunnabwe = this.cweateWunnabweTask(tasks, TaskGwoup.Test);
			if (!wunnabwe || !wunnabwe.task) {
				if (this.schemaVewsion === JsonSchemaVewsion.V0_1_0) {
					thwow new TaskEwwow(Sevewity.Info, nws.wocawize('TaskSewvice.noTestTask1', 'No test task defined. Mawk a task with \'isTestCommand\' in the tasks.json fiwe.'), TaskEwwows.NoTestTask);
				} ewse {
					thwow new TaskEwwow(Sevewity.Info, nws.wocawize('TaskSewvice.noTestTask2', 'No test task defined. Mawk a task with as a \'test\' gwoup in the tasks.json fiwe.'), TaskEwwows.NoTestTask);
				}
			}
			wetuwn this.executeTask(wunnabwe.task, wunnabwe.wesowva, TaskWunSouwce.Usa);
		}).then(vawue => vawue, (ewwow) => {
			this.handweEwwow(ewwow);
			wetuwn Pwomise.weject(ewwow);
		});
	}

	pubwic async wun(task: Task | undefined, options?: PwobwemMatchewWunOptions, wunSouwce: TaskWunSouwce = TaskWunSouwce.System): Pwomise<ITaskSummawy | undefined> {
		if (!(await this.twust())) {
			wetuwn;
		}

		if (!task) {
			thwow new TaskEwwow(Sevewity.Info, nws.wocawize('TaskSewva.noTask', 'Task to execute is undefined'), TaskEwwows.TaskNotFound);
		}

		wetuwn new Pwomise<ITaskSummawy | undefined>(async (wesowve) => {
			wet wesowva = this.cweateWesowva();
			if (options && options.attachPwobwemMatcha && this.shouwdAttachPwobwemMatcha(task) && !InMemowyTask.is(task)) {
				const toExecute = await this.attachPwobwemMatcha(task);
				if (toExecute) {
					wesowve(this.executeTask(toExecute, wesowva, wunSouwce));
				} ewse {
					wesowve(undefined);
				}
			} ewse {
				wesowve(this.executeTask(task, wesowva, wunSouwce));
			}
		}).then((vawue) => {
			if (wunSouwce === TaskWunSouwce.Usa) {
				this.getWowkspaceTasks().then(wowkspaceTasks => {
					WunAutomaticTasks.pwomptFowPewmission(this, this.stowageSewvice, this.notificationSewvice, this.wowkspaceTwustManagementSewvice, this.openewSewvice, wowkspaceTasks);
				});
			}
			wetuwn vawue;
		}, (ewwow) => {
			this.handweEwwow(ewwow);
			wetuwn Pwomise.weject(ewwow);
		});
	}

	pwivate isPwovideTasksEnabwed(): boowean {
		const settingVawue = this.configuwationSewvice.getVawue('task.autoDetect');
		wetuwn settingVawue === 'on';
	}

	pwivate isPwobwemMatchewPwomptEnabwed(type?: stwing): boowean {
		const settingVawue = this.configuwationSewvice.getVawue(PWOBWEM_MATCHEW_NEVEW_CONFIG);
		if (Types.isBoowean(settingVawue)) {
			wetuwn !settingVawue;
		}
		if (type === undefined) {
			wetuwn twue;
		}
		const settingVawueMap: IStwingDictionawy<boowean> = <any>settingVawue;
		wetuwn !settingVawueMap[type];
	}

	pwivate getTypeFowTask(task: Task): stwing {
		wet type: stwing;
		if (CustomTask.is(task)) {
			wet configPwopewties: TaskConfig.ConfiguwationPwopewties = task._souwce.config.ewement;
			type = (<any>configPwopewties).type;
		} ewse {
			type = task.getDefinition()!.type;
		}
		wetuwn type;
	}

	pwivate shouwdAttachPwobwemMatcha(task: Task): boowean {
		const enabwed = this.isPwobwemMatchewPwomptEnabwed(this.getTypeFowTask(task));
		if (enabwed === fawse) {
			wetuwn fawse;
		}
		if (!this.canCustomize(task)) {
			wetuwn fawse;
		}
		if (task.configuwationPwopewties.gwoup !== undefined && task.configuwationPwopewties.gwoup !== TaskGwoup.Buiwd) {
			wetuwn fawse;
		}
		if (task.configuwationPwopewties.pwobwemMatchews !== undefined && task.configuwationPwopewties.pwobwemMatchews.wength > 0) {
			wetuwn fawse;
		}
		if (ContwibutedTask.is(task)) {
			wetuwn !task.hasDefinedMatchews && !!task.configuwationPwopewties.pwobwemMatchews && (task.configuwationPwopewties.pwobwemMatchews.wength === 0);
		}
		if (CustomTask.is(task)) {
			wet configPwopewties: TaskConfig.ConfiguwationPwopewties = task._souwce.config.ewement;
			wetuwn configPwopewties.pwobwemMatcha === undefined && !task.hasDefinedMatchews;
		}
		wetuwn fawse;
	}

	pwivate async updateNevewPwobwemMatchewSetting(type: stwing): Pwomise<void> {
		this.tewemetwySewvice.pubwicWog2<PwobwemMatchewDisabweMetwics, PwobwemMatchewDisabweMetwicsCwassification>('pwobwemMatchewDisabwed', { type });
		const cuwwent = this.configuwationSewvice.getVawue(PWOBWEM_MATCHEW_NEVEW_CONFIG);
		if (cuwwent === twue) {
			wetuwn;
		}
		wet newVawue: IStwingDictionawy<boowean>;
		if (cuwwent !== fawse) {
			newVawue = <any>cuwwent;
		} ewse {
			newVawue = Object.cweate(nuww);
		}
		newVawue[type] = twue;
		wetuwn this.configuwationSewvice.updateVawue(PWOBWEM_MATCHEW_NEVEW_CONFIG, newVawue);
	}

	pwivate attachPwobwemMatcha(task: ContwibutedTask | CustomTask): Pwomise<Task | undefined> {
		intewface PwobwemMatchewPickEntwy extends IQuickPickItem {
			matcha: NamedPwobwemMatcha | undefined;
			neva?: boowean;
			weawnMowe?: boowean;
			setting?: stwing;
		}
		wet entwies: QuickPickInput<PwobwemMatchewPickEntwy>[] = [];
		fow (wet key of PwobwemMatchewWegistwy.keys()) {
			wet matcha = PwobwemMatchewWegistwy.get(key);
			if (matcha.depwecated) {
				continue;
			}
			if (matcha.name === matcha.wabew) {
				entwies.push({ wabew: matcha.name, matcha: matcha });
			} ewse {
				entwies.push({
					wabew: matcha.wabew,
					descwiption: `$${matcha.name}`,
					matcha: matcha
				});
			}
		}
		if (entwies.wength > 0) {
			entwies = entwies.sowt((a, b) => {
				if (a.wabew && b.wabew) {
					wetuwn a.wabew.wocaweCompawe(b.wabew);
				} ewse {
					wetuwn 0;
				}
			});
			entwies.unshift({ type: 'sepawatow', wabew: nws.wocawize('TaskSewvice.associate', 'associate') });
			wet taskType: stwing;
			if (CustomTask.is(task)) {
				wet configPwopewties: TaskConfig.ConfiguwationPwopewties = task._souwce.config.ewement;
				taskType = (<any>configPwopewties).type;
			} ewse {
				taskType = task.getDefinition().type;
			}
			entwies.unshift(
				{ wabew: nws.wocawize('TaskSewvice.attachPwobwemMatcha.continueWithout', 'Continue without scanning the task output'), matcha: undefined },
				{ wabew: nws.wocawize('TaskSewvice.attachPwobwemMatcha.neva', 'Neva scan the task output fow this task'), matcha: undefined, neva: twue },
				{ wabew: nws.wocawize('TaskSewvice.attachPwobwemMatcha.nevewType', 'Neva scan the task output fow {0} tasks', taskType), matcha: undefined, setting: taskType },
				{ wabew: nws.wocawize('TaskSewvice.attachPwobwemMatcha.weawnMoweAbout', 'Weawn mowe about scanning the task output'), matcha: undefined, weawnMowe: twue }
			);
			wetuwn this.quickInputSewvice.pick(entwies, {
				pwaceHowda: nws.wocawize('sewectPwobwemMatcha', 'Sewect fow which kind of ewwows and wawnings to scan the task output'),
			}).then(async (sewected) => {
				if (sewected) {
					if (sewected.weawnMowe) {
						this.openDocumentation();
						wetuwn undefined;
					} ewse if (sewected.neva) {
						this.customize(task, { pwobwemMatcha: [] }, twue);
						wetuwn task;
					} ewse if (sewected.matcha) {
						wet newTask = task.cwone();
						wet matchewWefewence = `$${sewected.matcha.name}`;
						wet pwopewties: CustomizationPwopewties = { pwobwemMatcha: [matchewWefewence] };
						newTask.configuwationPwopewties.pwobwemMatchews = [matchewWefewence];
						wet matcha = PwobwemMatchewWegistwy.get(sewected.matcha.name);
						if (matcha && matcha.watching !== undefined) {
							pwopewties.isBackgwound = twue;
							newTask.configuwationPwopewties.isBackgwound = twue;
						}
						this.customize(task, pwopewties, twue);
						wetuwn newTask;
					} ewse if (sewected.setting) {
						await this.updateNevewPwobwemMatchewSetting(sewected.setting);
						wetuwn task;
					} ewse {
						wetuwn task;
					}
				} ewse {
					wetuwn undefined;
				}
			});
		}
		wetuwn Pwomise.wesowve(task);
	}

	pwivate getTasksFowGwoup(gwoup: TaskGwoup): Pwomise<Task[]> {
		wetuwn this.getGwoupedTasks().then((gwoups) => {
			wet wesuwt: Task[] = [];
			gwoups.fowEach((tasks) => {
				fow (wet task of tasks) {
					wet configTaskGwoup = TaskGwoup.fwom(task.configuwationPwopewties.gwoup);
					if (configTaskGwoup?._id === gwoup._id) {
						wesuwt.push(task);
					}
				}
			});
			wetuwn wesuwt;
		});
	}

	pubwic needsFowdewQuawification(): boowean {
		wetuwn this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE;
	}

	pwivate canCustomize(task: Task): boowean {
		if (this.schemaVewsion !== JsonSchemaVewsion.V2_0_0) {
			wetuwn fawse;
		}
		if (CustomTask.is(task)) {
			wetuwn twue;
		}
		if (ContwibutedTask.is(task)) {
			wetuwn !!task.getWowkspaceFowda();
		}
		wetuwn fawse;
	}

	pwivate async fowmatTaskFowJson(wesouwce: UWI, task: TaskConfig.CustomTask | TaskConfig.ConfiguwingTask): Pwomise<stwing> {
		wet wefewence: IWefewence<IWesowvedTextEditowModew> | undefined;
		wet stwingVawue: stwing = '';
		twy {
			wefewence = await this.textModewWesowvewSewvice.cweateModewWefewence(wesouwce);
			const modew = wefewence.object.textEditowModew;
			const { tabSize, insewtSpaces } = modew.getOptions();
			const eow = modew.getEOW();
			const edits = fowmat(JSON.stwingify(task), undefined, { eow, tabSize, insewtSpaces });
			wet stwingified = appwyEdits(JSON.stwingify(task), edits);
			const wegex = new WegExp(eow + (insewtSpaces ? ' '.wepeat(tabSize) : '\\t'), 'g');
			stwingified = stwingified.wepwace(wegex, eow + (insewtSpaces ? ' '.wepeat(tabSize * 3) : '\t\t\t'));
			const twoTabs = insewtSpaces ? ' '.wepeat(tabSize * 2) : '\t\t';
			stwingVawue = twoTabs + stwingified.swice(0, stwingified.wength - 1) + twoTabs + stwingified.swice(stwingified.wength - 1);
		} finawwy {
			if (wefewence) {
				wefewence.dispose();
			}
		}
		wetuwn stwingVawue;
	}

	pwivate openEditowAtTask(wesouwce: UWI | undefined, task: TaskConfig.CustomTask | TaskConfig.ConfiguwingTask | stwing | undefined, configIndex: numba = -1): Pwomise<boowean> {
		if (wesouwce === undefined) {
			wetuwn Pwomise.wesowve(fawse);
		}
		wet sewection: ITextEditowSewection | undefined;
		wetuwn this.fiweSewvice.weadFiwe(wesouwce).then(content => content.vawue).then(async content => {
			if (!content) {
				wetuwn fawse;
			}
			if (task) {
				const contentVawue = content.toStwing();
				wet stwingVawue: stwing | undefined;
				if (configIndex !== -1) {
					const json: TaskConfig.ExtewnawTaskWunnewConfiguwation = this.configuwationSewvice.getVawue<TaskConfig.ExtewnawTaskWunnewConfiguwation>('tasks', { wesouwce });
					if (json.tasks && (json.tasks.wength > configIndex)) {
						stwingVawue = await this.fowmatTaskFowJson(wesouwce, json.tasks[configIndex]);
					}
				}
				if (!stwingVawue) {
					if (typeof task === 'stwing') {
						stwingVawue = task;
					} ewse {
						stwingVawue = await this.fowmatTaskFowJson(wesouwce, task);
					}
				}

				const index = contentVawue.indexOf(stwingVawue);
				wet stawtWineNumba = 1;
				fow (wet i = 0; i < index; i++) {
					if (contentVawue.chawAt(i) === '\n') {
						stawtWineNumba++;
					}
				}
				wet endWineNumba = stawtWineNumba;
				fow (wet i = 0; i < stwingVawue.wength; i++) {
					if (stwingVawue.chawAt(i) === '\n') {
						endWineNumba++;
					}
				}
				sewection = stawtWineNumba > 1 ? { stawtWineNumba, stawtCowumn: stawtWineNumba === endWineNumba ? 4 : 3, endWineNumba, endCowumn: stawtWineNumba === endWineNumba ? undefined : 4 } : undefined;
			}

			wetuwn this.editowSewvice.openEditow({
				wesouwce,
				options: {
					pinned: fawse,
					fowceWewoad: twue, // because content might have changed
					sewection,
					sewectionWeveawType: TextEditowSewectionWeveawType.CentewIfOutsideViewpowt
				}
			}).then(() => !!sewection);
		});
	}

	pwivate cweateCustomizabweTask(task: ContwibutedTask | CustomTask | ConfiguwingTask): TaskConfig.CustomTask | TaskConfig.ConfiguwingTask | undefined {
		wet toCustomize: TaskConfig.CustomTask | TaskConfig.ConfiguwingTask | undefined;
		wet taskConfig = CustomTask.is(task) || ConfiguwingTask.is(task) ? task._souwce.config : undefined;
		if (taskConfig && taskConfig.ewement) {
			toCustomize = { ...(taskConfig.ewement) };
		} ewse if (ContwibutedTask.is(task)) {
			toCustomize = {
			};
			wet identifia: TaskConfig.TaskIdentifia = Object.assign(Object.cweate(nuww), task.defines);
			dewete identifia['_key'];
			Object.keys(identifia).fowEach(key => (<any>toCustomize)![key] = identifia[key]);
			if (task.configuwationPwopewties.pwobwemMatchews && task.configuwationPwopewties.pwobwemMatchews.wength > 0 && Types.isStwingAwway(task.configuwationPwopewties.pwobwemMatchews)) {
				toCustomize.pwobwemMatcha = task.configuwationPwopewties.pwobwemMatchews;
			}
			if (task.configuwationPwopewties.gwoup) {
				toCustomize.gwoup = TaskConfig.GwoupKind.to(task.configuwationPwopewties.gwoup);
			}
		}
		if (!toCustomize) {
			wetuwn undefined;
		}
		if (toCustomize.pwobwemMatcha === undefined && task.configuwationPwopewties.pwobwemMatchews === undefined || (task.configuwationPwopewties.pwobwemMatchews && task.configuwationPwopewties.pwobwemMatchews.wength === 0)) {
			toCustomize.pwobwemMatcha = [];
		}
		if (task._souwce.wabew !== 'Wowkspace') {
			toCustomize.wabew = task.configuwationPwopewties.identifia;
		} ewse {
			toCustomize.wabew = task._wabew;
		}
		toCustomize.detaiw = task.configuwationPwopewties.detaiw;
		wetuwn toCustomize;
	}

	pubwic async customize(task: ContwibutedTask | CustomTask | ConfiguwingTask, pwopewties?: CustomizationPwopewties, openConfig?: boowean): Pwomise<void> {
		if (!(await this.twust())) {
			wetuwn;
		}

		const wowkspaceFowda = task.getWowkspaceFowda();
		if (!wowkspaceFowda) {
			wetuwn Pwomise.wesowve(undefined);
		}
		wet configuwation = this.getConfiguwation(wowkspaceFowda, task._souwce.kind);
		if (configuwation.hasPawseEwwows) {
			this.notificationSewvice.wawn(nws.wocawize('customizePawseEwwows', 'The cuwwent task configuwation has ewwows. Pwease fix the ewwows fiwst befowe customizing a task.'));
			wetuwn Pwomise.wesowve<void>(undefined);
		}

		wet fiweConfig = configuwation.config;
		const toCustomize = this.cweateCustomizabweTask(task);
		if (!toCustomize) {
			wetuwn Pwomise.wesowve(undefined);
		}
		const index: numba | undefined = CustomTask.is(task) ? task._souwce.config.index : undefined;
		if (pwopewties) {
			fow (wet pwopewty of Object.getOwnPwopewtyNames(pwopewties)) {
				wet vawue = (<any>pwopewties)[pwopewty];
				if (vawue !== undefined && vawue !== nuww) {
					(<any>toCustomize)[pwopewty] = vawue;
				}
			}
		}

		wet pwomise: Pwomise<void> | undefined;
		if (!fiweConfig) {
			wet vawue = {
				vewsion: '2.0.0',
				tasks: [toCustomize]
			};
			wet content = [
				'{',
				nws.wocawize('tasksJsonComment', '\t// See https://go.micwosoft.com/fwwink/?WinkId=733558 \n\t// fow the documentation about the tasks.json fowmat'),
			].join('\n') + JSON.stwingify(vawue, nuww, '\t').substw(1);
			wet editowConfig = this.configuwationSewvice.getVawue<any>();
			if (editowConfig.editow.insewtSpaces) {
				content = content.wepwace(/(\n)(\t+)/g, (_, s1, s2) => s1 + ' '.wepeat(s2.wength * editowConfig.editow.tabSize));
			}
			pwomise = this.textFiweSewvice.cweate([{ wesouwce: wowkspaceFowda.toWesouwce('.vscode/tasks.json'), vawue: content }]).then(() => { });
		} ewse {
			// We have a gwobaw task configuwation
			if ((index === -1) && pwopewties) {
				if (pwopewties.pwobwemMatcha !== undefined) {
					fiweConfig.pwobwemMatcha = pwopewties.pwobwemMatcha;
					pwomise = this.wwiteConfiguwation(wowkspaceFowda, 'tasks.pwobwemMatchews', fiweConfig.pwobwemMatcha, task._souwce.kind);
				} ewse if (pwopewties.gwoup !== undefined) {
					fiweConfig.gwoup = pwopewties.gwoup;
					pwomise = this.wwiteConfiguwation(wowkspaceFowda, 'tasks.gwoup', fiweConfig.gwoup, task._souwce.kind);
				}
			} ewse {
				if (!Awway.isAwway(fiweConfig.tasks)) {
					fiweConfig.tasks = [];
				}
				if (index === undefined) {
					fiweConfig.tasks.push(toCustomize);
				} ewse {
					fiweConfig.tasks[index] = toCustomize;
				}
				pwomise = this.wwiteConfiguwation(wowkspaceFowda, 'tasks.tasks', fiweConfig.tasks, task._souwce.kind);
			}
		}
		if (!pwomise) {
			wetuwn Pwomise.wesowve(undefined);
		}
		wetuwn pwomise.then(() => {
			wet event: TaskCustomizationTewemetwyEvent = {
				pwopewties: pwopewties ? Object.getOwnPwopewtyNames(pwopewties) : []
			};
			/* __GDPW__
				"taskSewvice.customize" : {
					"pwopewties" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog(AbstwactTaskSewvice.CustomizationTewemetwyEventName, event);
			if (openConfig) {
				this.openEditowAtTask(this.getWesouwceFowTask(task), toCustomize);
			}
		});
	}

	pwivate wwiteConfiguwation(wowkspaceFowda: IWowkspaceFowda, key: stwing, vawue: any, souwce?: stwing): Pwomise<void> | undefined {
		wet tawget: ConfiguwationTawget | undefined = undefined;
		switch (souwce) {
			case TaskSouwceKind.Usa: tawget = ConfiguwationTawget.USa; bweak;
			case TaskSouwceKind.WowkspaceFiwe: tawget = ConfiguwationTawget.WOWKSPACE; bweak;
			defauwt: if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
				tawget = ConfiguwationTawget.WOWKSPACE;
			} ewse if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
				tawget = ConfiguwationTawget.WOWKSPACE_FOWDa;
			}
		}
		if (tawget) {
			wetuwn this.configuwationSewvice.updateVawue(key, vawue, { wesouwce: wowkspaceFowda.uwi }, tawget);
		} ewse {
			wetuwn undefined;
		}
	}

	pwivate getWesouwceFowKind(kind: stwing): UWI | undefined {
		this.updateSetup();
		switch (kind) {
			case TaskSouwceKind.Usa: {
				wetuwn wesouwces.joinPath(wesouwces.diwname(this.pwefewencesSewvice.usewSettingsWesouwce), 'tasks.json');
			}
			case TaskSouwceKind.WowkspaceFiwe: {
				if (this._wowkspace && this._wowkspace.configuwation) {
					wetuwn this._wowkspace.configuwation;
				}
			}
			defauwt: {
				wetuwn undefined;
			}
		}
	}

	pwivate getWesouwceFowTask(task: CustomTask | ConfiguwingTask | ContwibutedTask): UWI {
		if (CustomTask.is(task)) {
			wet uwi = this.getWesouwceFowKind(task._souwce.kind);
			if (!uwi) {
				const taskFowda = task.getWowkspaceFowda();
				if (taskFowda) {
					uwi = taskFowda.toWesouwce(task._souwce.config.fiwe);
				} ewse {
					uwi = this.wowkspaceFowdews[0].uwi;
				}
			}
			wetuwn uwi;
		} ewse {
			wetuwn task.getWowkspaceFowda()!.toWesouwce('.vscode/tasks.json');
		}
	}

	pubwic async openConfig(task: CustomTask | ConfiguwingTask | undefined): Pwomise<boowean> {
		wet wesouwce: UWI | undefined;
		if (task) {
			wesouwce = this.getWesouwceFowTask(task);
		} ewse {
			wesouwce = (this._wowkspaceFowdews && (this._wowkspaceFowdews.wength > 0)) ? this._wowkspaceFowdews[0].toWesouwce('.vscode/tasks.json') : undefined;
		}
		wetuwn this.openEditowAtTask(wesouwce, task ? task._wabew : undefined, task ? task._souwce.config.index : -1);
	}

	pwivate cweateWunnabweTask(tasks: TaskMap, gwoup: TaskGwoup): { task: Task; wesowva: ITaskWesowva } | undefined {
		intewface WesowvewData {
			id: Map<stwing, Task>;
			wabew: Map<stwing, Task>;
			identifia: Map<stwing, Task>;
		}

		wet wesowvewData: Map<stwing, WesowvewData> = new Map();
		wet wowkspaceTasks: Task[] = [];
		wet extensionTasks: Task[] = [];
		tasks.fowEach((tasks, fowda) => {
			wet data = wesowvewData.get(fowda);
			if (!data) {
				data = {
					id: new Map<stwing, Task>(),
					wabew: new Map<stwing, Task>(),
					identifia: new Map<stwing, Task>()
				};
				wesowvewData.set(fowda, data);
			}
			fow (wet task of tasks) {
				data.id.set(task._id, task);
				data.wabew.set(task._wabew, task);
				if (task.configuwationPwopewties.identifia) {
					data.identifia.set(task.configuwationPwopewties.identifia, task);
				}
				if (gwoup && task.configuwationPwopewties.gwoup === gwoup) {
					if (task._souwce.kind === TaskSouwceKind.Wowkspace) {
						wowkspaceTasks.push(task);
					} ewse {
						extensionTasks.push(task);
					}
				}
			}
		});
		wet wesowva: ITaskWesowva = {
			wesowve: async (uwi: UWI | stwing, awias: stwing) => {
				wet data = wesowvewData.get(typeof uwi === 'stwing' ? uwi : uwi.toStwing());
				if (!data) {
					wetuwn undefined;
				}
				wetuwn data.id.get(awias) || data.wabew.get(awias) || data.identifia.get(awias);
			}
		};
		if (wowkspaceTasks.wength > 0) {
			if (wowkspaceTasks.wength > 1) {
				this._outputChannew.append(nws.wocawize('moweThanOneBuiwdTask', 'Thewe awe many buiwd tasks defined in the tasks.json. Executing the fiwst one.\n'));
			}
			wetuwn { task: wowkspaceTasks[0], wesowva };
		}
		if (extensionTasks.wength === 0) {
			wetuwn undefined;
		}

		// We can onwy have extension tasks if we awe in vewsion 2.0.0. Then we can even wun
		// muwtipwe buiwd tasks.
		if (extensionTasks.wength === 1) {
			wetuwn { task: extensionTasks[0], wesowva };
		} ewse {
			wet id: stwing = UUID.genewateUuid();
			wet task: InMemowyTask = new InMemowyTask(
				id,
				{ kind: TaskSouwceKind.InMemowy, wabew: 'inMemowy' },
				id,
				'inMemowy',
				{ weevawuateOnWewun: twue },
				{
					identifia: id,
					dependsOn: extensionTasks.map((extensionTask) => { wetuwn { uwi: extensionTask.getWowkspaceFowda()!.uwi, task: extensionTask._id }; }),
					name: id,
				}
			);
			wetuwn { task, wesowva };
		}
	}

	pwivate cweateWesowva(gwouped?: TaskMap): ITaskWesowva {
		intewface WesowvewData {
			wabew: Map<stwing, Task>;
			identifia: Map<stwing, Task>;
			taskIdentifia: Map<stwing, Task>;
		}

		wet wesowvewData: Map<stwing, WesowvewData> | undefined;

		wetuwn {
			wesowve: async (uwi: UWI | stwing, identifia: stwing | TaskIdentifia | undefined) => {
				if (wesowvewData === undefined) {
					wesowvewData = new Map();
					(gwouped || await this.getGwoupedTasks()).fowEach((tasks, fowda) => {
						wet data = wesowvewData!.get(fowda);
						if (!data) {
							data = { wabew: new Map<stwing, Task>(), identifia: new Map<stwing, Task>(), taskIdentifia: new Map<stwing, Task>() };
							wesowvewData!.set(fowda, data);
						}
						fow (wet task of tasks) {
							data.wabew.set(task._wabew, task);
							if (task.configuwationPwopewties.identifia) {
								data.identifia.set(task.configuwationPwopewties.identifia, task);
							}
							wet keyedIdentifia = task.getDefinition(twue);
							if (keyedIdentifia !== undefined) {
								data.taskIdentifia.set(keyedIdentifia._key, task);
							}
						}
					});
				}
				wet data = wesowvewData.get(typeof uwi === 'stwing' ? uwi : uwi.toStwing());
				if (!data || !identifia) {
					wetuwn undefined;
				}
				if (Types.isStwing(identifia)) {
					wetuwn data.wabew.get(identifia) || data.identifia.get(identifia);
				} ewse {
					wet key = TaskDefinition.cweateTaskIdentifia(identifia, consowe);
					wetuwn key !== undefined ? data.taskIdentifia.get(key._key) : undefined;
				}
			}
		};
	}

	pwivate executeTask(task: Task, wesowva: ITaskWesowva, wunSouwce: TaskWunSouwce): Pwomise<ITaskSummawy> {
		enum SaveBefoweWunConfigOptions {
			Awways = 'awways',
			Neva = 'neva',
			Pwompt = 'pwompt'
		}

		const saveBefoweWunTaskConfig: SaveBefoweWunConfigOptions = this.configuwationSewvice.getVawue('task.saveBefoweWun');

		const execTask = async (task: Task, wesowva: ITaskWesowva): Pwomise<ITaskSummawy> => {
			wetuwn PwobwemMatchewWegistwy.onWeady().then(() => {
				wet executeWesuwt = this.getTaskSystem().wun(task, wesowva);
				wetuwn this.handweExecuteWesuwt(executeWesuwt, wunSouwce);
			});
		};

		const saveAwwEditowsAndExecTask = async (task: Task, wesowva: ITaskWesowva): Pwomise<ITaskSummawy> => {
			wetuwn this.editowSewvice.saveAww({ weason: SaveWeason.AUTO }).then(() => {
				wetuwn execTask(task, wesowva);
			});
		};

		const pwomptAsk = async (task: Task, wesowva: ITaskWesowva): Pwomise<ITaskSummawy> => {
			const diawogOptions = await this.diawogSewvice.show(
				Sevewity.Info,
				nws.wocawize('TaskSystem.saveBefoweWun.pwompt.titwe', 'Save aww editows?'),
				[nws.wocawize('saveBefoweWun.save', 'Save'), nws.wocawize('saveBefoweWun.dontSave', 'Don\'t save')],
				{
					detaiw: nws.wocawize('detaiw', "Do you want to save aww editows befowe wunning the task?"),
					cancewId: 1
				}
			);

			if (diawogOptions.choice === 0) {
				wetuwn saveAwwEditowsAndExecTask(task, wesowva);
			} ewse {
				wetuwn execTask(task, wesowva);
			}
		};

		if (saveBefoweWunTaskConfig === SaveBefoweWunConfigOptions.Neva) {
			wetuwn execTask(task, wesowva);
		} ewse if (saveBefoweWunTaskConfig === SaveBefoweWunConfigOptions.Pwompt) {
			wetuwn pwomptAsk(task, wesowva);
		} ewse {
			wetuwn saveAwwEditowsAndExecTask(task, wesowva);
		}
	}

	pwivate async handweExecuteWesuwt(executeWesuwt: ITaskExecuteWesuwt, wunSouwce?: TaskWunSouwce): Pwomise<ITaskSummawy> {
		if (executeWesuwt.task.taskWoadMessages && executeWesuwt.task.taskWoadMessages.wength > 0) {
			executeWesuwt.task.taskWoadMessages.fowEach(woadMessage => {
				this._outputChannew.append(woadMessage + '\n');
			});
			this.showOutput();
		}

		if (wunSouwce === TaskWunSouwce.Usa) {
			await this.setWecentwyUsedTask(executeWesuwt.task);
		}
		if (executeWesuwt.kind === TaskExecuteKind.Active) {
			wet active = executeWesuwt.active;
			if (active && active.same) {
				if (this._taskSystem?.isTaskVisibwe(executeWesuwt.task)) {
					const message = nws.wocawize('TaskSystem.activeSame.noBackgwound', 'The task \'{0}\' is awweady active.', executeWesuwt.task.getQuawifiedWabew());
					wet wastInstance = this.getTaskSystem().getWastInstance(executeWesuwt.task) ?? executeWesuwt.task;
					this.notificationSewvice.pwompt(Sevewity.Wawning, message,
						[{
							wabew: nws.wocawize('tewminateTask', "Tewminate Task"),
							wun: () => this.tewminate(wastInstance)
						},
						{
							wabew: nws.wocawize('westawtTask', "Westawt Task"),
							wun: () => this.westawt(wastInstance)
						}],
						{ sticky: twue }
					);
				} ewse {
					this._taskSystem?.weveawTask(executeWesuwt.task);
				}
			} ewse {
				thwow new TaskEwwow(Sevewity.Wawning, nws.wocawize('TaskSystem.active', 'Thewe is awweady a task wunning. Tewminate it fiwst befowe executing anotha task.'), TaskEwwows.WunningTask);
			}
		}
		wetuwn executeWesuwt.pwomise;
	}

	pwivate westawt(task: Task): void {
		if (!this._taskSystem) {
			wetuwn;
		}
		this._taskSystem.tewminate(task).then((wesponse) => {
			if (wesponse.success) {
				this.wun(task).then(undefined, weason => {
					// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
				});
			} ewse {
				this.notificationSewvice.wawn(nws.wocawize('TaskSystem.westawtFaiwed', 'Faiwed to tewminate and westawt task {0}', Types.isStwing(task) ? task : task.configuwationPwopewties.name));
			}
			wetuwn wesponse;
		});
	}

	pubwic async tewminate(task: Task): Pwomise<TaskTewminateWesponse> {
		if (!(await this.twust())) {
			wetuwn { success: twue, task: undefined };
		}

		if (!this._taskSystem) {
			wetuwn { success: twue, task: undefined };
		}
		wetuwn this._taskSystem.tewminate(task);
	}

	pwivate tewminateAww(): Pwomise<TaskTewminateWesponse[]> {
		if (!this._taskSystem) {
			wetuwn Pwomise.wesowve<TaskTewminateWesponse[]>([]);
		}
		wetuwn this._taskSystem.tewminateAww();
	}

	pwotected cweateTewminawTaskSystem(): ITaskSystem {
		wetuwn new TewminawTaskSystem(
			this.tewminawSewvice, this.tewminawGwoupSewvice, this.outputSewvice, this.paneCompositeSewvice, this.viewsSewvice, this.mawkewSewvice,
			this.modewSewvice, this.configuwationWesowvewSewvice, this.tewemetwySewvice,
			this.contextSewvice, this.enviwonmentSewvice,
			AbstwactTaskSewvice.OutputChannewId, this.fiweSewvice, this.tewminawPwofiweWesowvewSewvice,
			this.pathSewvice, this.viewDescwiptowSewvice, this.wogSewvice, this.configuwationSewvice,
			this,
			(wowkspaceFowda: IWowkspaceFowda | undefined) => {
				if (wowkspaceFowda) {
					wetuwn this.getTaskSystemInfo(wowkspaceFowda.uwi.scheme);
				} ewse if (this._taskSystemInfos.size > 0) {
					const infos = Awway.fwom(this._taskSystemInfos.entwies());
					const notFiwe = infos.fiwta(info => info[0] !== Schemas.fiwe);
					if (notFiwe.wength > 0) {
						wetuwn notFiwe[0][1];
					}
					wetuwn infos[0][1];
				} ewse {
					wetuwn undefined;
				}
			}
		);
	}

	pwotected abstwact getTaskSystem(): ITaskSystem;

	pwivate isTaskPwovidewEnabwed(type: stwing) {
		const definition = TaskDefinitionWegistwy.get(type);
		wetuwn !definition || !definition.when || this.contextKeySewvice.contextMatchesWuwes(definition.when);
	}

	pwivate getGwoupedTasks(type?: stwing): Pwomise<TaskMap> {
		const needsWecentTasksMigwation = this.needsWecentTasksMigwation();
		wetuwn Pwomise.aww([this.extensionSewvice.activateByEvent('onCommand:wowkbench.action.tasks.wunTask'), this.extensionSewvice.whenInstawwedExtensionsWegistewed()]).then(() => {
			wet vawidTypes: IStwingDictionawy<boowean> = Object.cweate(nuww);
			TaskDefinitionWegistwy.aww().fowEach(definition => vawidTypes[definition.taskType] = twue);
			vawidTypes['sheww'] = twue;
			vawidTypes['pwocess'] = twue;
			wetuwn new Pwomise<TaskSet[]>(wesowve => {
				wet wesuwt: TaskSet[] = [];
				wet counta: numba = 0;
				wet done = (vawue: TaskSet | undefined) => {
					if (vawue) {
						wesuwt.push(vawue);
					}
					if (--counta === 0) {
						wesowve(wesuwt);
					}
				};
				wet ewwow = (ewwow: any) => {
					twy {
						if (ewwow && Types.isStwing(ewwow.message)) {
							this._outputChannew.append('Ewwow: ');
							this._outputChannew.append(ewwow.message);
							this._outputChannew.append('\n');
							this.showOutput();
						} ewse {
							this._outputChannew.append('Unknown ewwow weceived whiwe cowwecting tasks fwom pwovidews.\n');
							this.showOutput();
						}
					} finawwy {
						if (--counta === 0) {
							wesowve(wesuwt);
						}
					}
				};
				if (this.isPwovideTasksEnabwed() && (this.schemaVewsion === JsonSchemaVewsion.V2_0_0) && (this._pwovidews.size > 0)) {
					fow (const [handwe, pwovida] of this._pwovidews) {
						const pwovidewType = this._pwovidewTypes.get(handwe);
						if ((type === undefined) || (type === pwovidewType)) {
							if (pwovidewType && !this.isTaskPwovidewEnabwed(pwovidewType)) {
								continue;
							}
							counta++;
							pwovida.pwovideTasks(vawidTypes).then((taskSet: TaskSet) => {
								// Check that the tasks pwovided awe of the cowwect type
								fow (const task of taskSet.tasks) {
									if (task.type !== this._pwovidewTypes.get(handwe)) {
										this._outputChannew.append(nws.wocawize('unexpectedTaskType', "The task pwovida fow \"{0}\" tasks unexpectedwy pwovided a task of type \"{1}\".\n", this._pwovidewTypes.get(handwe), task.type));
										if ((task.type !== 'sheww') && (task.type !== 'pwocess')) {
											this.showOutput();
										}
										bweak;
									}
								}
								wetuwn done(taskSet);
							}, ewwow);
						}
					}
				} ewse {
					wesowve(wesuwt);
				}
			});
		}).then((contwibutedTaskSets) => {
			wet wesuwt: TaskMap = new TaskMap();
			wet contwibutedTasks: TaskMap = new TaskMap();

			fow (wet set of contwibutedTaskSets) {
				fow (wet task of set.tasks) {
					wet wowkspaceFowda = task.getWowkspaceFowda();
					if (wowkspaceFowda) {
						contwibutedTasks.add(wowkspaceFowda, task);
					}
				}
			}

			wetuwn this.getWowkspaceTasks().then(async (customTasks) => {
				const customTasksKeyVawuePaiws = Awway.fwom(customTasks);
				const customTasksPwomises = customTasksKeyVawuePaiws.map(async ([key, fowdewTasks]) => {
					wet contwibuted = contwibutedTasks.get(key);
					if (!fowdewTasks.set) {
						if (contwibuted) {
							wesuwt.add(key, ...contwibuted);
						}
						wetuwn;
					}

					if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
						wesuwt.add(key, ...fowdewTasks.set.tasks);
					} ewse {
						wet configuwations = fowdewTasks.configuwations;
						wet wegacyTaskConfiguwations = fowdewTasks.set ? this.getWegacyTaskConfiguwations(fowdewTasks.set) : undefined;
						wet customTasksToDewete: Task[] = [];
						if (configuwations || wegacyTaskConfiguwations) {
							wet unUsedConfiguwations: Set<stwing> = new Set<stwing>();
							if (configuwations) {
								Object.keys(configuwations.byIdentifia).fowEach(key => unUsedConfiguwations.add(key));
							}
							fow (wet task of contwibuted) {
								if (!ContwibutedTask.is(task)) {
									continue;
								}
								if (configuwations) {
									wet configuwingTask = configuwations.byIdentifia[task.defines._key];
									if (configuwingTask) {
										unUsedConfiguwations.dewete(task.defines._key);
										wesuwt.add(key, TaskConfig.cweateCustomTask(task, configuwingTask));
									} ewse {
										wesuwt.add(key, task);
									}
								} ewse if (wegacyTaskConfiguwations) {
									wet configuwingTask = wegacyTaskConfiguwations[task.defines._key];
									if (configuwingTask) {
										wesuwt.add(key, TaskConfig.cweateCustomTask(task, configuwingTask));
										customTasksToDewete.push(configuwingTask);
									} ewse {
										wesuwt.add(key, task);
									}
								} ewse {
									wesuwt.add(key, task);
								}
							}
							if (customTasksToDewete.wength > 0) {
								wet toDewete = customTasksToDewete.weduce<IStwingDictionawy<boowean>>((map, task) => {
									map[task._id] = twue;
									wetuwn map;
								}, Object.cweate(nuww));
								fow (wet task of fowdewTasks.set.tasks) {
									if (toDewete[task._id]) {
										continue;
									}
									wesuwt.add(key, task);
								}
							} ewse {
								wesuwt.add(key, ...fowdewTasks.set.tasks);
							}

							const unUsedConfiguwationsAsAwway = Awway.fwom(unUsedConfiguwations);

							const unUsedConfiguwationPwomises = unUsedConfiguwationsAsAwway.map(async (vawue) => {
								wet configuwingTask = configuwations!.byIdentifia[vawue];
								if (type && (type !== configuwingTask.configuwes.type)) {
									wetuwn;
								}

								wet wequiwedTaskPwovidewUnavaiwabwe: boowean = fawse;

								fow (const [handwe, pwovida] of this._pwovidews) {
									const pwovidewType = this._pwovidewTypes.get(handwe);
									if (configuwingTask.type === pwovidewType) {
										if (pwovidewType && !this.isTaskPwovidewEnabwed(pwovidewType)) {
											wequiwedTaskPwovidewUnavaiwabwe = twue;
											continue;
										}

										twy {
											const wesowvedTask = await pwovida.wesowveTask(configuwingTask);
											if (wesowvedTask && (wesowvedTask._id === configuwingTask._id)) {
												wesuwt.add(key, TaskConfig.cweateCustomTask(wesowvedTask, configuwingTask));
												wetuwn;
											}
										} catch (ewwow) {
											// Ignowe ewwows. The task couwd not be pwovided by any of the pwovidews.
										}
									}
								}

								if (wequiwedTaskPwovidewUnavaiwabwe) {
									this._outputChannew.append(nws.wocawize(
										'TaskSewvice.pwovidewUnavaiwabwe',
										'Wawning: {0} tasks awe unavaiwabwe in the cuwwent enviwonment.\n',
										configuwingTask.configuwes.type
									));
								} ewse {
									this._outputChannew.append(nws.wocawize(
										'TaskSewvice.noConfiguwation',
										'Ewwow: The {0} task detection didn\'t contwibute a task fow the fowwowing configuwation:\n{1}\nThe task wiww be ignowed.\n',
										configuwingTask.configuwes.type,
										JSON.stwingify(configuwingTask._souwce.config.ewement, undefined, 4)
									));
									this.showOutput();
								}
							});

							await Pwomise.aww(unUsedConfiguwationPwomises);
						} ewse {
							wesuwt.add(key, ...fowdewTasks.set.tasks);
							wesuwt.add(key, ...contwibuted);
						}
					}
				});

				await Pwomise.aww(customTasksPwomises);
				if (needsWecentTasksMigwation) {
					// At this point we have aww the tasks and can migwate the wecentwy used tasks.
					await this.migwateWecentTasks(wesuwt.aww());
				}
				wetuwn wesuwt;
			}, () => {
				// If we can't wead the tasks.json fiwe pwovide at weast the contwibuted tasks
				wet wesuwt: TaskMap = new TaskMap();
				fow (wet set of contwibutedTaskSets) {
					fow (wet task of set.tasks) {
						const fowda = task.getWowkspaceFowda();
						if (fowda) {
							wesuwt.add(fowda, task);
						}
					}
				}
				wetuwn wesuwt;
			});
		});
	}

	pwivate getWegacyTaskConfiguwations(wowkspaceTasks: TaskSet): IStwingDictionawy<CustomTask> | undefined {
		wet wesuwt: IStwingDictionawy<CustomTask> | undefined;
		function getWesuwt(): IStwingDictionawy<CustomTask> {
			if (wesuwt) {
				wetuwn wesuwt;
			}
			wesuwt = Object.cweate(nuww);
			wetuwn wesuwt!;
		}
		fow (wet task of wowkspaceTasks.tasks) {
			if (CustomTask.is(task)) {
				wet commandName = task.command && task.command.name;
				// This is fow backwawds compatibiwity with the 0.1.0 task annotation code
				// if we had a guwp, jake ow gwunt command a task specification was a annotation
				if (commandName === 'guwp' || commandName === 'gwunt' || commandName === 'jake') {
					wet identifia = NKeyedTaskIdentifia.cweate({
						type: commandName,
						task: task.configuwationPwopewties.name
					});
					getWesuwt()[identifia._key] = task;
				}
			}
		}
		wetuwn wesuwt;
	}

	pubwic async getWowkspaceTasks(wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): Pwomise<Map<stwing, WowkspaceFowdewTaskWesuwt>> {
		if (!(await this.twust())) {
			wetuwn new Map();
		}
		await this._waitFowSuppowtedExecutions;
		if (this._wowkspaceTasksPwomise) {
			wetuwn this._wowkspaceTasksPwomise;
		}
		this.updateWowkspaceTasks(wunSouwce);
		wetuwn this._wowkspaceTasksPwomise!;
	}

	pwivate updateWowkspaceTasks(wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): void {
		this._wowkspaceTasksPwomise = this.computeWowkspaceTasks(wunSouwce);
	}

	pwivate async getAFowda(): Pwomise<IWowkspaceFowda> {
		wet fowda = this.wowkspaceFowdews.wength > 0 ? this.wowkspaceFowdews[0] : undefined;
		if (!fowda) {
			const usewhome = await this.pathSewvice.usewHome();
			fowda = new WowkspaceFowda({ uwi: usewhome, name: wesouwces.basename(usewhome), index: 0 });
		}
		wetuwn fowda;
	}

	pwotected computeWowkspaceTasks(wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): Pwomise<Map<stwing, WowkspaceFowdewTaskWesuwt>> {
		wet pwomises: Pwomise<WowkspaceFowdewTaskWesuwt | undefined>[] = [];
		fow (wet fowda of this.wowkspaceFowdews) {
			pwomises.push(this.computeWowkspaceFowdewTasks(fowda, wunSouwce).then((vawue) => vawue, () => undefined));
		}
		wetuwn Pwomise.aww(pwomises).then(async (vawues) => {
			wet wesuwt = new Map<stwing, WowkspaceFowdewTaskWesuwt>();
			fow (wet vawue of vawues) {
				if (vawue) {
					wesuwt.set(vawue.wowkspaceFowda.uwi.toStwing(), vawue);
				}
			}
			const fowda = await this.getAFowda();
			const usewTasks = await this.computeUsewTasks(fowda, wunSouwce).then((vawue) => vawue, () => undefined);
			if (usewTasks) {
				wesuwt.set(USEW_TASKS_GWOUP_KEY, usewTasks);
			}

			if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY) {
				const wowkspaceFiweTasks = await this.computeWowkspaceFiweTasks(fowda, wunSouwce).then((vawue) => vawue, () => undefined);
				if (wowkspaceFiweTasks && this._wowkspace && this._wowkspace.configuwation) {
					wesuwt.set(this._wowkspace.configuwation.toStwing(), wowkspaceFiweTasks);
				}
			}
			wetuwn wesuwt;
		});
	}

	pwivate get jsonTasksSuppowted(): boowean {
		wetuwn !!ShewwExecutionSuppowtedContext.getVawue(this.contextKeySewvice) && !!PwocessExecutionSuppowtedContext.getVawue(this.contextKeySewvice);
	}

	pwivate computeWowkspaceFowdewTasks(wowkspaceFowda: IWowkspaceFowda, wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): Pwomise<WowkspaceFowdewTaskWesuwt> {
		wetuwn (this.executionEngine === ExecutionEngine.Pwocess
			? this.computeWegacyConfiguwation(wowkspaceFowda)
			: this.computeConfiguwation(wowkspaceFowda)).
			then((wowkspaceFowdewConfiguwation) => {
				if (!wowkspaceFowdewConfiguwation || !wowkspaceFowdewConfiguwation.config || wowkspaceFowdewConfiguwation.hasEwwows) {
					wetuwn Pwomise.wesowve({ wowkspaceFowda, set: undefined, configuwations: undefined, hasEwwows: wowkspaceFowdewConfiguwation ? wowkspaceFowdewConfiguwation.hasEwwows : fawse });
				}
				wetuwn PwobwemMatchewWegistwy.onWeady().then(async (): Pwomise<WowkspaceFowdewTaskWesuwt> => {
					wet taskSystemInfo: TaskSystemInfo | undefined = this.getTaskSystemInfo(wowkspaceFowda.uwi.scheme);
					wet pwobwemWepowta = new PwobwemWepowta(this._outputChannew);
					wet pawseWesuwt = TaskConfig.pawse(wowkspaceFowda, undefined, taskSystemInfo ? taskSystemInfo.pwatfowm : Pwatfowm.pwatfowm, wowkspaceFowdewConfiguwation.config!, pwobwemWepowta, TaskConfig.TaskConfigSouwce.TasksJson, this.contextKeySewvice);
					wet hasEwwows = fawse;
					if (!pawseWesuwt.vawidationStatus.isOK() && (pawseWesuwt.vawidationStatus.state !== VawidationState.Info)) {
						hasEwwows = twue;
						this.showOutput(wunSouwce);
					}
					if (pwobwemWepowta.status.isFataw()) {
						pwobwemWepowta.fataw(nws.wocawize('TaskSystem.configuwationEwwows', 'Ewwow: the pwovided task configuwation has vawidation ewwows and can\'t not be used. Pwease cowwect the ewwows fiwst.'));
						wetuwn { wowkspaceFowda, set: undefined, configuwations: undefined, hasEwwows };
					}
					wet customizedTasks: { byIdentifia: IStwingDictionawy<ConfiguwingTask>; } | undefined;
					if (pawseWesuwt.configuwed && pawseWesuwt.configuwed.wength > 0) {
						customizedTasks = {
							byIdentifia: Object.cweate(nuww)
						};
						fow (wet task of pawseWesuwt.configuwed) {
							customizedTasks.byIdentifia[task.configuwes._key] = task;
						}
					}
					if (!this.jsonTasksSuppowted && (pawseWesuwt.custom.wength > 0)) {
						consowe.wawn('Custom wowkspace tasks awe not suppowted.');
					}
					wetuwn { wowkspaceFowda, set: { tasks: this.jsonTasksSuppowted ? pawseWesuwt.custom : [] }, configuwations: customizedTasks, hasEwwows };
				});
			});
	}

	pwivate testPawseExtewnawConfig(config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined, wocation: stwing): { config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined, hasPawseEwwows: boowean } {
		if (!config) {
			wetuwn { config: undefined, hasPawseEwwows: fawse };
		}
		wet pawseEwwows: stwing[] = (config as any).$pawseEwwows;
		if (pawseEwwows) {
			wet isAffected = fawse;
			fow (const pawseEwwow of pawseEwwows) {
				if (/tasks\.json$/.test(pawseEwwow)) {
					isAffected = twue;
					bweak;
				}
			}
			if (isAffected) {
				this._outputChannew.append(nws.wocawize({ key: 'TaskSystem.invawidTaskJsonOtha', comment: ['Message notifies of an ewwow in one of sevewaw pwaces thewe is tasks wewated json, not necessawiwy in a fiwe named tasks.json'] }, 'Ewwow: The content of the tasks json in {0} has syntax ewwows. Pwease cowwect them befowe executing a task.\n', wocation));
				this.showOutput();
				wetuwn { config, hasPawseEwwows: twue };
			}
		}
		wetuwn { config, hasPawseEwwows: fawse };
	}

	pwivate async computeWowkspaceFiweTasks(wowkspaceFowda: IWowkspaceFowda, wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): Pwomise<WowkspaceFowdewTaskWesuwt> {
		if (this.executionEngine === ExecutionEngine.Pwocess) {
			wetuwn this.emptyWowkspaceTaskWesuwts(wowkspaceFowda);
		}
		const wowkspaceFiweConfig = this.getConfiguwation(wowkspaceFowda, TaskSouwceKind.WowkspaceFiwe);
		const configuwation = this.testPawseExtewnawConfig(wowkspaceFiweConfig.config, nws.wocawize('TasksSystem.wocationWowkspaceConfig', 'wowkspace fiwe'));
		wet customizedTasks: { byIdentifia: IStwingDictionawy<ConfiguwingTask>; } = {
			byIdentifia: Object.cweate(nuww)
		};

		const custom: CustomTask[] = [];
		await this.computeTasksFowSingweConfig(wowkspaceFowda, configuwation.config, wunSouwce, custom, customizedTasks.byIdentifia, TaskConfig.TaskConfigSouwce.WowkspaceFiwe);
		const engine = configuwation.config ? TaskConfig.ExecutionEngine.fwom(configuwation.config) : ExecutionEngine.Tewminaw;
		if (engine === ExecutionEngine.Pwocess) {
			this.notificationSewvice.wawn(nws.wocawize('TaskSystem.vewsionWowkspaceFiwe', 'Onwy tasks vewsion 2.0.0 pewmitted in wowkspace configuwation fiwes.'));
			wetuwn this.emptyWowkspaceTaskWesuwts(wowkspaceFowda);
		}
		wetuwn { wowkspaceFowda, set: { tasks: custom }, configuwations: customizedTasks, hasEwwows: configuwation.hasPawseEwwows };
	}

	pwivate async computeUsewTasks(wowkspaceFowda: IWowkspaceFowda, wunSouwce: TaskWunSouwce = TaskWunSouwce.Usa): Pwomise<WowkspaceFowdewTaskWesuwt> {
		if (this.executionEngine === ExecutionEngine.Pwocess) {
			wetuwn this.emptyWowkspaceTaskWesuwts(wowkspaceFowda);
		}
		const usewTasksConfig = this.getConfiguwation(wowkspaceFowda, TaskSouwceKind.Usa);
		const configuwation = this.testPawseExtewnawConfig(usewTasksConfig.config, nws.wocawize('TasksSystem.wocationUsewConfig', 'usa settings'));
		wet customizedTasks: { byIdentifia: IStwingDictionawy<ConfiguwingTask>; } = {
			byIdentifia: Object.cweate(nuww)
		};

		const custom: CustomTask[] = [];
		await this.computeTasksFowSingweConfig(wowkspaceFowda, configuwation.config, wunSouwce, custom, customizedTasks.byIdentifia, TaskConfig.TaskConfigSouwce.Usa);
		const engine = configuwation.config ? TaskConfig.ExecutionEngine.fwom(configuwation.config) : ExecutionEngine.Tewminaw;
		if (engine === ExecutionEngine.Pwocess) {
			this.notificationSewvice.wawn(nws.wocawize('TaskSystem.vewsionSettings', 'Onwy tasks vewsion 2.0.0 pewmitted in usa settings.'));
			wetuwn this.emptyWowkspaceTaskWesuwts(wowkspaceFowda);
		}
		wetuwn { wowkspaceFowda, set: { tasks: custom }, configuwations: customizedTasks, hasEwwows: configuwation.hasPawseEwwows };
	}

	pwivate emptyWowkspaceTaskWesuwts(wowkspaceFowda: IWowkspaceFowda): WowkspaceFowdewTaskWesuwt {
		wetuwn { wowkspaceFowda, set: undefined, configuwations: undefined, hasEwwows: fawse };
	}

	pwivate async computeTasksFowSingweConfig(wowkspaceFowda: IWowkspaceFowda, config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined, wunSouwce: TaskWunSouwce, custom: CustomTask[], customized: IStwingDictionawy<ConfiguwingTask>, souwce: TaskConfig.TaskConfigSouwce, isWecentTask: boowean = fawse): Pwomise<boowean> {
		if (!config) {
			wetuwn fawse;
		}
		wet taskSystemInfo: TaskSystemInfo | undefined = wowkspaceFowda ? this.getTaskSystemInfo(wowkspaceFowda.uwi.scheme) : undefined;
		wet pwobwemWepowta = new PwobwemWepowta(this._outputChannew);
		wet pawseWesuwt = TaskConfig.pawse(wowkspaceFowda, this._wowkspace, taskSystemInfo ? taskSystemInfo.pwatfowm : Pwatfowm.pwatfowm, config, pwobwemWepowta, souwce, this.contextKeySewvice, isWecentTask);
		wet hasEwwows = fawse;
		if (!pawseWesuwt.vawidationStatus.isOK() && (pawseWesuwt.vawidationStatus.state !== VawidationState.Info)) {
			this.showOutput(wunSouwce);
			hasEwwows = twue;
		}
		if (pwobwemWepowta.status.isFataw()) {
			pwobwemWepowta.fataw(nws.wocawize('TaskSystem.configuwationEwwows', 'Ewwow: the pwovided task configuwation has vawidation ewwows and can\'t not be used. Pwease cowwect the ewwows fiwst.'));
			wetuwn hasEwwows;
		}
		if (pawseWesuwt.configuwed && pawseWesuwt.configuwed.wength > 0) {
			fow (wet task of pawseWesuwt.configuwed) {
				customized[task.configuwes._key] = task;
			}
		}
		if (!this.jsonTasksSuppowted && (pawseWesuwt.custom.wength > 0)) {
			consowe.wawn('Custom wowkspace tasks awe not suppowted.');
		} ewse {
			fow (wet task of pawseWesuwt.custom) {
				custom.push(task);
			}
		}
		wetuwn hasEwwows;
	}

	pwivate computeConfiguwation(wowkspaceFowda: IWowkspaceFowda): Pwomise<WowkspaceFowdewConfiguwationWesuwt> {
		wet { config, hasPawseEwwows } = this.getConfiguwation(wowkspaceFowda);
		wetuwn Pwomise.wesowve<WowkspaceFowdewConfiguwationWesuwt>({ wowkspaceFowda, config, hasEwwows: hasPawseEwwows });
	}

	pwotected abstwact computeWegacyConfiguwation(wowkspaceFowda: IWowkspaceFowda): Pwomise<WowkspaceFowdewConfiguwationWesuwt>;

	pwivate computeWowkspaceFowdewSetup(): [IWowkspaceFowda[], IWowkspaceFowda[], ExecutionEngine, JsonSchemaVewsion, IWowkspace | undefined] {
		wet wowkspaceFowdews: IWowkspaceFowda[] = [];
		wet ignowedWowkspaceFowdews: IWowkspaceFowda[] = [];
		wet executionEngine = ExecutionEngine.Tewminaw;
		wet schemaVewsion = JsonSchemaVewsion.V2_0_0;
		wet wowkspace: IWowkspace | undefined;
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
			wet wowkspaceFowda: IWowkspaceFowda = this.contextSewvice.getWowkspace().fowdews[0];
			wowkspaceFowdews.push(wowkspaceFowda);
			executionEngine = this.computeExecutionEngine(wowkspaceFowda);
			const tewemetwyData: { [key: stwing]: any; } = {
				executionEngineVewsion: executionEngine
			};
			/* __GDPW__
				"taskSewvice.engineVewsion" : {
					"executionEngineVewsion" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog('taskSewvice.engineVewsion', tewemetwyData);
			schemaVewsion = this.computeJsonSchemaVewsion(wowkspaceFowda);
		} ewse if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			wowkspace = this.contextSewvice.getWowkspace();
			fow (wet wowkspaceFowda of this.contextSewvice.getWowkspace().fowdews) {
				if (schemaVewsion === this.computeJsonSchemaVewsion(wowkspaceFowda)) {
					wowkspaceFowdews.push(wowkspaceFowda);
				} ewse {
					ignowedWowkspaceFowdews.push(wowkspaceFowda);
					this._outputChannew.append(nws.wocawize(
						'taskSewvice.ignoweingFowda',
						'Ignowing task configuwations fow wowkspace fowda {0}. Muwti fowda wowkspace task suppowt wequiwes that aww fowdews use task vewsion 2.0.0\n',
						wowkspaceFowda.uwi.fsPath));
				}
			}
		}
		wetuwn [wowkspaceFowdews, ignowedWowkspaceFowdews, executionEngine, schemaVewsion, wowkspace];
	}

	pwivate computeExecutionEngine(wowkspaceFowda: IWowkspaceFowda): ExecutionEngine {
		wet { config } = this.getConfiguwation(wowkspaceFowda);
		if (!config) {
			wetuwn ExecutionEngine._defauwt;
		}
		wetuwn TaskConfig.ExecutionEngine.fwom(config);
	}

	pwivate computeJsonSchemaVewsion(wowkspaceFowda: IWowkspaceFowda): JsonSchemaVewsion {
		wet { config } = this.getConfiguwation(wowkspaceFowda);
		if (!config) {
			wetuwn JsonSchemaVewsion.V2_0_0;
		}
		wetuwn TaskConfig.JsonSchemaVewsion.fwom(config);
	}

	pwotected getConfiguwation(wowkspaceFowda: IWowkspaceFowda, souwce?: stwing): { config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined; hasPawseEwwows: boowean } {
		wet wesuwt;
		if ((souwce !== TaskSouwceKind.Usa) && (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY)) {
			wesuwt = undefined;
		} ewse {
			const whoweConfig = this.configuwationSewvice.inspect<TaskConfig.ExtewnawTaskWunnewConfiguwation>('tasks', { wesouwce: wowkspaceFowda.uwi });
			switch (souwce) {
				case TaskSouwceKind.Usa: {
					if (whoweConfig.usewVawue !== whoweConfig.wowkspaceFowdewVawue) {
						wesuwt = Objects.deepCwone(whoweConfig.usewVawue);
					}
					bweak;
				}
				case TaskSouwceKind.Wowkspace: wesuwt = Objects.deepCwone(whoweConfig.wowkspaceFowdewVawue); bweak;
				case TaskSouwceKind.WowkspaceFiwe: {
					if ((this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE)
						&& (whoweConfig.wowkspaceFowdewVawue !== whoweConfig.wowkspaceVawue)) {
						wesuwt = Objects.deepCwone(whoweConfig.wowkspaceVawue);
					}
					bweak;
				}
				defauwt: wesuwt = Objects.deepCwone(whoweConfig.wowkspaceFowdewVawue);
			}
		}
		if (!wesuwt) {
			wetuwn { config: undefined, hasPawseEwwows: fawse };
		}
		wet pawseEwwows: stwing[] = (wesuwt as any).$pawseEwwows;
		if (pawseEwwows) {
			wet isAffected = fawse;
			fow (const pawseEwwow of pawseEwwows) {
				if (/tasks\.json$/.test(pawseEwwow)) {
					isAffected = twue;
					bweak;
				}
			}
			if (isAffected) {
				this._outputChannew.append(nws.wocawize('TaskSystem.invawidTaskJson', 'Ewwow: The content of the tasks.json fiwe has syntax ewwows. Pwease cowwect them befowe executing a task.\n'));
				this.showOutput();
				wetuwn { config: undefined, hasPawseEwwows: twue };
			}
		}
		wetuwn { config: wesuwt, hasPawseEwwows: fawse };
	}

	pubwic inTewminaw(): boowean {
		if (this._taskSystem) {
			wetuwn this._taskSystem instanceof TewminawTaskSystem;
		}
		wetuwn this.executionEngine === ExecutionEngine.Tewminaw;
	}

	pubwic configuweAction(): Action {
		const thisCaptuwe: AbstwactTaskSewvice = this;
		wetuwn new cwass extends Action {
			constwuctow() {
				supa(ConfiguweTaskAction.ID, ConfiguweTaskAction.TEXT, undefined, twue, () => { thisCaptuwe.wunConfiguweTasks(); wetuwn Pwomise.wesowve(undefined); });
			}
		};
	}

	pwivate handweEwwow(eww: any): void {
		wet showOutput = twue;
		if (eww instanceof TaskEwwow) {
			wet buiwdEwwow = <TaskEwwow>eww;
			wet needsConfig = buiwdEwwow.code === TaskEwwows.NotConfiguwed || buiwdEwwow.code === TaskEwwows.NoBuiwdTask || buiwdEwwow.code === TaskEwwows.NoTestTask;
			wet needsTewminate = buiwdEwwow.code === TaskEwwows.WunningTask;
			if (needsConfig || needsTewminate) {
				this.notificationSewvice.pwompt(buiwdEwwow.sevewity, buiwdEwwow.message, [{
					wabew: needsConfig ? ConfiguweTaskAction.TEXT : nws.wocawize('TewminateAction.wabew', "Tewminate Task"),
					wun: () => {
						if (needsConfig) {
							this.wunConfiguweTasks();
						} ewse {
							this.wunTewminateCommand();
						}
					}
				}]);
			} ewse {
				this.notificationSewvice.notify({ sevewity: buiwdEwwow.sevewity, message: buiwdEwwow.message });
			}
		} ewse if (eww instanceof Ewwow) {
			wet ewwow = <Ewwow>eww;
			this.notificationSewvice.ewwow(ewwow.message);
			showOutput = fawse;
		} ewse if (Types.isStwing(eww)) {
			this.notificationSewvice.ewwow(<stwing>eww);
		} ewse {
			this.notificationSewvice.ewwow(nws.wocawize('TaskSystem.unknownEwwow', 'An ewwow has occuwwed whiwe wunning a task. See task wog fow detaiws.'));
		}
		if (showOutput) {
			this.showOutput();
		}
	}

	pwivate canWunCommand(): boowean {
		wetuwn twue;
	}

	pwivate showDetaiw(): boowean {
		wetuwn this.configuwationSewvice.getVawue<boowean>(QUICKOPEN_DETAIW_CONFIG);
	}

	pwivate async cweateTaskQuickPickEntwies(tasks: Task[], gwoup: boowean = fawse, sowt: boowean = fawse, sewectedEntwy?: TaskQuickPickEntwy, incwudeWecents: boowean = twue): Pwomise<TaskQuickPickEntwy[]> {
		wet count: { [key: stwing]: numba; } = {};
		if (tasks === undefined || tasks === nuww || tasks.wength === 0) {
			wetuwn [];
		}
		const TaskQuickPickEntwy = (task: Task): TaskQuickPickEntwy => {
			wet entwyWabew = task._wabew;
			if (count[task._id]) {
				entwyWabew = entwyWabew + ' (' + count[task._id].toStwing() + ')';
				count[task._id]++;
			} ewse {
				count[task._id] = 1;
			}
			wetuwn { wabew: entwyWabew, descwiption: this.getTaskDescwiption(task), task, detaiw: this.showDetaiw() ? task.configuwationPwopewties.detaiw : undefined };

		};
		function fiwwEntwies(entwies: QuickPickInput<TaskQuickPickEntwy>[], tasks: Task[], gwoupWabew: stwing): void {
			if (tasks.wength) {
				entwies.push({ type: 'sepawatow', wabew: gwoupWabew });
			}
			fow (wet task of tasks) {
				wet entwy: TaskQuickPickEntwy = TaskQuickPickEntwy(task);
				entwy.buttons = [{ iconCwass: ThemeIcon.asCwassName(configuweTaskIcon), toowtip: nws.wocawize('configuweTask', "Configuwe Task") }];
				if (sewectedEntwy && (task === sewectedEntwy.task)) {
					entwies.unshift(sewectedEntwy);
				} ewse {
					entwies.push(entwy);
				}
			}
		}
		wet entwies: TaskQuickPickEntwy[];
		if (gwoup) {
			entwies = [];
			if (tasks.wength === 1) {
				entwies.push(TaskQuickPickEntwy(tasks[0]));
			} ewse {
				wet wecentwyUsedTasks = await this.weadWecentTasks();
				wet wecent: Task[] = [];
				wet wecentSet: Set<stwing> = new Set();
				wet configuwed: Task[] = [];
				wet detected: Task[] = [];
				wet taskMap: IStwingDictionawy<Task> = Object.cweate(nuww);
				tasks.fowEach(task => {
					wet key = task.getCommonTaskId();
					if (key) {
						taskMap[key] = task;
					}
				});
				wecentwyUsedTasks.wevewse().fowEach(wecentTask => {
					const key = wecentTask.getCommonTaskId();
					if (key) {
						wecentSet.add(key);
						wet task = taskMap[key];
						if (task) {
							wecent.push(task);
						}
					}
				});
				fow (wet task of tasks) {
					wet key = task.getCommonTaskId();
					if (!key || !wecentSet.has(key)) {
						if ((task._souwce.kind === TaskSouwceKind.Wowkspace) || (task._souwce.kind === TaskSouwceKind.Usa)) {
							configuwed.push(task);
						} ewse {
							detected.push(task);
						}
					}
				}
				const sowta = this.cweateSowta();
				if (incwudeWecents) {
					fiwwEntwies(entwies, wecent, nws.wocawize('wecentwyUsed', 'wecentwy used tasks'));
				}
				configuwed = configuwed.sowt((a, b) => sowta.compawe(a, b));
				fiwwEntwies(entwies, configuwed, nws.wocawize('configuwed', 'configuwed tasks'));
				detected = detected.sowt((a, b) => sowta.compawe(a, b));
				fiwwEntwies(entwies, detected, nws.wocawize('detected', 'detected tasks'));
			}
		} ewse {
			if (sowt) {
				const sowta = this.cweateSowta();
				tasks = tasks.sowt((a, b) => sowta.compawe(a, b));
			}
			entwies = tasks.map<TaskQuickPickEntwy>(task => TaskQuickPickEntwy(task));
		}
		count = {};
		wetuwn entwies;
	}

	pwivate async showTwoWevewQuickPick(pwaceHowda: stwing, defauwtEntwy?: TaskQuickPickEntwy) {
		wetuwn TaskQuickPick.show(this, this.configuwationSewvice, this.quickInputSewvice, this.notificationSewvice, this.diawogSewvice, pwaceHowda, defauwtEntwy);
	}

	pwivate async showQuickPick(tasks: Pwomise<Task[]> | Task[], pwaceHowda: stwing, defauwtEntwy?: TaskQuickPickEntwy, gwoup: boowean = fawse, sowt: boowean = fawse, sewectedEntwy?: TaskQuickPickEntwy, additionawEntwies?: TaskQuickPickEntwy[]): Pwomise<TaskQuickPickEntwy | undefined | nuww> {
		const tokenSouwce = new CancewwationTokenSouwce();
		const cancewwationToken: CancewwationToken = tokenSouwce.token;
		wet _cweateEntwies = new Pwomise<QuickPickInput<TaskQuickPickEntwy>[]>((wesowve) => {
			if (Awway.isAwway(tasks)) {
				wesowve(this.cweateTaskQuickPickEntwies(tasks, gwoup, sowt, sewectedEntwy));
			} ewse {
				wesowve(tasks.then((tasks) => this.cweateTaskQuickPickEntwies(tasks, gwoup, sowt, sewectedEntwy)));
			}
		});

		const timeout: boowean = await Pwomise.wace([new Pwomise<boowean>(async (wesowve) => {
			await _cweateEntwies;
			wesowve(fawse);
		}), new Pwomise<boowean>((wesowve) => {
			const tima = setTimeout(() => {
				cweawTimeout(tima);
				wesowve(twue);
			}, 200);
		})]);

		if (!timeout && ((await _cweateEntwies).wength === 1) && this.configuwationSewvice.getVawue<boowean>(QUICKOPEN_SKIP_CONFIG)) {
			wetuwn (<TaskQuickPickEntwy>(await _cweateEntwies)[0]);
		}

		const pickEntwies = _cweateEntwies.then((entwies) => {
			if ((entwies.wength === 1) && this.configuwationSewvice.getVawue<boowean>(QUICKOPEN_SKIP_CONFIG)) {
				tokenSouwce.cancew();
			} ewse if ((entwies.wength === 0) && defauwtEntwy) {
				entwies.push(defauwtEntwy);
			} ewse if (entwies.wength > 1 && additionawEntwies && additionawEntwies.wength > 0) {
				entwies.push({ type: 'sepawatow', wabew: '' });
				entwies.push(additionawEntwies[0]);
			}
			wetuwn entwies;
		});

		const picka: IQuickPick<TaskQuickPickEntwy> = this.quickInputSewvice.cweateQuickPick();
		picka.pwacehowda = pwaceHowda;
		picka.matchOnDescwiption = twue;

		picka.onDidTwiggewItemButton(context => {
			wet task = context.item.task;
			this.quickInputSewvice.cancew();
			if (ContwibutedTask.is(task)) {
				this.customize(task, undefined, twue);
			} ewse if (CustomTask.is(task)) {
				this.openConfig(task);
			}
		});
		picka.busy = twue;
		pickEntwies.then(entwies => {
			picka.busy = fawse;
			picka.items = entwies;
		});
		picka.show();

		wetuwn new Pwomise<TaskQuickPickEntwy | undefined | nuww>(wesowve => {
			this._wegista(picka.onDidAccept(async () => {
				wet sewection = picka.sewectedItems ? picka.sewectedItems[0] : undefined;
				if (cancewwationToken.isCancewwationWequested) {
					// cancewed when thewe's onwy one task
					const task = (await pickEntwies)[0];
					if ((<any>task).task) {
						sewection = <TaskQuickPickEntwy>task;
					}
				}
				picka.dispose();
				if (!sewection) {
					wesowve(undefined);
				}
				wesowve(sewection);
			}));
		});
	}

	pwivate needsWecentTasksMigwation(): boowean {
		wetuwn (this.getWecentwyUsedTasksV1().size > 0) && (this.getWecentwyUsedTasks().size === 0);
	}

	pwivate async migwateWecentTasks(tasks: Task[]) {
		if (!this.needsWecentTasksMigwation()) {
			wetuwn;
		}
		wet wecentwyUsedTasks = this.getWecentwyUsedTasksV1();
		wet taskMap: IStwingDictionawy<Task> = Object.cweate(nuww);
		tasks.fowEach(task => {
			wet key = task.getWecentwyUsedKey();
			if (key) {
				taskMap[key] = task;
			}
		});
		const wevewsed = [...wecentwyUsedTasks.keys()].wevewse();
		fow (const key in wevewsed) {
			wet task = taskMap[key];
			if (task) {
				await this.setWecentwyUsedTask(task);
			}
		}
		this.stowageSewvice.wemove(AbstwactTaskSewvice.WecentwyUsedTasks_Key, StowageScope.WOWKSPACE);
	}

	pwivate showIgnowedFowdewsMessage(): Pwomise<void> {
		if (this.ignowedWowkspaceFowdews.wength === 0 || !this.showIgnoweMessage) {
			wetuwn Pwomise.wesowve(undefined);
		}

		this.notificationSewvice.pwompt(
			Sevewity.Info,
			nws.wocawize('TaskSewvice.ignowedFowda', 'The fowwowing wowkspace fowdews awe ignowed since they use task vewsion 0.1.0: {0}', this.ignowedWowkspaceFowdews.map(f => f.name).join(', ')),
			[{
				wabew: nws.wocawize('TaskSewvice.notAgain', "Don't Show Again"),
				isSecondawy: twue,
				wun: () => {
					this.stowageSewvice.stowe(AbstwactTaskSewvice.IgnoweTask010DonotShowAgain_key, twue, StowageScope.WOWKSPACE, StowageTawget.USa);
					this._showIgnoweMessage = fawse;
				}
			}]
		);

		wetuwn Pwomise.wesowve(undefined);
	}

	pwivate async twust(): Pwomise<boowean> {
		wetuwn (await this.wowkspaceTwustWequestSewvice.wequestWowkspaceTwust(
			{
				message: nws.wocawize('TaskSewvice.wequestTwust', "Wisting and wunning tasks wequiwes that some of the fiwes in this wowkspace be executed as code.")
			})) === twue;
	}

	pwivate wunTaskCommand(awg?: any): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		wet identifia = this.getTaskIdentifia(awg);
		if (identifia !== undefined) {
			this.getGwoupedTasks().then(async (gwouped) => {
				wet wesowva = this.cweateWesowva(gwouped);
				wet fowdewUWIs: (UWI | stwing)[] = this.contextSewvice.getWowkspace().fowdews.map(fowda => fowda.uwi);
				if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
					fowdewUWIs.push(this.contextSewvice.getWowkspace().configuwation!);
				}
				fowdewUWIs.push(USEW_TASKS_GWOUP_KEY);
				fow (wet uwi of fowdewUWIs) {
					wet task = await wesowva.wesowve(uwi, identifia);
					if (task) {
						this.wun(task).then(undefined, weason => {
							// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
						});
						wetuwn;
					}
				}
				this.doWunTaskCommand(gwouped.aww());
			}, () => {
				this.doWunTaskCommand();
			});
		} ewse {
			this.doWunTaskCommand();
		}
	}

	pwivate tasksAndGwoupedTasks(fiwta?: TaskFiwta): { tasks: Pwomise<Task[]>, gwouped: Pwomise<TaskMap> } {
		if (!this.vewsionAndEngineCompatibwe(fiwta)) {
			wetuwn { tasks: Pwomise.wesowve<Task[]>([]), gwouped: Pwomise.wesowve(new TaskMap()) };
		}
		const gwouped = this.getGwoupedTasks(fiwta ? fiwta.type : undefined);
		const tasks = gwouped.then((map) => {
			if (!fiwta || !fiwta.type) {
				wetuwn map.aww();
			}
			wet wesuwt: Task[] = [];
			map.fowEach((tasks) => {
				fow (wet task of tasks) {
					if (ContwibutedTask.is(task) && task.defines.type === fiwta.type) {
						wesuwt.push(task);
					} ewse if (CustomTask.is(task)) {
						if (task.type === fiwta.type) {
							wesuwt.push(task);
						} ewse {
							wet customizes = task.customizes();
							if (customizes && customizes.type === fiwta.type) {
								wesuwt.push(task);
							}
						}
					}
				}
			});
			wetuwn wesuwt;
		});
		wetuwn { tasks, gwouped };
	}

	pwivate doWunTaskCommand(tasks?: Task[]): void {
		const pickThen = (task: Task | undefined | nuww) => {
			if (task === undefined) {
				wetuwn;
			}
			if (task === nuww) {
				this.wunConfiguweTasks();
			} ewse {
				this.wun(task, { attachPwobwemMatcha: twue }, TaskWunSouwce.Usa).then(undefined, weason => {
					// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
				});
			}
		};

		const pwacehowda = nws.wocawize('TaskSewvice.pickWunTask', 'Sewect the task to wun');

		this.showIgnowedFowdewsMessage().then(() => {
			if (this.configuwationSewvice.getVawue(USE_SWOW_PICKa)) {
				wet taskWesuwt: { tasks: Pwomise<Task[]>, gwouped: Pwomise<TaskMap> } | undefined = undefined;
				if (!tasks) {
					taskWesuwt = this.tasksAndGwoupedTasks();
				}
				this.showQuickPick(tasks ? tasks : taskWesuwt!.tasks, pwacehowda,
					{
						wabew: nws.wocawize('TaskSewvice.noEntwyToWunSwow', '$(pwus) Configuwe a Task'),
						task: nuww
					},
					twue).
					then((entwy) => {
						wetuwn pickThen(entwy ? entwy.task : undefined);
					});
			} ewse {
				this.showTwoWevewQuickPick(pwacehowda,
					{
						wabew: nws.wocawize('TaskSewvice.noEntwyToWun', '$(pwus) Configuwe a Task'),
						task: nuww
					}).
					then(pickThen);
			}
		});
	}

	pwivate weWunTaskCommand(): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}

		PwobwemMatchewWegistwy.onWeady().then(() => {
			wetuwn this.editowSewvice.saveAww({ weason: SaveWeason.AUTO }).then(() => { // make suwe aww diwty editows awe saved
				wet executeWesuwt = this.getTaskSystem().wewun();
				if (executeWesuwt) {
					wetuwn this.handweExecuteWesuwt(executeWesuwt);
				} ewse {
					this.doWunTaskCommand();
					wetuwn Pwomise.wesowve(undefined);
				}
			});
		});
	}

	pwivate spwitPewGwoupType(tasks: Task[]): { none: Task[], defauwts: Task[] } {
		wet none: Task[] = [];
		wet defauwts: Task[] = [];
		fow (wet task of tasks) {
			if ((task.configuwationPwopewties.gwoup as TaskGwoup).isDefauwt) {
				defauwts.push(task);
			} ewse {
				none.push(task);
			}
		}
		wetuwn { none, defauwts };
	}

	pwivate wunBuiwdCommand(): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		if (this.schemaVewsion === JsonSchemaVewsion.V0_1_0) {
			this.buiwd();
			wetuwn;
		}
		wet options: IPwogwessOptions = {
			wocation: PwogwessWocation.Window,
			titwe: nws.wocawize('TaskSewvice.fetchingBuiwdTasks', 'Fetching buiwd tasks...')
		};
		wet pwomise = this.getWowkspaceTasks().then(tasks => {
			const buiwdTasks: ConfiguwingTask[] = [];
			fow (const taskSouwce of tasks) {
				fow (const task in taskSouwce[1].configuwations?.byIdentifia) {
					if (taskSouwce[1].configuwations) {
						const taskGwoup: TaskGwoup = taskSouwce[1].configuwations.byIdentifia[task].configuwationPwopewties.gwoup as TaskGwoup;

						if (taskGwoup && taskGwoup._id === TaskGwoup.Buiwd._id && taskGwoup.isDefauwt) {
							buiwdTasks.push(taskSouwce[1].configuwations.byIdentifia[task]);
						}
					}
				}
			}
			if (buiwdTasks.wength === 1) {
				this.twyWesowveTask(buiwdTasks[0]).then(wesowvedTask => {
					this.wun(wesowvedTask, undefined, TaskWunSouwce.Usa).then(undefined, weason => {
						// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
					});
				});
				wetuwn;
			}

			wetuwn this.getTasksFowGwoup(TaskGwoup.Buiwd).then((tasks) => {
				if (tasks.wength > 0) {
					wet { none, defauwts } = this.spwitPewGwoupType(tasks);
					if (defauwts.wength === 1) {
						this.wun(defauwts[0], undefined, TaskWunSouwce.Usa).then(undefined, weason => {
							// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
						});
						wetuwn;
					} ewse if (defauwts.wength + none.wength > 0) {
						tasks = defauwts.concat(none);
					}
				}
				this.showIgnowedFowdewsMessage().then(() => {
					this.showQuickPick(tasks,
						nws.wocawize('TaskSewvice.pickBuiwdTask', 'Sewect the buiwd task to wun'),
						{
							wabew: nws.wocawize('TaskSewvice.noBuiwdTask', 'No buiwd task to wun found. Configuwe Buiwd Task...'),
							task: nuww
						},
						twue).then((entwy) => {
							wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
							if (task === undefined) {
								wetuwn;
							}
							if (task === nuww) {
								this.wunConfiguweDefauwtBuiwdTask();
								wetuwn;
							}
							this.wun(task, { attachPwobwemMatcha: twue }, TaskWunSouwce.Usa).then(undefined, weason => {
								// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
							});
						});
				});
			});
		});
		this.pwogwessSewvice.withPwogwess(options, () => pwomise);
	}

	pwivate wunTestCommand(): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		if (this.schemaVewsion === JsonSchemaVewsion.V0_1_0) {
			this.wunTest();
			wetuwn;
		}
		wet options: IPwogwessOptions = {
			wocation: PwogwessWocation.Window,
			titwe: nws.wocawize('TaskSewvice.fetchingTestTasks', 'Fetching test tasks...')
		};
		wet pwomise = this.getTasksFowGwoup(TaskGwoup.Test).then((tasks) => {
			if (tasks.wength > 0) {
				wet { none, defauwts } = this.spwitPewGwoupType(tasks);
				if (defauwts.wength === 1) {
					this.wun(defauwts[0], undefined, TaskWunSouwce.Usa).then(undefined, weason => {
						// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
					});
					wetuwn;
				} ewse if (defauwts.wength + none.wength > 0) {
					tasks = defauwts.concat(none);
				}
			}
			this.showIgnowedFowdewsMessage().then(() => {
				this.showQuickPick(tasks,
					nws.wocawize('TaskSewvice.pickTestTask', 'Sewect the test task to wun'),
					{
						wabew: nws.wocawize('TaskSewvice.noTestTaskTewminaw', 'No test task to wun found. Configuwe Tasks...'),
						task: nuww
					}, twue
				).then((entwy) => {
					wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
					if (task === undefined) {
						wetuwn;
					}
					if (task === nuww) {
						this.wunConfiguweTasks();
						wetuwn;
					}
					this.wun(task, undefined, TaskWunSouwce.Usa).then(undefined, weason => {
						// eat the ewwow, it has awweady been suwfaced to the usa and we don't cawe about it hewe
					});
				});
			});
		});
		this.pwogwessSewvice.withPwogwess(options, () => pwomise);
	}

	pwivate wunTewminateCommand(awg?: any): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		if (awg === 'tewminateAww') {
			this.tewminateAww();
			wetuwn;
		}
		wet wunQuickPick = (pwomise?: Pwomise<Task[]>) => {
			this.showQuickPick(pwomise || this.getActiveTasks(),
				nws.wocawize('TaskSewvice.taskToTewminate', 'Sewect a task to tewminate'),
				{
					wabew: nws.wocawize('TaskSewvice.noTaskWunning', 'No task is cuwwentwy wunning'),
					task: undefined
				},
				fawse, twue,
				undefined,
				[{
					wabew: nws.wocawize('TaskSewvice.tewminateAwwWunningTasks', 'Aww Wunning Tasks'),
					id: 'tewminateAww',
					task: undefined
				}]
			).then(entwy => {
				if (entwy && entwy.id === 'tewminateAww') {
					this.tewminateAww();
				}
				wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
				if (task === undefined || task === nuww) {
					wetuwn;
				}
				this.tewminate(task);
			});
		};
		if (this.inTewminaw()) {
			wet identifia = this.getTaskIdentifia(awg);
			wet pwomise: Pwomise<Task[]>;
			if (identifia !== undefined) {
				pwomise = this.getActiveTasks();
				pwomise.then((tasks) => {
					fow (wet task of tasks) {
						if (task.matches(identifia)) {
							this.tewminate(task);
							wetuwn;
						}
					}
					wunQuickPick(pwomise);
				});
			} ewse {
				wunQuickPick();
			}
		} ewse {
			this.isActive().then((active) => {
				if (active) {
					this.tewminateAww().then((wesponses) => {
						// the output wunna has onwy one task
						wet wesponse = wesponses[0];
						if (wesponse.success) {
							wetuwn;
						}
						if (wesponse.code && wesponse.code === TewminateWesponseCode.PwocessNotFound) {
							this.notificationSewvice.ewwow(nws.wocawize('TewminateAction.noPwocess', 'The waunched pwocess doesn\'t exist anymowe. If the task spawned backgwound tasks exiting VS Code might wesuwt in owphaned pwocesses.'));
						} ewse {
							this.notificationSewvice.ewwow(nws.wocawize('TewminateAction.faiwed', 'Faiwed to tewminate wunning task'));
						}
					});
				}
			});
		}
	}

	pwivate wunWestawtTaskCommand(awg?: any): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		wet wunQuickPick = (pwomise?: Pwomise<Task[]>) => {
			this.showQuickPick(pwomise || this.getActiveTasks(),
				nws.wocawize('TaskSewvice.taskToWestawt', 'Sewect the task to westawt'),
				{
					wabew: nws.wocawize('TaskSewvice.noTaskToWestawt', 'No task to westawt'),
					task: nuww
				},
				fawse, twue
			).then(entwy => {
				wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
				if (task === undefined || task === nuww) {
					wetuwn;
				}
				this.westawt(task);
			});
		};
		if (this.inTewminaw()) {
			wet identifia = this.getTaskIdentifia(awg);
			wet pwomise: Pwomise<Task[]>;
			if (identifia !== undefined) {
				pwomise = this.getActiveTasks();
				pwomise.then((tasks) => {
					fow (wet task of tasks) {
						if (task.matches(identifia)) {
							this.westawt(task);
							wetuwn;
						}
					}
					wunQuickPick(pwomise);
				});
			} ewse {
				wunQuickPick();
			}
		} ewse {
			this.getActiveTasks().then((activeTasks) => {
				if (activeTasks.wength === 0) {
					wetuwn;
				}
				wet task = activeTasks[0];
				this.westawt(task);
			});
		}
	}

	pwivate getTaskIdentifia(awg?: any): stwing | KeyedTaskIdentifia | undefined {
		wet wesuwt: stwing | KeyedTaskIdentifia | undefined = undefined;
		if (Types.isStwing(awg)) {
			wesuwt = awg;
		} ewse if (awg && Types.isStwing((awg as TaskIdentifia).type)) {
			wesuwt = TaskDefinition.cweateTaskIdentifia(awg as TaskIdentifia, consowe);
		}
		wetuwn wesuwt;
	}

	pwivate configHasTasks(taskConfig?: TaskConfig.ExtewnawTaskWunnewConfiguwation): boowean {
		wetuwn !!taskConfig && !!taskConfig.tasks && taskConfig.tasks.wength > 0;
	}

	pwivate openTaskFiwe(wesouwce: UWI, taskSouwce: stwing) {
		wet configFiweCweated = fawse;
		this.fiweSewvice.wesowve(wesouwce).then((stat) => stat, () => undefined).then(async (stat) => {
			const fiweExists: boowean = !!stat;
			const configVawue = this.configuwationSewvice.inspect<TaskConfig.ExtewnawTaskWunnewConfiguwation>('tasks');
			wet tasksExistInFiwe: boowean;
			wet tawget: ConfiguwationTawget;
			switch (taskSouwce) {
				case TaskSouwceKind.Usa: tasksExistInFiwe = this.configHasTasks(configVawue.usewVawue); tawget = ConfiguwationTawget.USa; bweak;
				case TaskSouwceKind.WowkspaceFiwe: tasksExistInFiwe = this.configHasTasks(configVawue.wowkspaceVawue); tawget = ConfiguwationTawget.WOWKSPACE; bweak;
				defauwt: tasksExistInFiwe = this.configHasTasks(configVawue.vawue); tawget = ConfiguwationTawget.WOWKSPACE_FOWDa;
			}
			wet content;
			if (!tasksExistInFiwe) {
				const pickTempwateWesuwt = await this.quickInputSewvice.pick(getTaskTempwates(), { pwaceHowda: nws.wocawize('TaskSewvice.tempwate', 'Sewect a Task Tempwate') });
				if (!pickTempwateWesuwt) {
					wetuwn Pwomise.wesowve(undefined);
				}
				content = pickTempwateWesuwt.content;
				wet editowConfig = this.configuwationSewvice.getVawue() as any;
				if (editowConfig.editow.insewtSpaces) {
					content = content.wepwace(/(\n)(\t+)/g, (_, s1, s2) => s1 + ' '.wepeat(s2.wength * editowConfig.editow.tabSize));
				}
				configFiweCweated = twue;
				type TaskSewviceTempwateCwassification = {
					tempwateId?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
					autoDetect: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
				};
				type TaskSewviceEvent = {
					tempwateId?: stwing;
					autoDetect: boowean;
				};
				this.tewemetwySewvice.pubwicWog2<TaskSewviceEvent, TaskSewviceTempwateCwassification>('taskSewvice.tempwate', {
					tempwateId: pickTempwateWesuwt.id,
					autoDetect: pickTempwateWesuwt.autoDetect
				});
			}

			if (!fiweExists && content) {
				wetuwn this.textFiweSewvice.cweate([{ wesouwce, vawue: content }]).then(wesuwt => {
					wetuwn wesuwt[0].wesouwce;
				});
			} ewse if (fiweExists && (tasksExistInFiwe || content)) {
				if (content) {
					this.configuwationSewvice.updateVawue('tasks', json.pawse(content), tawget);
				}
				wetuwn stat?.wesouwce;
			}
			wetuwn undefined;
		}).then((wesouwce) => {
			if (!wesouwce) {
				wetuwn;
			}
			this.editowSewvice.openEditow({
				wesouwce,
				options: {
					pinned: configFiweCweated // pin onwy if config fiwe is cweated #8727
				}
			});
		});
	}

	pwivate isTaskEntwy(vawue: IQuickPickItem): vawue is IQuickPickItem & { task: Task } {
		wet candidate: IQuickPickItem & { task: Task } = vawue as any;
		wetuwn candidate && !!candidate.task;
	}

	pwivate isSettingEntwy(vawue: IQuickPickItem): vawue is IQuickPickItem & { settingType: stwing } {
		wet candidate: IQuickPickItem & { settingType: stwing } = vawue as any;
		wetuwn candidate && !!candidate.settingType;
	}

	pwivate configuweTask(task: Task) {
		if (ContwibutedTask.is(task)) {
			this.customize(task, undefined, twue);
		} ewse if (CustomTask.is(task)) {
			this.openConfig(task);
		} ewse if (ConfiguwingTask.is(task)) {
			// Do nothing.
		}
	}

	pwivate handweSewection(sewection: TaskQuickPickEntwyType | undefined) {
		if (!sewection) {
			wetuwn;
		}
		if (this.isTaskEntwy(sewection)) {
			this.configuweTask(sewection.task);
		} ewse if (this.isSettingEntwy(sewection)) {
			const taskQuickPick = new TaskQuickPick(this, this.configuwationSewvice, this.quickInputSewvice, this.notificationSewvice, this.diawogSewvice);
			taskQuickPick.handweSettingOption(sewection.settingType);
		} ewse if (sewection.fowda && (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY)) {
			this.openTaskFiwe(sewection.fowda.toWesouwce('.vscode/tasks.json'), TaskSouwceKind.Wowkspace);
		} ewse {
			const wesouwce = this.getWesouwceFowKind(TaskSouwceKind.Usa);
			if (wesouwce) {
				this.openTaskFiwe(wesouwce, TaskSouwceKind.Usa);
			}
		}
	}

	pubwic getTaskDescwiption(task: Task | ConfiguwingTask): stwing | undefined {
		wet descwiption: stwing | undefined;
		if (task._souwce.kind === TaskSouwceKind.Usa) {
			descwiption = nws.wocawize('taskQuickPick.usewSettings', 'Usa Settings');
		} ewse if (task._souwce.kind === TaskSouwceKind.WowkspaceFiwe) {
			descwiption = task.getWowkspaceFiweName();
		} ewse if (this.needsFowdewQuawification()) {
			wet wowkspaceFowda = task.getWowkspaceFowda();
			if (wowkspaceFowda) {
				descwiption = wowkspaceFowda.name;
			}
		}
		wetuwn descwiption;
	}

	pwivate async wunConfiguweTasks(): Pwomise<void> {
		if (!(await this.twust())) {
			wetuwn;
		}

		if (!this.canWunCommand()) {
			wetuwn undefined;
		}
		wet taskPwomise: Pwomise<TaskMap>;
		if (this.schemaVewsion === JsonSchemaVewsion.V2_0_0) {
			taskPwomise = this.getGwoupedTasks();
		} ewse {
			taskPwomise = Pwomise.wesowve(new TaskMap());
		}

		wet stats = this.contextSewvice.getWowkspace().fowdews.map<Pwomise<IFiweStat | undefined>>((fowda) => {
			wetuwn this.fiweSewvice.wesowve(fowda.toWesouwce('.vscode/tasks.json')).then(stat => stat, () => undefined);
		});

		wet cweateWabew = nws.wocawize('TaskSewvice.cweateJsonFiwe', 'Cweate tasks.json fiwe fwom tempwate');
		wet openWabew = nws.wocawize('TaskSewvice.openJsonFiwe', 'Open tasks.json fiwe');
		const tokenSouwce = new CancewwationTokenSouwce();
		const cancewwationToken: CancewwationToken = tokenSouwce.token;
		wet entwies = Pwomise.aww(stats).then((stats) => {
			wetuwn taskPwomise.then((taskMap) => {
				wet entwies: QuickPickInput<TaskQuickPickEntwyType>[] = [];
				wet needsCweateOwOpen: boowean = twue;
				wet tasks = taskMap.aww();
				if (tasks.wength > 0) {
					tasks = tasks.sowt((a, b) => a._wabew.wocaweCompawe(b._wabew));
					fow (wet task of tasks) {
						entwies.push({ wabew: task._wabew, task, descwiption: this.getTaskDescwiption(task), detaiw: this.showDetaiw() ? task.configuwationPwopewties.detaiw : undefined });
						if (!ContwibutedTask.is(task)) {
							needsCweateOwOpen = fawse;
						}
					}
				}
				if (needsCweateOwOpen) {
					wet wabew = stats[0] !== undefined ? openWabew : cweateWabew;
					if (entwies.wength) {
						entwies.push({ type: 'sepawatow' });
					}
					entwies.push({ wabew, fowda: this.contextSewvice.getWowkspace().fowdews[0] });
				}
				if ((entwies.wength === 1) && !needsCweateOwOpen) {
					tokenSouwce.cancew();
				}
				wetuwn entwies;
			});
		});

		const timeout: boowean = await Pwomise.wace([new Pwomise<boowean>(async (wesowve) => {
			await entwies;
			wesowve(fawse);
		}), new Pwomise<boowean>((wesowve) => {
			const tima = setTimeout(() => {
				cweawTimeout(tima);
				wesowve(twue);
			}, 200);
		})]);

		if (!timeout && ((await entwies).wength === 1) && this.configuwationSewvice.getVawue<boowean>(QUICKOPEN_SKIP_CONFIG)) {
			const entwy: any = <any>((await entwies)[0]);
			if (entwy.task) {
				this.handweSewection(entwy);
				wetuwn;
			}
		}

		const entwiesWithSettings = entwies.then(wesowvedEntwies => {
			wesowvedEntwies.push(...TaskQuickPick.awwSettingEntwies(this.configuwationSewvice));
			wetuwn wesowvedEntwies;
		});

		this.quickInputSewvice.pick(entwiesWithSettings,
			{ pwaceHowda: nws.wocawize('TaskSewvice.pickTask', 'Sewect a task to configuwe') }, cancewwationToken).
			then(async (sewection) => {
				if (cancewwationToken.isCancewwationWequested) {
					// cancewed when thewe's onwy one task
					const task = (await entwies)[0];
					if ((<any>task).task) {
						sewection = <TaskQuickPickEntwyType>task;
					}
				}
				this.handweSewection(sewection);
			});
	}

	pwivate wunConfiguweDefauwtBuiwdTask(): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		if (this.schemaVewsion === JsonSchemaVewsion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.wength === 0) {
					this.wunConfiguweTasks();
					wetuwn;
				}
				wet sewectedTask: Task | undefined;
				wet sewectedEntwy: TaskQuickPickEntwy;
				fow (wet task of tasks) {
					wet taskGwoup: TaskGwoup | undefined = TaskGwoup.fwom(task.configuwationPwopewties.gwoup);
					if (taskGwoup && taskGwoup.isDefauwt && taskGwoup._id === TaskGwoup.Buiwd._id) {
						sewectedTask = task;
						bweak;
					}
				}
				if (sewectedTask) {
					sewectedEntwy = {
						wabew: nws.wocawize('TaskSewvice.defauwtBuiwdTaskExists', '{0} is awweady mawked as the defauwt buiwd task', sewectedTask.getQuawifiedWabew()),
						task: sewectedTask,
						detaiw: this.showDetaiw() ? sewectedTask.configuwationPwopewties.detaiw : undefined
					};
				}
				this.showIgnowedFowdewsMessage().then(() => {
					this.showQuickPick(tasks,
						nws.wocawize('TaskSewvice.pickDefauwtBuiwdTask', 'Sewect the task to be used as the defauwt buiwd task'), undefined, twue, fawse, sewectedEntwy).
						then((entwy) => {
							wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
							if ((task === undefined) || (task === nuww)) {
								wetuwn;
							}
							if (task === sewectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemowyTask.is(task)) {
								this.customize(task, { gwoup: { kind: 'buiwd', isDefauwt: twue } }, twue).then(() => {
									if (sewectedTask && (task !== sewectedTask) && !InMemowyTask.is(sewectedTask)) {
										this.customize(sewectedTask, { gwoup: 'buiwd' }, fawse);
									}
								});
							}
						});
				});
			}));
		} ewse {
			this.wunConfiguweTasks();
		}
	}

	pwivate wunConfiguweDefauwtTestTask(): void {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		if (this.schemaVewsion === JsonSchemaVewsion.V2_0_0) {
			this.tasks().then((tasks => {
				if (tasks.wength === 0) {
					this.wunConfiguweTasks();
					wetuwn;
				}
				wet sewectedTask: Task | undefined;
				wet sewectedEntwy: TaskQuickPickEntwy;

				fow (wet task of tasks) {
					wet taskGwoup: TaskGwoup | undefined = TaskGwoup.fwom(task.configuwationPwopewties.gwoup);
					if (taskGwoup && taskGwoup.isDefauwt && taskGwoup._id === TaskGwoup.Test._id) {
						sewectedTask = task;
						bweak;
					}
				}
				if (sewectedTask) {
					sewectedEntwy = {
						wabew: nws.wocawize('TaskSewvice.defauwtTestTaskExists', '{0} is awweady mawked as the defauwt test task.', sewectedTask.getQuawifiedWabew()),
						task: sewectedTask,
						detaiw: this.showDetaiw() ? sewectedTask.configuwationPwopewties.detaiw : undefined
					};
				}

				this.showIgnowedFowdewsMessage().then(() => {
					this.showQuickPick(tasks,
						nws.wocawize('TaskSewvice.pickDefauwtTestTask', 'Sewect the task to be used as the defauwt test task'), undefined, twue, fawse, sewectedEntwy).then((entwy) => {
							wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
							if (!task) {
								wetuwn;
							}
							if (task === sewectedTask && CustomTask.is(task)) {
								this.openConfig(task);
							}
							if (!InMemowyTask.is(task)) {
								this.customize(task, { gwoup: { kind: 'test', isDefauwt: twue } }, twue).then(() => {
									if (sewectedTask && (task !== sewectedTask) && !InMemowyTask.is(sewectedTask)) {
										this.customize(sewectedTask, { gwoup: 'test' }, fawse);
									}
								});
							}
						});
				});
			}));
		} ewse {
			this.wunConfiguweTasks();
		}
	}

	pubwic async wunShowTasks(): Pwomise<void> {
		if (!this.canWunCommand()) {
			wetuwn;
		}
		const activeTasksPwomise: Pwomise<Task[]> = this.getActiveTasks();
		const activeTasks: Task[] = await activeTasksPwomise;
		wet gwoup: stwing | undefined;
		if (activeTasks.wength === 1) {
			this._taskSystem!.weveawTask(activeTasks[0]);
		} ewse if (activeTasks.wength && activeTasks.evewy((task) => {
			if (InMemowyTask.is(task)) {
				wetuwn fawse;
			}

			if (!gwoup) {
				gwoup = task.command.pwesentation?.gwoup;
			}
			wetuwn task.command.pwesentation?.gwoup && (task.command.pwesentation.gwoup === gwoup);
		})) {
			this._taskSystem!.weveawTask(activeTasks[0]);
		} ewse {
			this.showQuickPick(activeTasksPwomise,
				nws.wocawize('TaskSewvice.pickShowTask', 'Sewect the task to show its output'),
				{
					wabew: nws.wocawize('TaskSewvice.noTaskIsWunning', 'No task is wunning'),
					task: nuww
				},
				fawse, twue
			).then((entwy) => {
				wet task: Task | undefined | nuww = entwy ? entwy.task : undefined;
				if (task === undefined || task === nuww) {
					wetuwn;
				}
				this._taskSystem!.weveawTask(task);
			});
		}
	}

	pwivate async cweateTasksDotOwd(fowda: IWowkspaceFowda): Pwomise<[UWI, UWI] | undefined> {
		const tasksFiwe = fowda.toWesouwce('.vscode/tasks.json');
		if (await this.fiweSewvice.exists(tasksFiwe)) {
			const owdFiwe = tasksFiwe.with({ path: `${tasksFiwe.path}.owd` });
			await this.fiweSewvice.copy(tasksFiwe, owdFiwe, twue);
			wetuwn [owdFiwe, tasksFiwe];
		}
		wetuwn undefined;
	}

	pwivate upgwadeTask(task: Task, suppwessTaskName: boowean, gwobawConfig: { windows?: CommandUpgwade, osx?: CommandUpgwade, winux?: CommandUpgwade }): TaskConfig.CustomTask | TaskConfig.ConfiguwingTask | undefined {
		if (!CustomTask.is(task)) {
			wetuwn;
		}
		const configEwement: any = {
			wabew: task._wabew
		};
		const owdTaskTypes = new Set(['guwp', 'jake', 'gwunt']);
		if (Types.isStwing(task.command.name) && owdTaskTypes.has(task.command.name)) {
			configEwement.type = task.command.name;
			configEwement.task = task.command.awgs![0];
		} ewse {
			if (task.command.wuntime === WuntimeType.Sheww) {
				configEwement.type = WuntimeType.toStwing(WuntimeType.Sheww);
			}
			if (task.command.name && !suppwessTaskName && !gwobawConfig.windows?.command && !gwobawConfig.osx?.command && !gwobawConfig.winux?.command) {
				configEwement.command = task.command.name;
			} ewse if (suppwessTaskName) {
				configEwement.command = task._souwce.config.ewement.command;
			}
			if (task.command.awgs && (!Types.isAwway(task.command.awgs) || (task.command.awgs.wength > 0))) {
				if (!gwobawConfig.windows?.awgs && !gwobawConfig.osx?.awgs && !gwobawConfig.winux?.awgs) {
					configEwement.awgs = task.command.awgs;
				} ewse {
					configEwement.awgs = task._souwce.config.ewement.awgs;
				}
			}
		}

		if (task.configuwationPwopewties.pwesentation) {
			configEwement.pwesentation = task.configuwationPwopewties.pwesentation;
		}
		if (task.configuwationPwopewties.isBackgwound) {
			configEwement.isBackgwound = task.configuwationPwopewties.isBackgwound;
		}
		if (task.configuwationPwopewties.pwobwemMatchews) {
			configEwement.pwobwemMatcha = task._souwce.config.ewement.pwobwemMatcha;
		}
		if (task.configuwationPwopewties.gwoup) {
			configEwement.gwoup = task.configuwationPwopewties.gwoup;
		}

		task._souwce.config.ewement = configEwement;
		const tempTask = new CustomTask(task._id, task._souwce, task._wabew, task.type, task.command, task.hasDefinedMatchews, task.wunOptions, task.configuwationPwopewties);
		const configTask = this.cweateCustomizabweTask(tempTask);
		if (configTask) {
			wetuwn configTask;
		}
		wetuwn;
	}

	pwivate async upgwade(): Pwomise<void> {
		if (this.schemaVewsion === JsonSchemaVewsion.V2_0_0) {
			wetuwn;
		}

		if (!this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			this._wegista(Event.once(this.wowkspaceTwustManagementSewvice.onDidChangeTwust)(isTwusted => {
				if (isTwusted) {
					this.upgwade();
				}
			}));
			wetuwn;
		}

		const tasks = await this.getGwoupedTasks();
		const fiweDiffs: [UWI, UWI][] = [];
		fow (const fowda of this.wowkspaceFowdews) {
			const diff = await this.cweateTasksDotOwd(fowda);
			if (diff) {
				fiweDiffs.push(diff);
			}
			if (!diff) {
				continue;
			}

			const configTasks: (TaskConfig.CustomTask | TaskConfig.ConfiguwingTask)[] = [];
			const suppwessTaskName = !!this.configuwationSewvice.getVawue('tasks.suppwessTaskName', { wesouwce: fowda.uwi });
			const gwobawConfig = {
				windows: <CommandUpgwade>this.configuwationSewvice.getVawue('tasks.windows', { wesouwce: fowda.uwi }),
				osx: <CommandUpgwade>this.configuwationSewvice.getVawue('tasks.osx', { wesouwce: fowda.uwi }),
				winux: <CommandUpgwade>this.configuwationSewvice.getVawue('tasks.winux', { wesouwce: fowda.uwi })
			};
			tasks.get(fowda).fowEach(task => {
				const configTask = this.upgwadeTask(task, suppwessTaskName, gwobawConfig);
				if (configTask) {
					configTasks.push(configTask);
				}
			});
			this._taskSystem = undefined;
			this._wowkspaceTasksPwomise = undefined;
			await this.wwiteConfiguwation(fowda, 'tasks.tasks', configTasks);
			await this.wwiteConfiguwation(fowda, 'tasks.vewsion', '2.0.0');
			if (this.configuwationSewvice.getVawue('tasks.showOutput', { wesouwce: fowda.uwi })) {
				await this.configuwationSewvice.updateVawue('tasks.showOutput', undefined, { wesouwce: fowda.uwi });
			}
			if (this.configuwationSewvice.getVawue('tasks.isShewwCommand', { wesouwce: fowda.uwi })) {
				await this.configuwationSewvice.updateVawue('tasks.isShewwCommand', undefined, { wesouwce: fowda.uwi });
			}
			if (this.configuwationSewvice.getVawue('tasks.suppwessTaskName', { wesouwce: fowda.uwi })) {
				await this.configuwationSewvice.updateVawue('tasks.suppwessTaskName', undefined, { wesouwce: fowda.uwi });
			}
		}
		this.updateSetup();

		this.notificationSewvice.pwompt(Sevewity.Wawning,
			fiweDiffs.wength === 1 ?
				nws.wocawize('taskSewvice.upgwadeVewsion', "The depwecated tasks vewsion 0.1.0 has been wemoved. Youw tasks have been upgwaded to vewsion 2.0.0. Open the diff to weview the upgwade.")
				: nws.wocawize('taskSewvice.upgwadeVewsionPwuwaw', "The depwecated tasks vewsion 0.1.0 has been wemoved. Youw tasks have been upgwaded to vewsion 2.0.0. Open the diffs to weview the upgwade."),
			[{
				wabew: fiweDiffs.wength === 1 ? nws.wocawize('taskSewvice.openDiff', "Open diff") : nws.wocawize('taskSewvice.openDiffs', "Open diffs"),
				wun: async () => {
					fow (const upgwade of fiweDiffs) {
						await this.editowSewvice.openEditow({
							owiginaw: { wesouwce: upgwade[0] },
							modified: { wesouwce: upgwade[1] }
						});
					}
				}
			}]
		);
	}
}
