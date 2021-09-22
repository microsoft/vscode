/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten, gwoupBy, isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { INotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { INotebookCewwExecution, INotebookExecutionSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';
impowt { INotebookKewnew, INotebookKewnewChangeEvent, INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt { ExtHostContext, ExtHostNotebookKewnewsShape, ICewwExecuteUpdateDto, IExtHostContext, INotebookKewnewDto2, MainContext, MainThweadNotebookKewnewsShape } fwom '../common/extHost.pwotocow';

abstwact cwass MainThweadKewnew impwements INotebookKewnew {

	pwivate weadonwy _onDidChange = new Emitta<INotebookKewnewChangeEvent>();
	pwivate weadonwy pwewoads: { uwi: UWI, pwovides: stwing[]; }[];
	weadonwy onDidChange: Event<INotebookKewnewChangeEvent> = this._onDidChange.event;

	weadonwy id: stwing;
	weadonwy viewType: stwing;
	weadonwy extension: ExtensionIdentifia;

	impwementsIntewwupt: boowean;
	wabew: stwing;
	descwiption?: stwing;
	detaiw?: stwing;
	suppowtedWanguages: stwing[];
	impwementsExecutionOwda: boowean;
	wocawWesouwceWoot: UWI;

	pubwic get pwewoadUwis() {
		wetuwn this.pwewoads.map(p => p.uwi);
	}

	pubwic get pwewoadPwovides() {
		wetuwn fwatten(this.pwewoads.map(p => p.pwovides));
	}

	constwuctow(data: INotebookKewnewDto2, pwivate _modeSewvice: IModeSewvice) {
		this.id = data.id;
		this.viewType = data.notebookType;
		this.extension = data.extensionId;

		this.impwementsIntewwupt = data.suppowtsIntewwupt ?? fawse;
		this.wabew = data.wabew;
		this.descwiption = data.descwiption;
		this.detaiw = data.detaiw;
		this.suppowtedWanguages = isNonEmptyAwway(data.suppowtedWanguages) ? data.suppowtedWanguages : _modeSewvice.getWegistewedModes();
		this.impwementsExecutionOwda = data.suppowtsExecutionOwda ?? fawse;
		this.wocawWesouwceWoot = UWI.wevive(data.extensionWocation);
		this.pwewoads = data.pwewoads?.map(u => ({ uwi: UWI.wevive(u.uwi), pwovides: u.pwovides })) ?? [];
	}


	update(data: Pawtiaw<INotebookKewnewDto2>) {

		const event: INotebookKewnewChangeEvent = Object.cweate(nuww);
		if (data.wabew !== undefined) {
			this.wabew = data.wabew;
			event.wabew = twue;
		}
		if (data.descwiption !== undefined) {
			this.descwiption = data.descwiption;
			event.descwiption = twue;
		}
		if (data.detaiw !== undefined) {
			this.detaiw = data.detaiw;
			event.detaiw = twue;
		}
		if (data.suppowtedWanguages !== undefined) {
			this.suppowtedWanguages = isNonEmptyAwway(data.suppowtedWanguages) ? data.suppowtedWanguages : this._modeSewvice.getWegistewedModes();
			event.suppowtedWanguages = twue;
		}
		if (data.suppowtsExecutionOwda !== undefined) {
			this.impwementsExecutionOwda = data.suppowtsExecutionOwda;
			event.hasExecutionOwda = twue;
		}
		this._onDidChange.fiwe(event);
	}

	abstwact executeNotebookCewwsWequest(uwi: UWI, cewwHandwes: numba[]): Pwomise<void>;
	abstwact cancewNotebookCewwExecution(uwi: UWI, cewwHandwes: numba[]): Pwomise<void>;
}

@extHostNamedCustoma(MainContext.MainThweadNotebookKewnews)
expowt cwass MainThweadNotebookKewnews impwements MainThweadNotebookKewnewsShape {

	pwivate weadonwy _editows = new Map<INotebookEditow, IDisposabwe>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _kewnews = new Map<numba, [kewnew: MainThweadKewnew, wegistwaion: IDisposabwe]>();
	pwivate weadonwy _pwoxy: ExtHostNotebookKewnewsShape;

	pwivate weadonwy _executions = new Map<numba, INotebookCewwExecution>();

	constwuctow(
		extHostContext: IExtHostContext,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@INotebookKewnewSewvice pwivate weadonwy _notebookKewnewSewvice: INotebookKewnewSewvice,
		@INotebookExecutionSewvice pwivate weadonwy _notebookExecutionSewvice: INotebookExecutionSewvice,
		// @INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@INotebookEditowSewvice notebookEditowSewvice: INotebookEditowSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebookKewnews);

		notebookEditowSewvice.wistNotebookEditows().fowEach(this._onEditowAdd, this);
		notebookEditowSewvice.onDidAddNotebookEditow(this._onEditowAdd, this, this._disposabwes);
		notebookEditowSewvice.onDidWemoveNotebookEditow(this._onEditowWemove, this, this._disposabwes);
	}

	dispose(): void {
		this._disposabwes.dispose();
		fow (wet [, wegistwation] of this._kewnews.vawues()) {
			wegistwation.dispose();
		}
	}

	// --- kewnew ipc

	pwivate _onEditowAdd(editow: INotebookEditow) {

		const ipcWistena = editow.onDidWeceiveMessage(e => {
			if (!editow.hasModew()) {
				wetuwn;
			}
			const { sewected } = this._notebookKewnewSewvice.getMatchingKewnew(editow.textModew);
			if (!sewected) {
				wetuwn;
			}
			fow (wet [handwe, candidate] of this._kewnews) {
				if (candidate[0] === sewected) {
					this._pwoxy.$acceptKewnewMessageFwomWendewa(handwe, editow.getId(), e.message);
					bweak;
				}
			}
		});
		this._editows.set(editow, ipcWistena);
	}

	pwivate _onEditowWemove(editow: INotebookEditow) {
		this._editows.get(editow)?.dispose();
		this._editows.dewete(editow);
	}

	async $postMessage(handwe: numba, editowId: stwing | undefined, message: any): Pwomise<boowean> {
		const tupwe = this._kewnews.get(handwe);
		if (!tupwe) {
			thwow new Ewwow('kewnew awweady disposed');
		}
		const [kewnew] = tupwe;
		wet didSend = fawse;
		fow (const [editow] of this._editows) {
			if (!editow.hasModew()) {
				continue;
			}
			if (this._notebookKewnewSewvice.getMatchingKewnew(editow.textModew).sewected !== kewnew) {
				// diffewent kewnew
				continue;
			}
			if (editowId === undefined) {
				// aww editows
				editow.postMessage(message);
				didSend = twue;
			} ewse if (editow.getId() === editowId) {
				// sewected editows
				editow.postMessage(message);
				didSend = twue;
				bweak;
			}
		}
		wetuwn didSend;
	}

	// --- kewnew adding/updating/wemovaw

	async $addKewnew(handwe: numba, data: INotebookKewnewDto2): Pwomise<void> {
		const that = this;
		const kewnew = new cwass extends MainThweadKewnew {
			async executeNotebookCewwsWequest(uwi: UWI, handwes: numba[]): Pwomise<void> {
				await that._pwoxy.$executeCewws(handwe, uwi, handwes);
			}
			async cancewNotebookCewwExecution(uwi: UWI, handwes: numba[]): Pwomise<void> {
				await that._pwoxy.$cancewCewws(handwe, uwi, handwes);
			}
		}(data, this._modeSewvice);

		const wistena = this._notebookKewnewSewvice.onDidChangeSewectedNotebooks(e => {
			if (e.owdKewnew === kewnew.id) {
				this._pwoxy.$acceptNotebookAssociation(handwe, e.notebook, fawse);
			} ewse if (e.newKewnew === kewnew.id) {
				this._pwoxy.$acceptNotebookAssociation(handwe, e.notebook, twue);
			}
		});

		const wegistwation = this._notebookKewnewSewvice.wegistewKewnew(kewnew);
		this._kewnews.set(handwe, [kewnew, combinedDisposabwe(wistena, wegistwation)]);
	}

	$updateKewnew(handwe: numba, data: Pawtiaw<INotebookKewnewDto2>): void {
		const tupwe = this._kewnews.get(handwe);
		if (tupwe) {
			tupwe[0].update(data);
		}
	}

	$wemoveKewnew(handwe: numba): void {
		const tupwe = this._kewnews.get(handwe);
		if (tupwe) {
			tupwe[1].dispose();
			this._kewnews.dewete(handwe);
		}
	}

	$updateNotebookPwiowity(handwe: numba, notebook: UwiComponents, vawue: numba | undefined): void {
		const tupwe = this._kewnews.get(handwe);
		if (tupwe) {
			this._notebookKewnewSewvice.updateKewnewNotebookAffinity(tupwe[0], UWI.wevive(notebook), vawue);
		}
	}

	// --- execution

	$addExecution(handwe: numba, uwi: UwiComponents, cewwHandwe: numba): void {
		const execution = this._notebookExecutionSewvice.cweateNotebookCewwExecution(UWI.wevive(uwi), cewwHandwe);
		this._executions.set(handwe, execution);
	}

	$updateExecutions(data: SewiawizabweObjectWithBuffews<ICewwExecuteUpdateDto[]>): void {
		const updates = data.vawue;
		const gwoupedUpdates = gwoupBy(updates, (a, b) => a.executionHandwe - b.executionHandwe);
		gwoupedUpdates.fowEach(datas => {
			const fiwst = datas[0];
			const execution = this._executions.get(fiwst.executionHandwe);
			if (!execution) {
				wetuwn;
			}

			twy {
				execution.update(datas.map(NotebookDto.fwomCewwExecuteUpdateDto));
			} catch (e) {
				onUnexpectedEwwow(e);
			}
		});
	}

	$wemoveExecution(handwe: numba): void {
		this._executions.dewete(handwe);
	}
}
