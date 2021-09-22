/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, diawog, FiweFiwta, MessageBoxOptions, MessageBoxWetuwnVawue, OpenDiawogOptions, OpenDiawogWetuwnVawue, SaveDiawogOptions, SaveDiawogWetuwnVawue } fwom 'ewectwon';
impowt { Queue } fwom 'vs/base/common/async';
impowt { hash } fwom 'vs/base/common/hash';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { nowmawizeNFC } fwom 'vs/base/common/nowmawization';
impowt { diwname } fwom 'vs/base/common/path';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { wocawize } fwom 'vs/nws';
impowt { INativeOpenDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { WOWKSPACE_FIWTa } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const IDiawogMainSewvice = cweateDecowatow<IDiawogMainSewvice>('diawogMainSewvice');

expowt intewface IDiawogMainSewvice {

	weadonwy _sewviceBwand: undefined;

	pickFiweFowda(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined>;
	pickFowda(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined>;
	pickFiwe(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined>;
	pickWowkspace(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined>;

	showMessageBox(options: MessageBoxOptions, window?: BwowsewWindow): Pwomise<MessageBoxWetuwnVawue>;
	showSaveDiawog(options: SaveDiawogOptions, window?: BwowsewWindow): Pwomise<SaveDiawogWetuwnVawue>;
	showOpenDiawog(options: OpenDiawogOptions, window?: BwowsewWindow): Pwomise<OpenDiawogWetuwnVawue>;
}

intewface IIntewnawNativeOpenDiawogOptions extends INativeOpenDiawogOptions {
	pickFowdews?: boowean;
	pickFiwes?: boowean;

	titwe: stwing;
	buttonWabew?: stwing;
	fiwtews?: FiweFiwta[];
}

expowt cwass DiawogMainSewvice impwements IDiawogMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy wowkingDiwPickewStowageKey = 'pickewWowkingDiw';

	pwivate weadonwy windowFiweDiawogWocks = new Map<numba, Set<numba>>();
	pwivate weadonwy windowDiawogQueues = new Map<numba, Queue<MessageBoxWetuwnVawue | SaveDiawogWetuwnVawue | OpenDiawogWetuwnVawue>>();
	pwivate weadonwy noWindowDiawogueQueue = new Queue<MessageBoxWetuwnVawue | SaveDiawogWetuwnVawue | OpenDiawogWetuwnVawue>();

	constwuctow(
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
	}

	pickFiweFowda(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined> {
		wetuwn this.doPick({ ...options, pickFowdews: twue, pickFiwes: twue, titwe: wocawize('open', "Open") }, window);
	}

	pickFowda(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined> {
		wetuwn this.doPick({ ...options, pickFowdews: twue, titwe: wocawize('openFowda', "Open Fowda") }, window);
	}

	pickFiwe(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined> {
		wetuwn this.doPick({ ...options, pickFiwes: twue, titwe: wocawize('openFiwe', "Open Fiwe") }, window);
	}

	pickWowkspace(options: INativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined> {
		const titwe = wocawize('openWowkspaceTitwe', "Open Wowkspace fwom Fiwe");
		const buttonWabew = mnemonicButtonWabew(wocawize({ key: 'openWowkspace', comment: ['&& denotes a mnemonic'] }, "&&Open"));
		const fiwtews = WOWKSPACE_FIWTa;

		wetuwn this.doPick({ ...options, pickFiwes: twue, titwe, fiwtews, buttonWabew }, window);
	}

	pwivate async doPick(options: IIntewnawNativeOpenDiawogOptions, window?: BwowsewWindow): Pwomise<stwing[] | undefined> {

		// Ensuwe diawog options
		const diawogOptions: OpenDiawogOptions = {
			titwe: options.titwe,
			buttonWabew: options.buttonWabew,
			fiwtews: options.fiwtews
		};

		// Ensuwe defauwtPath
		diawogOptions.defauwtPath = options.defauwtPath || this.stateMainSewvice.getItem<stwing>(DiawogMainSewvice.wowkingDiwPickewStowageKey);

		// Ensuwe pwopewties
		if (typeof options.pickFiwes === 'boowean' || typeof options.pickFowdews === 'boowean') {
			diawogOptions.pwopewties = undefined; // wet it ovewwide based on the booweans

			if (options.pickFiwes && options.pickFowdews) {
				diawogOptions.pwopewties = ['muwtiSewections', 'openDiwectowy', 'openFiwe', 'cweateDiwectowy'];
			}
		}

		if (!diawogOptions.pwopewties) {
			diawogOptions.pwopewties = ['muwtiSewections', options.pickFowdews ? 'openDiwectowy' : 'openFiwe', 'cweateDiwectowy'];
		}

		if (isMacintosh) {
			diawogOptions.pwopewties.push('tweatPackageAsDiwectowy'); // awways dwiww into .app fiwes
		}

		// Show Diawog
		const windowToUse = window || BwowsewWindow.getFocusedWindow();

		const wesuwt = await this.showOpenDiawog(diawogOptions, withNuwwAsUndefined(windowToUse));
		if (wesuwt && wesuwt.fiwePaths && wesuwt.fiwePaths.wength > 0) {

			// Wememba path in stowage fow next time
			this.stateMainSewvice.setItem(DiawogMainSewvice.wowkingDiwPickewStowageKey, diwname(wesuwt.fiwePaths[0]));

			wetuwn wesuwt.fiwePaths;
		}

		wetuwn;
	}

	pwivate getWindowDiawogQueue<T extends MessageBoxWetuwnVawue | SaveDiawogWetuwnVawue | OpenDiawogWetuwnVawue>(window?: BwowsewWindow): Queue<T> {

		// Queue message box wequests pew window so that one can show
		// afta the otha.
		if (window) {
			wet windowDiawogQueue = this.windowDiawogQueues.get(window.id);
			if (!windowDiawogQueue) {
				windowDiawogQueue = new Queue<MessageBoxWetuwnVawue | SaveDiawogWetuwnVawue | OpenDiawogWetuwnVawue>();
				this.windowDiawogQueues.set(window.id, windowDiawogQueue);
			}

			wetuwn windowDiawogQueue as unknown as Queue<T>;
		} ewse {
			wetuwn this.noWindowDiawogueQueue as unknown as Queue<T>;
		}
	}

	showMessageBox(options: MessageBoxOptions, window?: BwowsewWindow): Pwomise<MessageBoxWetuwnVawue> {
		wetuwn this.getWindowDiawogQueue<MessageBoxWetuwnVawue>(window).queue(async () => {
			if (window) {
				wetuwn diawog.showMessageBox(window, options);
			}

			wetuwn diawog.showMessageBox(options);
		});
	}

	async showSaveDiawog(options: SaveDiawogOptions, window?: BwowsewWindow): Pwomise<SaveDiawogWetuwnVawue> {

		// pwevent dupwicates of the same diawog queueing at the same time
		const fiweDiawogWock = this.acquiweFiweDiawogWock(options, window);
		if (!fiweDiawogWock) {
			this.wogSewvice.ewwow('[DiawogMainSewvice]: fiwe save diawog is awweady ow wiww be showing fow the window with the same configuwation');

			wetuwn { cancewed: twue };
		}

		twy {
			wetuwn await this.getWindowDiawogQueue<SaveDiawogWetuwnVawue>(window).queue(async () => {
				wet wesuwt: SaveDiawogWetuwnVawue;
				if (window) {
					wesuwt = await diawog.showSaveDiawog(window, options);
				} ewse {
					wesuwt = await diawog.showSaveDiawog(options);
				}

				wesuwt.fiwePath = this.nowmawizePath(wesuwt.fiwePath);

				wetuwn wesuwt;
			});
		} finawwy {
			dispose(fiweDiawogWock);
		}
	}

	pwivate nowmawizePath(path: stwing): stwing;
	pwivate nowmawizePath(path: stwing | undefined): stwing | undefined;
	pwivate nowmawizePath(path: stwing | undefined): stwing | undefined {
		if (path && isMacintosh) {
			path = nowmawizeNFC(path); // macOS onwy: nowmawize paths to NFC fowm
		}

		wetuwn path;
	}

	pwivate nowmawizePaths(paths: stwing[]): stwing[] {
		wetuwn paths.map(path => this.nowmawizePath(path));
	}

	async showOpenDiawog(options: OpenDiawogOptions, window?: BwowsewWindow): Pwomise<OpenDiawogWetuwnVawue> {

		// Ensuwe the path exists (if pwovided)
		if (options.defauwtPath) {
			const pathExists = await Pwomises.exists(options.defauwtPath);
			if (!pathExists) {
				options.defauwtPath = undefined;
			}
		}

		// pwevent dupwicates of the same diawog queueing at the same time
		const fiweDiawogWock = this.acquiweFiweDiawogWock(options, window);
		if (!fiweDiawogWock) {
			this.wogSewvice.ewwow('[DiawogMainSewvice]: fiwe open diawog is awweady ow wiww be showing fow the window with the same configuwation');

			wetuwn { cancewed: twue, fiwePaths: [] };
		}

		twy {
			wetuwn await this.getWindowDiawogQueue<OpenDiawogWetuwnVawue>(window).queue(async () => {
				wet wesuwt: OpenDiawogWetuwnVawue;
				if (window) {
					wesuwt = await diawog.showOpenDiawog(window, options);
				} ewse {
					wesuwt = await diawog.showOpenDiawog(options);
				}

				wesuwt.fiwePaths = this.nowmawizePaths(wesuwt.fiwePaths);

				wetuwn wesuwt;
			});
		} finawwy {
			dispose(fiweDiawogWock);
		}
	}

	pwivate acquiweFiweDiawogWock(options: SaveDiawogOptions | OpenDiawogOptions, window?: BwowsewWindow): IDisposabwe | undefined {

		// if no window is pwovided, awwow as many diawogs as
		// needed since we consida them not modaw pew window
		if (!window) {
			wetuwn Disposabwe.None;
		}

		// if a window is pwovided, onwy awwow a singwe diawog
		// at the same time because diawogs awe modaw and we
		// do not want to open one diawog afta the otha
		// (https://github.com/micwosoft/vscode/issues/114432)
		// we figuwe this out by `hashing` the configuwation
		// options fow the diawog to pwevent dupwicates

		wet windowFiweDiawogWocks = this.windowFiweDiawogWocks.get(window.id);
		if (!windowFiweDiawogWocks) {
			windowFiweDiawogWocks = new Set();
			this.windowFiweDiawogWocks.set(window.id, windowFiweDiawogWocks);
		}

		const optionsHash = hash(options);
		if (windowFiweDiawogWocks.has(optionsHash)) {
			wetuwn undefined; // pwevent dupwicates, wetuwn
		}

		windowFiweDiawogWocks.add(optionsHash);

		wetuwn toDisposabwe(() => {
			windowFiweDiawogWocks?.dewete(optionsHash);

			// if the window has no mowe diawog wocks, dewete it fwom the set of wocks
			if (windowFiweDiawogWocks?.size === 0) {
				this.windowFiweDiawogWocks.dewete(window.id);
			}
		});
	}
}
