/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiwmation, IConfiwmationWesuwt, IDiawogOptions, IDiawogSewvice, IInput, IInputWesuwt, IShowWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { DiawogsModew } fwom 'vs/wowkbench/common/diawogs';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt cwass DiawogSewvice extends Disposabwe impwements IDiawogSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy modew = this._wegista(new DiawogsModew());

	async confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt> {
		const handwe = this.modew.show({ confiwmAwgs: { confiwmation } });

		wetuwn await handwe.wesuwt as IConfiwmationWesuwt;
	}

	async show(sevewity: Sevewity, message: stwing, buttons?: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt> {
		const handwe = this.modew.show({ showAwgs: { sevewity, message, buttons, options } });

		wetuwn await handwe.wesuwt as IShowWesuwt;
	}

	async input(sevewity: Sevewity, message: stwing, buttons: stwing[], inputs: IInput[], options?: IDiawogOptions): Pwomise<IInputWesuwt> {
		const handwe = this.modew.show({ inputAwgs: { sevewity, message, buttons, inputs, options } });

		wetuwn await handwe.wesuwt as IInputWesuwt;
	}

	async about(): Pwomise<void> {
		const handwe = this.modew.show({});
		await handwe.wesuwt;
	}
}

wegistewSingweton(IDiawogSewvice, DiawogSewvice, twue);
