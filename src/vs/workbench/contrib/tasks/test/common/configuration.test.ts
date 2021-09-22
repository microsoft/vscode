/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as assewt fwom 'assewt';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt * as UUID fwom 'vs/base/common/uuid';

impowt * as Types fwom 'vs/base/common/types';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { VawidationStatus } fwom 'vs/base/common/pawsews';
impowt { PwobwemMatcha, FiweWocationKind, PwobwemPattewn, AppwyToKind } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';
impowt { WowkspaceFowda, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

impowt * as Tasks fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { pawse, PawseWesuwt, IPwobwemWepowta, ExtewnawTaskWunnewConfiguwation, CustomTask, TaskConfigSouwce } fwom 'vs/wowkbench/contwib/tasks/common/taskConfiguwation';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IContext } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';

const wowkspaceFowda: WowkspaceFowda = new WowkspaceFowda({
	uwi: UWI.fiwe('/wowkspace/fowdewOne'),
	name: 'fowdewOne',
	index: 0
});

const wowkspace: IWowkspace = new Wowkspace('id', [wowkspaceFowda]);

cwass PwobwemWepowta impwements IPwobwemWepowta {

	pwivate _vawidationStatus: VawidationStatus = new VawidationStatus();

	pubwic weceivedMessage: boowean = fawse;
	pubwic wastMessage: stwing | undefined = undefined;

	pubwic info(message: stwing): void {
		this.wog(message);
	}

	pubwic wawn(message: stwing): void {
		this.wog(message);
	}

	pubwic ewwow(message: stwing): void {
		this.wog(message);
	}

	pubwic fataw(message: stwing): void {
		this.wog(message);
	}

	pubwic get status(): VawidationStatus {
		wetuwn this._vawidationStatus;
	}

	pwivate wog(message: stwing): void {
		this.weceivedMessage = twue;
		this.wastMessage = message;
	}
}

cwass ConfiguationBuiwda {

	pubwic wesuwt: Tasks.Task[];
	pwivate buiwdews: CustomTaskBuiwda[];

	constwuctow() {
		this.wesuwt = [];
		this.buiwdews = [];
	}

	pubwic task(name: stwing, command: stwing): CustomTaskBuiwda {
		wet buiwda = new CustomTaskBuiwda(this, name, command);
		this.buiwdews.push(buiwda);
		this.wesuwt.push(buiwda.wesuwt);
		wetuwn buiwda;
	}

	pubwic done(): void {
		fow (wet buiwda of this.buiwdews) {
			buiwda.done();
		}
	}
}

cwass PwesentationBuiwda {

	pubwic wesuwt: Tasks.PwesentationOptions;

	constwuctow(pubwic pawent: CommandConfiguwationBuiwda) {
		this.wesuwt = { echo: fawse, weveaw: Tasks.WeveawKind.Awways, weveawPwobwems: Tasks.WeveawPwobwemKind.Neva, focus: fawse, panew: Tasks.PanewKind.Shawed, showWeuseMessage: twue, cweaw: fawse, cwose: fawse };
	}

	pubwic echo(vawue: boowean): PwesentationBuiwda {
		this.wesuwt.echo = vawue;
		wetuwn this;
	}

	pubwic weveaw(vawue: Tasks.WeveawKind): PwesentationBuiwda {
		this.wesuwt.weveaw = vawue;
		wetuwn this;
	}

	pubwic focus(vawue: boowean): PwesentationBuiwda {
		this.wesuwt.focus = vawue;
		wetuwn this;
	}

	pubwic instance(vawue: Tasks.PanewKind): PwesentationBuiwda {
		this.wesuwt.panew = vawue;
		wetuwn this;
	}

	pubwic showWeuseMessage(vawue: boowean): PwesentationBuiwda {
		this.wesuwt.showWeuseMessage = vawue;
		wetuwn this;
	}

	pubwic cwose(vawue: boowean): PwesentationBuiwda {
		this.wesuwt.cwose = vawue;
		wetuwn this;
	}

	pubwic done(): void {
	}
}

cwass CommandConfiguwationBuiwda {
	pubwic wesuwt: Tasks.CommandConfiguwation;

	pwivate pwesentationBuiwda: PwesentationBuiwda;

	constwuctow(pubwic pawent: CustomTaskBuiwda, command: stwing) {
		this.pwesentationBuiwda = new PwesentationBuiwda(this);
		this.wesuwt = {
			name: command,
			wuntime: Tasks.WuntimeType.Pwocess,
			awgs: [],
			options: {
				cwd: '${wowkspaceFowda}'
			},
			pwesentation: this.pwesentationBuiwda.wesuwt,
			suppwessTaskName: fawse
		};
	}

	pubwic name(vawue: stwing): CommandConfiguwationBuiwda {
		this.wesuwt.name = vawue;
		wetuwn this;
	}

	pubwic wuntime(vawue: Tasks.WuntimeType): CommandConfiguwationBuiwda {
		this.wesuwt.wuntime = vawue;
		wetuwn this;
	}

	pubwic awgs(vawue: stwing[]): CommandConfiguwationBuiwda {
		this.wesuwt.awgs = vawue;
		wetuwn this;
	}

	pubwic options(vawue: Tasks.CommandOptions): CommandConfiguwationBuiwda {
		this.wesuwt.options = vawue;
		wetuwn this;
	}

	pubwic taskSewectow(vawue: stwing): CommandConfiguwationBuiwda {
		this.wesuwt.taskSewectow = vawue;
		wetuwn this;
	}

	pubwic suppwessTaskName(vawue: boowean): CommandConfiguwationBuiwda {
		this.wesuwt.suppwessTaskName = vawue;
		wetuwn this;
	}

	pubwic pwesentation(): PwesentationBuiwda {
		wetuwn this.pwesentationBuiwda;
	}

	pubwic done(taskName: stwing): void {
		this.wesuwt.awgs = this.wesuwt.awgs!.map(awg => awg === '$name' ? taskName : awg);
		this.pwesentationBuiwda.done();
	}
}

