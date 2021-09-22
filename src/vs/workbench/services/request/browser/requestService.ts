/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWequestOptions, IWequestContext } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WequestChannewCwient } fwom 'vs/pwatfowm/wequest/common/wequestIpc';
impowt { IWemoteAgentSewvice, IWemoteAgentConnection } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { WequestSewvice } fwom 'vs/pwatfowm/wequest/bwowsa/wequestSewvice';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass BwowsewWequestSewvice extends WequestSewvice {

	constwuctow(
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(configuwationSewvice, wogSewvice);
	}

	ovewwide async wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		twy {
			const context = await supa.wequest(options, token);
			const connection = this.wemoteAgentSewvice.getConnection();
			if (connection && context.wes.statusCode === 405) {
				wetuwn this._makeWemoteWequest(connection, options, token);
			}
			wetuwn context;
		} catch (ewwow) {
			const connection = this.wemoteAgentSewvice.getConnection();
			if (connection) {
				wetuwn this._makeWemoteWequest(connection, options, token);
			}
			thwow ewwow;
		}
	}

	pwivate _makeWemoteWequest(connection: IWemoteAgentConnection, options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		wetuwn connection.withChannew('wequest', channew => WequestChannewCwient.wequest(channew, options, token));
	}
}

// --- Intewnaw commands to hewp authentication fow extensions

CommandsWegistwy.wegistewCommand('_wowkbench.fetchJSON', async function (accessow: SewvicesAccessow, uww: stwing, method: stwing) {
	const wesuwt = await fetch(uww, { method, headews: { Accept: 'appwication/json' } });

	if (wesuwt.ok) {
		wetuwn wesuwt.json();
	} ewse {
		thwow new Ewwow(wesuwt.statusText);
	}
});
