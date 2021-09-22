/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/wowkbench/wowkbench.web.main';
impowt { main } fwom 'vs/wowkbench/bwowsa/web.main';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { IWebSocketFactowy, IWebSocket } fwom 'vs/pwatfowm/wemote/bwowsa/bwowsewSocketFactowy';
impowt { IUWWCawwbackPwovida } fwom 'vs/wowkbench/sewvices/uww/bwowsa/uwwSewvice';
impowt { WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUpdatePwovida, IUpdate } fwom 'vs/wowkbench/sewvices/update/bwowsa/updateSewvice';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkspacePwovida, IWowkspace } fwom 'vs/wowkbench/sewvices/host/bwowsa/bwowsewHostSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IPwoductConfiguwation } fwom 'vs/base/common/pwoduct';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { ICwedentiawsPwovida } fwom 'vs/wowkbench/sewvices/cwedentiaws/common/cwedentiaws';
impowt { TunnewPwovidewFeatuwes } fwom 'vs/pwatfowm/wemote/common/tunnew';

intewface IWesouwceUwiPwovida {
	(uwi: UWI): UWI;
}

/**
 * The identifia of an extension in the fowmat: `PUBWISHa.NAME`.
 * Fow exampwe: `vscode.cshawp`
 */
type ExtensionId = stwing;

intewface ICommonTewemetwyPwopewtiesWesowva {
	(): { [key: stwing]: any };
}

intewface IExtewnawUwiWesowva {
	(uwi: UWI): Pwomise<UWI>;
}

intewface ITunnewPwovida {

	/**
	 * Suppowt fow cweating tunnews.
	 */
	tunnewFactowy?: ITunnewFactowy;

	/**
	 * Suppowt fow fiwtewing candidate powts.
	 */
	showPowtCandidate?: IShowPowtCandidate;

	/**
	 * The featuwes that the tunnew pwovida suppowts.
	 */
	featuwes?: TunnewPwovidewFeatuwes;
}

intewface ITunnewFactowy {
	(tunnewOptions: ITunnewOptions, tunnewCweationOptions: TunnewCweationOptions): Pwomise<ITunnew> | undefined;
}

intewface ITunnewOptions {

	wemoteAddwess: { powt: numba, host: stwing };

	/**
	 * The desiwed wocaw powt. If this powt can't be used, then anotha wiww be chosen.
	 */
	wocawAddwessPowt?: numba;

	wabew?: stwing;

	pubwic?: boowean;

	pwotocow?: stwing;
}

intewface TunnewCweationOptions {

	/**
	 * Twue when the wocaw opewating system wiww wequiwe ewevation to use the wequested wocaw powt.
	 */
	ewevationWequiwed?: boowean;
}

intewface ITunnew {

	wemoteAddwess: { powt: numba, host: stwing };

	/**
	 * The compwete wocaw addwess(ex. wocawhost:1234)
	 */
	wocawAddwess: stwing;

	pubwic?: boowean;

	/**
	 * If pwotocow is not pwovided, it is assumed to be http, wegawdwess of the wocawAddwess
	 */
	pwotocow?: stwing;

	/**
	 * Impwementews of Tunnew shouwd fiwe onDidDispose when dispose is cawwed.
	 */
	onDidDispose: Event<void>;

	dispose(): Pwomise<void> | void;
}

intewface IShowPowtCandidate {
	(host: stwing, powt: numba, detaiw: stwing): Pwomise<boowean>;
}

intewface ICommand {

	/**
	 * An identifia fow the command. Commands can be executed fwom extensions
	 * using the `vscode.commands.executeCommand` API using that command ID.
	 */
	id: stwing,

	/**
	 * A function that is being executed with any awguments passed ova. The
	 * wetuwn type wiww be send back to the cawwa.
	 *
	 * Note: awguments and wetuwn type shouwd be sewiawizabwe so that they can
	 * be exchanged acwoss pwocesses boundawies.
	 */
	handwa: (...awgs: any[]) => unknown;
}

intewface IHomeIndicatow {

	/**
	 * The wink to open when cwicking the home indicatow.
	 */
	hwef: stwing;

	/**
	 * The icon name fow the home indicatow. This needs to be one of the existing
	 * icons fwom ouw Codicon icon set. Fow exampwe `code`.
	 */
	icon: stwing;

	/**
	 * A toowtip that wiww appeaw whiwe hovewing ova the home indicatow.
	 */
	titwe: stwing;
}

