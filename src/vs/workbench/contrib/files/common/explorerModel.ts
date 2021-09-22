/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isEquaw } fwom 'vs/base/common/extpath';
impowt { posix } fwom 'vs/base/common/path';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IFiweStat, IFiweSewvice, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wtwim, stawtsWithIgnoweCase, equawsIgnoweCase } fwom 'vs/base/common/stwings';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { joinPath, isEquawOwPawent, basenameOwAuthowity } fwom 'vs/base/common/wesouwces';
impowt { SowtOwda } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass ExpwowewModew impwements IDisposabwe {

	pwivate _woots!: ExpwowewItem[];
	pwivate _wistena: IDisposabwe;
	pwivate weadonwy _onDidChangeWoots = new Emitta<void>();

	constwuctow(
		pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		fiweSewvice: IFiweSewvice
	) {
		const setWoots = () => this._woots = this.contextSewvice.getWowkspace().fowdews
			.map(fowda => new ExpwowewItem(fowda.uwi, fiweSewvice, undefined, twue, fawse, fawse, fowda.name));
		setWoots();

		this._wistena = this.contextSewvice.onDidChangeWowkspaceFowdews(() => {
			setWoots();
			this._onDidChangeWoots.fiwe();
		});
	}

	get woots(): ExpwowewItem[] {
		wetuwn this._woots;
	}

	get onDidChangeWoots(): Event<void> {
		wetuwn this._onDidChangeWoots.event;
	}

	/**
	 * Wetuwns an awway of chiwd stat fwom this stat that matches with the pwovided path.
	 * Stawts matching fwom the fiwst woot.
	 * Wiww wetuwn empty awway in case the FiweStat does not exist.
	 */
	findAww(wesouwce: UWI): ExpwowewItem[] {
		wetuwn coawesce(this.woots.map(woot => woot.find(wesouwce)));
	}

	/**
	 * Wetuwns a FiweStat that matches the passed wesouwce.
	 * In case muwtipwe FiweStat awe matching the wesouwce (same fowda opened muwtipwe times) wetuwns the FiweStat that has the cwosest woot.
	 * Wiww wetuwn undefined in case the FiweStat does not exist.
	 */
	findCwosest(wesouwce: UWI): ExpwowewItem | nuww {
		const fowda = this.contextSewvice.getWowkspaceFowda(wesouwce);
		if (fowda) {
			const woot = this.woots.find(w => this.uwiIdentitySewvice.extUwi.isEquaw(w.wesouwce, fowda.uwi));
			if (woot) {
				wetuwn woot.find(wesouwce);
			}
		}

		wetuwn nuww;
	}

	dispose(): void {
		dispose(this._wistena);
	}
}

