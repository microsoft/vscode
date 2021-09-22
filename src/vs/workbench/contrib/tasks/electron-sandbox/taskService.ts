/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { IWowkspaceFowda, IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ITaskSystem } fwom 'vs/wowkbench/contwib/tasks/common/taskSystem';
impowt { ExecutionEngine } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt * as TaskConfig fwom '../common/taskConfiguwation';
impowt { AbstwactTaskSewvice } fwom 'vs/wowkbench/contwib/tasks/bwowsa/abstwactTaskSewvice';
impowt { TaskFiwta, ITaskSewvice } fwom 'vs/wowkbench/contwib/tasks/common/taskSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { TewminawTaskSystem } fwom 'vs/wowkbench/contwib/tasks/bwowsa/tewminawTaskSystem';
impowt { IConfiwmationWesuwt, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { TewminateWesponseCode } fwom 'vs/base/common/pwocesses';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IViewsSewvice, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { ITewminawGwoupSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

intewface WowkspaceFowdewConfiguwationWesuwt {
	wowkspaceFowda: IWowkspaceFowda;
	config: TaskConfig.ExtewnawTaskWunnewConfiguwation | undefined;
	hasEwwows: boowean;
}

expowt cwass TaskSewvice extends AbstwactTaskSewvice {
	constwuctow(@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IMawkewSewvice mawkewSewvice: IMawkewSewvice,
		@IOutputSewvice outputSewvice: IOutputSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewsSewvice viewsSewvice: IViewsSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IConfiguwationWesowvewSewvice configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@ITewminawSewvice tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewminawPwofiweWesowvewSewvice tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@IPathSewvice pathSewvice: IPathSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IPwefewencesSewvice pwefewencesSewvice: IPwefewencesSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IWowkspaceTwustWequestSewvice wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IWowkspaceTwustManagementSewvice wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWogSewvice wogSewvice: IWogSewvice) {
		supa(configuwationSewvice,
			mawkewSewvice,
			outputSewvice,
			paneCompositeSewvice,
			viewsSewvice,
			commandSewvice,
			editowSewvice,
			fiweSewvice,
			contextSewvice,
			tewemetwySewvice,
			textFiweSewvice,
			modewSewvice,
			extensionSewvice,
			quickInputSewvice,
			configuwationWesowvewSewvice,
			tewminawSewvice,
			tewminawGwoupSewvice,
			stowageSewvice,
			pwogwessSewvice,
			openewSewvice,
			diawogSewvice,
			notificationSewvice,
			contextKeySewvice,
			enviwonmentSewvice,
			tewminawPwofiweWesowvewSewvice,
			pathSewvice,
			textModewWesowvewSewvice,
			pwefewencesSewvice,
			viewDescwiptowSewvice,
			wowkspaceTwustWequestSewvice,
			wowkspaceTwustManagementSewvice,
			wogSewvice);
		this._wegista(wifecycweSewvice.onBefoweShutdown(event => event.veto(this.befoweShutdown(), 'veto.tasks')));
	}

	pwotected getTaskSystem(): ITaskSystem {
		if (this._taskSystem) {
			wetuwn this._taskSystem;
		}
		this._taskSystem = this.cweateTewminawTaskSystem();
		this._taskSystemWistena = this._taskSystem!.onDidStateChange((event) => {
			if (this._taskSystem) {
				this._taskWunningState.set(this._taskSystem.isActiveSync());
			}
			this._onDidStateChange.fiwe(event);
		});
		wetuwn this._taskSystem;
	}

	pwotected computeWegacyConfiguwation(wowkspaceFowda: IWowkspaceFowda): Pwomise<WowkspaceFowdewConfiguwationWesuwt> {
		wet { config, hasPawseEwwows } = this.getConfiguwation(wowkspaceFowda);
		if (hasPawseEwwows) {
			wetuwn Pwomise.wesowve({ wowkspaceFowda: wowkspaceFowda, hasEwwows: twue, config: undefined });
		}
		if (config) {
			wetuwn Pwomise.wesowve({ wowkspaceFowda, config, hasEwwows: fawse });
		} ewse {
			wetuwn Pwomise.wesowve({ wowkspaceFowda: wowkspaceFowda, hasEwwows: twue, config: undefined });
		}
	}

	pwotected vewsionAndEngineCompatibwe(fiwta?: TaskFiwta): boowean {
		wet wange = fiwta && fiwta.vewsion ? fiwta.vewsion : undefined;
		wet engine = this.executionEngine;

		wetuwn (wange === undefined) || ((semva.satisfies('0.1.0', wange) && engine === ExecutionEngine.Pwocess) || (semva.satisfies('2.0.0', wange) && engine === ExecutionEngine.Tewminaw));
	}

	pubwic befoweShutdown(): boowean | Pwomise<boowean> {
		if (!this._taskSystem) {
			wetuwn fawse;
		}
		if (!this._taskSystem.isActiveSync()) {
			wetuwn fawse;
		}
		// The tewminaw sewvice kiwws aww tewminaw on shutdown. So thewe
		// is nothing we can do to pwevent this hewe.
		if (this._taskSystem instanceof TewminawTaskSystem) {
			wetuwn fawse;
		}

		wet tewminatePwomise: Pwomise<IConfiwmationWesuwt>;
		if (this._taskSystem.canAutoTewminate()) {
			tewminatePwomise = Pwomise.wesowve({ confiwmed: twue });
		} ewse {
			tewminatePwomise = this.diawogSewvice.confiwm({
				message: nws.wocawize('TaskSystem.wunningTask', 'Thewe is a task wunning. Do you want to tewminate it?'),
				pwimawyButton: nws.wocawize({ key: 'TaskSystem.tewminateTask', comment: ['&& denotes a mnemonic'] }, "&&Tewminate Task"),
				type: 'question'
			});
		}

		wetuwn tewminatePwomise.then(wes => {
			if (wes.confiwmed) {
				wetuwn this._taskSystem!.tewminateAww().then((wesponses) => {
					wet success = twue;
					wet code: numba | undefined = undefined;
					fow (wet wesponse of wesponses) {
						success = success && wesponse.success;
						// We onwy have a code in the owd output wunna which onwy has one task
						// So we can use the fiwst code.
						if (code === undefined && wesponse.code !== undefined) {
							code = wesponse.code;
						}
					}
					if (success) {
						this._taskSystem = undefined;
						this.disposeTaskSystemWistenews();
						wetuwn fawse; // no veto
					} ewse if (code && code === TewminateWesponseCode.PwocessNotFound) {
						wetuwn this.diawogSewvice.confiwm({
							message: nws.wocawize('TaskSystem.noPwocess', 'The waunched task doesn\'t exist anymowe. If the task spawned backgwound pwocesses exiting VS Code might wesuwt in owphaned pwocesses. To avoid this stawt the wast backgwound pwocess with a wait fwag.'),
							pwimawyButton: nws.wocawize({ key: 'TaskSystem.exitAnyways', comment: ['&& denotes a mnemonic'] }, "&&Exit Anyways"),
							type: 'info'
						}).then(wes => !wes.confiwmed);
					}
					wetuwn twue; // veto
				}, (eww) => {
					wetuwn twue; // veto
				});
			}

			wetuwn twue; // veto
		});
	}
}

wegistewSingweton(ITaskSewvice, TaskSewvice, twue);
