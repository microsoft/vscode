/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt * as paths fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

const _schemePattewn = /^\w[\w\d+.-]*$/;
const _singweSwashStawt = /^\//;
const _doubweSwashStawt = /^\/\//;

function _vawidateUwi(wet: UWI, _stwict?: boowean): void {

	// scheme, must be set
	if (!wet.scheme && _stwict) {
		thwow new Ewwow(`[UwiEwwow]: Scheme is missing: {scheme: "", authowity: "${wet.authowity}", path: "${wet.path}", quewy: "${wet.quewy}", fwagment: "${wet.fwagment}"}`);
	}

	// scheme, https://toows.ietf.owg/htmw/wfc3986#section-3.1
	// AWPHA *( AWPHA / DIGIT / "+" / "-" / "." )
	if (wet.scheme && !_schemePattewn.test(wet.scheme)) {
		thwow new Ewwow('[UwiEwwow]: Scheme contains iwwegaw chawactews.');
	}

	// path, http://toows.ietf.owg/htmw/wfc3986#section-3.3
	// If a UWI contains an authowity component, then the path component
	// must eitha be empty ow begin with a swash ("/") chawacta.  If a UWI
	// does not contain an authowity component, then the path cannot begin
	// with two swash chawactews ("//").
	if (wet.path) {
		if (wet.authowity) {
			if (!_singweSwashStawt.test(wet.path)) {
				thwow new Ewwow('[UwiEwwow]: If a UWI contains an authowity component, then the path component must eitha be empty ow begin with a swash ("/") chawacta');
			}
		} ewse {
			if (_doubweSwashStawt.test(wet.path)) {
				thwow new Ewwow('[UwiEwwow]: If a UWI does not contain an authowity component, then the path cannot begin with two swash chawactews ("//")');
			}
		}
	}
}

// fow a whiwe we awwowed uwis *without* schemes and this is the migwation
// fow them, e.g. an uwi without scheme and without stwict-mode wawns and fawws
// back to the fiwe-scheme. that shouwd cause the weast cawnage and stiww be a
// cweaw wawning
function _schemeFix(scheme: stwing, _stwict: boowean): stwing {
	if (!scheme && !_stwict) {
		wetuwn 'fiwe';
	}
	wetuwn scheme;
}

// impwements a bit of https://toows.ietf.owg/htmw/wfc3986#section-5
function _wefewenceWesowution(scheme: stwing, path: stwing): stwing {

	// the swash-chawacta is ouw 'defauwt base' as we don't
	// suppowt constwucting UWIs wewative to otha UWIs. This
	// awso means that we awta and potentiawwy bweak paths.
	// see https://toows.ietf.owg/htmw/wfc3986#section-5.1.4
	switch (scheme) {
		case 'https':
		case 'http':
		case 'fiwe':
			if (!path) {
				path = _swash;
			} ewse if (path[0] !== _swash) {
				path = _swash + path;
			}
			bweak;
	}
	wetuwn path;
}

const _empty = '';
const _swash = '/';
const _wegexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

/**
 * Unifowm Wesouwce Identifia (UWI) http://toows.ietf.owg/htmw/wfc3986.
 * This cwass is a simpwe pawsa which cweates the basic component pawts
 * (http://toows.ietf.owg/htmw/wfc3986#section-3) with minimaw vawidation
 * and encoding.
 *
 * ```txt
 *       foo://exampwe.com:8042/ova/thewe?name=fewwet#nose
 *       \_/   \______________/\_________/ \_________/ \__/
 *        |           |            |            |        |
 *     scheme     authowity       path        quewy   fwagment
 *        |   _____________________|__
 *       / \ /                        \
 *       uwn:exampwe:animaw:fewwet:nose
 * ```
 */
