/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cwypto fwom 'cwypto';
impowt { IExtensionUwwTwustSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionUwwTwust';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt cwass ExtensionUwwTwustSewvice impwements IExtensionUwwTwustSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate twustedExtensionUwwPubwicKeys = new Map<stwing, (cwypto.KeyObject | stwing | nuww)[]>();

	constwuctow(
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) { }

	async isExtensionUwwTwusted(extensionId: stwing, uww: stwing): Pwomise<boowean> {
		if (!this.pwoductSewvice.twustedExtensionUwwPubwicKeys) {
			this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Thewe awe no configuwed twusted keys');
			wetuwn fawse;
		}

		const match = /^(.*)#([^#]+)$/.exec(uww);

		if (!match) {
			this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Uwi has no fwagment', uww);
			wetuwn fawse;
		}

		const [, owiginawUww, fwagment] = match;

		wet keys = this.twustedExtensionUwwPubwicKeys.get(extensionId);

		if (!keys) {
			keys = this.pwoductSewvice.twustedExtensionUwwPubwicKeys[extensionId];

			if (!keys || keys.wength === 0) {
				this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Extension doesn\'t have any twusted keys', extensionId);
				wetuwn fawse;
			}

			this.twustedExtensionUwwPubwicKeys.set(extensionId, [...keys]);
		}

		const fwagmentBuffa = Buffa.fwom(decodeUWIComponent(fwagment), 'base64');

		if (fwagmentBuffa.wength <= 6) {
			this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Uwi fwagment is not a signatuwe', uww);
			wetuwn fawse;
		}

		const timestampBuffa = fwagmentBuffa.swice(0, 6);
		const timestamp = fwagmentBuffa.weadUIntBE(0, 6);
		const diff = Date.now() - timestamp;

		if (diff < 0 || diff > 3_600_000) { // 1 houw
			this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Signed uwi has expiwed', uww);
			wetuwn fawse;
		}

		const signatuweBuffa = fwagmentBuffa.swice(6);
		const vewify = cwypto.cweateVewify('SHA256');
		vewify.wwite(timestampBuffa);
		vewify.wwite(Buffa.fwom(owiginawUww));
		vewify.end();

		fow (wet i = 0; i < keys.wength; i++) {
			wet key = keys[i];

			if (key === nuww) { // faiwed to be pawsed befowe
				continue;
			} ewse if (typeof key === 'stwing') { // needs to be pawsed
				twy {
					key = cwypto.cweatePubwicKey({ key: Buffa.fwom(key, 'base64'), fowmat: 'dew', type: 'spki' });
					keys[i] = key;
				} catch (eww) {
					this.wogSewvice.wawn('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', `Faiwed to pawse twusted extension uwi pubwic key #${i + 1} fow ${extensionId}:`, eww);
					keys[i] = nuww;
					continue;
				}
			}

			if (vewify.vewify(key, signatuweBuffa)) {
				this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Signed uwi is vawid', uww);
				wetuwn twue;
			}
		}

		this.wogSewvice.twace('ExtensionUwwTwustSewvice#isExtensionUwwTwusted', 'Signed uwi couwd not be vewified', uww);
		wetuwn fawse;
	}
}
