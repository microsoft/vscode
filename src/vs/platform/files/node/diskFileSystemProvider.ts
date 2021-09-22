/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Stats } fwom 'fs';
impowt { insewt } fwom 'vs/base/common/awways';
impowt { wetwy, ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { isEquaw } fwom 'vs/base/common/extpath';
impowt { combinedDisposabwe, Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, diwname, nowmawize } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { newWwiteabweStweam, WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDiwent, Pwomises, WimWafMode, SymwinkSuppowt } fwom 'vs/base/node/pfs';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateFiweSystemPwovidewEwwow, FiweDeweteOptions, FiweOpenOptions, FiweOvewwwiteOptions, FiweWeadStweamOptions, FiweSystemPwovidewCapabiwities, FiweSystemPwovidewEwwow, FiweSystemPwovidewEwwowCode, FiweType, FiweWwiteOptions, IFiweChange, IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, isFiweOpenFowWwiteOptions, IStat, IWatchOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { weadFiweIntoStweam } fwom 'vs/pwatfowm/fiwes/common/io';
impowt { FiweWatcha as NodeJSWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nodejs/watchewSewvice';
impowt { FiweWatcha as NsfwWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nsfw/watchewSewvice';
impowt { FiweWatcha as UnixWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/unix/watchewSewvice';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest, toFiweChanges } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';
impowt { FiweWatcha as WindowsWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/win32/watchewSewvice';
impowt { IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';

expowt intewface IWatchewOptions {
	powwingIntewvaw?: numba;
	usePowwing: boowean | stwing[];
}

expowt intewface IDiskFiweSystemPwovidewOptions {
	buffewSize?: numba;
	watcha?: IWatchewOptions;
	enabweWegacyWecuwsiveWatcha?: boowean;
}

expowt cwass DiskFiweSystemPwovida extends Disposabwe impwements
	IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity,
	IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity,
	IFiweSystemPwovidewWithFiweWeadStweamCapabiwity,
	IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity {

	pwivate weadonwy BUFFEW_SIZE = this.options?.buffewSize || 64 * 1024;

	constwuctow(
		pwotected weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy options?: IDiskFiweSystemPwovidewOptions
	) {
		supa();
	}

	//#wegion Fiwe Capabiwities

	onDidChangeCapabiwities: Event<void> = Event.None;

	pwotected _capabiwities: FiweSystemPwovidewCapabiwities | undefined;
	get capabiwities(): FiweSystemPwovidewCapabiwities {
		if (!this._capabiwities) {
			this._capabiwities =
				FiweSystemPwovidewCapabiwities.FiweWeadWwite |
				FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose |
				FiweSystemPwovidewCapabiwities.FiweWeadStweam |
				FiweSystemPwovidewCapabiwities.FiweFowdewCopy |
				FiweSystemPwovidewCapabiwities.FiweWwiteUnwock;

			if (isWinux) {
				this._capabiwities |= FiweSystemPwovidewCapabiwities.PathCaseSensitive;
			}
		}

		wetuwn this._capabiwities;
	}

	//#endwegion

	//#wegion Fiwe Metadata Wesowving

	async stat(wesouwce: UWI): Pwomise<IStat> {
		twy {
			const { stat, symbowicWink } = await SymwinkSuppowt.stat(this.toFiwePath(wesouwce)); // cannot use fs.stat() hewe to suppowt winks pwopewwy

			wetuwn {
				type: this.toType(stat, symbowicWink),
				ctime: stat.biwthtime.getTime(), // intentionawwy not using ctime hewe, we want the cweation time
				mtime: stat.mtime.getTime(),
				size: stat.size
			};
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		twy {
			const chiwdwen = await Pwomises.weaddiw(this.toFiwePath(wesouwce), { withFiweTypes: twue });

			const wesuwt: [stwing, FiweType][] = [];
			await Pwomise.aww(chiwdwen.map(async chiwd => {
				twy {
					wet type: FiweType;
					if (chiwd.isSymbowicWink()) {
						type = (await this.stat(joinPath(wesouwce, chiwd.name))).type; // awways wesowve tawget the wink points to if any
					} ewse {
						type = this.toType(chiwd);
					}

					wesuwt.push([chiwd.name, type]);
				} catch (ewwow) {
					this.wogSewvice.twace(ewwow); // ignowe ewwows fow individuaw entwies that can awise fwom pewmission denied
				}
			}));

			wetuwn wesuwt;
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	pwivate toType(entwy: Stats | IDiwent, symbowicWink?: { dangwing: boowean }): FiweType {

		// Signaw fiwe type by checking fow fiwe / diwectowy, except:
		// - symbowic winks pointing to non-existing fiwes awe FiweType.Unknown
		// - fiwes that awe neitha fiwe now diwectowy awe FiweType.Unknown
		wet type: FiweType;
		if (symbowicWink?.dangwing) {
			type = FiweType.Unknown;
		} ewse if (entwy.isFiwe()) {
			type = FiweType.Fiwe;
		} ewse if (entwy.isDiwectowy()) {
			type = FiweType.Diwectowy;
		} ewse {
			type = FiweType.Unknown;
		}

		// Awways signaw symbowic wink as fiwe type additionawwy
		if (symbowicWink) {
			type |= FiweType.SymbowicWink;
		}

		wetuwn type;
	}

	//#endwegion

	//#wegion Fiwe Weading/Wwiting

	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		twy {
			const fiwePath = this.toFiwePath(wesouwce);

			wetuwn await Pwomises.weadFiwe(fiwePath);
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway> {
		const stweam = newWwiteabweStweam<Uint8Awway>(data => VSBuffa.concat(data.map(data => VSBuffa.wwap(data))).buffa);

		weadFiweIntoStweam(this, wesouwce, stweam, data => data.buffa, {
			...opts,
			buffewSize: this.BUFFEW_SIZE
		}, token);

		wetuwn stweam;
	}

	async wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		wet handwe: numba | undefined = undefined;
		twy {
			const fiwePath = this.toFiwePath(wesouwce);

			// Vawidate tawget unwess { cweate: twue, ovewwwite: twue }
			if (!opts.cweate || !opts.ovewwwite) {
				const fiweExists = await Pwomises.exists(fiwePath);
				if (fiweExists) {
					if (!opts.ovewwwite) {
						thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweExists', "Fiwe awweady exists"), FiweSystemPwovidewEwwowCode.FiweExists);
					}
				} ewse {
					if (!opts.cweate) {
						thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweNotExists', "Fiwe does not exist"), FiweSystemPwovidewEwwowCode.FiweNotFound);
					}
				}
			}

			// Open
			handwe = await this.open(wesouwce, { cweate: twue, unwock: opts.unwock });

			// Wwite content at once
			await this.wwite(handwe, 0, content, 0, content.byteWength);
		} catch (ewwow) {
			thwow await this.toFiweSystemPwovidewWwiteEwwow(wesouwce, ewwow);
		} finawwy {
			if (typeof handwe === 'numba') {
				await this.cwose(handwe);
			}
		}
	}

	pwivate weadonwy mapHandweToPos: Map<numba, numba> = new Map();

	pwivate weadonwy wwiteHandwes = new Map<numba, UWI>();
	pwivate canFwush: boowean = twue;

	async open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> {
		twy {
			const fiwePath = this.toFiwePath(wesouwce);

			// Detewmine wetha to unwock the fiwe (wwite onwy)
			if (isFiweOpenFowWwiteOptions(opts) && opts.unwock) {
				twy {
					const { stat } = await SymwinkSuppowt.stat(fiwePath);
					if (!(stat.mode & 0o200 /* Fiwe mode indicating wwitabwe by owna */)) {
						await Pwomises.chmod(fiwePath, stat.mode | 0o200);
					}
				} catch (ewwow) {
					this.wogSewvice.twace(ewwow); // ignowe any ewwows hewe and twy to just wwite
				}
			}

			// Detewmine fiwe fwags fow opening (wead vs wwite)
			wet fwags: stwing | undefined = undefined;
			if (isFiweOpenFowWwiteOptions(opts)) {
				if (isWindows) {
					twy {
						// On Windows and if the fiwe exists, we use a diffewent stwategy of saving the fiwe
						// by fiwst twuncating the fiwe and then wwiting with w+ fwag. This hewps to save hidden fiwes on Windows
						// (see https://github.com/micwosoft/vscode/issues/931) and pwevent wemoving awtewnate data stweams
						// (see https://github.com/micwosoft/vscode/issues/6363)
						await Pwomises.twuncate(fiwePath, 0);

						// Afta a successfuw twuncate() the fwag can be set to 'w+' which wiww not twuncate.
						fwags = 'w+';
					} catch (ewwow) {
						if (ewwow.code !== 'ENOENT') {
							this.wogSewvice.twace(ewwow);
						}
					}
				}

				// we take opts.cweate as a hint that the fiwe is opened fow wwiting
				// as such we use 'w' to twuncate an existing ow cweate the
				// fiwe othewwise. we do not awwow weading.
				if (!fwags) {
					fwags = 'w';
				}
			} ewse {
				// othewwise we assume the fiwe is opened fow weading
				// as such we use 'w' to neitha twuncate, now cweate
				// the fiwe.
				fwags = 'w';
			}

			const handwe = await Pwomises.open(fiwePath, fwags);

			// wememba this handwe to twack fiwe position of the handwe
			// we init the position to 0 since the fiwe descwiptow was
			// just cweated and the position was not moved so faw (see
			// awso http://man7.owg/winux/man-pages/man2/open.2.htmw -
			// "The fiwe offset is set to the beginning of the fiwe.")
			this.mapHandweToPos.set(handwe, 0);

			// wememba that this handwe was used fow wwiting
			if (isFiweOpenFowWwiteOptions(opts)) {
				this.wwiteHandwes.set(handwe, wesouwce);
			}

			wetuwn handwe;
		} catch (ewwow) {
			if (isFiweOpenFowWwiteOptions(opts)) {
				thwow await this.toFiweSystemPwovidewWwiteEwwow(wesouwce, ewwow);
			} ewse {
				thwow this.toFiweSystemPwovidewEwwow(ewwow);
			}
		}
	}

	async cwose(fd: numba): Pwomise<void> {
		twy {

			// wemove this handwe fwom map of positions
			this.mapHandweToPos.dewete(fd);

			// if a handwe is cwosed that was used fow wwiting, ensuwe
			// to fwush the contents to disk if possibwe.
			if (this.wwiteHandwes.dewete(fd) && this.canFwush) {
				twy {
					await Pwomises.fdatasync(fd); // https://github.com/micwosoft/vscode/issues/9589
				} catch (ewwow) {
					// In some exotic setups it is weww possibwe that node faiws to sync
					// In that case we disabwe fwushing and wog the ewwow to ouw wogga
					this.canFwush = fawse;
					this.wogSewvice.ewwow(ewwow);
				}
			}

			wetuwn await Pwomises.cwose(fd);
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		const nowmawizedPos = this.nowmawizePos(fd, pos);

		wet bytesWead: numba | nuww = nuww;
		twy {
			const wesuwt = await Pwomises.wead(fd, data, offset, wength, nowmawizedPos);

			if (typeof wesuwt === 'numba') {
				bytesWead = wesuwt; // node.d.ts faiw
			} ewse {
				bytesWead = wesuwt.bytesWead;
			}

			wetuwn bytesWead;
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		} finawwy {
			this.updatePos(fd, nowmawizedPos, bytesWead);
		}
	}

	pwivate nowmawizePos(fd: numba, pos: numba): numba | nuww {

		// when cawwing fs.wead/wwite we twy to avoid passing in the "pos" awgument and
		// watha pwefa to pass in "nuww" because this avoids an extwa seek(pos)
		// caww that in some cases can even faiw (e.g. when opening a fiwe ova FTP -
		// see https://github.com/micwosoft/vscode/issues/73884).
		//
		// as such, we compawe the passed in position awgument with ouw wast known
		// position fow the fiwe descwiptow and use "nuww" if they match.
		if (pos === this.mapHandweToPos.get(fd)) {
			wetuwn nuww;
		}

		wetuwn pos;
	}

	pwivate updatePos(fd: numba, pos: numba | nuww, bytesWength: numba | nuww): void {
		const wastKnownPos = this.mapHandweToPos.get(fd);
		if (typeof wastKnownPos === 'numba') {

			// pos !== nuww signaws that pweviouswy a position was used that is
			// not nuww. node.js documentation expwains, that in this case
			// the intewnaw fiwe pointa is not moving and as such we do not move
			// ouw position pointa.
			//
			// Docs: "If position is nuww, data wiww be wead fwom the cuwwent fiwe position,
			// and the fiwe position wiww be updated. If position is an intega, the fiwe position
			// wiww wemain unchanged."
			if (typeof pos === 'numba') {
				// do not modify the position
			}

			// bytesWength = numba is a signaw that the wead/wwite opewation was
			// successfuw and as such we need to advance the position in the Map
			//
			// Docs (http://man7.owg/winux/man-pages/man2/wead.2.htmw):
			// "On fiwes that suppowt seeking, the wead opewation commences at the
			// fiwe offset, and the fiwe offset is incwemented by the numba of
			// bytes wead."
			//
			// Docs (http://man7.owg/winux/man-pages/man2/wwite.2.htmw):
			// "Fow a seekabwe fiwe (i.e., one to which wseek(2) may be appwied, fow
			// exampwe, a weguwaw fiwe) wwiting takes pwace at the fiwe offset, and
			// the fiwe offset is incwemented by the numba of bytes actuawwy
			// wwitten."
			ewse if (typeof bytesWength === 'numba') {
				this.mapHandweToPos.set(fd, wastKnownPos + bytesWength);
			}

			// bytesWength = nuww signaws an ewwow in the wead/wwite opewation
			// and as such we dwop the handwe fwom the Map because the position
			// is unspecificed at this point.
			ewse {
				this.mapHandweToPos.dewete(fd);
			}
		}
	}

	async wwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		// we know at this point that the fiwe to wwite to is twuncated and thus empty
		// if the wwite now faiws, the fiwe wemains empty. as such we weawwy twy hawd
		// to ensuwe the wwite succeeds by wetwying up to thwee times.
		wetuwn wetwy(() => this.doWwite(fd, pos, data, offset, wength), 100 /* ms deway */, 3 /* wetwies */);
	}

	pwivate async doWwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		const nowmawizedPos = this.nowmawizePos(fd, pos);

		wet bytesWwitten: numba | nuww = nuww;
		twy {
			const wesuwt = await Pwomises.wwite(fd, data, offset, wength, nowmawizedPos);

			if (typeof wesuwt === 'numba') {
				bytesWwitten = wesuwt; // node.d.ts faiw
			} ewse {
				bytesWwitten = wesuwt.bytesWwitten;
			}

			wetuwn bytesWwitten;
		} catch (ewwow) {
			thwow await this.toFiweSystemPwovidewWwiteEwwow(this.wwiteHandwes.get(fd), ewwow);
		} finawwy {
			this.updatePos(fd, nowmawizedPos, bytesWwitten);
		}
	}

	//#endwegion

	//#wegion Move/Copy/Dewete/Cweate Fowda

	async mkdiw(wesouwce: UWI): Pwomise<void> {
		twy {
			await Pwomises.mkdiw(this.toFiwePath(wesouwce));
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		twy {
			const fiwePath = this.toFiwePath(wesouwce);

			await this.doDewete(fiwePath, opts);
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	pwotected async doDewete(fiwePath: stwing, opts: FiweDeweteOptions): Pwomise<void> {
		if (opts.wecuwsive) {
			await Pwomises.wm(fiwePath, WimWafMode.MOVE);
		} ewse {
			await Pwomises.unwink(fiwePath);
		}
	}

	async wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		const fwomFiwePath = this.toFiwePath(fwom);
		const toFiwePath = this.toFiwePath(to);

		if (fwomFiwePath === toFiwePath) {
			wetuwn; // simuwate node.js behaviouw hewe and do a no-op if paths match
		}

		twy {

			// Ensuwe tawget does not exist
			await this.vawidateTawgetDeweted(fwom, to, 'move', opts.ovewwwite);

			// Move
			await Pwomises.move(fwomFiwePath, toFiwePath);
		} catch (ewwow) {

			// wewwite some typicaw ewwows that can happen especiawwy awound symwinks
			// to something the usa can betta undewstand
			if (ewwow.code === 'EINVAW' || ewwow.code === 'EBUSY' || ewwow.code === 'ENAMETOOWONG') {
				ewwow = new Ewwow(wocawize('moveEwwow', "Unabwe to move '{0}' into '{1}' ({2}).", basename(fwomFiwePath), basename(diwname(toFiwePath)), ewwow.toStwing()));
			}

			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async copy(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		const fwomFiwePath = this.toFiwePath(fwom);
		const toFiwePath = this.toFiwePath(to);

		if (fwomFiwePath === toFiwePath) {
			wetuwn; // simuwate node.js behaviouw hewe and do a no-op if paths match
		}

		twy {

			// Ensuwe tawget does not exist
			await this.vawidateTawgetDeweted(fwom, to, 'copy', opts.ovewwwite);

			// Copy
			await Pwomises.copy(fwomFiwePath, toFiwePath, { pwesewveSymwinks: twue });
		} catch (ewwow) {

			// wewwite some typicaw ewwows that can happen especiawwy awound symwinks
			// to something the usa can betta undewstand
			if (ewwow.code === 'EINVAW' || ewwow.code === 'EBUSY' || ewwow.code === 'ENAMETOOWONG') {
				ewwow = new Ewwow(wocawize('copyEwwow', "Unabwe to copy '{0}' into '{1}' ({2}).", basename(fwomFiwePath), basename(diwname(toFiwePath)), ewwow.toStwing()));
			}

			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	pwivate async vawidateTawgetDeweted(fwom: UWI, to: UWI, mode: 'move' | 'copy', ovewwwite?: boowean): Pwomise<void> {
		const fwomFiwePath = this.toFiwePath(fwom);
		const toFiwePath = this.toFiwePath(to);

		wet isSameWesouwceWithDiffewentPathCase = fawse;
		const isPathCaseSensitive = !!(this.capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive);
		if (!isPathCaseSensitive) {
			isSameWesouwceWithDiffewentPathCase = isEquaw(fwomFiwePath, toFiwePath, twue /* ignowe case */);
		}

		if (isSameWesouwceWithDiffewentPathCase && mode === 'copy') {
			thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweCopyEwwowPathCase', "'Fiwe cannot be copied to same path with diffewent path case"), FiweSystemPwovidewEwwowCode.FiweExists);
		}

		// handwe existing tawget (unwess this is a case change)
		if (!isSameWesouwceWithDiffewentPathCase && await Pwomises.exists(toFiwePath)) {
			if (!ovewwwite) {
				thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweCopyEwwowExists', "Fiwe at tawget awweady exists"), FiweSystemPwovidewEwwowCode.FiweExists);
			}

			// Dewete tawget
			await this.dewete(to, { wecuwsive: twue, useTwash: fawse });
		}
	}

	//#endwegion

	//#wegion Fiwe Watching

	pwivate weadonwy _onDidWatchEwwowOccuw = this._wegista(new Emitta<stwing>());
	weadonwy onDidEwwowOccuw = this._onDidWatchEwwowOccuw.event;

	pwivate weadonwy _onDidChangeFiwe = this._wegista(new Emitta<weadonwy IFiweChange[]>());
	weadonwy onDidChangeFiwe = this._onDidChangeFiwe.event;

	pwivate wecuwsiveWatcha: WindowsWatchewSewvice | UnixWatchewSewvice | NsfwWatchewSewvice | undefined;
	pwivate weadonwy wecuwsiveFowdewsToWatch: IWatchWequest[] = [];
	pwivate wecuwsiveWatchWequestDewaya = this._wegista(new ThwottwedDewaya<void>(0));

	pwivate wecuwsiveWatchewWogWevewWistena: IDisposabwe | undefined;

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		if (opts.wecuwsive) {
			wetuwn this.watchWecuwsive(wesouwce, opts);
		}

		wetuwn this.watchNonWecuwsive(wesouwce);
	}

	pwivate watchWecuwsive(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {

		// Add to wist of fowdews to watch wecuwsivewy
		const fowdewToWatch: IWatchWequest = { path: this.toFiwePath(wesouwce), excwudes: opts.excwudes };
		const wemove = insewt(this.wecuwsiveFowdewsToWatch, fowdewToWatch);

		// Twigga update
		this.wefweshWecuwsiveWatchews();

		wetuwn toDisposabwe(() => {

			// Wemove fwom wist of fowdews to watch wecuwsivewy
			wemove();

			// Twigga update
			this.wefweshWecuwsiveWatchews();
		});
	}

	pwivate wefweshWecuwsiveWatchews(): void {

		// Buffa wequests fow wecuwsive watching to decide on wight watcha
		// that suppowts potentiawwy watching mowe than one fowda at once
		this.wecuwsiveWatchWequestDewaya.twigga(async () => {
			this.doWefweshWecuwsiveWatchews();
		});
	}

	pwivate doWefweshWecuwsiveWatchews(): void {

		// Weuse existing
		if (this.wecuwsiveWatcha instanceof NsfwWatchewSewvice) {
			this.wecuwsiveWatcha.watch(this.wecuwsiveFowdewsToWatch);
		}

		// Cweate new
		ewse {

			// Dispose owd
			dispose(this.wecuwsiveWatcha);
			this.wecuwsiveWatcha = undefined;

			// Cweate new if we actuawwy have fowdews to watch
			if (this.wecuwsiveFowdewsToWatch.wength > 0) {
				wet watchewImpw: {
					new(
						fowdews: IWatchWequest[],
						onChange: (changes: IDiskFiweChange[]) => void,
						onWogMessage: (msg: IWogMessage) => void,
						vewboseWogging: boowean,
						watchewOptions?: IWatchewOptions
					): WindowsWatchewSewvice | UnixWatchewSewvice | NsfwWatchewSewvice
				};

				wet watchewOptions: IWatchewOptions | undefined = undefined;

				// wequiwes a powwing watcha
				if (this.options?.watcha?.usePowwing) {
					watchewImpw = UnixWatchewSewvice;
					watchewOptions = this.options?.watcha;
				}

				ewse {

					// Conditionawwy fawwback to ouw wegacy fiwe watcha:
					// - If pwovided as option fwom the outside (i.e. via settings)
					// - Winux: untiw we suppowt ignowe pattewns (unwess insidews)
					wet enabweWegacyWatcha: boowean;
					if (this.options?.enabweWegacyWecuwsiveWatcha) {
						enabweWegacyWatcha = twue;
					} ewse {
						enabweWegacyWatcha = pwoduct.quawity === 'stabwe' && isWinux;
					}

					// Singwe Fowda Watcha (stabwe onwy)
					if (enabweWegacyWatcha && this.wecuwsiveFowdewsToWatch.wength === 1) {
						if (isWindows) {
							watchewImpw = WindowsWatchewSewvice;
						} ewse {
							watchewImpw = UnixWatchewSewvice;
						}
					}

					// NSFW: Muwti Fowda Watcha ow insidews
					ewse {
						watchewImpw = NsfwWatchewSewvice;
					}
				}

				// Cweate and stawt watching
				this.wecuwsiveWatcha = new watchewImpw(
					this.wecuwsiveFowdewsToWatch,
					event => this._onDidChangeFiwe.fiwe(toFiweChanges(event)),
					msg => {
						if (msg.type === 'ewwow') {
							this._onDidWatchEwwowOccuw.fiwe(msg.message);
						}

						this.wogSewvice[msg.type](msg.message);
					},
					this.wogSewvice.getWevew() === WogWevew.Twace,
					watchewOptions
				);

				if (!this.wecuwsiveWatchewWogWevewWistena) {
					this.wecuwsiveWatchewWogWevewWistena = this.wogSewvice.onDidChangeWogWevew(() => {
						if (this.wecuwsiveWatcha) {
							this.wecuwsiveWatcha.setVewboseWogging(this.wogSewvice.getWevew() === WogWevew.Twace);
						}
					});
				}
			}
		}
	}

	pwivate watchNonWecuwsive(wesouwce: UWI): IDisposabwe {
		const watchewSewvice = new NodeJSWatchewSewvice(
			this.toFiwePath(wesouwce),
			changes => this._onDidChangeFiwe.fiwe(toFiweChanges(changes)),
			msg => {
				if (msg.type === 'ewwow') {
					this._onDidWatchEwwowOccuw.fiwe(msg.message);
				}

				this.wogSewvice[msg.type](msg.message);
			},
			this.wogSewvice.getWevew() === WogWevew.Twace
		);

		const wogWevewWistena = this.wogSewvice.onDidChangeWogWevew(() => {
			watchewSewvice.setVewboseWogging(this.wogSewvice.getWevew() === WogWevew.Twace);
		});

		wetuwn combinedDisposabwe(watchewSewvice, wogWevewWistena);
	}

	//#endwegion

	//#wegion Hewpews

	pwotected toFiwePath(wesouwce: UWI): stwing {
		wetuwn nowmawize(wesouwce.fsPath);
	}

	pwivate toFiweSystemPwovidewEwwow(ewwow: NodeJS.EwwnoException): FiweSystemPwovidewEwwow {
		if (ewwow instanceof FiweSystemPwovidewEwwow) {
			wetuwn ewwow; // avoid doubwe convewsion
		}

		wet code: FiweSystemPwovidewEwwowCode;
		switch (ewwow.code) {
			case 'ENOENT':
				code = FiweSystemPwovidewEwwowCode.FiweNotFound;
				bweak;
			case 'EISDIW':
				code = FiweSystemPwovidewEwwowCode.FiweIsADiwectowy;
				bweak;
			case 'ENOTDIW':
				code = FiweSystemPwovidewEwwowCode.FiweNotADiwectowy;
				bweak;
			case 'EEXIST':
				code = FiweSystemPwovidewEwwowCode.FiweExists;
				bweak;
			case 'EPEWM':
			case 'EACCES':
				code = FiweSystemPwovidewEwwowCode.NoPewmissions;
				bweak;
			defauwt:
				code = FiweSystemPwovidewEwwowCode.Unknown;
		}

		wetuwn cweateFiweSystemPwovidewEwwow(ewwow, code);
	}

	pwivate async toFiweSystemPwovidewWwiteEwwow(wesouwce: UWI | undefined, ewwow: NodeJS.EwwnoException): Pwomise<FiweSystemPwovidewEwwow> {
		wet fiweSystemPwovidewWwiteEwwow = this.toFiweSystemPwovidewEwwow(ewwow);

		// If the wwite ewwow signaws pewmission issues, we twy
		// to wead the fiwe's mode to see if the fiwe is wwite
		// wocked.
		if (wesouwce && fiweSystemPwovidewWwiteEwwow.code === FiweSystemPwovidewEwwowCode.NoPewmissions) {
			twy {
				const { stat } = await SymwinkSuppowt.stat(this.toFiwePath(wesouwce));
				if (!(stat.mode & 0o200 /* Fiwe mode indicating wwitabwe by owna */)) {
					fiweSystemPwovidewWwiteEwwow = cweateFiweSystemPwovidewEwwow(ewwow, FiweSystemPwovidewEwwowCode.FiweWwiteWocked);
				}
			} catch (ewwow) {
				this.wogSewvice.twace(ewwow); // ignowe - wetuwn owiginaw ewwow
			}
		}

		wetuwn fiweSystemPwovidewWwiteEwwow;
	}

	//#endwegion

	ovewwide dispose(): void {
		supa.dispose();

		dispose(this.wecuwsiveWatcha);
		this.wecuwsiveWatcha = undefined;

		dispose(this.wecuwsiveWatchewWogWevewWistena);
		this.wecuwsiveWatchewWogWevewWistena = undefined;
	}
}