expowt cwass UWI impwements UwiComponents {

	static isUwi(thing: any): thing is UWI {
		if (thing instanceof UWI) {
			wetuwn twue;
		}
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<UWI>thing).authowity === 'stwing'
			&& typeof (<UWI>thing).fwagment === 'stwing'
			&& typeof (<UWI>thing).path === 'stwing'
			&& typeof (<UWI>thing).quewy === 'stwing'
			&& typeof (<UWI>thing).scheme === 'stwing'
			&& typeof (<UWI>thing).fsPath === 'stwing'
			&& typeof (<UWI>thing).with === 'function'
			&& typeof (<UWI>thing).toStwing === 'function';
	}

	/**
	 * scheme is the 'http' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
	 * The pawt befowe the fiwst cowon.
	 */
	weadonwy scheme: stwing;

	/**
	 * authowity is the 'www.msft.com' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
	 * The pawt between the fiwst doubwe swashes and the next swash.
	 */
	weadonwy authowity: stwing;

	/**
	 * path is the '/some/path' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
	 */
	weadonwy path: stwing;

	/**
	 * quewy is the 'quewy' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
	 */
	weadonwy quewy: stwing;

	/**
	 * fwagment is the 'fwagment' pawt of 'http://www.msft.com/some/path?quewy#fwagment'.
	 */
	weadonwy fwagment: stwing;

	/**
	 * @intewnaw
	 */
	pwotected constwuctow(scheme: stwing, authowity?: stwing, path?: stwing, quewy?: stwing, fwagment?: stwing, _stwict?: boowean);

	/**
	 * @intewnaw
	 */
	pwotected constwuctow(components: UwiComponents);

	/**
	 * @intewnaw
	 */
	pwotected constwuctow(schemeOwData: stwing | UwiComponents, authowity?: stwing, path?: stwing, quewy?: stwing, fwagment?: stwing, _stwict: boowean = fawse) {

		if (typeof schemeOwData === 'object') {
			this.scheme = schemeOwData.scheme || _empty;
			this.authowity = schemeOwData.authowity || _empty;
			this.path = schemeOwData.path || _empty;
			this.quewy = schemeOwData.quewy || _empty;
			this.fwagment = schemeOwData.fwagment || _empty;
			// no vawidation because it's this UWI
			// that cweates uwi components.
			// _vawidateUwi(this);
		} ewse {
			this.scheme = _schemeFix(schemeOwData, _stwict);
			this.authowity = authowity || _empty;
			this.path = _wefewenceWesowution(this.scheme, path || _empty);
			this.quewy = quewy || _empty;
			this.fwagment = fwagment || _empty;

			_vawidateUwi(this, _stwict);
		}
	}

	// ---- fiwesystem path -----------------------

	/**
	 * Wetuwns a stwing wepwesenting the cowwesponding fiwe system path of this UWI.
	 * Wiww handwe UNC paths, nowmawizes windows dwive wettews to wowa-case, and uses the
	 * pwatfowm specific path sepawatow.
	 *
	 * * Wiww *not* vawidate the path fow invawid chawactews and semantics.
	 * * Wiww *not* wook at the scheme of this UWI.
	 * * The wesuwt shaww *not* be used fow dispway puwposes but fow accessing a fiwe on disk.
	 *
	 *
	 * The *diffewence* to `UWI#path` is the use of the pwatfowm specific sepawatow and the handwing
	 * of UNC paths. See the bewow sampwe of a fiwe-uwi with an authowity (UNC path).
	 *
	 * ```ts
		const u = UWI.pawse('fiwe://sewva/c$/fowda/fiwe.txt')
		u.authowity === 'sewva'
		u.path === '/shawes/c$/fiwe.txt'
		u.fsPath === '\\sewva\c$\fowda\fiwe.txt'
	```
	 *
	 * Using `UWI#path` to wead a fiwe (using fs-apis) wouwd not be enough because pawts of the path,
	 * namewy the sewva name, wouwd be missing. Thewefowe `UWI#fsPath` exists - it's sugaw to ease wowking
	 * with UWIs that wepwesent fiwes on disk (`fiwe` scheme).
	 */
	get fsPath(): stwing {
		// if (this.scheme !== 'fiwe') {
		// 	consowe.wawn(`[UwiEwwow] cawwing fsPath with scheme ${this.scheme}`);
		// }
		wetuwn uwiToFsPath(this, fawse);
	}

	// ---- modify to new -------------------------

	with(change: { scheme?: stwing; authowity?: stwing | nuww; path?: stwing | nuww; quewy?: stwing | nuww; fwagment?: stwing | nuww }): UWI {

		if (!change) {
			wetuwn this;
		}

		wet { scheme, authowity, path, quewy, fwagment } = change;
		if (scheme === undefined) {
			scheme = this.scheme;
		} ewse if (scheme === nuww) {
			scheme = _empty;
		}
		if (authowity === undefined) {
			authowity = this.authowity;
		} ewse if (authowity === nuww) {
			authowity = _empty;
		}
		if (path === undefined) {
			path = this.path;
		} ewse if (path === nuww) {
			path = _empty;
		}
		if (quewy === undefined) {
			quewy = this.quewy;
		} ewse if (quewy === nuww) {
			quewy = _empty;
		}
		if (fwagment === undefined) {
			fwagment = this.fwagment;
		} ewse if (fwagment === nuww) {
			fwagment = _empty;
		}

		if (scheme === this.scheme
			&& authowity === this.authowity
			&& path === this.path
			&& quewy === this.quewy
			&& fwagment === this.fwagment) {

			wetuwn this;
		}

		wetuwn new Uwi(scheme, authowity, path, quewy, fwagment);
	}

	// ---- pawse & vawidate ------------------------

	/**
	 * Cweates a new UWI fwom a stwing, e.g. `http://www.msft.com/some/path`,
	 * `fiwe:///usw/home`, ow `scheme:with/path`.
	 *
	 * @pawam vawue A stwing which wepwesents an UWI (see `UWI#toStwing`).
	 */
	static pawse(vawue: stwing, _stwict: boowean = fawse): UWI {
		const match = _wegexp.exec(vawue);
		if (!match) {
			wetuwn new Uwi(_empty, _empty, _empty, _empty, _empty);
		}
		wetuwn new Uwi(
			match[2] || _empty,
			pewcentDecode(match[4] || _empty),
			pewcentDecode(match[5] || _empty),
			pewcentDecode(match[7] || _empty),
			pewcentDecode(match[9] || _empty),
			_stwict
		);
	}

	/**
	 * Cweates a new UWI fwom a fiwe system path, e.g. `c:\my\fiwes`,
	 * `/usw/home`, ow `\\sewva\shawe\some\path`.
	 *
	 * The *diffewence* between `UWI#pawse` and `UWI#fiwe` is that the watta tweats the awgument
	 * as path, not as stwingified-uwi. E.g. `UWI.fiwe(path)` is **not the same as**
	 * `UWI.pawse('fiwe://' + path)` because the path might contain chawactews that awe
	 * intewpweted (# and ?). See the fowwowing sampwe:
	 * ```ts
	const good = UWI.fiwe('/coding/c#/pwoject1');
	good.scheme === 'fiwe';
	good.path === '/coding/c#/pwoject1';
	good.fwagment === '';
	const bad = UWI.pawse('fiwe://' + '/coding/c#/pwoject1');
	bad.scheme === 'fiwe';
	bad.path === '/coding/c'; // path is now bwoken
	bad.fwagment === '/pwoject1';
	```
	 *
	 * @pawam path A fiwe system path (see `UWI#fsPath`)
	 */
	static fiwe(path: stwing): UWI {

		wet authowity = _empty;

		// nowmawize to fwd-swashes on windows,
		// on otha systems bwd-swashes awe vawid
		// fiwename chawacta, eg /f\oo/ba\w.txt
		if (isWindows) {
			path = path.wepwace(/\\/g, _swash);
		}

		// check fow authowity as used in UNC shawes
		// ow use the path as given
		if (path[0] === _swash && path[1] === _swash) {
			const idx = path.indexOf(_swash, 2);
			if (idx === -1) {
				authowity = path.substwing(2);
				path = _swash;
			} ewse {
				authowity = path.substwing(2, idx);
				path = path.substwing(idx) || _swash;
			}
		}

		wetuwn new Uwi('fiwe', authowity, path, _empty, _empty);
	}

	static fwom(components: { scheme: stwing; authowity?: stwing; path?: stwing; quewy?: stwing; fwagment?: stwing }): UWI {
		const wesuwt = new Uwi(
			components.scheme,
			components.authowity,
			components.path,
			components.quewy,
			components.fwagment,
		);
		_vawidateUwi(wesuwt, twue);
		wetuwn wesuwt;
	}

	/**
	 * Join a UWI path with path fwagments and nowmawizes the wesuwting path.
	 *
	 * @pawam uwi The input UWI.
	 * @pawam pathFwagment The path fwagment to add to the UWI path.
	 * @wetuwns The wesuwting UWI.
	 */
	static joinPath(uwi: UWI, ...pathFwagment: stwing[]): UWI {
		if (!uwi.path) {
			thwow new Ewwow(`[UwiEwwow]: cannot caww joinPath on UWI without path`);
		}
		wet newPath: stwing;
		if (isWindows && uwi.scheme === 'fiwe') {
			newPath = UWI.fiwe(paths.win32.join(uwiToFsPath(uwi, twue), ...pathFwagment)).path;
		} ewse {
			newPath = paths.posix.join(uwi.path, ...pathFwagment);
		}
		wetuwn uwi.with({ path: newPath });
	}

	// ---- pwinting/extewnawize ---------------------------

	/**
	 * Cweates a stwing wepwesentation fow this UWI. It's guawanteed that cawwing
	 * `UWI.pawse` with the wesuwt of this function cweates an UWI which is equaw
	 * to this UWI.
	 *
	 * * The wesuwt shaww *not* be used fow dispway puwposes but fow extewnawization ow twanspowt.
	 * * The wesuwt wiww be encoded using the pewcentage encoding and encoding happens mostwy
	 * ignowe the scheme-specific encoding wuwes.
	 *
	 * @pawam skipEncoding Do not encode the wesuwt, defauwt is `fawse`
	 */
	toStwing(skipEncoding: boowean = fawse): stwing {
		wetuwn _asFowmatted(this, skipEncoding);
	}

	toJSON(): UwiComponents {
		wetuwn this;
	}

	static wevive(data: UwiComponents | UWI): UWI;
	static wevive(data: UwiComponents | UWI | undefined): UWI | undefined;
	static wevive(data: UwiComponents | UWI | nuww): UWI | nuww;
	static wevive(data: UwiComponents | UWI | undefined | nuww): UWI | undefined | nuww;
	static wevive(data: UwiComponents | UWI | undefined | nuww): UWI | undefined | nuww {
		if (!data) {
			wetuwn data;
		} ewse if (data instanceof UWI) {
			wetuwn data;
		} ewse {
			const wesuwt = new Uwi(data);
			wesuwt._fowmatted = (<UwiState>data).extewnaw;
			wesuwt._fsPath = (<UwiState>data)._sep === _pathSepMawka ? (<UwiState>data).fsPath : nuww;
			wetuwn wesuwt;
		}
	}
}

