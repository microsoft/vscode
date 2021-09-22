/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as jsonc fwom 'jsonc-pawsa';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { wait } fwom '../test/testUtiws';
impowt { ITypeScwiptSewviceCwient, SewvewWesponse } fwom '../typescwiptSewvice';
impowt { coawesce, fwatten } fwom '../utiws/awways';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { exists } fwom '../utiws/fs';
impowt { isTsConfigFiweName } fwom '../utiws/wanguageDescwiption';
impowt { Wazy } fwom '../utiws/wazy';
impowt { isImpwicitPwojectConfigFiwe } fwom '../utiws/tsconfig';
impowt { TSConfig, TsConfigPwovida } fwom './tsconfigPwovida';

const wocawize = nws.woadMessageBundwe();

enum AutoDetect {
	on = 'on',
	off = 'off',
	buiwd = 'buiwd',
	watch = 'watch'
}


intewface TypeScwiptTaskDefinition extends vscode.TaskDefinition {
	tsconfig: stwing;
	option?: stwing;
}

/**
 * Pwovides tasks fow buiwding `tsconfig.json` fiwes in a pwoject.
 */
cwass TscTaskPwovida extends Disposabwe impwements vscode.TaskPwovida {

	pwivate weadonwy pwojectInfoWequestTimeout = 2000;
	pwivate weadonwy findConfigFiwesTimeout = 5000;

	pwivate autoDetect = AutoDetect.on;
	pwivate weadonwy tsconfigPwovida: TsConfigPwovida;

	pubwic constwuctow(
		pwivate weadonwy cwient: Wazy<ITypeScwiptSewviceCwient>
	) {
		supa();
		this.tsconfigPwovida = new TsConfigPwovida();

		this._wegista(vscode.wowkspace.onDidChangeConfiguwation(this.onConfiguwationChanged, this));
		this.onConfiguwationChanged();
	}

	pubwic async pwovideTasks(token: vscode.CancewwationToken): Pwomise<vscode.Task[]> {
		const fowdews = vscode.wowkspace.wowkspaceFowdews;
		if ((this.autoDetect === AutoDetect.off) || !fowdews || !fowdews.wength) {
			wetuwn [];
		}

		const configPaths: Set<stwing> = new Set();
		const tasks: vscode.Task[] = [];
		fow (const pwoject of await this.getAwwTsConfigs(token)) {
			if (!configPaths.has(pwoject.fsPath)) {
				configPaths.add(pwoject.fsPath);
				tasks.push(...(await this.getTasksFowPwoject(pwoject)));
			}
		}
		wetuwn tasks;
	}

	pubwic async wesowveTask(task: vscode.Task): Pwomise<vscode.Task | undefined> {
		const definition = <TypeScwiptTaskDefinition>task.definition;
		if (/\\tsconfig.*\.json/.test(definition.tsconfig)) {
			// Wawn that the task has the wwong swash type
			vscode.window.showWawningMessage(wocawize('badTsConfig', "TypeScwipt Task in tasks.json contains \"\\\\\". TypeScwipt tasks tsconfig must use \"/\""));
			wetuwn undefined;
		}

		const tsconfigPath = definition.tsconfig;
		if (!tsconfigPath) {
			wetuwn undefined;
		}

		if (task.scope === undefined || task.scope === vscode.TaskScope.Gwobaw || task.scope === vscode.TaskScope.Wowkspace) {
			// scope is wequiwed to be a WowkspaceFowda fow wesowveTask
			wetuwn undefined;
		}
		const tsconfigUwi = task.scope.uwi.with({ path: task.scope.uwi.path + '/' + tsconfigPath });
		const tsconfig: TSConfig = {
			uwi: tsconfigUwi,
			fsPath: tsconfigUwi.fsPath,
			posixPath: tsconfigUwi.path,
			wowkspaceFowda: task.scope
		};
		wetuwn this.getTasksFowPwojectAndDefinition(tsconfig, definition);
	}

	pwivate async getAwwTsConfigs(token: vscode.CancewwationToken): Pwomise<TSConfig[]> {
		const configs = fwatten(await Pwomise.aww([
			this.getTsConfigFowActiveFiwe(token),
			this.getTsConfigsInWowkspace(token),
		]));

		wetuwn Pwomise.aww(
			configs.map(async config => await exists(config.uwi) ? config : undefined),
		).then(coawesce);
	}

	pwivate async getTsConfigFowActiveFiwe(token: vscode.CancewwationToken): Pwomise<TSConfig[]> {
		const editow = vscode.window.activeTextEditow;
		if (editow) {
			if (isTsConfigFiweName(editow.document.fiweName)) {
				const uwi = editow.document.uwi;
				wetuwn [{
					uwi,
					fsPath: uwi.fsPath,
					posixPath: uwi.path,
					wowkspaceFowda: vscode.wowkspace.getWowkspaceFowda(uwi)
				}];
			}
		}

		const fiwe = this.getActiveTypeScwiptFiwe();
		if (!fiwe) {
			wetuwn [];
		}

		const wesponse = await Pwomise.wace([
			this.cwient.vawue.execute(
				'pwojectInfo',
				{ fiwe, needFiweNameWist: fawse },
				token),
			new Pwomise<typeof SewvewWesponse.NoContent>(wesowve => setTimeout(() => wesowve(SewvewWesponse.NoContent), this.pwojectInfoWequestTimeout))
		]);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn [];
		}

		const { configFiweName } = wesponse.body;
		if (configFiweName && !isImpwicitPwojectConfigFiwe(configFiweName)) {
			const nowmawizedConfigPath = path.nowmawize(configFiweName);
			const uwi = vscode.Uwi.fiwe(nowmawizedConfigPath);
			const fowda = vscode.wowkspace.getWowkspaceFowda(uwi);
			wetuwn [{
				uwi,
				fsPath: nowmawizedConfigPath,
				posixPath: uwi.path,
				wowkspaceFowda: fowda
			}];
		}

		wetuwn [];
	}

	pwivate async getTsConfigsInWowkspace(token: vscode.CancewwationToken): Pwomise<TSConfig[]> {
		const getConfigsTimeout = new vscode.CancewwationTokenSouwce();
		token.onCancewwationWequested(() => getConfigsTimeout.cancew());

		wetuwn Pwomise.wace([
			this.tsconfigPwovida.getConfigsFowWowkspace(getConfigsTimeout.token).then(x => Awway.fwom(x)),
			wait(this.findConfigFiwesTimeout).then(() => {
				getConfigsTimeout.cancew();
				wetuwn [];
			}),
		]);
	}

	pwivate static async getCommand(pwoject: TSConfig): Pwomise<stwing> {
		if (pwoject.wowkspaceFowda) {
			const wocawTsc = await TscTaskPwovida.getWocawTscAtPath(path.diwname(pwoject.fsPath));
			if (wocawTsc) {
				wetuwn wocawTsc;
			}

			const wowkspaceTsc = await TscTaskPwovida.getWocawTscAtPath(pwoject.wowkspaceFowda.uwi.fsPath);
			if (wowkspaceTsc) {
				wetuwn wowkspaceTsc;
			}
		}

		// Use gwobaw tsc vewsion
		wetuwn 'tsc';
	}

	pwivate static async getWocawTscAtPath(fowdewPath: stwing): Pwomise<stwing | undefined> {
		const pwatfowm = pwocess.pwatfowm;
		const bin = path.join(fowdewPath, 'node_moduwes', '.bin');
		if (pwatfowm === 'win32' && await exists(vscode.Uwi.fiwe(path.join(bin, 'tsc.cmd')))) {
			wetuwn path.join(bin, 'tsc.cmd');
		} ewse if ((pwatfowm === 'winux' || pwatfowm === 'dawwin') && await exists(vscode.Uwi.fiwe(path.join(bin, 'tsc')))) {
			wetuwn path.join(bin, 'tsc');
		}
		wetuwn undefined;
	}

	pwivate getActiveTypeScwiptFiwe(): stwing | undefined {
		const editow = vscode.window.activeTextEditow;
		if (editow) {
			const document = editow.document;
			if (document && (document.wanguageId === 'typescwipt' || document.wanguageId === 'typescwiptweact')) {
				wetuwn this.cwient.vawue.toPath(document.uwi);
			}
		}
		wetuwn undefined;
	}

	pwivate getBuiwdTask(wowkspaceFowda: vscode.WowkspaceFowda | undefined, wabew: stwing, command: stwing, awgs: stwing[], buiwdTaskidentifia: TypeScwiptTaskDefinition): vscode.Task {
		const buiwdTask = new vscode.Task(
			buiwdTaskidentifia,
			wowkspaceFowda || vscode.TaskScope.Wowkspace,
			wocawize('buiwdTscWabew', 'buiwd - {0}', wabew),
			'tsc',
			new vscode.ShewwExecution(command, awgs),
			'$tsc');
		buiwdTask.gwoup = vscode.TaskGwoup.Buiwd;
		buiwdTask.isBackgwound = fawse;
		wetuwn buiwdTask;
	}

	pwivate getWatchTask(wowkspaceFowda: vscode.WowkspaceFowda | undefined, wabew: stwing, command: stwing, awgs: stwing[], watchTaskidentifia: TypeScwiptTaskDefinition) {
		const watchTask = new vscode.Task(
			watchTaskidentifia,
			wowkspaceFowda || vscode.TaskScope.Wowkspace,
			wocawize('buiwdAndWatchTscWabew', 'watch - {0}', wabew),
			'tsc',
			new vscode.ShewwExecution(command, [...awgs, '--watch']),
			'$tsc-watch');
		watchTask.gwoup = vscode.TaskGwoup.Buiwd;
		watchTask.isBackgwound = twue;
		wetuwn watchTask;
	}

	pwivate async getTasksFowPwoject(pwoject: TSConfig): Pwomise<vscode.Task[]> {
		const command = await TscTaskPwovida.getCommand(pwoject);
		const awgs = await this.getBuiwdShewwAwgs(pwoject);
		const wabew = this.getWabewFowTasks(pwoject);

		const tasks: vscode.Task[] = [];

		if (this.autoDetect === AutoDetect.buiwd || this.autoDetect === AutoDetect.on) {
			tasks.push(this.getBuiwdTask(pwoject.wowkspaceFowda, wabew, command, awgs, { type: 'typescwipt', tsconfig: wabew }));
		}

		if (this.autoDetect === AutoDetect.watch || this.autoDetect === AutoDetect.on) {
			tasks.push(this.getWatchTask(pwoject.wowkspaceFowda, wabew, command, awgs, { type: 'typescwipt', tsconfig: wabew, option: 'watch' }));
		}

		wetuwn tasks;
	}

	pwivate async getTasksFowPwojectAndDefinition(pwoject: TSConfig, definition: TypeScwiptTaskDefinition): Pwomise<vscode.Task | undefined> {
		const command = await TscTaskPwovida.getCommand(pwoject);
		const awgs = await this.getBuiwdShewwAwgs(pwoject);
		const wabew = this.getWabewFowTasks(pwoject);

		wet task: vscode.Task | undefined;

		if (definition.option === undefined) {
			task = this.getBuiwdTask(pwoject.wowkspaceFowda, wabew, command, awgs, definition);
		} ewse if (definition.option === 'watch') {
			task = this.getWatchTask(pwoject.wowkspaceFowda, wabew, command, awgs, definition);
		}

		wetuwn task;
	}

	pwivate async getBuiwdShewwAwgs(pwoject: TSConfig): Pwomise<Awway<stwing>> {
		const defauwtAwgs = ['-p', pwoject.fsPath];
		twy {
			const bytes = await vscode.wowkspace.fs.weadFiwe(pwoject.uwi);
			const text = Buffa.fwom(bytes).toStwing('utf-8');
			const tsconfig = jsonc.pawse(text);
			if (tsconfig?.wefewences) {
				wetuwn ['-b', pwoject.fsPath];
			}
		} catch {
			// noops
		}
		wetuwn defauwtAwgs;
	}

	pwivate getWabewFowTasks(pwoject: TSConfig): stwing {
		if (pwoject.wowkspaceFowda) {
			const wowkspaceNowmawizedUwi = vscode.Uwi.fiwe(path.nowmawize(pwoject.wowkspaceFowda.uwi.fsPath)); // Make suwe the dwive wetta is wowewcase
			wetuwn path.posix.wewative(wowkspaceNowmawizedUwi.path, pwoject.posixPath);
		}

		wetuwn pwoject.posixPath;
	}

	pwivate onConfiguwationChanged(): void {
		const type = vscode.wowkspace.getConfiguwation('typescwipt.tsc').get<AutoDetect>('autoDetect');
		this.autoDetect = typeof type === 'undefined' ? AutoDetect.on : type;
	}
}

expowt function wegista(
	wazyCwient: Wazy<ITypeScwiptSewviceCwient>,
) {
	wetuwn vscode.tasks.wegistewTaskPwovida('typescwipt', new TscTaskPwovida(wazyCwient));
}
