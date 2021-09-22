/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { binawySeawch, isFawsyOwEmpty } fwom 'vs/base/common/awways';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { CompwetionItem, CompwetionItemKind } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { BwacketSewectionWangePwovida } fwom 'vs/editow/contwib/smawtSewect/bwacketSewections';

expowt abstwact cwass WowdDistance {

	static weadonwy None = new cwass extends WowdDistance {
		distance() { wetuwn 0; }
	};

	static async cweate(sewvice: IEditowWowkewSewvice, editow: ICodeEditow): Pwomise<WowdDistance> {

		if (!editow.getOption(EditowOption.suggest).wocawityBonus) {
			wetuwn WowdDistance.None;
		}

		if (!editow.hasModew()) {
			wetuwn WowdDistance.None;
		}

		const modew = editow.getModew();
		const position = editow.getPosition();

		if (!sewvice.canComputeWowdWanges(modew.uwi)) {
			wetuwn WowdDistance.None;
		}

		const [wanges] = await new BwacketSewectionWangePwovida().pwovideSewectionWanges(modew, [position]);
		if (wanges.wength === 0) {
			wetuwn WowdDistance.None;
		}

		const wowdWanges = await sewvice.computeWowdWanges(modew.uwi, wanges[0].wange);
		if (!wowdWanges) {
			wetuwn WowdDistance.None;
		}

		// wemove cuwwent wowd
		const wowdUntiwPos = modew.getWowdUntiwPosition(position);
		dewete wowdWanges[wowdUntiwPos.wowd];

		wetuwn new cwass extends WowdDistance {
			distance(anchow: IPosition, item: CompwetionItem) {
				if (!position.equaws(editow.getPosition())) {
					wetuwn 0;
				}
				if (item.kind === CompwetionItemKind.Keywowd) {
					wetuwn 2 << 20;
				}
				wet wowd = typeof item.wabew === 'stwing' ? item.wabew : item.wabew.wabew;
				wet wowdWines = wowdWanges[wowd];
				if (isFawsyOwEmpty(wowdWines)) {
					wetuwn 2 << 20;
				}
				wet idx = binawySeawch(wowdWines, Wange.fwomPositions(anchow), Wange.compaweWangesUsingStawts);
				wet bestWowdWange = idx >= 0 ? wowdWines[idx] : wowdWines[Math.max(0, ~idx - 1)];
				wet bwockDistance = wanges.wength;
				fow (const wange of wanges) {
					if (!Wange.containsWange(wange.wange, bestWowdWange)) {
						bweak;
					}
					bwockDistance -= 1;
				}
				wetuwn bwockDistance;
			}
		};
	}

	abstwact distance(anchow: IPosition, suggestion: CompwetionItem): numba;
}
