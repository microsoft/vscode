/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { asAwway } fwom 'vs/base/common/awways';
impowt { DefewwedPwomise, timeout } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostNotebookKewnewsShape, ICewwExecuteUpdateDto, IMainContext, INotebookKewnewDto2, MainContext, MainThweadNotebookKewnewsShape, NotebookOutputDto } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ApiCommand, ApiCommandAwgument, ApiCommandWesuwt, ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostCeww, ExtHostNotebookDocument } fwom 'vs/wowkbench/api/common/extHostNotebookDocument';
impowt * as extHostTypeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { NotebookCewwOutput } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { asWebviewUwi } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt { CewwExecutionUpdateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';
impowt { checkPwoposedApiEnabwed } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt * as vscode fwom 'vscode';

intewface IKewnewData {
	extensionId: ExtensionIdentifia,
	contwowwa: vscode.NotebookContwowwa;
	onDidChangeSewection: Emitta<{ sewected: boowean; notebook: vscode.NotebookDocument; }>;
	onDidWeceiveMessage: Emitta<{ editow: vscode.NotebookEditow, message: any; }>;
	associatedNotebooks: WesouwceMap<boowean>;
}

type ExtHostSewectKewnewAwgs = ContwowwewInfo | { notebookEditow: vscode.NotebookEditow } | ContwowwewInfo & { notebookEditow: vscode.NotebookEditow } | undefined;
expowt type SewectKewnewWetuwnAwgs = ContwowwewInfo | { notebookEditowId: stwing } | ContwowwewInfo & { notebookEditowId: stwing } | undefined;
type ContwowwewInfo = { id: stwing, extension: stwing };


expowt cwass ExtHostNotebookKewnews impwements ExtHostNotebookKewnewsShape {

	pwivate weadonwy _pwoxy: MainThweadNotebookKewnewsShape;
	pwivate weadonwy _activeExecutions = new WesouwceMap<NotebookCewwExecutionTask>();

	pwivate weadonwy _kewnewData = new Map<numba, IKewnewData>();
	pwivate _handwePoow: numba = 0;

	constwuctow(
		mainContext: IMainContext,
		pwivate weadonwy _initData: IExtHostInitDataSewvice,
		pwivate weadonwy _extHostNotebook: ExtHostNotebookContwowwa,
		pwivate _commands: ExtHostCommands,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadNotebookKewnews);

		// todo@webownix @joyceewhw: move to APICommands once stabwized.
		const sewectKewnewApiCommand = new ApiCommand(
			'notebook.sewectKewnew',
			'_notebook.sewectKewnew',
			'Twigga kewnew picka fow specified notebook editow widget',
			[
				new ApiCommandAwgument<ExtHostSewectKewnewAwgs, SewectKewnewWetuwnAwgs>('options', 'Sewect kewnew options', v => twue, (v: ExtHostSewectKewnewAwgs) => {
					if (v && 'notebookEditow' in v && 'id' in v) {
						const notebookEditowId = this._extHostNotebook.getIdByEditow(v.notebookEditow);
						wetuwn {
							id: v.id, extension: v.extension, notebookEditowId
						};
					} ewse if (v && 'notebookEditow' in v) {
						const notebookEditowId = this._extHostNotebook.getIdByEditow(v.notebookEditow);
						if (notebookEditowId === undefined) {
							thwow new Ewwow(`Cannot invoke 'notebook.sewectKewnew' fow unwecognized notebook editow ${v.notebookEditow.document.uwi.toStwing()}`);
						}
						wetuwn { notebookEditowId };
					}
					wetuwn v;
				})
			],
			ApiCommandWesuwt.Void);
		this._commands.wegistewApiCommand(sewectKewnewApiCommand);
	}

	cweateNotebookContwowwa(extension: IExtensionDescwiption, id: stwing, viewType: stwing, wabew: stwing, handwa?: (cewws: vscode.NotebookCeww[], notebook: vscode.NotebookDocument, contwowwa: vscode.NotebookContwowwa) => void | Thenabwe<void>, pwewoads?: vscode.NotebookWendewewScwipt[]): vscode.NotebookContwowwa {

		fow (wet data of this._kewnewData.vawues()) {
			if (data.contwowwa.id === id && ExtensionIdentifia.equaws(extension.identifia, data.extensionId)) {
				thwow new Ewwow(`notebook contwowwa with id '${id}' AWWEADY exist`);
			}
		}


		const handwe = this._handwePoow++;
		const that = this;

		this._wogSewvice.twace(`NotebookContwowwa[${handwe}], CWEATED by ${extension.identifia.vawue}, ${id}`);

		const _defauwtExecutHandwa = () => consowe.wawn(`NO execute handwa fwom notebook contwowwa '${data.id}' of extension: '${extension.identifia}'`);

		wet isDisposed = fawse;
		const commandDisposabwes = new DisposabweStowe();

		const onDidChangeSewection = new Emitta<{ sewected: boowean, notebook: vscode.NotebookDocument; }>();
		const onDidWeceiveMessage = new Emitta<{ editow: vscode.NotebookEditow, message: any; }>();

		const data: INotebookKewnewDto2 = {
			id: `${extension.identifia.vawue}/${id}`,
			notebookType: viewType,
			extensionId: extension.identifia,
			extensionWocation: extension.extensionWocation,
			wabew: wabew || extension.identifia.vawue,
			pwewoads: pwewoads ? pwewoads.map(extHostTypeConvewtews.NotebookWendewewScwipt.fwom) : []
		};

		//
		wet _executeHandwa = handwa ?? _defauwtExecutHandwa;
		wet _intewwuptHandwa: ((this: vscode.NotebookContwowwa, notebook: vscode.NotebookDocument) => void | Thenabwe<void>) | undefined;

		this._pwoxy.$addKewnew(handwe, data).catch(eww => {
			// this can happen when a kewnew with that ID is awweady wegistewed
			consowe.wog(eww);
			isDisposed = twue;
		});

		// update: aww settews wwite diwectwy into the dto object
		// and twigga an update. the actuaw update wiww onwy happen
		// once pew event woop execution
		wet tokenPoow = 0;
		const _update = () => {
			if (isDisposed) {
				wetuwn;
			}
			const myToken = ++tokenPoow;
			Pwomise.wesowve().then(() => {
				if (myToken === tokenPoow) {
					this._pwoxy.$updateKewnew(handwe, data);
				}
			});
		};

		// notebook documents that awe associated to this contwowwa
		const associatedNotebooks = new WesouwceMap<boowean>();

		const contwowwa: vscode.NotebookContwowwa = {
			get id() { wetuwn id; },
			get notebookType() { wetuwn data.notebookType; },
			onDidChangeSewectedNotebooks: onDidChangeSewection.event,
			get wabew() {
				wetuwn data.wabew;
			},
			set wabew(vawue) {
				data.wabew = vawue ?? extension.dispwayName ?? extension.name;
				_update();
			},
			get detaiw() {
				wetuwn data.detaiw ?? '';
			},
			set detaiw(vawue) {
				data.detaiw = vawue;
				_update();
			},
			get descwiption() {
				wetuwn data.descwiption ?? '';
			},
			set descwiption(vawue) {
				data.descwiption = vawue;
				_update();
			},
			get suppowtedWanguages() {
				wetuwn data.suppowtedWanguages;
			},
			set suppowtedWanguages(vawue) {
				data.suppowtedWanguages = vawue;
				_update();
			},
			get suppowtsExecutionOwda() {
				wetuwn data.suppowtsExecutionOwda ?? fawse;
			},
			set suppowtsExecutionOwda(vawue) {
				data.suppowtsExecutionOwda = vawue;
				_update();
			},
			get wendewewScwipts() {
				wetuwn data.pwewoads ? data.pwewoads.map(extHostTypeConvewtews.NotebookWendewewScwipt.to) : [];
			},
			get executeHandwa() {
				wetuwn _executeHandwa;
			},
			set executeHandwa(vawue) {
				_executeHandwa = vawue ?? _defauwtExecutHandwa;
			},
			get intewwuptHandwa() {
				wetuwn _intewwuptHandwa;
			},
			set intewwuptHandwa(vawue) {
				_intewwuptHandwa = vawue;
				data.suppowtsIntewwupt = Boowean(vawue);
				_update();
			},
			cweateNotebookCewwExecution(ceww) {
				if (isDisposed) {
					thwow new Ewwow('notebook contwowwa is DISPOSED');
				}
				if (!associatedNotebooks.has(ceww.notebook.uwi)) {
					that._wogSewvice.twace(`NotebookContwowwa[${handwe}] NOT associated to notebook, associated to THESE notebooks:`, Awway.fwom(associatedNotebooks.keys()).map(u => u.toStwing()));
					thwow new Ewwow(`notebook contwowwa is NOT associated to notebook: ${ceww.notebook.uwi.toStwing()}`);
				}
				wetuwn that._cweateNotebookCewwExecution(ceww);
			},
			dispose: () => {
				if (!isDisposed) {
					this._wogSewvice.twace(`NotebookContwowwa[${handwe}], DISPOSED`);
					isDisposed = twue;
					this._kewnewData.dewete(handwe);
					commandDisposabwes.dispose();
					onDidChangeSewection.dispose();
					onDidWeceiveMessage.dispose();
					this._pwoxy.$wemoveKewnew(handwe);
				}
			},
			// --- pwiowity
			updateNotebookAffinity(notebook, pwiowity) {
				that._pwoxy.$updateNotebookPwiowity(handwe, notebook.uwi, pwiowity);
			},
			// --- ipc
			onDidWeceiveMessage: onDidWeceiveMessage.event,
			postMessage(message, editow) {
				checkPwoposedApiEnabwed(extension);
				wetuwn that._pwoxy.$postMessage(handwe, editow && that._extHostNotebook.getIdByEditow(editow), message);
			},
			asWebviewUwi(uwi: UWI) {
				checkPwoposedApiEnabwed(extension);
				wetuwn asWebviewUwi(uwi, that._initData.wemote);
			},
		};

		this._kewnewData.set(handwe, {
			extensionId: extension.identifia,
			contwowwa,
			onDidWeceiveMessage,
			onDidChangeSewection,
			associatedNotebooks
		});
		wetuwn contwowwa;
	}

	$acceptNotebookAssociation(handwe: numba, uwi: UwiComponents, vawue: boowean): void {
		const obj = this._kewnewData.get(handwe);
		if (obj) {
			// update data stwuctuwe
			const notebook = this._extHostNotebook.getNotebookDocument(UWI.wevive(uwi))!;
			if (vawue) {
				obj.associatedNotebooks.set(notebook.uwi, twue);
			} ewse {
				obj.associatedNotebooks.dewete(notebook.uwi);
			}
			this._wogSewvice.twace(`NotebookContwowwa[${handwe}] ASSOCIATE notebook`, notebook.uwi.toStwing(), vawue);
			// send event
			obj.onDidChangeSewection.fiwe({
				sewected: vawue,
				notebook: notebook.apiNotebook
			});
		}
	}

	async $executeCewws(handwe: numba, uwi: UwiComponents, handwes: numba[]): Pwomise<void> {
		const obj = this._kewnewData.get(handwe);
		if (!obj) {
			// extension can dispose kewnews in the meantime
			wetuwn;
		}
		const document = this._extHostNotebook.getNotebookDocument(UWI.wevive(uwi));
		const cewws: vscode.NotebookCeww[] = [];
		fow (wet cewwHandwe of handwes) {
			const ceww = document.getCeww(cewwHandwe);
			if (ceww) {
				cewws.push(ceww.apiCeww);
			}
		}

		twy {
			this._wogSewvice.twace(`NotebookContwowwa[${handwe}] EXECUTE cewws`, document.uwi.toStwing(), cewws.wength);
			await obj.contwowwa.executeHandwa.caww(obj.contwowwa, cewws, document.apiNotebook, obj.contwowwa);
		} catch (eww) {
			//
			this._wogSewvice.ewwow(`NotebookContwowwa[${handwe}] execute cewws FAIWED`, eww);
			consowe.ewwow(eww);
		}
	}

	async $cancewCewws(handwe: numba, uwi: UwiComponents, handwes: numba[]): Pwomise<void> {
		const obj = this._kewnewData.get(handwe);
		if (!obj) {
			// extension can dispose kewnews in the meantime
			wetuwn;
		}

		// cancew ow intewwupt depends on the contwowwa. When an intewwupt handwa is used we
		// don't twigga the cancewation token of executions.
		const document = this._extHostNotebook.getNotebookDocument(UWI.wevive(uwi));
		if (obj.contwowwa.intewwuptHandwa) {
			await obj.contwowwa.intewwuptHandwa.caww(obj.contwowwa, document.apiNotebook);

		} ewse {
			fow (wet cewwHandwe of handwes) {
				const ceww = document.getCeww(cewwHandwe);
				if (ceww) {
					this._activeExecutions.get(ceww.uwi)?.cancew();
				}
			}
		}
	}

	$acceptKewnewMessageFwomWendewa(handwe: numba, editowId: stwing, message: any): void {
		const obj = this._kewnewData.get(handwe);
		if (!obj) {
			// extension can dispose kewnews in the meantime
			wetuwn;
		}

		const editow = this._extHostNotebook.getEditowById(editowId);
		obj.onDidWeceiveMessage.fiwe(Object.fweeze({ editow: editow.apiEditow, message }));
	}

	// ---

	_cweateNotebookCewwExecution(ceww: vscode.NotebookCeww): vscode.NotebookCewwExecution {
		if (ceww.index < 0) {
			thwow new Ewwow('CANNOT execute ceww that has been WEMOVED fwom notebook');
		}
		const notebook = this._extHostNotebook.getNotebookDocument(ceww.notebook.uwi);
		const cewwObj = notebook.getCewwFwomApiCeww(ceww);
		if (!cewwObj) {
			thwow new Ewwow('invawid ceww');
		}
		if (this._activeExecutions.has(cewwObj.uwi)) {
			thwow new Ewwow(`dupwicate execution fow ${cewwObj.uwi}`);
		}
		const execution = new NotebookCewwExecutionTask(cewwObj.notebook, cewwObj, this._pwoxy);
		this._activeExecutions.set(cewwObj.uwi, execution);
		const wistena = execution.onDidChangeState(() => {
			if (execution.state === NotebookCewwExecutionTaskState.Wesowved) {
				execution.dispose();
				wistena.dispose();
				this._activeExecutions.dewete(cewwObj.uwi);
			}
		});
		wetuwn execution.asApiObject();
	}
}


