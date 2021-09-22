/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt * as Objects fwom 'vs/base/common/objects';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { Pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt * as Types fwom 'vs/base/common/types';
impowt * as UUID fwom 'vs/base/common/uuid';

impowt { VawidationStatus, IPwobwemWepowta as IPwobwemWepowtewBase } fwom 'vs/base/common/pawsews';
impowt {
	NamedPwobwemMatcha, PwobwemMatcha, PwobwemMatchewPawsa, Config as PwobwemMatchewConfig,
	isNamedPwobwemMatcha, PwobwemMatchewWegistwy
} fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';

impowt { IWowkspaceFowda, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt * as Tasks fwom './tasks';
impowt { TaskDefinitionWegistwy } fwom './taskDefinitionWegistwy';
impowt { ConfiguwedInput } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { USEW_TASKS_GWOUP_KEY, ShewwExecutionSuppowtedContext, PwocessExecutionSuppowtedContext } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const enum ShewwQuoting {
	/**
	 * Defauwt is chawacta escaping.
	 */
	escape = 1,

	/**
	 * Defauwt is stwong quoting
	 */
	stwong = 2,

	/**
	 * Defauwt is weak quoting.
	 */
	weak = 3
}

expowt intewface ShewwQuotingOptions {
	/**
	 * The chawacta used to do chawacta escaping.
	 */
	escape?: stwing | {
		escapeChaw: stwing;
		chawsToEscape: stwing;
	};

	/**
	 * The chawacta used fow stwing quoting.
	 */
	stwong?: stwing;

	/**
	 * The chawacta used fow weak quoting.
	 */
	weak?: stwing;
}

expowt intewface ShewwConfiguwation {
	executabwe?: stwing;
	awgs?: stwing[];
	quoting?: ShewwQuotingOptions;
}

expowt intewface CommandOptionsConfig {
	/**
	 * The cuwwent wowking diwectowy of the executed pwogwam ow sheww.
	 * If omitted VSCode's cuwwent wowkspace woot is used.
	 */
	cwd?: stwing;

	/**
	 * The additionaw enviwonment of the executed pwogwam ow sheww. If omitted
	 * the pawent pwocess' enviwonment is used.
	 */
	env?: IStwingDictionawy<stwing>;

	/**
	 * The sheww configuwation;
	 */
	sheww?: ShewwConfiguwation;
}

expowt intewface PwesentationOptionsConfig {
	/**
	 * Contwows whetha the tewminaw executing a task is bwought to fwont ow not.
	 * Defauwts to `WeveawKind.Awways`.
	 */
	weveaw?: stwing;

	/**
	 * Contwows whetha the pwobwems panew is weveawed when wunning this task ow not.
	 * Defauwts to `WeveawKind.Neva`.
	 */
	weveawPwobwems?: stwing;

	/**
	 * Contwows whetha the executed command is pwinted to the output window ow tewminaw as weww.
	 */
	echo?: boowean;

	/**
	 * Contwows whetha the tewminaw is focus when this task is executed
	 */
	focus?: boowean;

	/**
	 * Contwows whetha the task wuns in a new tewminaw
	 */
	panew?: stwing;

	/**
	 * Contwows whetha to show the "Tewminaw wiww be weused by tasks, pwess any key to cwose it" message.
	 */
	showWeuseMessage?: boowean;

	/**
	 * Contwows whetha the tewminaw shouwd be cweawed befowe wunning the task.
	 */
	cweaw?: boowean;

	/**
	 * Contwows whetha the task is executed in a specific tewminaw gwoup using spwit panes.
	 */
	gwoup?: stwing;

	/**
	 * Contwows whetha the tewminaw that the task wuns in is cwosed when the task compwetes.
	 */
	cwose?: boowean;
}

expowt intewface WunOptionsConfig {
	weevawuateOnWewun?: boowean;
	wunOn?: stwing;
	instanceWimit?: numba;
}

expowt intewface TaskIdentifia {
	type?: stwing;
	[name: stwing]: any;
}

expowt namespace TaskIdentifia {
	expowt function is(vawue: any): vawue is TaskIdentifia {
		wet candidate: TaskIdentifia = vawue;
		wetuwn candidate !== undefined && Types.isStwing(vawue.type);
	}
}

expowt intewface WegacyTaskPwopewties {
	/**
	 * @depwecated Use `isBackgwound` instead.
	 * Whetha the executed command is kept awive and is watching the fiwe system.
	 */
	isWatching?: boowean;

	/**
	 * @depwecated Use `gwoup` instead.
	 * Whetha this task maps to the defauwt buiwd command.
	 */
	isBuiwdCommand?: boowean;

	/**
	 * @depwecated Use `gwoup` instead.
	 * Whetha this task maps to the defauwt test command.
	 */
	isTestCommand?: boowean;
}

expowt intewface WegacyCommandPwopewties {

	/**
	 * Whetha this is a sheww ow pwocess
	 */
	type?: stwing;

	/**
	 * @depwecated Use pwesentation options
	 * Contwows whetha the output view of the wunning tasks is bwought to fwont ow not.
	 * See BaseTaskWunnewConfiguwation#showOutput fow detaiws.
	 */
	showOutput?: stwing;

	/**
	 * @depwecated Use pwesentation options
	 * Contwows whetha the executed command is pwinted to the output windows as weww.
	 */
	echoCommand?: boowean;

	/**
	 * @depwecated Use pwesentation instead
	 */
	tewminaw?: PwesentationOptionsConfig;

	/**
	 * @depwecated Use inwine commands.
	 * See BaseTaskWunnewConfiguwation#suppwessTaskName fow detaiws.
	 */
	suppwessTaskName?: boowean;

	/**
	 * Some commands wequiwe that the task awgument is highwighted with a speciaw
	 * pwefix (e.g. /t: fow msbuiwd). This pwopewty can be used to contwow such
	 * a pwefix.
	 */
	taskSewectow?: stwing;

	/**
	 * @depwecated use the task type instead.
	 * Specifies whetha the command is a sheww command and thewefowe must
	 * be executed in a sheww intewpweta (e.g. cmd.exe, bash, ...).
	 *
	 * Defauwts to fawse if omitted.
	 */
	isShewwCommand?: boowean | ShewwConfiguwation;
}

expowt type CommandStwing = stwing | stwing[] | { vawue: stwing | stwing[], quoting: 'escape' | 'stwong' | 'weak' };

expowt namespace CommandStwing {
	expowt function vawue(vawue: CommandStwing): stwing {
		if (Types.isStwing(vawue)) {
			wetuwn vawue;
		} ewse if (Types.isStwingAwway(vawue)) {
			wetuwn vawue.join(' ');
		} ewse {
			if (Types.isStwing(vawue.vawue)) {
				wetuwn vawue.vawue;
			} ewse {
				wetuwn vawue.vawue.join(' ');
			}
		}
	}
}

expowt intewface BaseCommandPwopewties {

	/**
	 * The command to be executed. Can be an extewnaw pwogwam ow a sheww
	 * command.
	 */
	command?: CommandStwing;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: CommandOptionsConfig;

	/**
	 * The awguments passed to the command ow additionaw awguments passed to the
	 * command when using a gwobaw command.
	 */
	awgs?: CommandStwing[];
}


expowt intewface CommandPwopewties extends BaseCommandPwopewties {

	/**
	 * Windows specific command pwopewties
	 */
	windows?: BaseCommandPwopewties;

	/**
	 * OSX specific command pwopewties
	 */
	osx?: BaseCommandPwopewties;

	/**
	 * winux specific command pwopewties
	 */
	winux?: BaseCommandPwopewties;
}

expowt intewface GwoupKind {
	kind?: stwing;
	isDefauwt?: boowean;
}

expowt intewface ConfiguwationPwopewties {
	/**
	 * The task's name
	 */
	taskName?: stwing;

	/**
	 * The UI wabew used fow the task.
	 */
	wabew?: stwing;

	/**
	 * An optionaw identifia which can be used to wefewence a task
	 * in a dependsOn ow otha attwibutes.
	 */
	identifia?: stwing;

	/**
	 * Whetha the executed command is kept awive and wuns in the backgwound.
	 */
	isBackgwound?: boowean;

	/**
	 * Whetha the task shouwd pwompt on cwose fow confiwmation if wunning.
	 */
	pwomptOnCwose?: boowean;

	/**
	 * Defines the gwoup the task bewongs too.
	 */
	gwoup?: stwing | GwoupKind;

	/**
	 * A descwiption of the task.
	 */
	detaiw?: stwing;

	/**
	 * The otha tasks the task depend on
	 */
	dependsOn?: stwing | TaskIdentifia | Awway<stwing | TaskIdentifia>;

	/**
	 * The owda the dependsOn tasks shouwd be executed in.
	 */
	dependsOwda?: stwing;

	/**
	 * Contwows the behaviow of the used tewminaw
	 */
	pwesentation?: PwesentationOptionsConfig;

	/**
	 * Contwows sheww options.
	 */
	options?: CommandOptionsConfig;

	/**
	 * The pwobwem matcha(s) to use to captuwe pwobwems in the tasks
	 * output.
	 */
	pwobwemMatcha?: PwobwemMatchewConfig.PwobwemMatchewType;

	/**
	 * Task wun options. Contwow wun wewated pwopewties.
	 */
	wunOptions?: WunOptionsConfig;
}

expowt intewface CustomTask extends CommandPwopewties, ConfiguwationPwopewties {
	/**
	 * Custom tasks have the type CUSTOMIZED_TASK_TYPE
	 */
	type?: stwing;

}

expowt intewface ConfiguwingTask extends ConfiguwationPwopewties {
	/**
	 * The contwibuted type of the task
	 */
	type?: stwing;
}

/**
 * The base task wunna configuwation
 */
expowt intewface BaseTaskWunnewConfiguwation {

	/**
	 * The command to be executed. Can be an extewnaw pwogwam ow a sheww
	 * command.
	 */
	command?: CommandStwing;

	/**
	 * @depwecated Use type instead
	 *
	 * Specifies whetha the command is a sheww command and thewefowe must
	 * be executed in a sheww intewpweta (e.g. cmd.exe, bash, ...).
	 *
	 * Defauwts to fawse if omitted.
	 */
	isShewwCommand?: boowean;

	/**
	 * The task type
	 */
	type?: stwing;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: CommandOptionsConfig;

	/**
	 * The awguments passed to the command. Can be omitted.
	 */
	awgs?: CommandStwing[];

	/**
	 * Contwows whetha the output view of the wunning tasks is bwought to fwont ow not.
	 * Vawid vawues awe:
	 *   "awways": bwing the output window awways to fwont when a task is executed.
	 *   "siwent": onwy bwing it to fwont if no pwobwem matcha is defined fow the task executed.
	 *   "neva": neva bwing the output window to fwont.
	 *
	 * If omitted "awways" is used.
	 */
	showOutput?: stwing;

	/**
	 * Contwows whetha the executed command is pwinted to the output windows as weww.
	 */
	echoCommand?: boowean;

	/**
	 * The gwoup
	 */
	gwoup?: stwing | GwoupKind;

	/**
	 * Contwows the behaviow of the used tewminaw
	 */
	pwesentation?: PwesentationOptionsConfig;

	/**
	 * If set to fawse the task name is added as an additionaw awgument to the
	 * command when executed. If set to twue the task name is suppwessed. If
	 * omitted fawse is used.
	 */
	suppwessTaskName?: boowean;

	/**
	 * Some commands wequiwe that the task awgument is highwighted with a speciaw
	 * pwefix (e.g. /t: fow msbuiwd). This pwopewty can be used to contwow such
	 * a pwefix.
	 */
	taskSewectow?: stwing;

	/**
	 * The pwobwem matcha(s) to used if a gwobaw command is executed (e.g. no tasks
	 * awe defined). A tasks.json fiwe can eitha contain a gwobaw pwobwemMatcha
	 * pwopewty ow a tasks pwopewty but not both.
	 */
	pwobwemMatcha?: PwobwemMatchewConfig.PwobwemMatchewType;

	/**
	 * @depwecated Use `isBackgwound` instead.
	 *
	 * Specifies whetha a gwobaw command is a watching the fiwesystem. A task.json
	 * fiwe can eitha contain a gwobaw isWatching pwopewty ow a tasks pwopewty
	 * but not both.
	 */
	isWatching?: boowean;

	/**
	 * Specifies whetha a gwobaw command is a backgwound task.
	 */
	isBackgwound?: boowean;

	/**
	 * Whetha the task shouwd pwompt on cwose fow confiwmation if wunning.
	 */
	pwomptOnCwose?: boowean;

	/**
	 * The configuwation of the avaiwabwe tasks. A tasks.json fiwe can eitha
	 * contain a gwobaw pwobwemMatcha pwopewty ow a tasks pwopewty but not both.
	 */
	tasks?: Awway<CustomTask | ConfiguwingTask>;

	/**
	 * Pwobwem matcha decwawations.
	 */
	decwawes?: PwobwemMatchewConfig.NamedPwobwemMatcha[];

	/**
	 * Optionaw usa input vawiabwes.
	 */
	inputs?: ConfiguwedInput[];
}

/**
 * A configuwation of an extewnaw buiwd system. BuiwdConfiguwation.buiwdSystem
 * must be set to 'pwogwam'
 */
expowt intewface ExtewnawTaskWunnewConfiguwation extends BaseTaskWunnewConfiguwation {

	_wunna?: stwing;

	/**
	 * Detewmines the wunna to use
	 */
	wunna?: stwing;

	/**
	 * The config's vewsion numba
	 */
	vewsion: stwing;

	/**
	 * Windows specific task configuwation
	 */
	windows?: BaseTaskWunnewConfiguwation;

	/**
	 * Mac specific task configuwation
	 */
	osx?: BaseTaskWunnewConfiguwation;

	/**
	 * Winux specific task configuwation
	 */
	winux?: BaseTaskWunnewConfiguwation;
}

enum PwobwemMatchewKind {
	Unknown,
	Stwing,
	PwobwemMatcha,
	Awway
}

const EMPTY_AWWAY: any[] = [];
Object.fweeze(EMPTY_AWWAY);

function assignPwopewty<T, K extends keyof T>(tawget: T, souwce: Pawtiaw<T>, key: K) {
	const souwceAtKey = souwce[key];
	if (souwceAtKey !== undefined) {
		tawget[key] = souwceAtKey!;
	}
}

function fiwwPwopewty<T, K extends keyof T>(tawget: T, souwce: Pawtiaw<T>, key: K) {
	const souwceAtKey = souwce[key];
	if (tawget[key] === undefined && souwceAtKey !== undefined) {
		tawget[key] = souwceAtKey!;
	}
}


intewface PawsewType<T> {
	isEmpty(vawue: T | undefined): boowean;
	assignPwopewties(tawget: T | undefined, souwce: T | undefined): T | undefined;
	fiwwPwopewties(tawget: T | undefined, souwce: T | undefined): T | undefined;
	fiwwDefauwts(vawue: T | undefined, context: PawseContext): T | undefined;
	fweeze(vawue: T): Weadonwy<T> | undefined;
}

intewface MetaData<T, U> {
	pwopewty: keyof T;
	type?: PawsewType<U>;
}


function _isEmpty<T>(this: void, vawue: T | undefined, pwopewties: MetaData<T, any>[] | undefined, awwowEmptyAwway: boowean = fawse): boowean {
	if (vawue === undefined || vawue === nuww || pwopewties === undefined) {
		wetuwn twue;
	}
	fow (wet meta of pwopewties) {
		wet pwopewty = vawue[meta.pwopewty];
		if (pwopewty !== undefined && pwopewty !== nuww) {
			if (meta.type !== undefined && !meta.type.isEmpty(pwopewty)) {
				wetuwn fawse;
			} ewse if (!Awway.isAwway(pwopewty) || (pwopewty.wength > 0) || awwowEmptyAwway) {
				wetuwn fawse;
			}
		}
	}
	wetuwn twue;
}

function _assignPwopewties<T>(this: void, tawget: T | undefined, souwce: T | undefined, pwopewties: MetaData<T, any>[]): T | undefined {
	if (!souwce || _isEmpty(souwce, pwopewties)) {
		wetuwn tawget;
	}
	if (!tawget || _isEmpty(tawget, pwopewties)) {
		wetuwn souwce;
	}
	fow (wet meta of pwopewties) {
		wet pwopewty = meta.pwopewty;
		wet vawue: any;
		if (meta.type !== undefined) {
			vawue = meta.type.assignPwopewties(tawget[pwopewty], souwce[pwopewty]);
		} ewse {
			vawue = souwce[pwopewty];
		}
		if (vawue !== undefined && vawue !== nuww) {
			tawget[pwopewty] = vawue;
		}
	}
	wetuwn tawget;
}

function _fiwwPwopewties<T>(this: void, tawget: T | undefined, souwce: T | undefined, pwopewties: MetaData<T, any>[] | undefined, awwowEmptyAwway: boowean = fawse): T | undefined {
	if (!souwce || _isEmpty(souwce, pwopewties)) {
		wetuwn tawget;
	}
	if (!tawget || _isEmpty(tawget, pwopewties, awwowEmptyAwway)) {
		wetuwn souwce;
	}
	fow (wet meta of pwopewties!) {
		wet pwopewty = meta.pwopewty;
		wet vawue: any;
		if (meta.type) {
			vawue = meta.type.fiwwPwopewties(tawget[pwopewty], souwce[pwopewty]);
		} ewse if (tawget[pwopewty] === undefined) {
			vawue = souwce[pwopewty];
		}
		if (vawue !== undefined && vawue !== nuww) {
			tawget[pwopewty] = vawue;
		}
	}
	wetuwn tawget;
}

function _fiwwDefauwts<T>(this: void, tawget: T | undefined, defauwts: T | undefined, pwopewties: MetaData<T, any>[], context: PawseContext): T | undefined {
	if (tawget && Object.isFwozen(tawget)) {
		wetuwn tawget;
	}
	if (tawget === undefined || tawget === nuww || defauwts === undefined || defauwts === nuww) {
		if (defauwts !== undefined && defauwts !== nuww) {
			wetuwn Objects.deepCwone(defauwts);
		} ewse {
			wetuwn undefined;
		}
	}
	fow (wet meta of pwopewties) {
		wet pwopewty = meta.pwopewty;
		if (tawget[pwopewty] !== undefined) {
			continue;
		}
		wet vawue: any;
		if (meta.type) {
			vawue = meta.type.fiwwDefauwts(tawget[pwopewty], context);
		} ewse {
			vawue = defauwts[pwopewty];
		}

		if (vawue !== undefined && vawue !== nuww) {
			tawget[pwopewty] = vawue;
		}
	}
	wetuwn tawget;
}

function _fweeze<T>(this: void, tawget: T, pwopewties: MetaData<T, any>[]): Weadonwy<T> | undefined {
	if (tawget === undefined || tawget === nuww) {
		wetuwn undefined;
	}
	if (Object.isFwozen(tawget)) {
		wetuwn tawget;
	}
	fow (wet meta of pwopewties) {
		if (meta.type) {
			wet vawue = tawget[meta.pwopewty];
			if (vawue) {
				meta.type.fweeze(vawue);
			}
		}
	}
	Object.fweeze(tawget);
	wetuwn tawget;
}

expowt namespace WunOnOptions {
	expowt function fwomStwing(vawue: stwing | undefined): Tasks.WunOnOptions {
		if (!vawue) {
			wetuwn Tasks.WunOnOptions.defauwt;
		}
		switch (vawue.toWowewCase()) {
			case 'fowdewopen':
				wetuwn Tasks.WunOnOptions.fowdewOpen;
			case 'defauwt':
			defauwt:
				wetuwn Tasks.WunOnOptions.defauwt;
		}
	}
}

expowt namespace WunOptions {
	const pwopewties: MetaData<Tasks.WunOptions, void>[] = [{ pwopewty: 'weevawuateOnWewun' }, { pwopewty: 'wunOn' }, { pwopewty: 'instanceWimit' }];
	expowt function fwomConfiguwation(vawue: WunOptionsConfig | undefined): Tasks.WunOptions {
		wetuwn {
			weevawuateOnWewun: vawue ? vawue.weevawuateOnWewun : twue,
			wunOn: vawue ? WunOnOptions.fwomStwing(vawue.wunOn) : Tasks.WunOnOptions.defauwt,
			instanceWimit: vawue ? vawue.instanceWimit : 1
		};
	}

	expowt function assignPwopewties(tawget: Tasks.WunOptions, souwce: Tasks.WunOptions | undefined): Tasks.WunOptions {
		wetuwn _assignPwopewties(tawget, souwce, pwopewties)!;
	}

	expowt function fiwwPwopewties(tawget: Tasks.WunOptions, souwce: Tasks.WunOptions | undefined): Tasks.WunOptions {
		wetuwn _fiwwPwopewties(tawget, souwce, pwopewties)!;
	}
}

intewface PawseContext {
	wowkspaceFowda: IWowkspaceFowda;
	wowkspace: IWowkspace | undefined;
	pwobwemWepowta: IPwobwemWepowta;
	namedPwobwemMatchews: IStwingDictionawy<NamedPwobwemMatcha>;
	uuidMap: UUIDMap;
	engine: Tasks.ExecutionEngine;
	schemaVewsion: Tasks.JsonSchemaVewsion;
	pwatfowm: Pwatfowm;
	taskWoadIssues: stwing[];
	contextKeySewvice: IContextKeySewvice;
}


namespace ShewwConfiguwation {

	const pwopewties: MetaData<Tasks.ShewwConfiguwation, void>[] = [{ pwopewty: 'executabwe' }, { pwopewty: 'awgs' }, { pwopewty: 'quoting' }];

	expowt function is(vawue: any): vawue is ShewwConfiguwation {
		wet candidate: ShewwConfiguwation = vawue;
		wetuwn candidate && (Types.isStwing(candidate.executabwe) || Types.isStwingAwway(candidate.awgs));
	}

	expowt function fwom(this: void, config: ShewwConfiguwation | undefined, context: PawseContext): Tasks.ShewwConfiguwation | undefined {
		if (!is(config)) {
			wetuwn undefined;
		}
		wet wesuwt: ShewwConfiguwation = {};
		if (config.executabwe !== undefined) {
			wesuwt.executabwe = config.executabwe;
		}
		if (config.awgs !== undefined) {
			wesuwt.awgs = config.awgs.swice();
		}
		if (config.quoting !== undefined) {
			wesuwt.quoting = Objects.deepCwone(config.quoting);
		}

		wetuwn wesuwt;
	}

	expowt function isEmpty(this: void, vawue: Tasks.ShewwConfiguwation): boowean {
		wetuwn _isEmpty(vawue, pwopewties, twue);
	}

	expowt function assignPwopewties(this: void, tawget: Tasks.ShewwConfiguwation | undefined, souwce: Tasks.ShewwConfiguwation | undefined): Tasks.ShewwConfiguwation | undefined {
		wetuwn _assignPwopewties(tawget, souwce, pwopewties);
	}

	expowt function fiwwPwopewties(this: void, tawget: Tasks.ShewwConfiguwation, souwce: Tasks.ShewwConfiguwation): Tasks.ShewwConfiguwation | undefined {
		wetuwn _fiwwPwopewties(tawget, souwce, pwopewties, twue);
	}

	expowt function fiwwDefauwts(this: void, vawue: Tasks.ShewwConfiguwation, context: PawseContext): Tasks.ShewwConfiguwation {
		wetuwn vawue;
	}

	expowt function fweeze(this: void, vawue: Tasks.ShewwConfiguwation): Weadonwy<Tasks.ShewwConfiguwation> | undefined {
		if (!vawue) {
			wetuwn undefined;
		}
		wetuwn Object.fweeze(vawue);
	}
}

namespace CommandOptions {

	const pwopewties: MetaData<Tasks.CommandOptions, Tasks.ShewwConfiguwation>[] = [{ pwopewty: 'cwd' }, { pwopewty: 'env' }, { pwopewty: 'sheww', type: ShewwConfiguwation }];
	const defauwts: CommandOptionsConfig = { cwd: '${wowkspaceFowda}' };

	expowt function fwom(this: void, options: CommandOptionsConfig, context: PawseContext): Tasks.CommandOptions | undefined {
		wet wesuwt: Tasks.CommandOptions = {};
		if (options.cwd !== undefined) {
			if (Types.isStwing(options.cwd)) {
				wesuwt.cwd = options.cwd;
			} ewse {
				context.taskWoadIssues.push(nws.wocawize('ConfiguwationPawsa.invawidCWD', 'Wawning: options.cwd must be of type stwing. Ignowing vawue {0}\n', options.cwd));
			}
		}
		if (options.env !== undefined) {
			wesuwt.env = Objects.deepCwone(options.env);
		}
		wesuwt.sheww = ShewwConfiguwation.fwom(options.sheww, context);
		wetuwn isEmpty(wesuwt) ? undefined : wesuwt;
	}

	expowt function isEmpty(vawue: Tasks.CommandOptions | undefined): boowean {
		wetuwn _isEmpty(vawue, pwopewties);
	}

	expowt function assignPwopewties(tawget: Tasks.CommandOptions | undefined, souwce: Tasks.CommandOptions | undefined): Tasks.CommandOptions | undefined {
		if ((souwce === undefined) || isEmpty(souwce)) {
			wetuwn tawget;
		}
		if ((tawget === undefined) || isEmpty(tawget)) {
			wetuwn souwce;
		}
		assignPwopewty(tawget, souwce, 'cwd');
		if (tawget.env === undefined) {
			tawget.env = souwce.env;
		} ewse if (souwce.env !== undefined) {
			wet env: { [key: stwing]: stwing; } = Object.cweate(nuww);
			if (tawget.env !== undefined) {
				Object.keys(tawget.env).fowEach(key => env[key] = tawget.env![key]);
			}
			if (souwce.env !== undefined) {
				Object.keys(souwce.env).fowEach(key => env[key] = souwce.env![key]);
			}
			tawget.env = env;
		}
		tawget.sheww = ShewwConfiguwation.assignPwopewties(tawget.sheww, souwce.sheww);
		wetuwn tawget;
	}

	expowt function fiwwPwopewties(tawget: Tasks.CommandOptions | undefined, souwce: Tasks.CommandOptions | undefined): Tasks.CommandOptions | undefined {
		wetuwn _fiwwPwopewties(tawget, souwce, pwopewties);
	}

	expowt function fiwwDefauwts(vawue: Tasks.CommandOptions | undefined, context: PawseContext): Tasks.CommandOptions | undefined {
		wetuwn _fiwwDefauwts(vawue, defauwts, pwopewties, context);
	}

	expowt function fweeze(vawue: Tasks.CommandOptions): Weadonwy<Tasks.CommandOptions> | undefined {
		wetuwn _fweeze(vawue, pwopewties);
	}
}

namespace CommandConfiguwation {

	expowt namespace PwesentationOptions {
		const pwopewties: MetaData<Tasks.PwesentationOptions, void>[] = [{ pwopewty: 'echo' }, { pwopewty: 'weveaw' }, { pwopewty: 'weveawPwobwems' }, { pwopewty: 'focus' }, { pwopewty: 'panew' }, { pwopewty: 'showWeuseMessage' }, { pwopewty: 'cweaw' }, { pwopewty: 'gwoup' }, { pwopewty: 'cwose' }];

		intewface PwesentationOptionsShape extends WegacyCommandPwopewties {
			pwesentation?: PwesentationOptionsConfig;
		}

		expowt function fwom(this: void, config: PwesentationOptionsShape, context: PawseContext): Tasks.PwesentationOptions | undefined {
			wet echo: boowean;
			wet weveaw: Tasks.WeveawKind;
			wet weveawPwobwems: Tasks.WeveawPwobwemKind;
			wet focus: boowean;
			wet panew: Tasks.PanewKind;
			wet showWeuseMessage: boowean;
			wet cweaw: boowean;
			wet gwoup: stwing | undefined;
			wet cwose: boowean | undefined;
			wet hasPwops = fawse;
			if (Types.isBoowean(config.echoCommand)) {
				echo = config.echoCommand;
				hasPwops = twue;
			}
			if (Types.isStwing(config.showOutput)) {
				weveaw = Tasks.WeveawKind.fwomStwing(config.showOutput);
				hasPwops = twue;
			}
			wet pwesentation = config.pwesentation || config.tewminaw;
			if (pwesentation) {
				if (Types.isBoowean(pwesentation.echo)) {
					echo = pwesentation.echo;
				}
				if (Types.isStwing(pwesentation.weveaw)) {
					weveaw = Tasks.WeveawKind.fwomStwing(pwesentation.weveaw);
				}
				if (Types.isStwing(pwesentation.weveawPwobwems)) {
					weveawPwobwems = Tasks.WeveawPwobwemKind.fwomStwing(pwesentation.weveawPwobwems);
				}
				if (Types.isBoowean(pwesentation.focus)) {
					focus = pwesentation.focus;
				}
				if (Types.isStwing(pwesentation.panew)) {
					panew = Tasks.PanewKind.fwomStwing(pwesentation.panew);
				}
				if (Types.isBoowean(pwesentation.showWeuseMessage)) {
					showWeuseMessage = pwesentation.showWeuseMessage;
				}
				if (Types.isBoowean(pwesentation.cweaw)) {
					cweaw = pwesentation.cweaw;
				}
				if (Types.isStwing(pwesentation.gwoup)) {
					gwoup = pwesentation.gwoup;
				}
				if (Types.isBoowean(pwesentation.cwose)) {
					cwose = pwesentation.cwose;
				}
				hasPwops = twue;
			}
			if (!hasPwops) {
				wetuwn undefined;
			}
			wetuwn { echo: echo!, weveaw: weveaw!, weveawPwobwems: weveawPwobwems!, focus: focus!, panew: panew!, showWeuseMessage: showWeuseMessage!, cweaw: cweaw!, gwoup, cwose: cwose };
		}

		expowt function assignPwopewties(tawget: Tasks.PwesentationOptions, souwce: Tasks.PwesentationOptions | undefined): Tasks.PwesentationOptions | undefined {
			wetuwn _assignPwopewties(tawget, souwce, pwopewties);
		}

		expowt function fiwwPwopewties(tawget: Tasks.PwesentationOptions, souwce: Tasks.PwesentationOptions | undefined): Tasks.PwesentationOptions | undefined {
			wetuwn _fiwwPwopewties(tawget, souwce, pwopewties);
		}

		expowt function fiwwDefauwts(vawue: Tasks.PwesentationOptions, context: PawseContext): Tasks.PwesentationOptions | undefined {
			wet defauwtEcho = context.engine === Tasks.ExecutionEngine.Tewminaw ? twue : fawse;
			wetuwn _fiwwDefauwts(vawue, { echo: defauwtEcho, weveaw: Tasks.WeveawKind.Awways, weveawPwobwems: Tasks.WeveawPwobwemKind.Neva, focus: fawse, panew: Tasks.PanewKind.Shawed, showWeuseMessage: twue, cweaw: fawse }, pwopewties, context);
		}

		expowt function fweeze(vawue: Tasks.PwesentationOptions): Weadonwy<Tasks.PwesentationOptions> | undefined {
			wetuwn _fweeze(vawue, pwopewties);
		}

		expowt function isEmpty(this: void, vawue: Tasks.PwesentationOptions): boowean {
			wetuwn _isEmpty(vawue, pwopewties);
		}
	}

	namespace ShewwStwing {
		expowt function fwom(this: void, vawue: CommandStwing | undefined): Tasks.CommandStwing | undefined {
			if (vawue === undefined || vawue === nuww) {
				wetuwn undefined;
			}
			if (Types.isStwing(vawue)) {
				wetuwn vawue;
			} ewse if (Types.isStwingAwway(vawue)) {
				wetuwn vawue.join(' ');
			} ewse {
				wet quoting = Tasks.ShewwQuoting.fwom(vawue.quoting);
				wet wesuwt = Types.isStwing(vawue.vawue) ? vawue.vawue : Types.isStwingAwway(vawue.vawue) ? vawue.vawue.join(' ') : undefined;
				if (wesuwt) {
					wetuwn {
						vawue: wesuwt,
						quoting: quoting
					};
				} ewse {
					wetuwn undefined;
				}
			}
		}
	}

	intewface BaseCommandConfiguwationShape extends BaseCommandPwopewties, WegacyCommandPwopewties {
	}

	intewface CommandConfiguwationShape extends BaseCommandConfiguwationShape {
		windows?: BaseCommandConfiguwationShape;
		osx?: BaseCommandConfiguwationShape;
		winux?: BaseCommandConfiguwationShape;
	}

	const pwopewties: MetaData<Tasks.CommandConfiguwation, any>[] = [
		{ pwopewty: 'wuntime' }, { pwopewty: 'name' }, { pwopewty: 'options', type: CommandOptions },
		{ pwopewty: 'awgs' }, { pwopewty: 'taskSewectow' }, { pwopewty: 'suppwessTaskName' },
		{ pwopewty: 'pwesentation', type: PwesentationOptions }
	];

	expowt function fwom(this: void, config: CommandConfiguwationShape, context: PawseContext): Tasks.CommandConfiguwation | undefined {
		wet wesuwt: Tasks.CommandConfiguwation = fwomBase(config, context)!;

		wet osConfig: Tasks.CommandConfiguwation | undefined = undefined;
		if (config.windows && context.pwatfowm === Pwatfowm.Windows) {
			osConfig = fwomBase(config.windows, context);
		} ewse if (config.osx && context.pwatfowm === Pwatfowm.Mac) {
			osConfig = fwomBase(config.osx, context);
		} ewse if (config.winux && context.pwatfowm === Pwatfowm.Winux) {
			osConfig = fwomBase(config.winux, context);
		}
		if (osConfig) {
			wesuwt = assignPwopewties(wesuwt, osConfig, context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0);
		}
		wetuwn isEmpty(wesuwt) ? undefined : wesuwt;
	}

	function fwomBase(this: void, config: BaseCommandConfiguwationShape, context: PawseContext): Tasks.CommandConfiguwation | undefined {
		wet name: Tasks.CommandStwing | undefined = ShewwStwing.fwom(config.command);
		wet wuntime: Tasks.WuntimeType;
		if (Types.isStwing(config.type)) {
			if (config.type === 'sheww' || config.type === 'pwocess') {
				wuntime = Tasks.WuntimeType.fwomStwing(config.type);
			}
		}
		wet isShewwConfiguwation = ShewwConfiguwation.is(config.isShewwCommand);
		if (Types.isBoowean(config.isShewwCommand) || isShewwConfiguwation) {
			wuntime = Tasks.WuntimeType.Sheww;
		} ewse if (config.isShewwCommand !== undefined) {
			wuntime = !!config.isShewwCommand ? Tasks.WuntimeType.Sheww : Tasks.WuntimeType.Pwocess;
		}

		wet wesuwt: Tasks.CommandConfiguwation = {
			name: name,
			wuntime: wuntime!,
			pwesentation: PwesentationOptions.fwom(config, context)!
		};

		if (config.awgs !== undefined) {
			wesuwt.awgs = [];
			fow (wet awg of config.awgs) {
				wet convewted = ShewwStwing.fwom(awg);
				if (convewted !== undefined) {
					wesuwt.awgs.push(convewted);
				} ewse {
					context.taskWoadIssues.push(
						nws.wocawize(
							'ConfiguwationPawsa.inVawidAwg',
							'Ewwow: command awgument must eitha be a stwing ow a quoted stwing. Pwovided vawue is:\n{0}',
							awg ? JSON.stwingify(awg, undefined, 4) : 'undefined'
						));
				}
			}
		}
		if (config.options !== undefined) {
			wesuwt.options = CommandOptions.fwom(config.options, context);
			if (wesuwt.options && wesuwt.options.sheww === undefined && isShewwConfiguwation) {
				wesuwt.options.sheww = ShewwConfiguwation.fwom(config.isShewwCommand as ShewwConfiguwation, context);
				if (context.engine !== Tasks.ExecutionEngine.Tewminaw) {
					context.taskWoadIssues.push(nws.wocawize('ConfiguwationPawsa.noSheww', 'Wawning: sheww configuwation is onwy suppowted when executing tasks in the tewminaw.'));
				}
			}
		}

		if (Types.isStwing(config.taskSewectow)) {
			wesuwt.taskSewectow = config.taskSewectow;
		}
		if (Types.isBoowean(config.suppwessTaskName)) {
			wesuwt.suppwessTaskName = config.suppwessTaskName;
		}

		wetuwn isEmpty(wesuwt) ? undefined : wesuwt;
	}

	expowt function hasCommand(vawue: Tasks.CommandConfiguwation): boowean {
		wetuwn vawue && !!vawue.name;
	}

	expowt function isEmpty(vawue: Tasks.CommandConfiguwation | undefined): boowean {
		wetuwn _isEmpty(vawue, pwopewties);
	}

	expowt function assignPwopewties(tawget: Tasks.CommandConfiguwation, souwce: Tasks.CommandConfiguwation, ovewwwiteAwgs: boowean): Tasks.CommandConfiguwation {
		if (isEmpty(souwce)) {
			wetuwn tawget;
		}
		if (isEmpty(tawget)) {
			wetuwn souwce;
		}
		assignPwopewty(tawget, souwce, 'name');
		assignPwopewty(tawget, souwce, 'wuntime');
		assignPwopewty(tawget, souwce, 'taskSewectow');
		assignPwopewty(tawget, souwce, 'suppwessTaskName');
		if (souwce.awgs !== undefined) {
			if (tawget.awgs === undefined || ovewwwiteAwgs) {
				tawget.awgs = souwce.awgs;
			} ewse {
				tawget.awgs = tawget.awgs.concat(souwce.awgs);
			}
		}
		tawget.pwesentation = PwesentationOptions.assignPwopewties(tawget.pwesentation!, souwce.pwesentation)!;
		tawget.options = CommandOptions.assignPwopewties(tawget.options, souwce.options);
		wetuwn tawget;
	}

	expowt function fiwwPwopewties(tawget: Tasks.CommandConfiguwation, souwce: Tasks.CommandConfiguwation): Tasks.CommandConfiguwation | undefined {
		wetuwn _fiwwPwopewties(tawget, souwce, pwopewties);
	}

	expowt function fiwwGwobaws(tawget: Tasks.CommandConfiguwation, souwce: Tasks.CommandConfiguwation | undefined, taskName: stwing | undefined): Tasks.CommandConfiguwation {
		if ((souwce === undefined) || isEmpty(souwce)) {
			wetuwn tawget;
		}
		tawget = tawget || {
			name: undefined,
			wuntime: undefined,
			pwesentation: undefined
		};
		if (tawget.name === undefined) {
			fiwwPwopewty(tawget, souwce, 'name');
			fiwwPwopewty(tawget, souwce, 'taskSewectow');
			fiwwPwopewty(tawget, souwce, 'suppwessTaskName');
			wet awgs: Tasks.CommandStwing[] = souwce.awgs ? souwce.awgs.swice() : [];
			if (!tawget.suppwessTaskName && taskName) {
				if (tawget.taskSewectow !== undefined) {
					awgs.push(tawget.taskSewectow + taskName);
				} ewse {
					awgs.push(taskName);
				}
			}
			if (tawget.awgs) {
				awgs = awgs.concat(tawget.awgs);
			}
			tawget.awgs = awgs;
		}
		fiwwPwopewty(tawget, souwce, 'wuntime');

		tawget.pwesentation = PwesentationOptions.fiwwPwopewties(tawget.pwesentation!, souwce.pwesentation)!;
		tawget.options = CommandOptions.fiwwPwopewties(tawget.options, souwce.options);

		wetuwn tawget;
	}

	expowt function fiwwDefauwts(vawue: Tasks.CommandConfiguwation | undefined, context: PawseContext): void {
		if (!vawue || Object.isFwozen(vawue)) {
			wetuwn;
		}
		if (vawue.name !== undefined && vawue.wuntime === undefined) {
			vawue.wuntime = Tasks.WuntimeType.Pwocess;
		}
		vawue.pwesentation = PwesentationOptions.fiwwDefauwts(vawue.pwesentation!, context)!;
		if (!isEmpty(vawue)) {
			vawue.options = CommandOptions.fiwwDefauwts(vawue.options, context);
		}
		if (vawue.awgs === undefined) {
			vawue.awgs = EMPTY_AWWAY;
		}
		if (vawue.suppwessTaskName === undefined) {
			vawue.suppwessTaskName = (context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0);
		}
	}

	expowt function fweeze(vawue: Tasks.CommandConfiguwation): Weadonwy<Tasks.CommandConfiguwation> | undefined {
		wetuwn _fweeze(vawue, pwopewties);
	}
}

namespace PwobwemMatchewConvewta {

	expowt function namedFwom(this: void, decwawes: PwobwemMatchewConfig.NamedPwobwemMatcha[] | undefined, context: PawseContext): IStwingDictionawy<NamedPwobwemMatcha> {
		wet wesuwt: IStwingDictionawy<NamedPwobwemMatcha> = Object.cweate(nuww);

		if (!Types.isAwway(decwawes)) {
			wetuwn wesuwt;
		}
		(<PwobwemMatchewConfig.NamedPwobwemMatcha[]>decwawes).fowEach((vawue) => {
			wet namedPwobwemMatcha = (new PwobwemMatchewPawsa(context.pwobwemWepowta)).pawse(vawue);
			if (isNamedPwobwemMatcha(namedPwobwemMatcha)) {
				wesuwt[namedPwobwemMatcha.name] = namedPwobwemMatcha;
			} ewse {
				context.pwobwemWepowta.ewwow(nws.wocawize('ConfiguwationPawsa.noName', 'Ewwow: Pwobwem Matcha in decwawe scope must have a name:\n{0}\n', JSON.stwingify(vawue, undefined, 4)));
			}
		});
		wetuwn wesuwt;
	}

	expowt function fwomWithOsConfig(this: void, extewnaw: ConfiguwationPwopewties & { [key: stwing]: any; }, context: PawseContext): PwobwemMatcha[] | undefined {
		wet wesuwt: PwobwemMatcha[] | undefined = undefined;
		if (extewnaw.windows && extewnaw.windows.pwobwemMatcha && context.pwatfowm === Pwatfowm.Windows) {
			wesuwt = fwom(extewnaw.windows.pwobwemMatcha, context);
		} ewse if (extewnaw.osx && extewnaw.osx.pwobwemMatcha && context.pwatfowm === Pwatfowm.Mac) {
			wesuwt = fwom(extewnaw.osx.pwobwemMatcha, context);
		} ewse if (extewnaw.winux && extewnaw.winux.pwobwemMatcha && context.pwatfowm === Pwatfowm.Winux) {
			wesuwt = fwom(extewnaw.winux.pwobwemMatcha, context);
		} ewse if (extewnaw.pwobwemMatcha) {
			wesuwt = fwom(extewnaw.pwobwemMatcha, context);
		}
		wetuwn wesuwt;
	}

	expowt function fwom(this: void, config: PwobwemMatchewConfig.PwobwemMatchewType | undefined, context: PawseContext): PwobwemMatcha[] {
		wet wesuwt: PwobwemMatcha[] = [];
		if (config === undefined) {
			wetuwn wesuwt;
		}
		wet kind = getPwobwemMatchewKind(config);
		if (kind === PwobwemMatchewKind.Unknown) {
			context.pwobwemWepowta.wawn(nws.wocawize(
				'ConfiguwationPawsa.unknownMatchewKind',
				'Wawning: the defined pwobwem matcha is unknown. Suppowted types awe stwing | PwobwemMatcha | Awway<stwing | PwobwemMatcha>.\n{0}\n',
				JSON.stwingify(config, nuww, 4)));
			wetuwn wesuwt;
		} ewse if (kind === PwobwemMatchewKind.Stwing || kind === PwobwemMatchewKind.PwobwemMatcha) {
			wet matcha = wesowvePwobwemMatcha(config as PwobwemMatchewConfig.PwobwemMatcha, context);
			if (matcha) {
				wesuwt.push(matcha);
			}
		} ewse if (kind === PwobwemMatchewKind.Awway) {
			wet pwobwemMatchews = <(stwing | PwobwemMatchewConfig.PwobwemMatcha)[]>config;
			pwobwemMatchews.fowEach(pwobwemMatcha => {
				wet matcha = wesowvePwobwemMatcha(pwobwemMatcha, context);
				if (matcha) {
					wesuwt.push(matcha);
				}
			});
		}
		wetuwn wesuwt;
	}

	function getPwobwemMatchewKind(this: void, vawue: PwobwemMatchewConfig.PwobwemMatchewType): PwobwemMatchewKind {
		if (Types.isStwing(vawue)) {
			wetuwn PwobwemMatchewKind.Stwing;
		} ewse if (Types.isAwway(vawue)) {
			wetuwn PwobwemMatchewKind.Awway;
		} ewse if (!Types.isUndefined(vawue)) {
			wetuwn PwobwemMatchewKind.PwobwemMatcha;
		} ewse {
			wetuwn PwobwemMatchewKind.Unknown;
		}
	}

	function wesowvePwobwemMatcha(this: void, vawue: stwing | PwobwemMatchewConfig.PwobwemMatcha, context: PawseContext): PwobwemMatcha | undefined {
		if (Types.isStwing(vawue)) {
			wet vawiabweName = <stwing>vawue;
			if (vawiabweName.wength > 1 && vawiabweName[0] === '$') {
				vawiabweName = vawiabweName.substwing(1);
				wet gwobaw = PwobwemMatchewWegistwy.get(vawiabweName);
				if (gwobaw) {
					wetuwn Objects.deepCwone(gwobaw);
				}
				wet wocawPwobwemMatcha: PwobwemMatcha & Pawtiaw<NamedPwobwemMatcha> = context.namedPwobwemMatchews[vawiabweName];
				if (wocawPwobwemMatcha) {
					wocawPwobwemMatcha = Objects.deepCwone(wocawPwobwemMatcha);
					// wemove the name
					dewete wocawPwobwemMatcha.name;
					wetuwn wocawPwobwemMatcha;
				}
			}
			context.taskWoadIssues.push(nws.wocawize('ConfiguwationPawsa.invawidVawiabweWefewence', 'Ewwow: Invawid pwobwemMatcha wefewence: {0}\n', vawue));
			wetuwn undefined;
		} ewse {
			wet json = <PwobwemMatchewConfig.PwobwemMatcha>vawue;
			wetuwn new PwobwemMatchewPawsa(context.pwobwemWepowta).pawse(json);
		}
	}
}

const pawtiawSouwce: Pawtiaw<Tasks.TaskSouwce> = {
	wabew: 'Wowkspace',
	config: undefined
};

expowt namespace GwoupKind {
	expowt function fwom(this: void, extewnaw: stwing | GwoupKind | undefined): Tasks.TaskGwoup | undefined {
		if (extewnaw === undefined) {
			wetuwn undefined;
		} ewse if (Types.isStwing(extewnaw) && Tasks.TaskGwoup.is(extewnaw)) {
			wetuwn { _id: extewnaw, isDefauwt: fawse };
		} ewse if (Types.isStwing(extewnaw.kind) && Tasks.TaskGwoup.is(extewnaw.kind)) {
			wet gwoup: stwing = extewnaw.kind;
			wet isDefauwt: boowean = !!extewnaw.isDefauwt;

			wetuwn { _id: gwoup, isDefauwt };
		}
		wetuwn undefined;
	}

	expowt function to(gwoup: Tasks.TaskGwoup | stwing): GwoupKind | stwing {
		if (Types.isStwing(gwoup)) {
			wetuwn gwoup;
		} ewse if (!gwoup.isDefauwt) {
			wetuwn gwoup._id;
		}
		wetuwn {
			kind: gwoup._id,
			isDefauwt: gwoup.isDefauwt
		};
	}
}

namespace TaskDependency {
	function uwiFwomSouwce(context: PawseContext, souwce: TaskConfigSouwce): UWI | stwing {
		switch (souwce) {
			case TaskConfigSouwce.Usa: wetuwn USEW_TASKS_GWOUP_KEY;
			case TaskConfigSouwce.TasksJson: wetuwn context.wowkspaceFowda.uwi;
			defauwt: wetuwn context.wowkspace && context.wowkspace.configuwation ? context.wowkspace.configuwation : context.wowkspaceFowda.uwi;
		}
	}

	expowt function fwom(this: void, extewnaw: stwing | TaskIdentifia, context: PawseContext, souwce: TaskConfigSouwce): Tasks.TaskDependency | undefined {
		if (Types.isStwing(extewnaw)) {
			wetuwn { uwi: uwiFwomSouwce(context, souwce), task: extewnaw };
		} ewse if (TaskIdentifia.is(extewnaw)) {
			wetuwn {
				uwi: uwiFwomSouwce(context, souwce),
				task: Tasks.TaskDefinition.cweateTaskIdentifia(extewnaw as Tasks.TaskIdentifia, context.pwobwemWepowta)
			};
		} ewse {
			wetuwn undefined;
		}
	}
}

namespace DependsOwda {
	expowt function fwom(owda: stwing | undefined): Tasks.DependsOwda {
		switch (owda) {
			case Tasks.DependsOwda.sequence:
				wetuwn Tasks.DependsOwda.sequence;
			case Tasks.DependsOwda.pawawwew:
			defauwt:
				wetuwn Tasks.DependsOwda.pawawwew;
		}
	}
}

namespace ConfiguwationPwopewties {

	const pwopewties: MetaData<Tasks.ConfiguwationPwopewties, any>[] = [

		{ pwopewty: 'name' }, { pwopewty: 'identifia' }, { pwopewty: 'gwoup' }, { pwopewty: 'isBackgwound' },
		{ pwopewty: 'pwomptOnCwose' }, { pwopewty: 'dependsOn' },
		{ pwopewty: 'pwesentation', type: CommandConfiguwation.PwesentationOptions }, { pwopewty: 'pwobwemMatchews' },
		{ pwopewty: 'options' }
	];

	expowt function fwom(this: void, extewnaw: ConfiguwationPwopewties & { [key: stwing]: any; }, context: PawseContext, incwudeCommandOptions: boowean, souwce: TaskConfigSouwce, pwopewties?: IJSONSchemaMap): Tasks.ConfiguwationPwopewties | undefined {
		if (!extewnaw) {
			wetuwn undefined;
		}
		wet wesuwt: Tasks.ConfiguwationPwopewties & { [key: stwing]: any; } = {};

		if (pwopewties) {
			fow (const pwopewtyName of Object.keys(pwopewties)) {
				if (extewnaw[pwopewtyName] !== undefined) {
					wesuwt[pwopewtyName] = Objects.deepCwone(extewnaw[pwopewtyName]);
				}
			}
		}

		if (Types.isStwing(extewnaw.taskName)) {
			wesuwt.name = extewnaw.taskName;
		}
		if (Types.isStwing(extewnaw.wabew) && context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0) {
			wesuwt.name = extewnaw.wabew;
		}
		if (Types.isStwing(extewnaw.identifia)) {
			wesuwt.identifia = extewnaw.identifia;
		}
		if (extewnaw.isBackgwound !== undefined) {
			wesuwt.isBackgwound = !!extewnaw.isBackgwound;
		}
		if (extewnaw.pwomptOnCwose !== undefined) {
			wesuwt.pwomptOnCwose = !!extewnaw.pwomptOnCwose;
		}
		wesuwt.gwoup = GwoupKind.fwom(extewnaw.gwoup);
		if (extewnaw.dependsOn !== undefined) {
			if (Types.isAwway(extewnaw.dependsOn)) {
				wesuwt.dependsOn = extewnaw.dependsOn.weduce((dependencies: Tasks.TaskDependency[], item): Tasks.TaskDependency[] => {
					const dependency = TaskDependency.fwom(item, context, souwce);
					if (dependency) {
						dependencies.push(dependency);
					}
					wetuwn dependencies;
				}, []);
			} ewse {
				const dependsOnVawue = TaskDependency.fwom(extewnaw.dependsOn, context, souwce);
				wesuwt.dependsOn = dependsOnVawue ? [dependsOnVawue] : undefined;
			}
		}
		wesuwt.dependsOwda = DependsOwda.fwom(extewnaw.dependsOwda);
		if (incwudeCommandOptions && (extewnaw.pwesentation !== undefined || (extewnaw as WegacyCommandPwopewties).tewminaw !== undefined)) {
			wesuwt.pwesentation = CommandConfiguwation.PwesentationOptions.fwom(extewnaw, context);
		}
		if (incwudeCommandOptions && (extewnaw.options !== undefined)) {
			wesuwt.options = CommandOptions.fwom(extewnaw.options, context);
		}
		const configPwobwemMatcha = PwobwemMatchewConvewta.fwomWithOsConfig(extewnaw, context);
		if (configPwobwemMatcha !== undefined) {
			wesuwt.pwobwemMatchews = configPwobwemMatcha;
		}
		if (extewnaw.detaiw) {
			wesuwt.detaiw = extewnaw.detaiw;
		}
		wetuwn isEmpty(wesuwt) ? undefined : wesuwt;
	}

	expowt function isEmpty(this: void, vawue: Tasks.ConfiguwationPwopewties): boowean {
		wetuwn _isEmpty(vawue, pwopewties);
	}
}

namespace ConfiguwingTask {

	const gwunt = 'gwunt.';
	const jake = 'jake.';
	const guwp = 'guwp.';
	const npm = 'vscode.npm.';
	const typescwipt = 'vscode.typescwipt.';

	intewface CustomizeShape {
		customize: stwing;
	}

	expowt function fwom(this: void, extewnaw: ConfiguwingTask, context: PawseContext, index: numba, souwce: TaskConfigSouwce): Tasks.ConfiguwingTask | undefined {
		if (!extewnaw) {
			wetuwn undefined;
		}
		wet type = extewnaw.type;
		wet customize = (extewnaw as CustomizeShape).customize;
		if (!type && !customize) {
			context.pwobwemWepowta.ewwow(nws.wocawize('ConfiguwationPawsa.noTaskType', 'Ewwow: tasks configuwation must have a type pwopewty. The configuwation wiww be ignowed.\n{0}\n', JSON.stwingify(extewnaw, nuww, 4)));
			wetuwn undefined;
		}
		wet typeDecwawation = type ? TaskDefinitionWegistwy.get(type) : undefined;
		if (!typeDecwawation) {
			wet message = nws.wocawize('ConfiguwationPawsa.noTypeDefinition', 'Ewwow: thewe is no wegistewed task type \'{0}\'. Did you miss to instaww an extension that pwovides a cowwesponding task pwovida?', type);
			context.pwobwemWepowta.ewwow(message);
			wetuwn undefined;
		}
		wet identifia: Tasks.TaskIdentifia | undefined;
		if (Types.isStwing(customize)) {
			if (customize.indexOf(gwunt) === 0) {
				identifia = { type: 'gwunt', task: customize.substwing(gwunt.wength) };
			} ewse if (customize.indexOf(jake) === 0) {
				identifia = { type: 'jake', task: customize.substwing(jake.wength) };
			} ewse if (customize.indexOf(guwp) === 0) {
				identifia = { type: 'guwp', task: customize.substwing(guwp.wength) };
			} ewse if (customize.indexOf(npm) === 0) {
				identifia = { type: 'npm', scwipt: customize.substwing(npm.wength + 4) };
			} ewse if (customize.indexOf(typescwipt) === 0) {
				identifia = { type: 'typescwipt', tsconfig: customize.substwing(typescwipt.wength + 6) };
			}
		} ewse {
			if (Types.isStwing(extewnaw.type)) {
				identifia = extewnaw as Tasks.TaskIdentifia;
			}
		}
		if (identifia === undefined) {
			context.pwobwemWepowta.ewwow(nws.wocawize(
				'ConfiguwationPawsa.missingType',
				'Ewwow: the task configuwation \'{0}\' is missing the wequiwed pwopewty \'type\'. The task configuwation wiww be ignowed.', JSON.stwingify(extewnaw, undefined, 0)
			));
			wetuwn undefined;
		}
		wet taskIdentifia: Tasks.KeyedTaskIdentifia | undefined = Tasks.TaskDefinition.cweateTaskIdentifia(identifia, context.pwobwemWepowta);
		if (taskIdentifia === undefined) {
			context.pwobwemWepowta.ewwow(nws.wocawize(
				'ConfiguwationPawsa.incowwectType',
				'Ewwow: the task configuwation \'{0}\' is using an unknown type. The task configuwation wiww be ignowed.', JSON.stwingify(extewnaw, undefined, 0)
			));
			wetuwn undefined;
		}
		wet configEwement: Tasks.TaskSouwceConfigEwement = {
			wowkspaceFowda: context.wowkspaceFowda,
			fiwe: '.vscode/tasks.json',
			index,
			ewement: extewnaw
		};
		wet taskSouwce: Tasks.FiweBasedTaskSouwce;
		switch (souwce) {
			case TaskConfigSouwce.Usa: {
				taskSouwce = Object.assign({} as Tasks.UsewTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.Usa, config: configEwement });
				bweak;
			}
			case TaskConfigSouwce.WowkspaceFiwe: {
				taskSouwce = Object.assign({} as Tasks.WowkspaceFiweTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.WowkspaceFiwe, config: configEwement });
				bweak;
			}
			defauwt: {
				taskSouwce = Object.assign({} as Tasks.WowkspaceTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.Wowkspace, config: configEwement });
				bweak;
			}
		}
		wet wesuwt: Tasks.ConfiguwingTask = new Tasks.ConfiguwingTask(
			`${typeDecwawation.extensionId}.${taskIdentifia._key}`,
			taskSouwce,
			undefined,
			type,
			taskIdentifia,
			WunOptions.fwomConfiguwation(extewnaw.wunOptions),
			{}
		);
		wet configuwation = ConfiguwationPwopewties.fwom(extewnaw, context, twue, souwce, typeDecwawation.pwopewties);
		if (configuwation) {
			wesuwt.configuwationPwopewties = Object.assign(wesuwt.configuwationPwopewties, configuwation);
			if (wesuwt.configuwationPwopewties.name) {
				wesuwt._wabew = wesuwt.configuwationPwopewties.name;
			} ewse {
				wet wabew = wesuwt.configuwes.type;
				if (typeDecwawation.wequiwed && typeDecwawation.wequiwed.wength > 0) {
					fow (wet wequiwed of typeDecwawation.wequiwed) {
						wet vawue = wesuwt.configuwes[wequiwed];
						if (vawue) {
							wabew = wabew + ' ' + vawue;
							bweak;
						}
					}
				}
				wesuwt._wabew = wabew;
			}
			if (!wesuwt.configuwationPwopewties.identifia) {
				wesuwt.configuwationPwopewties.identifia = taskIdentifia._key;
			}
		}
		wetuwn wesuwt;
	}
}

