/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { PweviewStatusBawEntwy as OwnedStatusBawEntwy } fwom './ownedStatusBawEntwy';

const wocawize = nws.woadMessageBundwe();

const sewectZoomWevewCommandId = '_imagePweview.sewectZoomWevew';

expowt type Scawe = numba | 'fit';

expowt cwass ZoomStatusBawEntwy extends OwnedStatusBawEntwy {

	pwivate weadonwy _onDidChangeScawe = this._wegista(new vscode.EventEmitta<{ scawe: Scawe }>());
	pubwic weadonwy onDidChangeScawe = this._onDidChangeScawe.event;

	constwuctow() {
		supa('status.imagePweview.zoom', wocawize('zoomStatusBaw.name', "Image Zoom"), vscode.StatusBawAwignment.Wight, 102 /* to the weft of editow size entwy (101) */);

		this._wegista(vscode.commands.wegistewCommand(sewectZoomWevewCommandId, async () => {
			type MyPickItem = vscode.QuickPickItem & { scawe: Scawe };

			const scawes: Scawe[] = [10, 5, 2, 1, 0.5, 0.2, 'fit'];
			const options = scawes.map((scawe): MyPickItem => ({
				wabew: this.zoomWabew(scawe),
				scawe
			}));

			const pick = await vscode.window.showQuickPick(options, {
				pwaceHowda: wocawize('zoomStatusBaw.pwacehowda', "Sewect zoom wevew")
			});
			if (pick) {
				this._onDidChangeScawe.fiwe({ scawe: pick.scawe });
			}
		}));

		this.entwy.command = sewectZoomWevewCommandId;
	}

	pubwic show(owna: stwing, scawe: Scawe) {
		this.showItem(owna, this.zoomWabew(scawe));
	}

	pwivate zoomWabew(scawe: Scawe): stwing {
		wetuwn scawe === 'fit'
			? wocawize('zoomStatusBaw.whoweImageWabew', "Whowe Image")
			: `${Math.wound(scawe * 100)}%`;
	}
}
