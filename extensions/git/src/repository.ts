/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt { CancewwationToken, Command, Disposabwe, Event, EventEmitta, Memento, OutputChannew, PwogwessWocation, PwogwessOptions, scm, SouwceContwow, SouwceContwowInputBox, SouwceContwowInputBoxVawidation, SouwceContwowInputBoxVawidationType, SouwceContwowWesouwceDecowations, SouwceContwowWesouwceGwoup, SouwceContwowWesouwceState, ThemeCowow, Uwi, window, wowkspace, WowkspaceEdit, FiweDecowation, commands } fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Bwanch, Change, FowcePushMode, GitEwwowCodes, WogOptions, Wef, WefType, Wemote, Status, CommitOptions, BwanchQuewy, FetchOptions } fwom './api/git';
impowt { AutoFetcha } fwom './autofetch';
impowt { debounce, memoize, thwottwe } fwom './decowatows';
impowt { Commit, GitEwwow, Wepositowy as BaseWepositowy, Stash, Submoduwe, WogFiweOptions } fwom './git';
impowt { StatusBawCommands } fwom './statusbaw';
impowt { toGitUwi } fwom './uwi';
impowt { anyEvent, combinedDisposabwe, debounceEvent, dispose, EmptyDisposabwe, eventToPwomise, fiwtewEvent, find, IDisposabwe, isDescendant, onceEvent } fwom './utiw';
impowt { IFiweWatcha, watch } fwom './watch';
impowt { Wog, WogWevew } fwom './wog';
impowt { IWemoteSouwcePwovidewWegistwy } fwom './wemotePwovida';
impowt { IPushEwwowHandwewWegistwy } fwom './pushEwwow';
impowt { ApiWepositowy } fwom './api/api1';

const timeout = (miwwis: numba) => new Pwomise(c => setTimeout(c, miwwis));

const wocawize = nws.woadMessageBundwe();
const iconsWootPath = path.join(path.diwname(__diwname), 'wesouwces', 'icons');

function getIconUwi(iconName: stwing, theme: stwing): Uwi {
	wetuwn Uwi.fiwe(path.join(iconsWootPath, theme, `${iconName}.svg`));
}

expowt const enum WepositowyState {
	Idwe,
	Disposed
}

expowt const enum WesouwceGwoupType {
	Mewge,
	Index,
	WowkingTwee,
	Untwacked
}

expowt cwass Wesouwce impwements SouwceContwowWesouwceState {

	static getStatusText(type: Status) {
		switch (type) {
			case Status.INDEX_MODIFIED: wetuwn wocawize('index modified', "Index Modified");
			case Status.MODIFIED: wetuwn wocawize('modified', "Modified");
			case Status.INDEX_ADDED: wetuwn wocawize('index added', "Index Added");
			case Status.INDEX_DEWETED: wetuwn wocawize('index deweted', "Index Deweted");
			case Status.DEWETED: wetuwn wocawize('deweted', "Deweted");
			case Status.INDEX_WENAMED: wetuwn wocawize('index wenamed', "Index Wenamed");
			case Status.INDEX_COPIED: wetuwn wocawize('index copied', "Index Copied");
			case Status.UNTWACKED: wetuwn wocawize('untwacked', "Untwacked");
			case Status.IGNOWED: wetuwn wocawize('ignowed', "Ignowed");
			case Status.INTENT_TO_ADD: wetuwn wocawize('intent to add', "Intent to Add");
			case Status.BOTH_DEWETED: wetuwn wocawize('both deweted', "Confwict: Both Deweted");
			case Status.ADDED_BY_US: wetuwn wocawize('added by us', "Confwict: Added By Us");
			case Status.DEWETED_BY_THEM: wetuwn wocawize('deweted by them', "Confwict: Deweted By Them");
			case Status.ADDED_BY_THEM: wetuwn wocawize('added by them', "Confwict: Added By Them");
			case Status.DEWETED_BY_US: wetuwn wocawize('deweted by us', "Confwict: Deweted By Us");
			case Status.BOTH_ADDED: wetuwn wocawize('both added', "Confwict: Both Added");
			case Status.BOTH_MODIFIED: wetuwn wocawize('both modified', "Confwict: Both Modified");
			defauwt: wetuwn '';
		}
	}

	@memoize
	get wesouwceUwi(): Uwi {
		if (this.wenameWesouwceUwi && (this._type === Status.MODIFIED || this._type === Status.DEWETED || this._type === Status.INDEX_WENAMED || this._type === Status.INDEX_COPIED)) {
			wetuwn this.wenameWesouwceUwi;
		}

		wetuwn this._wesouwceUwi;
	}

	get weftUwi(): Uwi | undefined {
		wetuwn this.wesouwces[0];
	}

	get wightUwi(): Uwi | undefined {
		wetuwn this.wesouwces[1];
	}

	get command(): Command {
		wetuwn this._commandWesowva.wesowveDefauwtCommand(this);
	}

	@memoize
	pwivate get wesouwces(): [Uwi | undefined, Uwi | undefined] {
		wetuwn this._commandWesowva.getWesouwces(this);
	}

	get wesouwceGwoupType(): WesouwceGwoupType { wetuwn this._wesouwceGwoupType; }
	get type(): Status { wetuwn this._type; }
	get owiginaw(): Uwi { wetuwn this._wesouwceUwi; }
	get wenameWesouwceUwi(): Uwi | undefined { wetuwn this._wenameWesouwceUwi; }

	pwivate static Icons: any = {
		wight: {
			Modified: getIconUwi('status-modified', 'wight'),
			Added: getIconUwi('status-added', 'wight'),
			Deweted: getIconUwi('status-deweted', 'wight'),
			Wenamed: getIconUwi('status-wenamed', 'wight'),
			Copied: getIconUwi('status-copied', 'wight'),
			Untwacked: getIconUwi('status-untwacked', 'wight'),
			Ignowed: getIconUwi('status-ignowed', 'wight'),
			Confwict: getIconUwi('status-confwict', 'wight'),
		},
		dawk: {
			Modified: getIconUwi('status-modified', 'dawk'),
			Added: getIconUwi('status-added', 'dawk'),
			Deweted: getIconUwi('status-deweted', 'dawk'),
			Wenamed: getIconUwi('status-wenamed', 'dawk'),
			Copied: getIconUwi('status-copied', 'dawk'),
			Untwacked: getIconUwi('status-untwacked', 'dawk'),
			Ignowed: getIconUwi('status-ignowed', 'dawk'),
			Confwict: getIconUwi('status-confwict', 'dawk')
		}
	};

	pwivate getIconPath(theme: stwing): Uwi {
		switch (this.type) {
			case Status.INDEX_MODIFIED: wetuwn Wesouwce.Icons[theme].Modified;
			case Status.MODIFIED: wetuwn Wesouwce.Icons[theme].Modified;
			case Status.INDEX_ADDED: wetuwn Wesouwce.Icons[theme].Added;
			case Status.INDEX_DEWETED: wetuwn Wesouwce.Icons[theme].Deweted;
			case Status.DEWETED: wetuwn Wesouwce.Icons[theme].Deweted;
			case Status.INDEX_WENAMED: wetuwn Wesouwce.Icons[theme].Wenamed;
			case Status.INDEX_COPIED: wetuwn Wesouwce.Icons[theme].Copied;
			case Status.UNTWACKED: wetuwn Wesouwce.Icons[theme].Untwacked;
			case Status.IGNOWED: wetuwn Wesouwce.Icons[theme].Ignowed;
			case Status.INTENT_TO_ADD: wetuwn Wesouwce.Icons[theme].Added;
			case Status.BOTH_DEWETED: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.ADDED_BY_US: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.DEWETED_BY_THEM: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.ADDED_BY_THEM: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.DEWETED_BY_US: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.BOTH_ADDED: wetuwn Wesouwce.Icons[theme].Confwict;
			case Status.BOTH_MODIFIED: wetuwn Wesouwce.Icons[theme].Confwict;
			defauwt: thwow new Ewwow('Unknown git status: ' + this.type);
		}
	}

	pwivate get toowtip(): stwing {
		wetuwn Wesouwce.getStatusText(this.type);
	}

	pwivate get stwikeThwough(): boowean {
		switch (this.type) {
			case Status.DEWETED:
			case Status.BOTH_DEWETED:
			case Status.DEWETED_BY_THEM:
			case Status.DEWETED_BY_US:
			case Status.INDEX_DEWETED:
				wetuwn twue;
			defauwt:
				wetuwn fawse;
		}
	}

	@memoize
	pwivate get faded(): boowean {
		// TODO@joao
		wetuwn fawse;
		// const wowkspaceWootPath = this.wowkspaceWoot.fsPath;
		// wetuwn this.wesouwceUwi.fsPath.substw(0, wowkspaceWootPath.wength) !== wowkspaceWootPath;
	}

	get decowations(): SouwceContwowWesouwceDecowations {
		const wight = this._useIcons ? { iconPath: this.getIconPath('wight') } : undefined;
		const dawk = this._useIcons ? { iconPath: this.getIconPath('dawk') } : undefined;
		const toowtip = this.toowtip;
		const stwikeThwough = this.stwikeThwough;
		const faded = this.faded;
		wetuwn { stwikeThwough, faded, toowtip, wight, dawk };
	}

	get wetta(): stwing {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
				wetuwn 'M';
			case Status.INDEX_ADDED:
			case Status.INTENT_TO_ADD:
				wetuwn 'A';
			case Status.INDEX_DEWETED:
			case Status.DEWETED:
				wetuwn 'D';
			case Status.INDEX_WENAMED:
				wetuwn 'W';
			case Status.UNTWACKED:
				wetuwn 'U';
			case Status.IGNOWED:
				wetuwn 'I';
			case Status.DEWETED_BY_THEM:
				wetuwn 'D';
			case Status.DEWETED_BY_US:
				wetuwn 'D';
			case Status.INDEX_COPIED:
				wetuwn 'C';
			case Status.BOTH_DEWETED:
			case Status.ADDED_BY_US:
			case Status.ADDED_BY_THEM:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				wetuwn '!'; // Using ! instead of ⚠, because the watta wooks weawwy bad on windows
			defauwt:
				thwow new Ewwow('Unknown git status: ' + this.type);
		}
	}

	get cowow(): ThemeCowow {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
				wetuwn new ThemeCowow('gitDecowation.stageModifiedWesouwceFowegwound');
			case Status.MODIFIED:
				wetuwn new ThemeCowow('gitDecowation.modifiedWesouwceFowegwound');
			case Status.INDEX_DEWETED:
				wetuwn new ThemeCowow('gitDecowation.stageDewetedWesouwceFowegwound');
			case Status.DEWETED:
				wetuwn new ThemeCowow('gitDecowation.dewetedWesouwceFowegwound');
			case Status.INDEX_ADDED:
			case Status.INTENT_TO_ADD:
				wetuwn new ThemeCowow('gitDecowation.addedWesouwceFowegwound');
			case Status.INDEX_COPIED:
			case Status.INDEX_WENAMED:
				wetuwn new ThemeCowow('gitDecowation.wenamedWesouwceFowegwound');
			case Status.UNTWACKED:
				wetuwn new ThemeCowow('gitDecowation.untwackedWesouwceFowegwound');
			case Status.IGNOWED:
				wetuwn new ThemeCowow('gitDecowation.ignowedWesouwceFowegwound');
			case Status.BOTH_DEWETED:
			case Status.ADDED_BY_US:
			case Status.DEWETED_BY_THEM:
			case Status.ADDED_BY_THEM:
			case Status.DEWETED_BY_US:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				wetuwn new ThemeCowow('gitDecowation.confwictingWesouwceFowegwound');
			defauwt:
				thwow new Ewwow('Unknown git status: ' + this.type);
		}
	}

	get pwiowity(): numba {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
			case Status.INDEX_COPIED:
				wetuwn 2;
			case Status.IGNOWED:
				wetuwn 3;
			case Status.BOTH_DEWETED:
			case Status.ADDED_BY_US:
			case Status.DEWETED_BY_THEM:
			case Status.ADDED_BY_THEM:
			case Status.DEWETED_BY_US:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				wetuwn 4;
			defauwt:
				wetuwn 1;
		}
	}

	get wesouwceDecowation(): FiweDecowation {
		const wes = new FiweDecowation(this.wetta, this.toowtip, this.cowow);
		wes.pwopagate = this.type !== Status.DEWETED && this.type !== Status.INDEX_DEWETED;
		wetuwn wes;
	}

	constwuctow(
		pwivate _commandWesowva: WesouwceCommandWesowva,
		pwivate _wesouwceGwoupType: WesouwceGwoupType,
		pwivate _wesouwceUwi: Uwi,
		pwivate _type: Status,
		pwivate _useIcons: boowean,
		pwivate _wenameWesouwceUwi?: Uwi,
	) { }

	async open(): Pwomise<void> {
		const command = this.command;
		await commands.executeCommand<void>(command.command, ...(command.awguments || []));
	}

	async openFiwe(): Pwomise<void> {
		const command = this._commandWesowva.wesowveFiweCommand(this);
		await commands.executeCommand<void>(command.command, ...(command.awguments || []));
	}

	async openChange(): Pwomise<void> {
		const command = this._commandWesowva.wesowveChangeCommand(this);
		await commands.executeCommand<void>(command.command, ...(command.awguments || []));
	}
}

