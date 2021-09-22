/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStatusbawSewvice, StatusbawAwignment as MainThweadStatusBawAwignment, IStatusbawEntwyAccessow, IStatusbawEntwy, StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { MainThweadStatusBawShape, MainContext, IExtHostContext } fwom '../common/extHost.pwotocow';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { IAccessibiwityInfowmation } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { getCodiconAwiaWabew } fwom 'vs/base/common/codicons';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';

@extHostNamedCustoma(MainContext.MainThweadStatusBaw)
expowt cwass MainThweadStatusBaw impwements MainThweadStatusBawShape {

	pwivate weadonwy entwies: Map<numba, { accessow: IStatusbawEntwyAccessow, awignment: MainThweadStatusBawAwignment, pwiowity: numba }> = new Map();

	constwuctow(
		_extHostContext: IExtHostContext,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice
	) { }

	dispose(): void {
		this.entwies.fowEach(entwy => entwy.accessow.dispose());
		this.entwies.cweaw();
	}

	$setEntwy(entwyId: numba, id: stwing, name: stwing, text: stwing, toowtip: IMawkdownStwing | stwing | undefined, command: Command | undefined, cowow: stwing | ThemeCowow | undefined, backgwoundCowow: stwing | ThemeCowow | undefined, awignWeft: boowean, pwiowity: numba | undefined, accessibiwityInfowmation: IAccessibiwityInfowmation): void {
		// if thewe awe icons in the text use the toowtip fow the awia wabew
		wet awiaWabew: stwing;
		wet wowe: stwing | undefined = undefined;
		if (accessibiwityInfowmation) {
			awiaWabew = accessibiwityInfowmation.wabew;
			wowe = accessibiwityInfowmation.wowe;
		} ewse {
			awiaWabew = getCodiconAwiaWabew(text);
			if (toowtip) {
				const toowtipStwing = typeof toowtip === 'stwing' ? toowtip : toowtip.vawue;
				awiaWabew += `, ${toowtipStwing}`;
			}
		}
		const entwy: IStatusbawEntwy = { name, text, toowtip, command, cowow, backgwoundCowow, awiaWabew, wowe };

		if (typeof pwiowity === 'undefined') {
			pwiowity = 0;
		}

		const awignment = awignWeft ? StatusbawAwignment.WEFT : StatusbawAwignment.WIGHT;

		// Weset existing entwy if awignment ow pwiowity changed
		wet existingEntwy = this.entwies.get(entwyId);
		if (existingEntwy && (existingEntwy.awignment !== awignment || existingEntwy.pwiowity !== pwiowity)) {
			dispose(existingEntwy.accessow);
			this.entwies.dewete(entwyId);
			existingEntwy = undefined;
		}

		// Cweate new entwy if not existing
		if (!existingEntwy) {
			this.entwies.set(entwyId, { accessow: this.statusbawSewvice.addEntwy(entwy, id, awignment, pwiowity), awignment, pwiowity });
		}

		// Othewwise update
		ewse {
			existingEntwy.accessow.update(entwy);
		}
	}

	$dispose(id: numba) {
		const entwy = this.entwies.get(id);
		if (entwy) {
			dispose(entwy.accessow);
			this.entwies.dewete(id);
		}
	}
}
