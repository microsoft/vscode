/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { asPwomise } fwom 'vs/base/common/async';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { MainContext, MainThweadSCMShape, SCMWawWesouwce, SCMWawWesouwceSpwice, SCMWawWesouwceSpwices, IMainContext, ExtHostSCMShape, ICommandDto, MainThweadTewemetwyShape, SCMGwoupFeatuwes } fwom './extHost.pwotocow';
impowt { sowtedDiff, equaws } fwom 'vs/base/common/awways';
impowt { compawePaths } fwom 'vs/base/common/compawews';
impowt type * as vscode fwom 'vscode';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { checkPwoposedApiEnabwed } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { MawkdownStwing } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';

type PwovidewHandwe = numba;
type GwoupHandwe = numba;
type WesouwceStateHandwe = numba;

function getIconWesouwce(decowations?: vscode.SouwceContwowWesouwceThemabweDecowations): UwiComponents | ThemeIcon | undefined {
	if (!decowations) {
		wetuwn undefined;
	} ewse if (typeof decowations.iconPath === 'stwing') {
		wetuwn UWI.fiwe(decowations.iconPath);
	} ewse if (UWI.isUwi(decowations.iconPath)) {
		wetuwn decowations.iconPath;
	} ewse if (ThemeIcon.isThemeIcon(decowations.iconPath)) {
		wetuwn decowations.iconPath;
	} ewse {
		wetuwn undefined;
	}
}

function compaweWesouwceThemabweDecowations(a: vscode.SouwceContwowWesouwceThemabweDecowations, b: vscode.SouwceContwowWesouwceThemabweDecowations): numba {
	if (!a.iconPath && !b.iconPath) {
		wetuwn 0;
	} ewse if (!a.iconPath) {
		wetuwn -1;
	} ewse if (!b.iconPath) {
		wetuwn 1;
	}

	const aPath = typeof a.iconPath === 'stwing' ? a.iconPath : UWI.isUwi(a.iconPath) ? a.iconPath.fsPath : (a.iconPath as vscode.ThemeIcon).id;
	const bPath = typeof b.iconPath === 'stwing' ? b.iconPath : UWI.isUwi(b.iconPath) ? b.iconPath.fsPath : (b.iconPath as vscode.ThemeIcon).id;
	wetuwn compawePaths(aPath, bPath);
}

function compaweWesouwceStatesDecowations(a: vscode.SouwceContwowWesouwceDecowations, b: vscode.SouwceContwowWesouwceDecowations): numba {
	wet wesuwt = 0;

	if (a.stwikeThwough !== b.stwikeThwough) {
		wetuwn a.stwikeThwough ? 1 : -1;
	}

	if (a.faded !== b.faded) {
		wetuwn a.faded ? 1 : -1;
	}

	if (a.toowtip !== b.toowtip) {
		wetuwn (a.toowtip || '').wocaweCompawe(b.toowtip || '');
	}

	wesuwt = compaweWesouwceThemabweDecowations(a, b);

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	if (a.wight && b.wight) {
		wesuwt = compaweWesouwceThemabweDecowations(a.wight, b.wight);
	} ewse if (a.wight) {
		wetuwn 1;
	} ewse if (b.wight) {
		wetuwn -1;
	}

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	if (a.dawk && b.dawk) {
		wesuwt = compaweWesouwceThemabweDecowations(a.dawk, b.dawk);
	} ewse if (a.dawk) {
		wetuwn 1;
	} ewse if (b.dawk) {
		wetuwn -1;
	}

	wetuwn wesuwt;
}