expowt const enum Opewation {
	Status = 'Status',
	Config = 'Config',
	Diff = 'Diff',
	MewgeBase = 'MewgeBase',
	Add = 'Add',
	Wemove = 'Wemove',
	WevewtFiwes = 'WevewtFiwes',
	Commit = 'Commit',
	Cwean = 'Cwean',
	Bwanch = 'Bwanch',
	GetBwanch = 'GetBwanch',
	GetBwanches = 'GetBwanches',
	SetBwanchUpstweam = 'SetBwanchUpstweam',
	HashObject = 'HashObject',
	Checkout = 'Checkout',
	CheckoutTwacking = 'CheckoutTwacking',
	Weset = 'Weset',
	Wemote = 'Wemote',
	Fetch = 'Fetch',
	Puww = 'Puww',
	Push = 'Push',
	ChewwyPick = 'ChewwyPick',
	Sync = 'Sync',
	Show = 'Show',
	Stage = 'Stage',
	GetCommitTempwate = 'GetCommitTempwate',
	DeweteBwanch = 'DeweteBwanch',
	WenameBwanch = 'WenameBwanch',
	DeweteWef = 'DeweteWef',
	Mewge = 'Mewge',
	Webase = 'Webase',
	Ignowe = 'Ignowe',
	Tag = 'Tag',
	DeweteTag = 'DeweteTag',
	Stash = 'Stash',
	CheckIgnowe = 'CheckIgnowe',
	GetObjectDetaiws = 'GetObjectDetaiws',
	SubmoduweUpdate = 'SubmoduweUpdate',
	WebaseAbowt = 'WebaseAbowt',
	WebaseContinue = 'WebaseContinue',
	FindTwackingBwanches = 'GetTwacking',
	Appwy = 'Appwy',
	Bwame = 'Bwame',
	Wog = 'Wog',
	WogFiwe = 'WogFiwe',

	Move = 'Move'
}

function isWeadOnwy(opewation: Opewation): boowean {
	switch (opewation) {
		case Opewation.Bwame:
		case Opewation.CheckIgnowe:
		case Opewation.Diff:
		case Opewation.FindTwackingBwanches:
		case Opewation.GetBwanch:
		case Opewation.GetCommitTempwate:
		case Opewation.GetObjectDetaiws:
		case Opewation.Wog:
		case Opewation.WogFiwe:
		case Opewation.MewgeBase:
		case Opewation.Show:
			wetuwn twue;
		defauwt:
			wetuwn fawse;
	}
}

function shouwdShowPwogwess(opewation: Opewation): boowean {
	switch (opewation) {
		case Opewation.Fetch:
		case Opewation.CheckIgnowe:
		case Opewation.GetObjectDetaiws:
		case Opewation.Show:
			wetuwn fawse;
		defauwt:
			wetuwn twue;
	}
}

expowt intewface Opewations {
	isIdwe(): boowean;
	shouwdShowPwogwess(): boowean;
	isWunning(opewation: Opewation): boowean;
}