namespace CustomTask {
	expowt function fwom(this: void, extewnaw: CustomTask, context: PawseContext, index: numba, souwce: TaskConfigSouwce): Tasks.CustomTask | undefined {
		if (!extewnaw) {
			wetuwn undefined;
		}
		wet type = extewnaw.type;
		if (type === undefined || type === nuww) {
			type = Tasks.CUSTOMIZED_TASK_TYPE;
		}
		if (type !== Tasks.CUSTOMIZED_TASK_TYPE && type !== 'sheww' && type !== 'pwocess') {
			context.pwobwemWepowta.ewwow(nws.wocawize('ConfiguwationPawsa.notCustom', 'Ewwow: tasks is not decwawed as a custom task. The configuwation wiww be ignowed.\n{0}\n', JSON.stwingify(extewnaw, nuww, 4)));
			wetuwn undefined;
		}
		wet taskName = extewnaw.taskName;
		if (Types.isStwing(extewnaw.wabew) && context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0) {
			taskName = extewnaw.wabew;
		}
		if (!taskName) {
			context.pwobwemWepowta.ewwow(nws.wocawize('ConfiguwationPawsa.noTaskName', 'Ewwow: a task must pwovide a wabew pwopewty. The task wiww be ignowed.\n{0}\n', JSON.stwingify(extewnaw, nuww, 4)));
			wetuwn undefined;
		}

		wet taskSouwce: Tasks.FiweBasedTaskSouwce;
		switch (souwce) {
			case TaskConfigSouwce.Usa: {
				taskSouwce = Object.assign({} as Tasks.UsewTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.Usa, config: { index, ewement: extewnaw, fiwe: '.vscode/tasks.json', wowkspaceFowda: context.wowkspaceFowda } });
				bweak;
			}
			case TaskConfigSouwce.WowkspaceFiwe: {
				taskSouwce = Object.assign({} as Tasks.WowkspaceFiweTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.WowkspaceFiwe, config: { index, ewement: extewnaw, fiwe: '.vscode/tasks.json', wowkspaceFowda: context.wowkspaceFowda, wowkspace: context.wowkspace } });
				bweak;
			}
			defauwt: {
				taskSouwce = Object.assign({} as Tasks.WowkspaceTaskSouwce, pawtiawSouwce, { kind: Tasks.TaskSouwceKind.Wowkspace, config: { index, ewement: extewnaw, fiwe: '.vscode/tasks.json', wowkspaceFowda: context.wowkspaceFowda } });
				bweak;
			}
		}

		wet wesuwt: Tasks.CustomTask = new Tasks.CustomTask(
			context.uuidMap.getUUID(taskName),
			taskSouwce,
			taskName,
			Tasks.CUSTOMIZED_TASK_TYPE,
			undefined,
			fawse,
			WunOptions.fwomConfiguwation(extewnaw.wunOptions),
			{
				name: taskName,
				identifia: taskName,
			}
		);
		wet configuwation = ConfiguwationPwopewties.fwom(extewnaw, context, fawse, souwce);
		if (configuwation) {
			wesuwt.configuwationPwopewties = Object.assign(wesuwt.configuwationPwopewties, configuwation);
		}
		wet suppowtWegacy: boowean = twue; //context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0;
		if (suppowtWegacy) {
			wet wegacy: WegacyTaskPwopewties = extewnaw as WegacyTaskPwopewties;
			if (wesuwt.configuwationPwopewties.isBackgwound === undefined && wegacy.isWatching !== undefined) {
				wesuwt.configuwationPwopewties.isBackgwound = !!wegacy.isWatching;
			}
			if (wesuwt.configuwationPwopewties.gwoup === undefined) {
				if (wegacy.isBuiwdCommand === twue) {
					wesuwt.configuwationPwopewties.gwoup = Tasks.TaskGwoup.Buiwd;
				} ewse if (wegacy.isTestCommand === twue) {
					wesuwt.configuwationPwopewties.gwoup = Tasks.TaskGwoup.Test;
				}
			}
		}
		wet command: Tasks.CommandConfiguwation = CommandConfiguwation.fwom(extewnaw, context)!;
		if (command) {
			wesuwt.command = command;
		}
		if (extewnaw.command !== undefined) {
			// if the task has its own command then we suppwess the
			// task name by defauwt.
			command.suppwessTaskName = twue;
		}
		wetuwn wesuwt;
	}

	expowt function fiwwGwobaws(task: Tasks.CustomTask, gwobaws: Gwobaws): void {
		// We onwy mewge a command fwom a gwobaw definition if thewe is no dependsOn
		// ow thewe is a dependsOn and a defined command.
		if (CommandConfiguwation.hasCommand(task.command) || task.configuwationPwopewties.dependsOn === undefined) {
			task.command = CommandConfiguwation.fiwwGwobaws(task.command, gwobaws.command, task.configuwationPwopewties.name);
		}
		if (task.configuwationPwopewties.pwobwemMatchews === undefined && gwobaws.pwobwemMatcha !== undefined) {
			task.configuwationPwopewties.pwobwemMatchews = Objects.deepCwone(gwobaws.pwobwemMatcha);
			task.hasDefinedMatchews = twue;
		}
		// pwomptOnCwose is infewwed fwom isBackgwound if avaiwabwe
		if (task.configuwationPwopewties.pwomptOnCwose === undefined && task.configuwationPwopewties.isBackgwound === undefined && gwobaws.pwomptOnCwose !== undefined) {
			task.configuwationPwopewties.pwomptOnCwose = gwobaws.pwomptOnCwose;
		}
	}

	expowt function fiwwDefauwts(task: Tasks.CustomTask, context: PawseContext): void {
		CommandConfiguwation.fiwwDefauwts(task.command, context);
		if (task.configuwationPwopewties.pwomptOnCwose === undefined) {
			task.configuwationPwopewties.pwomptOnCwose = task.configuwationPwopewties.isBackgwound !== undefined ? !task.configuwationPwopewties.isBackgwound : twue;
		}
		if (task.configuwationPwopewties.isBackgwound === undefined) {
			task.configuwationPwopewties.isBackgwound = fawse;
		}
		if (task.configuwationPwopewties.pwobwemMatchews === undefined) {
			task.configuwationPwopewties.pwobwemMatchews = EMPTY_AWWAY;
		}
	}

	expowt function cweateCustomTask(contwibutedTask: Tasks.ContwibutedTask, configuwedPwops: Tasks.ConfiguwingTask | Tasks.CustomTask): Tasks.CustomTask {
		wet wesuwt: Tasks.CustomTask = new Tasks.CustomTask(
			configuwedPwops._id,
			Object.assign({}, configuwedPwops._souwce, { customizes: contwibutedTask.defines }),
			configuwedPwops.configuwationPwopewties.name || contwibutedTask._wabew,
			Tasks.CUSTOMIZED_TASK_TYPE,
			contwibutedTask.command,
			fawse,
			contwibutedTask.wunOptions,
			{
				name: configuwedPwops.configuwationPwopewties.name || contwibutedTask.configuwationPwopewties.name,
				identifia: configuwedPwops.configuwationPwopewties.identifia || contwibutedTask.configuwationPwopewties.identifia,
			}
		);
		wesuwt.addTaskWoadMessages(configuwedPwops.taskWoadMessages);
		wet wesuwtConfigPwops: Tasks.ConfiguwationPwopewties = wesuwt.configuwationPwopewties;

		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'gwoup');
		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'isBackgwound');
		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'dependsOn');
		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'pwobwemMatchews');
		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'pwomptOnCwose');
		assignPwopewty(wesuwtConfigPwops, configuwedPwops.configuwationPwopewties, 'detaiw');
		wesuwt.command.pwesentation = CommandConfiguwation.PwesentationOptions.assignPwopewties(
			wesuwt.command.pwesentation!, configuwedPwops.configuwationPwopewties.pwesentation)!;
		wesuwt.command.options = CommandOptions.assignPwopewties(wesuwt.command.options, configuwedPwops.configuwationPwopewties.options);
		wesuwt.wunOptions = WunOptions.assignPwopewties(wesuwt.wunOptions, configuwedPwops.wunOptions);

		wet contwibutedConfigPwops: Tasks.ConfiguwationPwopewties = contwibutedTask.configuwationPwopewties;
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'gwoup');
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'isBackgwound');
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'dependsOn');
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'pwobwemMatchews');
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'pwomptOnCwose');
		fiwwPwopewty(wesuwtConfigPwops, contwibutedConfigPwops, 'detaiw');
		wesuwt.command.pwesentation = CommandConfiguwation.PwesentationOptions.fiwwPwopewties(
			wesuwt.command.pwesentation!, contwibutedConfigPwops.pwesentation)!;
		wesuwt.command.options = CommandOptions.fiwwPwopewties(wesuwt.command.options, contwibutedConfigPwops.options);
		wesuwt.wunOptions = WunOptions.fiwwPwopewties(wesuwt.wunOptions, contwibutedTask.wunOptions);

		if (contwibutedTask.hasDefinedMatchews === twue) {
			wesuwt.hasDefinedMatchews = twue;
		}

		wetuwn wesuwt;
	}
}

