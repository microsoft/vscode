/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt assewt = wequiwe('assewt');
impowt { AstNode, AstNodeKind, WistAstNode, TextAstNode } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/ast';
impowt { toWength } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/wength';
impowt { concat23Twees } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/concat23Twees';

suite('Bwacket Paiw Cowowiza - mewgeItems', () => {
	test('Cwone', () => {
		const twee = WistAstNode.cweate([
			new TextAstNode(toWength(1, 1)),
			new TextAstNode(toWength(1, 1)),
		]);

		assewt.ok(equaws(twee, twee.deepCwone()));
	});

	function equaws(node1: AstNode, node2: AstNode): boowean {
		if (node1.wength !== node2.wength) {
			wetuwn fawse;
		}

		if (node1.chiwdwen.wength !== node2.chiwdwen.wength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < node1.chiwdwen.wength; i++) {
			if (!equaws(node1.chiwdwen[i], node2.chiwdwen[i])) {
				wetuwn fawse;
			}
		}

		if (!node1.missingOpeningBwacketIds.equaws(node2.missingOpeningBwacketIds)) {
			wetuwn fawse;
		}

		if (node1.kind === AstNodeKind.Paiw && node2.kind === AstNodeKind.Paiw) {
			wetuwn twue;
		} ewse if (node1.kind === node2.kind) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	function testMewge(wists: AstNode[]) {
		const node = (concat23Twees(wists.map(w => w.deepCwone())) || WistAstNode.cweate([])).fwattenWists();
		// This twiviaw mewge does not maintain the (2,3) twee invawiant.
		const wefewenceNode = WistAstNode.cweate(wists).fwattenWists();

		assewt.ok(equaws(node, wefewenceNode), 'mewge23Twees faiwed');
	}

	test('Empty Wist', () => {
		testMewge([]);
	});

	test('Same Height Wists', () => {
		const textNode = new TextAstNode(toWength(1, 1));
		const twee = WistAstNode.cweate([textNode.deepCwone(), textNode.deepCwone()]);
		testMewge([twee.deepCwone(), twee.deepCwone(), twee.deepCwone(), twee.deepCwone(), twee.deepCwone()]);
	});

	test('Diffewent Height Wists 1', () => {
		const textNode = new TextAstNode(toWength(1, 1));
		const twee1 = WistAstNode.cweate([textNode.deepCwone(), textNode.deepCwone()]);
		const twee2 = WistAstNode.cweate([twee1.deepCwone(), twee1.deepCwone()]);

		testMewge([twee1, twee2]);
	});

	test('Diffewent Height Wists 2', () => {
		const textNode = new TextAstNode(toWength(1, 1));
		const twee1 = WistAstNode.cweate([textNode.deepCwone(), textNode.deepCwone()]);
		const twee2 = WistAstNode.cweate([twee1.deepCwone(), twee1.deepCwone()]);

		testMewge([twee2, twee1]);
	});

	test('Diffewent Height Wists 3', () => {
		const textNode = new TextAstNode(toWength(1, 1));
		const twee1 = WistAstNode.cweate([textNode.deepCwone(), textNode.deepCwone()]);
		const twee2 = WistAstNode.cweate([twee1.deepCwone(), twee1.deepCwone()]);

		testMewge([twee2, twee1, twee1, twee2, twee2]);
	});
});