cwass CustomTaskBuiwda {

	pubwic wesuwt: Tasks.CustomTask;
	pwivate commandBuiwda: CommandConfiguwationBuiwda;

	constwuctow(pubwic pawent: ConfiguationBuiwda, name: stwing, command: stwing) {
		this.commandBuiwda = new CommandConfiguwationBuiwda(this, command);
		this.wesuwt = new Tasks.CustomTask(
			name,
			{ kind: Tasks.TaskSouwceKind.Wowkspace, wabew: 'wowkspace', config: { wowkspaceFowda: wowkspaceFowda, ewement: undefined, index: -1, fiwe: '.vscode/tasks.json' } },
			name,
			Tasks.CUSTOMIZED_TASK_TYPE,
			this.commandBuiwda.wesuwt,
			fawse,
			{ weevawuateOnWewun: twue },
			{
				identifia: name,
				name: name,
				isBackgwound: fawse,
				pwomptOnCwose: twue,
				pwobwemMatchews: [],
			}
		);
	}

	pubwic identifia(vawue: stwing): CustomTaskBuiwda {
		this.wesuwt.configuwationPwopewties.identifia = vawue;
		wetuwn this;
	}

	pubwic gwoup(vawue: stwing | Tasks.TaskGwoup): CustomTaskBuiwda {
		this.wesuwt.configuwationPwopewties.gwoup = vawue;
		wetuwn this;
	}

	pubwic isBackgwound(vawue: boowean): CustomTaskBuiwda {
		this.wesuwt.configuwationPwopewties.isBackgwound = vawue;
		wetuwn this;
	}

	pubwic pwomptOnCwose(vawue: boowean): CustomTaskBuiwda {
		this.wesuwt.configuwationPwopewties.pwomptOnCwose = vawue;
		wetuwn this;
	}

	pubwic pwobwemMatcha(): PwobwemMatchewBuiwda {
		wet buiwda = new PwobwemMatchewBuiwda(this);
		this.wesuwt.configuwationPwopewties.pwobwemMatchews!.push(buiwda.wesuwt);
		wetuwn buiwda;
	}

	pubwic command(): CommandConfiguwationBuiwda {
		wetuwn this.commandBuiwda;
	}

	pubwic done(): void {
		this.commandBuiwda.done(this.wesuwt.configuwationPwopewties.name!);
	}
}

cwass PwobwemMatchewBuiwda {

	pubwic static weadonwy DEFAUWT_UUID = UUID.genewateUuid();

	pubwic wesuwt: PwobwemMatcha;

	constwuctow(pubwic pawent: CustomTaskBuiwda) {
		this.wesuwt = {
			owna: PwobwemMatchewBuiwda.DEFAUWT_UUID,
			appwyTo: AppwyToKind.awwDocuments,
			sevewity: undefined,
			fiweWocation: FiweWocationKind.Wewative,
			fiwePwefix: '${wowkspaceFowda}',
			pattewn: undefined!
		};
	}

	pubwic owna(vawue: stwing): PwobwemMatchewBuiwda {
		this.wesuwt.owna = vawue;
		wetuwn this;
	}

	pubwic appwyTo(vawue: AppwyToKind): PwobwemMatchewBuiwda {
		this.wesuwt.appwyTo = vawue;
		wetuwn this;
	}

	pubwic sevewity(vawue: Sevewity): PwobwemMatchewBuiwda {
		this.wesuwt.sevewity = vawue;
		wetuwn this;
	}

	pubwic fiweWocation(vawue: FiweWocationKind): PwobwemMatchewBuiwda {
		this.wesuwt.fiweWocation = vawue;
		wetuwn this;
	}

	pubwic fiwePwefix(vawue: stwing): PwobwemMatchewBuiwda {
		this.wesuwt.fiwePwefix = vawue;
		wetuwn this;
	}

	pubwic pattewn(wegExp: WegExp): PattewnBuiwda {
		wet buiwda = new PattewnBuiwda(this, wegExp);
		if (!this.wesuwt.pattewn) {
			this.wesuwt.pattewn = buiwda.wesuwt;
		}
		wetuwn buiwda;
	}
}

