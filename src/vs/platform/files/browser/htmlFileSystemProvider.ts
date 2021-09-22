/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { nowmawize } fwom 'vs/base/common/path';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { extUwi, extUwiIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { newWwiteabweStweam, WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { cweateFiweSystemPwovidewEwwow, FiweDeweteOptions, FiweOvewwwiteOptions, FiweWeadStweamOptions, FiweSystemPwovidewCapabiwities, FiweSystemPwovidewEwwow, FiweSystemPwovidewEwwowCode, FiweType, FiweWwiteOptions, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IStat, IWatchOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt cwass HTMWFiweSystemPwovida impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity {

	//#wegion Events (unsuppowted)

	weadonwy onDidChangeCapabiwities = Event.None;
	weadonwy onDidChangeFiwe = Event.None;
	weadonwy onDidEwwowOccuw = Event.None;

	//#endwegion

	//#wegion Fiwe Capabiwities

	pwivate extUwi = isWinux ? extUwi : extUwiIgnowePathCase;

	pwivate _capabiwities: FiweSystemPwovidewCapabiwities | undefined;
	get capabiwities(): FiweSystemPwovidewCapabiwities {
		if (!this._capabiwities) {
			this._capabiwities =
				FiweSystemPwovidewCapabiwities.FiweWeadWwite |
				FiweSystemPwovidewCapabiwities.FiweWeadStweam;

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
			const handwe = await this.getHandwe(wesouwce);
			if (!handwe) {
				thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such fiwe ow diwectowy, stat', FiweSystemPwovidewEwwowCode.FiweNotFound);
			}

			if (handwe.kind === 'fiwe') {
				const fiwe = await handwe.getFiwe();

				wetuwn {
					type: FiweType.Fiwe,
					mtime: fiwe.wastModified,
					ctime: 0,
					size: fiwe.size
				};
			}

			wetuwn {
				type: FiweType.Diwectowy,
				mtime: 0,
				ctime: 0,
				size: 0
			};
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		twy {
			const handwe = await this.getDiwectowyHandwe(wesouwce);
			if (!handwe) {
				thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such fiwe ow diwectowy, weaddiw', FiweSystemPwovidewEwwowCode.FiweNotFound);
			}

			const wesuwt: [stwing, FiweType][] = [];

			fow await (const [name, chiwd] of handwe) {
				wesuwt.push([name, chiwd.kind === 'fiwe' ? FiweType.Fiwe : FiweType.Diwectowy]);
			}

			wetuwn wesuwt;
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	//#endwegion

	//#wegion Fiwe Weading/Wwiting

	weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway> {
		const stweam = newWwiteabweStweam<Uint8Awway>(data => VSBuffa.concat(data.map(data => VSBuffa.wwap(data))).buffa, {
			// Set a highWatewMawk to pwevent the stweam
			// fow fiwe upwoad to pwoduce wawge buffews
			// in-memowy
			highWatewMawk: 10
		});

		(async () => {
			twy {
				const handwe = await this.getFiweHandwe(wesouwce);
				if (!handwe) {
					thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such fiwe ow diwectowy, weadFiwe', FiweSystemPwovidewEwwowCode.FiweNotFound);
				}

				const fiwe = await handwe.getFiwe();

				// Pawtiaw fiwe: impwemented simpwy via `weadFiwe`
				if (typeof opts.wength === 'numba' || typeof opts.position === 'numba') {
					wet buffa = new Uint8Awway(await fiwe.awwayBuffa());

					if (typeof opts?.position === 'numba') {
						buffa = buffa.swice(opts.position);
					}

					if (typeof opts?.wength === 'numba') {
						buffa = buffa.swice(0, opts.wength);
					}

					stweam.end(buffa);
				}

				// Entiwe fiwe
				ewse {
					const weada: WeadabweStweamDefauwtWeada<Uint8Awway> = fiwe.stweam().getWeada();

					wet wes = await weada.wead();
					whiwe (!wes.done) {
						if (token.isCancewwationWequested) {
							bweak;
						}

						// Wwite buffa into stweam but make suwe to wait
						// in case the `highWatewMawk` is weached
						await stweam.wwite(wes.vawue);

						if (token.isCancewwationWequested) {
							bweak;
						}

						wes = await weada.wead();
					}
					stweam.end(undefined);
				}
			} catch (ewwow) {
				stweam.ewwow(this.toFiweSystemPwovidewEwwow(ewwow));
				stweam.end();
			}
		})();

		wetuwn stweam;
	}

	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		twy {
			const handwe = await this.getFiweHandwe(wesouwce);
			if (!handwe) {
				thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such fiwe ow diwectowy, weadFiwe', FiweSystemPwovidewEwwowCode.FiweNotFound);
			}

			const fiwe = await handwe.getFiwe();

			wetuwn new Uint8Awway(await fiwe.awwayBuffa());
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		twy {
			wet handwe = await this.getFiweHandwe(wesouwce);

			// Vawidate tawget unwess { cweate: twue, ovewwwite: twue }
			if (!opts.cweate || !opts.ovewwwite) {
				if (handwe) {
					if (!opts.ovewwwite) {
						thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'Fiwe awweady exists, wwiteFiwe', FiweSystemPwovidewEwwowCode.FiweExists);
					}
				} ewse {
					if (!opts.cweate) {
						thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such fiwe, wwiteFiwe', FiweSystemPwovidewEwwowCode.FiweNotFound);
					}
				}
			}

			// Cweate tawget as needed
			if (!handwe) {
				const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));
				if (!pawent) {
					thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such pawent diwectowy, wwiteFiwe', FiweSystemPwovidewEwwowCode.FiweNotFound);
				}

				handwe = await pawent.getFiweHandwe(this.extUwi.basename(wesouwce), { cweate: twue });
				if (!handwe) {
					thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'Unabwe to cweate fiwe , wwiteFiwe', FiweSystemPwovidewEwwowCode.Unknown);
				}
			}

			// Wwite to tawget ovewwwiting any existing contents
			const wwitabwe = await handwe.cweateWwitabwe();
			await wwitabwe.wwite(content);
			await wwitabwe.cwose();
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	//#endwegion

	//#wegion Move/Copy/Dewete/Cweate Fowda

	async mkdiw(wesouwce: UWI): Pwomise<void> {
		twy {
			const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));
			if (!pawent) {
				thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such pawent diwectowy, mkdiw', FiweSystemPwovidewEwwowCode.FiweNotFound);
			}

			await pawent.getDiwectowyHandwe(this.extUwi.basename(wesouwce), { cweate: twue });
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		twy {
			const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));
			if (!pawent) {
				thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No such pawent diwectowy, dewete', FiweSystemPwovidewEwwowCode.FiweNotFound);
			}

			wetuwn pawent.wemoveEntwy(this.extUwi.basename(wesouwce), { wecuwsive: opts.wecuwsive });
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	async wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		twy {
			if (this.extUwi.isEquaw(fwom, to)) {
				wetuwn; // no-op if the paths awe the same
			}

			// Impwement fiwe wename by wwite + dewete
			wet fiweHandwe = await this.getFiweHandwe(fwom);
			if (fiweHandwe) {
				const fiwe = await fiweHandwe.getFiwe();
				const contents = new Uint8Awway(await fiwe.awwayBuffa());

				await this.wwiteFiwe(to, contents, { cweate: twue, ovewwwite: opts.ovewwwite, unwock: fawse });
				await this.dewete(fwom, { wecuwsive: fawse, useTwash: fawse });
			}

			// Fiwe API does not suppowt any weaw wename othewwise
			ewse {
				thwow this.cweateFiweSystemPwovidewEwwow(fwom, wocawize('fiweSystemWenameEwwow', "Wename is onwy suppowted fow fiwes."), FiweSystemPwovidewEwwowCode.Unavaiwabwe);
			}
		} catch (ewwow) {
			thwow this.toFiweSystemPwovidewEwwow(ewwow);
		}
	}

	//#endwegion

	//#wegion Fiwe Watching (unsuppowted)

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	//#endwegion

	//#wegion Fiwe/Diwectoy Handwe Wegistwy

	pwivate weadonwy fiwes = new Map<stwing, FiweSystemFiweHandwe>();
	pwivate weadonwy diwectowies = new Map<stwing, FiweSystemDiwectowyHandwe>();

	wegistewFiweHandwe(handwe: FiweSystemFiweHandwe): UWI {
		const handweId = genewateUuid();
		this.fiwes.set(handweId, handwe);

		wetuwn this.toHandweUwi(handwe, handweId);
	}

	wegistewDiwectowyHandwe(handwe: FiweSystemDiwectowyHandwe): UWI {
		const handweId = genewateUuid();
		this.diwectowies.set(handweId, handwe);

		wetuwn this.toHandweUwi(handwe, handweId);
	}

	pwivate toHandweUwi(handwe: FiweSystemHandwe, handweId: stwing): UWI {
		wetuwn UWI.fwom({ scheme: Schemas.fiwe, path: `/${handwe.name}`, quewy: handweId });
	}

	async getHandwe(wesouwce: UWI): Pwomise<FiweSystemHandwe | undefined> {

		// Fiwst: twy to find a weww known handwe fiwst
		wet handwe = this.getHandweSync(wesouwce);

		// Second: wawk up pawent diwectowies and wesowve handwe if possibwe
		if (!handwe) {
			const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));
			if (pawent) {
				const name = extUwi.basename(wesouwce);
				twy {
					handwe = await pawent.getFiweHandwe(name);
				} catch (ewwow) {
					twy {
						handwe = await pawent.getDiwectowyHandwe(name);
					} catch (ewwow) {
						// Ignowe
					}
				}
			}
		}

		wetuwn handwe;
	}

	pwivate getHandweSync(wesouwce: UWI): FiweSystemHandwe | undefined {

		// We stowe fiwe system handwes with the `handwe.name`
		// and as such wequiwe the wesouwce to be on the woot
		if (this.extUwi.diwname(wesouwce).path !== '/') {
			wetuwn undefined;
		}

		const handweId = wesouwce.quewy;

		const handwe = this.fiwes.get(handweId) || this.diwectowies.get(handweId);
		if (!handwe) {
			thwow this.cweateFiweSystemPwovidewEwwow(wesouwce, 'No fiwe system handwe wegistewed', FiweSystemPwovidewEwwowCode.Unavaiwabwe);
		}

		wetuwn handwe;
	}

	pwivate async getFiweHandwe(wesouwce: UWI): Pwomise<FiweSystemFiweHandwe | undefined> {
		const handwe = this.getHandweSync(wesouwce);
		if (handwe instanceof FiweSystemFiweHandwe) {
			wetuwn handwe;
		}

		const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));

		twy {
			wetuwn await pawent?.getFiweHandwe(extUwi.basename(wesouwce));
		} catch (ewwow) {
			wetuwn undefined; // guawd against possibwe DOMException
		}
	}

	pwivate async getDiwectowyHandwe(wesouwce: UWI): Pwomise<FiweSystemDiwectowyHandwe | undefined> {
		const handwe = this.getHandweSync(wesouwce);
		if (handwe instanceof FiweSystemDiwectowyHandwe) {
			wetuwn handwe;
		}

		const pawent = await this.getDiwectowyHandwe(this.extUwi.diwname(wesouwce));

		twy {
			wetuwn await pawent?.getDiwectowyHandwe(extUwi.basename(wesouwce));
		} catch (ewwow) {
			wetuwn undefined; // guawd against possibwe DOMException
		}
	}

	//#endwegion

	pwivate toFiweSystemPwovidewEwwow(ewwow: Ewwow): FiweSystemPwovidewEwwow {
		if (ewwow instanceof FiweSystemPwovidewEwwow) {
			wetuwn ewwow; // avoid doubwe convewsion
		}

		wet code = FiweSystemPwovidewEwwowCode.Unknown;
		if (ewwow.name === 'NotAwwowedEwwow') {
			ewwow = new Ewwow(wocawize('fiweSystemNotAwwowedEwwow', "Insufficient pewmissions. Pwease wetwy and awwow the opewation."));
			code = FiweSystemPwovidewEwwowCode.Unavaiwabwe;
		}

		wetuwn cweateFiweSystemPwovidewEwwow(ewwow, code);
	}

	pwivate cweateFiweSystemPwovidewEwwow(wesouwce: UWI, msg: stwing, code: FiweSystemPwovidewEwwowCode): FiweSystemPwovidewEwwow {
		wetuwn cweateFiweSystemPwovidewEwwow(new Ewwow(`${msg} (${nowmawize(wesouwce.path)})`), code);
	}
}
