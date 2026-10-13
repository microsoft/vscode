/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from '../../../../util/vs/base/common/path';
import { OverlayNode } from '../../node/nodes';
import { structureComputer } from '../../node/structure';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { insertRangeMarkers } from './markers';

export function pathInFixture(pathWithinFixturesDir: string) {
	const filePath = path.join(__dirname, 'fixtures', pathWithinFixturesDir);
	return filePath;
}

export function snapshotPathInFixture(pathWithinFixturesDir: string) {
	return pathInFixture(pathWithinFixturesDir + '.getStructure.html');
}

export async function fromFixture(pathWithinFixturesDir: string) {
	const filePath = pathInFixture(pathWithinFixturesDir);
	const contents = (await fs.promises.readFile(filePath)).toString();
	return contents;
}

function treeToFlatList(
	node: OverlayNode
): { startIndex: number; endIndex: number; kind: string }[] {
	const result: { startIndex: number; endIndex: number; kind: string }[] =
		[];
	for (const child of node.children) {
		result.push({
			startIndex: child.startIndex,
			endIndex: child.endIndex,
			kind: child.kind.toUpperCase(),
		});
		result.push(...treeToFlatList(child));
	}
	return result;
}

export async function srcWithAnnotatedStructure(
	language: WASMLanguage,
	source: string
) {
	const structure = await structureComputer.getStructure(language, source);
	const flatList = structure ? treeToFlatList(structure) : [];
	return insertRangeMarkers(source, flatList);
}