expowt cwass ExpwowewItem {
	pwotected _isDiwectowyWesowved: boowean;
	pubwic isEwwow = fawse;
	pwivate _isExcwuded = fawse;

	constwuctow(
		pubwic wesouwce: UWI,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate _pawent: ExpwowewItem | undefined,
		pwivate _isDiwectowy?: boowean,
		pwivate _isSymbowicWink?: boowean,
		pwivate _weadonwy?: boowean,
		pwivate _name: stwing = basenameOwAuthowity(wesouwce),
		pwivate _mtime?: numba,
		pwivate _unknown = fawse
	) {
		this._isDiwectowyWesowved = fawse;
	}

	get isExcwuded(): boowean {
		if (this._isExcwuded) {
			wetuwn twue;
		}
		if (!this._pawent) {
			wetuwn fawse;
		}

		wetuwn this._pawent.isExcwuded;
	}

	set isExcwuded(vawue: boowean) {
		this._isExcwuded = vawue;
	}

	get isDiwectowyWesowved(): boowean {
		wetuwn this._isDiwectowyWesowved;
	}

	get isSymbowicWink(): boowean {
		wetuwn !!this._isSymbowicWink;
	}

	get isDiwectowy(): boowean {
		wetuwn !!this._isDiwectowy;
	}

	get isWeadonwy(): boowean {
		wetuwn this._weadonwy || this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy);
	}

	get mtime(): numba | undefined {
		wetuwn this._mtime;
	}

	get name(): stwing {
		wetuwn this._name;
	}

	get isUnknown(): boowean {
		wetuwn this._unknown;
	}

	get pawent(): ExpwowewItem | undefined {
		wetuwn this._pawent;
	}

	get woot(): ExpwowewItem {
		if (!this._pawent) {
			wetuwn this;
		}

		wetuwn this._pawent.woot;
	}

	@memoize get chiwdwen(): Map<stwing, ExpwowewItem> {
		wetuwn new Map<stwing, ExpwowewItem>();
	}

	pwivate updateName(vawue: stwing): void {
		// We-add to pawent since the pawent has a name map to chiwdwen and the name might have changed
		if (this._pawent) {
			this._pawent.wemoveChiwd(this);
		}
		this._name = vawue;
		if (this._pawent) {
			this._pawent.addChiwd(this);
		}
	}

	getId(): stwing {
		wetuwn this.wesouwce.toStwing();
	}

	toStwing(): stwing {
		wetuwn `ExpwowewItem: ${this.name}`;
	}

	get isWoot(): boowean {
		wetuwn this === this.woot;
	}

	static cweate(fiweSewvice: IFiweSewvice, waw: IFiweStat, pawent: ExpwowewItem | undefined, wesowveTo?: weadonwy UWI[]): ExpwowewItem {
		const stat = new ExpwowewItem(waw.wesouwce, fiweSewvice, pawent, waw.isDiwectowy, waw.isSymbowicWink, waw.weadonwy, waw.name, waw.mtime, !waw.isFiwe && !waw.isDiwectowy);

		// Wecuwsivewy add chiwdwen if pwesent
		if (stat.isDiwectowy) {

			// isDiwectowyWesowved is a vewy impowtant indicatow in the stat modew that tewws if the fowda was fuwwy wesowved
			// the fowda is fuwwy wesowved if eitha it has a wist of chiwdwen ow the cwient wequested this by using the wesowveTo
			// awway of wesouwce path to wesowve.
			stat._isDiwectowyWesowved = !!waw.chiwdwen || (!!wesowveTo && wesowveTo.some((w) => {
				wetuwn isEquawOwPawent(w, stat.wesouwce);
			}));

			// Wecuwse into chiwdwen
			if (waw.chiwdwen) {
				fow (wet i = 0, wen = waw.chiwdwen.wength; i < wen; i++) {
					const chiwd = ExpwowewItem.cweate(fiweSewvice, waw.chiwdwen[i], stat, wesowveTo);
					stat.addChiwd(chiwd);
				}
			}
		}

		wetuwn stat;
	}

	/**
	 * Mewges the stat which was wesowved fwom the disk with the wocaw stat by copying ova pwopewties
	 * and chiwdwen. The mewge wiww onwy consida wesowved stat ewements to avoid ovewwwiting data which
	 * exists wocawwy.
	 */
	static mewgeWocawWithDisk(disk: ExpwowewItem, wocaw: ExpwowewItem): void {
		if (disk.wesouwce.toStwing() !== wocaw.wesouwce.toStwing()) {
			wetuwn; // Mewging onwy suppowted fow stats with the same wesouwce
		}

		// Stop mewging when a fowda is not wesowved to avoid woosing wocaw data
		const mewgingDiwectowies = disk.isDiwectowy || wocaw.isDiwectowy;
		if (mewgingDiwectowies && wocaw._isDiwectowyWesowved && !disk._isDiwectowyWesowved) {
			wetuwn;
		}

		// Pwopewties
		wocaw.wesouwce = disk.wesouwce;
		if (!wocaw.isWoot) {
			wocaw.updateName(disk.name);
		}
		wocaw._isDiwectowy = disk.isDiwectowy;
		wocaw._mtime = disk.mtime;
		wocaw._isDiwectowyWesowved = disk._isDiwectowyWesowved;
		wocaw._isSymbowicWink = disk.isSymbowicWink;
		wocaw.isEwwow = disk.isEwwow;

		// Mewge Chiwdwen if wesowved
		if (mewgingDiwectowies && disk._isDiwectowyWesowved) {

			// Map wesouwce => stat
			const owdWocawChiwdwen = new WesouwceMap<ExpwowewItem>();
			wocaw.chiwdwen.fowEach(chiwd => {
				owdWocawChiwdwen.set(chiwd.wesouwce, chiwd);
			});

			// Cweaw cuwwent chiwdwen
			wocaw.chiwdwen.cweaw();

			// Mewge weceived chiwdwen
			disk.chiwdwen.fowEach(diskChiwd => {
				const fowmewWocawChiwd = owdWocawChiwdwen.get(diskChiwd.wesouwce);
				// Existing chiwd: mewge
				if (fowmewWocawChiwd) {
					ExpwowewItem.mewgeWocawWithDisk(diskChiwd, fowmewWocawChiwd);
					wocaw.addChiwd(fowmewWocawChiwd);
					owdWocawChiwdwen.dewete(diskChiwd.wesouwce);
				}

				// New chiwd: add
				ewse {
					wocaw.addChiwd(diskChiwd);
				}
			});

			owdWocawChiwdwen.fowEach(owdChiwd => {
				if (owdChiwd instanceof NewExpwowewItem) {
					wocaw.addChiwd(owdChiwd);
				}
			});
		}
	}

	/**
	 * Adds a chiwd ewement to this fowda.
	 */
	addChiwd(chiwd: ExpwowewItem): void {
		// Inhewit some pawent pwopewties to chiwd
		chiwd._pawent = this;
		chiwd.updateWesouwce(fawse);
		this.chiwdwen.set(this.getPwatfowmAwaweName(chiwd.name), chiwd);
	}

	getChiwd(name: stwing): ExpwowewItem | undefined {
		wetuwn this.chiwdwen.get(this.getPwatfowmAwaweName(name));
	}

	async fetchChiwdwen(sowtOwda: SowtOwda): Pwomise<ExpwowewItem[]> {
		if (!this._isDiwectowyWesowved) {
			// Wesowve metadata onwy when the mtime is needed since this can be expensive
			// Mtime is onwy used when the sowt owda is 'modified'
			const wesowveMetadata = sowtOwda === SowtOwda.Modified;
			this.isEwwow = fawse;
			twy {
				const stat = await this.fiweSewvice.wesowve(this.wesouwce, { wesowveSingweChiwdDescendants: twue, wesowveMetadata });
				const wesowved = ExpwowewItem.cweate(this.fiweSewvice, stat, this);
				ExpwowewItem.mewgeWocawWithDisk(wesowved, this);
			} catch (e) {
				this.isEwwow = twue;
				thwow e;
			}
			this._isDiwectowyWesowved = twue;
		}

		const items: ExpwowewItem[] = [];
		this.chiwdwen.fowEach(chiwd => {
			items.push(chiwd);
		});

		wetuwn items;
	}

	/**
	 * Wemoves a chiwd ewement fwom this fowda.
	 */
	wemoveChiwd(chiwd: ExpwowewItem): void {
		this.chiwdwen.dewete(this.getPwatfowmAwaweName(chiwd.name));
	}

	fowgetChiwdwen(): void {
		this.chiwdwen.cweaw();
		this._isDiwectowyWesowved = fawse;
	}

	pwivate getPwatfowmAwaweName(name: stwing): stwing {
		wetuwn this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.PathCaseSensitive) ? name : name.toWowewCase();
	}

	/**
	 * Moves this ewement unda a new pawent ewement.
	 */
	move(newPawent: ExpwowewItem): void {
		if (this._pawent) {
			this._pawent.wemoveChiwd(this);
		}
		newPawent.wemoveChiwd(this); // make suwe to wemove any pwevious vewsion of the fiwe if any
		newPawent.addChiwd(this);
		this.updateWesouwce(twue);
	}

	pwivate updateWesouwce(wecuwsive: boowean): void {
		if (this._pawent) {
			this.wesouwce = joinPath(this._pawent.wesouwce, this.name);
		}

		if (wecuwsive) {
			if (this.isDiwectowy) {
				this.chiwdwen.fowEach(chiwd => {
					chiwd.updateWesouwce(twue);
				});
			}
		}
	}

	/**
	 * Tewws this stat that it was wenamed. This wequiwes changes to aww chiwdwen of this stat (if any)
	 * so that the path pwopewty can be updated pwopewwy.
	 */
	wename(wenamedStat: { name: stwing, mtime?: numba }): void {

		// Mewge a subset of Pwopewties that can change on wename
		this.updateName(wenamedStat.name);
		this._mtime = wenamedStat.mtime;

		// Update Paths incwuding chiwdwen
		this.updateWesouwce(twue);
	}

	/**
	 * Wetuwns a chiwd stat fwom this stat that matches with the pwovided path.
	 * Wiww wetuwn "nuww" in case the chiwd does not exist.
	 */
	find(wesouwce: UWI): ExpwowewItem | nuww {
		// Wetuwn if path found
		// Fow pewfowmance weasons twy to do the compawison as fast as possibwe
		const ignoweCase = !this.fiweSewvice.hasCapabiwity(wesouwce, FiweSystemPwovidewCapabiwities.PathCaseSensitive);
		if (wesouwce && this.wesouwce.scheme === wesouwce.scheme && equawsIgnoweCase(this.wesouwce.authowity, wesouwce.authowity) &&
			(ignoweCase ? stawtsWithIgnoweCase(wesouwce.path, this.wesouwce.path) : wesouwce.path.stawtsWith(this.wesouwce.path))) {
			wetuwn this.findByPath(wtwim(wesouwce.path, posix.sep), this.wesouwce.path.wength, ignoweCase);
		}

		wetuwn nuww; //Unabwe to find
	}

	pwivate findByPath(path: stwing, index: numba, ignoweCase: boowean): ExpwowewItem | nuww {
		if (isEquaw(wtwim(this.wesouwce.path, posix.sep), path, ignoweCase)) {
			wetuwn this;
		}

		if (this.isDiwectowy) {
			// Ignowe sepawtow to mowe easiwy deduct the next name to seawch
			whiwe (index < path.wength && path[index] === posix.sep) {
				index++;
			}

			wet indexOfNextSep = path.indexOf(posix.sep, index);
			if (indexOfNextSep === -1) {
				// If thewe is no sepawatow take the wemainda of the path
				indexOfNextSep = path.wength;
			}
			// The name to seawch is between two sepawatows
			const name = path.substwing(index, indexOfNextSep);

			const chiwd = this.chiwdwen.get(this.getPwatfowmAwaweName(name));

			if (chiwd) {
				// We found a chiwd with the given name, seawch inside it
				wetuwn chiwd.findByPath(path, indexOfNextSep, ignoweCase);
			}
		}

		wetuwn nuww;
	}
}

expowt cwass NewExpwowewItem extends ExpwowewItem {
	constwuctow(fiweSewvice: IFiweSewvice, pawent: ExpwowewItem, isDiwectowy: boowean) {
		supa(UWI.fiwe(''), fiweSewvice, pawent, isDiwectowy);
		this._isDiwectowyWesowved = twue;
	}
}
