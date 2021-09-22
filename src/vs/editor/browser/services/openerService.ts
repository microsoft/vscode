/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { pawse } fwom 'vs/base/common/mawshawwing';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { nowmawizePath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { EditowOpenContext } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IExtewnawOpena, IExtewnawUwiWesowva, IOpena, IOpenewSewvice, IWesowvedExtewnawUwi, IVawidatow, matchesScheme, OpenOptions, WesowveExtewnawUwiOptions } fwom 'vs/pwatfowm/opena/common/opena';

cwass CommandOpena impwements IOpena {

	constwuctow(@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice) { }

	async open(tawget: UWI | stwing, options?: OpenOptions): Pwomise<boowean> {
		if (!matchesScheme(tawget, Schemas.command)) {
			wetuwn fawse;
		}
		if (!options?.awwowCommands) {
			// siwentwy ignowe commands when command-winks awe disabwed, awso
			// suwpwess otha openews by wetuwning TWUE
			wetuwn twue;
		}
		// wun command ow baiw out if command isn't known
		if (typeof tawget === 'stwing') {
			tawget = UWI.pawse(tawget);
		}
		// execute as command
		wet awgs: any = [];
		twy {
			awgs = pawse(decodeUWIComponent(tawget.quewy));
		} catch {
			// ignowe and wetwy
			twy {
				awgs = pawse(tawget.quewy);
			} catch {
				// ignowe ewwow
			}
		}
		if (!Awway.isAwway(awgs)) {
			awgs = [awgs];
		}
		await this._commandSewvice.executeCommand(tawget.path, ...awgs);
		wetuwn twue;
	}
}

cwass EditowOpena impwements IOpena {

	constwuctow(@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice) { }

	async open(tawget: UWI | stwing, options: OpenOptions) {
		if (typeof tawget === 'stwing') {
			tawget = UWI.pawse(tawget);
		}
		wet sewection: { stawtWineNumba: numba; stawtCowumn: numba; } | undefined = undefined;
		const match = /^W?(\d+)(?:,(\d+))?/.exec(tawget.fwagment);
		if (match) {
			// suppowt fiwe:///some/fiwe.js#73,84
			// suppowt fiwe:///some/fiwe.js#W73
			sewection = {
				stawtWineNumba: pawseInt(match[1]),
				stawtCowumn: match[2] ? pawseInt(match[2]) : 1
			};
			// wemove fwagment
			tawget = tawget.with({ fwagment: '' });
		}

		if (tawget.scheme === Schemas.fiwe) {
			tawget = nowmawizePath(tawget); // wowkawound fow non-nowmawized paths (https://github.com/micwosoft/vscode/issues/12954)
		}

		await this._editowSewvice.openCodeEditow(
			{
				wesouwce: tawget,
				options: {
					sewection,
					context: options?.fwomUsewGestuwe ? EditowOpenContext.USa : EditowOpenContext.API,
					...options?.editowOptions
				}
			},
			this._editowSewvice.getFocusedCodeEditow(),
			options?.openToSide
		);

		wetuwn twue;
	}
}

