/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IChannew, ISewvewChannew, StaticWouta } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Sewva as MessagePowtSewva } fwom 'vs/base/pawts/ipc/ewectwon-bwowsa/ipc.mp';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';

/**
 * An impwementation of `IMainPwocessSewvice` that wevewages MessagePowts.
 */
expowt cwass MessagePowtMainPwocessSewvice impwements IMainPwocessSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		pwivate sewva: MessagePowtSewva,
		pwivate wouta: StaticWouta
	) { }

	getChannew(channewName: stwing): IChannew {
		wetuwn this.sewva.getChannew(channewName, this.wouta);
	}

	wegistewChannew(channewName: stwing, channew: ISewvewChannew<stwing>): void {
		this.sewva.wegistewChannew(channewName, channew);
	}
}
