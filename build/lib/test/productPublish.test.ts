/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

interface TemplateReference {
	template: string;
	parameters: Record<string, string | boolean>;
}

interface ProductStage {
	stage?: string;
	jobs?: TemplateReference[];
}

interface ProductPipeline {
	variables: { name: string; value?: string }[];
	extends: {
		parameters: {
			stages: ProductStage[];
		};
	};
}

interface ProductTemplate {
	parameters: { name: string; default: string | boolean }[];
	stages: ProductStage[];
}

interface TsaPipeline {
	variables: TemplateReference[];
	extends: {
		parameters: {
			stages: TemplateReference[];
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
const productTemplate = load(readFileSync(new URL('../../azure-pipelines/product-build-template.yml', import.meta.url), 'utf8')) as ProductTemplate;
const adoCi = load(readFileSync(new URL('../../azure-pipelines/product-build-ado-ci.yml', import.meta.url), 'utf8')) as ProductPipeline;
const smoke = load(readFileSync(new URL('../../azure-pipelines/product-smoke-flaky.yml', import.meta.url), 'utf8')) as ProductPipeline;
const tsa = load(readFileSync(new URL('../../azure-pipelines/product-build-TSA.yml', import.meta.url), 'utf8')) as TsaPipeline;
const copilotTemplate = getCopilotCaller(product.extends.parameters.stages);

function getCopilotCaller(stages: ProductStage[]): TemplateReference {
	const caller = stages
		.find(stage => stage.stage === 'Copilot')?.jobs
		?.find(job => /(?:^|\/)product-copilot\.yml@self$/.test(job.template));
	assert.ok(caller);
	return caller;
}

function resolveCopilotParameters(caller: TemplateReference, bindings: ReadonlyMap<string, boolean> = new Map()): Record<string, boolean> {
	const parameters = Object.fromEntries(copilot.parameters.map(parameter => [parameter.name, parameter.default]));
	for (const [name, value] of Object.entries(caller.parameters)) {
		if (typeof value === 'boolean') {
			parameters[name] = value;
		} else {
			assert.ok(bindings.has(value), `Unexpected parameter binding: ${value}`);
			parameters[name] = bindings.get(value)!;
		}
	}
	return parameters;
}

function resolveProductTemplate(parameters: Record<string, string | boolean> = {}): Record<string, boolean> {
	const values = { ...Object.fromEntries(productTemplate.parameters.map(parameter => [parameter.name, parameter.default])), ...parameters };
	assert.ok(typeof values.VSCODE_PUBLISH === 'boolean');
	assert.ok(typeof values.VSCODE_RELEASE === 'boolean');
	return resolveCopilotParameters(getCopilotCaller(productTemplate.stages), new Map([
		['${{ parameters.VSCODE_PUBLISH }}', values.VSCODE_PUBLISH],
		['${{ parameters.VSCODE_RELEASE }}', values.VSCODE_RELEASE],
	]));
}

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
					assert.deepStrictEqual(resolveCopilotParameters(copilotTemplate, bindings), {
						VSCODE_PUBLISH: effectivePublish,
						VSCODE_RELEASE: release,
						VSCODE_UPLOAD_SOURCEMAPS: effectivePublish,
					});
				});
			}
		}
	}

	for (const [name, pipeline] of [['ADO CI', adoCi], ['smoke validation', smoke]] as const) {
		test(`${name} explicitly disables source-map uploads`, () => {
			assert.deepStrictEqual(resolveCopilotParameters(getCopilotCaller(pipeline.extends.parameters.stages)), {
				VSCODE_PUBLISH: false,
				VSCODE_RELEASE: false,
				VSCODE_UPLOAD_SOURCEMAPS: false,
			});
		});
	}

	for (const publish of [false, true]) {
		for (const release of [false, true]) {
			test(`reusable product template binds source maps for publish=${publish}, release=${release}`, () => {
				assert.deepStrictEqual(resolveProductTemplate({ VSCODE_PUBLISH: publish, VSCODE_RELEASE: release }), {
					VSCODE_PUBLISH: publish,
					VSCODE_RELEASE: release,
					VSCODE_UPLOAD_SOURCEMAPS: publish,
				});
			});
		}
	}

	test('keeps publishing enabled for reusable product template defaults', () => {
		assert.deepStrictEqual(resolveProductTemplate(), {
			VSCODE_PUBLISH: true,
			VSCODE_RELEASE: false,
			VSCODE_UPLOAD_SOURCEMAPS: true,
		});
	});

	test('TSA passes its nonpublishing intent through the reusable product template', () => {
		const caller = tsa.extends.parameters.stages.find(stage => stage.template === 'product-build-template.yml@self');
		assert.ok(caller);
		assert.deepStrictEqual({
			variablesPublish: tsa.variables.find(variable => variable.template === 'product-build-variables.yml@self')?.parameters.VSCODE_PUBLISH,
			copilot: resolveProductTemplate(caller.parameters),
		}, {
			variablesPublish: false,
			copilot: {
				VSCODE_PUBLISH: false,
				VSCODE_RELEASE: false,
				VSCODE_UPLOAD_SOURCEMAPS: false,
			},
		});
	});
});