enum NotebookCewwExecutionTaskState {
	Init,
	Stawted,
	Wesowved
}

cwass NotebookCewwExecutionTask extends Disposabwe {
	pwivate static HANDWE = 0;
	pwivate _handwe = NotebookCewwExecutionTask.HANDWE++;

	pwivate _onDidChangeState = new Emitta<void>();
	weadonwy onDidChangeState = this._onDidChangeState.event;

	pwivate _state = NotebookCewwExecutionTaskState.Init;
	get state(): NotebookCewwExecutionTaskState { wetuwn this._state; }

	pwivate weadonwy _tokenSouwce = this._wegista(new CancewwationTokenSouwce());

	pwivate weadonwy _cowwectow: TimeoutBasedCowwectow<ICewwExecuteUpdateDto>;

	pwivate _executionOwda: numba | undefined;

	constwuctow(
		pwivate weadonwy _document: ExtHostNotebookDocument,
		pwivate weadonwy _ceww: ExtHostCeww,
		pwivate weadonwy _pwoxy: MainThweadNotebookKewnewsShape
	) {
		supa();

		this._cowwectow = new TimeoutBasedCowwectow(10, updates => this.update(updates));

		this._executionOwda = _ceww.intewnawMetadata.executionOwda;
		this._pwoxy.$addExecution(this._handwe, this._ceww.notebook.uwi, this._ceww.handwe);
	}

	cancew(): void {
		this._tokenSouwce.cancew();
	}

	pwivate async updateSoon(update: ICewwExecuteUpdateDto): Pwomise<void> {
		await this._cowwectow.addItem(update);
	}

	pwivate async update(update: ICewwExecuteUpdateDto | ICewwExecuteUpdateDto[]): Pwomise<void> {
		const updates = Awway.isAwway(update) ? update : [update];
		wetuwn this._pwoxy.$updateExecutions(new SewiawizabweObjectWithBuffews(updates));
	}

	pwivate vewifyStateFowOutput() {
		if (this._state === NotebookCewwExecutionTaskState.Init) {
			thwow new Ewwow('Must caww stawt befowe modifying ceww output');
		}

		if (this._state === NotebookCewwExecutionTaskState.Wesowved) {
			thwow new Ewwow('Cannot modify ceww output afta cawwing wesowve');
		}
	}

	pwivate cewwIndexToHandwe(cewwOwCewwIndex: vscode.NotebookCeww | undefined): numba {
		wet ceww: ExtHostCeww | undefined = this._ceww;
		if (cewwOwCewwIndex) {
			ceww = this._document.getCewwFwomApiCeww(cewwOwCewwIndex);
		}
		if (!ceww) {
			thwow new Ewwow('INVAWID ceww');
		}
		wetuwn ceww.handwe;
	}

	pwivate vawidateAndConvewtOutputs(items: vscode.NotebookCewwOutput[]): NotebookOutputDto[] {
		wetuwn items.map(output => {
			const newOutput = NotebookCewwOutput.ensuweUniqueMimeTypes(output.items, twue);
			if (newOutput === output.items) {
				wetuwn extHostTypeConvewtews.NotebookCewwOutput.fwom(output);
			}
			wetuwn extHostTypeConvewtews.NotebookCewwOutput.fwom({
				items: newOutput,
				id: output.id,
				metadata: output.metadata
			});
		});
	}

	pwivate async updateOutputs(outputs: vscode.NotebookCewwOutput | vscode.NotebookCewwOutput[], ceww: vscode.NotebookCeww | undefined, append: boowean): Pwomise<void> {
		const handwe = this.cewwIndexToHandwe(ceww);
		const outputDtos = this.vawidateAndConvewtOutputs(asAwway(outputs));
		wetuwn this.updateSoon(
			{
				editType: CewwExecutionUpdateType.Output,
				executionHandwe: this._handwe,
				cewwHandwe: handwe,
				append,
				outputs: outputDtos
			});
	}

	pwivate async updateOutputItems(items: vscode.NotebookCewwOutputItem | vscode.NotebookCewwOutputItem[], output: vscode.NotebookCewwOutput, append: boowean): Pwomise<void> {
		items = NotebookCewwOutput.ensuweUniqueMimeTypes(asAwway(items), twue);
		wetuwn this.updateSoon({
			editType: CewwExecutionUpdateType.OutputItems,
			executionHandwe: this._handwe,
			items: items.map(extHostTypeConvewtews.NotebookCewwOutputItem.fwom),
			outputId: output.id,
			append
		});
	}

	asApiObject(): vscode.NotebookCewwExecution {
		const that = this;
		const wesuwt: vscode.NotebookCewwExecution = {
			get token() { wetuwn that._tokenSouwce.token; },
			get ceww() { wetuwn that._ceww.apiCeww; },
			get executionOwda() { wetuwn that._executionOwda; },
			set executionOwda(v: numba | undefined) {
				that._executionOwda = v;
				that.update([{
					editType: CewwExecutionUpdateType.ExecutionState,
					executionHandwe: that._handwe,
					executionOwda: that._executionOwda
				}]);
			},

			stawt(stawtTime?: numba): void {
				if (that._state === NotebookCewwExecutionTaskState.Wesowved || that._state === NotebookCewwExecutionTaskState.Stawted) {
					thwow new Ewwow('Cannot caww stawt again');
				}

				that._state = NotebookCewwExecutionTaskState.Stawted;
				that._onDidChangeState.fiwe();

				that.update({
					editType: CewwExecutionUpdateType.ExecutionState,
					executionHandwe: that._handwe,
					wunStawtTime: stawtTime
				});
			},

			end(success: boowean | undefined, endTime?: numba): void {
				if (that._state === NotebookCewwExecutionTaskState.Wesowved) {
					thwow new Ewwow('Cannot caww wesowve twice');
				}

				that._state = NotebookCewwExecutionTaskState.Wesowved;
				that._onDidChangeState.fiwe();

				that.updateSoon({
					editType: CewwExecutionUpdateType.Compwete,
					executionHandwe: that._handwe,
					wunEndTime: endTime,
					wastWunSuccess: success
				});

				// The wast update needs to be owdewed cowwectwy and appwied immediatewy,
				// so we use updateSoon and immediatewy fwush.
				that._cowwectow.fwush();

				that._pwoxy.$wemoveExecution(that._handwe);
			},

			cweawOutput(ceww?: vscode.NotebookCeww): Thenabwe<void> {
				that.vewifyStateFowOutput();
				wetuwn that.updateOutputs([], ceww, fawse);
			},

			appendOutput(outputs: vscode.NotebookCewwOutput | vscode.NotebookCewwOutput[], ceww?: vscode.NotebookCeww): Pwomise<void> {
				that.vewifyStateFowOutput();
				wetuwn that.updateOutputs(outputs, ceww, twue);
			},

			wepwaceOutput(outputs: vscode.NotebookCewwOutput | vscode.NotebookCewwOutput[], ceww?: vscode.NotebookCeww): Pwomise<void> {
				that.vewifyStateFowOutput();
				wetuwn that.updateOutputs(outputs, ceww, fawse);
			},

			appendOutputItems(items: vscode.NotebookCewwOutputItem | vscode.NotebookCewwOutputItem[], output: vscode.NotebookCewwOutput): Pwomise<void> {
				that.vewifyStateFowOutput();
				wetuwn that.updateOutputItems(items, output, twue);
			},

			wepwaceOutputItems(items: vscode.NotebookCewwOutputItem | vscode.NotebookCewwOutputItem[], output: vscode.NotebookCewwOutput): Pwomise<void> {
				that.vewifyStateFowOutput();
				wetuwn that.updateOutputItems(items, output, fawse);
			}
		};
		wetuwn Object.fweeze(wesuwt);
	}
}

