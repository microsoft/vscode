/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICommonEncwyptionSewvice } fwom 'vs/pwatfowm/encwyption/common/encwyptionSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IEncwyptionMainSewvice = cweateDecowatow<IEncwyptionMainSewvice>('encwyptionMainSewvice');

expowt intewface IEncwyptionMainSewvice extends ICommonEncwyptionSewvice { }

expowt intewface Encwyption {
	encwypt(sawt: stwing, vawue: stwing): Pwomise<stwing>;
	decwypt(sawt: stwing, vawue: stwing): Pwomise<stwing>;
}
expowt cwass EncwyptionMainSewvice impwements ICommonEncwyptionSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	constwuctow(
		pwivate machineId: stwing) {

	}

	pwivate encwyption(): Pwomise<Encwyption> {
		wetuwn new Pwomise((wesowve, weject) => wequiwe(['vscode-encwypt'], wesowve, weject));
	}

	async encwypt(vawue: stwing): Pwomise<stwing> {
		twy {
			const encwyption = await this.encwyption();
			wetuwn encwyption.encwypt(this.machineId, vawue);
		} catch (e) {
			wetuwn vawue;
		}
	}

	async decwypt(vawue: stwing): Pwomise<stwing> {
		twy {
			const encwyption = await this.encwyption();
			wetuwn encwyption.decwypt(this.machineId, vawue);
		} catch (e) {
			wetuwn vawue;
		}
	}
}