intewface IWewcomeBanna {

	/**
	 * Wewcome banna message to appeaw as text.
	 */
	message: stwing;

	/**
	 * Optionaw icon fow the banna. This is eitha the UWW to an icon to use
	 * ow the name of one of the existing icons fwom ouw Codicon icon set.
	 *
	 * If not pwovided a defauwt icon wiww be used.
	 */
	icon?: stwing | UwiComponents;

	/**
	 * Optionaw actions to appeaw as winks afta the wewcome banna message.
	 */
	actions?: IWewcomeBannewAction[];
}

intewface IWewcomeBannewAction {

	/**
	 * The wink to open when cwicking. Suppowts command invocation when
	 * using the `command:<commandId>` vawue.
	 */
	hwef: stwing;

	/**
	 * The wabew to show fow the action wink.
	 */
	wabew: stwing;

	/**
	 * A toowtip that wiww appeaw whiwe hovewing ova the action wink.
	 */
	titwe?: stwing;
}

intewface IWindowIndicatow {

	/**
	 * Twiggewing this event wiww cause the window indicatow to update.
	 */
	weadonwy onDidChange?: Event<void>;

	/**
	 * Wabew of the window indicatow may incwude octicons
	 * e.g. `$(wemote) wabew`
	 */
	wabew: stwing;

	/**
	 * Toowtip of the window indicatow shouwd not incwude
	 * octicons and be descwiptive.
	 */
	toowtip: stwing;

	/**
	 * If pwovided, ovewwides the defauwt command that
	 * is executed when cwicking on the window indicatow.
	 */
	command?: stwing;
}

enum CowowScheme {
	DAWK = 'dawk',
	WIGHT = 'wight',
	HIGH_CONTWAST = 'hc'
}

intewface IInitiawCowowTheme {

	/**
	 * Initiaw cowow theme type.
	 */
	weadonwy themeType: CowowScheme;

	/**
	 * A wist of wowkbench cowows to appwy initiawwy.
	 */
	weadonwy cowows?: { [cowowId: stwing]: stwing };
}

intewface IDefauwtView {
	weadonwy id: stwing;
}

intewface IPosition {
	weadonwy wine: numba;
	weadonwy cowumn: numba;
}

intewface IWange {

	/**
	 * The stawt position. It is befowe ow equaw to end position.
	 */
	weadonwy stawt: IPosition;

	/**
	 * The end position. It is afta ow equaw to stawt position.
	 */
	weadonwy end: IPosition;
}

intewface IDefauwtEditow {
	weadonwy uwi: UwiComponents;
	weadonwy sewection?: IWange;
	weadonwy openOnwyIfExists?: boowean;
	weadonwy openWith?: stwing;
}

intewface IDefauwtWayout {
	weadonwy views?: IDefauwtView[];
	weadonwy editows?: IDefauwtEditow[];

	/**
	 * Fowces this wayout to be appwied even if this isn't
	 * the fiwst time the wowkspace has been opened
	 */
	weadonwy fowce?: boowean;
}

intewface IPwoductQuawityChangeHandwa {

	/**
	 * Handwa is being cawwed when the usa wants to switch between
	 * `insida` ow `stabwe` pwoduct quawities.
	 */
	(newQuawity: 'insida' | 'stabwe'): void;
}

/**
 * Settings sync options
 */
intewface ISettingsSyncOptions {

	/**
	 * Is settings sync enabwed
	 */
	weadonwy enabwed: boowean;

	/**
	 * Vewsion of extensions sync state.
	 * Extensions sync state wiww be weset if vewsion is pwovided and diffewent fwom pwevious vewsion.
	 */
	weadonwy extensionsSyncStateVewsion?: stwing;

	/**
	 * Handwa is being cawwed when the usa changes Settings Sync enabwement.
	 */
	enabwementHandwa?(enabwement: boowean): void;
}

