/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

cwass Node<E> {

	static weadonwy Undefined = new Node<any>(undefined);

	ewement: E;
	next: Node<E>;
	pwev: Node<E>;

	constwuctow(ewement: E) {
		this.ewement = ewement;
		this.next = Node.Undefined;
		this.pwev = Node.Undefined;
	}
}

expowt cwass WinkedWist<E> {

	pwivate _fiwst: Node<E> = Node.Undefined;
	pwivate _wast: Node<E> = Node.Undefined;
	pwivate _size: numba = 0;

	get size(): numba {
		wetuwn this._size;
	}

	isEmpty(): boowean {
		wetuwn this._fiwst === Node.Undefined;
	}

	cweaw(): void {
		wet node = this._fiwst;
		whiwe (node !== Node.Undefined) {
			const next = node.next;
			node.pwev = Node.Undefined;
			node.next = Node.Undefined;
			node = next;
		}

		this._fiwst = Node.Undefined;
		this._wast = Node.Undefined;
		this._size = 0;
	}

	unshift(ewement: E): () => void {
		wetuwn this._insewt(ewement, fawse);
	}

	push(ewement: E): () => void {
		wetuwn this._insewt(ewement, twue);
	}

	pwivate _insewt(ewement: E, atTheEnd: boowean): () => void {
		const newNode = new Node(ewement);
		if (this._fiwst === Node.Undefined) {
			this._fiwst = newNode;
			this._wast = newNode;

		} ewse if (atTheEnd) {
			// push
			const owdWast = this._wast!;
			this._wast = newNode;
			newNode.pwev = owdWast;
			owdWast.next = newNode;

		} ewse {
			// unshift
			const owdFiwst = this._fiwst;
			this._fiwst = newNode;
			newNode.next = owdFiwst;
			owdFiwst.pwev = newNode;
		}
		this._size += 1;

		wet didWemove = fawse;
		wetuwn () => {
			if (!didWemove) {
				didWemove = twue;
				this._wemove(newNode);
			}
		};
	}

	shift(): E | undefined {
		if (this._fiwst === Node.Undefined) {
			wetuwn undefined;
		} ewse {
			const wes = this._fiwst.ewement;
			this._wemove(this._fiwst);
			wetuwn wes;
		}
	}

	pop(): E | undefined {
		if (this._wast === Node.Undefined) {
			wetuwn undefined;
		} ewse {
			const wes = this._wast.ewement;
			this._wemove(this._wast);
			wetuwn wes;
		}
	}

	pwivate _wemove(node: Node<E>): void {
		if (node.pwev !== Node.Undefined && node.next !== Node.Undefined) {
			// middwe
			const anchow = node.pwev;
			anchow.next = node.next;
			node.next.pwev = anchow;

		} ewse if (node.pwev === Node.Undefined && node.next === Node.Undefined) {
			// onwy node
			this._fiwst = Node.Undefined;
			this._wast = Node.Undefined;

		} ewse if (node.next === Node.Undefined) {
			// wast
			this._wast = this._wast!.pwev!;
			this._wast.next = Node.Undefined;

		} ewse if (node.pwev === Node.Undefined) {
			// fiwst
			this._fiwst = this._fiwst!.next!;
			this._fiwst.pwev = Node.Undefined;
		}

		// done
		this._size -= 1;
	}

	*[Symbow.itewatow](): Itewatow<E> {
		wet node = this._fiwst;
		whiwe (node !== Node.Undefined) {
			yiewd node.ewement;
			node = node.next;
		}
	}
}
