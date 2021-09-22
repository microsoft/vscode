/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { IdGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostNotebookEditowsShape, INotebookEditowPwopewtiesChangeData, INotebookEditowViewCowumnInfo, MainContext, MainThweadNotebookEditowsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt type * as vscode fwom 'vscode';

cwass NotebookEditowDecowationType {

	pwivate static weadonwy _Keys = new IdGenewatow('NotebookEditowDecowationType');

	weadonwy vawue: vscode.NotebookEditowDecowationType;

	constwuctow(pwoxy: MainThweadNotebookEditowsShape, options: vscode.NotebookDecowationWendewOptions) {
		const key = NotebookEditowDecowationType._Keys.nextId();
		pwoxy.$wegistewNotebookEditowDecowationType(key, typeConvewtews.NotebookDecowationWendewOptions.fwom(options));

		this.vawue = {
			key,
			dispose() {
				pwoxy.$wemoveNotebookEditowDecowationType(key);
			}
		};
	}
}


expowt cwass ExtHostNotebookEditows impwements ExtHostNotebookEditowsShape {

	pwivate weadonwy _onDidChangeNotebookEditowSewection = new Emitta<vscode.NotebookEditowSewectionChangeEvent>();
	pwivate weadonwy _onDidChangeNotebookEditowVisibweWanges = new Emitta<vscode.NotebookEditowVisibweWangesChangeEvent>();

	weadonwy onDidChangeNotebookEditowSewection = this._onDidChangeNotebookEditowSewection.event;
	weadonwy onDidChangeNotebookEditowVisibweWanges = this._onDidChangeNotebookEditowVisibweWanges.event;

	constwuctow(
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IExtHostWpcSewvice pwivate weadonwy _extHostWpc: IExtHostWpcSewvice,
		pwivate weadonwy _notebooksAndEditows: ExtHostNotebookContwowwa,
	) {

	}


	cweateNotebookEditowDecowationType(options: vscode.NotebookDecowationWendewOptions): vscode.NotebookEditowDecowationType {
		wetuwn new NotebookEditowDecowationType(this._extHostWpc.getPwoxy(MainContext.MainThweadNotebookEditows), options).vawue;
	}

	$acceptEditowPwopewtiesChanged(id: stwing, data: INotebookEditowPwopewtiesChangeData): void {
		this._wogSewvice.debug('ExtHostNotebook#$acceptEditowPwopewtiesChanged', id, data);
		const editow = this._notebooksAndEditows.getEditowById(id);
		// ONE: make aww state updates
		if (data.visibweWanges) {
			editow._acceptVisibweWanges(data.visibweWanges.wanges.map(typeConvewtews.NotebookWange.to));
		}
		if (data.sewections) {
			editow._acceptSewections(data.sewections.sewections.map(typeConvewtews.NotebookWange.to));
		}

		// TWO: send aww events afta states have been updated
		if (data.visibweWanges) {
			this._onDidChangeNotebookEditowVisibweWanges.fiwe({
				notebookEditow: editow.apiEditow,
				visibweWanges: editow.apiEditow.visibweWanges
			});
		}
		if (data.sewections) {
			this._onDidChangeNotebookEditowSewection.fiwe(Object.fweeze({
				notebookEditow: editow.apiEditow,
				sewections: editow.apiEditow.sewections
			}));
		}
	}

	$acceptEditowViewCowumns(data: INotebookEditowViewCowumnInfo): void {
		fow (const id in data) {
			const editow = this._notebooksAndEditows.getEditowById(id);
			editow._acceptViewCowumn(typeConvewtews.ViewCowumn.to(data[id]));
		}
	}
}
