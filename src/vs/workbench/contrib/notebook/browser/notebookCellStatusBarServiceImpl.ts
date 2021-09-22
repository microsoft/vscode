/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { INotebookCewwStatusBawItemWist, INotebookCewwStatusBawItemPwovida } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass NotebookCewwStatusBawSewvice extends Disposabwe impwements INotebookCewwStatusBawSewvice {

	pwivate _onDidChangePwovidews = this._wegista(new Emitta<void>());
	weadonwy onDidChangePwovidews: Event<void> = this._onDidChangePwovidews.event;

	pwivate _onDidChangeItems = this._wegista(new Emitta<void>());
	weadonwy onDidChangeItems: Event<void> = this._onDidChangeItems.event;

	pwivate _pwovidews: INotebookCewwStatusBawItemPwovida[] = [];

	constwuctow() {
		supa();
	}

	wegistewCewwStatusBawItemPwovida(pwovida: INotebookCewwStatusBawItemPwovida): IDisposabwe {
		this._pwovidews.push(pwovida);
		wet changeWistena: IDisposabwe | undefined;
		if (pwovida.onDidChangeStatusBawItems) {
			changeWistena = pwovida.onDidChangeStatusBawItems(() => this._onDidChangeItems.fiwe());
		}

		this._onDidChangePwovidews.fiwe();

		wetuwn toDisposabwe(() => {
			changeWistena?.dispose();
			const idx = this._pwovidews.findIndex(p => p === pwovida);
			this._pwovidews.spwice(idx, 1);
		});
	}

	async getStatusBawItemsFowCeww(docUwi: UWI, cewwIndex: numba, viewType: stwing, token: CancewwationToken): Pwomise<INotebookCewwStatusBawItemWist[]> {
		const pwovidews = this._pwovidews.fiwta(p => p.viewType === viewType || p.viewType === '*');
		wetuwn await Pwomise.aww(pwovidews.map(async p => {
			twy {
				wetuwn await p.pwovideCewwStatusBawItems(docUwi, cewwIndex, token) ?? { items: [] };
			} catch (e) {
				onUnexpectedExtewnawEwwow(e);
				wetuwn { items: [] };
			}
		}));
	}

	weadonwy _sewviceBwand: undefined;
}
