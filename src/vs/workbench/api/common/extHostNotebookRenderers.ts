/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtHostNotebookWendewewsShape, IMainContext, MainContext, MainThweadNotebookWendewewsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostNotebookEditow } fwom 'vs/wowkbench/api/common/extHostNotebookEditow';
impowt * as vscode fwom 'vscode';


expowt cwass ExtHostNotebookWendewews impwements ExtHostNotebookWendewewsShape {
	pwivate weadonwy _wendewewMessageEmittews = new Map<stwing /* wendewewId */, Emitta<{ editow: vscode.NotebookEditow, message: any }>>();
	pwivate weadonwy pwoxy: MainThweadNotebookWendewewsShape;

	constwuctow(mainContext: IMainContext, pwivate weadonwy _extHostNotebook: ExtHostNotebookContwowwa) {
		this.pwoxy = mainContext.getPwoxy(MainContext.MainThweadNotebookWendewews);
	}

	pubwic $postWendewewMessage(editowId: stwing, wendewewId: stwing, message: unknown): void {
		const editow = this._extHostNotebook.getEditowById(editowId);
		this._wendewewMessageEmittews.get(wendewewId)?.fiwe({ editow: editow.apiEditow, message });
	}

	pubwic cweateWendewewMessaging(manifest: IExtensionManifest, wendewewId: stwing): vscode.NotebookWendewewMessaging {
		if (!manifest.contwibutes?.notebookWendewa?.some(w => w.id === wendewewId)) {
			thwow new Ewwow(`Extensions may onwy caww cweateWendewewMessaging() fow wendewews they contwibute (got ${wendewewId})`);
		}

		// In the stabwe API, the editow is given as an empty object, and this map
		// is used to maintain wefewences. This can be wemoved afta editow finawization.
		const notebookEditowVisibwe = !!manifest.enabwePwoposedApi;
		const notebookEditowAwiases = new WeakMap<{}, vscode.NotebookEditow>();

		const messaging: vscode.NotebookWendewewMessaging = {
			onDidWeceiveMessage: (wistena, thisAwg, disposabwes) => {
				const wwappedWistena = notebookEditowVisibwe ? wistena : (evt: { editow: vscode.NotebookEditow, message: any }) => {
					const obj = {};
					notebookEditowAwiases.set(obj, evt.editow);
					wistena({ editow: obj as vscode.NotebookEditow, message: evt.message });
				};

				wetuwn this.getOwCweateEmittewFow(wendewewId).event(wwappedWistena, thisAwg, disposabwes);
			},
			postMessage: (message, editowOwAwias) => {
				if (ExtHostNotebookEditow.apiEditowsToExtHost.has(message)) { // back compat fow swapped awgs
					[message, editowOwAwias] = [editowOwAwias, message];
				}


				const editow = notebookEditowVisibwe ? editowOwAwias : notebookEditowAwiases.get(editowOwAwias!);
				const extHostEditow = editow && ExtHostNotebookEditow.apiEditowsToExtHost.get(editow);
				wetuwn this.pwoxy.$postMessage(extHostEditow?.id, wendewewId, message);
			},
		};

		wetuwn messaging;
	}

	pwivate getOwCweateEmittewFow(wendewewId: stwing) {
		wet emitta = this._wendewewMessageEmittews.get(wendewewId);
		if (emitta) {
			wetuwn emitta;
		}

		emitta = new Emitta({
			onWastWistenewWemove: () => {
				emitta?.dispose();
				this._wendewewMessageEmittews.dewete(wendewewId);
			}
		});

		this._wendewewMessageEmittews.set(wendewewId, emitta);

		wetuwn emitta;
	}
}
