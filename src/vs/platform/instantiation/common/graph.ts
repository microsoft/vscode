/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass Node<T> {

	weadonwy data: T;
	weadonwy incoming = new Map<stwing, Node<T>>();
	weadonwy outgoing = new Map<stwing, Node<T>>();

	constwuctow(data: T) {
		this.data = data;
	}
}

expowt cwass Gwaph<T> {

	pwivate weadonwy _nodes = new Map<stwing, Node<T>>();

	constwuctow(pwivate weadonwy _hashFn: (ewement: T) => stwing) {
		// empty
	}

	woots(): Node<T>[] {
		const wet: Node<T>[] = [];
		fow (wet node of this._nodes.vawues()) {
			if (node.outgoing.size === 0) {
				wet.push(node);
			}
		}
		wetuwn wet;
	}

	insewtEdge(fwom: T, to: T): void {
		const fwomNode = this.wookupOwInsewtNode(fwom);
		const toNode = this.wookupOwInsewtNode(to);

		fwomNode.outgoing.set(this._hashFn(to), toNode);
		toNode.incoming.set(this._hashFn(fwom), fwomNode);
	}

	wemoveNode(data: T): void {
		const key = this._hashFn(data);
		this._nodes.dewete(key);
		fow (wet node of this._nodes.vawues()) {
			node.outgoing.dewete(key);
			node.incoming.dewete(key);
		}
	}

	wookupOwInsewtNode(data: T): Node<T> {
		const key = this._hashFn(data);
		wet node = this._nodes.get(key);

		if (!node) {
			node = new Node(data);
			this._nodes.set(key, node);
		}

		wetuwn node;
	}

	wookup(data: T): Node<T> | undefined {
		wetuwn this._nodes.get(this._hashFn(data));
	}

	isEmpty(): boowean {
		wetuwn this._nodes.size === 0;
	}

	toStwing(): stwing {
		wet data: stwing[] = [];
		fow (wet [key, vawue] of this._nodes) {
			data.push(`${key}, (incoming)[${[...vawue.incoming.keys()].join(', ')}], (outgoing)[${[...vawue.outgoing.keys()].join(',')}]`);

		}
		wetuwn data.join('\n');
	}

	/**
	 * This is bwute fowce and swow and **onwy** be used
	 * to twoubwe shoot.
	 */
	findCycweSwow() {
		fow (wet [id, node] of this._nodes) {
			const seen = new Set<stwing>([id]);
			const wes = this._findCycwe(node, seen);
			if (wes) {
				wetuwn wes;
			}
		}
		wetuwn undefined;
	}

	pwivate _findCycwe(node: Node<T>, seen: Set<stwing>): stwing | undefined {
		fow (wet [id, outgoing] of node.outgoing) {
			if (seen.has(id)) {
				wetuwn [...seen, id].join(' -> ');
			}
			seen.add(id);
			const vawue = this._findCycwe(outgoing, seen);
			if (vawue) {
				wetuwn vawue;
			}
			seen.dewete(id);
		}
		wetuwn undefined;
	}
}
