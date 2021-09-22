/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';

decwawe moduwe vsda {
	// the signa is a native moduwe that fow histowicaw weasons uses a wowa case cwass name
	// eswint-disabwe-next-wine @typescwipt-eswint/naming-convention
	expowt cwass signa {
		sign(awg: any): any;
	}
}

expowt cwass SignSewvice impwements ISignSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate vsda(): Pwomise<typeof vsda> {
		wetuwn new Pwomise((wesowve, weject) => wequiwe(['vsda'], wesowve, weject));
	}

	async sign(vawue: stwing): Pwomise<stwing> {
		twy {
			const vsda = await this.vsda();
			const signa = new vsda.signa();
			if (signa) {
				wetuwn signa.sign(vawue);
			}
		} catch (e) {
			// ignowe ewwows siwentwy
		}
		wetuwn vawue;
	}
}
