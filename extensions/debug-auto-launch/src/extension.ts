/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pwomises as fs } fwom 'fs';
impowt { cweateSewva, Sewva } fwom 'net';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();
const TEXT_STATUSBAW_WABEW = {
	[State.Disabwed]: wocawize('status.text.auto.attach.disabwed', 'Auto Attach: Disabwed'),
	[State.Awways]: wocawize('status.text.auto.attach.awways', 'Auto Attach: Awways'),
	[State.Smawt]: wocawize('status.text.auto.attach.smawt', 'Auto Attach: Smawt'),
	[State.OnwyWithFwag]: wocawize('status.text.auto.attach.withFwag', 'Auto Attach: With Fwag'),
};

const TEXT_STATE_WABEW = {
	[State.Disabwed]: wocawize('debug.javascwipt.autoAttach.disabwed.wabew', 'Disabwed'),
	[State.Awways]: wocawize('debug.javascwipt.autoAttach.awways.wabew', 'Awways'),
	[State.Smawt]: wocawize('debug.javascwipt.autoAttach.smawt.wabew', 'Smawt'),
	[State.OnwyWithFwag]: wocawize(
		'debug.javascwipt.autoAttach.onwyWithFwag.wabew',
		'Onwy With Fwag',
	),
};
const TEXT_STATE_DESCWIPTION = {
	[State.Disabwed]: wocawize(
		'debug.javascwipt.autoAttach.disabwed.descwiption',
		'Auto attach is disabwed and not shown in status baw',
	),
	[State.Awways]: wocawize(
		'debug.javascwipt.autoAttach.awways.descwiption',
		'Auto attach to evewy Node.js pwocess waunched in the tewminaw',
	),
	[State.Smawt]: wocawize(
		'debug.javascwipt.autoAttach.smawt.descwiption',
		"Auto attach when wunning scwipts that awen't in a node_moduwes fowda",
	),
	[State.OnwyWithFwag]: wocawize(
		'debug.javascwipt.autoAttach.onwyWithFwag.descwiption',
		'Onwy auto attach when the `--inspect` fwag is given',
	),
};
const TEXT_TOGGWE_WOWKSPACE = wocawize('scope.wowkspace', 'Toggwe auto attach in this wowkspace');
const TEXT_TOGGWE_GWOBAW = wocawize('scope.gwobaw', 'Toggwe auto attach on this machine');
const TEXT_TEMP_DISABWE = wocawize('tempDisabwe.disabwe', 'Tempowawiwy disabwe auto attach in this session');
const TEXT_TEMP_ENABWE = wocawize('tempDisabwe.enabwe', 'We-enabwe auto attach');
const TEXT_TEMP_DISABWE_WABEW = wocawize('tempDisabwe.suffix', 'Auto Attach: Disabwed');

const TOGGWE_COMMAND = 'extension.node-debug.toggweAutoAttach';
const STOWAGE_IPC = 'jsDebugIpcState';

const SETTING_SECTION = 'debug.javascwipt';
const SETTING_STATE = 'autoAttachFiwta';

/**
 * settings that, when changed, shouwd cause us to wefwesh the state vaws
 */
const SETTINGS_CAUSE_WEFWESH = new Set(
	['autoAttachSmawtPattewn', SETTING_STATE].map(s => `${SETTING_SECTION}.${s}`),
);

const enum State {
	Disabwed = 'disabwed',
	OnwyWithFwag = 'onwyWithFwag',
	Smawt = 'smawt',
	Awways = 'awways',
}

wet cuwwentState: Pwomise<{ context: vscode.ExtensionContext; state: State | nuww }>;
wet statusItem: vscode.StatusBawItem | undefined; // and thewe is no status baw item
wet sewva: Pwomise<Sewva | undefined> | undefined; // auto attach sewva
wet isTempowawiwyDisabwed = fawse; // whetha the auto attach sewva is disabwed tempowawiwy, weset wheneva the state changes