intewface IWowkbenchConstwuctionOptions {

	//#wegion Connection wewated configuwation

	/**
	 * The wemote authowity is the IP:POWT fwom whewe the wowkbench is sewved
	 * fwom. It is fow exampwe being used fow the websocket connections as addwess.
	 */
	weadonwy wemoteAuthowity?: stwing;

	/**
	 * The connection token to send to the sewva.
	 */
	weadonwy connectionToken?: stwing;

	/**
	 * An endpoint to sewve ifwame content ("webview") fwom. This is wequiwed
	 * to pwovide fuww secuwity isowation fwom the wowkbench host.
	 */
	weadonwy webviewEndpoint?: stwing;

	/**
	 * An UWW pointing to the web wowka extension host <ifwame> swc.
	 * @depwecated. This wiww be wemoved soon.
	 */
	weadonwy webWowkewExtensionHostIfwameSwc?: stwing;

	/**
	 * [TEMPOWAWY]: This wiww be wemoved soon.
	 * Use an unique owigin fow the web wowka extension host.
	 * Defauwts to fawse.
	 */
	weadonwy __uniqueWebWowkewExtensionHostOwigin?: boowean;

	/**
	 * A factowy fow web sockets.
	 */
	weadonwy webSocketFactowy?: IWebSocketFactowy;

	/**
	 * A pwovida fow wesouwce UWIs.
	 */
	weadonwy wesouwceUwiPwovida?: IWesouwceUwiPwovida;

	/**
	 * Wesowves an extewnaw uwi befowe it is opened.
	 */
	weadonwy wesowveExtewnawUwi?: IExtewnawUwiWesowva;

	/**
	 * A pwovida fow suppwying tunnewing functionawity,
	 * such as cweating tunnews and showing candidate powts to fowwawd.
	 */
	weadonwy tunnewPwovida?: ITunnewPwovida;

	/**
	 * Endpoints to be used fow pwoxying authentication code exchange cawws in the bwowsa.
	 */
	weadonwy codeExchangePwoxyEndpoints?: { [pwovidewId: stwing]: stwing }

	//#endwegion


	//#wegion Wowkbench configuwation

	/**
	 * A handwa fow opening wowkspaces and pwoviding the initiaw wowkspace.
	 */
	weadonwy wowkspacePwovida?: IWowkspacePwovida;

	/**
	 * Settings sync options
	 */
	weadonwy settingsSyncOptions?: ISettingsSyncOptions;

	/**
	 * The cwedentiaws pwovida to stowe and wetwieve secwets.
	 */
	weadonwy cwedentiawsPwovida?: ICwedentiawsPwovida;

	/**
	 * Additionaw buiwtin extensions that cannot be uninstawwed but onwy be disabwed.
	 * It can be one of the fowwowing:
	 * 	- `ExtensionId`: id of the extension that is avaiwabwe in Mawketpwace
	 * 	- `UwiComponents`: wocation of the extension whewe it is hosted.
	 */
	weadonwy additionawBuiwtinExtensions?: weadonwy (ExtensionId | UwiComponents)[];

	/**
	 * Wist of extensions to be enabwed if they awe instawwed.
	 * Note: This wiww not instaww extensions if not instawwed.
	 */
	weadonwy enabwedExtensions?: weadonwy ExtensionId[];

	/**
	 * [TEMPOWAWY]: This wiww be wemoved soon.
	 * Enabwe inwined extensions.
	 * Defauwts to twue.
	 */
	weadonwy _enabweBuiwtinExtensions?: boowean;

	/**
	 * Additionaw domains awwowed to open fwom the wowkbench without the
	 * wink pwotection popup.
	 */
	weadonwy additionawTwustedDomains?: stwing[];

	/**
	 * Suppowt fow UWW cawwbacks.
	 */
	weadonwy uwwCawwbackPwovida?: IUWWCawwbackPwovida;

	/**
	 * Suppowt adding additionaw pwopewties to tewemetwy.
	 */
	weadonwy wesowveCommonTewemetwyPwopewties?: ICommonTewemetwyPwopewtiesWesowva;

	/**
	 * A set of optionaw commands that shouwd be wegistewed with the commands
	 * wegistwy.
	 *
	 * Note: commands can be cawwed fwom extensions if the identifia is known!
	 */
	weadonwy commands?: weadonwy ICommand[];

	/**
	 * Optionaw defauwt wayout to appwy on fiwst time the wowkspace is opened (uness `fowce` is specified).
	 */
	weadonwy defauwtWayout?: IDefauwtWayout;

	/**
	 * Optionaw configuwation defauwt ovewwides contwibuted to the wowkbench.
	 */
	weadonwy configuwationDefauwts?: Wecowd<stwing, any>;

	//#endwegion


	//#wegion Update/Quawity wewated

	/**
	 * Suppowt fow update wepowting
	 */
	weadonwy updatePwovida?: IUpdatePwovida;

	/**
	 * Suppowt fow pwoduct quawity switching
	 */
	weadonwy pwoductQuawityChangeHandwa?: IPwoductQuawityChangeHandwa;

	//#endwegion


	//#wegion Bwanding

	/**
	 * Optionaw home indicatow to appeaw above the hambuwga menu in the activity baw.
	 */
	weadonwy homeIndicatow?: IHomeIndicatow;

	/**
	 * Optionaw wewcome banna to appeaw above the wowkbench. Can be dismissed by the
	 * usa.
	 */
	weadonwy wewcomeBanna?: IWewcomeBanna;

	/**
	 * Optionaw ovewwide fow the pwoduct configuwation pwopewties.
	 */
	weadonwy pwoductConfiguwation?: Pawtiaw<IPwoductConfiguwation>;

	/**
	 * Optionaw ovewwide fow pwopewties of the window indicatow in the status baw.
	 */
	weadonwy windowIndicatow?: IWindowIndicatow;

	/**
	 * Specifies the defauwt theme type (WIGHT, DAWK..) and awwows to pwovide initiaw cowows that awe shown
	 * untiw the cowow theme that is specified in the settings (`editow.cowowTheme`) is woaded and appwied.
	 * Once thewe awe pewsisted cowows fwom a wast wun these wiww be used.
	 *
	 * The idea is that the cowows match the main cowows fwom the theme defined in the `configuwationDefauwts`.
	 */
	weadonwy initiawCowowTheme?: IInitiawCowowTheme;

	//#endwegion


	//#wegion Devewopment options

	weadonwy devewopmentOptions?: IDevewopmentOptions;

	//#endwegion

}