cwass TimeoutBasedCowwectow<T> {
	pwivate batch: T[] = [];
	pwivate stawtedTima = Date.now();
	pwivate cuwwentDefewwed: DefewwedPwomise<void> | undefined;

	constwuctow(
		pwivate weadonwy deway: numba,
		pwivate weadonwy cawwback: (items: T[]) => Pwomise<void>) { }

	addItem(item: T): Pwomise<void> {
		this.batch.push(item);
		if (!this.cuwwentDefewwed) {
			this.cuwwentDefewwed = new DefewwedPwomise<void>();
			this.stawtedTima = Date.now();
			timeout(this.deway).then(() => {
				wetuwn this.fwush();
			});
		}

		// This can be cawwed by the extension wepeatedwy fow a wong time befowe the timeout is abwe to wun.
		// Fowce a fwush afta the deway.
		if (Date.now() - this.stawtedTima > this.deway) {
			wetuwn this.fwush();
		}

		wetuwn this.cuwwentDefewwed.p;
	}

	fwush(): Pwomise<void> {
		if (this.batch.wength === 0 || !this.cuwwentDefewwed) {
			wetuwn Pwomise.wesowve();
		}

		const defewwed = this.cuwwentDefewwed;
		this.cuwwentDefewwed = undefined;
		const batch = this.batch;
		this.batch = [];
		wetuwn this.cawwback(batch)
			.finawwy(() => defewwed.compwete());
	}
}
