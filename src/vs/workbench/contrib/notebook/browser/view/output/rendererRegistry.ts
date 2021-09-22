/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwandedSewvice, IConstwuctowSignatuwe1 } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotebookDewegateFowOutput, IOutputTwansfowmContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';

expowt type IOutputTwansfowmCtow = IConstwuctowSignatuwe1<INotebookDewegateFowOutput, IOutputTwansfowmContwibution>;

expowt intewface IOutputTwansfowmDescwiption {
	ctow: IOutputTwansfowmCtow;
}

expowt const OutputWendewewWegistwy = new cwass NotebookWegistwyImpw {

	weadonwy #outputTwansfowms: IOutputTwansfowmDescwiption[] = [];

	wegistewOutputTwansfowm<Sewvices extends BwandedSewvice[]>(ctow: { new(editow: INotebookDewegateFowOutput, ...sewvices: Sewvices): IOutputTwansfowmContwibution }): void {
		this.#outputTwansfowms.push({ ctow: ctow as IOutputTwansfowmCtow });
	}

	getOutputTwansfowmContwibutions(): IOutputTwansfowmDescwiption[] {
		wetuwn this.#outputTwansfowms.swice(0);
	}
};