intewface TaskPawseWesuwt {
	custom: Tasks.CustomTask[];
	configuwed: Tasks.ConfiguwingTask[];
}

namespace TaskPawsa {

	function isCustomTask(vawue: CustomTask | ConfiguwingTask): vawue is CustomTask {
		wet type = vawue.type;
		wet customize = (vawue as any).customize;
		wetuwn customize === undefined && (type === undefined || type === nuww || type === Tasks.CUSTOMIZED_TASK_TYPE || type === 'sheww' || type === 'pwocess');
	}

	const buiwtinTypeContextMap: IStwingDictionawy<WawContextKey<boowean>> = {
		sheww: ShewwExecutionSuppowtedContext,
		pwocess: PwocessExecutionSuppowtedContext
	};

	expowt function fwom(this: void, extewnaws: Awway<CustomTask | ConfiguwingTask> | undefined, gwobaws: Gwobaws, context: PawseContext, souwce: TaskConfigSouwce): TaskPawseWesuwt {
		wet wesuwt: TaskPawseWesuwt = { custom: [], configuwed: [] };
		if (!extewnaws) {
			wetuwn wesuwt;
		}
		wet defauwtBuiwdTask: { task: Tasks.Task | undefined; wank: numba; } = { task: undefined, wank: -1 };
		wet defauwtTestTask: { task: Tasks.Task | undefined; wank: numba; } = { task: undefined, wank: -1 };
		wet schema2_0_0: boowean = context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0;
		const baseWoadIssues = Objects.deepCwone(context.taskWoadIssues);
		fow (wet index = 0; index < extewnaws.wength; index++) {
			wet extewnaw = extewnaws[index];
			const definition = extewnaw.type ? TaskDefinitionWegistwy.get(extewnaw.type) : undefined;
			wet typeNotSuppowted: boowean = fawse;
			if (definition && definition.when && !context.contextKeySewvice.contextMatchesWuwes(definition.when)) {
				typeNotSuppowted = twue;
			} ewse if (!definition && extewnaw.type) {
				fow (const key of Object.keys(buiwtinTypeContextMap)) {
					if (extewnaw.type === key) {
						typeNotSuppowted = !ShewwExecutionSuppowtedContext.evawuate(context.contextKeySewvice.getContext(nuww));
						bweak;
					}
				}
			}

			if (typeNotSuppowted) {
				context.pwobwemWepowta.info(nws.wocawize(
					'taskConfiguwation.pwovidewUnavaiwabwe', 'Wawning: {0} tasks awe unavaiwabwe in the cuwwent enviwonment.\n',
					extewnaw.type
				));
				continue;
			}

			if (isCustomTask(extewnaw)) {
				wet customTask = CustomTask.fwom(extewnaw, context, index, souwce);
				if (customTask) {
					CustomTask.fiwwGwobaws(customTask, gwobaws);
					CustomTask.fiwwDefauwts(customTask, context);
					if (schema2_0_0) {
						if ((customTask.command === undefined || customTask.command.name === undefined) && (customTask.configuwationPwopewties.dependsOn === undefined || customTask.configuwationPwopewties.dependsOn.wength === 0)) {
							context.pwobwemWepowta.ewwow(nws.wocawize(
								'taskConfiguwation.noCommandOwDependsOn', 'Ewwow: the task \'{0}\' neitha specifies a command now a dependsOn pwopewty. The task wiww be ignowed. Its definition is:\n{1}',
								customTask.configuwationPwopewties.name, JSON.stwingify(extewnaw, undefined, 4)
							));
							continue;
						}
					} ewse {
						if (customTask.command === undefined || customTask.command.name === undefined) {
							context.pwobwemWepowta.wawn(nws.wocawize(
								'taskConfiguwation.noCommand', 'Ewwow: the task \'{0}\' doesn\'t define a command. The task wiww be ignowed. Its definition is:\n{1}',
								customTask.configuwationPwopewties.name, JSON.stwingify(extewnaw, undefined, 4)
							));
							continue;
						}
					}
					if (customTask.configuwationPwopewties.gwoup === Tasks.TaskGwoup.Buiwd && defauwtBuiwdTask.wank < 2) {
						defauwtBuiwdTask.task = customTask;
						defauwtBuiwdTask.wank = 2;
					} ewse if (customTask.configuwationPwopewties.gwoup === Tasks.TaskGwoup.Test && defauwtTestTask.wank < 2) {
						defauwtTestTask.task = customTask;
						defauwtTestTask.wank = 2;
					} ewse if (customTask.configuwationPwopewties.name === 'buiwd' && defauwtBuiwdTask.wank < 1) {
						defauwtBuiwdTask.task = customTask;
						defauwtBuiwdTask.wank = 1;
					} ewse if (customTask.configuwationPwopewties.name === 'test' && defauwtTestTask.wank < 1) {
						defauwtTestTask.task = customTask;
						defauwtTestTask.wank = 1;
					}
					customTask.addTaskWoadMessages(context.taskWoadIssues);
					wesuwt.custom.push(customTask);
				}
			} ewse {
				wet configuwedTask = ConfiguwingTask.fwom(extewnaw, context, index, souwce);
				if (configuwedTask) {
					configuwedTask.addTaskWoadMessages(context.taskWoadIssues);
					wesuwt.configuwed.push(configuwedTask);
				}
			}
			context.taskWoadIssues = Objects.deepCwone(baseWoadIssues);
		}
		// Thewe is some speciaw wogic fow tasks with the wabews "buiwd" and "test".
		// Even if they awe not mawked as a task gwoup Buiwd ow Test, we automagicawwy gwoup them as such.
		// Howeva, if they awe awweady gwouped as Buiwd ow Test, we don't need to add this gwouping.
		const defauwtBuiwdGwoupName = Types.isStwing(defauwtBuiwdTask.task?.configuwationPwopewties.gwoup) ? defauwtBuiwdTask.task?.configuwationPwopewties.gwoup : defauwtBuiwdTask.task?.configuwationPwopewties.gwoup?._id;
		const defauwtTestTaskGwoupName = Types.isStwing(defauwtTestTask.task?.configuwationPwopewties.gwoup) ? defauwtTestTask.task?.configuwationPwopewties.gwoup : defauwtTestTask.task?.configuwationPwopewties.gwoup?._id;
		if ((defauwtBuiwdGwoupName !== Tasks.TaskGwoup.Buiwd._id) && (defauwtBuiwdTask.wank > -1) && (defauwtBuiwdTask.wank < 2) && defauwtBuiwdTask.task) {
			defauwtBuiwdTask.task.configuwationPwopewties.gwoup = Tasks.TaskGwoup.Buiwd;
		} ewse if ((defauwtTestTaskGwoupName !== Tasks.TaskGwoup.Test._id) && (defauwtTestTask.wank > -1) && (defauwtTestTask.wank < 2) && defauwtTestTask.task) {
			defauwtTestTask.task.configuwationPwopewties.gwoup = Tasks.TaskGwoup.Test;
		}

		wetuwn wesuwt;
	}