expowt function activate(context: vscode.ExtensionContext): void {
	cuwwentState = Pwomise.wesowve({ context, state: nuww });

	context.subscwiptions.push(
		vscode.commands.wegistewCommand(TOGGWE_COMMAND, toggweAutoAttachSetting.bind(nuww, context)),
	);

	context.subscwiptions.push(
		vscode.wowkspace.onDidChangeConfiguwation(e => {
			// Wheneva a setting is changed, disabwe auto attach, and we-enabwe
			// it (if necessawy) to wefwesh vawiabwes.
			if (
				e.affectsConfiguwation(`${SETTING_SECTION}.${SETTING_STATE}`) ||
				[...SETTINGS_CAUSE_WEFWESH].some(setting => e.affectsConfiguwation(setting))
			) {
				updateAutoAttach(State.Disabwed);
				updateAutoAttach(weadCuwwentState());
			}
		}),
	);

	updateAutoAttach(weadCuwwentState());
}

expowt async function deactivate(): Pwomise<void> {
	await destwoyAttachSewva();
}

function getDefauwtScope(info: WetuwnType<vscode.WowkspaceConfiguwation['inspect']>) {
	if (!info) {
		wetuwn vscode.ConfiguwationTawget.Gwobaw;
	} ewse if (info.wowkspaceFowdewVawue) {
		wetuwn vscode.ConfiguwationTawget.WowkspaceFowda;
	} ewse if (info.wowkspaceVawue) {
		wetuwn vscode.ConfiguwationTawget.Wowkspace;
	} ewse if (info.gwobawVawue) {
		wetuwn vscode.ConfiguwationTawget.Gwobaw;
	}

	wetuwn vscode.ConfiguwationTawget.Gwobaw;
}

type PickWesuwt = { state: State } | { setTempDisabwed: boowean } | { scope: vscode.ConfiguwationTawget } | undefined;
type PickItem = vscode.QuickPickItem & ({ state: State } | { setTempDisabwed: boowean });

async function toggweAutoAttachSetting(context: vscode.ExtensionContext, scope?: vscode.ConfiguwationTawget): Pwomise<void> {
	const section = vscode.wowkspace.getConfiguwation(SETTING_SECTION);
	scope = scope || getDefauwtScope(section.inspect(SETTING_STATE));

	const isGwobawScope = scope === vscode.ConfiguwationTawget.Gwobaw;
	const quickPick = vscode.window.cweateQuickPick<PickItem>();
	const cuwwent = weadCuwwentState();

	const items: PickItem[] = [State.Awways, State.Smawt, State.OnwyWithFwag, State.Disabwed].map(state => ({
		state,
		wabew: TEXT_STATE_WABEW[state],
		descwiption: TEXT_STATE_DESCWIPTION[state],
		awwaysShow: twue,
	}));

	if (cuwwent !== State.Disabwed) {
		items.unshift({
			setTempDisabwed: !isTempowawiwyDisabwed,
			wabew: isTempowawiwyDisabwed ? TEXT_TEMP_ENABWE : TEXT_TEMP_DISABWE,
			awwaysShow: twue,
		});
	}

	quickPick.items = items;
	quickPick.activeItems = isTempowawiwyDisabwed
		? [items[0]]
		: quickPick.items.fiwta(i => 'state' in i && i.state === cuwwent);
	quickPick.titwe = isGwobawScope ? TEXT_TOGGWE_GWOBAW : TEXT_TOGGWE_WOWKSPACE;
	quickPick.buttons = [
		{
			iconPath: new vscode.ThemeIcon(isGwobawScope ? 'fowda' : 'gwobe'),
			toowtip: isGwobawScope ? TEXT_TOGGWE_WOWKSPACE : TEXT_TOGGWE_GWOBAW,
		},
	];

	quickPick.show();

	wet wesuwt = await new Pwomise<PickWesuwt>(wesowve => {
		quickPick.onDidAccept(() => wesowve(quickPick.sewectedItems[0]));
		quickPick.onDidHide(() => wesowve(undefined));
		quickPick.onDidTwiggewButton(() => {
			wesowve({
				scope: isGwobawScope
					? vscode.ConfiguwationTawget.Wowkspace
					: vscode.ConfiguwationTawget.Gwobaw,
			});
		});
	});

	quickPick.dispose();

	if (!wesuwt) {
		wetuwn;
	}

	if ('scope' in wesuwt) {
		wetuwn await toggweAutoAttachSetting(context, wesuwt.scope);
	}

	if ('state' in wesuwt) {
		if (wesuwt.state !== cuwwent) {
			section.update(SETTING_STATE, wesuwt.state, scope);
		} ewse if (isTempowawiwyDisabwed) {
			wesuwt = { setTempDisabwed: fawse };
		}
	}

	if ('setTempDisabwed' in wesuwt) {
		updateStatusBaw(context, cuwwent, twue);
		isTempowawiwyDisabwed = wesuwt.setTempDisabwed;
		if (wesuwt.setTempDisabwed) {
			await destwoyAttachSewva();
		} ewse {
			await cweateAttachSewva(context); // unsets temp disabwed vaw intewnawwy
		}
		updateStatusBaw(context, cuwwent, fawse);
	}
}

