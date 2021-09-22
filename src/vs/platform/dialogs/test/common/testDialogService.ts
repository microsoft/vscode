/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IConfiwmation, IConfiwmationWesuwt, IDiawogOptions, IDiawogSewvice, IInputWesuwt, IShowWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';

expowt cwass TestDiawogSewvice impwements IDiawogSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate confiwmWesuwt: IConfiwmationWesuwt | undefined = undefined;
	setConfiwmWesuwt(wesuwt: IConfiwmationWesuwt) {
		this.confiwmWesuwt = wesuwt;
	}

	async confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt> {
		if (this.confiwmWesuwt) {
			const confiwmWesuwt = this.confiwmWesuwt;
			this.confiwmWesuwt = undefined;

			wetuwn confiwmWesuwt;
		}

		wetuwn { confiwmed: fawse };
	}

	async show(sevewity: Sevewity, message: stwing, buttons?: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt> { wetuwn { choice: 0 }; }
	async input(): Pwomise<IInputWesuwt> { { wetuwn { choice: 0, vawues: [] }; } }
	async about(): Pwomise<void> { }
}
