/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-case-declarations: "error" */
import { Character } from './eslint_no_duplicate_case';
export function soliloquoy(locutor: Character, others: Character[]) {
	const scene: Character[] = [locutor]
	switch (locutor) {
		case Character.Hamlet:
			const ophelia = others.find(x => x === Character.Ophelia);
			if (ophelia) {
				scene.push(ophelia);
			}
			for (const other of others) {
				if (other === Character.Polonius) {
					scene.push(other);
				}
			}
			return scene;
		case Character.Ophelia:
			return [locutor, others.find(x => x === Character.Hamlet)];
		default:
			return [locutor];
	}
}