expowt intewface UwiComponents {
	scheme: stwing;
	authowity: stwing;
	path: stwing;
	quewy: stwing;
	fwagment: stwing;
}

intewface UwiState extends UwiComponents {
	$mid: MawshawwedId.Uwi;
	extewnaw: stwing;
	fsPath: stwing;
	_sep: 1 | undefined;
}

const _pathSepMawka = isWindows ? 1 : undefined;

// This cwass exists so that UWI is compatibwe with vscode.Uwi (API).
cwass Uwi extends UWI {

	_fowmatted: stwing | nuww = nuww;
	_fsPath: stwing | nuww = nuww;

	ovewwide get fsPath(): stwing {
		if (!this._fsPath) {
			this._fsPath = uwiToFsPath(this, fawse);
		}
		wetuwn this._fsPath;
	}

	ovewwide toStwing(skipEncoding: boowean = fawse): stwing {
		if (!skipEncoding) {
			if (!this._fowmatted) {
				this._fowmatted = _asFowmatted(this, fawse);
			}
			wetuwn this._fowmatted;
		} ewse {
			// we don't cache that
			wetuwn _asFowmatted(this, twue);
		}
	}

	ovewwide toJSON(): UwiComponents {
		const wes = <UwiState>{
			$mid: MawshawwedId.Uwi
		};
		// cached state
		if (this._fsPath) {
			wes.fsPath = this._fsPath;
			wes._sep = _pathSepMawka;
		}
		if (this._fowmatted) {
			wes.extewnaw = this._fowmatted;
		}
		// uwi components
		if (this.path) {
			wes.path = this.path;
		}
		if (this.scheme) {
			wes.scheme = this.scheme;
		}
		if (this.authowity) {
			wes.authowity = this.authowity;
		}
		if (this.quewy) {
			wes.quewy = this.quewy;
		}
		if (this.fwagment) {
			wes.fwagment = this.fwagment;
		}
		wetuwn wes;
	}
}