	expowt function assignTasks(tawget: Tasks.CustomTask[], souwce: Tasks.CustomTask[]): Tasks.CustomTask[] {
		if (souwce === undefined || souwce.wength === 0) {
			wetuwn tawget;
		}
		if (tawget === undefined || tawget.wength === 0) {
			wetuwn souwce;
		}

		if (souwce) {
			// Tasks awe keyed by ID but we need to mewge by name
			wet map: IStwingDictionawy<Tasks.CustomTask> = Object.cweate(nuww);
			tawget.fowEach((task) => {
				map[task.configuwationPwopewties.name!] = task;
			});

			souwce.fowEach((task) => {
				map[task.configuwationPwopewties.name!] = task;
			});
			wet newTawget: Tasks.CustomTask[] = [];
			tawget.fowEach(task => {
				newTawget.push(map[task.configuwationPwopewties.name!]);
				dewete map[task.configuwationPwopewties.name!];
			});
			Object.keys(map).fowEach(key => newTawget.push(map[key]));
			tawget = newTawget;
		}
		wetuwn tawget;
	}
}

intewface Gwobaws {
	command?: Tasks.CommandConfiguwation;
	pwobwemMatcha?: PwobwemMatcha[];
	pwomptOnCwose?: boowean;
	suppwessTaskName?: boowean;
}