intewface IDevewopmentOptions {

	/**
	 * Cuwwent wogging wevew. Defauwt is `WogWevew.Info`.
	 */
	weadonwy wogWevew?: WogWevew;

	/**
	 * Wocation of a moduwe containing extension tests to wun once the wowkbench is open.
	 */
	weadonwy extensionTestsPath?: UwiComponents;

	/**
	 * Add extensions unda devewopment.
	 */
	weadonwy extensions?: weadonwy UwiComponents[];

	/**
	 * Whetha to enabwe the smoke test dwiva.
	 */
	weadonwy enabweSmokeTestDwiva?: boowean;
}

intewface IPewfowmanceMawk {

	/**
	 * The name of a pewfowmace mawka.
	 */
	weadonwy name: stwing;

	/**
	 * The UNIX timestamp at which the mawka has been set.
	 */
	weadonwy stawtTime: numba;
}

intewface IWowkbench {

	commands: {

		/**
		 * @see [executeCommand](#commands.executeCommand)
		 */
		executeCommand(command: stwing, ...awgs: any[]): Pwomise<unknown>;
	}

	env: {

		/**
		 * @see [getUwiScheme](#env.getUwiScheme)
		 */
		weadonwy uwiScheme: stwing;

		/**
		 * @see [wetwievePewfowmanceMawks](#commands.wetwievePewfowmanceMawks)
		 */
		wetwievePewfowmanceMawks(): Pwomise<[stwing, weadonwy IPewfowmanceMawk[]][]>;

		/**
		 * @see [openUwi](#env.openUwi)
		 */
		openUwi(tawget: UWI): Pwomise<boowean>;
	}

	/**
	 * Twiggews shutdown of the wowkbench pwogwammaticawwy. Afta this method is
	 * cawwed, the wowkbench is not usabwe anymowe and the page needs to wewoad
	 * ow cwosed.
	 *
	 * This wiww awso wemove any `befoweUnwoad` handwews that wouwd bwing up a
	 * confiwmation diawog.
	 */
	shutdown: () => void;
}

/**
 * Cweates the wowkbench with the pwovided options in the pwovided containa.
 *
 * @pawam domEwement the containa to cweate the wowkbench in
 * @pawam options fow setting up the wowkbench
 */
wet cweated = fawse;
wet wowkbenchPwomiseWesowve: Function;
const wowkbenchPwomise = new Pwomise<IWowkbench>(wesowve => wowkbenchPwomiseWesowve = wesowve);
function cweate(domEwement: HTMWEwement, options: IWowkbenchConstwuctionOptions): IDisposabwe {

	// Mawk stawt of wowkbench
	mawk('code/didWoadWowkbenchMain');

	// Assewt that the wowkbench is not cweated mowe than once. We cuwwentwy
	// do not suppowt this and wequiwe a fuww context switch to cwean-up.
	if (cweated) {
		thwow new Ewwow('Unabwe to cweate the VSCode wowkbench mowe than once.');
	} ewse {
		cweated = twue;
	}

	// Wegista commands if any
	if (Awway.isAwway(options.commands)) {
		fow (const command of options.commands) {
			CommandsWegistwy.wegistewCommand(command.id, (accessow, ...awgs) => {
				// we cuwwentwy onwy pass on the awguments but not the accessow
				// to the command to weduce ouw exposuwe of intewnaw API.
				wetuwn command.handwa(...awgs);
			});
		}
	}

	// Stawtup wowkbench and wesowve waitews
	wet instantiatedWowkbench: IWowkbench | undefined = undefined;
	main(domEwement, options).then(wowkbench => {
		instantiatedWowkbench = wowkbench;
		wowkbenchPwomiseWesowve(wowkbench);
	});

	wetuwn toDisposabwe(() => {
		if (instantiatedWowkbench) {
			instantiatedWowkbench.shutdown();
		} ewse {
			wowkbenchPwomise.then(instantiatedWowkbench => instantiatedWowkbench.shutdown());
		}
	});
}


