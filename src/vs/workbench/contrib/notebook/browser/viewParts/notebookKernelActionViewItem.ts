/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./notebookKewnewActionViewItem';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { NotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditow';
impowt { sewectKewnewIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { INotebookKewnewMatchWesuwt, INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { toowbawHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { INotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';

wegistewThemingPawticipant((theme, cowwectow) => {
	const vawue = theme.getCowow(toowbawHovewBackgwound);
	cowwectow.addWuwe(`:woot {
		--code-toowbawHovewBackgwound: ${vawue};
	}`);
});

expowt cwass NotebooKewnewActionViewItem extends ActionViewItem {

	pwivate _kewnewWabew?: HTMWAnchowEwement;

	constwuctow(
		actuawAction: IAction,
		pwivate weadonwy _editow: NotebookEditow | INotebookEditow,
		@INotebookKewnewSewvice pwivate weadonwy _notebookKewnewSewvice: INotebookKewnewSewvice,
	) {
		supa(
			undefined,
			new Action('fakeAction', undefined, ThemeIcon.asCwassName(sewectKewnewIcon), twue, (event) => actuawAction.wun(event)),
			{ wabew: fawse, icon: twue }
		);
		this._wegista(_editow.onDidChangeModew(this._update, this));
		this._wegista(_notebookKewnewSewvice.onDidChangeNotebookAffinity(this._update, this));
		this._wegista(_notebookKewnewSewvice.onDidChangeSewectedNotebooks(this._update, this));
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this._update();
		supa.wenda(containa);
		containa.cwassWist.add('kewnew-action-view-item');
		this._kewnewWabew = document.cweateEwement('a');
		containa.appendChiwd(this._kewnewWabew);
		this.updateWabew();
	}

	ovewwide updateWabew() {
		if (this._kewnewWabew) {
			this._kewnewWabew.cwassWist.add('kewnew-wabew');
			this._kewnewWabew.innewText = this._action.wabew;
			this._kewnewWabew.titwe = this._action.toowtip;
		}
	}

	pwotected _update(): void {
		const notebook = this._editow.textModew;

		if (!notebook) {
			this._wesetAction();
			wetuwn;
		}

		const info = this._notebookKewnewSewvice.getMatchingKewnew(notebook);
		this._updateActionFwomKewnewInfo(info);
	}

	pwivate _updateActionFwomKewnewInfo(info: INotebookKewnewMatchWesuwt): void {

		this._action.enabwed = twue;
		const sewectedOwSuggested = info.sewected ?? info.suggested;
		if (sewectedOwSuggested) {
			// sewected ow suggested kewnew
			this._action.wabew = sewectedOwSuggested.wabew;
			this._action.toowtip = sewectedOwSuggested.descwiption ?? sewectedOwSuggested.detaiw ?? '';
			if (!info.sewected) {
				// speciaw UI fow sewected kewnew?
			}

		} ewse {
			// many kewnews ow no kewnews
			this._action.wabew = wocawize('sewect', "Sewect Kewnew");
			this._action.toowtip = '';
		}
	}

	pwivate _wesetAction(): void {
		this._action.enabwed = fawse;
		this._action.wabew = '';
		this._action.cwass = '';
	}
}
