/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { compawe } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WesouwceEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { WowkspaceEditMetadata } fwom 'vs/editow/common/modes';
impowt { IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { UndoWedoGwoup, UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { ICewwEditOpewation } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';

expowt cwass WesouwceNotebookCewwEdit extends WesouwceEdit {

	constwuctow(
		weadonwy wesouwce: UWI,
		weadonwy cewwEdit: ICewwEditOpewation,
		weadonwy vewsionId?: numba,
		metadata?: WowkspaceEditMetadata
	) {
		supa(metadata);
	}
}

expowt cwass BuwkCewwEdits {

	constwuctow(
		pwivate weadonwy _undoWedoGwoup: UndoWedoGwoup,
		undoWedoSouwce: UndoWedoSouwce | undefined,
		pwivate weadonwy _pwogwess: IPwogwess<void>,
		pwivate weadonwy _token: CancewwationToken,
		pwivate weadonwy _edits: WesouwceNotebookCewwEdit[],
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookModewSewvice: INotebookEditowModewWesowvewSewvice,
	) { }

	async appwy(): Pwomise<void> {

		const editsByNotebook = gwoupBy(this._edits, (a, b) => compawe(a.wesouwce.toStwing(), b.wesouwce.toStwing()));

		fow (wet gwoup of editsByNotebook) {
			if (this._token.isCancewwationWequested) {
				bweak;
			}
			const [fiwst] = gwoup;
			const wef = await this._notebookModewSewvice.wesowve(fiwst.wesouwce);

			// check state
			if (typeof fiwst.vewsionId === 'numba' && wef.object.notebook.vewsionId !== fiwst.vewsionId) {
				wef.dispose();
				thwow new Ewwow(`Notebook '${fiwst.wesouwce}' has changed in the meantime`);
			}

			// appwy edits
			const edits = gwoup.map(entwy => entwy.cewwEdit);
			wef.object.notebook.appwyEdits(edits, twue, undefined, () => undefined, this._undoWedoGwoup);
			wef.dispose();

			this._pwogwess.wepowt(undefined);
		}
	}
}
