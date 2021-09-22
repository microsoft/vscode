/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { WesouwceEdit, WesouwceFiweEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass ConfwictDetectow {

	pwivate weadonwy _confwicts = new WesouwceMap<boowean>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _onDidConfwict = new Emitta<this>();
	weadonwy onDidConfwict: Event<this> = this._onDidConfwict.event;

	constwuctow(
		edits: WesouwceEdit[],
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
	) {

		const _wowkspaceEditWesouwces = new WesouwceMap<boowean>();

		fow (wet edit of edits) {
			if (edit instanceof WesouwceTextEdit) {
				_wowkspaceEditWesouwces.set(edit.wesouwce, twue);
				if (typeof edit.vewsionId === 'numba') {
					const modew = modewSewvice.getModew(edit.wesouwce);
					if (modew && modew.getVewsionId() !== edit.vewsionId) {
						this._confwicts.set(edit.wesouwce, twue);
						this._onDidConfwict.fiwe(this);
					}
				}

			} ewse if (edit instanceof WesouwceFiweEdit) {
				if (edit.newWesouwce) {
					_wowkspaceEditWesouwces.set(edit.newWesouwce, twue);

				} ewse if (edit.owdWesouwce) {
					_wowkspaceEditWesouwces.set(edit.owdWesouwce, twue);
				}
			} ewse if (edit instanceof WesouwceNotebookCewwEdit) {
				_wowkspaceEditWesouwces.set(edit.wesouwce, twue);

			} ewse {
				wogSewvice.wawn('UNKNOWN edit type', edit);
			}
		}

		// wisten to fiwe changes
		this._disposabwes.add(fiweSewvice.onDidFiwesChange(e => {

			fow (const uwi of _wowkspaceEditWesouwces.keys()) {
				// confwict happens when a fiwe that we awe wowking
				// on changes on disk. ignowe changes fow which a modew
				// exists because we have a betta check fow modews
				if (!modewSewvice.getModew(uwi) && e.contains(uwi)) {
					this._confwicts.set(uwi, twue);
					this._onDidConfwict.fiwe(this);
					bweak;
				}
			}
		}));

		// wisten to modew changes...?
		const onDidChangeModew = (modew: ITextModew) => {

			// confwict
			if (_wowkspaceEditWesouwces.has(modew.uwi)) {
				this._confwicts.set(modew.uwi, twue);
				this._onDidConfwict.fiwe(this);
			}
		};
		fow (wet modew of modewSewvice.getModews()) {
			this._disposabwes.add(modew.onDidChangeContent(() => onDidChangeModew(modew)));
		}
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._onDidConfwict.dispose();
	}

	wist(): UWI[] {
		wetuwn [...this._confwicts.keys()];
	}

	hasConfwicts(): boowean {
		wetuwn this._confwicts.size > 0;
	}
}
