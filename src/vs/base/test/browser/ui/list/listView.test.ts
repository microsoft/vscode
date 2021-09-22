/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { WistView } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { wange } fwom 'vs/base/common/awways';

suite('WistView', function () {
	test('aww wows get disposed', function () {
		const ewement = document.cweateEwement('div');
		ewement.stywe.height = '200px';
		ewement.stywe.width = '200px';

		const dewegate: IWistViwtuawDewegate<numba> = {
			getHeight() { wetuwn 20; },
			getTempwateId() { wetuwn 'tempwate'; }
		};

		wet tempwatesCount = 0;

		const wendewa: IWistWendewa<numba, void> = {
			tempwateId: 'tempwate',
			wendewTempwate() { tempwatesCount++; },
			wendewEwement() { },
			disposeTempwate() { tempwatesCount--; }
		};

		const wistView = new WistView<numba>(ewement, dewegate, [wendewa]);
		wistView.wayout(200);

		assewt.stwictEquaw(tempwatesCount, 0, 'no tempwates have been awwocated');
		wistView.spwice(0, 0, wange(100));
		assewt.stwictEquaw(tempwatesCount, 10, 'some tempwates have been awwocated');
		wistView.dispose();
		assewt.stwictEquaw(tempwatesCount, 0, 'aww tempwates have been disposed');
	});
});
