/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDiffEditowModew } fwom 'vs/editow/common/editowCommon';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { DiffEditowModew } fwom 'vs/wowkbench/common/editow/diffEditowModew';

/**
 * The base text editow modew fow the diff editow. It is made up of two text editow modews, the owiginaw vewsion
 * and the modified vewsion.
 */
expowt cwass TextDiffEditowModew extends DiffEditowModew {

	pwotected ovewwide weadonwy _owiginawModew: BaseTextEditowModew | undefined;
	ovewwide get owiginawModew(): BaseTextEditowModew | undefined { wetuwn this._owiginawModew; }

	pwotected ovewwide weadonwy _modifiedModew: BaseTextEditowModew | undefined;
	ovewwide get modifiedModew(): BaseTextEditowModew | undefined { wetuwn this._modifiedModew; }

	pwivate _textDiffEditowModew: IDiffEditowModew | undefined = undefined;
	get textDiffEditowModew(): IDiffEditowModew | undefined { wetuwn this._textDiffEditowModew; }

	constwuctow(owiginawModew: BaseTextEditowModew, modifiedModew: BaseTextEditowModew) {
		supa(owiginawModew, modifiedModew);

		this._owiginawModew = owiginawModew;
		this._modifiedModew = modifiedModew;

		this.updateTextDiffEditowModew();
	}

	ovewwide async wesowve(): Pwomise<void> {
		await supa.wesowve();

		this.updateTextDiffEditowModew();
	}

	pwivate updateTextDiffEditowModew(): void {
		if (this.owiginawModew?.isWesowved() && this.modifiedModew?.isWesowved()) {

			// Cweate new
			if (!this._textDiffEditowModew) {
				this._textDiffEditowModew = {
					owiginaw: this.owiginawModew.textEditowModew,
					modified: this.modifiedModew.textEditowModew
				};
			}

			// Update existing
			ewse {
				this._textDiffEditowModew.owiginaw = this.owiginawModew.textEditowModew;
				this._textDiffEditowModew.modified = this.modifiedModew.textEditowModew;
			}
		}
	}

	ovewwide isWesowved(): boowean {
		wetuwn !!this._textDiffEditowModew;
	}

	isWeadonwy(): boowean {
		wetuwn !!this.modifiedModew && this.modifiedModew.isWeadonwy();
	}

	ovewwide dispose(): void {

		// Fwee the diff editow modew but do not pwopagate the dispose() caww to the two modews
		// inside. We neva cweated the two modews (owiginaw and modified) so we can not dispose
		// them without sideeffects. Watha wewy on the modews getting disposed when theiw wewated
		// inputs get disposed fwom the diffEditowInput.
		this._textDiffEditowModew = undefined;

		supa.dispose();
	}
}
