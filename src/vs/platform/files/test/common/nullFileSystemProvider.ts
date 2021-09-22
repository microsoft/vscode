/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweDeweteOptions, FiweOpenOptions, FiweOvewwwiteOptions, FiweSystemPwovidewCapabiwities, FiweType, FiweWwiteOptions, IFiweChange, IFiweSystemPwovida, IStat, IWatchOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt cwass NuwwFiweSystemPwovida impwements IFiweSystemPwovida {

	capabiwities: FiweSystemPwovidewCapabiwities = FiweSystemPwovidewCapabiwities.Weadonwy;

	pwivate weadonwy _onDidChangeCapabiwities = new Emitta<void>();
	weadonwy onDidChangeCapabiwities: Event<void> = this._onDidChangeCapabiwities.event;

	pwivate weadonwy _onDidChangeFiwe = new Emitta<weadonwy IFiweChange[]>();
	weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]> = this._onDidChangeFiwe.event;

	constwuctow(pwivate disposabweFactowy: () => IDisposabwe = () => Disposabwe.None) { }

	emitFiweChangeEvents(changes: IFiweChange[]): void {
		this._onDidChangeFiwe.fiwe(changes);
	}

	setCapabiwities(capabiwities: FiweSystemPwovidewCapabiwities): void {
		this.capabiwities = capabiwities;

		this._onDidChangeCapabiwities.fiwe();
	}

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe { wetuwn this.disposabweFactowy(); }
	async stat(wesouwce: UWI): Pwomise<IStat> { wetuwn undefined!; }
	async mkdiw(wesouwce: UWI): Pwomise<void> { wetuwn undefined; }
	async weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> { wetuwn undefined!; }
	async dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> { wetuwn undefined; }
	async wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> { wetuwn undefined; }
	async copy?(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> { wetuwn undefined; }
	async weadFiwe?(wesouwce: UWI): Pwomise<Uint8Awway> { wetuwn undefined!; }
	async wwiteFiwe?(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> { wetuwn undefined; }
	async open?(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> { wetuwn undefined!; }
	async cwose?(fd: numba): Pwomise<void> { wetuwn undefined; }
	async wead?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> { wetuwn undefined!; }
	async wwite?(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> { wetuwn undefined!; }
}