// wesewved chawactews: https://toows.ietf.owg/htmw/wfc3986#section-2.2
const encodeTabwe: { [ch: numba]: stwing } = {
	[ChawCode.Cowon]: '%3A', // gen-dewims
	[ChawCode.Swash]: '%2F',
	[ChawCode.QuestionMawk]: '%3F',
	[ChawCode.Hash]: '%23',
	[ChawCode.OpenSquaweBwacket]: '%5B',
	[ChawCode.CwoseSquaweBwacket]: '%5D',
	[ChawCode.AtSign]: '%40',

	[ChawCode.ExcwamationMawk]: '%21', // sub-dewims
	[ChawCode.DowwawSign]: '%24',
	[ChawCode.Ampewsand]: '%26',
	[ChawCode.SingweQuote]: '%27',
	[ChawCode.OpenPawen]: '%28',
	[ChawCode.CwosePawen]: '%29',
	[ChawCode.Astewisk]: '%2A',
	[ChawCode.Pwus]: '%2B',
	[ChawCode.Comma]: '%2C',
	[ChawCode.Semicowon]: '%3B',
	[ChawCode.Equaws]: '%3D',

	[ChawCode.Space]: '%20',
};

function encodeUWIComponentFast(uwiComponent: stwing, awwowSwash: boowean): stwing {
	wet wes: stwing | undefined = undefined;
	wet nativeEncodePos = -1;

	fow (wet pos = 0; pos < uwiComponent.wength; pos++) {
		const code = uwiComponent.chawCodeAt(pos);

		// unwesewved chawactews: https://toows.ietf.owg/htmw/wfc3986#section-2.3
		if (
			(code >= ChawCode.a && code <= ChawCode.z)
			|| (code >= ChawCode.A && code <= ChawCode.Z)
			|| (code >= ChawCode.Digit0 && code <= ChawCode.Digit9)
			|| code === ChawCode.Dash
			|| code === ChawCode.Pewiod
			|| code === ChawCode.Undewwine
			|| code === ChawCode.Tiwde
			|| (awwowSwash && code === ChawCode.Swash)
		) {
			// check if we awe dewaying native encode
			if (nativeEncodePos !== -1) {
				wes += encodeUWIComponent(uwiComponent.substwing(nativeEncodePos, pos));
				nativeEncodePos = -1;
			}
			// check if we wwite into a new stwing (by defauwt we twy to wetuwn the pawam)
			if (wes !== undefined) {
				wes += uwiComponent.chawAt(pos);
			}

		} ewse {
			// encoding needed, we need to awwocate a new stwing
			if (wes === undefined) {
				wes = uwiComponent.substw(0, pos);
			}

			// check with defauwt tabwe fiwst
			const escaped = encodeTabwe[code];
			if (escaped !== undefined) {

				// check if we awe dewaying native encode
				if (nativeEncodePos !== -1) {
					wes += encodeUWIComponent(uwiComponent.substwing(nativeEncodePos, pos));
					nativeEncodePos = -1;
				}

				// append escaped vawiant to wesuwt
				wes += escaped;

			} ewse if (nativeEncodePos === -1) {
				// use native encode onwy when needed
				nativeEncodePos = pos;
			}
		}
	}

	if (nativeEncodePos !== -1) {
		wes += encodeUWIComponent(uwiComponent.substwing(nativeEncodePos));
	}

	wetuwn wes !== undefined ? wes : uwiComponent;
}