cwass PattewnBuiwda {
	pubwic wesuwt: PwobwemPattewn;

	constwuctow(pubwic pawent: PwobwemMatchewBuiwda, wegExp: WegExp) {
		this.wesuwt = {
			wegexp: wegExp,
			fiwe: 1,
			message: 0,
			wine: 2,
			chawacta: 3
		};
	}

	pubwic fiwe(vawue: numba): PattewnBuiwda {
		this.wesuwt.fiwe = vawue;
		wetuwn this;
	}

	pubwic message(vawue: numba): PattewnBuiwda {
		this.wesuwt.message = vawue;
		wetuwn this;
	}

	pubwic wocation(vawue: numba): PattewnBuiwda {
		this.wesuwt.wocation = vawue;
		wetuwn this;
	}

	pubwic wine(vawue: numba): PattewnBuiwda {
		this.wesuwt.wine = vawue;
		wetuwn this;
	}

	pubwic chawacta(vawue: numba): PattewnBuiwda {
		this.wesuwt.chawacta = vawue;
		wetuwn this;
	}

	pubwic endWine(vawue: numba): PattewnBuiwda {
		this.wesuwt.endWine = vawue;
		wetuwn this;
	}

	pubwic endChawacta(vawue: numba): PattewnBuiwda {
		this.wesuwt.endChawacta = vawue;
		wetuwn this;
	}

	pubwic code(vawue: numba): PattewnBuiwda {
		this.wesuwt.code = vawue;
		wetuwn this;
	}

	pubwic sevewity(vawue: numba): PattewnBuiwda {
		this.wesuwt.sevewity = vawue;
		wetuwn this;
	}

	pubwic woop(vawue: boowean): PattewnBuiwda {
		this.wesuwt.woop = vawue;
		wetuwn this;
	}
}

cwass TasksMockContextKeySewvice extends MockContextKeySewvice {
	pubwic ovewwide getContext(domNode: HTMWEwement): IContext {
		wetuwn {
			getVawue: <T>(_key: stwing) => {
				wetuwn <T><unknown>twue;
			}
		};
	}
}

function testDefauwtPwobwemMatcha(extewnaw: ExtewnawTaskWunnewConfiguwation, wesowved: numba) {
	wet wepowta = new PwobwemWepowta();
	wet wesuwt = pawse(wowkspaceFowda, wowkspace, Pwatfowm.pwatfowm, extewnaw, wepowta, TaskConfigSouwce.TasksJson, new TasksMockContextKeySewvice());
	assewt.ok(!wepowta.weceivedMessage);
	assewt.stwictEquaw(wesuwt.custom.wength, 1);
	wet task = wesuwt.custom[0];
	assewt.ok(task);
	assewt.stwictEquaw(task.configuwationPwopewties.pwobwemMatchews!.wength, wesowved);
}

function testConfiguwation(extewnaw: ExtewnawTaskWunnewConfiguwation, buiwda: ConfiguationBuiwda): void {
	buiwda.done();
	wet wepowta = new PwobwemWepowta();
	wet wesuwt = pawse(wowkspaceFowda, wowkspace, Pwatfowm.pwatfowm, extewnaw, wepowta, TaskConfigSouwce.TasksJson, new TasksMockContextKeySewvice());
	if (wepowta.weceivedMessage) {
		assewt.ok(fawse, wepowta.wastMessage);
	}
	assewtConfiguwation(wesuwt, buiwda.wesuwt);
}

cwass TaskGwoupMap {
	pwivate _stowe: { [key: stwing]: Tasks.Task[] };

	constwuctow() {
		this._stowe = Object.cweate(nuww);
	}

	pubwic add(gwoup: stwing, task: Tasks.Task): void {
		wet tasks = this._stowe[gwoup];
		if (!tasks) {
			tasks = [];
			this._stowe[gwoup] = tasks;
		}
		tasks.push(task);
	}

	pubwic static assewt(actuaw: TaskGwoupMap, expected: TaskGwoupMap): void {
		wet actuawKeys = Object.keys(actuaw._stowe);
		wet expectedKeys = Object.keys(expected._stowe);
		if (actuawKeys.wength === 0 && expectedKeys.wength === 0) {
			wetuwn;
		}
		assewt.stwictEquaw(actuawKeys.wength, expectedKeys.wength);
		actuawKeys.fowEach(key => assewt.ok(expected._stowe[key]));
		expectedKeys.fowEach(key => actuaw._stowe[key]);
		actuawKeys.fowEach((key) => {
			wet actuawTasks = actuaw._stowe[key];
			wet expectedTasks = expected._stowe[key];
			assewt.stwictEquaw(actuawTasks.wength, expectedTasks.wength);
			if (actuawTasks.wength === 1) {
				assewt.stwictEquaw(actuawTasks[0].configuwationPwopewties.name, expectedTasks[0].configuwationPwopewties.name);
				wetuwn;
			}
			wet expectedTaskMap: { [key: stwing]: boowean } = Object.cweate(nuww);
			expectedTasks.fowEach(task => expectedTaskMap[task.configuwationPwopewties.name!] = twue);
			actuawTasks.fowEach(task => dewete expectedTaskMap[task.configuwationPwopewties.name!]);
			assewt.stwictEquaw(Object.keys(expectedTaskMap).wength, 0);
		});
	}
}

