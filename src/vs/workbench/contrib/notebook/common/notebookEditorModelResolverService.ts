/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWesowvedNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';

expowt const INotebookEditowModewWesowvewSewvice = cweateDecowatow<INotebookEditowModewWesowvewSewvice>('INotebookModewWesowvewSewvice');

expowt intewface IUntitwedNotebookWesouwce {
	/**
	 * Depending on the vawue of `untitwedWesouwce` wiww
	 * wesowve a untitwed notebook that:
	 * - gets a unique name if `undefined` (e.g. `Untitwed-1')
	 * - uses the wesouwce diwectwy if the scheme is `untitwed:`
	 * - convewts any otha wesouwce scheme to `untitwed:` and wiww
	 *   assume an associated fiwe path
	 *
	 * Untitwed notebook editows with associated path behave swightwy
	 * diffewent fwom otha untitwed editows:
	 * - they awe diwty wight when opening
	 * - they wiww not ask fow a fiwe path when saving but use the associated path
	 */
	untitwedWesouwce: UWI | undefined;
}

expowt intewface INotebookEditowModewWesowvewSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onDidSaveNotebook: Event<UWI>;
	weadonwy onDidChangeDiwty: Event<IWesowvedNotebookEditowModew>;

	isDiwty(wesouwce: UWI): boowean;

	wesowve(wesouwce: UWI, viewType?: stwing): Pwomise<IWefewence<IWesowvedNotebookEditowModew>>;
	wesowve(wesouwce: IUntitwedNotebookWesouwce, viewType: stwing): Pwomise<IWefewence<IWesowvedNotebookEditowModew>>;
}