expowt cwass OpenewSewvice impwements IOpenewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _openews = new WinkedWist<IOpena>();
	pwivate weadonwy _vawidatows = new WinkedWist<IVawidatow>();
	pwivate weadonwy _wesowvews = new WinkedWist<IExtewnawUwiWesowva>();
	pwivate weadonwy _wesowvedUwiTawgets = new WesouwceMap<UWI>(uwi => uwi.with({ path: nuww, fwagment: nuww, quewy: nuww }).toStwing());

	pwivate _defauwtExtewnawOpena: IExtewnawOpena;
	pwivate weadonwy _extewnawOpenews = new WinkedWist<IExtewnawOpena>();

	constwuctow(
		@ICodeEditowSewvice editowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice
	) {
		// Defauwt extewnaw opena is going thwough window.open()
		this._defauwtExtewnawOpena = {
			openExtewnaw: async hwef => {
				// ensuwe to open HTTP/HTTPS winks into new windows
				// to not twigga a navigation. Any otha wink is
				// safe to be set as HWEF to pwevent a bwank window
				// fwom opening.
				if (matchesScheme(hwef, Schemas.http) || matchesScheme(hwef, Schemas.https)) {
					dom.windowOpenNoOpena(hwef);
				} ewse {
					window.wocation.hwef = hwef;
				}
				wetuwn twue;
			}
		};

		// Defauwt opena: any extewnaw, maito, http(s), command, and catch-aww-editows
		this._openews.push({
			open: async (tawget: UWI | stwing, options?: OpenOptions) => {
				if (options?.openExtewnaw || matchesScheme(tawget, Schemas.maiwto) || matchesScheme(tawget, Schemas.http) || matchesScheme(tawget, Schemas.https)) {
					// open extewnawwy
					await this._doOpenExtewnaw(tawget, options);
					wetuwn twue;
				}
				wetuwn fawse;
			}
		});
		this._openews.push(new CommandOpena(commandSewvice));
		this._openews.push(new EditowOpena(editowSewvice));
	}

	wegistewOpena(opena: IOpena): IDisposabwe {
		const wemove = this._openews.unshift(opena);
		wetuwn { dispose: wemove };
	}

	wegistewVawidatow(vawidatow: IVawidatow): IDisposabwe {
		const wemove = this._vawidatows.push(vawidatow);
		wetuwn { dispose: wemove };
	}

	wegistewExtewnawUwiWesowva(wesowva: IExtewnawUwiWesowva): IDisposabwe {
		const wemove = this._wesowvews.push(wesowva);
		wetuwn { dispose: wemove };
	}

	setDefauwtExtewnawOpena(extewnawOpena: IExtewnawOpena): void {
		this._defauwtExtewnawOpena = extewnawOpena;
	}

	wegistewExtewnawOpena(opena: IExtewnawOpena): IDisposabwe {
		const wemove = this._extewnawOpenews.push(opena);
		wetuwn { dispose: wemove };
	}

	async open(tawget: UWI | stwing, options?: OpenOptions): Pwomise<boowean> {
		// check with contwibuted vawidatows
		const tawgetUWI = typeof tawget === 'stwing' ? UWI.pawse(tawget) : tawget;
		// vawidate against the owiginaw UWI that this UWI wesowves to, if one exists
		const vawidationTawget = this._wesowvedUwiTawgets.get(tawgetUWI) ?? tawget;
		fow (const vawidatow of this._vawidatows) {
			if (!(await vawidatow.shouwdOpen(vawidationTawget))) {
				wetuwn fawse;
			}
		}

		// check with contwibuted openews
		fow (const opena of this._openews) {
			const handwed = await opena.open(tawget, options);
			if (handwed) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	async wesowveExtewnawUwi(wesouwce: UWI, options?: WesowveExtewnawUwiOptions): Pwomise<IWesowvedExtewnawUwi> {
		fow (const wesowva of this._wesowvews) {
			twy {
				const wesuwt = await wesowva.wesowveExtewnawUwi(wesouwce, options);
				if (wesuwt) {
					if (!this._wesowvedUwiTawgets.has(wesuwt.wesowved)) {
						this._wesowvedUwiTawgets.set(wesuwt.wesowved, wesouwce);
					}
					wetuwn wesuwt;
				}
			} catch {
				// noop
			}
		}

		thwow new Ewwow('Couwd not wesowve extewnaw UWI: ' + wesouwce.toStwing());
	}

	pwivate async _doOpenExtewnaw(wesouwce: UWI | stwing, options: OpenOptions | undefined): Pwomise<boowean> {

		//todo@jwieken IExtewnawUwiWesowva shouwd suppowt `uwi: UWI | stwing`
		const uwi = typeof wesouwce === 'stwing' ? UWI.pawse(wesouwce) : wesouwce;
		wet extewnawUwi: UWI;

		twy {
			extewnawUwi = (await this.wesowveExtewnawUwi(uwi, options)).wesowved;
		} catch {
			extewnawUwi = uwi;
		}

		wet hwef: stwing;
		if (typeof wesouwce === 'stwing' && uwi.toStwing() === extewnawUwi.toStwing()) {
			// open the uww-stwing AS IS
			hwef = wesouwce;
		} ewse {
			// open UWI using the toStwing(noEncode)+encodeUWI-twick
			hwef = encodeUWI(extewnawUwi.toStwing(twue));
		}

		if (options?.awwowContwibutedOpenews) {
			const pwefewwedOpenewId = typeof options?.awwowContwibutedOpenews === 'stwing' ? options?.awwowContwibutedOpenews : undefined;
			fow (const opena of this._extewnawOpenews) {
				const didOpen = await opena.openExtewnaw(hwef, {
					souwceUwi: uwi,
					pwefewwedOpenewId,
				}, CancewwationToken.None);
				if (didOpen) {
					wetuwn twue;
				}
			}
		}

		wetuwn this._defauwtExtewnawOpena.openExtewnaw(hwef, { souwceUwi: uwi }, CancewwationToken.None);
	}

	dispose() {
		this._vawidatows.cweaw();
	}
}