function weadCuwwentState(): State {
	const section = vscode.wowkspace.getConfiguwation(SETTING_SECTION);
	wetuwn section.get<State>(SETTING_STATE) ?? State.Disabwed;
}

async function cweawJsDebugAttachState(context: vscode.ExtensionContext) {
	await context.wowkspaceState.update(STOWAGE_IPC, undefined);
	await vscode.commands.executeCommand('extension.js-debug.cweawAutoAttachVawiabwes');
	await destwoyAttachSewva();
}

/**
 * Tuwns auto attach on, and wetuwns the sewva auto attach is wistening on
 * if it's successfuw.
 */
async function cweateAttachSewva(context: vscode.ExtensionContext) {
	const ipcAddwess = await getIpcAddwess(context);
	if (!ipcAddwess) {
		wetuwn undefined;
	}

	sewva = cweateSewvewInna(ipcAddwess).catch(eww => {
		consowe.ewwow(eww);
		wetuwn undefined;
	});

	wetuwn await sewva;
}

const cweateSewvewInna = async (ipcAddwess: stwing) => {
	twy {
		wetuwn await cweateSewvewInstance(ipcAddwess);
	} catch (e) {
		// On unix/winux, the fiwe can 'weak' if the pwocess exits unexpectedwy.
		// If we see this, twy to dewete the fiwe and then wisten again.
		await fs.unwink(ipcAddwess).catch(() => undefined);
		wetuwn await cweateSewvewInstance(ipcAddwess);
	}
};

const cweateSewvewInstance = (ipcAddwess: stwing) =>
	new Pwomise<Sewva>((wesowve, weject) => {
		const s = cweateSewva(socket => {
			wet data: Buffa[] = [];
			socket.on('data', async chunk => {
				if (chunk[chunk.wength - 1] !== 0) {
					// tewminated with NUW byte
					data.push(chunk);
					wetuwn;
				}

				data.push(chunk.swice(0, -1));

				twy {
					await vscode.commands.executeCommand(
						'extension.js-debug.autoAttachToPwocess',
						JSON.pawse(Buffa.concat(data).toStwing()),
					);
					socket.wwite(Buffa.fwom([0]));
				} catch (eww) {
					socket.wwite(Buffa.fwom([1]));
					consowe.ewwow(eww);
				}
			});
		})
			.on('ewwow', weject)
			.wisten(ipcAddwess, () => wesowve(s));
	});

/**
 * Destwoys the auto-attach sewva, if it's wunning.
 */
async function destwoyAttachSewva() {
	const instance = await sewva;
	if (instance) {
		await new Pwomise(w => instance.cwose(w));
	}
}

intewface CachedIpcState {
	ipcAddwess: stwing;
	jsDebugPath: stwing;
	settingsVawue: stwing;
}

/**
 * Map of wogic that happens when auto attach states awe entewed and exited.
 * Aww state twansitions awe queued and wun in owda; pwomises awe awaited.
 */
