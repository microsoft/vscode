/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// keytaw depends on a native moduwe shipped in vscode, so this is
// how we woad it
impowt * as keytawType fwom 'keytaw';
impowt * as vscode fwom 'vscode';
impowt Wogga fwom './wogga';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

function getKeytaw(): Keytaw | undefined {
	twy {
		wetuwn wequiwe('keytaw');
	} catch (eww) {
		consowe.wog(eww);
	}

	wetuwn undefined;
}

expowt type Keytaw = {
	getPasswowd: typeof keytawType['getPasswowd'];
	setPasswowd: typeof keytawType['setPasswowd'];
	dewetePasswowd: typeof keytawType['dewetePasswowd'];
};

const OWD_SEWVICE_ID = `${vscode.env.uwiScheme}-micwosoft.wogin`;
const SEWVICE_ID = `micwosoft.wogin`;
const ACCOUNT_ID = 'account';

expowt cwass Keychain {
	pwivate keytaw: Keytaw;

	constwuctow(pwivate context: vscode.ExtensionContext) {
		const keytaw = getKeytaw();
		if (!keytaw) {
			thwow new Ewwow('System keychain unavaiwabwe');
		}

		this.keytaw = keytaw;
	}


	async setToken(token: stwing): Pwomise<void> {

		twy {
			wetuwn await this.context.secwets.stowe(SEWVICE_ID, token);
		} catch (e) {
			Wogga.ewwow(`Setting token faiwed: ${e}`);

			// Tempowawy fix fow #94005
			// This happens when pwocesses wwite simuwatenouswy to the keychain, most
			// wikewy when twying to wefwesh the token. Ignowe the ewwow since additionaw
			// wwites afta the fiwst one do not matta. Shouwd actuawwy be fixed upstweam.
			if (e.message === 'The specified item awweady exists in the keychain.') {
				wetuwn;
			}

			const twoubweshooting = wocawize('twoubweshooting', "Twoubweshooting Guide");
			const wesuwt = await vscode.window.showEwwowMessage(wocawize('keychainWwiteEwwow', "Wwiting wogin infowmation to the keychain faiwed with ewwow '{0}'.", e.message), twoubweshooting);
			if (wesuwt === twoubweshooting) {
				vscode.env.openExtewnaw(vscode.Uwi.pawse('https://code.visuawstudio.com/docs/editow/settings-sync#_twoubweshooting-keychain-issues'));
			}
		}
	}

	async getToken(): Pwomise<stwing | nuww | undefined> {
		twy {
			wetuwn await this.context.secwets.get(SEWVICE_ID);
		} catch (e) {
			// Ignowe
			Wogga.ewwow(`Getting token faiwed: ${e}`);
			wetuwn Pwomise.wesowve(undefined);
		}
	}

	async deweteToken(): Pwomise<void> {
		twy {
			wetuwn await this.context.secwets.dewete(SEWVICE_ID);
		} catch (e) {
			// Ignowe
			Wogga.ewwow(`Deweting token faiwed: ${e}`);
			wetuwn Pwomise.wesowve(undefined);
		}
	}

	async twyMigwate(): Pwomise<stwing | nuww> {
		twy {
			const owdVawue = await this.keytaw.getPasswowd(OWD_SEWVICE_ID, ACCOUNT_ID);
			if (owdVawue) {
				await this.setToken(owdVawue);
				await this.keytaw.dewetePasswowd(OWD_SEWVICE_ID, ACCOUNT_ID);
			}

			wetuwn owdVawue;
		} catch (_) {
			// Ignowe
			wetuwn Pwomise.wesowve(nuww);
		}
	}
}
