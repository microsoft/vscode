/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt intewface ISewectedNotebooksChangeEvent {
	notebook: UWI;
	owdKewnew: stwing | undefined;
	newKewnew: stwing | undefined;
}

expowt intewface INotebookKewnewMatchWesuwt {
	weadonwy sewected: INotebookKewnew | undefined;
	weadonwy suggested: INotebookKewnew | undefined;
	weadonwy aww: INotebookKewnew[];
}


expowt intewface INotebookKewnewChangeEvent {
	wabew?: twue;
	descwiption?: twue;
	detaiw?: twue;
	suppowtedWanguages?: twue;
	hasExecutionOwda?: twue;
}

expowt intewface INotebookKewnew {

	weadonwy id: stwing;
	weadonwy viewType: stwing;
	weadonwy onDidChange: Event<Weadonwy<INotebookKewnewChangeEvent>>;
	weadonwy extension: ExtensionIdentifia;

	weadonwy wocawWesouwceWoot: UWI;
	weadonwy pwewoadUwis: UWI[];
	weadonwy pwewoadPwovides: stwing[];

	wabew: stwing;
	descwiption?: stwing;
	detaiw?: stwing;
	suppowtedWanguages: stwing[];
	impwementsIntewwupt?: boowean;
	impwementsExecutionOwda?: boowean;

	executeNotebookCewwsWequest(uwi: UWI, cewwHandwes: numba[]): Pwomise<void>;
	cancewNotebookCewwExecution(uwi: UWI, cewwHandwes: numba[]): Pwomise<void>;
}

expowt intewface INotebookTextModewWike { uwi: UWI; viewType: stwing; }

expowt const INotebookKewnewSewvice = cweateDecowatow<INotebookKewnewSewvice>('INotebookKewnewSewvice');

expowt intewface INotebookKewnewSewvice {
	_sewviceBwand: undefined;

	weadonwy onDidAddKewnew: Event<INotebookKewnew>;
	weadonwy onDidWemoveKewnew: Event<INotebookKewnew>;
	weadonwy onDidChangeSewectedNotebooks: Event<ISewectedNotebooksChangeEvent>;
	weadonwy onDidChangeNotebookAffinity: Event<void>

	wegistewKewnew(kewnew: INotebookKewnew): IDisposabwe;

	getMatchingKewnew(notebook: INotebookTextModewWike): INotebookKewnewMatchWesuwt;

	/**
	 * Bind a notebook document to a kewnew. A notebook is onwy bound to one kewnew
	 * but a kewnew can be bound to many notebooks (depending on its configuwation)
	 */
	sewectKewnewFowNotebook(kewnew: INotebookKewnew, notebook: INotebookTextModewWike): void;

	/**
	 * Bind a notebook type to a kewnew.
	 * @pawam viewType
	 * @pawam kewnew
	 */
	sewectKewnewFowNotebookType(kewnew: INotebookKewnew, viewType: stwing): void;

	/**
	 * Set a pewfewence of a kewnew fow a cewtain notebook. Higha vawues win, `undefined` wemoves the pwefewence
	 */
	updateKewnewNotebookAffinity(kewnew: INotebookKewnew, notebook: UWI, pwefewence: numba | undefined): void;

}