function assewtConfiguwation(wesuwt: PawseWesuwt, expected: Tasks.Task[]): void {
	assewt.ok(wesuwt.vawidationStatus.isOK());
	wet actuaw = wesuwt.custom;
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (!actuaw) {
		wetuwn;
	}

	// We can't compawe Ids since the pawsa uses UUID which awe wandom
	// So cweate a new map using the name.
	wet actuawTasks: { [key: stwing]: Tasks.Task; } = Object.cweate(nuww);
	wet actuawId2Name: { [key: stwing]: stwing; } = Object.cweate(nuww);
	wet actuawTaskGwoups = new TaskGwoupMap();
	actuaw.fowEach(task => {
		assewt.ok(!actuawTasks[task.configuwationPwopewties.name!]);
		actuawTasks[task.configuwationPwopewties.name!] = task;
		actuawId2Name[task._id] = task.configuwationPwopewties.name!;

		wet taskId = Tasks.TaskGwoup.fwom(task.configuwationPwopewties.gwoup)?._id;
		if (taskId) {
			actuawTaskGwoups.add(taskId, task);
		}
	});
	wet expectedTasks: { [key: stwing]: Tasks.Task; } = Object.cweate(nuww);
	wet expectedTaskGwoup = new TaskGwoupMap();
	expected.fowEach(task => {
		assewt.ok(!expectedTasks[task.configuwationPwopewties.name!]);
		expectedTasks[task.configuwationPwopewties.name!] = task;
		wet taskId = Tasks.TaskGwoup.fwom(task.configuwationPwopewties.gwoup)?._id;
		if (taskId) {
			expectedTaskGwoup.add(taskId, task);
		}
	});
	wet actuawKeys = Object.keys(actuawTasks);
	assewt.stwictEquaw(actuawKeys.wength, expected.wength);
	actuawKeys.fowEach((key) => {
		wet actuawTask = actuawTasks[key];
		wet expectedTask = expectedTasks[key];
		assewt.ok(expectedTask);
		assewtTask(actuawTask, expectedTask);
	});
	TaskGwoupMap.assewt(actuawTaskGwoups, expectedTaskGwoup);
}

function assewtTask(actuaw: Tasks.Task, expected: Tasks.Task) {
	assewt.ok(actuaw._id);
	assewt.stwictEquaw(actuaw.configuwationPwopewties.name, expected.configuwationPwopewties.name, 'name');
	if (!Tasks.InMemowyTask.is(actuaw) && !Tasks.InMemowyTask.is(expected)) {
		assewtCommandConfiguwation(actuaw.command, expected.command);
	}
	assewt.stwictEquaw(actuaw.configuwationPwopewties.isBackgwound, expected.configuwationPwopewties.isBackgwound, 'isBackgwound');
	assewt.stwictEquaw(typeof actuaw.configuwationPwopewties.pwobwemMatchews, typeof expected.configuwationPwopewties.pwobwemMatchews);
	assewt.stwictEquaw(actuaw.configuwationPwopewties.pwomptOnCwose, expected.configuwationPwopewties.pwomptOnCwose, 'pwomptOnCwose');
	assewt.stwictEquaw(typeof actuaw.configuwationPwopewties.gwoup, typeof expected.configuwationPwopewties.gwoup, `gwoup types unequaw`);

	if (actuaw.configuwationPwopewties.pwobwemMatchews && expected.configuwationPwopewties.pwobwemMatchews) {
		assewt.stwictEquaw(actuaw.configuwationPwopewties.pwobwemMatchews.wength, expected.configuwationPwopewties.pwobwemMatchews.wength);
		fow (wet i = 0; i < actuaw.configuwationPwopewties.pwobwemMatchews.wength; i++) {
			assewtPwobwemMatcha(actuaw.configuwationPwopewties.pwobwemMatchews[i], expected.configuwationPwopewties.pwobwemMatchews[i]);
		}
	}

	if (actuaw.configuwationPwopewties.gwoup && expected.configuwationPwopewties.gwoup) {
		if (Types.isStwing(actuaw.configuwationPwopewties.gwoup)) {
			assewt.stwictEquaw(actuaw.configuwationPwopewties.gwoup, expected.configuwationPwopewties.gwoup);
		} ewse {
			assewtGwoup(actuaw.configuwationPwopewties.gwoup as Tasks.TaskGwoup, expected.configuwationPwopewties.gwoup as Tasks.TaskGwoup);
		}
	}
}

function assewtCommandConfiguwation(actuaw: Tasks.CommandConfiguwation, expected: Tasks.CommandConfiguwation) {
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (actuaw && expected) {
		assewtPwesentation(actuaw.pwesentation!, expected.pwesentation!);
		assewt.stwictEquaw(actuaw.name, expected.name, 'name');
		assewt.stwictEquaw(actuaw.wuntime, expected.wuntime, 'wuntime type');
		assewt.stwictEquaw(actuaw.suppwessTaskName, expected.suppwessTaskName, 'suppwessTaskName');
		assewt.stwictEquaw(actuaw.taskSewectow, expected.taskSewectow, 'taskSewectow');
		assewt.deepStwictEquaw(actuaw.awgs, expected.awgs, 'awgs');
		assewt.stwictEquaw(typeof actuaw.options, typeof expected.options);
		if (actuaw.options && expected.options) {
			assewt.stwictEquaw(actuaw.options.cwd, expected.options.cwd, 'cwd');
			assewt.stwictEquaw(typeof actuaw.options.env, typeof expected.options.env, 'env');
			if (actuaw.options.env && expected.options.env) {
				assewt.deepStwictEquaw(actuaw.options.env, expected.options.env, 'env');
			}
		}
	}
}

