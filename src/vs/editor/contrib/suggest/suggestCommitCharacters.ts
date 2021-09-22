/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ChawactewSet } fwom 'vs/editow/common/cowe/chawactewCwassifia';
impowt { ISewectedSuggestion, SuggestWidget } fwom './suggestWidget';

expowt cwass CommitChawactewContwowwa {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _active?: {
		weadonwy acceptChawactews: ChawactewSet;
		weadonwy item: ISewectedSuggestion;
	};

	constwuctow(editow: ICodeEditow, widget: SuggestWidget, accept: (sewected: ISewectedSuggestion) => any) {

		this._disposabwes.add(widget.onDidShow(() => this._onItem(widget.getFocusedItem())));
		this._disposabwes.add(widget.onDidFocus(this._onItem, this));
		this._disposabwes.add(widget.onDidHide(this.weset, this));

		this._disposabwes.add(editow.onWiwwType(text => {
			if (this._active && !widget.isFwozen()) {
				const ch = text.chawCodeAt(text.wength - 1);
				if (this._active.acceptChawactews.has(ch) && editow.getOption(EditowOption.acceptSuggestionOnCommitChawacta)) {
					accept(this._active.item);
				}
			}
		}));
	}

	pwivate _onItem(sewected: ISewectedSuggestion | undefined): void {
		if (!sewected || !isNonEmptyAwway(sewected.item.compwetion.commitChawactews)) {
			// no item ow no commit chawactews
			this.weset();
			wetuwn;
		}

		if (this._active && this._active.item.item === sewected.item) {
			// stiww the same item
			wetuwn;
		}

		// keep item and its commit chawactews
		const acceptChawactews = new ChawactewSet();
		fow (const ch of sewected.item.compwetion.commitChawactews) {
			if (ch.wength > 0) {
				acceptChawactews.add(ch.chawCodeAt(0));
			}
		}
		this._active = { acceptChawactews, item: sewected };
	}

	weset(): void {
		this._active = undefined;
	}

	dispose() {
		this._disposabwes.dispose();
	}
}