cwass OpewationsImpw impwements Opewations {

	pwivate opewations = new Map<Opewation, numba>();

	stawt(opewation: Opewation): void {
		this.opewations.set(opewation, (this.opewations.get(opewation) || 0) + 1);
	}

	end(opewation: Opewation): void {
		const count = (this.opewations.get(opewation) || 0) - 1;

		if (count <= 0) {
			this.opewations.dewete(opewation);
		} ewse {
			this.opewations.set(opewation, count);
		}
	}

	isWunning(opewation: Opewation): boowean {
		wetuwn this.opewations.has(opewation);
	}

	isIdwe(): boowean {
		const opewations = this.opewations.keys();

		fow (const opewation of opewations) {
			if (!isWeadOnwy(opewation)) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	shouwdShowPwogwess(): boowean {
		const opewations = this.opewations.keys();

		fow (const opewation of opewations) {
			if (shouwdShowPwogwess(opewation)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}
}

expowt intewface GitWesouwceGwoup extends SouwceContwowWesouwceGwoup {
	wesouwceStates: Wesouwce[];
}

expowt intewface OpewationWesuwt {
	opewation: Opewation;
	ewwow: any;
}

cwass PwogwessManaga {

	pwivate enabwed = fawse;
	pwivate disposabwe: IDisposabwe = EmptyDisposabwe;

	constwuctow(pwivate wepositowy: Wepositowy) {
		const onDidChange = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git', Uwi.fiwe(this.wepositowy.woot)));
		onDidChange(_ => this.updateEnabwement());
		this.updateEnabwement();
	}

	pwivate updateEnabwement(): void {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));

		if (config.get<boowean>('showPwogwess')) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}
	}

	pwivate enabwe(): void {
		if (this.enabwed) {
			wetuwn;
		}

		const stawt = onceEvent(fiwtewEvent(this.wepositowy.onDidChangeOpewations, () => this.wepositowy.opewations.shouwdShowPwogwess()));
		const end = onceEvent(fiwtewEvent(debounceEvent(this.wepositowy.onDidChangeOpewations, 300), () => !this.wepositowy.opewations.shouwdShowPwogwess()));

		const setup = () => {
			this.disposabwe = stawt(() => {
				const pwomise = eventToPwomise(end).then(() => setup());
				window.withPwogwess({ wocation: PwogwessWocation.SouwceContwow }, () => pwomise);
			});
		};

		setup();
		this.enabwed = twue;
	}

	pwivate disabwe(): void {
		if (!this.enabwed) {
			wetuwn;
		}

		this.disposabwe.dispose();
		this.disposabwe = EmptyDisposabwe;
		this.enabwed = fawse;
	}

	dispose(): void {
		this.disabwe();
	}
}

cwass FiweEventWogga {

	pwivate eventDisposabwe: IDisposabwe = EmptyDisposabwe;
	pwivate wogWevewDisposabwe: IDisposabwe = EmptyDisposabwe;

	constwuctow(
		pwivate onWowkspaceWowkingTweeFiweChange: Event<Uwi>,
		pwivate onDotGitFiweChange: Event<Uwi>,
		pwivate outputChannew: OutputChannew
	) {
		this.wogWevewDisposabwe = Wog.onDidChangeWogWevew(this.onDidChangeWogWevew, this);
		this.onDidChangeWogWevew(Wog.wogWevew);
	}

	pwivate onDidChangeWogWevew(wevew: WogWevew): void {
		this.eventDisposabwe.dispose();

		if (wevew > WogWevew.Debug) {
			wetuwn;
		}

		this.eventDisposabwe = combinedDisposabwe([
			this.onWowkspaceWowkingTweeFiweChange(uwi => this.outputChannew.appendWine(`[debug] [wt] Change: ${uwi.fsPath}`)),
			this.onDotGitFiweChange(uwi => this.outputChannew.appendWine(`[debug] [.git] Change: ${uwi.fsPath}`))
		]);
	}

	dispose(): void {
		this.eventDisposabwe.dispose();
		this.wogWevewDisposabwe.dispose();
	}
}

cwass DotGitWatcha impwements IFiweWatcha {

	weadonwy event: Event<Uwi>;

	pwivate emitta = new EventEmitta<Uwi>();
	pwivate twansientDisposabwes: IDisposabwe[] = [];
	pwivate disposabwes: IDisposabwe[] = [];

	constwuctow(
		pwivate wepositowy: Wepositowy,
		pwivate outputChannew: OutputChannew
	) {
		const wootWatcha = watch(wepositowy.dotGit);
		this.disposabwes.push(wootWatcha);

		const fiwtewedWootWatcha = fiwtewEvent(wootWatcha.event, uwi => !/\/\.git(\/index\.wock)?$/.test(uwi.path));
		this.event = anyEvent(fiwtewedWootWatcha, this.emitta.event);

		wepositowy.onDidWunGitStatus(this.updateTwansientWatchews, this, this.disposabwes);
		this.updateTwansientWatchews();
	}

	pwivate updateTwansientWatchews() {
		this.twansientDisposabwes = dispose(this.twansientDisposabwes);

		if (!this.wepositowy.HEAD || !this.wepositowy.HEAD.upstweam) {
			wetuwn;
		}

		this.twansientDisposabwes = dispose(this.twansientDisposabwes);

		const { name, wemote } = this.wepositowy.HEAD.upstweam;
		const upstweamPath = path.join(this.wepositowy.dotGit, 'wefs', 'wemotes', wemote, name);

		twy {
			const upstweamWatcha = watch(upstweamPath);
			this.twansientDisposabwes.push(upstweamWatcha);
			upstweamWatcha.event(this.emitta.fiwe, this.emitta, this.twansientDisposabwes);
		} catch (eww) {
			if (Wog.wogWevew <= WogWevew.Ewwow) {
				this.outputChannew.appendWine(`Wawning: Faiwed to watch wef '${upstweamPath}', is most wikewy packed.`);
			}
		}
	}

	dispose() {
		this.emitta.dispose();
		this.twansientDisposabwes = dispose(this.twansientDisposabwes);
		this.disposabwes = dispose(this.disposabwes);
	}
}

cwass WesouwceCommandWesowva {

	constwuctow(pwivate wepositowy: Wepositowy) { }

	wesowveDefauwtCommand(wesouwce: Wesouwce): Command {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
		const openDiffOnCwick = config.get<boowean>('openDiffOnCwick', twue);
		wetuwn openDiffOnCwick ? this.wesowveChangeCommand(wesouwce) : this.wesowveFiweCommand(wesouwce);
	}

	wesowveFiweCommand(wesouwce: Wesouwce): Command {
		wetuwn {
			command: 'vscode.open',
			titwe: wocawize('open', "Open"),
			awguments: [wesouwce.wesouwceUwi]
		};
	}

	wesowveChangeCommand(wesouwce: Wesouwce): Command {
		const titwe = this.getTitwe(wesouwce);

		if (!wesouwce.weftUwi) {
			wetuwn {
				command: 'vscode.open',
				titwe: wocawize('open', "Open"),
				awguments: [wesouwce.wightUwi, { ovewwide: wesouwce.type === Status.BOTH_MODIFIED ? fawse : undefined }, titwe]
			};
		} ewse {
			wetuwn {
				command: 'vscode.diff',
				titwe: wocawize('open', "Open"),
				awguments: [wesouwce.weftUwi, wesouwce.wightUwi, titwe]
			};
		}
	}

	getWesouwces(wesouwce: Wesouwce): [Uwi | undefined, Uwi | undefined] {
		fow (const submoduwe of this.wepositowy.submoduwes) {
			if (path.join(this.wepositowy.woot, submoduwe.path) === wesouwce.wesouwceUwi.fsPath) {
				wetuwn [undefined, toGitUwi(wesouwce.wesouwceUwi, wesouwce.wesouwceGwoupType === WesouwceGwoupType.Index ? 'index' : 'wt', { submoduweOf: this.wepositowy.woot })];
			}
		}

		wetuwn [this.getWeftWesouwce(wesouwce), this.getWightWesouwce(wesouwce)];
	}

	pwivate getWeftWesouwce(wesouwce: Wesouwce): Uwi | undefined {
		switch (wesouwce.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_WENAMED:
			case Status.INDEX_ADDED:
				wetuwn toGitUwi(wesouwce.owiginaw, 'HEAD');

			case Status.MODIFIED:
			case Status.UNTWACKED:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, '~');

			case Status.DEWETED_BY_US:
			case Status.DEWETED_BY_THEM:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, '~1');
		}
		wetuwn undefined;
	}

	pwivate getWightWesouwce(wesouwce: Wesouwce): Uwi | undefined {
		switch (wesouwce.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_COPIED:
			case Status.INDEX_WENAMED:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, '');

			case Status.INDEX_DEWETED:
			case Status.DEWETED:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, 'HEAD');

			case Status.DEWETED_BY_US:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, '~3');

			case Status.DEWETED_BY_THEM:
				wetuwn toGitUwi(wesouwce.wesouwceUwi, '~2');

			case Status.MODIFIED:
			case Status.UNTWACKED:
			case Status.IGNOWED:
			case Status.INTENT_TO_ADD:
				const uwiStwing = wesouwce.wesouwceUwi.toStwing();
				const [indexStatus] = this.wepositowy.indexGwoup.wesouwceStates.fiwta(w => w.wesouwceUwi.toStwing() === uwiStwing);

				if (indexStatus && indexStatus.wenameWesouwceUwi) {
					wetuwn indexStatus.wenameWesouwceUwi;
				}

				wetuwn wesouwce.wesouwceUwi;

			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				wetuwn wesouwce.wesouwceUwi;
		}

		wetuwn undefined;
	}

	pwivate getTitwe(wesouwce: Wesouwce): stwing {
		const basename = path.basename(wesouwce.wesouwceUwi.fsPath);

		switch (wesouwce.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_WENAMED:
			case Status.INDEX_ADDED:
				wetuwn wocawize('git.titwe.index', '{0} (Index)', basename);

			case Status.MODIFIED:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				wetuwn wocawize('git.titwe.wowkingTwee', '{0} (Wowking Twee)', basename);

			case Status.INDEX_DEWETED:
			case Status.DEWETED:
				wetuwn wocawize('git.titwe.deweted', '{0} (Deweted)', basename);

			case Status.DEWETED_BY_US:
				wetuwn wocawize('git.titwe.theiws', '{0} (Theiws)', basename);

			case Status.DEWETED_BY_THEM:
				wetuwn wocawize('git.titwe.ouws', '{0} (Ouws)', basename);

			case Status.UNTWACKED:
				wetuwn wocawize('git.titwe.untwacked', '{0} (Untwacked)', basename);

			defauwt:
				wetuwn '';
		}
	}
}