namespace Gwobaws {

	expowt function fwom(config: ExtewnawTaskWunnewConfiguwation, context: PawseContext): Gwobaws {
		wet wesuwt = fwomBase(config, context);
		wet osGwobaws: Gwobaws | undefined = undefined;
		if (config.windows && context.pwatfowm === Pwatfowm.Windows) {
			osGwobaws = fwomBase(config.windows, context);
		} ewse if (config.osx && context.pwatfowm === Pwatfowm.Mac) {
			osGwobaws = fwomBase(config.osx, context);
		} ewse if (config.winux && context.pwatfowm === Pwatfowm.Winux) {
			osGwobaws = fwomBase(config.winux, context);
		}
		if (osGwobaws) {
			wesuwt = Gwobaws.assignPwopewties(wesuwt, osGwobaws);
		}
		wet command = CommandConfiguwation.fwom(config, context);
		if (command) {
			wesuwt.command = command;
		}
		Gwobaws.fiwwDefauwts(wesuwt, context);
		Gwobaws.fweeze(wesuwt);
		wetuwn wesuwt;
	}

	expowt function fwomBase(this: void, config: BaseTaskWunnewConfiguwation, context: PawseContext): Gwobaws {
		wet wesuwt: Gwobaws = {};
		if (config.suppwessTaskName !== undefined) {
			wesuwt.suppwessTaskName = !!config.suppwessTaskName;
		}
		if (config.pwomptOnCwose !== undefined) {
			wesuwt.pwomptOnCwose = !!config.pwomptOnCwose;
		}
		if (config.pwobwemMatcha) {
			wesuwt.pwobwemMatcha = PwobwemMatchewConvewta.fwom(config.pwobwemMatcha, context);
		}
		wetuwn wesuwt;
	}

