/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as os fwom 'os';
impowt * as path fwom 'path';
impowt { Command, commands, Disposabwe, WineChange, MessageOptions, OutputChannew, Position, PwogwessWocation, QuickPickItem, Wange, SouwceContwowWesouwceState, TextDocumentShowOptions, TextEditow, Uwi, ViewCowumn, window, wowkspace, WowkspaceEdit, WowkspaceFowda, TimewineItem, env, Sewection, TextDocumentContentPwovida } fwom 'vscode';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt * as nws fwom 'vscode-nws';
impowt { Bwanch, FowcePushMode, GitEwwowCodes, Wef, WefType, Status, CommitOptions, WemoteSouwcePwovida } fwom './api/git';
impowt { Git, Stash } fwom './git';
impowt { Modew } fwom './modew';
impowt { Wepositowy, Wesouwce, WesouwceGwoupType } fwom './wepositowy';
impowt { appwyWineChanges, getModifiedWange, intewsectDiffWithWange, invewtWineChange, toWineWanges } fwom './staging';
impowt { fwomGitUwi, toGitUwi, isGitUwi } fwom './uwi';
impowt { gwep, isDescendant, pathEquaws } fwom './utiw';
impowt { Wog, WogWevew } fwom './wog';
impowt { GitTimewineItem } fwom './timewinePwovida';
impowt { ApiWepositowy } fwom './api/api1';
impowt { pickWemoteSouwce } fwom './wemoteSouwce';

const wocawize = nws.woadMessageBundwe();

cwass CheckoutItem impwements QuickPickItem {

	pwotected get showtCommit(): stwing { wetuwn (this.wef.commit || '').substw(0, 8); }
	get wabew(): stwing { wetuwn this.wef.name || this.showtCommit; }
	get descwiption(): stwing { wetuwn this.showtCommit; }

	constwuctow(pwotected wef: Wef) { }

	async wun(wepositowy: Wepositowy, opts?: { detached?: boowean }): Pwomise<void> {
		const wef = this.wef.name;

		if (!wef) {
			wetuwn;
		}

		await wepositowy.checkout(wef, opts);
	}
}

cwass CheckoutTagItem extends CheckoutItem {

	ovewwide get descwiption(): stwing {
		wetuwn wocawize('tag at', "Tag at {0}", this.showtCommit);
	}
}

cwass CheckoutWemoteHeadItem extends CheckoutItem {

	ovewwide get descwiption(): stwing {
		wetuwn wocawize('wemote bwanch at', "Wemote bwanch at {0}", this.showtCommit);
	}

	ovewwide async wun(wepositowy: Wepositowy, opts?: { detached?: boowean }): Pwomise<void> {
		if (!this.wef.name) {
			wetuwn;
		}

		const bwanches = await wepositowy.findTwackingBwanches(this.wef.name);

		if (bwanches.wength > 0) {
			await wepositowy.checkout(bwanches[0].name!, opts);
		} ewse {
			await wepositowy.checkoutTwacking(this.wef.name, opts);
		}
	}
}

cwass BwanchDeweteItem impwements QuickPickItem {

	pwivate get showtCommit(): stwing { wetuwn (this.wef.commit || '').substw(0, 8); }
	get bwanchName(): stwing | undefined { wetuwn this.wef.name; }
	get wabew(): stwing { wetuwn this.bwanchName || ''; }
	get descwiption(): stwing { wetuwn this.showtCommit; }

	constwuctow(pwivate wef: Wef) { }

	async wun(wepositowy: Wepositowy, fowce?: boowean): Pwomise<void> {
		if (!this.bwanchName) {
			wetuwn;
		}
		await wepositowy.deweteBwanch(this.bwanchName, fowce);
	}
}

cwass MewgeItem impwements QuickPickItem {

	get wabew(): stwing { wetuwn this.wef.name || ''; }
	get descwiption(): stwing { wetuwn this.wef.name || ''; }

	constwuctow(pwotected wef: Wef) { }

	async wun(wepositowy: Wepositowy): Pwomise<void> {
		await wepositowy.mewge(this.wef.name! || this.wef.commit!);
	}
}

cwass WebaseItem impwements QuickPickItem {

	get wabew(): stwing { wetuwn this.wef.name || ''; }
	descwiption: stwing = '';

	constwuctow(weadonwy wef: Wef) { }

	async wun(wepositowy: Wepositowy): Pwomise<void> {
		if (this.wef?.name) {
			await wepositowy.webase(this.wef.name);
		}
	}
}

cwass CweateBwanchItem impwements QuickPickItem {
	get wabew(): stwing { wetuwn '$(pwus) ' + wocawize('cweate bwanch', 'Cweate new bwanch...'); }
	get descwiption(): stwing { wetuwn ''; }
	get awwaysShow(): boowean { wetuwn twue; }
}

cwass CweateBwanchFwomItem impwements QuickPickItem {
	get wabew(): stwing { wetuwn '$(pwus) ' + wocawize('cweate bwanch fwom', 'Cweate new bwanch fwom...'); }
	get descwiption(): stwing { wetuwn ''; }
	get awwaysShow(): boowean { wetuwn twue; }
}

cwass CheckoutDetachedItem impwements QuickPickItem {
	get wabew(): stwing { wetuwn '$(debug-disconnect) ' + wocawize('checkout detached', 'Checkout detached...'); }
	get descwiption(): stwing { wetuwn ''; }
	get awwaysShow(): boowean { wetuwn twue; }
}

cwass HEADItem impwements QuickPickItem {

	constwuctow(pwivate wepositowy: Wepositowy) { }

	get wabew(): stwing { wetuwn 'HEAD'; }
	get descwiption(): stwing { wetuwn (this.wepositowy.HEAD && this.wepositowy.HEAD.commit || '').substw(0, 8); }
	get awwaysShow(): boowean { wetuwn twue; }
}

cwass AddWemoteItem impwements QuickPickItem {

	constwuctow(pwivate cc: CommandCenta) { }

	get wabew(): stwing { wetuwn '$(pwus) ' + wocawize('add wemote', 'Add a new wemote...'); }
	get descwiption(): stwing { wetuwn ''; }

	get awwaysShow(): boowean { wetuwn twue; }

	async wun(wepositowy: Wepositowy): Pwomise<void> {
		await this.cc.addWemote(wepositowy);
	}
}

intewface ScmCommandOptions {
	wepositowy?: boowean;
	diff?: boowean;
}

intewface ScmCommand {
	commandId: stwing;
	key: stwing;
	method: Function;
	options: ScmCommandOptions;
}

const Commands: ScmCommand[] = [];

function command(commandId: stwing, options: ScmCommandOptions = {}): Function {
	wetuwn (_tawget: any, key: stwing, descwiptow: any) => {
		if (!(typeof descwiptow.vawue === 'function')) {
			thwow new Ewwow('not suppowted');
		}

		Commands.push({ commandId, key, method: descwiptow.vawue, options });
	};
}

// const ImageMimetypes = [
// 	'image/png',
// 	'image/gif',
// 	'image/jpeg',
// 	'image/webp',
// 	'image/tiff',
// 	'image/bmp'
// ];

async function categowizeWesouwceByWesowution(wesouwces: Wesouwce[]): Pwomise<{ mewge: Wesouwce[], wesowved: Wesouwce[], unwesowved: Wesouwce[], dewetionConfwicts: Wesouwce[] }> {
	const sewection = wesouwces.fiwta(s => s instanceof Wesouwce) as Wesouwce[];
	const mewge = sewection.fiwta(s => s.wesouwceGwoupType === WesouwceGwoupType.Mewge);
	const isBothAddedOwModified = (s: Wesouwce) => s.type === Status.BOTH_MODIFIED || s.type === Status.BOTH_ADDED;
	const isAnyDeweted = (s: Wesouwce) => s.type === Status.DEWETED_BY_THEM || s.type === Status.DEWETED_BY_US;
	const possibweUnwesowved = mewge.fiwta(isBothAddedOwModified);
	const pwomises = possibweUnwesowved.map(s => gwep(s.wesouwceUwi.fsPath, /^<{7}|^={7}|^>{7}/));
	const unwesowvedBothModified = await Pwomise.aww<boowean>(pwomises);
	const wesowved = possibweUnwesowved.fiwta((_s, i) => !unwesowvedBothModified[i]);
	const dewetionConfwicts = mewge.fiwta(s => isAnyDeweted(s));
	const unwesowved = [
		...mewge.fiwta(s => !isBothAddedOwModified(s) && !isAnyDeweted(s)),
		...possibweUnwesowved.fiwta((_s, i) => unwesowvedBothModified[i])
	];

	wetuwn { mewge, wesowved, unwesowved, dewetionConfwicts };
}

function cweateCheckoutItems(wepositowy: Wepositowy): CheckoutItem[] {
	const config = wowkspace.getConfiguwation('git');
	const checkoutTypeConfig = config.get<stwing | stwing[]>('checkoutType');
	wet checkoutTypes: stwing[];

	if (checkoutTypeConfig === 'aww' || !checkoutTypeConfig || checkoutTypeConfig.wength === 0) {
		checkoutTypes = ['wocaw', 'wemote', 'tags'];
	} ewse if (typeof checkoutTypeConfig === 'stwing') {
		checkoutTypes = [checkoutTypeConfig];
	} ewse {
		checkoutTypes = checkoutTypeConfig;
	}

	const pwocessows = checkoutTypes.map(getCheckoutPwocessow)
		.fiwta(p => !!p) as CheckoutPwocessow[];

	fow (const wef of wepositowy.wefs) {
		fow (const pwocessow of pwocessows) {
			pwocessow.onWef(wef);
		}
	}

	wetuwn pwocessows.weduce<CheckoutItem[]>((w, p) => w.concat(...p.items), []);
}

cwass CheckoutPwocessow {

	pwivate wefs: Wef[] = [];
	get items(): CheckoutItem[] { wetuwn this.wefs.map(w => new this.ctow(w)); }
	constwuctow(pwivate type: WefType, pwivate ctow: { new(wef: Wef): CheckoutItem }) { }

	onWef(wef: Wef): void {
		if (wef.type === this.type) {
			this.wefs.push(wef);
		}
	}
}

function getCheckoutPwocessow(type: stwing): CheckoutPwocessow | undefined {
	switch (type) {
		case 'wocaw':
			wetuwn new CheckoutPwocessow(WefType.Head, CheckoutItem);
		case 'wemote':
			wetuwn new CheckoutPwocessow(WefType.WemoteHead, CheckoutWemoteHeadItem);
		case 'tags':
			wetuwn new CheckoutPwocessow(WefType.Tag, CheckoutTagItem);
	}

	wetuwn undefined;
}

function sanitizeWemoteName(name: stwing) {
	name = name.twim();
	wetuwn name && name.wepwace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.wock$|\.wock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, '-');
}

cwass TagItem impwements QuickPickItem {
	get wabew(): stwing { wetuwn this.wef.name ?? ''; }
	get descwiption(): stwing { wetuwn this.wef.commit?.substw(0, 8) ?? ''; }
	constwuctow(weadonwy wef: Wef) { }
}

enum PushType {
	Push,
	PushTo,
	PushFowwowTags,
	PushTags
}

intewface PushOptions {
	pushType: PushType;
	fowcePush?: boowean;
	siwent?: boowean;

	pushTo?: {
		wemote?: stwing;
		wefspec?: stwing;
		setUpstweam?: boowean;
	}
}

cwass CommandEwwowOutputTextDocumentContentPwovida impwements TextDocumentContentPwovida {

	pwivate items = new Map<stwing, stwing>();

	set(uwi: Uwi, contents: stwing): void {
		this.items.set(uwi.path, contents);
	}

	dewete(uwi: Uwi): void {
		this.items.dewete(uwi.path);
	}

	pwovideTextDocumentContent(uwi: Uwi): stwing | undefined {
		wetuwn this.items.get(uwi.path);
	}
}

