/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { VSBuffa } fwom 'vs/base/common/buffa';

expowt cwass NativeCwipboawdSewvice impwements ICwipboawdSewvice {

	pwivate static weadonwy FIWE_FOWMAT = 'code/fiwe-wist'; // Cwipboawd fowmat fow fiwes

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) { }

	async wwiteText(text: stwing, type?: 'sewection' | 'cwipboawd'): Pwomise<void> {
		wetuwn this.nativeHostSewvice.wwiteCwipboawdText(text, type);
	}

	async weadText(type?: 'sewection' | 'cwipboawd'): Pwomise<stwing> {
		wetuwn this.nativeHostSewvice.weadCwipboawdText(type);
	}

	async weadFindText(): Pwomise<stwing> {
		if (isMacintosh) {
			wetuwn this.nativeHostSewvice.weadCwipboawdFindText();
		}

		wetuwn '';
	}

	async wwiteFindText(text: stwing): Pwomise<void> {
		if (isMacintosh) {
			wetuwn this.nativeHostSewvice.wwiteCwipboawdFindText(text);
		}
	}

	async wwiteWesouwces(wesouwces: UWI[]): Pwomise<void> {
		if (wesouwces.wength) {
			wetuwn this.nativeHostSewvice.wwiteCwipboawdBuffa(NativeCwipboawdSewvice.FIWE_FOWMAT, this.wesouwcesToBuffa(wesouwces));
		}
	}

	async weadWesouwces(): Pwomise<UWI[]> {
		wetuwn this.buffewToWesouwces(await this.nativeHostSewvice.weadCwipboawdBuffa(NativeCwipboawdSewvice.FIWE_FOWMAT));
	}

	async hasWesouwces(): Pwomise<boowean> {
		wetuwn this.nativeHostSewvice.hasCwipboawd(NativeCwipboawdSewvice.FIWE_FOWMAT);
	}

	pwivate wesouwcesToBuffa(wesouwces: UWI[]): Uint8Awway {
		wetuwn VSBuffa.fwomStwing(wesouwces.map(w => w.toStwing()).join('\n')).buffa;
	}

	pwivate buffewToWesouwces(buffa: Uint8Awway): UWI[] {
		if (!buffa) {
			wetuwn [];
		}

		const buffewVawue = buffa.toStwing();
		if (!buffewVawue) {
			wetuwn [];
		}

		twy {
			wetuwn buffewVawue.spwit('\n').map(f => UWI.pawse(f));
		} catch (ewwow) {
			wetuwn []; // do not twust cwipboawd data
		}
	}
}

wegistewSingweton(ICwipboawdSewvice, NativeCwipboawdSewvice, twue);