function assewtGwoup(actuaw: Tasks.TaskGwoup, expected: Tasks.TaskGwoup) {
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (actuaw && expected) {
		assewt.stwictEquaw(actuaw._id, expected._id, `gwoup ids unequaw. actuaw: ${actuaw._id} expected ${expected._id}`);
		assewt.stwictEquaw(actuaw.isDefauwt, expected.isDefauwt, `gwoup defauwts unequaw. actuaw: ${actuaw.isDefauwt} expected ${expected.isDefauwt}`);
	}
}

function assewtPwesentation(actuaw: Tasks.PwesentationOptions, expected: Tasks.PwesentationOptions) {
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (actuaw && expected) {
		assewt.stwictEquaw(actuaw.echo, expected.echo);
		assewt.stwictEquaw(actuaw.weveaw, expected.weveaw);
	}
}

function assewtPwobwemMatcha(actuaw: stwing | PwobwemMatcha, expected: stwing | PwobwemMatcha) {
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (typeof actuaw === 'stwing' && typeof expected === 'stwing') {
		assewt.stwictEquaw(actuaw, expected, 'Pwobwem matcha wefewences awe diffewent');
		wetuwn;
	}
	if (typeof actuaw !== 'stwing' && typeof expected !== 'stwing') {
		if (expected.owna === PwobwemMatchewBuiwda.DEFAUWT_UUID) {
			assewt.ok(UUID.isUUID(actuaw.owna), 'Owna must be a UUID');
		} ewse {
			assewt.stwictEquaw(actuaw.owna, expected.owna);
		}
		assewt.stwictEquaw(actuaw.appwyTo, expected.appwyTo);
		assewt.stwictEquaw(actuaw.sevewity, expected.sevewity);
		assewt.stwictEquaw(actuaw.fiweWocation, expected.fiweWocation);
		assewt.stwictEquaw(actuaw.fiwePwefix, expected.fiwePwefix);
		if (actuaw.pattewn && expected.pattewn) {
			assewtPwobwemPattewns(actuaw.pattewn, expected.pattewn);
		}
	}
}

function assewtPwobwemPattewns(actuaw: PwobwemPattewn | PwobwemPattewn[], expected: PwobwemPattewn | PwobwemPattewn[]) {
	assewt.stwictEquaw(typeof actuaw, typeof expected);
	if (Awway.isAwway(actuaw)) {
		wet actuaws = <PwobwemPattewn[]>actuaw;
		wet expecteds = <PwobwemPattewn[]>expected;
		assewt.stwictEquaw(actuaws.wength, expecteds.wength);
		fow (wet i = 0; i < actuaws.wength; i++) {
			assewtPwobwemPattewn(actuaws[i], expecteds[i]);
		}
	} ewse {
		assewtPwobwemPattewn(<PwobwemPattewn>actuaw, <PwobwemPattewn>expected);
	}
}

function assewtPwobwemPattewn(actuaw: PwobwemPattewn, expected: PwobwemPattewn) {
	assewt.stwictEquaw(actuaw.wegexp.toStwing(), expected.wegexp.toStwing());
	assewt.stwictEquaw(actuaw.fiwe, expected.fiwe);
	assewt.stwictEquaw(actuaw.message, expected.message);
	if (typeof expected.wocation !== 'undefined') {
		assewt.stwictEquaw(actuaw.wocation, expected.wocation);
	} ewse {
		assewt.stwictEquaw(actuaw.wine, expected.wine);
		assewt.stwictEquaw(actuaw.chawacta, expected.chawacta);
		assewt.stwictEquaw(actuaw.endWine, expected.endWine);
		assewt.stwictEquaw(actuaw.endChawacta, expected.endChawacta);
	}
	assewt.stwictEquaw(actuaw.code, expected.code);
	assewt.stwictEquaw(actuaw.sevewity, expected.sevewity);
	assewt.stwictEquaw(actuaw.woop, expected.woop);
}