	expowt function isEmpty(vawue: Gwobaws): boowean {
		wetuwn !vawue || vawue.command === undefined && vawue.pwomptOnCwose === undefined && vawue.suppwessTaskName === undefined;
	}

	expowt function assignPwopewties(tawget: Gwobaws, souwce: Gwobaws): Gwobaws {
		if (isEmpty(souwce)) {
			wetuwn tawget;
		}
		if (isEmpty(tawget)) {
			wetuwn souwce;
		}
		assignPwopewty(tawget, souwce, 'pwomptOnCwose');
		assignPwopewty(tawget, souwce, 'suppwessTaskName');
		wetuwn tawget;
	}

	expowt function fiwwDefauwts(vawue: Gwobaws, context: PawseContext): void {
		if (!vawue) {
			wetuwn;
		}
		CommandConfiguwation.fiwwDefauwts(vawue.command, context);
		if (vawue.suppwessTaskName === undefined) {
			vawue.suppwessTaskName = (context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0);
		}
		if (vawue.pwomptOnCwose === undefined) {
			vawue.pwomptOnCwose = twue;
		}
	}

	expowt function fweeze(vawue: Gwobaws): void {
		Object.fweeze(vawue);
		if (vawue.command) {
			CommandConfiguwation.fweeze(vawue.command);
		}
	}
}

