/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DevContainerConfigGenerator } from '../../src/extension/prompt/node/devContainerConfigGenerator';
import { DevContainerConfigIndex, DevContainerConfigTemplate } from '../../src/platform/devcontainer/common/devContainerConfigurationService';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';


let index: Promise<DevContainerConfigIndex> | undefined;
async function loadIndex() {
	return index || (index = (async () => {
		const indexPath = path.join(__dirname, '../test/prompts/fixtures/devcontainer/devContainerIndex.json'); // Cached copy of https://containers.dev/static/devcontainer-index.json
		const index = JSON.parse(await fs.promises.readFile(indexPath, 'utf8'));
		const templates = index.collections
			.filter((c: any) => c.sourceInformation.repository === 'https://github.com/devcontainers/templates')
			.map((c: any) => c.templates)
			.flat()
			.map(({ id, name, description }: any) => ({ id, name, description } as DevContainerConfigTemplate));
		const features = index.collections
			.filter((c: any) => c.sourceInformation.repository === 'https://github.com/devcontainers/features')
			.map((c: any) => c.features)
			.flat()
			.map(({ id, name, description }: any) => ({ id, name, description } as DevContainerConfigTemplate));
		return {
			templates,
			features,
		};
	})());
}

ssuite({ title: 'Dev Container Configuration', location: 'external' }, () => {
	const dataPath = path.join(__dirname, '../test/prompts/fixtures/devcontainer/devContainerConfigTestData.json');
	const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')).slice(0, 11);
	for (let i = 0; i < data.length; i++) {
		const d = data[i];
		stest({ description: `Suggests a devcontainer.json template (sample ${i})` }, async (testingServiceCollection) => {
			const accessor = testingServiceCollection.createTestingAccessor();
			const instantiationService = accessor.get(IInstantiationService);
			const generator = instantiationService.createInstance(DevContainerConfigGenerator);
			const result = await generator.generate(await loadIndex(), d.files, CancellationToken.None);
			assert.strictEqual(result.type, 'success');
			assert.strictEqual(result.template, d.template);
		});

		stest({ description: `Suggests devcontainer.json features (sample ${i})` }, async (testingServiceCollection) => {
			const accessor = testingServiceCollection.createTestingAccessor();
			const instantiationService = accessor.get(IInstantiationService);
			const generator = instantiationService.createInstance(DevContainerConfigGenerator);
			const result = await generator.generate(await loadIndex(), d.files, CancellationToken.None);
			assert.strictEqual(result.type, 'success');
			assert.ok(result.features.find(f => d.features.includes(f)));
		});
	}

	// // npm run simulate -- --grep=devcontainer.json --n=1
	// stest({ description: `Suggests a devcontainer.json template` }, async (testingServiceCollection) => {
	// 	const dataPath = path.join(__dirname, '../test/prompts/fixtures/devcontainer/devContainerConfigTestData.json');
	// 	const data = JSON.parse(await fs.promises.readFile(dataPath, 'utf8')).slice(0, 11);
	// 	const results = [];
	// 	for (let i = 0; i < data.length; i++) {
	// 		const generator = new DevContainerConfigGenerator(accessor);
	// 		const result = await generator.generate(await loadIndex(), data[i].files, CancellationToken.None);
	// 		assert.strictEqual(result.type, 'success');
	// 		results.push({
	// 			...data[i],
	// 			suggestedTemplate: result.template,
	// 			suggestedFeatures: result.features,
	// 		});
	// 	}
	// 	await fs.promises.writeFile(path.join(__dirname, '../test/prompts/devContainerConfigTestResults.json'), JSON.stringify(results, null, 4));
	// });
});