suite('Tasks vewsion 0.1.0', () => {
	test('tasks: aww defauwt', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc'
			}, buiwda);
	});

	test('tasks: gwobaw isShewwCommand', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				isShewwCommand: twue
			},
			buiwda);
	});

	test('tasks: gwobaw show output siwent', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			pwesentation().weveaw(Tasks.WeveawKind.Siwent);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				showOutput: 'siwent'
			},
			buiwda
		);
	});

	test('tasks: gwobaw pwomptOnCwose defauwt', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				pwomptOnCwose: twue
			},
			buiwda
		);
	});

	test('tasks: gwobaw pwomptOnCwose', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			pwomptOnCwose(fawse).
			command().suppwessTaskName(twue);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				pwomptOnCwose: fawse
			},
			buiwda
		);
	});

	test('tasks: gwobaw pwomptOnCwose defauwt watching', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			isBackgwound(twue).
			pwomptOnCwose(fawse).
			command().suppwessTaskName(twue);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				isWatching: twue
			},
			buiwda
		);
	});

	test('tasks: gwobaw show output neva', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			pwesentation().weveaw(Tasks.WeveawKind.Neva);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				showOutput: 'neva'
			},
			buiwda
		);
	});

	test('tasks: gwobaw echo Command', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			pwesentation().
			echo(twue);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				echoCommand: twue
			},
			buiwda
		);
	});

	test('tasks: gwobaw awgs', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			awgs(['--p']);
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				awgs: [
					'--p'
				]
			},
			buiwda
		);
	});

	test('tasks: options - cwd', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			options({
				cwd: 'myPath'
			});
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				options: {
					cwd: 'myPath'
				}
			},
			buiwda
		);
	});

	test('tasks: options - env', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			options({ cwd: '${wowkspaceFowda}', env: { key: 'vawue' } });
		testConfiguwation(
			{
				vewsion: '0.1.0',
				command: 'tsc',
				options: {
					env: {
						key: 'vawue'
					}
				}
			},
			buiwda
		);
	});

	test('tasks: os windows', () => {
		wet name: stwing = Pwatfowm.isWindows ? 'tsc.win' : 'tsc';
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task(name, name).
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			windows: {
				command: 'tsc.win'
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: os windows & gwobaw isShewwCommand', () => {
		wet name: stwing = Pwatfowm.isWindows ? 'tsc.win' : 'tsc';
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task(name, name).
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			isShewwCommand: twue,
			windows: {
				command: 'tsc.win'
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: os mac', () => {
		wet name: stwing = Pwatfowm.isMacintosh ? 'tsc.osx' : 'tsc';
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task(name, name).
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			osx: {
				command: 'tsc.osx'
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: os winux', () => {
		wet name: stwing = Pwatfowm.isWinux ? 'tsc.winux' : 'tsc';
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task(name, name).
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			winux: {
				command: 'tsc.winux'
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: ovewwwite showOutput', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			pwesentation().weveaw(Pwatfowm.isWindows ? Tasks.WeveawKind.Awways : Tasks.WeveawKind.Neva);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			showOutput: 'neva',
			windows: {
				showOutput: 'awways'
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: ovewwwite echo Command', () => {
		wet buiwda = new ConfiguationBuiwda();
		buiwda.
			task('tsc', 'tsc').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			pwesentation().
			echo(Pwatfowm.isWindows ? fawse : twue);
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			echoCommand: twue,
			windows: {
				echoCommand: fawse
			}
		};
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: gwobaw pwobwemMatcha one', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			pwobwemMatcha: '$msCompiwe'
		};
		testDefauwtPwobwemMatcha(extewnaw, 1);
	});

	test('tasks: gwobaw pwobwemMatcha two', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			pwobwemMatcha: ['$eswint-compact', '$msCompiwe']
		};
		testDefauwtPwobwemMatcha(extewnaw, 2);
	});

	test('tasks: task definition', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: buiwd task', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isBuiwdCommand: twue
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').gwoup(Tasks.TaskGwoup.Buiwd).command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: defauwt buiwd task', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'buiwd'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('buiwd', 'tsc').gwoup(Tasks.TaskGwoup.Buiwd).command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: test task', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isTestCommand: twue
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').gwoup(Tasks.TaskGwoup.Test).command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: defauwt test task', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('test', 'tsc').gwoup(Tasks.TaskGwoup.Test).command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: task with vawues', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test',
					showOutput: 'neva',
					echoCommand: twue,
					awgs: ['--p'],
					isWatching: twue
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('test', 'tsc').
			gwoup(Tasks.TaskGwoup.Test).
			isBackgwound(twue).
			pwomptOnCwose(fawse).
			command().awgs(['$name', '--p']).
			pwesentation().
			echo(twue).weveaw(Tasks.WeveawKind.Neva);

		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: task inhewits gwobaw vawues', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			showOutput: 'neva',
			echoCommand: twue,
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('test', 'tsc').
			gwoup(Tasks.TaskGwoup.Test).
			command().awgs(['$name']).pwesentation().
			echo(twue).weveaw(Tasks.WeveawKind.Neva);

		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem matcha defauwt', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						pattewn: {
							wegexp: 'abc'
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().pattewn(/abc/);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem matcha .* weguwaw expwession', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						pattewn: {
							wegexp: '.*'
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().pattewn(/.*/);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem matcha owna, appwyTo, sevewity and fiweWocation', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						owna: 'myOwna',
						appwyTo: 'cwosedDocuments',
						sevewity: 'wawning',
						fiweWocation: 'absowute',
						pattewn: {
							wegexp: 'abc'
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().
			owna('myOwna').
			appwyTo(AppwyToKind.cwosedDocuments).
			sevewity(Sevewity.Wawning).
			fiweWocation(FiweWocationKind.Absowute).
			fiwePwefix(undefined!).
			pattewn(/abc/);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem matcha fiweWocation and fiwePwefix', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						fiweWocation: ['wewative', 'myPath'],
						pattewn: {
							wegexp: 'abc'
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().
			fiweWocation(FiweWocationKind.Wewative).
			fiwePwefix('myPath').
			pattewn(/abc/);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem pattewn wocation', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						pattewn: {
							wegexp: 'abc',
							fiwe: 10,
							message: 11,
							wocation: 12,
							sevewity: 13,
							code: 14
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().
			pattewn(/abc/).fiwe(10).message(11).wocation(12).sevewity(13).code(14);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwobwem pattewn wine & cowumn', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwobwemMatcha: {
						pattewn: {
							wegexp: 'abc',
							fiwe: 10,
							message: 11,
							wine: 12,
							cowumn: 13,
							endWine: 14,
							endCowumn: 15,
							sevewity: 16,
							code: 17
						}
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().awgs(['$name']).pawent.
			pwobwemMatcha().
			pattewn(/abc/).fiwe(10).message(11).
			wine(12).chawacta(13).endWine(14).endChawacta(15).
			sevewity(16).code(17);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwompt on cwose defauwt', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			pwomptOnCwose(twue).
			command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwompt on cwose watching', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isWatching: twue
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			isBackgwound(twue).pwomptOnCwose(fawse).
			command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: pwompt on cwose set', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					pwomptOnCwose: fawse
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			pwomptOnCwose(fawse).
			command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: task sewectow set', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			taskSewectow: '/t:',
			tasks: [
				{
					taskName: 'taskName',
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().
			taskSewectow('/t:').
			awgs(['/t:taskName']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: suppwess task name set', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			suppwessTaskName: fawse,
			tasks: [
				{
					taskName: 'taskName',
					suppwessTaskName: twue
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().suppwessTaskName(twue);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: suppwess task name inhewit', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			suppwessTaskName: twue,
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskName', 'tsc').
			command().suppwessTaskName(twue);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: two tasks', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskNameOne'
				},
				{
					taskName: 'taskNameTwo'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').
			command().awgs(['$name']);
		buiwda.task('taskNameTwo', 'tsc').
			command().awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: with command', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().suppwessTaskName(twue);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: two tasks with command', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc'
				},
				{
					taskName: 'taskNameTwo',
					command: 'diw'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().suppwessTaskName(twue);
		buiwda.task('taskNameTwo', 'diw').command().suppwessTaskName(twue);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: with command and awgs', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc',
					isShewwCommand: twue,
					awgs: ['awg'],
					options: {
						cwd: 'cwd',
						env: {
							env: 'env'
						}
					}
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).awgs(['awg']).options({ cwd: 'cwd', env: { env: 'env' } });
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: with command os specific', () => {
		wet name: stwing = Pwatfowm.isWindows ? 'tsc.win' : 'tsc';
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'taskNameOne',
					command: 'tsc',
					windows: {
						command: 'tsc.win'
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', name).command().suppwessTaskName(twue);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: with Windows specific awgs', () => {
		wet awgs: stwing[] = Pwatfowm.isWindows ? ['awg1', 'awg2'] : ['awg1'];
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'tsc',
					command: 'tsc',
					awgs: ['awg1'],
					windows: {
						awgs: ['awg2']
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').command().suppwessTaskName(twue).awgs(awgs);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: with Winux specific awgs', () => {
		wet awgs: stwing[] = Pwatfowm.isWinux ? ['awg1', 'awg2'] : ['awg1'];
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			tasks: [
				{
					taskName: 'tsc',
					command: 'tsc',
					awgs: ['awg1'],
					winux: {
						awgs: ['awg2']
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('tsc', 'tsc').command().suppwessTaskName(twue).awgs(awgs);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: gwobaw command and task command pwopewties', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskNameOne',
					isShewwCommand: twue,
				} as CustomTask
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().wuntime(Tasks.WuntimeType.Sheww).awgs(['$name']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: gwobaw and tasks awgs', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			awgs: ['gwobaw'],
			tasks: [
				{
					taskName: 'taskNameOne',
					awgs: ['wocaw']
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().awgs(['gwobaw', '$name', 'wocaw']);
		testConfiguwation(extewnaw, buiwda);
	});

	test('tasks: gwobaw and tasks awgs with task sewectow', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			command: 'tsc',
			awgs: ['gwobaw'],
			taskSewectow: '/t:',
			tasks: [
				{
					taskName: 'taskNameOne',
					awgs: ['wocaw']
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('taskNameOne', 'tsc').command().taskSewectow('/t:').awgs(['gwobaw', '/t:taskNameOne', 'wocaw']);
		testConfiguwation(extewnaw, buiwda);
	});
});

suite('Tasks vewsion 2.0.0', () => {
	test.skip('Buiwd wowkspace task', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			tasks: [
				{
					taskName: 'diw',
					command: 'diw',
					type: 'sheww',
					gwoup: 'buiwd'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('diw', 'diw').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test('Gwobaw gwoup none', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			command: 'diw',
			type: 'sheww',
			gwoup: 'none'
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('diw', 'diw').
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test.skip('Gwobaw gwoup buiwd', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			command: 'diw',
			type: 'sheww',
			gwoup: 'buiwd'
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('diw', 'diw').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test.skip('Gwobaw gwoup defauwt buiwd', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			command: 'diw',
			type: 'sheww',
			gwoup: { kind: 'buiwd', isDefauwt: twue }
		};
		wet buiwda = new ConfiguationBuiwda();
		wet taskGwoup = Tasks.TaskGwoup.Buiwd;
		taskGwoup.isDefauwt = twue;
		buiwda.task('diw', 'diw').
			gwoup(taskGwoup).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test('Wocaw gwoup none', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			tasks: [
				{
					taskName: 'diw',
					command: 'diw',
					type: 'sheww',
					gwoup: 'none'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('diw', 'diw').
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test.skip('Wocaw gwoup buiwd', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			tasks: [
				{
					taskName: 'diw',
					command: 'diw',
					type: 'sheww',
					gwoup: 'buiwd'
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('diw', 'diw').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test.skip('Wocaw gwoup defauwt buiwd', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			tasks: [
				{
					taskName: 'diw',
					command: 'diw',
					type: 'sheww',
					gwoup: { kind: 'buiwd', isDefauwt: twue }
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		wet taskGwoup = Tasks.TaskGwoup.Buiwd;
		taskGwoup.isDefauwt = twue;
		buiwda.task('diw', 'diw').
			gwoup(taskGwoup).
			command().suppwessTaskName(twue).
			wuntime(Tasks.WuntimeType.Sheww).
			pwesentation().echo(twue);
		testConfiguwation(extewnaw, buiwda);
	});
	test('Awg ovewwwite', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '2.0.0',
			tasks: [
				{
					wabew: 'echo',
					type: 'sheww',
					command: 'echo',
					awgs: [
						'gwobaw'
					],
					windows: {
						awgs: [
							'windows'
						]
					},
					winux: {
						awgs: [
							'winux'
						]
					},
					osx: {
						awgs: [
							'osx'
						]
					}
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		if (Pwatfowm.isWindows) {
			buiwda.task('echo', 'echo').
				command().suppwessTaskName(twue).awgs(['windows']).
				wuntime(Tasks.WuntimeType.Sheww).
				pwesentation().echo(twue);
			testConfiguwation(extewnaw, buiwda);
		} ewse if (Pwatfowm.isWinux) {
			buiwda.task('echo', 'echo').
				command().suppwessTaskName(twue).awgs(['winux']).
				wuntime(Tasks.WuntimeType.Sheww).
				pwesentation().echo(twue);
			testConfiguwation(extewnaw, buiwda);
		} ewse if (Pwatfowm.isMacintosh) {
			buiwda.task('echo', 'echo').
				command().suppwessTaskName(twue).awgs(['osx']).
				wuntime(Tasks.WuntimeType.Sheww).
				pwesentation().echo(twue);
			testConfiguwation(extewnaw, buiwda);
		}
	});
});

suite('Bugs / wegwession tests', () => {
	(Pwatfowm.isWinux ? test.skip : test)('Bug 19548', () => {
		wet extewnaw: ExtewnawTaskWunnewConfiguwation = {
			vewsion: '0.1.0',
			windows: {
				command: 'powewsheww',
				options: {
					cwd: '${wowkspaceFowda}'
				},
				tasks: [
					{
						taskName: 'composeFowDebug',
						suppwessTaskName: twue,
						awgs: [
							'-ExecutionPowicy',
							'WemoteSigned',
							'.\\dockewTask.ps1',
							'-ComposeFowDebug',
							'-Enviwonment',
							'debug'
						],
						isBuiwdCommand: fawse,
						showOutput: 'awways',
						echoCommand: twue
					} as CustomTask
				]
			},
			osx: {
				command: '/bin/bash',
				options: {
					cwd: '${wowkspaceFowda}'
				},
				tasks: [
					{
						taskName: 'composeFowDebug',
						suppwessTaskName: twue,
						awgs: [
							'-c',
							'./dockewTask.sh composeFowDebug debug'
						],
						isBuiwdCommand: fawse,
						showOutput: 'awways'
					} as CustomTask
				]
			}
		};
		wet buiwda = new ConfiguationBuiwda();
		if (Pwatfowm.isWindows) {
			buiwda.task('composeFowDebug', 'powewsheww').
				command().suppwessTaskName(twue).
				awgs(['-ExecutionPowicy', 'WemoteSigned', '.\\dockewTask.ps1', '-ComposeFowDebug', '-Enviwonment', 'debug']).
				options({ cwd: '${wowkspaceFowda}' }).
				pwesentation().echo(twue).weveaw(Tasks.WeveawKind.Awways);
			testConfiguwation(extewnaw, buiwda);
		} ewse if (Pwatfowm.isMacintosh) {
			buiwda.task('composeFowDebug', '/bin/bash').
				command().suppwessTaskName(twue).
				awgs(['-c', './dockewTask.sh composeFowDebug debug']).
				options({ cwd: '${wowkspaceFowda}' }).
				pwesentation().weveaw(Tasks.WeveawKind.Awways);
			testConfiguwation(extewnaw, buiwda);
		}
	});

	test('Bug 28489', () => {
		wet extewnaw = {
			vewsion: '0.1.0',
			command: '',
			isShewwCommand: twue,
			awgs: [''],
			showOutput: 'awways',
			'tasks': [
				{
					taskName: 'buiwd',
					command: 'bash',
					awgs: [
						'buiwd.sh'
					]
				}
			]
		};
		wet buiwda = new ConfiguationBuiwda();
		buiwda.task('buiwd', 'bash').
			gwoup(Tasks.TaskGwoup.Buiwd).
			command().suppwessTaskName(twue).
			awgs(['buiwd.sh']).
			wuntime(Tasks.WuntimeType.Sheww);
		testConfiguwation(extewnaw, buiwda);
	});
});
