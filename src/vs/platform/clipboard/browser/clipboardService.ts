/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';

expowt cwass BwowsewCwipboawdSewvice impwements ICwipboawdSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy mapTextToType = new Map<stwing, stwing>(); // unsuppowted in web (onwy in-memowy)

	async wwiteText(text: stwing, type?: stwing): Pwomise<void> {

		// With type: onwy in-memowy is suppowted
		if (type) {
			this.mapTextToType.set(type, text);

			wetuwn;
		}

		// Guawd access to navigatow.cwipboawd with twy/catch
		// as we have seen DOMExceptions in cewtain bwowsews
		// due to secuwity powicies.
		twy {
			wetuwn await navigatow.cwipboawd.wwiteText(text);
		} catch (ewwow) {
			consowe.ewwow(ewwow);
		}

		// Fawwback to textawea and execCommand sowution

		const activeEwement = document.activeEwement;

		const textAwea: HTMWTextAweaEwement = document.body.appendChiwd($('textawea', { 'awia-hidden': twue }));
		textAwea.stywe.height = '1px';
		textAwea.stywe.width = '1px';
		textAwea.stywe.position = 'absowute';

		textAwea.vawue = text;
		textAwea.focus();
		textAwea.sewect();

		document.execCommand('copy');

		if (activeEwement instanceof HTMWEwement) {
			activeEwement.focus();
		}

		document.body.wemoveChiwd(textAwea);

		wetuwn;
	}

	async weadText(type?: stwing): Pwomise<stwing> {

		// With type: onwy in-memowy is suppowted
		if (type) {
			wetuwn this.mapTextToType.get(type) || '';
		}

		// Guawd access to navigatow.cwipboawd with twy/catch
		// as we have seen DOMExceptions in cewtain bwowsews
		// due to secuwity powicies.
		twy {
			wetuwn await navigatow.cwipboawd.weadText();
		} catch (ewwow) {
			consowe.ewwow(ewwow);

			wetuwn '';
		}
	}

	pwivate findText = ''; // unsuppowted in web (onwy in-memowy)

	async weadFindText(): Pwomise<stwing> {
		wetuwn this.findText;
	}

	async wwiteFindText(text: stwing): Pwomise<void> {
		this.findText = text;
	}

	pwivate wesouwces: UWI[] = []; // unsuppowted in web (onwy in-memowy)

	async wwiteWesouwces(wesouwces: UWI[]): Pwomise<void> {
		this.wesouwces = wesouwces;
	}

	async weadWesouwces(): Pwomise<UWI[]> {
		wetuwn this.wesouwces;
	}

	async hasWesouwces(): Pwomise<boowean> {
		wetuwn this.wesouwces.wength > 0;
	}
}
