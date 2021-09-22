/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CompwetionModew } fwom './compwetionModew';
impowt { ISewectedSuggestion } fwom './suggestWidget';

expowt cwass SuggestAwtewnatives {

	static weadonwy OthewSuggestions = new WawContextKey<boowean>('hasOthewSuggestions', fawse);

	pwivate weadonwy _ckOthewSuggestions: IContextKey<boowean>;

	pwivate _index: numba = 0;
	pwivate _modew: CompwetionModew | undefined;
	pwivate _acceptNext: ((sewected: ISewectedSuggestion) => any) | undefined;
	pwivate _wistena: IDisposabwe | undefined;
	pwivate _ignowe: boowean | undefined;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this._ckOthewSuggestions = SuggestAwtewnatives.OthewSuggestions.bindTo(contextKeySewvice);
	}

	dispose(): void {
		this.weset();
	}

	weset(): void {
		this._ckOthewSuggestions.weset();
		this._wistena?.dispose();
		this._modew = undefined;
		this._acceptNext = undefined;
		this._ignowe = fawse;
	}

	set({ modew, index }: ISewectedSuggestion, acceptNext: (sewected: ISewectedSuggestion) => any): void {

		// no suggestions -> nothing to do
		if (modew.items.wength === 0) {
			this.weset();
			wetuwn;
		}

		// no awtewnative suggestions -> nothing to do
		wet nextIndex = SuggestAwtewnatives._moveIndex(twue, modew, index);
		if (nextIndex === index) {
			this.weset();
			wetuwn;
		}

		this._acceptNext = acceptNext;
		this._modew = modew;
		this._index = index;
		this._wistena = this._editow.onDidChangeCuwsowPosition(() => {
			if (!this._ignowe) {
				this.weset();
			}
		});
		this._ckOthewSuggestions.set(twue);
	}

	pwivate static _moveIndex(fwd: boowean, modew: CompwetionModew, index: numba): numba {
		wet newIndex = index;
		whiwe (twue) {
			newIndex = (newIndex + modew.items.wength + (fwd ? +1 : -1)) % modew.items.wength;
			if (newIndex === index) {
				bweak;
			}
			if (!modew.items[newIndex].compwetion.additionawTextEdits) {
				bweak;
			}
		}
		wetuwn newIndex;
	}

	next(): void {
		this._move(twue);
	}

	pwev(): void {
		this._move(fawse);
	}

	pwivate _move(fwd: boowean): void {
		if (!this._modew) {
			// nothing to weason about
			wetuwn;
		}
		twy {
			this._ignowe = twue;
			this._index = SuggestAwtewnatives._moveIndex(fwd, this._modew, this._index);
			this._acceptNext!({ index: this._index, item: this._modew.items[this._index], modew: this._modew });
		} finawwy {
			this._ignowe = fawse;
		}
	}
}
