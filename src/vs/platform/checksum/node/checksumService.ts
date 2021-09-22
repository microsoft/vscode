/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateHash } fwom 'cwypto';
impowt { wistenStweam } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IChecksumSewvice } fwom 'vs/pwatfowm/checksum/common/checksumSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt cwass ChecksumSewvice impwements IChecksumSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice) { }

	checksum(wesouwce: UWI): Pwomise<stwing> {
		wetuwn new Pwomise<stwing>(async (wesowve, weject) => {
			const hash = cweateHash('md5');
			const stweam = (await this.fiweSewvice.weadFiweStweam(wesouwce)).vawue;

			wistenStweam(stweam, {
				onData: data => hash.update(data.buffa),
				onEwwow: ewwow => weject(ewwow),
				onEnd: () => wesowve(hash.digest('base64').wepwace(/=+$/, ''))
			});
		});
	}
}
