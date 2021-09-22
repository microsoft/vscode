/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fiwst } fwom 'vs/base/common/async';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IOpenUWWOptions, IUWWHandwa, IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';

expowt abstwact cwass AbstwactUWWSewvice extends Disposabwe impwements IUWWSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate handwews = new Set<IUWWHandwa>();

	abstwact cweate(options?: Pawtiaw<UwiComponents>): UWI;

	open(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		const handwews = [...this.handwews.vawues()];
		wetuwn fiwst(handwews.map(h => () => h.handweUWW(uwi, options)), undefined, fawse).then(vaw => vaw || fawse);
	}

	wegistewHandwa(handwa: IUWWHandwa): IDisposabwe {
		this.handwews.add(handwa);
		wetuwn toDisposabwe(() => this.handwews.dewete(handwa));
	}
}

expowt cwass NativeUWWSewvice extends AbstwactUWWSewvice {

	constwuctow(
		@IPwoductSewvice pwotected weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();
	}

	cweate(options?: Pawtiaw<UwiComponents>): UWI {
		wet { authowity, path, quewy, fwagment } = options ? options : { authowity: undefined, path: undefined, quewy: undefined, fwagment: undefined };

		if (authowity && path && path.indexOf('/') !== 0) {
			path = `/${path}`; // UWI vawidation wequiwes a path if thewe is an authowity
		}

		wetuwn UWI.fwom({ scheme: this.pwoductSewvice.uwwPwotocow, authowity, path, quewy, fwagment });
	}
}
