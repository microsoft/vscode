/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { promises as fs } from 'fs';
import minimist from 'minimist';
import * as path from 'path';

const fixturesRootsFolder = path.join(__dirname, '../../src/extension/test/node/fixtures/patch');
const simulationsRootFolder = path.join(__dirname, '../../.simulation');

async function main(simulationFolder: string | undefined, all: boolean | undefined, annotationFilter: string = 'invalid patch'): Promise<void> {
	if (!simulationFolder || !await checkExists(simulationsRootFolder)) {
		const lastRunName = await findLastRun(simulationsRootFolder);
		if (!lastRunName) {
			console.log(`No run found in ${simulationsRootFolder}`);
			return;
		}
		simulationFolder = path.join(simulationsRootFolder, lastRunName);
	}
	const outputFixturesFolder = path.join(fixturesRootsFolder, path.basename(simulationFolder));
	console.log(`Looking for stest results in ${simulationFolder}`);
	const entries = await fs.readdir(simulationFolder);
	for (const entry of entries) {
		for (let testRun = 0; testRun < 10; testRun++) {
			const simTextPath = path.join(simulationFolder, entry, `0${testRun}-inline-simulator.txt`);
			if (!await checkExists(simTextPath)) {
				break;
			}
			const simText = JSON.parse(await fs.readFile(simTextPath, 'utf8')) as any[];
			if (!all) {
				const isInvalidPatch = (() => {
					for (let i = 0; i < simText.length; i++) {
						const data = simText[i];
						if (data.kind === 'interaction' && Array.isArray(data.annotations)) {
							for (const annotation of data.annotations) {
								if (annotation.label === annotationFilter) {
									return true;
								}
							}
						}
					}
					return undefined;
				})();
				if (!isInvalidPatch) {
					continue;
				}
			}
			const simRequest = JSON.parse(await fs.readFile(path.join(simulationFolder, entry, `0${testRun}-sim-requests.txt`), 'utf8')) as any[];
			const originalFileEntry = (() => {
				for (let i = 0; i < simText.length; i++) {
					const data = simText[i];
					if (data.kind === 'initial') {
						return data.file;
					}
				}
				return undefined;
			})();
			if (!originalFileEntry) {
				console.log('No original file path found');
				break;
			}
			const original = await fs.readFile(path.join(simulationFolder, originalFileEntry.relativeDiskPath), 'utf8');
			const modifedFilePath = (() => {
				for (let i = 0; i < simText.length; i++) {
					const data = simText[i];
					if (data.kind === 'interaction' && Array.isArray(data.changedFiles)) {
						for (const changedFile of data.changedFiles) {
							if (changedFile.workspacePath === originalFileEntry.workspacePath) {
								return changedFile.relativeDiskPath;
							}
						}
					}
				}
				return undefined;
			})();

			if (!modifedFilePath) {
				console.log('No modified file path found');
				break;
			}
			const modified = await fs.readFile(path.join(simulationFolder, modifedFilePath), 'utf8');
			const response = simRequest[0].response.value.join('');

			const name = `${entry}0${testRun}`;
			console.log(`Writing fixtures for ${name} at ${outputFixturesFolder}`);
			await fs.mkdir(outputFixturesFolder, { recursive: true });
			await fs.writeFile(path.join(outputFixturesFolder, `${name}.original.txt`), original);
			await fs.writeFile(path.join(outputFixturesFolder, `${name}.expected.txt`), modified);
			await fs.writeFile(path.join(outputFixturesFolder, `${name}.patch.txt`), response);
		}

	}
}

async function findLastRun(simulationsRootFolder: string): Promise<string | undefined> {
	const entries = await fs.readdir(simulationsRootFolder);
	return entries.filter(entry => entry.match(/^out-\d{8}-\d{6}$/)).sort().pop();
}

async function checkExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch (error) {
		return false;
	}
}


if (require.main === module) {
	const parsedArgs = minimist(process.argv);
	if (parsedArgs.help) {
		console.log('Usage: npx tsx editFromPatchTests.ts --simulation-folder <path-to-simulation-folder> --all --annotation <annotation>');
		process.exit(0);
	}


	main(parsedArgs['simulation-folder'], parsedArgs['all'], parsedArgs['annotation']).catch(err => {
		console.error(err);
		process.exit(1);
	});

}