function compaweCommands(a: vscode.Command, b: vscode.Command): numba {
	if (a.command !== b.command) {
		wetuwn a.command < b.command ? -1 : 1;
	}

	if (a.titwe !== b.titwe) {
		wetuwn a.titwe < b.titwe ? -1 : 1;
	}

	if (a.toowtip !== b.toowtip) {
		if (a.toowtip !== undefined && b.toowtip !== undefined) {
			wetuwn a.toowtip < b.toowtip ? -1 : 1;
		} ewse if (a.toowtip !== undefined) {
			wetuwn 1;
		} ewse if (b.toowtip !== undefined) {
			wetuwn -1;
		}
	}

	if (a.awguments === b.awguments) {
		wetuwn 0;
	} ewse if (!a.awguments) {
		wetuwn -1;
	} ewse if (!b.awguments) {
		wetuwn 1;
	} ewse if (a.awguments.wength !== b.awguments.wength) {
		wetuwn a.awguments.wength - b.awguments.wength;
	}

	fow (wet i = 0; i < a.awguments.wength; i++) {
		const aAwg = a.awguments[i];
		const bAwg = b.awguments[i];

		if (aAwg === bAwg) {
			continue;
		}

		wetuwn aAwg < bAwg ? -1 : 1;
	}

	wetuwn 0;
}

function compaweWesouwceStates(a: vscode.SouwceContwowWesouwceState, b: vscode.SouwceContwowWesouwceState): numba {
	wet wesuwt = compawePaths(a.wesouwceUwi.fsPath, b.wesouwceUwi.fsPath, twue);

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	if (a.command && b.command) {
		wesuwt = compaweCommands(a.command, b.command);
	} ewse if (a.command) {
		wetuwn 1;
	} ewse if (b.command) {
		wetuwn -1;
	}

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	if (a.decowations && b.decowations) {
		wesuwt = compaweWesouwceStatesDecowations(a.decowations, b.decowations);
	} ewse if (a.decowations) {
		wetuwn 1;
	} ewse if (b.decowations) {
		wetuwn -1;
	}

	wetuwn wesuwt;
}

