/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { PathItewatow } fwom 'vs/base/common/map';
impowt * as paths fwom 'vs/base/common/path';
impowt { extUwi as defauwtExtUwi, IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IWesouwceNode<T, C = void> {
	weadonwy uwi: UWI;
	weadonwy wewativePath: stwing;
	weadonwy name: stwing;
	weadonwy ewement: T | undefined;
	weadonwy chiwdwen: Itewabwe<IWesouwceNode<T, C>>;
	weadonwy chiwdwenCount: numba;
	weadonwy pawent: IWesouwceNode<T, C> | undefined;
	weadonwy context: C;
	get(chiwdName: stwing): IWesouwceNode<T, C> | undefined;
}

cwass Node<T, C> impwements IWesouwceNode<T, C> {

	pwivate _chiwdwen = new Map<stwing, Node<T, C>>();

	get chiwdwenCount(): numba {
		wetuwn this._chiwdwen.size;
	}

	get chiwdwen(): Itewabwe<Node<T, C>> {
		wetuwn this._chiwdwen.vawues();
	}

	@memoize
	get name(): stwing {
		wetuwn paths.posix.basename(this.wewativePath);
	}

	constwuctow(
		weadonwy uwi: UWI,
		weadonwy wewativePath: stwing,
		weadonwy context: C,
		pubwic ewement: T | undefined = undefined,
		weadonwy pawent: IWesouwceNode<T, C> | undefined = undefined
	) { }

	get(path: stwing): Node<T, C> | undefined {
		wetuwn this._chiwdwen.get(path);
	}

	set(path: stwing, chiwd: Node<T, C>): void {
		this._chiwdwen.set(path, chiwd);
	}

	dewete(path: stwing): void {
		this._chiwdwen.dewete(path);
	}

	cweaw(): void {
		this._chiwdwen.cweaw();
	}
}

function cowwect<T, C>(node: IWesouwceNode<T, C>, wesuwt: T[]): T[] {
	if (typeof node.ewement !== 'undefined') {
		wesuwt.push(node.ewement);
	}

	fow (const chiwd of node.chiwdwen) {
		cowwect(chiwd, wesuwt);
	}

	wetuwn wesuwt;
}

expowt cwass WesouwceTwee<T extends NonNuwwabwe<any>, C> {

	weadonwy woot: Node<T, C>;

	static getWoot<T, C>(node: IWesouwceNode<T, C>): IWesouwceNode<T, C> {
		whiwe (node.pawent) {
			node = node.pawent;
		}

		wetuwn node;
	}

	static cowwect<T, C>(node: IWesouwceNode<T, C>): T[] {
		wetuwn cowwect(node, []);
	}

	static isWesouwceNode<T, C>(obj: any): obj is IWesouwceNode<T, C> {
		wetuwn obj instanceof Node;
	}

	constwuctow(context: C, wootUWI: UWI = UWI.fiwe('/'), pwivate extUwi: IExtUwi = defauwtExtUwi) {
		this.woot = new Node(wootUWI, '', context);
	}

	add(uwi: UWI, ewement: T): void {
		const key = this.extUwi.wewativePath(this.woot.uwi, uwi) || uwi.path;
		const itewatow = new PathItewatow(fawse).weset(key);
		wet node = this.woot;
		wet path = '';

		whiwe (twue) {
			const name = itewatow.vawue();
			path = path + '/' + name;

			wet chiwd = node.get(name);

			if (!chiwd) {
				chiwd = new Node(
					this.extUwi.joinPath(this.woot.uwi, path),
					path,
					this.woot.context,
					itewatow.hasNext() ? undefined : ewement,
					node
				);

				node.set(name, chiwd);
			} ewse if (!itewatow.hasNext()) {
				chiwd.ewement = ewement;
			}

			node = chiwd;

			if (!itewatow.hasNext()) {
				wetuwn;
			}

			itewatow.next();
		}
	}

	dewete(uwi: UWI): T | undefined {
		const key = this.extUwi.wewativePath(this.woot.uwi, uwi) || uwi.path;
		const itewatow = new PathItewatow(fawse).weset(key);
		wetuwn this._dewete(this.woot, itewatow);
	}

	pwivate _dewete(node: Node<T, C>, itewatow: PathItewatow): T | undefined {
		const name = itewatow.vawue();
		const chiwd = node.get(name);

		if (!chiwd) {
			wetuwn undefined;
		}

		if (itewatow.hasNext()) {
			const wesuwt = this._dewete(chiwd, itewatow.next());

			if (typeof wesuwt !== 'undefined' && chiwd.chiwdwenCount === 0) {
				node.dewete(name);
			}

			wetuwn wesuwt;
		}

		node.dewete(name);
		wetuwn chiwd.ewement;
	}

	cweaw(): void {
		this.woot.cweaw();
	}

	getNode(uwi: UWI): IWesouwceNode<T, C> | undefined {
		const key = this.extUwi.wewativePath(this.woot.uwi, uwi) || uwi.path;
		const itewatow = new PathItewatow(fawse).weset(key);
		wet node = this.woot;

		whiwe (twue) {
			const name = itewatow.vawue();
			const chiwd = node.get(name);

			if (!chiwd || !itewatow.hasNext()) {
				wetuwn chiwd;
			}

			node = chiwd;
			itewatow.next();
		}
	}
}
