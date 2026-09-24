/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

interface ProductPipeline {
	variables: { name: string; value?: string }[];
	extends: {
		parameters: {
			stages: { stage?: string; jobs?: { template: string; parameters: Record<string, string> }[] }[];
		};
	};
}

const sourceMapCondition = '${{ if eq(parameters.VSCODE_UPLOAD_SOURCEMAPS, true) }}';

interface CopilotStep {
	displayName?: string;
	task?: string;
	[sourceMapCondition]?: CopilotStep[];
}

interface CopilotPipeline {
	parameters: { name: string; default: boolean }[];
	jobs: { steps: CopilotStep[] }[];
}

const product = load(readFileSync(new URL('../../azure-pipelines/product-build.yml', import.meta.url), 'utf8')) as ProductPipeline;
const copilot = load(readFileSync(new URL('../../azure-pipelines/product-copilot.yml', import.meta.url), 'utf8')) as CopilotPipeline;
const copilotTemplate = product.extends.parameters.stages
	.find(stage => stage.stage === 'Copilot')?.jobs
	?.find(job => job.template === 'build/azure-pipelines/product-copilot.yml@self');

suite('Product publishing guards', () => {
	test('uses the CI-aware effective publishing flag', () => {
		assert.deepStrictEqual({
			effectivePublish: product.variables.find(variable => variable.name === 'VSCODE_PUBLISH')?.value,
			sourceMaps: copilotTemplate?.parameters.VSCODE_UPLOAD_SOURCEMAPS,
		}, {
			effectivePublish: '${{ and(eq(parameters.VSCODE_PUBLISH, true), eq(variables.VSCODE_CIBUILD, false)) }}',
			sourceMaps: '${{ variables.VSCODE_PUBLISH }}',
		});
	});

	test('keeps the reusable Copilot template upload default and gate', () => {
		const steps = copilot.jobs.flatMap(job => job.steps);
		assert.deepStrictEqual({
			defaultUpload: copilot.parameters.find(parameter => parameter.name === 'VSCODE_UPLOAD_SOURCEMAPS')?.default,
			guardedUploads: steps.flatMap(step => step[sourceMapCondition] ?? []).map(step => step.displayName),
			unguardedUploads: steps.filter(step => step.displayName === 'Upload source maps to CDN'),
		}, {
			defaultUpload: true,
			guardedUploads: ['Upload source maps to CDN'],
			unguardedUploads: [],
		});
	});

	for (const ci of [false, true]) {
		for (const publish of [false, true]) {
			for (const release of [false, true]) {
				test(`binds Copilot publishing for CI=${ci}, publish=${publish}, release=${release}`, () => {
					assert.ok(copilotTemplate);
					const effectivePublish = publish && !ci;
					const bindings = new Map([
						['${{ variables.VSCODE_PUBLISH }}', effectivePublish],
						['${{ parameters.VSCODE_RELEASE }}', release],
					]);
					const parameters = Object.fromEntries(copilot.parameters.map(parameter => [parameter.name, parameter.default]));
					for (const [name, expression] of Object.entries(copilotTemplate.parameters)) {
						assert.ok(bindings.has(expression), `Unexpected parameter binding: ${expression}`);
						parameters[name] = bindings.get(expression)!;
					}

					assert.deepStrictEqual(parameters, {
						VSCODE_PUBLISH: effectivePublish,
						VSCODE_RELEASE: release,
						VSCODE_UPLOAD_SOURCEMAPS: effectivePublish,
					});
				});
			}
		}
	}
});
