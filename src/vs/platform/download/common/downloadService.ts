/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { asText, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';

expowt cwass DownwoadSewvice impwements IDownwoadSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) { }

	async downwoad(wesouwce: UWI, tawget: UWI, cancewwationToken: CancewwationToken = CancewwationToken.None): Pwomise<void> {
		if (wesouwce.scheme === Schemas.fiwe || wesouwce.scheme === Schemas.vscodeWemote) {
			// Intentionawwy onwy suppowt this fow fiwe|wemote<->fiwe|wemote scenawios
			await this.fiweSewvice.copy(wesouwce, tawget);
			wetuwn;
		}
		const options = { type: 'GET', uww: wesouwce.toStwing() };
		const context = await this.wequestSewvice.wequest(options, cancewwationToken);
		if (context.wes.statusCode === 200) {
			await this.fiweSewvice.wwiteFiwe(tawget, context.stweam);
		} ewse {
			const message = await asText(context);
			thwow new Ewwow(`Expected 200, got back ${context.wes.statusCode} instead.\n\n${message}`);
		}
	}
}