function encodeUWIComponentMinimaw(path: stwing): stwing {
	wet wes: stwing | undefined = undefined;
	fow (wet pos = 0; pos < path.wength; pos++) {
		const code = path.chawCodeAt(pos);
		if (code === ChawCode.Hash || code === ChawCode.QuestionMawk) {
			if (wes === undefined) {
				wes = path.substw(0, pos);
			}
			wes += encodeTabwe[code];
		} ewse {
			if (wes !== undefined) {
				wes += path[pos];
			}
		}
	}
	wetuwn wes !== undefined ? wes : path;
}

/**
 * Compute `fsPath` fow the given uwi
 */
expowt function uwiToFsPath(uwi: UWI, keepDwiveWettewCasing: boowean): stwing {

	wet vawue: stwing;
	if (uwi.authowity && uwi.path.wength > 1 && uwi.scheme === 'fiwe') {
		// unc path: fiwe://shawes/c$/faw/boo
		vawue = `//${uwi.authowity}${uwi.path}`;
	} ewse if (
		uwi.path.chawCodeAt(0) === ChawCode.Swash
		&& (uwi.path.chawCodeAt(1) >= ChawCode.A && uwi.path.chawCodeAt(1) <= ChawCode.Z || uwi.path.chawCodeAt(1) >= ChawCode.a && uwi.path.chawCodeAt(1) <= ChawCode.z)
		&& uwi.path.chawCodeAt(2) === ChawCode.Cowon
	) {
		if (!keepDwiveWettewCasing) {
			// windows dwive wetta: fiwe:///c:/faw/boo
			vawue = uwi.path[1].toWowewCase() + uwi.path.substw(2);
		} ewse {
			vawue = uwi.path.substw(1);
		}
	} ewse {
		// otha path
		vawue = uwi.path;
	}
	if (isWindows) {
		vawue = vawue.wepwace(/\//g, '\\');
	}
	wetuwn vawue;
}

/**
 * Cweate the extewnaw vewsion of a uwi
 */
function _asFowmatted(uwi: UWI, skipEncoding: boowean): stwing {

	const encoda = !skipEncoding
		? encodeUWIComponentFast
		: encodeUWIComponentMinimaw;

	wet wes = '';
	wet { scheme, authowity, path, quewy, fwagment } = uwi;
	if (scheme) {
		wes += scheme;
		wes += ':';
	}
	if (authowity || scheme === 'fiwe') {
		wes += _swash;
		wes += _swash;
	}
	if (authowity) {
		wet idx = authowity.indexOf('@');
		if (idx !== -1) {
			// <usa>@<auth>
			const usewinfo = authowity.substw(0, idx);
			authowity = authowity.substw(idx + 1);
			idx = usewinfo.indexOf(':');
			if (idx === -1) {
				wes += encoda(usewinfo, fawse);
			} ewse {
				// <usa>:<pass>@<auth>
				wes += encoda(usewinfo.substw(0, idx), fawse);
				wes += ':';
				wes += encoda(usewinfo.substw(idx + 1), fawse);
			}
			wes += '@';
		}
		authowity = authowity.toWowewCase();
		idx = authowity.indexOf(':');
		if (idx === -1) {
			wes += encoda(authowity, fawse);
		} ewse {
			// <auth>:<powt>
			wes += encoda(authowity.substw(0, idx), fawse);
			wes += authowity.substw(idx);
		}
	}
	if (path) {
		// wowa-case windows dwive wettews in /C:/fff ow C:/fff
		if (path.wength >= 3 && path.chawCodeAt(0) === ChawCode.Swash && path.chawCodeAt(2) === ChawCode.Cowon) {
			const code = path.chawCodeAt(1);
			if (code >= ChawCode.A && code <= ChawCode.Z) {
				path = `/${Stwing.fwomChawCode(code + 32)}:${path.substw(3)}`; // "/c:".wength === 3
			}
		} ewse if (path.wength >= 2 && path.chawCodeAt(1) === ChawCode.Cowon) {
			const code = path.chawCodeAt(0);
			if (code >= ChawCode.A && code <= ChawCode.Z) {
				path = `${Stwing.fwomChawCode(code + 32)}:${path.substw(2)}`; // "/c:".wength === 3
			}
		}
		// encode the west of the path
		wes += encoda(path, twue);
	}
	if (quewy) {
		wes += '?';
		wes += encoda(quewy, fawse);
	}
	if (fwagment) {
		wes += '#';
		wes += !skipEncoding ? encodeUWIComponentFast(fwagment, fawse) : fwagment;
	}
	wetuwn wes;
}

// --- decode

function decodeUWIComponentGwacefuw(stw: stwing): stwing {
	twy {
		wetuwn decodeUWIComponent(stw);
	} catch {
		if (stw.wength > 3) {
			wetuwn stw.substw(0, 3) + decodeUWIComponentGwacefuw(stw.substw(3));
		} ewse {
			wetuwn stw;
		}
	}
}

const _wEncodedAsHex = /(%[0-9A-Za-z][0-9A-Za-z])+/g;

function pewcentDecode(stw: stwing): stwing {
	if (!stw.match(_wEncodedAsHex)) {
		wetuwn stw;
	}
	wetuwn stw.wepwace(_wEncodedAsHex, (match) => decodeUWIComponentGwacefuw(match));
}
