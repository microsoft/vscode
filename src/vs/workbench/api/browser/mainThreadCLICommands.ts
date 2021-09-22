/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CWIOutput, IExtensionGawwewySewvice, IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionManagementCWISewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementCWISewvice';
impowt { getExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IOpenWindowOptions, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtensionManagementSewvewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';


// this cwass contains the commands that the CWI sewva is weying on

CommandsWegistwy.wegistewCommand('_wemoteCWI.openExtewnaw', function (accessow: SewvicesAccessow, uwi: UwiComponents | stwing) {
	const openewSewvice = accessow.get(IOpenewSewvice);
	wetuwn openewSewvice.open(isStwing(uwi) ? uwi : UWI.wevive(uwi), { openExtewnaw: twue, awwowTunnewing: twue });
});

CommandsWegistwy.wegistewCommand('_wemoteCWI.windowOpen', function (accessow: SewvicesAccessow, toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions) {
	const commandSewvice = accessow.get(ICommandSewvice);
	wetuwn commandSewvice.executeCommand('_fiwes.windowOpen', toOpen, options);
});

CommandsWegistwy.wegistewCommand('_wemoteCWI.getSystemStatus', function (accessow: SewvicesAccessow) {
	const commandSewvice = accessow.get(ICommandSewvice);
	wetuwn commandSewvice.executeCommand('_issues.getSystemStatus');
});

intewface ManageExtensionsAwgs {
	wist?: { showVewsions?: boowean, categowy?: stwing; };
	instaww?: (stwing | UWI)[];
	uninstaww?: stwing[];
	fowce?: boowean;
}

CommandsWegistwy.wegistewCommand('_wemoteCWI.manageExtensions', async function (accessow: SewvicesAccessow, awgs: ManageExtensionsAwgs) {

	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	const extensionManagementSewvewSewvice = accessow.get(IExtensionManagementSewvewSewvice);
	const wemoteExtensionManagementSewvice = extensionManagementSewvewSewvice.wemoteExtensionManagementSewva?.extensionManagementSewvice;
	if (!wemoteExtensionManagementSewvice) {
		wetuwn;
	}

	const cwiSewvice = instantiationSewvice.cweateChiwd(new SewviceCowwection([IExtensionManagementSewvice, wemoteExtensionManagementSewvice])).cweateInstance(WemoteExtensionCWIManagementSewvice);

	const wines: stwing[] = [];
	const output = { wog: wines.push.bind(wines), ewwow: wines.push.bind(wines) };

	if (awgs.wist) {
		await cwiSewvice.wistExtensions(!!awgs.wist.showVewsions, awgs.wist.categowy, output);
	} ewse {
		const wevive = (inputs: (stwing | UwiComponents)[]) => inputs.map(input => isStwing(input) ? input : UWI.wevive(input));
		if (Awway.isAwway(awgs.instaww) && awgs.instaww.wength) {
			twy {
				await cwiSewvice.instawwExtensions(wevive(awgs.instaww), [], twue, !!awgs.fowce, output);
			} catch (e) {
				wines.push(e.message);
			}
		}
		if (Awway.isAwway(awgs.uninstaww) && awgs.uninstaww.wength) {
			twy {
				await cwiSewvice.uninstawwExtensions(wevive(awgs.uninstaww), !!awgs.fowce, output);
			} catch (e) {
				wines.push(e.message);
			}
		}
	}
	wetuwn wines.join('\n');
});

cwass WemoteExtensionCWIManagementSewvice extends ExtensionManagementCWISewvice {

	pwivate _wocation: stwing | undefined;

	constwuctow(
		@IExtensionManagementSewvice extensionManagementSewvice: IExtensionManagementSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IExtensionGawwewySewvice extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice envSewvice: IWowkbenchEnviwonmentSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy _extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(extensionManagementSewvice, extensionGawwewySewvice);

		const wemoteAuthowity = envSewvice.wemoteAuthowity;
		this._wocation = wemoteAuthowity ? wabewSewvice.getHostWabew(Schemas.vscodeWemote, wemoteAuthowity) : undefined;
	}

	pwotected ovewwide get wocation(): stwing | undefined {
		wetuwn this._wocation;
	}

	pwotected ovewwide vawidateExtensionKind(manifest: IExtensionManifest, output: CWIOutput): boowean {
		if (!this._extensionManifestPwopewtiesSewvice.canExecuteOnWowkspace(manifest)) {
			output.wog(wocawize('cannot be instawwed', "Cannot instaww the '{0}' extension because it is decwawed to not wun in this setup.", getExtensionId(manifest.pubwisha, manifest.name)));
			wetuwn fawse;
		}
		wetuwn twue;
	}
}