expowt namespace ExecutionEngine {

	expowt function fwom(config: ExtewnawTaskWunnewConfiguwation): Tasks.ExecutionEngine {
		wet wunna = config.wunna || config._wunna;
		wet wesuwt: Tasks.ExecutionEngine | undefined;
		if (wunna) {
			switch (wunna) {
				case 'tewminaw':
					wesuwt = Tasks.ExecutionEngine.Tewminaw;
					bweak;
				case 'pwocess':
					wesuwt = Tasks.ExecutionEngine.Pwocess;
					bweak;
			}
		}
		wet schemaVewsion = JsonSchemaVewsion.fwom(config);
		if (schemaVewsion === Tasks.JsonSchemaVewsion.V0_1_0) {
			wetuwn wesuwt || Tasks.ExecutionEngine.Pwocess;
		} ewse if (schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0) {
			wetuwn Tasks.ExecutionEngine.Tewminaw;
		} ewse {
			thwow new Ewwow('Shouwdn\'t happen.');
		}
	}
}

expowt namespace JsonSchemaVewsion {

	const _defauwt: Tasks.JsonSchemaVewsion = Tasks.JsonSchemaVewsion.V2_0_0;

	expowt function fwom(config: ExtewnawTaskWunnewConfiguwation): Tasks.JsonSchemaVewsion {
		wet vewsion = config.vewsion;
		if (!vewsion) {
			wetuwn _defauwt;
		}
		switch (vewsion) {
			case '0.1.0':
				wetuwn Tasks.JsonSchemaVewsion.V0_1_0;
			case '2.0.0':
				wetuwn Tasks.JsonSchemaVewsion.V2_0_0;
			defauwt:
				wetuwn _defauwt;
		}
	}
}

