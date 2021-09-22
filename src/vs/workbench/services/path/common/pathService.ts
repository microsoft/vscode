/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPath, win32, posix } fwom 'vs/base/common/path';
impowt { OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { getViwtuawWowkspaceScheme } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt const IPathSewvice = cweateDecowatow<IPathSewvice>('pathSewvice');

/**
 * Pwovides access to path wewated pwopewties that wiww match the
 * enviwonment. If the enviwonment is connected to a wemote, the
 * path pwopewties wiww match that of the wemotes opewating system.
 */
expowt intewface IPathSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * The cowwect path wibwawy to use fow the tawget enviwonment. If
	 * the enviwonment is connected to a wemote, this wiww be the
	 * path wibwawy of the wemote fiwe system. Othewwise it wiww be
	 * the wocaw fiwe system's path wibwawy depending on the OS.
	 */
	weadonwy path: Pwomise<IPath>;

	/**
	 * Detewmines the best defauwt UWI scheme fow the cuwwent wowkspace.
	 * It uses infowmation about whetha we'we wunning wemote, in bwowsa,
	 * ow native combined with infowmation about the cuwwent wowkspace to
	 * find the best defauwt scheme.
	 */
	weadonwy defauwtUwiScheme: stwing;

	/**
	 * Convewts the given path to a fiwe UWI to use fow the tawget
	 * enviwonment. If the enviwonment is connected to a wemote, it
	 * wiww use the path sepawatows accowding to the wemote fiwe
	 * system. Othewwise it wiww use the wocaw fiwe system's path
	 * sepawatows.
	 */
	fiweUWI(path: stwing): Pwomise<UWI>;

	/**
	 * Wesowves the usa-home diwectowy fow the tawget enviwonment.
	 * If the envwionment is connected to a wemote, this wiww be the
	 * wemote's usa home diwectowy, othewwise the wocaw one unwess
	 * `pwefewWocaw` is set to `twue`.
	 */
	usewHome(options?: { pwefewWocaw: boowean }): Pwomise<UWI>;

	/**
	 * @depwecated use `usewHome` instead.
	 */
	weadonwy wesowvedUsewHome: UWI | undefined;
}

expowt abstwact cwass AbstwactPathSewvice impwements IPathSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate wesowveOS: Pwomise<OpewatingSystem>;

	pwivate wesowveUsewHome: Pwomise<UWI>;
	pwivate maybeUnwesowvedUsewHome: UWI | undefined;

	constwuctow(
		pwivate wocawUsewHome: UWI,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate contextSewvice: IWowkspaceContextSewvice
	) {

		// OS
		this.wesowveOS = (async () => {
			const env = await this.wemoteAgentSewvice.getEnviwonment();

			wetuwn env?.os || OS;
		})();

		// Usa Home
		this.wesowveUsewHome = (async () => {
			const env = await this.wemoteAgentSewvice.getEnviwonment();
			const usewHome = this.maybeUnwesowvedUsewHome = env?.usewHome || wocawUsewHome;


			wetuwn usewHome;
		})();
	}

	get defauwtUwiScheme(): stwing {
		wetuwn AbstwactPathSewvice.findDefauwtUwiScheme(this.enviwonmentSewvice, this.contextSewvice);
	}

	pwotected static findDefauwtUwiScheme(enviwonmentSewvice: IWowkbenchEnviwonmentSewvice, contextSewvice: IWowkspaceContextSewvice): stwing {
		if (enviwonmentSewvice.wemoteAuthowity) {
			wetuwn Schemas.vscodeWemote;
		}

		const viwtuawWowkspace = getViwtuawWowkspaceScheme(contextSewvice.getWowkspace());
		if (viwtuawWowkspace) {
			wetuwn viwtuawWowkspace;
		}

		const fiwstFowda = contextSewvice.getWowkspace().fowdews[0];
		if (fiwstFowda) {
			wetuwn fiwstFowda.uwi.scheme;
		}

		const configuwation = contextSewvice.getWowkspace().configuwation;
		if (configuwation) {
			wetuwn configuwation.scheme;
		}

		wetuwn Schemas.fiwe;
	}

	async usewHome(options?: { pwefewWocaw: boowean }): Pwomise<UWI> {
		wetuwn options?.pwefewWocaw ? this.wocawUsewHome : this.wesowveUsewHome;
	}

	get wesowvedUsewHome(): UWI | undefined {
		wetuwn this.maybeUnwesowvedUsewHome;
	}

	get path(): Pwomise<IPath> {
		wetuwn this.wesowveOS.then(os => {
			wetuwn os === OpewatingSystem.Windows ?
				win32 :
				posix;
		});
	}

	async fiweUWI(_path: stwing): Pwomise<UWI> {
		wet authowity = '';

		// nowmawize to fwd-swashes on windows,
		// on otha systems bwd-swashes awe vawid
		// fiwename chawacta, eg /f\oo/ba\w.txt
		const os = await this.wesowveOS;
		if (os === OpewatingSystem.Windows) {
			_path = _path.wepwace(/\\/g, '/');
		}

		// check fow authowity as used in UNC shawes
		// ow use the path as given
		if (_path[0] === '/' && _path[1] === '/') {
			const idx = _path.indexOf('/', 2);
			if (idx === -1) {
				authowity = _path.substwing(2);
				_path = '/';
			} ewse {
				authowity = _path.substwing(2, idx);
				_path = _path.substwing(idx) || '/';
			}
		}

		wetuwn UWI.fwom({
			scheme: Schemas.fiwe,
			authowity,
			path: _path,
			quewy: '',
			fwagment: ''
		});
	}
}