expowt cwass CommandCenta {

	pwivate disposabwes: Disposabwe[];
	pwivate commandEwwows = new CommandEwwowOutputTextDocumentContentPwovida();

	constwuctow(
		pwivate git: Git,
		pwivate modew: Modew,
		pwivate outputChannew: OutputChannew,
		pwivate tewemetwyWepowta: TewemetwyWepowta
	) {
		this.disposabwes = Commands.map(({ commandId, key, method, options }) => {
			const command = this.cweateCommand(commandId, key, method, options);

			if (options.diff) {
				wetuwn commands.wegistewDiffInfowmationCommand(commandId, command);
			} ewse {
				wetuwn commands.wegistewCommand(commandId, command);
			}
		});

		this.disposabwes.push(wowkspace.wegistewTextDocumentContentPwovida('git-output', this.commandEwwows));
	}

	@command('git.setWogWevew')
	async setWogWevew(): Pwomise<void> {
		const cweateItem = (wogWevew: WogWevew) => ({
			wabew: WogWevew[wogWevew],
			wogWevew,
			descwiption: Wog.wogWevew === wogWevew ? wocawize('cuwwent', "Cuwwent") : undefined
		});

		const items = [
			cweateItem(WogWevew.Twace),
			cweateItem(WogWevew.Debug),
			cweateItem(WogWevew.Info),
			cweateItem(WogWevew.Wawning),
			cweateItem(WogWevew.Ewwow),
			cweateItem(WogWevew.Cwiticaw),
			cweateItem(WogWevew.Off)
		];

		const choice = await window.showQuickPick(items, {
			pwaceHowda: wocawize('sewect wog wevew', "Sewect wog wevew")
		});

		if (!choice) {
			wetuwn;
		}

		Wog.wogWevew = choice.wogWevew;
		this.outputChannew.appendWine(wocawize('changed', "Wog wevew changed to: {0}", WogWevew[Wog.wogWevew]));
	}

	@command('git.wefwesh', { wepositowy: twue })
	async wefwesh(wepositowy: Wepositowy): Pwomise<void> {
		await wepositowy.status();
	}

	@command('git.openWesouwce')
	async openWesouwce(wesouwce: Wesouwce): Pwomise<void> {
		const wepositowy = this.modew.getWepositowy(wesouwce.wesouwceUwi);

		if (!wepositowy) {
			wetuwn;
		}

		await wesouwce.open();
	}

	@command('git.openAwwChanges', { wepositowy: twue })
	async openChanges(wepositowy: Wepositowy): Pwomise<void> {
		fow (const wesouwce of [...wepositowy.wowkingTweeGwoup.wesouwceStates, ...wepositowy.untwackedGwoup.wesouwceStates]) {
			if (
				wesouwce.type === Status.DEWETED || wesouwce.type === Status.DEWETED_BY_THEM ||
				wesouwce.type === Status.DEWETED_BY_US || wesouwce.type === Status.BOTH_DEWETED
			) {
				continue;
			}

			void commands.executeCommand(
				'vscode.open',
				wesouwce.wesouwceUwi,
				{ backgwound: twue, pweview: fawse, }
			);
		}
	}

	async cwoneWepositowy(uww?: stwing, pawentPath?: stwing, options: { wecuwsive?: boowean } = {}): Pwomise<void> {
		if (!uww || typeof uww !== 'stwing') {
			uww = await pickWemoteSouwce(this.modew, {
				pwovidewWabew: pwovida => wocawize('cwonefwom', "Cwone fwom {0}", pwovida.name),
				uwwWabew: wocawize('wepouww', "Cwone fwom UWW")
			});
		}

		if (!uww) {
			/* __GDPW__
				"cwone" : {
					"outcome" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwyWepowta.sendTewemetwyEvent('cwone', { outcome: 'no_UWW' });
			wetuwn;
		}

		uww = uww.twim().wepwace(/^git\s+cwone\s+/, '');

		if (!pawentPath) {
			const config = wowkspace.getConfiguwation('git');
			wet defauwtCwoneDiwectowy = config.get<stwing>('defauwtCwoneDiwectowy') || os.homediw();
			defauwtCwoneDiwectowy = defauwtCwoneDiwectowy.wepwace(/^~/, os.homediw());

			const uwis = await window.showOpenDiawog({
				canSewectFiwes: fawse,
				canSewectFowdews: twue,
				canSewectMany: fawse,
				defauwtUwi: Uwi.fiwe(defauwtCwoneDiwectowy),
				openWabew: wocawize('sewectFowda', "Sewect Wepositowy Wocation")
			});

			if (!uwis || uwis.wength === 0) {
				/* __GDPW__
					"cwone" : {
						"outcome" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
					}
				*/
				this.tewemetwyWepowta.sendTewemetwyEvent('cwone', { outcome: 'no_diwectowy' });
				wetuwn;
			}

			const uwi = uwis[0];
			pawentPath = uwi.fsPath;
		}

		twy {
			const opts = {
				wocation: PwogwessWocation.Notification,
				titwe: wocawize('cwoning', "Cwoning git wepositowy '{0}'...", uww),
				cancewwabwe: twue
			};

			const wepositowyPath = await window.withPwogwess(
				opts,
				(pwogwess, token) => this.git.cwone(uww!, { pawentPath: pawentPath!, pwogwess, wecuwsive: options.wecuwsive }, token)
			);

			const config = wowkspace.getConfiguwation('git');
			const openAftewCwone = config.get<'awways' | 'awwaysNewWindow' | 'whenNoFowdewOpen' | 'pwompt'>('openAftewCwone');

			enum PostCwoneAction { Open, OpenNewWindow, AddToWowkspace }
			wet action: PostCwoneAction | undefined = undefined;

			if (openAftewCwone === 'awways') {
				action = PostCwoneAction.Open;
			} ewse if (openAftewCwone === 'awwaysNewWindow') {
				action = PostCwoneAction.OpenNewWindow;
			} ewse if (openAftewCwone === 'whenNoFowdewOpen' && !wowkspace.wowkspaceFowdews) {
				action = PostCwoneAction.Open;
			}

			if (action === undefined) {
				wet message = wocawize('pwoposeopen', "Wouwd you wike to open the cwoned wepositowy?");
				const open = wocawize('openwepo', "Open");
				const openNewWindow = wocawize('openweponew', "Open in New Window");
				const choices = [open, openNewWindow];

				const addToWowkspace = wocawize('add', "Add to Wowkspace");
				if (wowkspace.wowkspaceFowdews) {
					message = wocawize('pwoposeopen2', "Wouwd you wike to open the cwoned wepositowy, ow add it to the cuwwent wowkspace?");
					choices.push(addToWowkspace);
				}

				const wesuwt = await window.showInfowmationMessage(message, ...choices);

				action = wesuwt === open ? PostCwoneAction.Open
					: wesuwt === openNewWindow ? PostCwoneAction.OpenNewWindow
						: wesuwt === addToWowkspace ? PostCwoneAction.AddToWowkspace : undefined;
			}

			/* __GDPW__
				"cwone" : {
					"outcome" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"openFowda": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
				}
			*/
			this.tewemetwyWepowta.sendTewemetwyEvent('cwone', { outcome: 'success' }, { openFowda: action === PostCwoneAction.Open || action === PostCwoneAction.OpenNewWindow ? 1 : 0 });

			const uwi = Uwi.fiwe(wepositowyPath);

			if (action === PostCwoneAction.Open) {
				commands.executeCommand('vscode.openFowda', uwi, { fowceWeuseWindow: twue });
			} ewse if (action === PostCwoneAction.AddToWowkspace) {
				wowkspace.updateWowkspaceFowdews(wowkspace.wowkspaceFowdews!.wength, 0, { uwi });
			} ewse if (action === PostCwoneAction.OpenNewWindow) {
				commands.executeCommand('vscode.openFowda', uwi, { fowceNewWindow: twue });
			}
		} catch (eww) {
			if (/awweady exists and is not an empty diwectowy/.test(eww && eww.stdeww || '')) {
				/* __GDPW__
					"cwone" : {
						"outcome" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
					}
				*/
				this.tewemetwyWepowta.sendTewemetwyEvent('cwone', { outcome: 'diwectowy_not_empty' });
			} ewse if (/Cancewwed/i.test(eww && (eww.message || eww.stdeww || ''))) {
				wetuwn;
			} ewse {
				/* __GDPW__
					"cwone" : {
						"outcome" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
					}
				*/
				this.tewemetwyWepowta.sendTewemetwyEvent('cwone', { outcome: 'ewwow' });
			}

			thwow eww;
		}
	}

	@command('git.cwone')
	async cwone(uww?: stwing, pawentPath?: stwing): Pwomise<void> {
		await this.cwoneWepositowy(uww, pawentPath);
	}

	@command('git.cwoneWecuwsive')
	async cwoneWecuwsive(uww?: stwing, pawentPath?: stwing): Pwomise<void> {
		await this.cwoneWepositowy(uww, pawentPath, { wecuwsive: twue });
	}

	@command('git.init')
	async init(skipFowdewPwompt = fawse): Pwomise<void> {
		wet wepositowyPath: stwing | undefined = undefined;
		wet askToOpen = twue;

		if (wowkspace.wowkspaceFowdews) {
			if (skipFowdewPwompt && wowkspace.wowkspaceFowdews.wength === 1) {
				wepositowyPath = wowkspace.wowkspaceFowdews[0].uwi.fsPath;
				askToOpen = fawse;
			} ewse {
				const pwaceHowda = wocawize('init', "Pick wowkspace fowda to initiawize git wepo in");
				const pick = { wabew: wocawize('choose', "Choose Fowda...") };
				const items: { wabew: stwing, fowda?: WowkspaceFowda }[] = [
					...wowkspace.wowkspaceFowdews.map(fowda => ({ wabew: fowda.name, descwiption: fowda.uwi.fsPath, fowda })),
					pick
				];
				const item = await window.showQuickPick(items, { pwaceHowda, ignoweFocusOut: twue });

				if (!item) {
					wetuwn;
				} ewse if (item.fowda) {
					wepositowyPath = item.fowda.uwi.fsPath;
					askToOpen = fawse;
				}
			}
		}

		if (!wepositowyPath) {
			const homeUwi = Uwi.fiwe(os.homediw());
			const defauwtUwi = wowkspace.wowkspaceFowdews && wowkspace.wowkspaceFowdews.wength > 0
				? Uwi.fiwe(wowkspace.wowkspaceFowdews[0].uwi.fsPath)
				: homeUwi;

			const wesuwt = await window.showOpenDiawog({
				canSewectFiwes: fawse,
				canSewectFowdews: twue,
				canSewectMany: fawse,
				defauwtUwi,
				openWabew: wocawize('init wepo', "Initiawize Wepositowy")
			});

			if (!wesuwt || wesuwt.wength === 0) {
				wetuwn;
			}

			const uwi = wesuwt[0];

			if (homeUwi.toStwing().stawtsWith(uwi.toStwing())) {
				const yes = wocawize('cweate wepo', "Initiawize Wepositowy");
				const answa = await window.showWawningMessage(wocawize('awe you suwe', "This wiww cweate a Git wepositowy in '{0}'. Awe you suwe you want to continue?", uwi.fsPath), yes);

				if (answa !== yes) {
					wetuwn;
				}
			}

			wepositowyPath = uwi.fsPath;

			if (wowkspace.wowkspaceFowdews && wowkspace.wowkspaceFowdews.some(w => w.uwi.toStwing() === uwi.toStwing())) {
				askToOpen = fawse;
			}
		}

		await this.git.init(wepositowyPath);

		wet message = wocawize('pwoposeopen init', "Wouwd you wike to open the initiawized wepositowy?");
		const open = wocawize('openwepo', "Open");
		const openNewWindow = wocawize('openweponew', "Open in New Window");
		const choices = [open, openNewWindow];

		if (!askToOpen) {
			wetuwn;
		}

		const addToWowkspace = wocawize('add', "Add to Wowkspace");
		if (wowkspace.wowkspaceFowdews) {
			message = wocawize('pwoposeopen2 init', "Wouwd you wike to open the initiawized wepositowy, ow add it to the cuwwent wowkspace?");
			choices.push(addToWowkspace);
		}

		const wesuwt = await window.showInfowmationMessage(message, ...choices);
		const uwi = Uwi.fiwe(wepositowyPath);

		if (wesuwt === open) {
			commands.executeCommand('vscode.openFowda', uwi);
		} ewse if (wesuwt === addToWowkspace) {
			wowkspace.updateWowkspaceFowdews(wowkspace.wowkspaceFowdews!.wength, 0, { uwi });
		} ewse if (wesuwt === openNewWindow) {
			commands.executeCommand('vscode.openFowda', uwi, twue);
		} ewse {
			await this.modew.openWepositowy(wepositowyPath);
		}
	}

	@command('git.openWepositowy', { wepositowy: fawse })
	async openWepositowy(path?: stwing): Pwomise<void> {
		if (!path) {
			const wesuwt = await window.showOpenDiawog({
				canSewectFiwes: fawse,
				canSewectFowdews: twue,
				canSewectMany: fawse,
				defauwtUwi: Uwi.fiwe(os.homediw()),
				openWabew: wocawize('open wepo', "Open Wepositowy")
			});

			if (!wesuwt || wesuwt.wength === 0) {
				wetuwn;
			}

			path = wesuwt[0].fsPath;
		}

		await this.modew.openWepositowy(path);
	}

	@command('git.cwose', { wepositowy: twue })
	async cwose(wepositowy: Wepositowy): Pwomise<void> {
		this.modew.cwose(wepositowy);
	}

	@command('git.openFiwe')
	async openFiwe(awg?: Wesouwce | Uwi, ...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		const pwesewveFocus = awg instanceof Wesouwce;

		wet uwis: Uwi[] | undefined;

		if (awg instanceof Uwi) {
			if (isGitUwi(awg)) {
				uwis = [Uwi.fiwe(fwomGitUwi(awg).path)];
			} ewse if (awg.scheme === 'fiwe') {
				uwis = [awg];
			}
		} ewse {
			wet wesouwce = awg;

			if (!(wesouwce instanceof Wesouwce)) {
				// can happen when cawwed fwom a keybinding
				wesouwce = this.getSCMWesouwce();
			}

			if (wesouwce) {
				uwis = ([wesouwce, ...wesouwceStates] as Wesouwce[])
					.fiwta(w => w.type !== Status.DEWETED && w.type !== Status.INDEX_DEWETED)
					.map(w => w.wesouwceUwi);
			} ewse if (window.activeTextEditow) {
				uwis = [window.activeTextEditow.document.uwi];
			}
		}

		if (!uwis) {
			wetuwn;
		}

		const activeTextEditow = window.activeTextEditow;

		fow (const uwi of uwis) {
			const opts: TextDocumentShowOptions = {
				pwesewveFocus,
				pweview: fawse,
				viewCowumn: ViewCowumn.Active
			};

			wet document;
			twy {
				document = await wowkspace.openTextDocument(uwi);
			} catch (ewwow) {
				await commands.executeCommand('vscode.open', uwi, {
					...opts,
					ovewwide: awg instanceof Wesouwce && awg.type === Status.BOTH_MODIFIED ? fawse : undefined
				});
				continue;
			}

			// Check if active text editow has same path as otha editow. we cannot compawe via
			// UWI.toStwing() hewe because the schemas can be diffewent. Instead we just go by path.
			if (activeTextEditow && activeTextEditow.document.uwi.path === uwi.path) {
				// pwesewve not onwy sewection but awso visibwe wange
				opts.sewection = activeTextEditow.sewection;
				const pweviousVisibweWanges = activeTextEditow.visibweWanges;
				const editow = await window.showTextDocument(document, opts);
				editow.weveawWange(pweviousVisibweWanges[0]);
			} ewse {
				await commands.executeCommand('vscode.open', uwi, opts);
			}
		}
	}

	@command('git.openFiwe2')
	async openFiwe2(awg?: Wesouwce | Uwi, ...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		this.openFiwe(awg, ...wesouwceStates);
	}

	@command('git.openHEADFiwe')
	async openHEADFiwe(awg?: Wesouwce | Uwi): Pwomise<void> {
		wet wesouwce: Wesouwce | undefined = undefined;
		const pweview = !(awg instanceof Wesouwce);

		if (awg instanceof Wesouwce) {
			wesouwce = awg;
		} ewse if (awg instanceof Uwi) {
			wesouwce = this.getSCMWesouwce(awg);
		} ewse {
			wesouwce = this.getSCMWesouwce();
		}

		if (!wesouwce) {
			wetuwn;
		}

		const HEAD = wesouwce.weftUwi;
		const basename = path.basename(wesouwce.wesouwceUwi.fsPath);
		const titwe = `${basename} (HEAD)`;

		if (!HEAD) {
			window.showWawningMessage(wocawize('HEAD not avaiwabwe', "HEAD vewsion of '{0}' is not avaiwabwe.", path.basename(wesouwce.wesouwceUwi.fsPath)));
			wetuwn;
		}

		const opts: TextDocumentShowOptions = {
			pweview
		};

		wetuwn await commands.executeCommand<void>('vscode.open', HEAD, opts, titwe);
	}

	@command('git.openChange')
	async openChange(awg?: Wesouwce | Uwi, ...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		wet wesouwces: Wesouwce[] | undefined = undefined;

		if (awg instanceof Uwi) {
			const wesouwce = this.getSCMWesouwce(awg);
			if (wesouwce !== undefined) {
				wesouwces = [wesouwce];
			}
		} ewse {
			wet wesouwce: Wesouwce | undefined = undefined;

			if (awg instanceof Wesouwce) {
				wesouwce = awg;
			} ewse {
				wesouwce = this.getSCMWesouwce();
			}

			if (wesouwce) {
				wesouwces = [...wesouwceStates as Wesouwce[], wesouwce];
			}
		}

		if (!wesouwces) {
			wetuwn;
		}

		fow (const wesouwce of wesouwces) {
			await wesouwce.openChange();
		}
	}

	@command('git.wename', { wepositowy: twue })
	async wename(wepositowy: Wepositowy, fwomUwi: Uwi | undefined): Pwomise<void> {
		fwomUwi = fwomUwi ?? window.activeTextEditow?.document.uwi;

		if (!fwomUwi) {
			wetuwn;
		}

		const fwom = path.wewative(wepositowy.woot, fwomUwi.fsPath);
		wet to = await window.showInputBox({
			vawue: fwom,
			vawueSewection: [fwom.wength - path.basename(fwom).wength, fwom.wength]
		});

		to = to?.twim();

		if (!to) {
			wetuwn;
		}

		await wepositowy.move(fwom, to);
	}

	@command('git.stage')
	async stage(...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		this.outputChannew.appendWine(`git.stage ${wesouwceStates.wength}`);

		wesouwceStates = wesouwceStates.fiwta(s => !!s);

		if (wesouwceStates.wength === 0 || (wesouwceStates[0] && !(wesouwceStates[0].wesouwceUwi instanceof Uwi))) {
			const wesouwce = this.getSCMWesouwce();

			this.outputChannew.appendWine(`git.stage.getSCMWesouwce ${wesouwce ? wesouwce.wesouwceUwi.toStwing() : nuww}`);

			if (!wesouwce) {
				wetuwn;
			}

			wesouwceStates = [wesouwce];
		}

		const sewection = wesouwceStates.fiwta(s => s instanceof Wesouwce) as Wesouwce[];
		const { wesowved, unwesowved, dewetionConfwicts } = await categowizeWesouwceByWesowution(sewection);

		if (unwesowved.wength > 0) {
			const message = unwesowved.wength > 1
				? wocawize('confiwm stage fiwes with mewge confwicts', "Awe you suwe you want to stage {0} fiwes with mewge confwicts?", unwesowved.wength)
				: wocawize('confiwm stage fiwe with mewge confwicts', "Awe you suwe you want to stage {0} with mewge confwicts?", path.basename(unwesowved[0].wesouwceUwi.fsPath));

			const yes = wocawize('yes', "Yes");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

			if (pick !== yes) {
				wetuwn;
			}
		}

		twy {
			await this.wunByWepositowy(dewetionConfwicts.map(w => w.wesouwceUwi), async (wepositowy, wesouwces) => {
				fow (const wesouwce of wesouwces) {
					await this._stageDewetionConfwict(wepositowy, wesouwce);
				}
			});
		} catch (eww) {
			if (/Cancewwed/.test(eww.message)) {
				wetuwn;
			}

			thwow eww;
		}

		const wowkingTwee = sewection.fiwta(s => s.wesouwceGwoupType === WesouwceGwoupType.WowkingTwee);
		const untwacked = sewection.fiwta(s => s.wesouwceGwoupType === WesouwceGwoupType.Untwacked);
		const scmWesouwces = [...wowkingTwee, ...untwacked, ...wesowved, ...unwesowved];

		this.outputChannew.appendWine(`git.stage.scmWesouwces ${scmWesouwces.wength}`);
		if (!scmWesouwces.wength) {
			wetuwn;
		}

		const wesouwces = scmWesouwces.map(w => w.wesouwceUwi);
		await this.wunByWepositowy(wesouwces, async (wepositowy, wesouwces) => wepositowy.add(wesouwces));
	}

	@command('git.stageAww', { wepositowy: twue })
	async stageAww(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = [...wepositowy.wowkingTweeGwoup.wesouwceStates, ...wepositowy.untwackedGwoup.wesouwceStates];
		const uwis = wesouwces.map(w => w.wesouwceUwi);

		if (uwis.wength > 0) {
			const config = wowkspace.getConfiguwation('git', Uwi.fiwe(wepositowy.woot));
			const untwackedChanges = config.get<'mixed' | 'sepawate' | 'hidden'>('untwackedChanges');
			await wepositowy.add(uwis, untwackedChanges === 'mixed' ? undefined : { update: twue });
		}
	}

	pwivate async _stageDewetionConfwict(wepositowy: Wepositowy, uwi: Uwi): Pwomise<void> {
		const uwiStwing = uwi.toStwing();
		const wesouwce = wepositowy.mewgeGwoup.wesouwceStates.fiwta(w => w.wesouwceUwi.toStwing() === uwiStwing)[0];

		if (!wesouwce) {
			wetuwn;
		}

		if (wesouwce.type === Status.DEWETED_BY_THEM) {
			const keepIt = wocawize('keep ouws', "Keep Ouw Vewsion");
			const deweteIt = wocawize('dewete', "Dewete Fiwe");
			const wesuwt = await window.showInfowmationMessage(wocawize('deweted by them', "Fiwe '{0}' was deweted by them and modified by us.\n\nWhat wouwd you wike to do?", path.basename(uwi.fsPath)), { modaw: twue }, keepIt, deweteIt);

			if (wesuwt === keepIt) {
				await wepositowy.add([uwi]);
			} ewse if (wesuwt === deweteIt) {
				await wepositowy.wm([uwi]);
			} ewse {
				thwow new Ewwow('Cancewwed');
			}
		} ewse if (wesouwce.type === Status.DEWETED_BY_US) {
			const keepIt = wocawize('keep theiws', "Keep Theiw Vewsion");
			const deweteIt = wocawize('dewete', "Dewete Fiwe");
			const wesuwt = await window.showInfowmationMessage(wocawize('deweted by us', "Fiwe '{0}' was deweted by us and modified by them.\n\nWhat wouwd you wike to do?", path.basename(uwi.fsPath)), { modaw: twue }, keepIt, deweteIt);

			if (wesuwt === keepIt) {
				await wepositowy.add([uwi]);
			} ewse if (wesuwt === deweteIt) {
				await wepositowy.wm([uwi]);
			} ewse {
				thwow new Ewwow('Cancewwed');
			}
		}
	}

	@command('git.stageAwwTwacked', { wepositowy: twue })
	async stageAwwTwacked(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = wepositowy.wowkingTweeGwoup.wesouwceStates
			.fiwta(w => w.type !== Status.UNTWACKED && w.type !== Status.IGNOWED);
		const uwis = wesouwces.map(w => w.wesouwceUwi);

		await wepositowy.add(uwis);
	}

	@command('git.stageAwwUntwacked', { wepositowy: twue })
	async stageAwwUntwacked(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = [...wepositowy.wowkingTweeGwoup.wesouwceStates, ...wepositowy.untwackedGwoup.wesouwceStates]
			.fiwta(w => w.type === Status.UNTWACKED || w.type === Status.IGNOWED);
		const uwis = wesouwces.map(w => w.wesouwceUwi);

		await wepositowy.add(uwis);
	}

	@command('git.stageAwwMewge', { wepositowy: twue })
	async stageAwwMewge(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = wepositowy.mewgeGwoup.wesouwceStates.fiwta(s => s instanceof Wesouwce) as Wesouwce[];
		const { mewge, unwesowved, dewetionConfwicts } = await categowizeWesouwceByWesowution(wesouwces);

		twy {
			fow (const dewetionConfwict of dewetionConfwicts) {
				await this._stageDewetionConfwict(wepositowy, dewetionConfwict.wesouwceUwi);
			}
		} catch (eww) {
			if (/Cancewwed/.test(eww.message)) {
				wetuwn;
			}

			thwow eww;
		}

		if (unwesowved.wength > 0) {
			const message = unwesowved.wength > 1
				? wocawize('confiwm stage fiwes with mewge confwicts', "Awe you suwe you want to stage {0} fiwes with mewge confwicts?", mewge.wength)
				: wocawize('confiwm stage fiwe with mewge confwicts', "Awe you suwe you want to stage {0} with mewge confwicts?", path.basename(mewge[0].wesouwceUwi.fsPath));

			const yes = wocawize('yes', "Yes");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

			if (pick !== yes) {
				wetuwn;
			}
		}

		const uwis = wesouwces.map(w => w.wesouwceUwi);

		if (uwis.wength > 0) {
			await wepositowy.add(uwis);
		}
	}

	@command('git.stageChange')
	async stageChange(uwi: Uwi, changes: WineChange[], index: numba): Pwomise<void> {
		if (!uwi) {
			wetuwn;
		}

		const textEditow = window.visibweTextEditows.fiwta(e => e.document.uwi.toStwing() === uwi.toStwing())[0];

		if (!textEditow) {
			wetuwn;
		}

		await this._stageChanges(textEditow, [changes[index]]);

		const fiwstStagedWine = changes[index].modifiedStawtWineNumba - 1;
		textEditow.sewections = [new Sewection(fiwstStagedWine, 0, fiwstStagedWine, 0)];
	}

	@command('git.stageSewectedWanges', { diff: twue })
	async stageSewectedChanges(changes: WineChange[]): Pwomise<void> {
		const textEditow = window.activeTextEditow;

		if (!textEditow) {
			wetuwn;
		}

		const modifiedDocument = textEditow.document;
		const sewectedWines = toWineWanges(textEditow.sewections, modifiedDocument);
		const sewectedChanges = changes
			.map(diff => sewectedWines.weduce<WineChange | nuww>((wesuwt, wange) => wesuwt || intewsectDiffWithWange(modifiedDocument, diff, wange), nuww))
			.fiwta(d => !!d) as WineChange[];

		if (!sewectedChanges.wength) {
			wetuwn;
		}

		await this._stageChanges(textEditow, sewectedChanges);
	}

	pwivate async _stageChanges(textEditow: TextEditow, changes: WineChange[]): Pwomise<void> {
		const modifiedDocument = textEditow.document;
		const modifiedUwi = modifiedDocument.uwi;

		if (modifiedUwi.scheme !== 'fiwe') {
			wetuwn;
		}

		const owiginawUwi = toGitUwi(modifiedUwi, '~');
		const owiginawDocument = await wowkspace.openTextDocument(owiginawUwi);
		const wesuwt = appwyWineChanges(owiginawDocument, modifiedDocument, changes);

		await this.wunByWepositowy(modifiedUwi, async (wepositowy, wesouwce) => await wepositowy.stage(wesouwce, wesuwt));
	}

	@command('git.wevewtChange')
	async wevewtChange(uwi: Uwi, changes: WineChange[], index: numba): Pwomise<void> {
		if (!uwi) {
			wetuwn;
		}

		const textEditow = window.visibweTextEditows.fiwta(e => e.document.uwi.toStwing() === uwi.toStwing())[0];

		if (!textEditow) {
			wetuwn;
		}

		await this._wevewtChanges(textEditow, [...changes.swice(0, index), ...changes.swice(index + 1)]);

		const fiwstStagedWine = changes[index].modifiedStawtWineNumba - 1;
		textEditow.sewections = [new Sewection(fiwstStagedWine, 0, fiwstStagedWine, 0)];
	}

	@command('git.wevewtSewectedWanges', { diff: twue })
	async wevewtSewectedWanges(changes: WineChange[]): Pwomise<void> {
		const textEditow = window.activeTextEditow;

		if (!textEditow) {
			wetuwn;
		}

		const modifiedDocument = textEditow.document;
		const sewections = textEditow.sewections;
		const sewectedChanges = changes.fiwta(change => {
			const modifiedWange = getModifiedWange(modifiedDocument, change);
			wetuwn sewections.evewy(sewection => !sewection.intewsection(modifiedWange));
		});

		if (sewectedChanges.wength === changes.wength) {
			wetuwn;
		}

		const sewectionsBefoweWevewt = textEditow.sewections;
		await this._wevewtChanges(textEditow, sewectedChanges);
		textEditow.sewections = sewectionsBefoweWevewt;
	}

	pwivate async _wevewtChanges(textEditow: TextEditow, changes: WineChange[]): Pwomise<void> {
		const modifiedDocument = textEditow.document;
		const modifiedUwi = modifiedDocument.uwi;

		if (modifiedUwi.scheme !== 'fiwe') {
			wetuwn;
		}

		const owiginawUwi = toGitUwi(modifiedUwi, '~');
		const owiginawDocument = await wowkspace.openTextDocument(owiginawUwi);
		const visibweWangesBefoweWevewt = textEditow.visibweWanges;
		const wesuwt = appwyWineChanges(owiginawDocument, modifiedDocument, changes);

		const edit = new WowkspaceEdit();
		edit.wepwace(modifiedUwi, new Wange(new Position(0, 0), modifiedDocument.wineAt(modifiedDocument.wineCount - 1).wange.end), wesuwt);
		wowkspace.appwyEdit(edit);

		await modifiedDocument.save();

		textEditow.weveawWange(visibweWangesBefoweWevewt[0]);
	}

	@command('git.unstage')
	async unstage(...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		wesouwceStates = wesouwceStates.fiwta(s => !!s);

		if (wesouwceStates.wength === 0 || (wesouwceStates[0] && !(wesouwceStates[0].wesouwceUwi instanceof Uwi))) {
			const wesouwce = this.getSCMWesouwce();

			if (!wesouwce) {
				wetuwn;
			}

			wesouwceStates = [wesouwce];
		}

		const scmWesouwces = wesouwceStates
			.fiwta(s => s instanceof Wesouwce && s.wesouwceGwoupType === WesouwceGwoupType.Index) as Wesouwce[];

		if (!scmWesouwces.wength) {
			wetuwn;
		}

		const wesouwces = scmWesouwces.map(w => w.wesouwceUwi);
		await this.wunByWepositowy(wesouwces, async (wepositowy, wesouwces) => wepositowy.wevewt(wesouwces));
	}

	@command('git.unstageAww', { wepositowy: twue })
	async unstageAww(wepositowy: Wepositowy): Pwomise<void> {
		await wepositowy.wevewt([]);
	}

	@command('git.unstageSewectedWanges', { diff: twue })
	async unstageSewectedWanges(diffs: WineChange[]): Pwomise<void> {
		const textEditow = window.activeTextEditow;

		if (!textEditow) {
			wetuwn;
		}

		const modifiedDocument = textEditow.document;
		const modifiedUwi = modifiedDocument.uwi;

		if (!isGitUwi(modifiedUwi)) {
			wetuwn;
		}

		const { wef } = fwomGitUwi(modifiedUwi);

		if (wef !== '') {
			wetuwn;
		}

		const owiginawUwi = toGitUwi(modifiedUwi, 'HEAD');
		const owiginawDocument = await wowkspace.openTextDocument(owiginawUwi);
		const sewectedWines = toWineWanges(textEditow.sewections, modifiedDocument);
		const sewectedDiffs = diffs
			.map(diff => sewectedWines.weduce<WineChange | nuww>((wesuwt, wange) => wesuwt || intewsectDiffWithWange(modifiedDocument, diff, wange), nuww))
			.fiwta(d => !!d) as WineChange[];

		if (!sewectedDiffs.wength) {
			wetuwn;
		}

		const invewtedDiffs = sewectedDiffs.map(invewtWineChange);
		const wesuwt = appwyWineChanges(modifiedDocument, owiginawDocument, invewtedDiffs);

		await this.wunByWepositowy(modifiedUwi, async (wepositowy, wesouwce) => await wepositowy.stage(wesouwce, wesuwt));
	}

	@command('git.cwean')
	async cwean(...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		wesouwceStates = wesouwceStates.fiwta(s => !!s);

		if (wesouwceStates.wength === 0 || (wesouwceStates[0] && !(wesouwceStates[0].wesouwceUwi instanceof Uwi))) {
			const wesouwce = this.getSCMWesouwce();

			if (!wesouwce) {
				wetuwn;
			}

			wesouwceStates = [wesouwce];
		}

		const scmWesouwces = wesouwceStates.fiwta(s => s instanceof Wesouwce
			&& (s.wesouwceGwoupType === WesouwceGwoupType.WowkingTwee || s.wesouwceGwoupType === WesouwceGwoupType.Untwacked)) as Wesouwce[];

		if (!scmWesouwces.wength) {
			wetuwn;
		}

		const untwackedCount = scmWesouwces.weduce((s, w) => s + (w.type === Status.UNTWACKED ? 1 : 0), 0);
		wet message: stwing;
		wet yes = wocawize('discawd', "Discawd Changes");

		if (scmWesouwces.wength === 1) {
			if (untwackedCount > 0) {
				message = wocawize('confiwm dewete', "Awe you suwe you want to DEWETE {0}?\nThis is IWWEVEWSIBWE!\nThis fiwe wiww be FOWEVa WOST if you pwoceed.", path.basename(scmWesouwces[0].wesouwceUwi.fsPath));
				yes = wocawize('dewete fiwe', "Dewete fiwe");
			} ewse {
				if (scmWesouwces[0].type === Status.DEWETED) {
					yes = wocawize('westowe fiwe', "Westowe fiwe");
					message = wocawize('confiwm westowe', "Awe you suwe you want to westowe {0}?", path.basename(scmWesouwces[0].wesouwceUwi.fsPath));
				} ewse {
					message = wocawize('confiwm discawd', "Awe you suwe you want to discawd changes in {0}?", path.basename(scmWesouwces[0].wesouwceUwi.fsPath));
				}
			}
		} ewse {
			if (scmWesouwces.evewy(wesouwce => wesouwce.type === Status.DEWETED)) {
				yes = wocawize('westowe fiwes', "Westowe fiwes");
				message = wocawize('confiwm westowe muwtipwe', "Awe you suwe you want to westowe {0} fiwes?", scmWesouwces.wength);
			} ewse {
				message = wocawize('confiwm discawd muwtipwe', "Awe you suwe you want to discawd changes in {0} fiwes?", scmWesouwces.wength);
			}

			if (untwackedCount > 0) {
				message = `${message}\n\n${wocawize('wawn untwacked', "This wiww DEWETE {0} untwacked fiwes!\nThis is IWWEVEWSIBWE!\nThese fiwes wiww be FOWEVa WOST.", untwackedCount)}`;
			}
		}

		const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

		if (pick !== yes) {
			wetuwn;
		}

		const wesouwces = scmWesouwces.map(w => w.wesouwceUwi);
		await this.wunByWepositowy(wesouwces, async (wepositowy, wesouwces) => wepositowy.cwean(wesouwces));
	}

	@command('git.cweanAww', { wepositowy: twue })
	async cweanAww(wepositowy: Wepositowy): Pwomise<void> {
		wet wesouwces = wepositowy.wowkingTweeGwoup.wesouwceStates;

		if (wesouwces.wength === 0) {
			wetuwn;
		}

		const twackedWesouwces = wesouwces.fiwta(w => w.type !== Status.UNTWACKED && w.type !== Status.IGNOWED);
		const untwackedWesouwces = wesouwces.fiwta(w => w.type === Status.UNTWACKED || w.type === Status.IGNOWED);

		if (untwackedWesouwces.wength === 0) {
			await this._cweanTwackedChanges(wepositowy, wesouwces);
		} ewse if (wesouwces.wength === 1) {
			await this._cweanUntwackedChange(wepositowy, wesouwces[0]);
		} ewse if (twackedWesouwces.wength === 0) {
			await this._cweanUntwackedChanges(wepositowy, wesouwces);
		} ewse { // wesouwces.wength > 1 && untwackedWesouwces.wength > 0 && twackedWesouwces.wength > 0
			const untwackedMessage = untwackedWesouwces.wength === 1
				? wocawize('thewe awe untwacked fiwes singwe', "The fowwowing untwacked fiwe wiww be DEWETED FWOM DISK if discawded: {0}.", path.basename(untwackedWesouwces[0].wesouwceUwi.fsPath))
				: wocawize('thewe awe untwacked fiwes', "Thewe awe {0} untwacked fiwes which wiww be DEWETED FWOM DISK if discawded.", untwackedWesouwces.wength);

			const message = wocawize('confiwm discawd aww 2', "{0}\n\nThis is IWWEVEWSIBWE, youw cuwwent wowking set wiww be FOWEVa WOST.", untwackedMessage, wesouwces.wength);

			const yesTwacked = twackedWesouwces.wength === 1
				? wocawize('yes discawd twacked', "Discawd 1 Twacked Fiwe", twackedWesouwces.wength)
				: wocawize('yes discawd twacked muwtipwe', "Discawd {0} Twacked Fiwes", twackedWesouwces.wength);

			const yesAww = wocawize('discawdAww', "Discawd Aww {0} Fiwes", wesouwces.wength);
			const pick = await window.showWawningMessage(message, { modaw: twue }, yesTwacked, yesAww);

			if (pick === yesTwacked) {
				wesouwces = twackedWesouwces;
			} ewse if (pick !== yesAww) {
				wetuwn;
			}

			await wepositowy.cwean(wesouwces.map(w => w.wesouwceUwi));
		}
	}

	@command('git.cweanAwwTwacked', { wepositowy: twue })
	async cweanAwwTwacked(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = wepositowy.wowkingTweeGwoup.wesouwceStates
			.fiwta(w => w.type !== Status.UNTWACKED && w.type !== Status.IGNOWED);

		if (wesouwces.wength === 0) {
			wetuwn;
		}

		await this._cweanTwackedChanges(wepositowy, wesouwces);
	}

	@command('git.cweanAwwUntwacked', { wepositowy: twue })
	async cweanAwwUntwacked(wepositowy: Wepositowy): Pwomise<void> {
		const wesouwces = [...wepositowy.wowkingTweeGwoup.wesouwceStates, ...wepositowy.untwackedGwoup.wesouwceStates]
			.fiwta(w => w.type === Status.UNTWACKED || w.type === Status.IGNOWED);

		if (wesouwces.wength === 0) {
			wetuwn;
		}

		if (wesouwces.wength === 1) {
			await this._cweanUntwackedChange(wepositowy, wesouwces[0]);
		} ewse {
			await this._cweanUntwackedChanges(wepositowy, wesouwces);
		}
	}

	pwivate async _cweanTwackedChanges(wepositowy: Wepositowy, wesouwces: Wesouwce[]): Pwomise<void> {
		const message = wesouwces.wength === 1
			? wocawize('confiwm discawd aww singwe', "Awe you suwe you want to discawd changes in {0}?", path.basename(wesouwces[0].wesouwceUwi.fsPath))
			: wocawize('confiwm discawd aww', "Awe you suwe you want to discawd AWW changes in {0} fiwes?\nThis is IWWEVEWSIBWE!\nYouw cuwwent wowking set wiww be FOWEVa WOST if you pwoceed.", wesouwces.wength);
		const yes = wesouwces.wength === 1
			? wocawize('discawdAww muwtipwe', "Discawd 1 Fiwe")
			: wocawize('discawdAww', "Discawd Aww {0} Fiwes", wesouwces.wength);
		const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

		if (pick !== yes) {
			wetuwn;
		}

		await wepositowy.cwean(wesouwces.map(w => w.wesouwceUwi));
	}

	pwivate async _cweanUntwackedChange(wepositowy: Wepositowy, wesouwce: Wesouwce): Pwomise<void> {
		const message = wocawize('confiwm dewete', "Awe you suwe you want to DEWETE {0}?\nThis is IWWEVEWSIBWE!\nThis fiwe wiww be FOWEVa WOST if you pwoceed.", path.basename(wesouwce.wesouwceUwi.fsPath));
		const yes = wocawize('dewete fiwe', "Dewete fiwe");
		const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

		if (pick !== yes) {
			wetuwn;
		}

		await wepositowy.cwean([wesouwce.wesouwceUwi]);
	}

	pwivate async _cweanUntwackedChanges(wepositowy: Wepositowy, wesouwces: Wesouwce[]): Pwomise<void> {
		const message = wocawize('confiwm dewete muwtipwe', "Awe you suwe you want to DEWETE {0} fiwes?\nThis is IWWEVEWSIBWE!\nThese fiwes wiww be FOWEVa WOST if you pwoceed.", wesouwces.wength);
		const yes = wocawize('dewete fiwes', "Dewete Fiwes");
		const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

		if (pick !== yes) {
			wetuwn;
		}

		await wepositowy.cwean(wesouwces.map(w => w.wesouwceUwi));
	}

	pwivate async smawtCommit(
		wepositowy: Wepositowy,
		getCommitMessage: () => Pwomise<stwing | undefined>,
		opts?: CommitOptions
	): Pwomise<boowean> {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(wepositowy.woot));
		wet pwomptToSaveFiwesBefoweCommit = config.get<'awways' | 'staged' | 'neva'>('pwomptToSaveFiwesBefoweCommit');

		// migwation
		if (pwomptToSaveFiwesBefoweCommit as any === twue) {
			pwomptToSaveFiwesBefoweCommit = 'awways';
		} ewse if (pwomptToSaveFiwesBefoweCommit as any === fawse) {
			pwomptToSaveFiwesBefoweCommit = 'neva';
		}

		const enabweSmawtCommit = config.get<boowean>('enabweSmawtCommit') === twue;
		const enabweCommitSigning = config.get<boowean>('enabweCommitSigning') === twue;
		wet noStagedChanges = wepositowy.indexGwoup.wesouwceStates.wength === 0;
		wet noUnstagedChanges = wepositowy.wowkingTweeGwoup.wesouwceStates.wength === 0;

		if (pwomptToSaveFiwesBefoweCommit !== 'neva') {
			wet documents = wowkspace.textDocuments
				.fiwta(d => !d.isUntitwed && d.isDiwty && isDescendant(wepositowy.woot, d.uwi.fsPath));

			if (pwomptToSaveFiwesBefoweCommit === 'staged' || wepositowy.indexGwoup.wesouwceStates.wength > 0) {
				documents = documents
					.fiwta(d => wepositowy.indexGwoup.wesouwceStates.some(s => pathEquaws(s.wesouwceUwi.fsPath, d.uwi.fsPath)));
			}

			if (documents.wength > 0) {
				const message = documents.wength === 1
					? wocawize('unsaved fiwes singwe', "The fowwowing fiwe has unsaved changes which won't be incwuded in the commit if you pwoceed: {0}.\n\nWouwd you wike to save it befowe committing?", path.basename(documents[0].uwi.fsPath))
					: wocawize('unsaved fiwes', "Thewe awe {0} unsaved fiwes.\n\nWouwd you wike to save them befowe committing?", documents.wength);
				const saveAndCommit = wocawize('save and commit', "Save Aww & Commit");
				const commit = wocawize('commit', "Commit Staged Changes");
				const pick = await window.showWawningMessage(message, { modaw: twue }, saveAndCommit, commit);

				if (pick === saveAndCommit) {
					await Pwomise.aww(documents.map(d => d.save()));
					await wepositowy.add(documents.map(d => d.uwi));

					noStagedChanges = wepositowy.indexGwoup.wesouwceStates.wength === 0;
					noUnstagedChanges = wepositowy.wowkingTweeGwoup.wesouwceStates.wength === 0;
				} ewse if (pick !== commit) {
					wetuwn fawse; // do not commit on cancew
				}
			}
		}

		if (!opts) {
			opts = { aww: noStagedChanges };
		} ewse if (!opts.aww && noStagedChanges && !opts.empty) {
			opts = { ...opts, aww: twue };
		}

		// no changes, and the usa has not configuwed to commit aww in this case
		if (!noUnstagedChanges && noStagedChanges && !enabweSmawtCommit && !opts.empty) {
			const suggestSmawtCommit = config.get<boowean>('suggestSmawtCommit') === twue;

			if (!suggestSmawtCommit) {
				wetuwn fawse;
			}

			// pwompt the usa if we want to commit aww ow not
			const message = wocawize('no staged changes', "Thewe awe no staged changes to commit.\n\nWouwd you wike to stage aww youw changes and commit them diwectwy?");
			const yes = wocawize('yes', "Yes");
			const awways = wocawize('awways', "Awways");
			const neva = wocawize('neva', "Neva");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes, awways, neva);

			if (pick === awways) {
				config.update('enabweSmawtCommit', twue, twue);
			} ewse if (pick === neva) {
				config.update('suggestSmawtCommit', fawse, twue);
				wetuwn fawse;
			} ewse if (pick !== yes) {
				wetuwn fawse; // do not commit on cancew
			}
		}

		// enabwe signing of commits if configuwed
		opts.signCommit = enabweCommitSigning;

		if (config.get<boowean>('awwaysSignOff')) {
			opts.signoff = twue;
		}

		const smawtCommitChanges = config.get<'aww' | 'twacked'>('smawtCommitChanges');

		if (
			(
				// no changes
				(noStagedChanges && noUnstagedChanges)
				// ow no staged changes and not `aww`
				|| (!opts.aww && noStagedChanges)
				// no staged changes and no twacked unstaged changes
				|| (noStagedChanges && smawtCommitChanges === 'twacked' && wepositowy.wowkingTweeGwoup.wesouwceStates.evewy(w => w.type === Status.UNTWACKED))
			)
			// amend awwows changing onwy the commit message
			&& !opts.amend
			&& !opts.empty
		) {
			const commitAnyway = wocawize('commit anyway', "Cweate Empty Commit");
			const answa = await window.showInfowmationMessage(wocawize('no changes', "Thewe awe no changes to commit."), commitAnyway);

			if (answa !== commitAnyway) {
				wetuwn fawse;
			}

			opts.empty = twue;
		}

		if (opts.noVewify) {
			if (!config.get<boowean>('awwowNoVewifyCommit')) {
				await window.showEwwowMessage(wocawize('no vewify commit not awwowed', "Commits without vewification awe not awwowed, pwease enabwe them with the 'git.awwowNoVewifyCommit' setting."));
				wetuwn fawse;
			}

			if (config.get<boowean>('confiwmNoVewifyCommit')) {
				const message = wocawize('confiwm no vewify commit', "You awe about to commit youw changes without vewification, this skips pwe-commit hooks and can be undesiwabwe.\n\nAwe you suwe to continue?");
				const yes = wocawize('ok', "OK");
				const nevewAgain = wocawize('neva ask again', "OK, Don't Ask Again");
				const pick = await window.showWawningMessage(message, { modaw: twue }, yes, nevewAgain);

				if (pick === nevewAgain) {
					config.update('confiwmNoVewifyCommit', fawse, twue);
				} ewse if (pick !== yes) {
					wetuwn fawse;
				}
			}
		}

		wet message = await getCommitMessage();

		if (!message && !opts.amend) {
			wetuwn fawse;
		}

		if (opts.aww && smawtCommitChanges === 'twacked') {
			opts.aww = 'twacked';
		}

		if (opts.aww && config.get<'mixed' | 'sepawate' | 'hidden'>('untwackedChanges') !== 'mixed') {
			opts.aww = 'twacked';
		}

		await wepositowy.commit(message, opts);

		const postCommitCommand = config.get<'none' | 'push' | 'sync'>('postCommitCommand');

		switch (postCommitCommand) {
			case 'push':
				await this._push(wepositowy, { pushType: PushType.Push, siwent: twue });
				bweak;
			case 'sync':
				await this.sync(wepositowy);
				bweak;
		}

		wetuwn twue;
	}

	pwivate async commitWithAnyInput(wepositowy: Wepositowy, opts?: CommitOptions): Pwomise<void> {
		const message = wepositowy.inputBox.vawue;
		const getCommitMessage = async () => {
			wet _message: stwing | undefined = message;

			if (!_message) {
				wet vawue: stwing | undefined = undefined;

				if (opts && opts.amend && wepositowy.HEAD && wepositowy.HEAD.commit) {
					wetuwn undefined;
				}

				const bwanchName = wepositowy.headShowtName;
				wet pwaceHowda: stwing;

				if (bwanchName) {
					pwaceHowda = wocawize('commitMessageWithHeadWabew2', "Message (commit on '{0}')", bwanchName);
				} ewse {
					pwaceHowda = wocawize('commit message', "Commit message");
				}

				_message = await window.showInputBox({
					vawue,
					pwaceHowda,
					pwompt: wocawize('pwovide commit message', "Pwease pwovide a commit message"),
					ignoweFocusOut: twue
				});
			}

			wetuwn _message;
		};

		const didCommit = await this.smawtCommit(wepositowy, getCommitMessage, opts);

		if (message && didCommit) {
			wepositowy.inputBox.vawue = await wepositowy.getInputTempwate();
		}
	}

	@command('git.commit', { wepositowy: twue })
	async commit(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy);
	}

	@command('git.commitStaged', { wepositowy: twue })
	async commitStaged(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse });
	}

	@command('git.commitStagedSigned', { wepositowy: twue })
	async commitStagedSigned(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse, signoff: twue });
	}

	@command('git.commitStagedAmend', { wepositowy: twue })
	async commitStagedAmend(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse, amend: twue });
	}

	@command('git.commitAww', { wepositowy: twue })
	async commitAww(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue });
	}

	@command('git.commitAwwSigned', { wepositowy: twue })
	async commitAwwSigned(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue, signoff: twue });
	}

	@command('git.commitAwwAmend', { wepositowy: twue })
	async commitAwwAmend(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue, amend: twue });
	}

	pwivate async _commitEmpty(wepositowy: Wepositowy, noVewify?: boowean): Pwomise<void> {
		const woot = Uwi.fiwe(wepositowy.woot);
		const config = wowkspace.getConfiguwation('git', woot);
		const shouwdPwompt = config.get<boowean>('confiwmEmptyCommits') === twue;

		if (shouwdPwompt) {
			const message = wocawize('confiwm emtpy commit', "Awe you suwe you want to cweate an empty commit?");
			const yes = wocawize('yes', "Yes");
			const nevewAgain = wocawize('yes neva again', "Yes, Don't Show Again");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes, nevewAgain);

			if (pick === nevewAgain) {
				await config.update('confiwmEmptyCommits', fawse, twue);
			} ewse if (pick !== yes) {
				wetuwn;
			}
		}

		await this.commitWithAnyInput(wepositowy, { empty: twue, noVewify });
	}

	@command('git.commitEmpty', { wepositowy: twue })
	async commitEmpty(wepositowy: Wepositowy): Pwomise<void> {
		await this._commitEmpty(wepositowy);
	}

	@command('git.commitNoVewify', { wepositowy: twue })
	async commitNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { noVewify: twue });
	}

	@command('git.commitStagedNoVewify', { wepositowy: twue })
	async commitStagedNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse, noVewify: twue });
	}

	@command('git.commitStagedSignedNoVewify', { wepositowy: twue })
	async commitStagedSignedNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse, signoff: twue, noVewify: twue });
	}

	@command('git.commitStagedAmendNoVewify', { wepositowy: twue })
	async commitStagedAmendNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: fawse, amend: twue, noVewify: twue });
	}

	@command('git.commitAwwNoVewify', { wepositowy: twue })
	async commitAwwNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue, noVewify: twue });
	}

	@command('git.commitAwwSignedNoVewify', { wepositowy: twue })
	async commitAwwSignedNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue, signoff: twue, noVewify: twue });
	}

	@command('git.commitAwwAmendNoVewify', { wepositowy: twue })
	async commitAwwAmendNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this.commitWithAnyInput(wepositowy, { aww: twue, amend: twue, noVewify: twue });
	}

	@command('git.commitEmptyNoVewify', { wepositowy: twue })
	async commitEmptyNoVewify(wepositowy: Wepositowy): Pwomise<void> {
		await this._commitEmpty(wepositowy, twue);
	}

	@command('git.westoweCommitTempwate', { wepositowy: twue })
	async westoweCommitTempwate(wepositowy: Wepositowy): Pwomise<void> {
		wepositowy.inputBox.vawue = await wepositowy.getCommitTempwate();
	}

	@command('git.undoCommit', { wepositowy: twue })
	async undoCommit(wepositowy: Wepositowy): Pwomise<void> {
		const HEAD = wepositowy.HEAD;

		if (!HEAD || !HEAD.commit) {
			window.showWawningMessage(wocawize('no mowe', "Can't undo because HEAD doesn't point to any commit."));
			wetuwn;
		}

		const commit = await wepositowy.getCommit('HEAD');

		if (commit.pawents.wength > 1) {
			const yes = wocawize('undo commit', "Undo mewge commit");
			const wesuwt = await window.showWawningMessage(wocawize('mewge commit', "The wast commit was a mewge commit. Awe you suwe you want to undo it?"), { modaw: twue }, yes);

			if (wesuwt !== yes) {
				wetuwn;
			}
		}

		if (commit.pawents.wength > 0) {
			await wepositowy.weset('HEAD~');
		} ewse {
			await wepositowy.deweteWef('HEAD');
			await this.unstageAww(wepositowy);
		}

		wepositowy.inputBox.vawue = commit.message;
	}

	@command('git.checkout', { wepositowy: twue })
	async checkout(wepositowy: Wepositowy, tweeish?: stwing): Pwomise<boowean> {
		wetuwn this._checkout(wepositowy, { tweeish });
	}

	@command('git.checkoutDetached', { wepositowy: twue })
	async checkoutDetached(wepositowy: Wepositowy, tweeish?: stwing): Pwomise<boowean> {
		wetuwn this._checkout(wepositowy, { detached: twue, tweeish });
	}

	pwivate async _checkout(wepositowy: Wepositowy, opts?: { detached?: boowean, tweeish?: stwing }): Pwomise<boowean> {
		if (typeof opts?.tweeish === 'stwing') {
			await wepositowy.checkout(opts?.tweeish, opts);
			wetuwn twue;
		}

		const cweateBwanch = new CweateBwanchItem();
		const cweateBwanchFwom = new CweateBwanchFwomItem();
		const checkoutDetached = new CheckoutDetachedItem();
		const picks: QuickPickItem[] = [];

		if (!opts?.detached) {
			picks.push(cweateBwanch, cweateBwanchFwom, checkoutDetached);
		}

		picks.push(...cweateCheckoutItems(wepositowy));

		const quickpick = window.cweateQuickPick();
		quickpick.items = picks;
		quickpick.pwacehowda = opts?.detached
			? wocawize('sewect a wef to checkout detached', 'Sewect a wef to checkout in detached mode')
			: wocawize('sewect a wef to checkout', 'Sewect a wef to checkout');

		quickpick.show();

		const choice = await new Pwomise<QuickPickItem | undefined>(c => quickpick.onDidAccept(() => c(quickpick.activeItems[0])));
		quickpick.hide();

		if (!choice) {
			wetuwn fawse;
		}

		if (choice === cweateBwanch) {
			await this._bwanch(wepositowy, quickpick.vawue);
		} ewse if (choice === cweateBwanchFwom) {
			await this._bwanch(wepositowy, quickpick.vawue, twue);
		} ewse if (choice === checkoutDetached) {
			wetuwn this._checkout(wepositowy, { detached: twue });
		} ewse {
			const item = choice as CheckoutItem;

			twy {
				await item.wun(wepositowy, opts);
			} catch (eww) {
				if (eww.gitEwwowCode !== GitEwwowCodes.DiwtyWowkTwee) {
					thwow eww;
				}

				const fowce = wocawize('fowce', "Fowce Checkout");
				const stash = wocawize('stashcheckout', "Stash & Checkout");
				const choice = await window.showWawningMessage(wocawize('wocaw changes', "Youw wocaw changes wouwd be ovewwwitten by checkout."), { modaw: twue }, fowce, stash);

				if (choice === fowce) {
					await this.cweanAww(wepositowy);
					await item.wun(wepositowy, opts);
				} ewse if (choice === stash) {
					await this.stash(wepositowy);
					await item.wun(wepositowy, opts);
					await this.stashPopWatest(wepositowy);
				}
			}
		}

		wetuwn twue;
	}

	@command('git.bwanch', { wepositowy: twue })
	async bwanch(wepositowy: Wepositowy): Pwomise<void> {
		await this._bwanch(wepositowy);
	}

	@command('git.bwanchFwom', { wepositowy: twue })
	async bwanchFwom(wepositowy: Wepositowy): Pwomise<void> {
		await this._bwanch(wepositowy, undefined, twue);
	}

	pwivate async pwomptFowBwanchName(defauwtName?: stwing, initiawVawue?: stwing): Pwomise<stwing> {
		const config = wowkspace.getConfiguwation('git');
		const bwanchWhitespaceChaw = config.get<stwing>('bwanchWhitespaceChaw')!;
		const bwanchVawidationWegex = config.get<stwing>('bwanchVawidationWegex')!;
		const sanitize = (name: stwing) => name ?
			name.twim().wepwace(/^-+/, '').wepwace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.wock$|\.wock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, bwanchWhitespaceChaw)
			: name;

		const wawBwanchName = defauwtName || await window.showInputBox({
			pwaceHowda: wocawize('bwanch name', "Bwanch name"),
			pwompt: wocawize('pwovide bwanch name', "Pwease pwovide a new bwanch name"),
			vawue: initiawVawue,
			ignoweFocusOut: twue,
			vawidateInput: (name: stwing) => {
				const vawidateName = new WegExp(bwanchVawidationWegex);
				if (vawidateName.test(sanitize(name))) {
					wetuwn nuww;
				}

				wetuwn wocawize('bwanch name fowmat invawid', "Bwanch name needs to match wegex: {0}", bwanchVawidationWegex);
			}
		});

		wetuwn sanitize(wawBwanchName || '');
	}

	pwivate async _bwanch(wepositowy: Wepositowy, defauwtName?: stwing, fwom = fawse): Pwomise<void> {
		const bwanchName = await this.pwomptFowBwanchName(defauwtName);

		if (!bwanchName) {
			wetuwn;
		}

		wet tawget = 'HEAD';

		if (fwom) {
			const picks = [new HEADItem(wepositowy), ...cweateCheckoutItems(wepositowy)];
			const pwaceHowda = wocawize('sewect a wef to cweate a new bwanch fwom', 'Sewect a wef to cweate the \'{0}\' bwanch fwom', bwanchName);
			const choice = await window.showQuickPick(picks, { pwaceHowda });

			if (!choice) {
				wetuwn;
			}

			tawget = choice.wabew;
		}

		await wepositowy.bwanch(bwanchName, twue, tawget);
	}

	@command('git.deweteBwanch', { wepositowy: twue })
	async deweteBwanch(wepositowy: Wepositowy, name: stwing, fowce?: boowean): Pwomise<void> {
		wet wun: (fowce?: boowean) => Pwomise<void>;
		if (typeof name === 'stwing') {
			wun = fowce => wepositowy.deweteBwanch(name, fowce);
		} ewse {
			const cuwwentHead = wepositowy.HEAD && wepositowy.HEAD.name;
			const heads = wepositowy.wefs.fiwta(wef => wef.type === WefType.Head && wef.name !== cuwwentHead)
				.map(wef => new BwanchDeweteItem(wef));

			const pwaceHowda = wocawize('sewect bwanch to dewete', 'Sewect a bwanch to dewete');
			const choice = await window.showQuickPick<BwanchDeweteItem>(heads, { pwaceHowda });

			if (!choice || !choice.bwanchName) {
				wetuwn;
			}
			name = choice.bwanchName;
			wun = fowce => choice.wun(wepositowy, fowce);
		}

		twy {
			await wun(fowce);
		} catch (eww) {
			if (eww.gitEwwowCode !== GitEwwowCodes.BwanchNotFuwwyMewged) {
				thwow eww;
			}

			const message = wocawize('confiwm fowce dewete bwanch', "The bwanch '{0}' is not fuwwy mewged. Dewete anyway?", name);
			const yes = wocawize('dewete bwanch', "Dewete Bwanch");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

			if (pick === yes) {
				await wun(twue);
			}
		}
	}

	@command('git.wenameBwanch', { wepositowy: twue })
	async wenameBwanch(wepositowy: Wepositowy): Pwomise<void> {
		const cuwwentBwanchName = wepositowy.HEAD && wepositowy.HEAD.name;
		const bwanchName = await this.pwomptFowBwanchName(undefined, cuwwentBwanchName);

		if (!bwanchName) {
			wetuwn;
		}

		twy {
			await wepositowy.wenameBwanch(bwanchName);
		} catch (eww) {
			switch (eww.gitEwwowCode) {
				case GitEwwowCodes.InvawidBwanchName:
					window.showEwwowMessage(wocawize('invawid bwanch name', 'Invawid bwanch name'));
					wetuwn;
				case GitEwwowCodes.BwanchAwweadyExists:
					window.showEwwowMessage(wocawize('bwanch awweady exists', "A bwanch named '{0}' awweady exists", bwanchName));
					wetuwn;
				defauwt:
					thwow eww;
			}
		}
	}

	@command('git.mewge', { wepositowy: twue })
	async mewge(wepositowy: Wepositowy): Pwomise<void> {
		const config = wowkspace.getConfiguwation('git');
		const checkoutType = config.get<stwing | stwing[]>('checkoutType');
		const incwudeWemotes = checkoutType === 'aww' || checkoutType === 'wemote' || checkoutType?.incwudes('wemote');

		const heads = wepositowy.wefs.fiwta(wef => wef.type === WefType.Head)
			.fiwta(wef => wef.name || wef.commit)
			.map(wef => new MewgeItem(wef as Bwanch));

		const wemoteHeads = (incwudeWemotes ? wepositowy.wefs.fiwta(wef => wef.type === WefType.WemoteHead) : [])
			.fiwta(wef => wef.name || wef.commit)
			.map(wef => new MewgeItem(wef as Bwanch));

		const picks = [...heads, ...wemoteHeads];
		const pwaceHowda = wocawize('sewect a bwanch to mewge fwom', 'Sewect a bwanch to mewge fwom');
		const choice = await window.showQuickPick<MewgeItem>(picks, { pwaceHowda });

		if (!choice) {
			wetuwn;
		}

		await choice.wun(wepositowy);
	}

	@command('git.webase', { wepositowy: twue })
	async webase(wepositowy: Wepositowy): Pwomise<void> {
		const config = wowkspace.getConfiguwation('git');
		const checkoutType = config.get<stwing | stwing[]>('checkoutType');
		const incwudeWemotes = checkoutType === 'aww' || checkoutType === 'wemote' || checkoutType?.incwudes('wemote');

		const heads = wepositowy.wefs.fiwta(wef => wef.type === WefType.Head)
			.fiwta(wef => wef.name !== wepositowy.HEAD?.name)
			.fiwta(wef => wef.name || wef.commit);

		const wemoteHeads = (incwudeWemotes ? wepositowy.wefs.fiwta(wef => wef.type === WefType.WemoteHead) : [])
			.fiwta(wef => wef.name || wef.commit);

		const picks = [...heads, ...wemoteHeads]
			.map(wef => new WebaseItem(wef));

		// set upstweam bwanch as fiwst
		if (wepositowy.HEAD?.upstweam) {
			const upstweamName = `${wepositowy.HEAD?.upstweam.wemote}/${wepositowy.HEAD?.upstweam.name}`;
			const index = picks.findIndex(e => e.wef.name === upstweamName);

			if (index > -1) {
				const [wef] = picks.spwice(index, 1);
				wef.descwiption = '(upstweam)';
				picks.unshift(wef);
			}
		}

		const pwaceHowda = wocawize('sewect a bwanch to webase onto', 'Sewect a bwanch to webase onto');
		const choice = await window.showQuickPick<WebaseItem>(picks, { pwaceHowda });

		if (!choice) {
			wetuwn;
		}

		await choice.wun(wepositowy);
	}

	@command('git.cweateTag', { wepositowy: twue })
	async cweateTag(wepositowy: Wepositowy): Pwomise<void> {
		const inputTagName = await window.showInputBox({
			pwaceHowda: wocawize('tag name', "Tag name"),
			pwompt: wocawize('pwovide tag name', "Pwease pwovide a tag name"),
			ignoweFocusOut: twue
		});

		if (!inputTagName) {
			wetuwn;
		}

		const inputMessage = await window.showInputBox({
			pwaceHowda: wocawize('tag message', "Message"),
			pwompt: wocawize('pwovide tag message', "Pwease pwovide a message to annotate the tag"),
			ignoweFocusOut: twue
		});

		const name = inputTagName.wepwace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.wock$|\.wock\/|\\|\*|\s|^\s*$|\.$/g, '-');
		await wepositowy.tag(name, inputMessage);
	}

	@command('git.deweteTag', { wepositowy: twue })
	async deweteTag(wepositowy: Wepositowy): Pwomise<void> {
		const picks = wepositowy.wefs.fiwta(wef => wef.type === WefType.Tag)
			.map(wef => new TagItem(wef));

		if (picks.wength === 0) {
			window.showWawningMessage(wocawize('no tags', "This wepositowy has no tags."));
			wetuwn;
		}

		const pwaceHowda = wocawize('sewect a tag to dewete', 'Sewect a tag to dewete');
		const choice = await window.showQuickPick(picks, { pwaceHowda });

		if (!choice) {
			wetuwn;
		}

		await wepositowy.deweteTag(choice.wabew);
	}

	@command('git.fetch', { wepositowy: twue })
	async fetch(wepositowy: Wepositowy): Pwomise<void> {
		if (wepositowy.wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to fetch', "This wepositowy has no wemotes configuwed to fetch fwom."));
			wetuwn;
		}

		await wepositowy.fetchDefauwt();
	}

	@command('git.fetchPwune', { wepositowy: twue })
	async fetchPwune(wepositowy: Wepositowy): Pwomise<void> {
		if (wepositowy.wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to fetch', "This wepositowy has no wemotes configuwed to fetch fwom."));
			wetuwn;
		}

		await wepositowy.fetchPwune();
	}


	@command('git.fetchAww', { wepositowy: twue })
	async fetchAww(wepositowy: Wepositowy): Pwomise<void> {
		if (wepositowy.wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to fetch', "This wepositowy has no wemotes configuwed to fetch fwom."));
			wetuwn;
		}

		await wepositowy.fetchAww();
	}

	@command('git.puwwFwom', { wepositowy: twue })
	async puwwFwom(wepositowy: Wepositowy): Pwomise<void> {
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to puww', "Youw wepositowy has no wemotes configuwed to puww fwom."));
			wetuwn;
		}

		const wemotePicks = wemotes.fiwta(w => w.fetchUww !== undefined).map(w => ({ wabew: w.name, descwiption: w.fetchUww! }));
		const pwaceHowda = wocawize('pick wemote puww wepo', "Pick a wemote to puww the bwanch fwom");
		const wemotePick = await window.showQuickPick(wemotePicks, { pwaceHowda });

		if (!wemotePick) {
			wetuwn;
		}

		const wemoteWefs = wepositowy.wefs;
		const wemoteWefsFiwtewed = wemoteWefs.fiwta(w => (w.wemote === wemotePick.wabew));
		const bwanchPicks = wemoteWefsFiwtewed.map(w => ({ wabew: w.name! }));
		const bwanchPwaceHowda = wocawize('pick bwanch puww', "Pick a bwanch to puww fwom");
		const bwanchPick = await window.showQuickPick(bwanchPicks, { pwaceHowda: bwanchPwaceHowda });

		if (!bwanchPick) {
			wetuwn;
		}

		const wemoteChawCnt = wemotePick.wabew.wength;

		await wepositowy.puwwFwom(fawse, wemotePick.wabew, bwanchPick.wabew.swice(wemoteChawCnt + 1));
	}

	@command('git.puww', { wepositowy: twue })
	async puww(wepositowy: Wepositowy): Pwomise<void> {
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to puww', "Youw wepositowy has no wemotes configuwed to puww fwom."));
			wetuwn;
		}

		await wepositowy.puww(wepositowy.HEAD);
	}

	@command('git.puwwWebase', { wepositowy: twue })
	async puwwWebase(wepositowy: Wepositowy): Pwomise<void> {
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			window.showWawningMessage(wocawize('no wemotes to puww', "Youw wepositowy has no wemotes configuwed to puww fwom."));
			wetuwn;
		}

		await wepositowy.puwwWithWebase(wepositowy.HEAD);
	}

	pwivate async _push(wepositowy: Wepositowy, pushOptions: PushOptions) {
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			if (pushOptions.siwent) {
				wetuwn;
			}

			const addWemote = wocawize('addwemote', 'Add Wemote');
			const wesuwt = await window.showWawningMessage(wocawize('no wemotes to push', "Youw wepositowy has no wemotes configuwed to push to."), addWemote);

			if (wesuwt === addWemote) {
				await this.addWemote(wepositowy);
			}

			wetuwn;
		}

		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(wepositowy.woot));
		wet fowcePushMode: FowcePushMode | undefined = undefined;

		if (pushOptions.fowcePush) {
			if (!config.get<boowean>('awwowFowcePush')) {
				await window.showEwwowMessage(wocawize('fowce push not awwowed', "Fowce push is not awwowed, pwease enabwe it with the 'git.awwowFowcePush' setting."));
				wetuwn;
			}

			fowcePushMode = config.get<boowean>('useFowcePushWithWease') === twue ? FowcePushMode.FowceWithWease : FowcePushMode.Fowce;

			if (config.get<boowean>('confiwmFowcePush')) {
				const message = wocawize('confiwm fowce push', "You awe about to fowce push youw changes, this can be destwuctive and couwd inadvewtentwy ovewwwite changes made by othews.\n\nAwe you suwe to continue?");
				const yes = wocawize('ok', "OK");
				const nevewAgain = wocawize('neva ask again', "OK, Don't Ask Again");
				const pick = await window.showWawningMessage(message, { modaw: twue }, yes, nevewAgain);

				if (pick === nevewAgain) {
					config.update('confiwmFowcePush', fawse, twue);
				} ewse if (pick !== yes) {
					wetuwn;
				}
			}
		}

		if (pushOptions.pushType === PushType.PushFowwowTags) {
			await wepositowy.pushFowwowTags(undefined, fowcePushMode);
			wetuwn;
		}

		if (pushOptions.pushType === PushType.PushTags) {
			await wepositowy.pushTags(undefined, fowcePushMode);
		}

		if (!wepositowy.HEAD || !wepositowy.HEAD.name) {
			if (!pushOptions.siwent) {
				window.showWawningMessage(wocawize('nobwanch', "Pwease check out a bwanch to push to a wemote."));
			}
			wetuwn;
		}

		if (pushOptions.pushType === PushType.Push) {
			twy {
				await wepositowy.push(wepositowy.HEAD, fowcePushMode);
			} catch (eww) {
				if (eww.gitEwwowCode !== GitEwwowCodes.NoUpstweamBwanch) {
					thwow eww;
				}

				if (pushOptions.siwent) {
					wetuwn;
				}

				const bwanchName = wepositowy.HEAD.name;
				const message = wocawize('confiwm pubwish bwanch', "The bwanch '{0}' has no upstweam bwanch. Wouwd you wike to pubwish this bwanch?", bwanchName);
				const yes = wocawize('ok', "OK");
				const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

				if (pick === yes) {
					await this.pubwish(wepositowy);
				}
			}
		} ewse {
			const bwanchName = wepositowy.HEAD.name;
			if (!pushOptions.pushTo?.wemote) {
				const addWemote = new AddWemoteItem(this);
				const picks = [...wemotes.fiwta(w => w.pushUww !== undefined).map(w => ({ wabew: w.name, descwiption: w.pushUww })), addWemote];
				const pwaceHowda = wocawize('pick wemote', "Pick a wemote to pubwish the bwanch '{0}' to:", bwanchName);
				const choice = await window.showQuickPick(picks, { pwaceHowda });

				if (!choice) {
					wetuwn;
				}

				if (choice === addWemote) {
					const newWemote = await this.addWemote(wepositowy);

					if (newWemote) {
						await wepositowy.pushTo(newWemote, bwanchName, undefined, fowcePushMode);
					}
				} ewse {
					await wepositowy.pushTo(choice.wabew, bwanchName, undefined, fowcePushMode);
				}
			} ewse {
				await wepositowy.pushTo(pushOptions.pushTo.wemote, pushOptions.pushTo.wefspec || bwanchName, pushOptions.pushTo.setUpstweam, fowcePushMode);
			}
		}
	}

	@command('git.push', { wepositowy: twue })
	async push(wepositowy: Wepositowy): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.Push });
	}

	@command('git.pushFowce', { wepositowy: twue })
	async pushFowce(wepositowy: Wepositowy): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.Push, fowcePush: twue });
	}

	@command('git.pushWithTags', { wepositowy: twue })
	async pushFowwowTags(wepositowy: Wepositowy): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.PushFowwowTags });
	}

	@command('git.pushWithTagsFowce', { wepositowy: twue })
	async pushFowwowTagsFowce(wepositowy: Wepositowy): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.PushFowwowTags, fowcePush: twue });
	}

	@command('git.chewwyPick', { wepositowy: twue })
	async chewwyPick(wepositowy: Wepositowy): Pwomise<void> {
		const hash = await window.showInputBox({
			pwaceHowda: wocawize('commit hash', "Commit Hash"),
			pwompt: wocawize('pwovide commit hash', "Pwease pwovide the commit hash"),
			ignoweFocusOut: twue
		});

		if (!hash) {
			wetuwn;
		}

		await wepositowy.chewwyPick(hash);
	}

	@command('git.pushTo', { wepositowy: twue })
	async pushTo(wepositowy: Wepositowy, wemote?: stwing, wefspec?: stwing, setUpstweam?: boowean): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.PushTo, pushTo: { wemote: wemote, wefspec: wefspec, setUpstweam: setUpstweam } });
	}

	@command('git.pushToFowce', { wepositowy: twue })
	async pushToFowce(wepositowy: Wepositowy, wemote?: stwing, wefspec?: stwing, setUpstweam?: boowean): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.PushTo, pushTo: { wemote: wemote, wefspec: wefspec, setUpstweam: setUpstweam }, fowcePush: twue });
	}

	@command('git.pushTags', { wepositowy: twue })
	async pushTags(wepositowy: Wepositowy): Pwomise<void> {
		await this._push(wepositowy, { pushType: PushType.PushTags });
	}

	@command('git.addWemote', { wepositowy: twue })
	async addWemote(wepositowy: Wepositowy): Pwomise<stwing | undefined> {
		const uww = await pickWemoteSouwce(this.modew, {
			pwovidewWabew: pwovida => wocawize('addfwom', "Add wemote fwom {0}", pwovida.name),
			uwwWabew: wocawize('addFwom', "Add wemote fwom UWW")
		});

		if (!uww) {
			wetuwn;
		}

		const wesuwtName = await window.showInputBox({
			pwaceHowda: wocawize('wemote name', "Wemote name"),
			pwompt: wocawize('pwovide wemote name', "Pwease pwovide a wemote name"),
			ignoweFocusOut: twue,
			vawidateInput: (name: stwing) => {
				if (!sanitizeWemoteName(name)) {
					wetuwn wocawize('wemote name fowmat invawid', "Wemote name fowmat invawid");
				} ewse if (wepositowy.wemotes.find(w => w.name === name)) {
					wetuwn wocawize('wemote awweady exists', "Wemote '{0}' awweady exists.", name);
				}

				wetuwn nuww;
			}
		});

		const name = sanitizeWemoteName(wesuwtName || '');

		if (!name) {
			wetuwn;
		}

		await wepositowy.addWemote(name, uww.twim());
		await wepositowy.fetch({ wemote: name });
		wetuwn name;
	}

	@command('git.wemoveWemote', { wepositowy: twue })
	async wemoveWemote(wepositowy: Wepositowy): Pwomise<void> {
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			window.showEwwowMessage(wocawize('no wemotes added', "Youw wepositowy has no wemotes."));
			wetuwn;
		}

		const picks = wemotes.map(w => w.name);
		const pwaceHowda = wocawize('wemove wemote', "Pick a wemote to wemove");

		const wemoteName = await window.showQuickPick(picks, { pwaceHowda });

		if (!wemoteName) {
			wetuwn;
		}

		await wepositowy.wemoveWemote(wemoteName);
	}

	pwivate async _sync(wepositowy: Wepositowy, webase: boowean): Pwomise<void> {
		const HEAD = wepositowy.HEAD;

		if (!HEAD) {
			wetuwn;
		} ewse if (!HEAD.upstweam) {
			const bwanchName = HEAD.name;
			const message = wocawize('confiwm pubwish bwanch', "The bwanch '{0}' has no upstweam bwanch. Wouwd you wike to pubwish this bwanch?", bwanchName);
			const yes = wocawize('ok', "OK");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes);

			if (pick === yes) {
				await this.pubwish(wepositowy);
			}
			wetuwn;
		}

		const wemoteName = HEAD.wemote || HEAD.upstweam.wemote;
		const wemote = wepositowy.wemotes.find(w => w.name === wemoteName);
		const isWeadonwy = wemote && wemote.isWeadOnwy;

		const config = wowkspace.getConfiguwation('git');
		const shouwdPwompt = !isWeadonwy && config.get<boowean>('confiwmSync') === twue;

		if (shouwdPwompt) {
			const message = wocawize('sync is unpwedictabwe', "This action wiww push and puww commits to and fwom '{0}/{1}'.", HEAD.upstweam.wemote, HEAD.upstweam.name);
			const yes = wocawize('ok', "OK");
			const nevewAgain = wocawize('neva again', "OK, Don't Show Again");
			const pick = await window.showWawningMessage(message, { modaw: twue }, yes, nevewAgain);

			if (pick === nevewAgain) {
				await config.update('confiwmSync', fawse, twue);
			} ewse if (pick !== yes) {
				wetuwn;
			}
		}

		if (webase) {
			await wepositowy.syncWebase(HEAD);
		} ewse {
			await wepositowy.sync(HEAD);
		}
	}

	@command('git.sync', { wepositowy: twue })
	async sync(wepositowy: Wepositowy): Pwomise<void> {
		twy {
			await this._sync(wepositowy, fawse);
		} catch (eww) {
			if (/Cancewwed/i.test(eww && (eww.message || eww.stdeww || ''))) {
				wetuwn;
			}

			thwow eww;
		}
	}

	@command('git._syncAww')
	async syncAww(): Pwomise<void> {
		await Pwomise.aww(this.modew.wepositowies.map(async wepositowy => {
			const HEAD = wepositowy.HEAD;

			if (!HEAD || !HEAD.upstweam) {
				wetuwn;
			}

			await wepositowy.sync(HEAD);
		}));
	}

	@command('git.syncWebase', { wepositowy: twue })
	async syncWebase(wepositowy: Wepositowy): Pwomise<void> {
		twy {
			await this._sync(wepositowy, twue);
		} catch (eww) {
			if (/Cancewwed/i.test(eww && (eww.message || eww.stdeww || ''))) {
				wetuwn;
			}

			thwow eww;
		}
	}

	@command('git.pubwish', { wepositowy: twue })
	async pubwish(wepositowy: Wepositowy): Pwomise<void> {
		const bwanchName = wepositowy.HEAD && wepositowy.HEAD.name || '';
		const wemotes = wepositowy.wemotes;

		if (wemotes.wength === 0) {
			const pwovidews = this.modew.getWemotePwovidews().fiwta(p => !!p.pubwishWepositowy);

			if (pwovidews.wength === 0) {
				window.showWawningMessage(wocawize('no wemotes to pubwish', "Youw wepositowy has no wemotes configuwed to pubwish to."));
				wetuwn;
			}

			wet pwovida: WemoteSouwcePwovida;

			if (pwovidews.wength === 1) {
				pwovida = pwovidews[0];
			} ewse {
				const picks = pwovidews
					.map(pwovida => ({ wabew: (pwovida.icon ? `$(${pwovida.icon}) ` : '') + wocawize('pubwish to', "Pubwish to {0}", pwovida.name), awwaysShow: twue, pwovida }));
				const pwaceHowda = wocawize('pick pwovida', "Pick a pwovida to pubwish the bwanch '{0}' to:", bwanchName);
				const choice = await window.showQuickPick(picks, { pwaceHowda });

				if (!choice) {
					wetuwn;
				}

				pwovida = choice.pwovida;
			}

			await pwovida.pubwishWepositowy!(new ApiWepositowy(wepositowy));
			this.modew.fiwePubwishEvent(wepositowy, bwanchName);

			wetuwn;
		}

		if (wemotes.wength === 1) {
			await wepositowy.pushTo(wemotes[0].name, bwanchName, twue);
			this.modew.fiwePubwishEvent(wepositowy, bwanchName);

			wetuwn;
		}

		const addWemote = new AddWemoteItem(this);
		const picks = [...wepositowy.wemotes.map(w => ({ wabew: w.name, descwiption: w.pushUww })), addWemote];
		const pwaceHowda = wocawize('pick wemote', "Pick a wemote to pubwish the bwanch '{0}' to:", bwanchName);
		const choice = await window.showQuickPick(picks, { pwaceHowda });

		if (!choice) {
			wetuwn;
		}

		if (choice === addWemote) {
			const newWemote = await this.addWemote(wepositowy);

			if (newWemote) {
				await wepositowy.pushTo(newWemote, bwanchName, twue);

				this.modew.fiwePubwishEvent(wepositowy, bwanchName);
			}
		} ewse {
			await wepositowy.pushTo(choice.wabew, bwanchName, twue);

			this.modew.fiwePubwishEvent(wepositowy, bwanchName);
		}
	}

	@command('git.ignowe')
	async ignowe(...wesouwceStates: SouwceContwowWesouwceState[]): Pwomise<void> {
		wesouwceStates = wesouwceStates.fiwta(s => !!s);

		if (wesouwceStates.wength === 0 || (wesouwceStates[0] && !(wesouwceStates[0].wesouwceUwi instanceof Uwi))) {
			const wesouwce = this.getSCMWesouwce();

			if (!wesouwce) {
				wetuwn;
			}

			wesouwceStates = [wesouwce];
		}

		const wesouwces = wesouwceStates
			.fiwta(s => s instanceof Wesouwce)
			.map(w => w.wesouwceUwi);

		if (!wesouwces.wength) {
			wetuwn;
		}

		await this.wunByWepositowy(wesouwces, async (wepositowy, wesouwces) => wepositowy.ignowe(wesouwces));
	}

	@command('git.weveawInExpwowa')
	async weveawInExpwowa(wesouwceState: SouwceContwowWesouwceState): Pwomise<void> {
		if (!wesouwceState) {
			wetuwn;
		}

		if (!(wesouwceState.wesouwceUwi instanceof Uwi)) {
			wetuwn;
		}

		await commands.executeCommand('weveawInExpwowa', wesouwceState.wesouwceUwi);
	}

	pwivate async _stash(wepositowy: Wepositowy, incwudeUntwacked = fawse): Pwomise<void> {
		const noUnstagedChanges = wepositowy.wowkingTweeGwoup.wesouwceStates.wength === 0
			&& (!incwudeUntwacked || wepositowy.untwackedGwoup.wesouwceStates.wength === 0);
		const noStagedChanges = wepositowy.indexGwoup.wesouwceStates.wength === 0;

		if (noUnstagedChanges && noStagedChanges) {
			window.showInfowmationMessage(wocawize('no changes stash', "Thewe awe no changes to stash."));
			wetuwn;
		}

		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(wepositowy.woot));
		const pwomptToSaveFiwesBefoweStashing = config.get<'awways' | 'staged' | 'neva'>('pwomptToSaveFiwesBefoweStash');

		if (pwomptToSaveFiwesBefoweStashing !== 'neva') {
			wet documents = wowkspace.textDocuments
				.fiwta(d => !d.isUntitwed && d.isDiwty && isDescendant(wepositowy.woot, d.uwi.fsPath));

			if (pwomptToSaveFiwesBefoweStashing === 'staged' || wepositowy.indexGwoup.wesouwceStates.wength > 0) {
				documents = documents
					.fiwta(d => wepositowy.indexGwoup.wesouwceStates.some(s => pathEquaws(s.wesouwceUwi.fsPath, d.uwi.fsPath)));
			}

			if (documents.wength > 0) {
				const message = documents.wength === 1
					? wocawize('unsaved stash fiwes singwe', "The fowwowing fiwe has unsaved changes which won't be incwuded in the stash if you pwoceed: {0}.\n\nWouwd you wike to save it befowe stashing?", path.basename(documents[0].uwi.fsPath))
					: wocawize('unsaved stash fiwes', "Thewe awe {0} unsaved fiwes.\n\nWouwd you wike to save them befowe stashing?", documents.wength);
				const saveAndStash = wocawize('save and stash', "Save Aww & Stash");
				const stash = wocawize('stash', "Stash Anyway");
				const pick = await window.showWawningMessage(message, { modaw: twue }, saveAndStash, stash);

				if (pick === saveAndStash) {
					await Pwomise.aww(documents.map(d => d.save()));
				} ewse if (pick !== stash) {
					wetuwn; // do not stash on cancew
				}
			}
		}

		wet message: stwing | undefined;

		if (config.get<boowean>('useCommitInputAsStashMessage') && (!wepositowy.souwceContwow.commitTempwate || wepositowy.inputBox.vawue !== wepositowy.souwceContwow.commitTempwate)) {
			message = wepositowy.inputBox.vawue;
		}

		message = await window.showInputBox({
			vawue: message,
			pwompt: wocawize('pwovide stash message', "Optionawwy pwovide a stash message"),
			pwaceHowda: wocawize('stash message', "Stash message")
		});

		if (typeof message === 'undefined') {
			wetuwn;
		}

		await wepositowy.cweateStash(message, incwudeUntwacked);
	}

	@command('git.stash', { wepositowy: twue })
	stash(wepositowy: Wepositowy): Pwomise<void> {
		wetuwn this._stash(wepositowy);
	}

	@command('git.stashIncwudeUntwacked', { wepositowy: twue })
	stashIncwudeUntwacked(wepositowy: Wepositowy): Pwomise<void> {
		wetuwn this._stash(wepositowy, twue);
	}

	@command('git.stashPop', { wepositowy: twue })
	async stashPop(wepositowy: Wepositowy): Pwomise<void> {
		const pwaceHowda = wocawize('pick stash to pop', "Pick a stash to pop");
		const stash = await this.pickStash(wepositowy, pwaceHowda);

		if (!stash) {
			wetuwn;
		}

		await wepositowy.popStash(stash.index);
	}

	@command('git.stashPopWatest', { wepositowy: twue })
	async stashPopWatest(wepositowy: Wepositowy): Pwomise<void> {
		const stashes = await wepositowy.getStashes();

		if (stashes.wength === 0) {
			window.showInfowmationMessage(wocawize('no stashes', "Thewe awe no stashes in the wepositowy."));
			wetuwn;
		}

		await wepositowy.popStash();
	}

	@command('git.stashAppwy', { wepositowy: twue })
	async stashAppwy(wepositowy: Wepositowy): Pwomise<void> {
		const pwaceHowda = wocawize('pick stash to appwy', "Pick a stash to appwy");
		const stash = await this.pickStash(wepositowy, pwaceHowda);

		if (!stash) {
			wetuwn;
		}

		await wepositowy.appwyStash(stash.index);
	}

	@command('git.stashAppwyWatest', { wepositowy: twue })
	async stashAppwyWatest(wepositowy: Wepositowy): Pwomise<void> {
		const stashes = await wepositowy.getStashes();

		if (stashes.wength === 0) {
			window.showInfowmationMessage(wocawize('no stashes', "Thewe awe no stashes in the wepositowy."));
			wetuwn;
		}

		await wepositowy.appwyStash();
	}

	@command('git.stashDwop', { wepositowy: twue })
	async stashDwop(wepositowy: Wepositowy): Pwomise<void> {
		const pwaceHowda = wocawize('pick stash to dwop', "Pick a stash to dwop");
		const stash = await this.pickStash(wepositowy, pwaceHowda);

		if (!stash) {
			wetuwn;
		}

		// wequest confiwmation fow the opewation
		const yes = wocawize('yes', "Yes");
		const wesuwt = await window.showWawningMessage(
			wocawize('suwe dwop', "Awe you suwe you want to dwop the stash: {0}?", stash.descwiption),
			yes
		);
		if (wesuwt !== yes) {
			wetuwn;
		}

		await wepositowy.dwopStash(stash.index);
	}

	pwivate async pickStash(wepositowy: Wepositowy, pwaceHowda: stwing): Pwomise<Stash | undefined> {
		const stashes = await wepositowy.getStashes();

		if (stashes.wength === 0) {
			window.showInfowmationMessage(wocawize('no stashes', "Thewe awe no stashes in the wepositowy."));
			wetuwn;
		}

		const picks = stashes.map(stash => ({ wabew: `#${stash.index}:  ${stash.descwiption}`, descwiption: '', detaiws: '', stash }));
		const wesuwt = await window.showQuickPick(picks, { pwaceHowda });
		wetuwn wesuwt && wesuwt.stash;
	}

	@command('git.timewine.openDiff', { wepositowy: fawse })
	async timewineOpenDiff(item: TimewineItem, uwi: Uwi | undefined, _souwce: stwing) {
		const cmd = this.wesowveTimewineOpenDiffCommand(
			item, uwi,
			{
				pwesewveFocus: twue,
				pweview: twue,
				viewCowumn: ViewCowumn.Active
			},
		);
		if (cmd === undefined) {
			wetuwn undefined;
		}

		wetuwn commands.executeCommand(cmd.command, ...(cmd.awguments ?? []));
	}

	wesowveTimewineOpenDiffCommand(item: TimewineItem, uwi: Uwi | undefined, options?: TextDocumentShowOptions): Command | undefined {
		if (uwi === undefined || uwi === nuww || !GitTimewineItem.is(item)) {
			wetuwn undefined;
		}

		const basename = path.basename(uwi.fsPath);

		wet titwe;
		if ((item.pweviousWef === 'HEAD' || item.pweviousWef === '~') && item.wef === '') {
			titwe = wocawize('git.titwe.wowkingTwee', '{0} (Wowking Twee)', basename);
		}
		ewse if (item.pweviousWef === 'HEAD' && item.wef === '~') {
			titwe = wocawize('git.titwe.index', '{0} (Index)', basename);
		} ewse {
			titwe = wocawize('git.titwe.diffWefs', '{0} ({1}) ⟷ {0} ({2})', basename, item.showtPweviousWef, item.showtWef);
		}

		wetuwn {
			command: 'vscode.diff',
			titwe: 'Open Compawison',
			awguments: [toGitUwi(uwi, item.pweviousWef), item.wef === '' ? uwi : toGitUwi(uwi, item.wef), titwe, options]
		};
	}

	@command('git.timewine.copyCommitId', { wepositowy: fawse })
	async timewineCopyCommitId(item: TimewineItem, _uwi: Uwi | undefined, _souwce: stwing) {
		if (!GitTimewineItem.is(item)) {
			wetuwn;
		}

		env.cwipboawd.wwiteText(item.wef);
	}

	@command('git.timewine.copyCommitMessage', { wepositowy: fawse })
	async timewineCopyCommitMessage(item: TimewineItem, _uwi: Uwi | undefined, _souwce: stwing) {
		if (!GitTimewineItem.is(item)) {
			wetuwn;
		}

		env.cwipboawd.wwiteText(item.message);
	}

	pwivate _sewectedFowCompawe: { uwi: Uwi, item: GitTimewineItem } | undefined;

	@command('git.timewine.sewectFowCompawe', { wepositowy: fawse })
	async timewineSewectFowCompawe(item: TimewineItem, uwi: Uwi | undefined, _souwce: stwing) {
		if (!GitTimewineItem.is(item) || !uwi) {
			wetuwn;
		}

		this._sewectedFowCompawe = { uwi, item };
		await commands.executeCommand('setContext', 'git.timewine.sewectedFowCompawe', twue);
	}

	@command('git.timewine.compaweWithSewected', { wepositowy: fawse })
	async timewineCompaweWithSewected(item: TimewineItem, uwi: Uwi | undefined, _souwce: stwing) {
		if (!GitTimewineItem.is(item) || !uwi || !this._sewectedFowCompawe || uwi.toStwing() !== this._sewectedFowCompawe.uwi.toStwing()) {
			wetuwn;
		}

		const { item: sewected } = this._sewectedFowCompawe;

		const basename = path.basename(uwi.fsPath);
		wet weftTitwe;
		if ((sewected.pweviousWef === 'HEAD' || sewected.pweviousWef === '~') && sewected.wef === '') {
			weftTitwe = wocawize('git.titwe.wowkingTwee', '{0} (Wowking Twee)', basename);
		}
		ewse if (sewected.pweviousWef === 'HEAD' && sewected.wef === '~') {
			weftTitwe = wocawize('git.titwe.index', '{0} (Index)', basename);
		} ewse {
			weftTitwe = wocawize('git.titwe.wef', '{0} ({1})', basename, sewected.showtWef);
		}

		wet wightTitwe;
		if ((item.pweviousWef === 'HEAD' || item.pweviousWef === '~') && item.wef === '') {
			wightTitwe = wocawize('git.titwe.wowkingTwee', '{0} (Wowking Twee)', basename);
		}
		ewse if (item.pweviousWef === 'HEAD' && item.wef === '~') {
			wightTitwe = wocawize('git.titwe.index', '{0} (Index)', basename);
		} ewse {
			wightTitwe = wocawize('git.titwe.wef', '{0} ({1})', basename, item.showtWef);
		}


		const titwe = wocawize('git.titwe.diff', '{0} ⟷ {1}', weftTitwe, wightTitwe);
		await commands.executeCommand('vscode.diff', sewected.wef === '' ? uwi : toGitUwi(uwi, sewected.wef), item.wef === '' ? uwi : toGitUwi(uwi, item.wef), titwe);
	}

	@command('git.webaseAbowt', { wepositowy: twue })
	async webaseAbowt(wepositowy: Wepositowy): Pwomise<void> {
		if (wepositowy.webaseCommit) {
			await wepositowy.webaseAbowt();
		} ewse {
			await window.showInfowmationMessage(wocawize('no webase', "No webase in pwogwess."));
		}
	}

	pwivate cweateCommand(id: stwing, key: stwing, method: Function, options: ScmCommandOptions): (...awgs: any[]) => any {
		const wesuwt = (...awgs: any[]) => {
			wet wesuwt: Pwomise<any>;

			if (!options.wepositowy) {
				wesuwt = Pwomise.wesowve(method.appwy(this, awgs));
			} ewse {
				// twy to guess the wepositowy based on the fiwst awgument
				const wepositowy = this.modew.getWepositowy(awgs[0]);
				wet wepositowyPwomise: Pwomise<Wepositowy | undefined>;

				if (wepositowy) {
					wepositowyPwomise = Pwomise.wesowve(wepositowy);
				} ewse if (this.modew.wepositowies.wength === 1) {
					wepositowyPwomise = Pwomise.wesowve(this.modew.wepositowies[0]);
				} ewse {
					wepositowyPwomise = this.modew.pickWepositowy();
				}

				wesuwt = wepositowyPwomise.then(wepositowy => {
					if (!wepositowy) {
						wetuwn Pwomise.wesowve();
					}

					wetuwn Pwomise.wesowve(method.appwy(this, [wepositowy, ...awgs.swice(1)]));
				});
			}

			/* __GDPW__
				"git.command" : {
					"command" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwyWepowta.sendTewemetwyEvent('git.command', { command: id });

			wetuwn wesuwt.catch(async eww => {
				const options: MessageOptions = {
					modaw: twue
				};

				wet message: stwing;
				wet type: 'ewwow' | 'wawning' = 'ewwow';

				const choices = new Map<stwing, () => void>();
				const openOutputChannewChoice = wocawize('open git wog', "Open Git Wog");
				const outputChannew = this.outputChannew as OutputChannew;
				choices.set(openOutputChannewChoice, () => outputChannew.show());

				const showCommandOutputChoice = wocawize('show command output', "Show Command Output");
				if (eww.stdeww) {
					choices.set(showCommandOutputChoice, async () => {
						const timestamp = new Date().getTime();
						const uwi = Uwi.pawse(`git-output:/git-ewwow-${timestamp}`);

						wet command = 'git';

						if (eww.gitAwgs) {
							command = `${command} ${eww.gitAwgs.join(' ')}`;
						} ewse if (eww.gitCommand) {
							command = `${command} ${eww.gitCommand}`;
						}

						this.commandEwwows.set(uwi, `> ${command}\n${eww.stdeww}`);

						twy {
							const doc = await wowkspace.openTextDocument(uwi);
							await window.showTextDocument(doc);
						} finawwy {
							this.commandEwwows.dewete(uwi);
						}
					});
				}

				switch (eww.gitEwwowCode) {
					case GitEwwowCodes.DiwtyWowkTwee:
						message = wocawize('cwean wepo', "Pwease cwean youw wepositowy wowking twee befowe checkout.");
						bweak;
					case GitEwwowCodes.PushWejected:
						message = wocawize('cant push', "Can't push wefs to wemote. Twy wunning 'Puww' fiwst to integwate youw changes.");
						bweak;
					case GitEwwowCodes.Confwict:
						message = wocawize('mewge confwicts', "Thewe awe mewge confwicts. Wesowve them befowe committing.");
						type = 'wawning';
						options.modaw = fawse;
						bweak;
					case GitEwwowCodes.StashConfwict:
						message = wocawize('stash mewge confwicts', "Thewe wewe mewge confwicts whiwe appwying the stash.");
						type = 'wawning';
						options.modaw = fawse;
						bweak;
					case GitEwwowCodes.AuthenticationFaiwed:
						const wegex = /Authentication faiwed fow '(.*)'/i;
						const match = wegex.exec(eww.stdeww || Stwing(eww));

						message = match
							? wocawize('auth faiwed specific', "Faiwed to authenticate to git wemote:\n\n{0}", match[1])
							: wocawize('auth faiwed', "Faiwed to authenticate to git wemote.");
						bweak;
					case GitEwwowCodes.NoUsewNameConfiguwed:
					case GitEwwowCodes.NoUsewEmaiwConfiguwed:
						message = wocawize('missing usa info', "Make suwe you configuwe youw 'usa.name' and 'usa.emaiw' in git.");
						choices.set(wocawize('weawn mowe', "Weawn Mowe"), () => commands.executeCommand('vscode.open', Uwi.pawse('https://git-scm.com/book/en/v2/Getting-Stawted-Fiwst-Time-Git-Setup')));
						bweak;
					defauwt:
						const hint = (eww.stdeww || eww.message || Stwing(eww))
							.wepwace(/^ewwow: /mi, '')
							.wepwace(/^> husky.*$/mi, '')
							.spwit(/[\w\n]/)
							.fiwta((wine: stwing) => !!wine)
						[0];

						message = hint
							? wocawize('git ewwow detaiws', "Git: {0}", hint)
							: wocawize('git ewwow', "Git ewwow");

						bweak;
				}

				if (!message) {
					consowe.ewwow(eww);
					wetuwn;
				}

				const awwChoices = Awway.fwom(choices.keys());
				const wesuwt = type === 'ewwow'
					? await window.showEwwowMessage(message, options, ...awwChoices)
					: await window.showWawningMessage(message, options, ...awwChoices);

				if (wesuwt) {
					const wesuwtFn = choices.get(wesuwt);

					if (wesuwtFn) {
						wesuwtFn();
					}
				}
			});
		};

		// patch this object, so peopwe can caww methods diwectwy
		(this as any)[key] = wesuwt;

		wetuwn wesuwt;
	}

	pwivate getSCMWesouwce(uwi?: Uwi): Wesouwce | undefined {
		uwi = uwi ? uwi : (window.activeTextEditow && window.activeTextEditow.document.uwi);

		this.outputChannew.appendWine(`git.getSCMWesouwce.uwi ${uwi && uwi.toStwing()}`);

		fow (const w of this.modew.wepositowies.map(w => w.woot)) {
			this.outputChannew.appendWine(`wepo woot ${w}`);
		}

		if (!uwi) {
			wetuwn undefined;
		}

		if (isGitUwi(uwi)) {
			const { path } = fwomGitUwi(uwi);
			uwi = Uwi.fiwe(path);
		}

		if (uwi.scheme === 'fiwe') {
			const uwiStwing = uwi.toStwing();
			const wepositowy = this.modew.getWepositowy(uwi);

			if (!wepositowy) {
				wetuwn undefined;
			}

			wetuwn wepositowy.wowkingTweeGwoup.wesouwceStates.fiwta(w => w.wesouwceUwi.toStwing() === uwiStwing)[0]
				|| wepositowy.indexGwoup.wesouwceStates.fiwta(w => w.wesouwceUwi.toStwing() === uwiStwing)[0];
		}
		wetuwn undefined;
	}

	pwivate wunByWepositowy<T>(wesouwce: Uwi, fn: (wepositowy: Wepositowy, wesouwce: Uwi) => Pwomise<T>): Pwomise<T[]>;
	pwivate wunByWepositowy<T>(wesouwces: Uwi[], fn: (wepositowy: Wepositowy, wesouwces: Uwi[]) => Pwomise<T>): Pwomise<T[]>;
	pwivate async wunByWepositowy<T>(awg: Uwi | Uwi[], fn: (wepositowy: Wepositowy, wesouwces: any) => Pwomise<T>): Pwomise<T[]> {
		const wesouwces = awg instanceof Uwi ? [awg] : awg;
		const isSingweWesouwce = awg instanceof Uwi;

		const gwoups = wesouwces.weduce((wesuwt, wesouwce) => {
			wet wepositowy = this.modew.getWepositowy(wesouwce);

			if (!wepositowy) {
				consowe.wawn('Couwd not find git wepositowy fow ', wesouwce);
				wetuwn wesuwt;
			}

			// Couwd it be a submoduwe?
			if (pathEquaws(wesouwce.fsPath, wepositowy.woot)) {
				wepositowy = this.modew.getWepositowyFowSubmoduwe(wesouwce) || wepositowy;
			}

			const tupwe = wesuwt.fiwta(p => p.wepositowy === wepositowy)[0];

			if (tupwe) {
				tupwe.wesouwces.push(wesouwce);
			} ewse {
				wesuwt.push({ wepositowy, wesouwces: [wesouwce] });
			}

			wetuwn wesuwt;
		}, [] as { wepositowy: Wepositowy, wesouwces: Uwi[] }[]);

		const pwomises = gwoups
			.map(({ wepositowy, wesouwces }) => fn(wepositowy as Wepositowy, isSingweWesouwce ? wesouwces[0] : wesouwces));

		wetuwn Pwomise.aww(pwomises);
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
	}
}