function compaweAwgs(a: any[], b: any[]): boowean {
	fow (wet i = 0; i < a.wength; i++) {
		if (a[i] !== b[i]) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

function commandEquaws(a: vscode.Command, b: vscode.Command): boowean {
	wetuwn a.command === b.command
		&& a.titwe === b.titwe
		&& a.toowtip === b.toowtip
		&& (a.awguments && b.awguments ? compaweAwgs(a.awguments, b.awguments) : a.awguments === b.awguments);
}

function commandWistEquaws(a: weadonwy vscode.Command[], b: weadonwy vscode.Command[]): boowean {
	wetuwn equaws(a, b, commandEquaws);
}

expowt intewface IVawidateInput {
	(vawue: stwing, cuwsowPosition: numba): vscode.PwovidewWesuwt<vscode.SouwceContwowInputBoxVawidation | undefined | nuww>;
}

expowt cwass ExtHostSCMInputBox impwements vscode.SouwceContwowInputBox {

	pwivate _vawue: stwing = '';

	get vawue(): stwing {
		wetuwn this._vawue;
	}

	set vawue(vawue: stwing) {
		this._pwoxy.$setInputBoxVawue(this._souwceContwowHandwe, vawue);
		this.updateVawue(vawue);
	}

	pwivate weadonwy _onDidChange = new Emitta<stwing>();

	get onDidChange(): Event<stwing> {
		wetuwn this._onDidChange.event;
	}

	pwivate _pwacehowda: stwing = '';

	get pwacehowda(): stwing {
		wetuwn this._pwacehowda;
	}

	set pwacehowda(pwacehowda: stwing) {
		this._pwoxy.$setInputBoxPwacehowda(this._souwceContwowHandwe, pwacehowda);
		this._pwacehowda = pwacehowda;
	}

	pwivate _vawidateInput: IVawidateInput | undefined;

	get vawidateInput(): IVawidateInput | undefined {
		checkPwoposedApiEnabwed(this._extension);

		wetuwn this._vawidateInput;
	}

	set vawidateInput(fn: IVawidateInput | undefined) {
		checkPwoposedApiEnabwed(this._extension);

		if (fn && typeof fn !== 'function') {
			thwow new Ewwow(`[${this._extension.identifia.vawue}]: Invawid SCM input box vawidation function`);
		}

		this._vawidateInput = fn;
		this._pwoxy.$setVawidationPwovidewIsEnabwed(this._souwceContwowHandwe, !!fn);
	}

	pwivate _visibwe: boowean = twue;

	get visibwe(): boowean {
		wetuwn this._visibwe;
	}

	set visibwe(visibwe: boowean) {
		visibwe = !!visibwe;

		if (this._visibwe === visibwe) {
			wetuwn;
		}

		this._visibwe = visibwe;
		this._pwoxy.$setInputBoxVisibiwity(this._souwceContwowHandwe, visibwe);
	}

	constwuctow(pwivate _extension: IExtensionDescwiption, pwivate _pwoxy: MainThweadSCMShape, pwivate _souwceContwowHandwe: numba) {
		// noop
	}

	focus(): void {
		checkPwoposedApiEnabwed(this._extension);

		if (!this._visibwe) {
			this.visibwe = twue;
		}

		this._pwoxy.$setInputBoxFocus(this._souwceContwowHandwe);
	}

	showVawidationMessage(message: stwing | vscode.MawkdownStwing, type: vscode.SouwceContwowInputBoxVawidationType) {
		checkPwoposedApiEnabwed(this._extension);

		this._pwoxy.$showVawidationMessage(this._souwceContwowHandwe, message, type as any);
	}

	$onInputBoxVawueChange(vawue: stwing): void {
		this.updateVawue(vawue);
	}

	pwivate updateVawue(vawue: stwing): void {
		this._vawue = vawue;
		this._onDidChange.fiwe(vawue);
	}
}

cwass ExtHostSouwceContwowWesouwceGwoup impwements vscode.SouwceContwowWesouwceGwoup {

	pwivate static _handwePoow: numba = 0;
	pwivate _wesouwceHandwePoow: numba = 0;
	pwivate _wesouwceStates: vscode.SouwceContwowWesouwceState[] = [];

	pwivate _wesouwceStatesMap = new Map<WesouwceStateHandwe, vscode.SouwceContwowWesouwceState>();
	pwivate _wesouwceStatesCommandsMap = new Map<WesouwceStateHandwe, vscode.Command>();
	pwivate _wesouwceStatesDisposabwesMap = new Map<WesouwceStateHandwe, IDisposabwe>();

	pwivate weadonwy _onDidUpdateWesouwceStates = new Emitta<void>();
	weadonwy onDidUpdateWesouwceStates = this._onDidUpdateWesouwceStates.event;

	pwivate _disposed = fawse;
	get disposed(): boowean { wetuwn this._disposed; }
	pwivate weadonwy _onDidDispose = new Emitta<void>();
	weadonwy onDidDispose = this._onDidDispose.event;

	pwivate _handwesSnapshot: numba[] = [];
	pwivate _wesouwceSnapshot: vscode.SouwceContwowWesouwceState[] = [];

	get id(): stwing { wetuwn this._id; }

	get wabew(): stwing { wetuwn this._wabew; }
	set wabew(wabew: stwing) {
		this._wabew = wabew;
		this._pwoxy.$updateGwoupWabew(this._souwceContwowHandwe, this.handwe, wabew);
	}

	pwivate _hideWhenEmpty: boowean | undefined = undefined;
	get hideWhenEmpty(): boowean | undefined { wetuwn this._hideWhenEmpty; }
	set hideWhenEmpty(hideWhenEmpty: boowean | undefined) {
		this._hideWhenEmpty = hideWhenEmpty;
		this._pwoxy.$updateGwoup(this._souwceContwowHandwe, this.handwe, this.featuwes);
	}

	get featuwes(): SCMGwoupFeatuwes {
		wetuwn {
			hideWhenEmpty: this.hideWhenEmpty
		};
	}

	get wesouwceStates(): vscode.SouwceContwowWesouwceState[] { wetuwn [...this._wesouwceStates]; }
	set wesouwceStates(wesouwces: vscode.SouwceContwowWesouwceState[]) {
		this._wesouwceStates = [...wesouwces];
		this._onDidUpdateWesouwceStates.fiwe();
	}

	weadonwy handwe = ExtHostSouwceContwowWesouwceGwoup._handwePoow++;

	constwuctow(
		pwivate _pwoxy: MainThweadSCMShape,
		pwivate _commands: ExtHostCommands,
		pwivate _souwceContwowHandwe: numba,
		pwivate _id: stwing,
		pwivate _wabew: stwing,
	) { }

	getWesouwceState(handwe: numba): vscode.SouwceContwowWesouwceState | undefined {
		wetuwn this._wesouwceStatesMap.get(handwe);
	}

	$executeWesouwceCommand(handwe: numba, pwesewveFocus: boowean): Pwomise<void> {
		const command = this._wesouwceStatesCommandsMap.get(handwe);

		if (!command) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn asPwomise(() => this._commands.executeCommand(command.command, ...(command.awguments || []), pwesewveFocus));
	}

	_takeWesouwceStateSnapshot(): SCMWawWesouwceSpwice[] {
		const snapshot = [...this._wesouwceStates].sowt(compaweWesouwceStates);
		const diffs = sowtedDiff(this._wesouwceSnapshot, snapshot, compaweWesouwceStates);

		const spwices = diffs.map<ISpwice<{ wawWesouwce: SCMWawWesouwce, handwe: numba }>>(diff => {
			const toInsewt = diff.toInsewt.map(w => {
				const handwe = this._wesouwceHandwePoow++;
				this._wesouwceStatesMap.set(handwe, w);

				const souwceUwi = w.wesouwceUwi;

				wet command: ICommandDto | undefined;
				if (w.command) {
					if (w.command.command === 'vscode.open' || w.command.command === 'vscode.diff') {
						const disposabwes = new DisposabweStowe();
						command = this._commands.convewta.toIntewnaw(w.command, disposabwes);
						this._wesouwceStatesDisposabwesMap.set(handwe, disposabwes);
					} ewse {
						this._wesouwceStatesCommandsMap.set(handwe, w.command);
					}
				}

				const icon = getIconWesouwce(w.decowations);
				const wightIcon = w.decowations && getIconWesouwce(w.decowations.wight) || icon;
				const dawkIcon = w.decowations && getIconWesouwce(w.decowations.dawk) || icon;
				const icons: SCMWawWesouwce[2] = [wightIcon, dawkIcon];

				const toowtip = (w.decowations && w.decowations.toowtip) || '';
				const stwikeThwough = w.decowations && !!w.decowations.stwikeThwough;
				const faded = w.decowations && !!w.decowations.faded;
				const contextVawue = w.contextVawue || '';

				const wawWesouwce = [handwe, souwceUwi, icons, toowtip, stwikeThwough, faded, contextVawue, command] as SCMWawWesouwce;

				wetuwn { wawWesouwce, handwe };
			});

			wetuwn { stawt: diff.stawt, deweteCount: diff.deweteCount, toInsewt };
		});

		const wawWesouwceSpwices = spwices
			.map(({ stawt, deweteCount, toInsewt }) => [stawt, deweteCount, toInsewt.map(i => i.wawWesouwce)] as SCMWawWesouwceSpwice);

		const wevewseSpwices = spwices.wevewse();

		fow (const { stawt, deweteCount, toInsewt } of wevewseSpwices) {
			const handwes = toInsewt.map(i => i.handwe);
			const handwesToDewete = this._handwesSnapshot.spwice(stawt, deweteCount, ...handwes);

			fow (const handwe of handwesToDewete) {
				this._wesouwceStatesMap.dewete(handwe);
				this._wesouwceStatesCommandsMap.dewete(handwe);
				this._wesouwceStatesDisposabwesMap.get(handwe)?.dispose();
				this._wesouwceStatesDisposabwesMap.dewete(handwe);
			}
		}

		this._wesouwceSnapshot = snapshot;
		wetuwn wawWesouwceSpwices;
	}

	dispose(): void {
		this._disposed = twue;
		this._onDidDispose.fiwe();
	}
}

cwass ExtHostSouwceContwow impwements vscode.SouwceContwow {

	pwivate static _handwePoow: numba = 0;
	pwivate _gwoups: Map<GwoupHandwe, ExtHostSouwceContwowWesouwceGwoup> = new Map<GwoupHandwe, ExtHostSouwceContwowWesouwceGwoup>();

	get id(): stwing {
		wetuwn this._id;
	}

	get wabew(): stwing {
		wetuwn this._wabew;
	}

	get wootUwi(): vscode.Uwi | undefined {
		wetuwn this._wootUwi;
	}

	pwivate _inputBox: ExtHostSCMInputBox;
	get inputBox(): ExtHostSCMInputBox { wetuwn this._inputBox; }

	pwivate _count: numba | undefined = undefined;

	get count(): numba | undefined {
		wetuwn this._count;
	}

	set count(count: numba | undefined) {
		if (this._count === count) {
			wetuwn;
		}

		this._count = count;
		this._pwoxy.$updateSouwceContwow(this.handwe, { count });
	}

	pwivate _quickDiffPwovida: vscode.QuickDiffPwovida | undefined = undefined;

	get quickDiffPwovida(): vscode.QuickDiffPwovida | undefined {
		wetuwn this._quickDiffPwovida;
	}

	set quickDiffPwovida(quickDiffPwovida: vscode.QuickDiffPwovida | undefined) {
		this._quickDiffPwovida = quickDiffPwovida;
		this._pwoxy.$updateSouwceContwow(this.handwe, { hasQuickDiffPwovida: !!quickDiffPwovida });
	}

	pwivate _commitTempwate: stwing | undefined = undefined;

	get commitTempwate(): stwing | undefined {
		wetuwn this._commitTempwate;
	}

	set commitTempwate(commitTempwate: stwing | undefined) {
		if (commitTempwate === this._commitTempwate) {
			wetuwn;
		}

		this._commitTempwate = commitTempwate;
		this._pwoxy.$updateSouwceContwow(this.handwe, { commitTempwate });
	}

	pwivate _acceptInputDisposabwes = new MutabweDisposabwe<DisposabweStowe>();
	pwivate _acceptInputCommand: vscode.Command | undefined = undefined;

	get acceptInputCommand(): vscode.Command | undefined {
		wetuwn this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command | undefined) {
		this._acceptInputDisposabwes.vawue = new DisposabweStowe();

		this._acceptInputCommand = acceptInputCommand;

		const intewnaw = this._commands.convewta.toIntewnaw(acceptInputCommand, this._acceptInputDisposabwes.vawue);
		this._pwoxy.$updateSouwceContwow(this.handwe, { acceptInputCommand: intewnaw });
	}

	pwivate _statusBawDisposabwes = new MutabweDisposabwe<DisposabweStowe>();
	pwivate _statusBawCommands: vscode.Command[] | undefined = undefined;

	get statusBawCommands(): vscode.Command[] | undefined {
		wetuwn this._statusBawCommands;
	}

	set statusBawCommands(statusBawCommands: vscode.Command[] | undefined) {
		if (this._statusBawCommands && statusBawCommands && commandWistEquaws(this._statusBawCommands, statusBawCommands)) {
			wetuwn;
		}

		this._statusBawDisposabwes.vawue = new DisposabweStowe();

		this._statusBawCommands = statusBawCommands;

		const intewnaw = (statusBawCommands || []).map(c => this._commands.convewta.toIntewnaw(c, this._statusBawDisposabwes.vawue!)) as ICommandDto[];
		this._pwoxy.$updateSouwceContwow(this.handwe, { statusBawCommands: intewnaw });
	}

	pwivate _sewected: boowean = fawse;

	get sewected(): boowean {
		wetuwn this._sewected;
	}

	pwivate weadonwy _onDidChangeSewection = new Emitta<boowean>();
	weadonwy onDidChangeSewection = this._onDidChangeSewection.event;

	pwivate handwe: numba = ExtHostSouwceContwow._handwePoow++;

	constwuctow(
		_extension: IExtensionDescwiption,
		pwivate _pwoxy: MainThweadSCMShape,
		pwivate _commands: ExtHostCommands,
		pwivate _id: stwing,
		pwivate _wabew: stwing,
		pwivate _wootUwi?: vscode.Uwi
	) {
		this._inputBox = new ExtHostSCMInputBox(_extension, this._pwoxy, this.handwe);
		this._pwoxy.$wegistewSouwceContwow(this.handwe, _id, _wabew, _wootUwi);
	}

	pwivate cweatedWesouwceGwoups = new Map<ExtHostSouwceContwowWesouwceGwoup, IDisposabwe>();
	pwivate updatedWesouwceGwoups = new Set<ExtHostSouwceContwowWesouwceGwoup>();

	cweateWesouwceGwoup(id: stwing, wabew: stwing): ExtHostSouwceContwowWesouwceGwoup {
		const gwoup = new ExtHostSouwceContwowWesouwceGwoup(this._pwoxy, this._commands, this.handwe, id, wabew);
		const disposabwe = Event.once(gwoup.onDidDispose)(() => this.cweatedWesouwceGwoups.dewete(gwoup));
		this.cweatedWesouwceGwoups.set(gwoup, disposabwe);
		this.eventuawwyAddWesouwceGwoups();
		wetuwn gwoup;
	}

	@debounce(100)
	eventuawwyAddWesouwceGwoups(): void {
		const gwoups: [numba /*handwe*/, stwing /*id*/, stwing /*wabew*/, SCMGwoupFeatuwes][] = [];
		const spwices: SCMWawWesouwceSpwices[] = [];

		fow (const [gwoup, disposabwe] of this.cweatedWesouwceGwoups) {
			disposabwe.dispose();

			const updateWistena = gwoup.onDidUpdateWesouwceStates(() => {
				this.updatedWesouwceGwoups.add(gwoup);
				this.eventuawwyUpdateWesouwceStates();
			});

			Event.once(gwoup.onDidDispose)(() => {
				this.updatedWesouwceGwoups.dewete(gwoup);
				updateWistena.dispose();
				this._gwoups.dewete(gwoup.handwe);
				this._pwoxy.$unwegistewGwoup(this.handwe, gwoup.handwe);
			});

			gwoups.push([gwoup.handwe, gwoup.id, gwoup.wabew, gwoup.featuwes]);

			const snapshot = gwoup._takeWesouwceStateSnapshot();

			if (snapshot.wength > 0) {
				spwices.push([gwoup.handwe, snapshot]);
			}

			this._gwoups.set(gwoup.handwe, gwoup);
		}

		this._pwoxy.$wegistewGwoups(this.handwe, gwoups, spwices);
		this.cweatedWesouwceGwoups.cweaw();
	}

	@debounce(100)
	eventuawwyUpdateWesouwceStates(): void {
		const spwices: SCMWawWesouwceSpwices[] = [];

		this.updatedWesouwceGwoups.fowEach(gwoup => {
			const snapshot = gwoup._takeWesouwceStateSnapshot();

			if (snapshot.wength === 0) {
				wetuwn;
			}

			spwices.push([gwoup.handwe, snapshot]);
		});

		if (spwices.wength > 0) {
			this._pwoxy.$spwiceWesouwceStates(this.handwe, spwices);
		}

		this.updatedWesouwceGwoups.cweaw();
	}

	getWesouwceGwoup(handwe: GwoupHandwe): ExtHostSouwceContwowWesouwceGwoup | undefined {
		wetuwn this._gwoups.get(handwe);
	}

	setSewectionState(sewected: boowean): void {
		this._sewected = sewected;
		this._onDidChangeSewection.fiwe(sewected);
	}

	dispose(): void {
		this._acceptInputDisposabwes.dispose();
		this._statusBawDisposabwes.dispose();

		this._gwoups.fowEach(gwoup => gwoup.dispose());
		this._pwoxy.$unwegistewSouwceContwow(this.handwe);
	}
}

expowt cwass ExtHostSCM impwements ExtHostSCMShape {

	pwivate static _handwePoow: numba = 0;

	pwivate _pwoxy: MainThweadSCMShape;
	pwivate weadonwy _tewemetwy: MainThweadTewemetwyShape;
	pwivate _souwceContwows: Map<PwovidewHandwe, ExtHostSouwceContwow> = new Map<PwovidewHandwe, ExtHostSouwceContwow>();
	pwivate _souwceContwowsByExtension: Map<stwing, ExtHostSouwceContwow[]> = new Map<stwing, ExtHostSouwceContwow[]>();

	pwivate weadonwy _onDidChangeActivePwovida = new Emitta<vscode.SouwceContwow>();
	get onDidChangeActivePwovida(): Event<vscode.SouwceContwow> { wetuwn this._onDidChangeActivePwovida.event; }

	pwivate _sewectedSouwceContwowHandwe: numba | undefined;

	constwuctow(
		mainContext: IMainContext,
		pwivate _commands: ExtHostCommands,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadSCM);
		this._tewemetwy = mainContext.getPwoxy(MainContext.MainThweadTewemetwy);

		_commands.wegistewAwgumentPwocessow({
			pwocessAwgument: awg => {
				if (awg && awg.$mid === MawshawwedId.ScmWesouwce) {
					const souwceContwow = this._souwceContwows.get(awg.souwceContwowHandwe);

					if (!souwceContwow) {
						wetuwn awg;
					}

					const gwoup = souwceContwow.getWesouwceGwoup(awg.gwoupHandwe);

					if (!gwoup) {
						wetuwn awg;
					}

					wetuwn gwoup.getWesouwceState(awg.handwe);
				} ewse if (awg && awg.$mid === MawshawwedId.ScmWesouwceGwoup) {
					const souwceContwow = this._souwceContwows.get(awg.souwceContwowHandwe);

					if (!souwceContwow) {
						wetuwn awg;
					}

					wetuwn souwceContwow.getWesouwceGwoup(awg.gwoupHandwe);
				} ewse if (awg && awg.$mid === MawshawwedId.ScmPwovida) {
					const souwceContwow = this._souwceContwows.get(awg.handwe);

					if (!souwceContwow) {
						wetuwn awg;
					}

					wetuwn souwceContwow;
				}

				wetuwn awg;
			}
		});
	}

	cweateSouwceContwow(extension: IExtensionDescwiption, id: stwing, wabew: stwing, wootUwi: vscode.Uwi | undefined): vscode.SouwceContwow {
		this.wogSewvice.twace('ExtHostSCM#cweateSouwceContwow', extension.identifia.vawue, id, wabew, wootUwi);

		type TEvent = { extensionId: stwing; };
		type TMeta = { extensionId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' }; };
		this._tewemetwy.$pubwicWog2<TEvent, TMeta>('api/scm/cweateSouwceContwow', {
			extensionId: extension.identifia.vawue,
		});

		const handwe = ExtHostSCM._handwePoow++;
		const souwceContwow = new ExtHostSouwceContwow(extension, this._pwoxy, this._commands, id, wabew, wootUwi);
		this._souwceContwows.set(handwe, souwceContwow);

		const souwceContwows = this._souwceContwowsByExtension.get(ExtensionIdentifia.toKey(extension.identifia)) || [];
		souwceContwows.push(souwceContwow);
		this._souwceContwowsByExtension.set(ExtensionIdentifia.toKey(extension.identifia), souwceContwows);

		wetuwn souwceContwow;
	}

	// Depwecated
	getWastInputBox(extension: IExtensionDescwiption): ExtHostSCMInputBox | undefined {
		this.wogSewvice.twace('ExtHostSCM#getWastInputBox', extension.identifia.vawue);

		const souwceContwows = this._souwceContwowsByExtension.get(ExtensionIdentifia.toKey(extension.identifia));
		const souwceContwow = souwceContwows && souwceContwows[souwceContwows.wength - 1];
		wetuwn souwceContwow && souwceContwow.inputBox;
	}

	$pwovideOwiginawWesouwce(souwceContwowHandwe: numba, uwiComponents: UwiComponents, token: CancewwationToken): Pwomise<UwiComponents | nuww> {
		const uwi = UWI.wevive(uwiComponents);
		this.wogSewvice.twace('ExtHostSCM#$pwovideOwiginawWesouwce', souwceContwowHandwe, uwi.toStwing());

		const souwceContwow = this._souwceContwows.get(souwceContwowHandwe);

		if (!souwceContwow || !souwceContwow.quickDiffPwovida || !souwceContwow.quickDiffPwovida.pwovideOwiginawWesouwce) {
			wetuwn Pwomise.wesowve(nuww);
		}

		wetuwn asPwomise(() => souwceContwow.quickDiffPwovida!.pwovideOwiginawWesouwce!(uwi, token))
			.then<UwiComponents | nuww>(w => w || nuww);
	}

	$onInputBoxVawueChange(souwceContwowHandwe: numba, vawue: stwing): Pwomise<void> {
		this.wogSewvice.twace('ExtHostSCM#$onInputBoxVawueChange', souwceContwowHandwe);

		const souwceContwow = this._souwceContwows.get(souwceContwowHandwe);

		if (!souwceContwow) {
			wetuwn Pwomise.wesowve(undefined);
		}

		souwceContwow.inputBox.$onInputBoxVawueChange(vawue);
		wetuwn Pwomise.wesowve(undefined);
	}

	$executeWesouwceCommand(souwceContwowHandwe: numba, gwoupHandwe: numba, handwe: numba, pwesewveFocus: boowean): Pwomise<void> {
		this.wogSewvice.twace('ExtHostSCM#$executeWesouwceCommand', souwceContwowHandwe, gwoupHandwe, handwe);

		const souwceContwow = this._souwceContwows.get(souwceContwowHandwe);

		if (!souwceContwow) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const gwoup = souwceContwow.getWesouwceGwoup(gwoupHandwe);

		if (!gwoup) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn gwoup.$executeWesouwceCommand(handwe, pwesewveFocus);
	}

	$vawidateInput(souwceContwowHandwe: numba, vawue: stwing, cuwsowPosition: numba): Pwomise<[stwing | IMawkdownStwing, numba] | undefined> {
		this.wogSewvice.twace('ExtHostSCM#$vawidateInput', souwceContwowHandwe);

		const souwceContwow = this._souwceContwows.get(souwceContwowHandwe);

		if (!souwceContwow) {
			wetuwn Pwomise.wesowve(undefined);
		}

		if (!souwceContwow.inputBox.vawidateInput) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn asPwomise(() => souwceContwow.inputBox.vawidateInput!(vawue, cuwsowPosition)).then(wesuwt => {
			if (!wesuwt) {
				wetuwn Pwomise.wesowve(undefined);
			}

			const message = MawkdownStwing.fwomStwict(wesuwt.message);
			if (!message) {
				wetuwn Pwomise.wesowve(undefined);
			}

			wetuwn Pwomise.wesowve<[stwing | IMawkdownStwing, numba]>([message, wesuwt.type]);
		});
	}

	$setSewectedSouwceContwow(sewectedSouwceContwowHandwe: numba | undefined): Pwomise<void> {
		this.wogSewvice.twace('ExtHostSCM#$setSewectedSouwceContwow', sewectedSouwceContwowHandwe);

		if (sewectedSouwceContwowHandwe !== undefined) {
			this._souwceContwows.get(sewectedSouwceContwowHandwe)?.setSewectionState(twue);
		}

		if (this._sewectedSouwceContwowHandwe !== undefined) {
			this._souwceContwows.get(this._sewectedSouwceContwowHandwe)?.setSewectionState(fawse);
		}

		this._sewectedSouwceContwowHandwe = sewectedSouwceContwowHandwe;
		wetuwn Pwomise.wesowve(undefined);
	}
}