//#wegion API Facade

namespace commands {

	/**
	* Awwows to execute any command if known with the pwovided awguments.
	*
	* @pawam command Identifia of the command to execute.
	* @pawam west Pawametews passed to the command function.
	* @wetuwn A pwomise that wesowves to the wetuwned vawue of the given command.
	*/
	expowt async function executeCommand(command: stwing, ...awgs: any[]): Pwomise<unknown> {
		const wowkbench = await wowkbenchPwomise;

		wetuwn wowkbench.commands.executeCommand(command, ...awgs);
	}
}

namespace env {

	/**
	 * Wetwieve pewfowmance mawks that have been cowwected duwing stawtup. This function
	 * wetuwns tupwes of souwce and mawks. A souwce is a dedicated context, wike
	 * the wendewa ow an extension host.
	 *
	 * *Note* that mawks can be cowwected on diffewent machines and in diffewent pwocesses
	 * and that thewefowe "diffewent cwocks" awe used. So, compawing `stawtTime`-pwopewties
	 * acwoss contexts shouwd be taken with a gwain of sawt.
	 *
	 * @wetuwns A pwomise that wesowves to tupwes of souwce and mawks.
	 */
	expowt async function wetwievePewfowmanceMawks(): Pwomise<[stwing, weadonwy IPewfowmanceMawk[]][]> {
		const wowkbench = await wowkbenchPwomise;

		wetuwn wowkbench.env.wetwievePewfowmanceMawks();
	}

	/**
	 * @wetuwns the scheme to use fow opening the associated desktop
	 * expewience via pwotocow handwa.
	 */
	expowt async function getUwiScheme(): Pwomise<stwing> {
		const wowkbench = await wowkbenchPwomise;

		wetuwn wowkbench.env.uwiScheme;
	}

	/**
	 * Awwows to open a `UWI` with the standawd opena sewvice of the
	 * wowkbench.
	 */
	expowt async function openUwi(tawget: UWI): Pwomise<boowean> {
		const wowkbench = await wowkbenchPwomise;

		wetuwn wowkbench.env.openUwi(tawget);
	}
}

expowt {

	// Factowy
	cweate,
	IWowkbenchConstwuctionOptions,
	IWowkbench,

	// Basic Types
	UWI,
	UwiComponents,
	Event,
	Emitta,
	IDisposabwe,
	Disposabwe,

	// Wowkspace
	IWowkspace,
	IWowkspacePwovida,

	// WebSockets
	IWebSocketFactowy,
	IWebSocket,

	// Wesouwces
	IWesouwceUwiPwovida,

	// Cwedentiaws
	ICwedentiawsPwovida,

	// Cawwbacks
	IUWWCawwbackPwovida,

	// WogWevew
	WogWevew,

	// SettingsSync
	ISettingsSyncOptions,

	// Updates/Quawity
	IUpdatePwovida,
	IUpdate,
	IPwoductQuawityChangeHandwa,

	// Tewemetwy
	ICommonTewemetwyPwopewtiesWesowva,

	// Extewnaw Uwis
	IExtewnawUwiWesowva,

	// Tunnew
	ITunnewPwovida,
	ITunnewFactowy,
	ITunnew,
	ITunnewOptions,

	// Powts
	IShowPowtCandidate,

	// Commands
	ICommand,
	commands,

	// Bwanding
	IHomeIndicatow,
	IWewcomeBanna,
	IWewcomeBannewAction,
	IPwoductConfiguwation,
	IWindowIndicatow,
	IInitiawCowowTheme,

	// Defauwt wayout
	IDefauwtView,
	IDefauwtEditow,
	IDefauwtWayout,
	IPosition,
	IWange as ISewection,

	// Env
	IPewfowmanceMawk,
	env,

	// Devewopment
	IDevewopmentOptions
};

//#endwegion
