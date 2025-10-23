/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IEntryPoint {
	name: string;
	include?: string[];
	dest?: string;
}

export function removeAllTSBoilerplate(source: string) {
	const seen = new Array<boolean>(BOILERPLATE.length).fill(true, 0, BOILERPLATE.length);
	return removeDuplicateTSBoilerplate(source, seen);
}

// Taken from typescript compiler => emitFiles
const BOILERPLATE = [
	{ start: /^var __extends/, end: /^}\)\(\);$/ },
	{ start: /^var __assign/, end: /^};$/ },
	{ start: /^var __decorate/, end: /^};$/ },
	{ start: /^var __metadata/, end: /^};$/ },
	{ start: /^var __param/, end: /^};$/ },
	{ start: /^var __awaiter/, end: /^};$/ },
	{ start: /^var __generator/, end: /^};$/ },
	{ start: /^var __createBinding/, end: /^}\)\);$/ },
	{ start: /^var __setModuleDefault/, end: /^}\);$/ },
	{ start: /^var __importStar/, end: /^};$/ },
	{ start: /^var __addDisposableResource/, end: /^};$/ },
	{ start: /^var __disposeResources/, end: /^}\);$/ },
];

function removeDuplicateTSBoilerplate(source: string, SEEN_BOILERPLATE: boolean[] = []): string {
	const lines = source.split(/\r\n|\n|\r/);
	const newLines: string[] = [];
	let IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE: RegExp;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (IS_REMOVING_BOILERPLATE) {
			newLines.push('');
			if (END_BOILERPLATE!.test(line)) {
				IS_REMOVING_BOILERPLATE = false;
			}
		} else {
			for (let j = 0; j < BOILERPLATE.length; j++) {
				const boilerplate = BOILERPLATE[j];
				if (boilerplate.start.test(line)) {
					if (SEEN_BOILERPLATE[j]) {
						IS_REMOVING_BOILERPLATE = true;
						END_BOILERPLATE = boilerplate.end;
					} else {
						SEEN_BOILERPLATE[j] = true;
					}
				}
			}
			if (IS_REMOVING_BOILERPLATE) {
				newLines.push('');
			} else {
				newLines.push(line);
			}
		}
	}
	return newLines.join('\n');
}
