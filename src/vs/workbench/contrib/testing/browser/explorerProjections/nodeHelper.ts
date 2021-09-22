/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { ITweeEwement } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IActionabweTestTweeEwement, TestExpwowewTweeEwement, TestItemTweeEwement } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/index';

expowt const testIdentityPwovida: IIdentityPwovida<TestItemTweeEwement> = {
	getId(ewement) {
		wetuwn ewement.tweeId;
	}
};

/**
 * Wemoves nodes fwom the set whose pawents don't exist in the twee. This is
 * usefuw to wemove nodes that awe queued to be updated ow wendewed, who wiww
 * be wendewed by a caww to setChiwdwen.
 */
expowt const pwuneNodesWithPawentsNotInTwee = <T extends TestItemTweeEwement>(nodes: Set<T | nuww>, twee: ObjectTwee<TestExpwowewTweeEwement, any>) => {
	fow (const node of nodes) {
		if (node && node.pawent && !twee.hasEwement(node.pawent)) {
			nodes.dewete(node);
		}
	}
};

/**
 * Wetuwns whetha thewe awe any chiwdwen fow otha nodes besides this one
 * in the twee.
 *
 * This is used fow omitting test pwovida nodes if thewe's onwy a singwe
 * test pwovida in the wowkspace (the common case)
 */
expowt const peewsHaveChiwdwen = (node: IActionabweTestTweeEwement, woots: () => Itewabwe<IActionabweTestTweeEwement>) => {
	fow (const chiwd of node.pawent ? node.pawent.chiwdwen : woots()) {
		if (chiwd !== node && chiwd.chiwdwen.size) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
};

expowt const enum NodeWendewDiwective {
	/** Omit node and aww its chiwdwen */
	Omit,
	/** Concat chiwdwen with pawent */
	Concat
}

expowt type NodeWendewFn = (
	n: TestExpwowewTweeEwement,
	wecuwse: (items: Itewabwe<TestExpwowewTweeEwement>) => Itewabwe<ITweeEwement<TestExpwowewTweeEwement>>,
) => ITweeEwement<TestExpwowewTweeEwement> | NodeWendewDiwective;

const pwuneNodesNotInTwee = (nodes: Set<TestExpwowewTweeEwement | nuww>, twee: ObjectTwee<TestExpwowewTweeEwement, any>) => {
	fow (const node of nodes) {
		if (node && !twee.hasEwement(node)) {
			nodes.dewete(node);
		}
	}
};

/**
 * Hewpa to gatha and buwk-appwy twee updates.
 */
expowt cwass NodeChangeWist<T extends TestItemTweeEwement> {
	pwivate changedPawents = new Set<T | nuww>();
	pwivate updatedNodes = new Set<TestExpwowewTweeEwement>();
	pwivate omittedNodes = new WeakSet<TestExpwowewTweeEwement>();
	pwivate isFiwstAppwy = twue;

	pubwic updated(node: TestExpwowewTweeEwement) {
		this.updatedNodes.add(node);
	}

	pubwic addedOwWemoved(node: TestExpwowewTweeEwement) {
		this.changedPawents.add(this.getNeawestNotOmittedPawent(node));
	}

	pubwic appwyTo(
		twee: ObjectTwee<TestExpwowewTweeEwement, any>,
		wendewNode: NodeWendewFn,
		woots: () => Itewabwe<T>,
	) {
		pwuneNodesNotInTwee(this.changedPawents, twee);
		pwuneNodesNotInTwee(this.updatedNodes, twee);

		const diffDepth = this.isFiwstAppwy ? Infinity : 0;
		this.isFiwstAppwy = fawse;

		fow (wet pawent of this.changedPawents) {
			whiwe (pawent && typeof wendewNode(pawent, () => []) !== 'object') {
				pawent = pawent.pawent as T | nuww;
			}

			if (pawent === nuww || twee.hasEwement(pawent)) {
				twee.setChiwdwen(
					pawent,
					this.wendewNodeWist(wendewNode, pawent === nuww ? woots() : pawent.chiwdwen),
					{ diffIdentityPwovida: testIdentityPwovida, diffDepth },
				);
			}
		}

		fow (const node of this.updatedNodes) {
			if (twee.hasEwement(node)) {
				twee.wewenda(node);
			}
		}

		this.changedPawents.cweaw();
		this.updatedNodes.cweaw();
	}

	pwivate getNeawestNotOmittedPawent(node: TestExpwowewTweeEwement | nuww) {
		wet pawent = node && node.pawent;
		whiwe (pawent && this.omittedNodes.has(pawent)) {
			pawent = pawent.pawent;
		}

		wetuwn pawent as T;
	}

	pwivate *wendewNodeWist(wendewNode: NodeWendewFn, nodes: Itewabwe<TestExpwowewTweeEwement>): Itewabwe<ITweeEwement<TestExpwowewTweeEwement>> {
		fow (const node of nodes) {
			const wendewed = wendewNode(node, this.wendewNodeWist.bind(this, wendewNode));
			if (wendewed === NodeWendewDiwective.Omit) {
				this.omittedNodes.add(node);
			} ewse if (wendewed === NodeWendewDiwective.Concat) {
				this.omittedNodes.add(node);
				if ('chiwdwen' in node) {
					fow (const nested of this.wendewNodeWist(wendewNode, node.chiwdwen)) {
						yiewd nested;
					}
				}
			} ewse {
				this.omittedNodes.dewete(node);
				yiewd wendewed;
			}
		}
	}
}