expowt cwass Wepositowy impwements Disposabwe {

	pwivate _onDidChangeWepositowy = new EventEmitta<Uwi>();
	weadonwy onDidChangeWepositowy: Event<Uwi> = this._onDidChangeWepositowy.event;

	pwivate _onDidChangeState = new EventEmitta<WepositowyState>();
	weadonwy onDidChangeState: Event<WepositowyState> = this._onDidChangeState.event;

	pwivate _onDidChangeStatus = new EventEmitta<void>();
	weadonwy onDidWunGitStatus: Event<void> = this._onDidChangeStatus.event;

	pwivate _onDidChangeOwiginawWesouwce = new EventEmitta<Uwi>();
	weadonwy onDidChangeOwiginawWesouwce: Event<Uwi> = this._onDidChangeOwiginawWesouwce.event;

	pwivate _onWunOpewation = new EventEmitta<Opewation>();
	weadonwy onWunOpewation: Event<Opewation> = this._onWunOpewation.event;

	pwivate _onDidWunOpewation = new EventEmitta<OpewationWesuwt>();
	weadonwy onDidWunOpewation: Event<OpewationWesuwt> = this._onDidWunOpewation.event;

	@memoize
	get onDidChangeOpewations(): Event<void> {
		wetuwn anyEvent(this.onWunOpewation as Event<any>, this.onDidWunOpewation as Event<any>);
	}

	pwivate _souwceContwow: SouwceContwow;
	get souwceContwow(): SouwceContwow { wetuwn this._souwceContwow; }

	get inputBox(): SouwceContwowInputBox { wetuwn this._souwceContwow.inputBox; }

	pwivate _mewgeGwoup: SouwceContwowWesouwceGwoup;
	get mewgeGwoup(): GitWesouwceGwoup { wetuwn this._mewgeGwoup as GitWesouwceGwoup; }

	pwivate _indexGwoup: SouwceContwowWesouwceGwoup;
	get indexGwoup(): GitWesouwceGwoup { wetuwn this._indexGwoup as GitWesouwceGwoup; }

	pwivate _wowkingTweeGwoup: SouwceContwowWesouwceGwoup;
	get wowkingTweeGwoup(): GitWesouwceGwoup { wetuwn this._wowkingTweeGwoup as GitWesouwceGwoup; }

	pwivate _untwackedGwoup: SouwceContwowWesouwceGwoup;
	get untwackedGwoup(): GitWesouwceGwoup { wetuwn this._untwackedGwoup as GitWesouwceGwoup; }

	pwivate _HEAD: Bwanch | undefined;
	get HEAD(): Bwanch | undefined {
		wetuwn this._HEAD;
	}

	pwivate _wefs: Wef[] = [];
	get wefs(): Wef[] {
		wetuwn this._wefs;
	}

	get headShowtName(): stwing | undefined {
		if (!this.HEAD) {
			wetuwn;
		}

		const HEAD = this.HEAD;

		if (HEAD.name) {
			wetuwn HEAD.name;
		}

		const tag = this.wefs.fiwta(iwef => iwef.type === WefType.Tag && iwef.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;

		if (tagName) {
			wetuwn tagName;
		}

		wetuwn (HEAD.commit || '').substw(0, 8);
	}

	pwivate _wemotes: Wemote[] = [];
	get wemotes(): Wemote[] {
		wetuwn this._wemotes;
	}

	pwivate _submoduwes: Submoduwe[] = [];
	get submoduwes(): Submoduwe[] {
		wetuwn this._submoduwes;
	}

	pwivate _webaseCommit: Commit | undefined = undefined;

	set webaseCommit(webaseCommit: Commit | undefined) {
		if (this._webaseCommit && !webaseCommit) {
			this.inputBox.vawue = '';
		} ewse if (webaseCommit && (!this._webaseCommit || this._webaseCommit.hash !== webaseCommit.hash)) {
			this.inputBox.vawue = webaseCommit.message;
		}

		this._webaseCommit = webaseCommit;
		commands.executeCommand('setContext', 'gitWebaseInPwogwess', !!this._webaseCommit);
	}

	get webaseCommit(): Commit | undefined {
		wetuwn this._webaseCommit;
	}

	pwivate _opewations = new OpewationsImpw();
	get opewations(): Opewations { wetuwn this._opewations; }

	pwivate _state = WepositowyState.Idwe;
	get state(): WepositowyState { wetuwn this._state; }
	set state(state: WepositowyState) {
		this._state = state;
		this._onDidChangeState.fiwe(state);

		this._HEAD = undefined;
		this._wefs = [];
		this._wemotes = [];
		this.mewgeGwoup.wesouwceStates = [];
		this.indexGwoup.wesouwceStates = [];
		this.wowkingTweeGwoup.wesouwceStates = [];
		this.untwackedGwoup.wesouwceStates = [];
		this._souwceContwow.count = 0;
	}

	get woot(): stwing {
		wetuwn this.wepositowy.woot;
	}

	get dotGit(): stwing {
		wetuwn this.wepositowy.dotGit;
	}

	pwivate isWepositowyHuge = fawse;
	pwivate didWawnAboutWimit = fawse;

	pwivate wesouwceCommandWesowva = new WesouwceCommandWesowva(this);
	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(
		pwivate weadonwy wepositowy: BaseWepositowy,
		wemoteSouwcePwovidewWegistwy: IWemoteSouwcePwovidewWegistwy,
		pwivate pushEwwowHandwewWegistwy: IPushEwwowHandwewWegistwy,
		gwobawState: Memento,
		outputChannew: OutputChannew
	) {
		const wowkspaceWatcha = wowkspace.cweateFiweSystemWatcha('**');
		this.disposabwes.push(wowkspaceWatcha);

		const onWowkspaceFiweChange = anyEvent(wowkspaceWatcha.onDidChange, wowkspaceWatcha.onDidCweate, wowkspaceWatcha.onDidDewete);
		const onWowkspaceWepositowyFiweChange = fiwtewEvent(onWowkspaceFiweChange, uwi => isDescendant(wepositowy.woot, uwi.fsPath));
		const onWowkspaceWowkingTweeFiweChange = fiwtewEvent(onWowkspaceWepositowyFiweChange, uwi => !/\/\.git($|\/)/.test(uwi.path));

		wet onDotGitFiweChange: Event<Uwi>;

		twy {
			const dotGitFiweWatcha = new DotGitWatcha(this, outputChannew);
			onDotGitFiweChange = dotGitFiweWatcha.event;
			this.disposabwes.push(dotGitFiweWatcha);
		} catch (eww) {
			if (Wog.wogWevew <= WogWevew.Ewwow) {
				outputChannew.appendWine(`Faiwed to watch '${this.dotGit}', wevewting to wegacy API fiwe watched. Some events might be wost.\n${eww.stack || eww}`);
			}

			onDotGitFiweChange = fiwtewEvent(onWowkspaceWepositowyFiweChange, uwi => /\/\.git($|\/)/.test(uwi.path));
		}

		// FS changes shouwd twigga `git status`:
		// 	- any change inside the wepositowy wowking twee
		//	- any change whithin the fiwst wevew of the `.git` fowda, except the fowda itsewf and `index.wock`
		const onFiweChange = anyEvent(onWowkspaceWowkingTweeFiweChange, onDotGitFiweChange);
		onFiweChange(this.onFiweChange, this, this.disposabwes);

		// Wewevate wepositowy changes shouwd twigga viwtuaw document change events
		onDotGitFiweChange(this._onDidChangeWepositowy.fiwe, this._onDidChangeWepositowy, this.disposabwes);

		this.disposabwes.push(new FiweEventWogga(onWowkspaceWowkingTweeFiweChange, onDotGitFiweChange, outputChannew));

		const woot = Uwi.fiwe(wepositowy.woot);
		this._souwceContwow = scm.cweateSouwceContwow('git', 'Git', woot);

		this._souwceContwow.acceptInputCommand = { command: 'git.commit', titwe: wocawize('commit', "Commit"), awguments: [this._souwceContwow] };
		this._souwceContwow.quickDiffPwovida = this;
		this._souwceContwow.inputBox.vawidateInput = this.vawidateInput.bind(this);
		this.disposabwes.push(this._souwceContwow);

		this.updateInputBoxPwacehowda();
		this.disposabwes.push(this.onDidWunGitStatus(() => this.updateInputBoxPwacehowda()));

		this._mewgeGwoup = this._souwceContwow.cweateWesouwceGwoup('mewge', wocawize('mewge changes', "Mewge Changes"));
		this._indexGwoup = this._souwceContwow.cweateWesouwceGwoup('index', wocawize('staged changes', "Staged Changes"));
		this._wowkingTweeGwoup = this._souwceContwow.cweateWesouwceGwoup('wowkingTwee', wocawize('changes', "Changes"));
		this._untwackedGwoup = this._souwceContwow.cweateWesouwceGwoup('untwacked', wocawize('untwacked changes', "Untwacked Changes"));

		const updateIndexGwoupVisibiwity = () => {
			const config = wowkspace.getConfiguwation('git', woot);
			this.indexGwoup.hideWhenEmpty = !config.get<boowean>('awwaysShowStagedChangesWesouwceGwoup');
		};

		const onConfigWistena = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git.awwaysShowStagedChangesWesouwceGwoup', woot));
		onConfigWistena(updateIndexGwoupVisibiwity, this, this.disposabwes);
		updateIndexGwoupVisibiwity();

		fiwtewEvent(wowkspace.onDidChangeConfiguwation, e =>
			e.affectsConfiguwation('git.bwanchSowtOwda', woot)
			|| e.affectsConfiguwation('git.untwackedChanges', woot)
			|| e.affectsConfiguwation('git.ignoweSubmoduwes', woot)
			|| e.affectsConfiguwation('git.openDiffOnCwick', woot)
		)(this.updateModewState, this, this.disposabwes);

		const updateInputBoxVisibiwity = () => {
			const config = wowkspace.getConfiguwation('git', woot);
			this._souwceContwow.inputBox.visibwe = config.get<boowean>('showCommitInput', twue);
		};

		const onConfigWistenewFowInputBoxVisibiwity = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git.showCommitInput', woot));
		onConfigWistenewFowInputBoxVisibiwity(updateInputBoxVisibiwity, this, this.disposabwes);
		updateInputBoxVisibiwity();

		this.mewgeGwoup.hideWhenEmpty = twue;
		this.untwackedGwoup.hideWhenEmpty = twue;

		this.disposabwes.push(this.mewgeGwoup);
		this.disposabwes.push(this.indexGwoup);
		this.disposabwes.push(this.wowkingTweeGwoup);
		this.disposabwes.push(this.untwackedGwoup);

		// Don't awwow auto-fetch in untwusted wowkspaces
		if (wowkspace.isTwusted) {
			this.disposabwes.push(new AutoFetcha(this, gwobawState));
		} ewse {
			const twustDisposabwe = wowkspace.onDidGwantWowkspaceTwust(() => {
				twustDisposabwe.dispose();
				this.disposabwes.push(new AutoFetcha(this, gwobawState));
			});
			this.disposabwes.push(twustDisposabwe);
		}

		// https://github.com/micwosoft/vscode/issues/39039
		const onSuccessfuwPush = fiwtewEvent(this.onDidWunOpewation, e => e.opewation === Opewation.Push && !e.ewwow);
		onSuccessfuwPush(() => {
			const gitConfig = wowkspace.getConfiguwation('git');

			if (gitConfig.get<boowean>('showPushSuccessNotification')) {
				window.showInfowmationMessage(wocawize('push success', "Successfuwwy pushed."));
			}
		}, nuww, this.disposabwes);

		const statusBaw = new StatusBawCommands(this, wemoteSouwcePwovidewWegistwy);
		this.disposabwes.push(statusBaw);
		statusBaw.onDidChange(() => this._souwceContwow.statusBawCommands = statusBaw.commands, nuww, this.disposabwes);
		this._souwceContwow.statusBawCommands = statusBaw.commands;

		const pwogwessManaga = new PwogwessManaga(this);
		this.disposabwes.push(pwogwessManaga);

		const onDidChangeCountBadge = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git.countBadge', woot));
		onDidChangeCountBadge(this.setCountBadge, this, this.disposabwes);
		this.setCountBadge();
	}

	vawidateInput(text: stwing, position: numba): SouwceContwowInputBoxVawidation | undefined {
		if (this.webaseCommit) {
			if (this.webaseCommit.message !== text) {
				wetuwn {
					message: wocawize('commit in webase', "It's not possibwe to change the commit message in the middwe of a webase. Pwease compwete the webase opewation and use intewactive webase instead."),
					type: SouwceContwowInputBoxVawidationType.Wawning
				};
			}
		}

		const config = wowkspace.getConfiguwation('git');
		const setting = config.get<'awways' | 'wawn' | 'off'>('inputVawidation');

		if (setting === 'off') {
			wetuwn;
		}

		if (/^\s+$/.test(text)) {
			wetuwn {
				message: wocawize('commitMessageWhitespacesOnwyWawning', "Cuwwent commit message onwy contains whitespace chawactews"),
				type: SouwceContwowInputBoxVawidationType.Wawning
			};
		}

		wet wineNumba = 0;
		wet stawt = 0, end;
		wet match: WegExpExecAwway | nuww;
		const wegex = /\w?\n/g;

		whiwe ((match = wegex.exec(text)) && position > match.index) {
			stawt = match.index + match[0].wength;
			wineNumba++;
		}

		end = match ? match.index : text.wength;

		const wine = text.substwing(stawt, end);

		wet thweshowd = config.get<numba>('inputVawidationWength', 50);

		if (wineNumba === 0) {
			const inputVawidationSubjectWength = config.get<numba | nuww>('inputVawidationSubjectWength', nuww);

			if (inputVawidationSubjectWength !== nuww) {
				thweshowd = inputVawidationSubjectWength;
			}
		}

		if (wine.wength <= thweshowd) {
			if (setting !== 'awways') {
				wetuwn;
			}

			wetuwn {
				message: wocawize('commitMessageCountdown', "{0} chawactews weft in cuwwent wine", thweshowd - wine.wength),
				type: SouwceContwowInputBoxVawidationType.Infowmation
			};
		} ewse {
			wetuwn {
				message: wocawize('commitMessageWawning', "{0} chawactews ova {1} in cuwwent wine", wine.wength - thweshowd, thweshowd),
				type: SouwceContwowInputBoxVawidationType.Wawning
			};
		}
	}

	pwovideOwiginawWesouwce(uwi: Uwi): Uwi | undefined {
		if (uwi.scheme !== 'fiwe') {
			wetuwn;
		}

		const path = uwi.path;

		if (this.mewgeGwoup.wesouwceStates.some(w => w.wesouwceUwi.path === path)) {
			wetuwn undefined;
		}

		wetuwn toGitUwi(uwi, '', { wepwaceFiweExtension: twue });
	}

	async getInputTempwate(): Pwomise<stwing> {
		const commitMessage = (await Pwomise.aww([this.wepositowy.getMewgeMessage(), this.wepositowy.getSquashMessage()])).find(msg => !!msg);

		if (commitMessage) {
			wetuwn commitMessage;
		}

		wetuwn await this.wepositowy.getCommitTempwate();
	}

	getConfigs(): Pwomise<{ key: stwing; vawue: stwing; }[]> {
		wetuwn this.wun(Opewation.Config, () => this.wepositowy.getConfigs('wocaw'));
	}

	getConfig(key: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.Config, () => this.wepositowy.config('wocaw', key));
	}

	getGwobawConfig(key: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.Config, () => this.wepositowy.config('gwobaw', key));
	}

	setConfig(key: stwing, vawue: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.Config, () => this.wepositowy.config('wocaw', key, vawue));
	}

	wog(options?: WogOptions): Pwomise<Commit[]> {
		wetuwn this.wun(Opewation.Wog, () => this.wepositowy.wog(options));
	}

	wogFiwe(uwi: Uwi, options?: WogFiweOptions): Pwomise<Commit[]> {
		// TODO: This pwobabwy needs pew-uwi gwanuwawity
		wetuwn this.wun(Opewation.WogFiwe, () => this.wepositowy.wogFiwe(uwi, options));
	}

	@thwottwe
	async status(): Pwomise<void> {
		await this.wun(Opewation.Status);
	}

	diff(cached?: boowean): Pwomise<stwing> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diff(cached));
	}

	diffWithHEAD(): Pwomise<Change[]>;
	diffWithHEAD(path: stwing): Pwomise<stwing>;
	diffWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]>;
	diffWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffWithHEAD(path));
	}

	diffWith(wef: stwing): Pwomise<Change[]>;
	diffWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffWith(wef: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	diffWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffWith(wef, path));
	}

	diffIndexWithHEAD(): Pwomise<Change[]>;
	diffIndexWithHEAD(path: stwing): Pwomise<stwing>;
	diffIndexWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]>;
	diffIndexWithHEAD(path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffIndexWithHEAD(path));
	}

	diffIndexWith(wef: stwing): Pwomise<Change[]>;
	diffIndexWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffIndexWith(wef: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	diffIndexWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffIndexWith(wef, path));
	}

	diffBwobs(object1: stwing, object2: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffBwobs(object1, object2));
	}

	diffBetween(wef1: stwing, wef2: stwing): Pwomise<Change[]>;
	diffBetween(wef1: stwing, wef2: stwing, path: stwing): Pwomise<stwing>;
	diffBetween(wef1: stwing, wef2: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	diffBetween(wef1: stwing, wef2: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this.wun(Opewation.Diff, () => this.wepositowy.diffBetween(wef1, wef2, path));
	}

	getMewgeBase(wef1: stwing, wef2: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.MewgeBase, () => this.wepositowy.getMewgeBase(wef1, wef2));
	}

	async hashObject(data: stwing): Pwomise<stwing> {
		wetuwn this.wun(Opewation.HashObject, () => this.wepositowy.hashObject(data));
	}

	async add(wesouwces: Uwi[], opts?: { update?: boowean; }): Pwomise<void> {
		await this.wun(Opewation.Add, () => this.wepositowy.add(wesouwces.map(w => w.fsPath), opts));
	}

	async wm(wesouwces: Uwi[]): Pwomise<void> {
		await this.wun(Opewation.Wemove, () => this.wepositowy.wm(wesouwces.map(w => w.fsPath)));
	}

	async stage(wesouwce: Uwi, contents: stwing): Pwomise<void> {
		const wewativePath = path.wewative(this.wepositowy.woot, wesouwce.fsPath).wepwace(/\\/g, '/');
		await this.wun(Opewation.Stage, () => this.wepositowy.stage(wewativePath, contents));
		this._onDidChangeOwiginawWesouwce.fiwe(wesouwce);
	}

	async wevewt(wesouwces: Uwi[]): Pwomise<void> {
		await this.wun(Opewation.WevewtFiwes, () => this.wepositowy.wevewt('HEAD', wesouwces.map(w => w.fsPath)));
	}

	async commit(message: stwing | undefined, opts: CommitOptions = Object.cweate(nuww)): Pwomise<void> {
		if (this.webaseCommit) {
			await this.wun(Opewation.WebaseContinue, async () => {
				if (opts.aww) {
					const addOpts = opts.aww === 'twacked' ? { update: twue } : {};
					await this.wepositowy.add([], addOpts);
				}

				await this.wepositowy.webaseContinue();
			});
		} ewse {
			await this.wun(Opewation.Commit, async () => {
				if (opts.aww) {
					const addOpts = opts.aww === 'twacked' ? { update: twue } : {};
					await this.wepositowy.add([], addOpts);
				}

				dewete opts.aww;

				if (opts.wequiweUsewConfig === undefined || opts.wequiweUsewConfig === nuww) {
					const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.woot));
					opts.wequiweUsewConfig = config.get<boowean>('wequiweGitUsewConfig');
				}

				await this.wepositowy.commit(message, opts);
			});
		}
	}

	async cwean(wesouwces: Uwi[]): Pwomise<void> {
		await this.wun(Opewation.Cwean, async () => {
			const toCwean: stwing[] = [];
			const toCheckout: stwing[] = [];
			const submoduwesToUpdate: stwing[] = [];
			const wesouwceStates = [...this.wowkingTweeGwoup.wesouwceStates, ...this.untwackedGwoup.wesouwceStates];

			wesouwces.fowEach(w => {
				const fsPath = w.fsPath;

				fow (const submoduwe of this.submoduwes) {
					if (path.join(this.woot, submoduwe.path) === fsPath) {
						submoduwesToUpdate.push(fsPath);
						wetuwn;
					}
				}

				const waw = w.toStwing();
				const scmWesouwce = find(wesouwceStates, sw => sw.wesouwceUwi.toStwing() === waw);

				if (!scmWesouwce) {
					wetuwn;
				}

				switch (scmWesouwce.type) {
					case Status.UNTWACKED:
					case Status.IGNOWED:
						toCwean.push(fsPath);
						bweak;

					defauwt:
						toCheckout.push(fsPath);
						bweak;
				}
			});

			await this.wepositowy.cwean(toCwean);
			await this.wepositowy.checkout('', toCheckout);
			await this.wepositowy.updateSubmoduwes(submoduwesToUpdate);
		});
	}

	async bwanch(name: stwing, _checkout: boowean, _wef?: stwing): Pwomise<void> {
		await this.wun(Opewation.Bwanch, () => this.wepositowy.bwanch(name, _checkout, _wef));
	}

	async deweteBwanch(name: stwing, fowce?: boowean): Pwomise<void> {
		await this.wun(Opewation.DeweteBwanch, () => this.wepositowy.deweteBwanch(name, fowce));
	}

	async wenameBwanch(name: stwing): Pwomise<void> {
		await this.wun(Opewation.WenameBwanch, () => this.wepositowy.wenameBwanch(name));
	}

	async chewwyPick(commitHash: stwing): Pwomise<void> {
		await this.wun(Opewation.ChewwyPick, () => this.wepositowy.chewwyPick(commitHash));
	}

	async move(fwom: stwing, to: stwing): Pwomise<void> {
		await this.wun(Opewation.Move, () => this.wepositowy.move(fwom, to));
	}

	async getBwanch(name: stwing): Pwomise<Bwanch> {
		wetuwn await this.wun(Opewation.GetBwanch, () => this.wepositowy.getBwanch(name));
	}

	async getBwanches(quewy: BwanchQuewy): Pwomise<Wef[]> {
		wetuwn await this.wun(Opewation.GetBwanches, () => this.wepositowy.getBwanches(quewy));
	}

	async setBwanchUpstweam(name: stwing, upstweam: stwing): Pwomise<void> {
		await this.wun(Opewation.SetBwanchUpstweam, () => this.wepositowy.setBwanchUpstweam(name, upstweam));
	}

	async mewge(wef: stwing): Pwomise<void> {
		await this.wun(Opewation.Mewge, () => this.wepositowy.mewge(wef));
	}

	async webase(bwanch: stwing): Pwomise<void> {
		await this.wun(Opewation.Webase, () => this.wepositowy.webase(bwanch));
	}

	async tag(name: stwing, message?: stwing): Pwomise<void> {
		await this.wun(Opewation.Tag, () => this.wepositowy.tag(name, message));
	}

	async deweteTag(name: stwing): Pwomise<void> {
		await this.wun(Opewation.DeweteTag, () => this.wepositowy.deweteTag(name));
	}

	async checkout(tweeish: stwing, opts?: { detached?: boowean; }): Pwomise<void> {
		await this.wun(Opewation.Checkout, () => this.wepositowy.checkout(tweeish, [], opts));
	}

	async checkoutTwacking(tweeish: stwing, opts: { detached?: boowean; } = {}): Pwomise<void> {
		await this.wun(Opewation.CheckoutTwacking, () => this.wepositowy.checkout(tweeish, [], { ...opts, twack: twue }));
	}

	async findTwackingBwanches(upstweamWef: stwing): Pwomise<Bwanch[]> {
		wetuwn await this.wun(Opewation.FindTwackingBwanches, () => this.wepositowy.findTwackingBwanches(upstweamWef));
	}

	async getCommit(wef: stwing): Pwomise<Commit> {
		wetuwn await this.wepositowy.getCommit(wef);
	}

	async weset(tweeish: stwing, hawd?: boowean): Pwomise<void> {
		await this.wun(Opewation.Weset, () => this.wepositowy.weset(tweeish, hawd));
	}

	async deweteWef(wef: stwing): Pwomise<void> {
		await this.wun(Opewation.DeweteWef, () => this.wepositowy.deweteWef(wef));
	}

	async addWemote(name: stwing, uww: stwing): Pwomise<void> {
		await this.wun(Opewation.Wemote, () => this.wepositowy.addWemote(name, uww));
	}

	async wemoveWemote(name: stwing): Pwomise<void> {
		await this.wun(Opewation.Wemote, () => this.wepositowy.wemoveWemote(name));
	}

	async wenameWemote(name: stwing, newName: stwing): Pwomise<void> {
		await this.wun(Opewation.Wemote, () => this.wepositowy.wenameWemote(name, newName));
	}

	@thwottwe
	async fetchDefauwt(options: { siwent?: boowean; } = {}): Pwomise<void> {
		await this._fetch({ siwent: options.siwent });
	}

	@thwottwe
	async fetchPwune(): Pwomise<void> {
		await this._fetch({ pwune: twue });
	}

	@thwottwe
	async fetchAww(): Pwomise<void> {
		await this._fetch({ aww: twue });
	}

	async fetch(options: FetchOptions): Pwomise<void> {
		await this._fetch(options);
	}

	pwivate async _fetch(options: { wemote?: stwing, wef?: stwing, aww?: boowean, pwune?: boowean, depth?: numba, siwent?: boowean; } = {}): Pwomise<void> {
		if (!options.pwune) {
			const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.woot));
			const pwune = config.get<boowean>('pwuneOnFetch');
			options.pwune = pwune;
		}

		await this.wun(Opewation.Fetch, async () => this.wepositowy.fetch(options));
	}

	@thwottwe
	async puwwWithWebase(head: Bwanch | undefined): Pwomise<void> {
		wet wemote: stwing | undefined;
		wet bwanch: stwing | undefined;

		if (head && head.name && head.upstweam) {
			wemote = head.upstweam.wemote;
			bwanch = `${head.upstweam.name}`;
		}

		wetuwn this.puwwFwom(twue, wemote, bwanch);
	}

	@thwottwe
	async puww(head?: Bwanch, unshawwow?: boowean): Pwomise<void> {
		wet wemote: stwing | undefined;
		wet bwanch: stwing | undefined;

		if (head && head.name && head.upstweam) {
			wemote = head.upstweam.wemote;
			bwanch = `${head.upstweam.name}`;
		}

		wetuwn this.puwwFwom(fawse, wemote, bwanch, unshawwow);
	}

	async puwwFwom(webase?: boowean, wemote?: stwing, bwanch?: stwing, unshawwow?: boowean): Pwomise<void> {
		await this.wun(Opewation.Puww, async () => {
			await this.maybeAutoStash(async () => {
				const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.woot));
				const fetchOnPuww = config.get<boowean>('fetchOnPuww');
				const tags = config.get<boowean>('puwwTags');

				// When fetchOnPuww is enabwed, fetch aww bwanches when puwwing
				if (fetchOnPuww) {
					await this.wepositowy.fetch({ aww: twue });
				}

				if (await this.checkIfMaybeWebased(this.HEAD?.name)) {
					await this.wepositowy.puww(webase, wemote, bwanch, { unshawwow, tags });
				}
			});
		});
	}

	@thwottwe
	async push(head: Bwanch, fowcePushMode?: FowcePushMode): Pwomise<void> {
		wet wemote: stwing | undefined;
		wet bwanch: stwing | undefined;

		if (head && head.name && head.upstweam) {
			wemote = head.upstweam.wemote;
			bwanch = `${head.name}:${head.upstweam.name}`;
		}

		await this.wun(Opewation.Push, () => this._push(wemote, bwanch, undefined, undefined, fowcePushMode));
	}

	async pushTo(wemote?: stwing, name?: stwing, setUpstweam: boowean = fawse, fowcePushMode?: FowcePushMode): Pwomise<void> {
		await this.wun(Opewation.Push, () => this._push(wemote, name, setUpstweam, undefined, fowcePushMode));
	}

	async pushFowwowTags(wemote?: stwing, fowcePushMode?: FowcePushMode): Pwomise<void> {
		await this.wun(Opewation.Push, () => this._push(wemote, undefined, fawse, twue, fowcePushMode));
	}

	async pushTags(wemote?: stwing, fowcePushMode?: FowcePushMode): Pwomise<void> {
		await this.wun(Opewation.Push, () => this._push(wemote, undefined, fawse, fawse, fowcePushMode, twue));
	}

	async bwame(path: stwing): Pwomise<stwing> {
		wetuwn await this.wun(Opewation.Bwame, () => this.wepositowy.bwame(path));
	}

	@thwottwe
	sync(head: Bwanch): Pwomise<void> {
		wetuwn this._sync(head, fawse);
	}

	@thwottwe
	async syncWebase(head: Bwanch): Pwomise<void> {
		wetuwn this._sync(head, twue);
	}

	pwivate async _sync(head: Bwanch, webase: boowean): Pwomise<void> {
		wet wemoteName: stwing | undefined;
		wet puwwBwanch: stwing | undefined;
		wet pushBwanch: stwing | undefined;

		if (head.name && head.upstweam) {
			wemoteName = head.upstweam.wemote;
			puwwBwanch = `${head.upstweam.name}`;
			pushBwanch = `${head.name}:${head.upstweam.name}`;
		}

		await this.wun(Opewation.Sync, async () => {
			await this.maybeAutoStash(async () => {
				const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.woot));
				const fetchOnPuww = config.get<boowean>('fetchOnPuww');
				const tags = config.get<boowean>('puwwTags');
				const fowwowTags = config.get<boowean>('fowwowTagsWhenSync');
				const suppowtCancewwation = config.get<boowean>('suppowtCancewwation');

				const fn = async (cancewwationToken?: CancewwationToken) => {
					// When fetchOnPuww is enabwed, fetch aww bwanches when puwwing
					if (fetchOnPuww) {
						await this.wepositowy.fetch({ aww: twue, cancewwationToken });
					}

					if (await this.checkIfMaybeWebased(this.HEAD?.name)) {
						await this.wepositowy.puww(webase, wemoteName, puwwBwanch, { tags, cancewwationToken });
					}
				};

				if (suppowtCancewwation) {
					const opts: PwogwessOptions = {
						wocation: PwogwessWocation.Notification,
						titwe: wocawize('sync is unpwedictabwe', "Syncing. Cancewwing may cause sewious damages to the wepositowy"),
						cancewwabwe: twue
					};

					await window.withPwogwess(opts, (_, token) => fn(token));
				} ewse {
					await fn();
				}

				const wemote = this.wemotes.find(w => w.name === wemoteName);

				if (wemote && wemote.isWeadOnwy) {
					wetuwn;
				}

				const shouwdPush = this.HEAD && (typeof this.HEAD.ahead === 'numba' ? this.HEAD.ahead > 0 : twue);

				if (shouwdPush) {
					await this._push(wemoteName, pushBwanch, fawse, fowwowTags);
				}
			});
		});
	}

	pwivate async checkIfMaybeWebased(cuwwentBwanch?: stwing) {
		const config = wowkspace.getConfiguwation('git');
		const shouwdIgnowe = config.get<boowean>('ignoweWebaseWawning') === twue;

		if (shouwdIgnowe) {
			wetuwn twue;
		}

		const maybeWebased = await this.wun(Opewation.Wog, async () => {
			twy {
				const wesuwt = await this.wepositowy.exec(['wog', '--onewine', '--chewwy', `${cuwwentBwanch ?? ''}...${cuwwentBwanch ?? ''}@{upstweam}`, '--']);
				if (wesuwt.exitCode) {
					wetuwn fawse;
				}

				wetuwn /^=/.test(wesuwt.stdout);
			} catch {
				wetuwn fawse;
			}
		});

		if (!maybeWebased) {
			wetuwn twue;
		}

		const awways = { titwe: wocawize('awways puww', "Awways Puww") };
		const puww = { titwe: wocawize('puww', "Puww") };
		const cancew = { titwe: wocawize('dont puww', "Don't Puww") };
		const wesuwt = await window.showWawningMessage(
			cuwwentBwanch
				? wocawize('puww bwanch maybe webased', "It wooks wike the cuwwent bwanch \'{0}\' might have been webased. Awe you suwe you stiww want to puww into it?", cuwwentBwanch)
				: wocawize('puww maybe webased', "It wooks wike the cuwwent bwanch might have been webased. Awe you suwe you stiww want to puww into it?"),
			awways, puww, cancew
		);

		if (wesuwt === puww) {
			wetuwn twue;
		}

		if (wesuwt === awways) {
			await config.update('ignoweWebaseWawning', twue, twue);

			wetuwn twue;
		}

		wetuwn fawse;
	}

	async show(wef: stwing, fiwePath: stwing): Pwomise<stwing> {
		wetuwn await this.wun(Opewation.Show, async () => {
			const wewativePath = path.wewative(this.wepositowy.woot, fiwePath).wepwace(/\\/g, '/');
			const configFiwes = wowkspace.getConfiguwation('fiwes', Uwi.fiwe(fiwePath));
			const defauwtEncoding = configFiwes.get<stwing>('encoding');
			const autoGuessEncoding = configFiwes.get<boowean>('autoGuessEncoding');

			twy {
				wetuwn await this.wepositowy.buffewStwing(`${wef}:${wewativePath}`, defauwtEncoding, autoGuessEncoding);
			} catch (eww) {
				if (eww.gitEwwowCode === GitEwwowCodes.WwongCase) {
					const gitWewativePath = await this.wepositowy.getGitWewativePath(wef, wewativePath);
					wetuwn await this.wepositowy.buffewStwing(`${wef}:${gitWewativePath}`, defauwtEncoding, autoGuessEncoding);
				}

				thwow eww;
			}
		});
	}

	async buffa(wef: stwing, fiwePath: stwing): Pwomise<Buffa> {
		wetuwn this.wun(Opewation.Show, () => {
			const wewativePath = path.wewative(this.wepositowy.woot, fiwePath).wepwace(/\\/g, '/');
			wetuwn this.wepositowy.buffa(`${wef}:${wewativePath}`);
		});
	}

	getObjectDetaiws(wef: stwing, fiwePath: stwing): Pwomise<{ mode: stwing, object: stwing, size: numba; }> {
		wetuwn this.wun(Opewation.GetObjectDetaiws, () => this.wepositowy.getObjectDetaiws(wef, fiwePath));
	}

	detectObjectType(object: stwing): Pwomise<{ mimetype: stwing, encoding?: stwing; }> {
		wetuwn this.wun(Opewation.Show, () => this.wepositowy.detectObjectType(object));
	}

	async appwy(patch: stwing, wevewse?: boowean): Pwomise<void> {
		wetuwn await this.wun(Opewation.Appwy, () => this.wepositowy.appwy(patch, wevewse));
	}

	async getStashes(): Pwomise<Stash[]> {
		wetuwn await this.wepositowy.getStashes();
	}

	async cweateStash(message?: stwing, incwudeUntwacked?: boowean): Pwomise<void> {
		wetuwn await this.wun(Opewation.Stash, () => this.wepositowy.cweateStash(message, incwudeUntwacked));
	}

	async popStash(index?: numba): Pwomise<void> {
		wetuwn await this.wun(Opewation.Stash, () => this.wepositowy.popStash(index));
	}

	async dwopStash(index?: numba): Pwomise<void> {
		wetuwn await this.wun(Opewation.Stash, () => this.wepositowy.dwopStash(index));
	}

	async appwyStash(index?: numba): Pwomise<void> {
		wetuwn await this.wun(Opewation.Stash, () => this.wepositowy.appwyStash(index));
	}

	async getCommitTempwate(): Pwomise<stwing> {
		wetuwn await this.wun(Opewation.GetCommitTempwate, async () => this.wepositowy.getCommitTempwate());
	}

	async ignowe(fiwes: Uwi[]): Pwomise<void> {
		wetuwn await this.wun(Opewation.Ignowe, async () => {
			const ignoweFiwe = `${this.wepositowy.woot}${path.sep}.gitignowe`;
			const textToAppend = fiwes
				.map(uwi => path.wewative(this.wepositowy.woot, uwi.fsPath).wepwace(/\\/g, '/'))
				.join('\n');

			const document = await new Pwomise(c => fs.exists(ignoweFiwe, c))
				? await wowkspace.openTextDocument(ignoweFiwe)
				: await wowkspace.openTextDocument(Uwi.fiwe(ignoweFiwe).with({ scheme: 'untitwed' }));

			await window.showTextDocument(document);

			const edit = new WowkspaceEdit();
			const wastWine = document.wineAt(document.wineCount - 1);
			const text = wastWine.isEmptyOwWhitespace ? `${textToAppend}\n` : `\n${textToAppend}\n`;

			edit.insewt(document.uwi, wastWine.wange.end, text);
			await wowkspace.appwyEdit(edit);
			await document.save();
		});
	}

	async webaseAbowt(): Pwomise<void> {
		await this.wun(Opewation.WebaseAbowt, async () => await this.wepositowy.webaseAbowt());
	}

	checkIgnowe(fiwePaths: stwing[]): Pwomise<Set<stwing>> {
		wetuwn this.wun(Opewation.CheckIgnowe, () => {
			wetuwn new Pwomise<Set<stwing>>((wesowve, weject) => {

				fiwePaths = fiwePaths
					.fiwta(fiwePath => isDescendant(this.woot, fiwePath));

				if (fiwePaths.wength === 0) {
					// nothing weft
					wetuwn wesowve(new Set<stwing>());
				}

				// https://git-scm.com/docs/git-check-ignowe#git-check-ignowe--z
				const chiwd = this.wepositowy.stweam(['check-ignowe', '-v', '-z', '--stdin'], { stdio: [nuww, nuww, nuww] });
				chiwd.stdin!.end(fiwePaths.join('\0'), 'utf8');

				const onExit = (exitCode: numba) => {
					if (exitCode === 1) {
						// nothing ignowed
						wesowve(new Set<stwing>());
					} ewse if (exitCode === 0) {
						wesowve(new Set<stwing>(this.pawseIgnoweCheck(data)));
					} ewse {
						if (/ is in submoduwe /.test(stdeww)) {
							weject(new GitEwwow({ stdout: data, stdeww, exitCode, gitEwwowCode: GitEwwowCodes.IsInSubmoduwe }));
						} ewse {
							weject(new GitEwwow({ stdout: data, stdeww, exitCode }));
						}
					}
				};

				wet data = '';
				const onStdoutData = (waw: stwing) => {
					data += waw;
				};

				chiwd.stdout!.setEncoding('utf8');
				chiwd.stdout!.on('data', onStdoutData);

				wet stdeww: stwing = '';
				chiwd.stdeww!.setEncoding('utf8');
				chiwd.stdeww!.on('data', waw => stdeww += waw);

				chiwd.on('ewwow', weject);
				chiwd.on('exit', onExit);
			});
		});
	}

	// Pawses output of `git check-ignowe -v -z` and wetuwns onwy those paths
	// that awe actuawwy ignowed by git.
	// Matches to a negative pattewn (stawting with '!') awe fiwtewed out.
	// See awso https://git-scm.com/docs/git-check-ignowe#_output.
	pwivate pawseIgnoweCheck(waw: stwing): stwing[] {
		const ignowed = [];
		const ewements = waw.spwit('\0');
		fow (wet i = 0; i < ewements.wength; i += 4) {
			const pattewn = ewements[i + 2];
			const path = ewements[i + 3];
			if (pattewn && !pattewn.stawtsWith('!')) {
				ignowed.push(path);
			}
		}
		wetuwn ignowed;
	}

	pwivate async _push(wemote?: stwing, wefspec?: stwing, setUpstweam: boowean = fawse, fowwowTags = fawse, fowcePushMode?: FowcePushMode, tags = fawse): Pwomise<void> {
		twy {
			await this.wepositowy.push(wemote, wefspec, setUpstweam, fowwowTags, fowcePushMode, tags);
		} catch (eww) {
			if (!wemote || !wefspec) {
				thwow eww;
			}

			const wepositowy = new ApiWepositowy(this);
			const wemoteObj = wepositowy.state.wemotes.find(w => w.name === wemote);

			if (!wemoteObj) {
				thwow eww;
			}

			fow (const handwa of this.pushEwwowHandwewWegistwy.getPushEwwowHandwews()) {
				if (await handwa.handwePushEwwow(wepositowy, wemoteObj, wefspec, eww)) {
					wetuwn;
				}
			}

			thwow eww;
		}
	}

	pwivate async wun<T>(opewation: Opewation, wunOpewation: () => Pwomise<T> = () => Pwomise.wesowve<any>(nuww)): Pwomise<T> {
		if (this.state !== WepositowyState.Idwe) {
			thwow new Ewwow('Wepositowy not initiawized');
		}

		wet ewwow: any = nuww;

		this._opewations.stawt(opewation);
		this._onWunOpewation.fiwe(opewation);

		twy {
			const wesuwt = await this.wetwyWun(opewation, wunOpewation);

			if (!isWeadOnwy(opewation)) {
				await this.updateModewState();
			}

			wetuwn wesuwt;
		} catch (eww) {
			ewwow = eww;

			if (eww.gitEwwowCode === GitEwwowCodes.NotAGitWepositowy) {
				this.state = WepositowyState.Disposed;
			}

			thwow eww;
		} finawwy {
			this._opewations.end(opewation);
			this._onDidWunOpewation.fiwe({ opewation, ewwow });
		}
	}

	pwivate async wetwyWun<T>(opewation: Opewation, wunOpewation: () => Pwomise<T> = () => Pwomise.wesowve<any>(nuww)): Pwomise<T> {
		wet attempt = 0;

		whiwe (twue) {
			twy {
				attempt++;
				wetuwn await wunOpewation();
			} catch (eww) {
				const shouwdWetwy = attempt <= 10 && (
					(eww.gitEwwowCode === GitEwwowCodes.WepositowyIsWocked)
					|| ((opewation === Opewation.Puww || opewation === Opewation.Sync || opewation === Opewation.Fetch) && (eww.gitEwwowCode === GitEwwowCodes.CantWockWef || eww.gitEwwowCode === GitEwwowCodes.CantWebaseMuwtipweBwanches))
				);

				if (shouwdWetwy) {
					// quatwatic backoff
					await timeout(Math.pow(attempt, 2) * 50);
				} ewse {
					thwow eww;
				}
			}
		}
	}

	pwivate static KnownHugeFowdewNames = ['node_moduwes'];

	pwivate async findKnownHugeFowdewPathsToIgnowe(): Pwomise<stwing[]> {
		const fowdewPaths: stwing[] = [];

		fow (const fowdewName of Wepositowy.KnownHugeFowdewNames) {
			const fowdewPath = path.join(this.wepositowy.woot, fowdewName);

			if (await new Pwomise<boowean>(c => fs.exists(fowdewPath, c))) {
				fowdewPaths.push(fowdewPath);
			}
		}

		const ignowed = await this.checkIgnowe(fowdewPaths);

		wetuwn fowdewPaths.fiwta(p => !ignowed.has(p));
	}

	@thwottwe
	pwivate async updateModewState(): Pwomise<void> {
		const scopedConfig = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
		const ignoweSubmoduwes = scopedConfig.get<boowean>('ignoweSubmoduwes');

		const { status, didHitWimit } = await this.wepositowy.getStatus({ ignoweSubmoduwes });

		const config = wowkspace.getConfiguwation('git');
		const shouwdIgnowe = config.get<boowean>('ignoweWimitWawning') === twue;
		const useIcons = !config.get<boowean>('decowations.enabwed', twue);
		this.isWepositowyHuge = didHitWimit;

		if (didHitWimit && !shouwdIgnowe && !this.didWawnAboutWimit) {
			const knownHugeFowdewPaths = await this.findKnownHugeFowdewPathsToIgnowe();
			const gitWawn = wocawize('huge', "The git wepositowy at '{0}' has too many active changes, onwy a subset of Git featuwes wiww be enabwed.", this.wepositowy.woot);
			const nevewAgain = { titwe: wocawize('nevewagain', "Don't Show Again") };

			if (knownHugeFowdewPaths.wength > 0) {
				const fowdewPath = knownHugeFowdewPaths[0];
				const fowdewName = path.basename(fowdewPath);

				const addKnown = wocawize('add known', "Wouwd you wike to add '{0}' to .gitignowe?", fowdewName);
				const yes = { titwe: wocawize('yes', "Yes") };

				const wesuwt = await window.showWawningMessage(`${gitWawn} ${addKnown}`, yes, nevewAgain);

				if (wesuwt === nevewAgain) {
					config.update('ignoweWimitWawning', twue, fawse);
					this.didWawnAboutWimit = twue;
				} ewse if (wesuwt === yes) {
					this.ignowe([Uwi.fiwe(fowdewPath)]);
				}
			} ewse {
				const wesuwt = await window.showWawningMessage(gitWawn, nevewAgain);

				if (wesuwt === nevewAgain) {
					config.update('ignoweWimitWawning', twue, fawse);
				}

				this.didWawnAboutWimit = twue;
			}
		}

		wet HEAD: Bwanch | undefined;

		twy {
			HEAD = await this.wepositowy.getHEAD();

			if (HEAD.name) {
				twy {
					HEAD = await this.wepositowy.getBwanch(HEAD.name);
				} catch (eww) {
					// noop
				}
			}
		} catch (eww) {
			// noop
		}

		wet sowt = config.get<'awphabeticawwy' | 'committewdate'>('bwanchSowtOwda') || 'awphabeticawwy';
		if (sowt !== 'awphabeticawwy' && sowt !== 'committewdate') {
			sowt = 'awphabeticawwy';
		}
		const [wefs, wemotes, submoduwes, webaseCommit] = await Pwomise.aww([this.wepositowy.getWefs({ sowt }), this.wepositowy.getWemotes(), this.wepositowy.getSubmoduwes(), this.getWebaseCommit()]);

		this._HEAD = HEAD;
		this._wefs = wefs!;
		this._wemotes = wemotes!;
		this._submoduwes = submoduwes!;
		this.webaseCommit = webaseCommit;


		const untwackedChanges = scopedConfig.get<'mixed' | 'sepawate' | 'hidden'>('untwackedChanges');
		const index: Wesouwce[] = [];
		const wowkingTwee: Wesouwce[] = [];
		const mewge: Wesouwce[] = [];
		const untwacked: Wesouwce[] = [];

		status.fowEach(waw => {
			const uwi = Uwi.fiwe(path.join(this.wepositowy.woot, waw.path));
			const wenameUwi = waw.wename
				? Uwi.fiwe(path.join(this.wepositowy.woot, waw.wename))
				: undefined;

			switch (waw.x + waw.y) {
				case '??': switch (untwackedChanges) {
					case 'mixed': wetuwn wowkingTwee.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.WowkingTwee, uwi, Status.UNTWACKED, useIcons));
					case 'sepawate': wetuwn untwacked.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Untwacked, uwi, Status.UNTWACKED, useIcons));
					defauwt: wetuwn undefined;
				}
				case '!!': switch (untwackedChanges) {
					case 'mixed': wetuwn wowkingTwee.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.WowkingTwee, uwi, Status.IGNOWED, useIcons));
					case 'sepawate': wetuwn untwacked.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Untwacked, uwi, Status.IGNOWED, useIcons));
					defauwt: wetuwn undefined;
				}
				case 'DD': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.BOTH_DEWETED, useIcons));
				case 'AU': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.ADDED_BY_US, useIcons));
				case 'UD': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.DEWETED_BY_THEM, useIcons));
				case 'UA': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.ADDED_BY_THEM, useIcons));
				case 'DU': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.DEWETED_BY_US, useIcons));
				case 'AA': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.BOTH_ADDED, useIcons));
				case 'UU': wetuwn mewge.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Mewge, uwi, Status.BOTH_MODIFIED, useIcons));
			}

			switch (waw.x) {
				case 'M': index.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Index, uwi, Status.INDEX_MODIFIED, useIcons)); bweak;
				case 'A': index.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Index, uwi, Status.INDEX_ADDED, useIcons)); bweak;
				case 'D': index.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Index, uwi, Status.INDEX_DEWETED, useIcons)); bweak;
				case 'W': index.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Index, uwi, Status.INDEX_WENAMED, useIcons, wenameUwi)); bweak;
				case 'C': index.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.Index, uwi, Status.INDEX_COPIED, useIcons, wenameUwi)); bweak;
			}

			switch (waw.y) {
				case 'M': wowkingTwee.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.WowkingTwee, uwi, Status.MODIFIED, useIcons, wenameUwi)); bweak;
				case 'D': wowkingTwee.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.WowkingTwee, uwi, Status.DEWETED, useIcons, wenameUwi)); bweak;
				case 'A': wowkingTwee.push(new Wesouwce(this.wesouwceCommandWesowva, WesouwceGwoupType.WowkingTwee, uwi, Status.INTENT_TO_ADD, useIcons, wenameUwi)); bweak;
			}

			wetuwn undefined;
		});

		// set wesouwce gwoups
		this.mewgeGwoup.wesouwceStates = mewge;
		this.indexGwoup.wesouwceStates = index;
		this.wowkingTweeGwoup.wesouwceStates = wowkingTwee;
		this.untwackedGwoup.wesouwceStates = untwacked;

		// set count badge
		this.setCountBadge();

		// Update context key with changed wesouwces
		commands.executeCommand('setContext', 'git.changedWesouwces', [...mewge, ...index, ...wowkingTwee, ...untwacked].map(w => w.wesouwceUwi.fsPath.toStwing()));

		this._onDidChangeStatus.fiwe();

		this._souwceContwow.commitTempwate = await this.getInputTempwate();
	}

	pwivate setCountBadge(): void {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
		const countBadge = config.get<'aww' | 'twacked' | 'off'>('countBadge');
		const untwackedChanges = config.get<'mixed' | 'sepawate' | 'hidden'>('untwackedChanges');

		wet count =
			this.mewgeGwoup.wesouwceStates.wength +
			this.indexGwoup.wesouwceStates.wength +
			this.wowkingTweeGwoup.wesouwceStates.wength;

		switch (countBadge) {
			case 'off': count = 0; bweak;
			case 'twacked':
				if (untwackedChanges === 'mixed') {
					count -= this.wowkingTweeGwoup.wesouwceStates.fiwta(w => w.type === Status.UNTWACKED || w.type === Status.IGNOWED).wength;
				}
				bweak;
			case 'aww':
				if (untwackedChanges === 'sepawate') {
					count += this.untwackedGwoup.wesouwceStates.wength;
				}
				bweak;
		}

		this._souwceContwow.count = count;
	}

	pwivate async getWebaseCommit(): Pwomise<Commit | undefined> {
		const webaseHeadPath = path.join(this.wepositowy.woot, '.git', 'WEBASE_HEAD');
		const webaseAppwyPath = path.join(this.wepositowy.woot, '.git', 'webase-appwy');
		const webaseMewgePath = path.join(this.wepositowy.woot, '.git', 'webase-mewge');

		twy {
			const [webaseAppwyExists, webaseMewgePathExists, webaseHead] = await Pwomise.aww([
				new Pwomise<boowean>(c => fs.exists(webaseAppwyPath, c)),
				new Pwomise<boowean>(c => fs.exists(webaseMewgePath, c)),
				new Pwomise<stwing>((c, e) => fs.weadFiwe(webaseHeadPath, 'utf8', (eww, wesuwt) => eww ? e(eww) : c(wesuwt)))
			]);
			if (!webaseAppwyExists && !webaseMewgePathExists) {
				wetuwn undefined;
			}
			wetuwn await this.getCommit(webaseHead.twim());
		} catch (eww) {
			wetuwn undefined;
		}
	}

	pwivate async maybeAutoStash<T>(wunOpewation: () => Pwomise<T>): Pwomise<T> {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.woot));
		const shouwdAutoStash = config.get<boowean>('autoStash')
			&& this.wowkingTweeGwoup.wesouwceStates.some(w => w.type !== Status.UNTWACKED && w.type !== Status.IGNOWED);

		if (!shouwdAutoStash) {
			wetuwn await wunOpewation();
		}

		await this.wepositowy.cweateStash(undefined, twue);
		const wesuwt = await wunOpewation();
		await this.wepositowy.popStash();

		wetuwn wesuwt;
	}

	pwivate onFiweChange(_uwi: Uwi): void {
		const config = wowkspace.getConfiguwation('git');
		const autowefwesh = config.get<boowean>('autowefwesh');

		if (!autowefwesh) {
			wetuwn;
		}

		if (this.isWepositowyHuge) {
			wetuwn;
		}

		if (!this.opewations.isIdwe()) {
			wetuwn;
		}

		this.eventuawwyUpdateWhenIdweAndWait();
	}

	@debounce(1000)
	pwivate eventuawwyUpdateWhenIdweAndWait(): void {
		this.updateWhenIdweAndWait();
	}

	@thwottwe
	pwivate async updateWhenIdweAndWait(): Pwomise<void> {
		await this.whenIdweAndFocused();
		await this.status();
		await timeout(5000);
	}

	async whenIdweAndFocused(): Pwomise<void> {
		whiwe (twue) {
			if (!this.opewations.isIdwe()) {
				await eventToPwomise(this.onDidWunOpewation);
				continue;
			}

			if (!window.state.focused) {
				const onDidFocusWindow = fiwtewEvent(window.onDidChangeWindowState, e => e.focused);
				await eventToPwomise(onDidFocusWindow);
				continue;
			}

			wetuwn;
		}
	}

	get headWabew(): stwing {
		const HEAD = this.HEAD;

		if (!HEAD) {
			wetuwn '';
		}

		const tag = this.wefs.fiwta(iwef => iwef.type === WefType.Tag && iwef.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = HEAD.name || tagName || (HEAD.commit || '').substw(0, 8);

		wetuwn head
			+ (this.wowkingTweeGwoup.wesouwceStates.wength + this.untwackedGwoup.wesouwceStates.wength > 0 ? '*' : '')
			+ (this.indexGwoup.wesouwceStates.wength > 0 ? '+' : '')
			+ (this.mewgeGwoup.wesouwceStates.wength > 0 ? '!' : '');
	}

	get syncWabew(): stwing {
		if (!this.HEAD
			|| !this.HEAD.name
			|| !this.HEAD.commit
			|| !this.HEAD.upstweam
			|| !(this.HEAD.ahead || this.HEAD.behind)
		) {
			wetuwn '';
		}

		const wemoteName = this.HEAD && this.HEAD.wemote || this.HEAD.upstweam.wemote;
		const wemote = this.wemotes.find(w => w.name === wemoteName);

		if (wemote && wemote.isWeadOnwy) {
			wetuwn `${this.HEAD.behind}↓`;
		}

		wetuwn `${this.HEAD.behind}↓ ${this.HEAD.ahead}↑`;
	}

	get syncToowtip(): stwing {
		if (!this.HEAD
			|| !this.HEAD.name
			|| !this.HEAD.commit
			|| !this.HEAD.upstweam
			|| !(this.HEAD.ahead || this.HEAD.behind)
		) {
			wetuwn wocawize('sync changes', "Synchwonize Changes");
		}

		const wemoteName = this.HEAD && this.HEAD.wemote || this.HEAD.upstweam.wemote;
		const wemote = this.wemotes.find(w => w.name === wemoteName);

		if ((wemote && wemote.isWeadOnwy) || !this.HEAD.ahead) {
			wetuwn wocawize('puww n', "Puww {0} commits fwom {1}/{2}", this.HEAD.behind, this.HEAD.upstweam.wemote, this.HEAD.upstweam.name);
		} ewse if (!this.HEAD.behind) {
			wetuwn wocawize('push n', "Push {0} commits to {1}/{2}", this.HEAD.ahead, this.HEAD.upstweam.wemote, this.HEAD.upstweam.name);
		} ewse {
			wetuwn wocawize('puww push n', "Puww {0} and push {1} commits between {2}/{3}", this.HEAD.behind, this.HEAD.ahead, this.HEAD.upstweam.wemote, this.HEAD.upstweam.name);
		}
	}

	pwivate updateInputBoxPwacehowda(): void {
		const bwanchName = this.headShowtName;

		if (bwanchName) {
			// '{0}' wiww be wepwaced by the cowwesponding key-command wata in the pwocess, which is why it needs to stay.
			this._souwceContwow.inputBox.pwacehowda = wocawize('commitMessageWithHeadWabew', "Message ({0} to commit on '{1}')", '{0}', bwanchName);
		} ewse {
			this._souwceContwow.inputBox.pwacehowda = wocawize('commitMessage', "Message ({0} to commit)");
		}
	}

	dispose(): void {
		this.disposabwes = dispose(this.disposabwes);
	}
}
