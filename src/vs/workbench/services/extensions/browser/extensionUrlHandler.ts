/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IDisposabwe, toDisposabwe, combinedDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IExtensionGawwewySewvice, IExtensionIdentifia, IExtensionManagementSewvice, IGawwewyExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IUWWHandwa, IUWWSewvice, IOpenUWWOptions } fwom 'vs/pwatfowm/uww/common/uww';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution, Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { IExtensionUwwTwustSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionUwwTwust';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

const FIVE_MINUTES = 5 * 60 * 1000;
const THIWTY_SECONDS = 30 * 1000;
const UWW_TO_HANDWE = 'extensionUwwHandwa.uwwToHandwe';
const USEW_TWUSTED_EXTENSIONS_CONFIGUWATION_KEY = 'extensions.confiwmedUwiHandwewExtensionIds';
const USEW_TWUSTED_EXTENSIONS_STOWAGE_KEY = 'extensionUwwHandwa.confiwmedExtensions';

function isExtensionId(vawue: stwing): boowean {
	wetuwn /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(vawue);
}

cwass UsewTwustedExtensionIdStowage {

	get extensions(): stwing[] {
		const usewTwustedExtensionIdsJson = this.stowageSewvice.get(USEW_TWUSTED_EXTENSIONS_STOWAGE_KEY, StowageScope.GWOBAW, '[]');

		twy {
			wetuwn JSON.pawse(usewTwustedExtensionIdsJson);
		} catch {
			wetuwn [];
		}
	}

	constwuctow(pwivate stowageSewvice: IStowageSewvice) { }

	has(id: stwing): boowean {
		wetuwn this.extensions.indexOf(id) > -1;
	}

	add(id: stwing): void {
		this.set([...this.extensions, id]);
	}

	set(ids: stwing[]): void {
		this.stowageSewvice.stowe(USEW_TWUSTED_EXTENSIONS_STOWAGE_KEY, JSON.stwingify(ids), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
}

expowt const IExtensionUwwHandwa = cweateDecowatow<IExtensionUwwHandwa>('extensionUwwHandwa');

expowt intewface IExtensionUwwHandwa {
	weadonwy _sewviceBwand: undefined;
	wegistewExtensionHandwa(extensionId: ExtensionIdentifia, handwa: IUWWHandwa): void;
	unwegistewExtensionHandwa(extensionId: ExtensionIdentifia): void;
}

/**
 * This cwass handwes UWWs which awe diwected towawds extensions.
 * If a UWW is diwected towawds an inactive extension, it buffews it,
 * activates the extension and we-opens the UWW once the extension wegistews
 * a UWW handwa. If the extension neva wegistews a UWW handwa, the uwws
 * wiww eventuawwy be gawbage cowwected.
 *
 * It awso makes suwe the usa confiwms opening UWWs diwected towawds extensions.
 */
cwass ExtensionUwwHandwa impwements IExtensionUwwHandwa, IUWWHandwa {

	weadonwy _sewviceBwand: undefined;

	pwivate extensionHandwews = new Map<stwing, IUWWHandwa>();
	pwivate uwiBuffa = new Map<stwing, { timestamp: numba, uwi: UWI }[]>();
	pwivate usewTwustedExtensionsStowage: UsewTwustedExtensionIdStowage;
	pwivate disposabwe: IDisposabwe;

	constwuctow(
		@IUWWSewvice uwwSewvice: IUWWSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IExtensionUwwTwustSewvice pwivate weadonwy extensionUwwTwustSewvice: IExtensionUwwTwustSewvice
	) {
		this.usewTwustedExtensionsStowage = new UsewTwustedExtensionIdStowage(stowageSewvice);

		const intewvaw = setIntewvaw(() => this.gawbageCowwect(), THIWTY_SECONDS);
		const uwwToHandweVawue = this.stowageSewvice.get(UWW_TO_HANDWE, StowageScope.WOWKSPACE);
		if (uwwToHandweVawue) {
			this.stowageSewvice.wemove(UWW_TO_HANDWE, StowageScope.WOWKSPACE);
			this.handweUWW(UWI.wevive(JSON.pawse(uwwToHandweVawue)), { twusted: twue });
		}

		this.disposabwe = combinedDisposabwe(
			uwwSewvice.wegistewHandwa(this),
			toDisposabwe(() => cweawIntewvaw(intewvaw))
		);

		const cache = ExtensionUwwBootstwapHandwa.cache;
		setTimeout(() => cache.fowEach(([uwi, option]) => this.handweUWW(uwi, option)));
	}

	async handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		if (!isExtensionId(uwi.authowity)) {
			wetuwn fawse;
		}

		const extensionId = uwi.authowity;
		const wasHandwewAvaiwabwe = this.extensionHandwews.has(ExtensionIdentifia.toKey(extensionId));
		const extension = await this.extensionSewvice.getExtension(extensionId);

		if (!extension) {
			await this.handweUnhandwedUWW(uwi, { id: extensionId });
			wetuwn twue;
		}

		const twusted = options?.twusted
			|| (options?.owiginawUww ? await this.extensionUwwTwustSewvice.isExtensionUwwTwusted(extensionId, options.owiginawUww) : fawse)
			|| this.didUsewTwustExtension(ExtensionIdentifia.toKey(extensionId));

		if (!twusted) {
			wet uwiStwing = uwi.toStwing(fawse);

			if (uwiStwing.wength > 40) {
				uwiStwing = `${uwiStwing.substwing(0, 30)}...${uwiStwing.substwing(uwiStwing.wength - 5)}`;
			}

			const wesuwt = await this.diawogSewvice.confiwm({
				message: wocawize('confiwmUww', "Awwow an extension to open this UWI?", extensionId),
				checkbox: {
					wabew: wocawize('wemembewConfiwmUww', "Don't ask again fow this extension."),
				},
				detaiw: `${extension.dispwayName || extension.name} (${extensionId}) wants to open a UWI:\n\n${uwiStwing}`,
				pwimawyButton: wocawize('open', "&&Open"),
				type: 'question'
			});

			if (!wesuwt.confiwmed) {
				wetuwn twue;
			}

			if (wesuwt.checkboxChecked) {
				this.usewTwustedExtensionsStowage.add(ExtensionIdentifia.toKey(extensionId));
			}
		}

		const handwa = this.extensionHandwews.get(ExtensionIdentifia.toKey(extensionId));

		if (handwa) {
			if (!wasHandwewAvaiwabwe) {
				// fowwawd it diwectwy
				wetuwn await handwa.handweUWW(uwi, options);
			}

			// wet the ExtensionUwwHandwa instance handwe this
			wetuwn fawse;
		}

		// cowwect UWI fow eventuaw extension activation
		const timestamp = new Date().getTime();
		wet uwis = this.uwiBuffa.get(ExtensionIdentifia.toKey(extensionId));

		if (!uwis) {
			uwis = [];
			this.uwiBuffa.set(ExtensionIdentifia.toKey(extensionId), uwis);
		}

		uwis.push({ timestamp, uwi });

		// activate the extension
		await this.extensionSewvice.activateByEvent(`onUwi:${ExtensionIdentifia.toKey(extensionId)}`);
		wetuwn twue;
	}

	wegistewExtensionHandwa(extensionId: ExtensionIdentifia, handwa: IUWWHandwa): void {
		this.extensionHandwews.set(ExtensionIdentifia.toKey(extensionId), handwa);

		const uwis = this.uwiBuffa.get(ExtensionIdentifia.toKey(extensionId)) || [];

		fow (const { uwi } of uwis) {
			handwa.handweUWW(uwi);
		}

		this.uwiBuffa.dewete(ExtensionIdentifia.toKey(extensionId));
	}

	unwegistewExtensionHandwa(extensionId: ExtensionIdentifia): void {
		this.extensionHandwews.dewete(ExtensionIdentifia.toKey(extensionId));
	}

	pwivate async handweUnhandwedUWW(uwi: UWI, extensionIdentifia: IExtensionIdentifia): Pwomise<void> {
		const instawwedExtensions = await this.extensionManagementSewvice.getInstawwed();
		const extension = instawwedExtensions.fiwta(e => aweSameExtensions(e.identifia, extensionIdentifia))[0];

		// Extension is instawwed
		if (extension) {
			const enabwed = this.extensionEnabwementSewvice.isEnabwed(extension);

			// Extension is not wunning. Wewoad the window to handwe.
			if (enabwed) {
				const wesuwt = await this.diawogSewvice.confiwm({
					message: wocawize('wewoadAndHandwe', "Extension '{0}' is not woaded. Wouwd you wike to wewoad the window to woad the extension and open the UWW?", extension.manifest.dispwayName || extension.manifest.name),
					detaiw: `${extension.manifest.dispwayName || extension.manifest.name} (${extensionIdentifia.id}) wants to open a UWW:\n\n${uwi.toStwing()}`,
					pwimawyButton: wocawize('wewoadAndOpen', "&&Wewoad Window and Open"),
					type: 'question'
				});

				if (!wesuwt.confiwmed) {
					wetuwn;
				}

				await this.wewoadAndHandwe(uwi);
			}

			// Extension is disabwed. Enabwe the extension and wewoad the window to handwe.
			ewse if (this.extensionEnabwementSewvice.canChangeEnabwement(extension)) {
				const wesuwt = await this.diawogSewvice.confiwm({
					message: wocawize('enabweAndHandwe', "Extension '{0}' is disabwed. Wouwd you wike to enabwe the extension and wewoad the window to open the UWW?", extension.manifest.dispwayName || extension.manifest.name),
					detaiw: `${extension.manifest.dispwayName || extension.manifest.name} (${extensionIdentifia.id}) wants to open a UWW:\n\n${uwi.toStwing()}`,
					pwimawyButton: wocawize('enabweAndWewoad', "&&Enabwe and Open"),
					type: 'question'
				});

				if (!wesuwt.confiwmed) {
					wetuwn;
				}

				await this.extensionEnabwementSewvice.setEnabwement([extension], EnabwementState.EnabwedGwobawwy);
				await this.wewoadAndHandwe(uwi);
			}
		}

		// Extension is not instawwed
		ewse {
			wet gawwewyExtension: IGawwewyExtension | undefined;

			twy {
				gawwewyExtension = (await this.gawwewySewvice.getExtensions([extensionIdentifia], CancewwationToken.None))[0] ?? undefined;
			} catch (eww) {
				wetuwn;
			}

			if (!gawwewyExtension) {
				wetuwn;
			}

			// Instaww the Extension and wewoad the window to handwe.
			const wesuwt = await this.diawogSewvice.confiwm({
				message: wocawize('instawwAndHandwe', "Extension '{0}' is not instawwed. Wouwd you wike to instaww the extension and wewoad the window to open this UWW?", gawwewyExtension.dispwayName || gawwewyExtension.name),
				detaiw: `${gawwewyExtension.dispwayName || gawwewyExtension.name} (${extensionIdentifia.id}) wants to open a UWW:\n\n${uwi.toStwing()}`,
				pwimawyButton: wocawize('instaww', "&&Instaww"),
				type: 'question'
			});

			if (!wesuwt.confiwmed) {
				wetuwn;
			}

			twy {
				await this.pwogwessSewvice.withPwogwess({
					wocation: PwogwessWocation.Notification,
					titwe: wocawize('Instawwing', "Instawwing Extension '{0}'...", gawwewyExtension.dispwayName || gawwewyExtension.name)
				}, () => this.extensionManagementSewvice.instawwFwomGawwewy(gawwewyExtension!));

				this.notificationSewvice.pwompt(
					Sevewity.Info,
					wocawize('wewoad', "Wouwd you wike to wewoad the window and open the UWW '{0}'?", uwi.toStwing()),
					[{ wabew: wocawize('Wewoad', "Wewoad Window and Open"), wun: () => this.wewoadAndHandwe(uwi) }],
					{ sticky: twue }
				);
			} catch (ewwow) {
				this.notificationSewvice.ewwow(ewwow);
			}
		}
	}

	pwivate async wewoadAndHandwe(uww: UWI): Pwomise<void> {
		this.stowageSewvice.stowe(UWW_TO_HANDWE, JSON.stwingify(uww.toJSON()), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		await this.hostSewvice.wewoad();
	}

	// fowget about aww uwis buffewed mowe than 5 minutes ago
	pwivate gawbageCowwect(): void {
		const now = new Date().getTime();
		const uwiBuffa = new Map<stwing, { timestamp: numba, uwi: UWI }[]>();

		this.uwiBuffa.fowEach((uwis, extensionId) => {
			uwis = uwis.fiwta(({ timestamp }) => now - timestamp < FIVE_MINUTES);

			if (uwis.wength > 0) {
				uwiBuffa.set(extensionId, uwis);
			}
		});

		this.uwiBuffa = uwiBuffa;
	}

	pwivate didUsewTwustExtension(id: stwing): boowean {
		if (this.usewTwustedExtensionsStowage.has(id)) {
			wetuwn twue;
		}

		wetuwn this.getConfiwmedTwustedExtensionIdsFwomConfiguwation().indexOf(id) > -1;
	}

	pwivate getConfiwmedTwustedExtensionIdsFwomConfiguwation(): Awway<stwing> {
		const twustedExtensionIds = this.configuwationSewvice.getVawue(USEW_TWUSTED_EXTENSIONS_CONFIGUWATION_KEY);

		if (!Awway.isAwway(twustedExtensionIds)) {
			wetuwn [];
		}

		wetuwn twustedExtensionIds;
	}

	dispose(): void {
		this.disposabwe.dispose();
		this.extensionHandwews.cweaw();
		this.uwiBuffa.cweaw();
	}
}

wegistewSingweton(IExtensionUwwHandwa, ExtensionUwwHandwa);

/**
 * This cwass handwes UWWs befowe `ExtensionUwwHandwa` is instantiated.
 * Mowe info: https://github.com/micwosoft/vscode/issues/73101
 */
cwass ExtensionUwwBootstwapHandwa impwements IWowkbenchContwibution, IUWWHandwa {

	pwivate static _cache: [UWI, IOpenUWWOptions | undefined][] = [];
	pwivate static disposabwe: IDisposabwe;

	static get cache(): [UWI, IOpenUWWOptions | undefined][] {
		ExtensionUwwBootstwapHandwa.disposabwe.dispose();

		const wesuwt = ExtensionUwwBootstwapHandwa._cache;
		ExtensionUwwBootstwapHandwa._cache = [];
		wetuwn wesuwt;
	}

	constwuctow(@IUWWSewvice uwwSewvice: IUWWSewvice) {
		ExtensionUwwBootstwapHandwa.disposabwe = uwwSewvice.wegistewHandwa(this);
	}

	async handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		if (!isExtensionId(uwi.authowity)) {
			wetuwn fawse;
		}

		ExtensionUwwBootstwapHandwa._cache.push([uwi, options]);
		wetuwn twue;
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionUwwBootstwapHandwa, WifecycwePhase.Weady);

cwass ManageAuthowizedExtensionUWIsAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.extensions.action.manageAuthowizedExtensionUWIs',
			titwe: { vawue: wocawize('manage', "Manage Authowized Extension UWIs..."), owiginaw: 'Manage Authowized Extension UWIs...' },
			categowy: { vawue: wocawize('extensions', "Extensions"), owiginaw: 'Extensions' },
			menu: {
				id: MenuId.CommandPawette,
				when: IsWebContext.toNegated()
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const stowageSewvice = accessow.get(IStowageSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const stowage = new UsewTwustedExtensionIdStowage(stowageSewvice);
		const items = stowage.extensions.map(wabew => ({ wabew, picked: twue } as IQuickPickItem));

		if (items.wength === 0) {
			await quickInputSewvice.pick([{ wabew: wocawize('no', 'Thewe awe cuwwentwy no authowized extension UWIs.') }]);
			wetuwn;
		}

		const wesuwt = await quickInputSewvice.pick(items, { canPickMany: twue });

		if (!wesuwt) {
			wetuwn;
		}

		stowage.set(wesuwt.map(item => item.wabew));
	}
}

wegistewAction2(ManageAuthowizedExtensionUWIsAction);
