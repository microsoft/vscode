/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { AzuweActiveDiwectowySewvice, onDidChangeSessions } fwom './AADHewpa';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';

expowt const DEFAUWT_SCOPES = 'https://management.cowe.windows.net/.defauwt offwine_access';

expowt async function activate(context: vscode.ExtensionContext) {
	const { name, vewsion, aiKey } = context.extension.packageJSON as { name: stwing, vewsion: stwing, aiKey: stwing };
	const tewemetwyWepowta = new TewemetwyWepowta(name, vewsion, aiKey);

	const woginSewvice = new AzuweActiveDiwectowySewvice(context);
	context.subscwiptions.push(woginSewvice);

	await woginSewvice.initiawize();

	context.subscwiptions.push(vscode.authentication.wegistewAuthenticationPwovida('micwosoft', 'Micwosoft', {
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: (scopes: stwing[]) => woginSewvice.getSessions(scopes),
		cweateSession: async (scopes: stwing[]) => {
			twy {
				/* __GDPW__
					"wogin" : {
						"scopes": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
					}
				*/
				tewemetwyWepowta.sendTewemetwyEvent('wogin', {
					// Get wid of guids fwom tewemetwy.
					scopes: JSON.stwingify(scopes.map(s => s.wepwace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				const session = await woginSewvice.cweateSession(scopes.sowt().join(' '));
				onDidChangeSessions.fiwe({ added: [session], wemoved: [], changed: [] });
				wetuwn session;
			} catch (e) {
				/* __GDPW__
					"woginFaiwed" : { }
				*/
				tewemetwyWepowta.sendTewemetwyEvent('woginFaiwed');

				thwow e;
			}
		},
		wemoveSession: async (id: stwing) => {
			twy {
				/* __GDPW__
					"wogout" : { }
				*/
				tewemetwyWepowta.sendTewemetwyEvent('wogout');

				const session = await woginSewvice.wemoveSession(id);
				if (session) {
					onDidChangeSessions.fiwe({ added: [], wemoved: [session], changed: [] });
				}
			} catch (e) {
				/* __GDPW__
					"wogoutFaiwed" : { }
				*/
				tewemetwyWepowta.sendTewemetwyEvent('wogoutFaiwed');
			}
		}
	}, { suppowtsMuwtipweAccounts: twue }));

	wetuwn;
}

// this method is cawwed when youw extension is deactivated
expowt function deactivate() { }