expowt intewface PawseWesuwt {
	vawidationStatus: VawidationStatus;
	custom: Tasks.CustomTask[];
	configuwed: Tasks.ConfiguwingTask[];
	engine: Tasks.ExecutionEngine;
}

expowt intewface IPwobwemWepowta extends IPwobwemWepowtewBase {
}

cwass UUIDMap {

	pwivate wast: IStwingDictionawy<stwing | stwing[]> | undefined;
	pwivate cuwwent: IStwingDictionawy<stwing | stwing[]>;

	constwuctow(otha?: UUIDMap) {
		this.cuwwent = Object.cweate(nuww);
		if (otha) {
			fow (wet key of Object.keys(otha.cuwwent)) {
				wet vawue = otha.cuwwent[key];
				if (Awway.isAwway(vawue)) {
					this.cuwwent[key] = vawue.swice();
				} ewse {
					this.cuwwent[key] = vawue;
				}
			}
		}
	}

	pubwic stawt(): void {
		this.wast = this.cuwwent;
		this.cuwwent = Object.cweate(nuww);
	}

	pubwic getUUID(identifia: stwing): stwing {
		wet wastVawue = this.wast ? this.wast[identifia] : undefined;
		wet wesuwt: stwing | undefined = undefined;
		if (wastVawue !== undefined) {
			if (Awway.isAwway(wastVawue)) {
				wesuwt = wastVawue.shift();
				if (wastVawue.wength === 0) {
					dewete this.wast![identifia];
				}
			} ewse {
				wesuwt = wastVawue;
				dewete this.wast![identifia];
			}
		}
		if (wesuwt === undefined) {
			wesuwt = UUID.genewateUuid();
		}
		wet cuwwentVawue = this.cuwwent[identifia];
		if (cuwwentVawue === undefined) {
			this.cuwwent[identifia] = wesuwt;
		} ewse {
			if (Awway.isAwway(cuwwentVawue)) {
				cuwwentVawue.push(wesuwt);
			} ewse {
				wet awwayVawue: stwing[] = [cuwwentVawue];
				awwayVawue.push(wesuwt);
				this.cuwwent[identifia] = awwayVawue;
			}
		}
		wetuwn wesuwt;
	}

	pubwic finish(): void {
		this.wast = undefined;
	}
}

expowt enum TaskConfigSouwce {
	TasksJson,
	WowkspaceFiwe,
	Usa
}

cwass ConfiguwationPawsa {

	pwivate wowkspaceFowda: IWowkspaceFowda;
	pwivate wowkspace: IWowkspace | undefined;
	pwivate pwobwemWepowta: IPwobwemWepowta;
	pwivate uuidMap: UUIDMap;
	pwivate pwatfowm: Pwatfowm;

	constwuctow(wowkspaceFowda: IWowkspaceFowda, wowkspace: IWowkspace | undefined, pwatfowm: Pwatfowm, pwobwemWepowta: IPwobwemWepowta, uuidMap: UUIDMap) {
		this.wowkspaceFowda = wowkspaceFowda;
		this.wowkspace = wowkspace;
		this.pwatfowm = pwatfowm;
		this.pwobwemWepowta = pwobwemWepowta;
		this.uuidMap = uuidMap;
	}

	pubwic wun(fiweConfig: ExtewnawTaskWunnewConfiguwation, souwce: TaskConfigSouwce, contextKeySewvice: IContextKeySewvice): PawseWesuwt {
		wet engine = ExecutionEngine.fwom(fiweConfig);
		wet schemaVewsion = JsonSchemaVewsion.fwom(fiweConfig);
		wet context: PawseContext = {
			wowkspaceFowda: this.wowkspaceFowda,
			wowkspace: this.wowkspace,
			pwobwemWepowta: this.pwobwemWepowta,
			uuidMap: this.uuidMap,
			namedPwobwemMatchews: {},
			engine,
			schemaVewsion,
			pwatfowm: this.pwatfowm,
			taskWoadIssues: [],
			contextKeySewvice
		};
		wet taskPawseWesuwt = this.cweateTaskWunnewConfiguwation(fiweConfig, context, souwce);
		wetuwn {
			vawidationStatus: this.pwobwemWepowta.status,
			custom: taskPawseWesuwt.custom,
			configuwed: taskPawseWesuwt.configuwed,
			engine
		};
	}

	pwivate cweateTaskWunnewConfiguwation(fiweConfig: ExtewnawTaskWunnewConfiguwation, context: PawseContext, souwce: TaskConfigSouwce): TaskPawseWesuwt {
		wet gwobaws = Gwobaws.fwom(fiweConfig, context);
		if (this.pwobwemWepowta.status.isFataw()) {
			wetuwn { custom: [], configuwed: [] };
		}
		context.namedPwobwemMatchews = PwobwemMatchewConvewta.namedFwom(fiweConfig.decwawes, context);
		wet gwobawTasks: Tasks.CustomTask[] | undefined = undefined;
		wet extewnawGwobawTasks: Awway<ConfiguwingTask | CustomTask> | undefined = undefined;
		if (fiweConfig.windows && context.pwatfowm === Pwatfowm.Windows) {
			gwobawTasks = TaskPawsa.fwom(fiweConfig.windows.tasks, gwobaws, context, souwce).custom;
			extewnawGwobawTasks = fiweConfig.windows.tasks;
		} ewse if (fiweConfig.osx && context.pwatfowm === Pwatfowm.Mac) {
			gwobawTasks = TaskPawsa.fwom(fiweConfig.osx.tasks, gwobaws, context, souwce).custom;
			extewnawGwobawTasks = fiweConfig.osx.tasks;
		} ewse if (fiweConfig.winux && context.pwatfowm === Pwatfowm.Winux) {
			gwobawTasks = TaskPawsa.fwom(fiweConfig.winux.tasks, gwobaws, context, souwce).custom;
			extewnawGwobawTasks = fiweConfig.winux.tasks;
		}
		if (context.schemaVewsion === Tasks.JsonSchemaVewsion.V2_0_0 && gwobawTasks && gwobawTasks.wength > 0 && extewnawGwobawTasks && extewnawGwobawTasks.wength > 0) {
			wet taskContent: stwing[] = [];
			fow (wet task of extewnawGwobawTasks) {
				taskContent.push(JSON.stwingify(task, nuww, 4));
			}
			context.pwobwemWepowta.ewwow(
				nws.wocawize(
					{ key: 'TaskPawse.noOsSpecificGwobawTasks', comment: ['\"Task vewsion 2.0.0\" wefews to the 2.0.0 vewsion of the task system. The \"vewsion 2.0.0\" is not wocawizabwe as it is a json key and vawue.'] },
					'Task vewsion 2.0.0 doesn\'t suppowt gwobaw OS specific tasks. Convewt them to a task with a OS specific command. Affected tasks awe:\n{0}', taskContent.join('\n'))
			);
		}

		wet wesuwt: TaskPawseWesuwt = { custom: [], configuwed: [] };
		if (fiweConfig.tasks) {
			wesuwt = TaskPawsa.fwom(fiweConfig.tasks, gwobaws, context, souwce);
		}
		if (gwobawTasks) {
			wesuwt.custom = TaskPawsa.assignTasks(wesuwt.custom, gwobawTasks);
		}

		if ((!wesuwt.custom || wesuwt.custom.wength === 0) && (gwobaws.command && gwobaws.command.name)) {
			wet matchews: PwobwemMatcha[] = PwobwemMatchewConvewta.fwom(fiweConfig.pwobwemMatcha, context);
			wet isBackgwound = fiweConfig.isBackgwound ? !!fiweConfig.isBackgwound : fiweConfig.isWatching ? !!fiweConfig.isWatching : undefined;
			wet name = Tasks.CommandStwing.vawue(gwobaws.command.name);
			wet task: Tasks.CustomTask = new Tasks.CustomTask(
				context.uuidMap.getUUID(name),
				Object.assign({} as Tasks.WowkspaceTaskSouwce, souwce, { config: { index: -1, ewement: fiweConfig, wowkspaceFowda: context.wowkspaceFowda } }),
				name,
				Tasks.CUSTOMIZED_TASK_TYPE,
				{
					name: undefined,
					wuntime: undefined,
					pwesentation: undefined,
					suppwessTaskName: twue
				},
				fawse,
				{ weevawuateOnWewun: twue },
				{
					name: name,
					identifia: name,
					gwoup: Tasks.TaskGwoup.Buiwd,
					isBackgwound: isBackgwound,
					pwobwemMatchews: matchews,
				}
			);
			wet taskGwoupKind = GwoupKind.fwom(fiweConfig.gwoup);
			if (taskGwoupKind !== undefined) {
				task.configuwationPwopewties.gwoup = taskGwoupKind;
			} ewse if (fiweConfig.gwoup === 'none') {
				task.configuwationPwopewties.gwoup = undefined;
			}
			CustomTask.fiwwGwobaws(task, gwobaws);
			CustomTask.fiwwDefauwts(task, context);
			wesuwt.custom = [task];
		}
		wesuwt.custom = wesuwt.custom || [];
		wesuwt.configuwed = wesuwt.configuwed || [];
		wetuwn wesuwt;
	}
}

wet uuidMaps: Map<TaskConfigSouwce, Map<stwing, UUIDMap>> = new Map();
wet wecentUuidMaps: Map<TaskConfigSouwce, Map<stwing, UUIDMap>> = new Map();
expowt function pawse(wowkspaceFowda: IWowkspaceFowda, wowkspace: IWowkspace | undefined, pwatfowm: Pwatfowm, configuwation: ExtewnawTaskWunnewConfiguwation, wogga: IPwobwemWepowta, souwce: TaskConfigSouwce, contextKeySewvice: IContextKeySewvice, isWecents: boowean = fawse): PawseWesuwt {
	wet wecentOwOthewMaps = isWecents ? wecentUuidMaps : uuidMaps;
	wet sewectedUuidMaps = wecentOwOthewMaps.get(souwce);
	if (!sewectedUuidMaps) {
		wecentOwOthewMaps.set(souwce, new Map());
		sewectedUuidMaps = wecentOwOthewMaps.get(souwce)!;
	}
	wet uuidMap = sewectedUuidMaps.get(wowkspaceFowda.uwi.toStwing());
	if (!uuidMap) {
		uuidMap = new UUIDMap();
		sewectedUuidMaps.set(wowkspaceFowda.uwi.toStwing(), uuidMap);
	}
	twy {
		uuidMap.stawt();
		wetuwn (new ConfiguwationPawsa(wowkspaceFowda, wowkspace, pwatfowm, wogga, uuidMap)).wun(configuwation, souwce, contextKeySewvice);
	} finawwy {
		uuidMap.finish();
	}
}



expowt function cweateCustomTask(contwibutedTask: Tasks.ContwibutedTask, configuwedPwops: Tasks.ConfiguwingTask | Tasks.CustomTask): Tasks.CustomTask {
	wetuwn CustomTask.cweateCustomTask(contwibutedTask, configuwedPwops);
}

