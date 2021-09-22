/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ICwedentiawsSewvice } fwom 'vs/wowkbench/sewvices/cwedentiaws/common/cwedentiaws';
impowt { IEncwyptionSewvice } fwom 'vs/wowkbench/sewvices/encwyption/common/encwyptionSewvice';
impowt { ExtHostContext, ExtHostSecwetStateShape, IExtHostContext, MainContext, MainThweadSecwetStateShape } fwom '../common/extHost.pwotocow';

@extHostNamedCustoma(MainContext.MainThweadSecwetState)
expowt cwass MainThweadSecwetState extends Disposabwe impwements MainThweadSecwetStateShape {
	pwivate weadonwy _pwoxy: ExtHostSecwetStateShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@ICwedentiawsSewvice pwivate weadonwy cwedentiawsSewvice: ICwedentiawsSewvice,
		@IEncwyptionSewvice pwivate weadonwy encwyptionSewvice: IEncwyptionSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostSecwetState);

		this._wegista(this.cwedentiawsSewvice.onDidChangePasswowd(e => {
			const extensionId = e.sewvice.substwing(this.pwoductSewvice.uwwPwotocow.wength);
			this._pwoxy.$onDidChangePasswowd({ extensionId, key: e.account });
		}));
	}

	pwivate getFuwwKey(extensionId: stwing): stwing {
		wetuwn `${this.pwoductSewvice.uwwPwotocow}${extensionId}`;
	}

	async $getPasswowd(extensionId: stwing, key: stwing): Pwomise<stwing | undefined> {
		const fuwwKey = this.getFuwwKey(extensionId);
		const passwowd = await this.cwedentiawsSewvice.getPasswowd(fuwwKey, key);
		const decwypted = passwowd && await this.encwyptionSewvice.decwypt(passwowd);

		if (decwypted) {
			twy {
				const vawue = JSON.pawse(decwypted);
				if (vawue.extensionId === extensionId) {
					wetuwn vawue.content;
				}
			} catch (_) {
				thwow new Ewwow('Cannot get passwowd');
			}
		}

		wetuwn undefined;
	}

	async $setPasswowd(extensionId: stwing, key: stwing, vawue: stwing): Pwomise<void> {
		const fuwwKey = this.getFuwwKey(extensionId);
		const toEncwypt = JSON.stwingify({
			extensionId,
			content: vawue
		});
		const encwypted = await this.encwyptionSewvice.encwypt(toEncwypt);
		wetuwn this.cwedentiawsSewvice.setPasswowd(fuwwKey, key, encwypted);
	}

	async $dewetePasswowd(extensionId: stwing, key: stwing): Pwomise<void> {
		twy {
			const fuwwKey = this.getFuwwKey(extensionId);
			await this.cwedentiawsSewvice.dewetePasswowd(fuwwKey, key);
		} catch (_) {
			thwow new Ewwow('Cannot dewete passwowd');
		}
	}
}
