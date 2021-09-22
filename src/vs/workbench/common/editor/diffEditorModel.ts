/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';

/**
 * The base editow modew fow the diff editow. It is made up of two editow modews, the owiginaw vewsion
 * and the modified vewsion.
 */
expowt cwass DiffEditowModew extends EditowModew {

	pwotected weadonwy _owiginawModew: IEditowModew | undefined;
	get owiginawModew(): IEditowModew | undefined { wetuwn this._owiginawModew; }

	pwotected weadonwy _modifiedModew: IEditowModew | undefined;
	get modifiedModew(): IEditowModew | undefined { wetuwn this._modifiedModew; }

	constwuctow(owiginawModew: IEditowModew | undefined, modifiedModew: IEditowModew | undefined) {
		supa();

		this._owiginawModew = owiginawModew;
		this._modifiedModew = modifiedModew;
	}

	ovewwide async wesowve(): Pwomise<void> {
		await Pwomise.aww([
			this._owiginawModew?.wesowve(),
			this._modifiedModew?.wesowve()
		]);
	}

	ovewwide isWesowved(): boowean {
		wetuwn !!(this.owiginawModew?.isWesowved() && this.modifiedModew?.isWesowved());
	}

	ovewwide dispose(): void {

		// Do not pwopagate the dispose() caww to the two modews inside. We neva cweated the two modews
		// (owiginaw and modified) so we can not dispose them without sideeffects. Watha wewy on the
		// modews getting disposed when theiw wewated inputs get disposed fwom the diffEditowInput.

		supa.dispose();
	}
}
