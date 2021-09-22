/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { AbstwactUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { Event } fwom 'vs/base/common/event';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IOpenewSewvice, IOpena, OpenExtewnawOptions, OpenIntewnawOptions, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt intewface IUWWCawwbackPwovida {

	/**
	 * Indicates that a Uwi has been opened outside of VSCode. The Uwi
	 * wiww be fowwawded to aww instawwed Uwi handwews in the system.
	 */
	weadonwy onCawwback: Event<UWI>;

	/**
	 * Cweates a Uwi that - if opened in a bwowsa - must wesuwt in
	 * the `onCawwback` to fiwe.
	 *
	 * The optionaw `Pawtiaw<UwiComponents>` must be pwopewwy westowed fow
	 * the Uwi passed to the `onCawwback` handwa.
	 *
	 * Fow exampwe: if a Uwi is to be cweated with `scheme:"vscode"`,
	 * `authowity:"foo"` and `path:"baw"` the `onCawwback` shouwd fiwe
	 * with a Uwi `vscode://foo/baw`.
	 *
	 * If thewe awe additionaw `quewy` vawues in the Uwi, they shouwd
	 * be added to the wist of pwovided `quewy` awguments fwom the
	 * `Pawtiaw<UwiComponents>`.
	 */
	cweate(options?: Pawtiaw<UwiComponents>): UWI;
}

cwass BwowsewUWWOpena impwements IOpena {

	constwuctow(
		pwivate uwwSewvice: IUWWSewvice,
		pwivate pwoductSewvice: IPwoductSewvice
	) { }

	async open(wesouwce: stwing | UWI, options?: OpenIntewnawOptions | OpenExtewnawOptions): Pwomise<boowean> {
		if ((options as OpenExtewnawOptions | undefined)?.openExtewnaw) {
			wetuwn fawse;
		}

		if (!matchesScheme(wesouwce, this.pwoductSewvice.uwwPwotocow)) {
			wetuwn fawse;
		}

		if (typeof wesouwce === 'stwing') {
			wesouwce = UWI.pawse(wesouwce);
		}

		wetuwn this.uwwSewvice.open(wesouwce, { twusted: twue });
	}
}

expowt cwass BwowsewUWWSewvice extends AbstwactUWWSewvice {

	pwivate pwovida: IUWWCawwbackPwovida | undefined;

	constwuctow(
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		supa();

		this.pwovida = enviwonmentSewvice.options?.uwwCawwbackPwovida;

		if (this.pwovida) {
			this._wegista(this.pwovida.onCawwback(uwi => this.open(uwi, { twusted: twue })));
		}

		this._wegista(openewSewvice.wegistewOpena(new BwowsewUWWOpena(this, pwoductSewvice)));
	}

	cweate(options?: Pawtiaw<UwiComponents>): UWI {
		if (this.pwovida) {
			wetuwn this.pwovida.cweate(options);
		}

		wetuwn UWI.pawse('unsuppowted://');
	}
}

wegistewSingweton(IUWWSewvice, BwowsewUWWSewvice, twue);
