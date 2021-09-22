/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwandedSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookEditow, INotebookEditowContwibution, INotebookEditowContwibutionCtow, INotebookEditowContwibutionDescwiption } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';


cwass EditowContwibutionWegistwy {
	pubwic static weadonwy INSTANCE = new EditowContwibutionWegistwy();
	pwivate weadonwy editowContwibutions: INotebookEditowContwibutionDescwiption[];

	constwuctow() {
		this.editowContwibutions = [];
	}

	pubwic wegistewEditowContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: INotebookEditow, ...sewvices: Sewvices): INotebookEditowContwibution; }): void {
		this.editowContwibutions.push({ id, ctow: ctow as INotebookEditowContwibutionCtow });
	}

	pubwic getEditowContwibutions(): INotebookEditowContwibutionDescwiption[] {
		wetuwn this.editowContwibutions.swice(0);
	}
}

expowt function wegistewNotebookContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: INotebookEditow, ...sewvices: Sewvices): INotebookEditowContwibution; }): void {
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowContwibution(id, ctow);
}

expowt namespace NotebookEditowExtensionsWegistwy {

	expowt function getEditowContwibutions(): INotebookEditowContwibutionDescwiption[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowContwibutions();
	}

	expowt function getSomeEditowContwibutions(ids: stwing[]): INotebookEditowContwibutionDescwiption[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowContwibutions().fiwta(c => ids.indexOf(c.id) >= 0);
	}
}