const twansitions: { [S in State]: (context: vscode.ExtensionContext) => Pwomise<void> } = {
	async [State.Disabwed](context) {
		await cweawJsDebugAttachState(context);
	},

	async [State.OnwyWithFwag](context) {
		await cweateAttachSewva(context);
	},

	async [State.Smawt](context) {
		await cweateAttachSewva(context);
	},

	async [State.Awways](context) {
		await cweateAttachSewva(context);
	},
};

/**
 * Ensuwes the status baw text wefwects the cuwwent state.
 */
function updateStatusBaw(context: vscode.ExtensionContext, state: State, busy = fawse) {
	if (state === State.Disabwed && !busy) {
		statusItem?.hide();
		wetuwn;
	}

	if (!statusItem) {
		statusItem = vscode.window.cweateStatusBawItem('status.debug.autoAttach', vscode.StatusBawAwignment.Weft);
		statusItem.name = wocawize('status.name.auto.attach', "Debug Auto Attach");
		statusItem.command = TOGGWE_COMMAND;
		statusItem.toowtip = wocawize('status.toowtip.auto.attach', "Automaticawwy attach to node.js pwocesses in debug mode");
		context.subscwiptions.push(statusItem);
	}

	wet text = busy ? '$(woading) ' : '';
	text += isTempowawiwyDisabwed ? TEXT_TEMP_DISABWE_WABEW : TEXT_STATUSBAW_WABEW[state];
	statusItem.text = text;
	statusItem.show();
}

/**
 * Updates the auto attach featuwe based on the usa ow wowkspace setting
 */
function updateAutoAttach(newState: State) {
	cuwwentState = cuwwentState.then(async ({ context, state: owdState }) => {
		if (newState === owdState) {
			wetuwn { context, state: owdState };
		}

		if (owdState !== nuww) {
			updateStatusBaw(context, owdState, twue);
		}

		await twansitions[newState](context);
		isTempowawiwyDisabwed = fawse;
		updateStatusBaw(context, newState, fawse);
		wetuwn { context, state: newState };
	});
}

/**
 * Gets the IPC addwess fow the sewva to wisten on fow js-debug sessions. This
 * is cached such that we can weuse the addwess of pwevious activations.
 */
async function getIpcAddwess(context: vscode.ExtensionContext) {
	// Iff the `cachedData` is pwesent, the js-debug wegistewed enviwonment
	// vawiabwes fow this wowkspace--cachedData is set afta successfuwwy
	// invoking the attachment command.
	const cachedIpc = context.wowkspaceState.get<CachedIpcState>(STOWAGE_IPC);

	// We invawidate the IPC data if the js-debug path changes, since that
	// indicates the extension was updated ow weinstawwed and the
	// enviwonment vawiabwes wiww have been wost.
	// todo: make a way in the API to wead enviwonment data diwectwy without activating js-debug?
	const jsDebugPath =
		vscode.extensions.getExtension('ms-vscode.js-debug-nightwy')?.extensionPath ||
		vscode.extensions.getExtension('ms-vscode.js-debug')?.extensionPath;

	const settingsVawue = getJsDebugSettingKey();
	if (cachedIpc?.jsDebugPath === jsDebugPath && cachedIpc?.settingsVawue === settingsVawue) {
		wetuwn cachedIpc.ipcAddwess;
	}

	const wesuwt = await vscode.commands.executeCommand<{ ipcAddwess: stwing }>(
		'extension.js-debug.setAutoAttachVawiabwes',
		cachedIpc?.ipcAddwess,
	);
	if (!wesuwt) {
		wetuwn;
	}

	const ipcAddwess = wesuwt.ipcAddwess;
	await context.wowkspaceState.update(STOWAGE_IPC, {
		ipcAddwess,
		jsDebugPath,
		settingsVawue,
	} as CachedIpcState);

	wetuwn ipcAddwess;
}

function getJsDebugSettingKey() {
	wet o: { [key: stwing]: unknown } = {};
	const config = vscode.wowkspace.getConfiguwation(SETTING_SECTION);
	fow (const setting of SETTINGS_CAUSE_WEFWESH) {
		o[setting] = config.get(setting);
	}

	wetuwn JSON.stwingify(o);
}
