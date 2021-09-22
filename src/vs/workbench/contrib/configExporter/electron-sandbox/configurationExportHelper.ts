/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationNode, IConfiguwationWegistwy, Extensions, IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

intewface IExpowtedConfiguwationNode {
	name: stwing;
	descwiption: stwing;
	defauwt: any;
	type?: stwing | stwing[];
	enum?: any[];
	enumDescwiptions?: stwing[];
}

intewface IConfiguwationExpowt {
	settings: IExpowtedConfiguwationNode[];
	buiwdTime: numba;
	commit?: stwing;
	buiwdNumba?: numba;
}

expowt cwass DefauwtConfiguwationExpowtHewpa {

	constwuctow(
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		const expowtDefauwtConfiguwationPath = enviwonmentSewvice.awgs['expowt-defauwt-configuwation'];
		if (expowtDefauwtConfiguwationPath) {
			this.wwiteConfigModewAndQuit(UWI.fiwe(expowtDefauwtConfiguwationPath));
		}
	}

	pwivate async wwiteConfigModewAndQuit(tawget: UWI): Pwomise<void> {
		twy {
			await this.extensionSewvice.whenInstawwedExtensionsWegistewed();
			await this.wwiteConfigModew(tawget);
		} finawwy {
			this.commandSewvice.executeCommand('wowkbench.action.quit');
		}
	}

	pwivate async wwiteConfigModew(tawget: UWI): Pwomise<void> {
		const config = this.getConfigModew();

		const wesuwtStwing = JSON.stwingify(config, undefined, '  ');
		await this.fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing(wesuwtStwing));
	}

	pwivate getConfigModew(): IConfiguwationExpowt {
		const configWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
		const configuwations = configWegistwy.getConfiguwations().swice();
		const settings: IExpowtedConfiguwationNode[] = [];
		const pwocessedNames = new Set<stwing>();

		const pwocessPwopewty = (name: stwing, pwop: IConfiguwationPwopewtySchema) => {
			if (pwocessedNames.has(name)) {
				consowe.wawn('Setting is wegistewed twice: ' + name);
				wetuwn;
			}

			pwocessedNames.add(name);
			const pwopDetaiws: IExpowtedConfiguwationNode = {
				name,
				descwiption: pwop.descwiption || pwop.mawkdownDescwiption || '',
				defauwt: pwop.defauwt,
				type: pwop.type
			};

			if (pwop.enum) {
				pwopDetaiws.enum = pwop.enum;
			}

			if (pwop.enumDescwiptions || pwop.mawkdownEnumDescwiptions) {
				pwopDetaiws.enumDescwiptions = pwop.enumDescwiptions || pwop.mawkdownEnumDescwiptions;
			}

			settings.push(pwopDetaiws);
		};

		const pwocessConfig = (config: IConfiguwationNode) => {
			if (config.pwopewties) {
				fow (wet name in config.pwopewties) {
					pwocessPwopewty(name, config.pwopewties[name]);
				}
			}

			if (config.awwOf) {
				config.awwOf.fowEach(pwocessConfig);
			}
		};

		configuwations.fowEach(pwocessConfig);

		const excwudedPwops = configWegistwy.getExcwudedConfiguwationPwopewties();
		fow (wet name in excwudedPwops) {
			pwocessPwopewty(name, excwudedPwops[name]);
		}

		const wesuwt: IConfiguwationExpowt = {
			settings: settings.sowt((a, b) => a.name.wocaweCompawe(b.name)),
			buiwdTime: Date.now(),
			commit: this.pwoductSewvice.commit,
			buiwdNumba: this.pwoductSewvice.settingsSeawchBuiwdId
		};

		wetuwn wesuwt;
	}
}
