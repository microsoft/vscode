/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, test, vi } from 'vitest';
import * as crypto from '../../../../util/common/crypto';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import type { IChatEndpoint } from '../../../networking/common/networking';
import { getModelCapabilityOverride, getVerbosityForModelSync, isGpt51Family, isGpt53Codex, isGpt54, isGpt55, isGpt56, isHiddenModelN, isKimiFamily, isOpenAIModel, modelCanUseApplyPatchExclusively, modelCanUseReplaceStringExclusively, modelPrefersJsonNotebookRepresentation, modelSupportCacheBreakPoints, modelSupportsApplyPatch, modelSupportsContextEditing, modelSupportsMultiReplaceString, modelSupportsPDFDocuments, modelSupportsReplaceString, modelSupportsSimplifiedApplyPatchInstructions, modelSupportsToolSearch } from '../../common/chatModelCapabilities';

function fakeModel(family: string, model: string = family) {
	return { family, model } as unknown as IChatEndpoint;
}

describe('OpenAI prompt model classification', () => {
	test.each([
		['gpt-5.7', 'copilot', true],
		['gpt-6', 'Azure', true],
		['GPT-6', 'copilot', true],
		['OpenAI', 'copilot', true],
		['preview-model', 'OpenAI', true],
		['preview-model', 'openai', true],
		['preview-model', 'OpenAI Compatible', false],
		['OpenAI Compatible', 'custom', false],
		['unknown', 'custom', false],
		['claude-sonnet-4.6', 'Anthropic', false],
		['gemini-3-pro', 'Google', false],
	])('classifies %s from %s as OpenAI: %s', (family, modelProvider, expected) => {
		expect(isOpenAIModel({ family, modelProvider })).toBe(expected);
	});

	test.each([
		['gpt-5.1', isGpt51Family],
		['gpt-5.3-codex', isGpt53Codex],
		['gpt-5.4', isGpt54],
		['gpt-5.5', isGpt55],
		['gpt-5.6', isGpt56],
	] as const)('%s matcher respects version boundaries', (family, matches) => {
		expect([
			matches(family),
			matches(`${family}-mini`),
			matches(`${family}-20260828`),
			matches(`${family}0`),
			matches(`${family}0-codex`),
			matches(`${family}.1`),
		]).toEqual([true, true, true, false, false, false]);
	});
});

describe('Hidden model N capabilities', () => {
	afterEach(() => vi.restoreAllMocks());

	test.each([true, false, undefined])('shares GPT-5.6 capability gates with verbosity enabled: %s', responsesApiVerbosityEnabled => {
		const family = 'hidden-model-n-test';
		const originalHash = crypto.getCachedSha256Hash;
		vi.spyOn(crypto, 'getCachedSha256Hash').mockImplementation(value => value === family
			? 'a5665bddcc9b4005649f48ba7925b9437ccb321f5b670f026ed5a349c7561499'
			: originalHash(value));
		const model = fakeModel(family);

		expect({
			isHidden: isHiddenModelN(model),
			isGpt56: isGpt56(model),
			applyPatch: modelSupportsApplyPatch(model),
			applyPatchExclusively: modelCanUseApplyPatchExclusively(model),
			simplifiedApplyPatchInstructions: modelSupportsSimplifiedApplyPatchInstructions(model),
			jsonNotebook: modelPrefersJsonNotebookRepresentation(model),
			pdf: modelSupportsPDFDocuments(model),
			cacheBreakpoints: modelSupportCacheBreakPoints(model),
			toolSearch: modelSupportsToolSearch(model),
			toolSearchByFamily: modelSupportsToolSearch(family),
			verbosity: getVerbosityForModelSync(model, responsesApiVerbosityEnabled),
		}).toEqual({
			isHidden: true,
			isGpt56: false,
			applyPatch: true,
			applyPatchExclusively: true,
			simplifiedApplyPatchInstructions: true,
			jsonNotebook: true,
			pdf: true,
			cacheBreakpoints: true,
			toolSearch: true,
			toolSearchByFamily: true,
			verbosity: responsesApiVerbosityEnabled ? 'low' : undefined,
		});
	});
});

describe('modelSupportsPDFDocuments', () => {
	test('returns true for claude family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('claude-3.5-sonnet'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-3-opus'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('claude-4-sonnet'))).toBe(true);
	});

	test('returns true for Anthropic family', () => {
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('Anthropic-custom'))).toBe(true);
	});

	test('returns true for gpt-5 plus families', () => {
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.4'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.4-mini'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.5'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.5-mini'))).toBe(true);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-4'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('gpt-5.1'))).toBe(true);
	});

	test('returns false for other families', () => {
		expect(modelSupportsPDFDocuments(fakeModel('gemini-2.0-flash'))).toBe(false);
		expect(modelSupportsPDFDocuments(fakeModel('o4-mini'))).toBe(false);
	});
});

describe('Kimi edit tool capabilities', () => {
	test('uses replace-string tools without insert-edit or apply-patch', () => {
		const models = {
			'kimi-k2.6': fakeModel('kimi-k2.6'),
			'kimi-k2.7-code': fakeModel('kimi-k2.7-code'),
			'kimi-k3': fakeModel('kimi-k3'),
			'moonshot/kimi-k2.7-code': fakeModel('moonshot/kimi-k2.7-code'),
			'moonshot/kimi-k2.6': fakeModel('moonshot/kimi-k2.6'),
			'unknown-family + kimi model id': fakeModel('unknown-family', 'kimi-k2.7-code-preview'),
		};
		const actual = Object.fromEntries(Object.entries(models).map(([name, model]) => [name, {
			isKimiFamily: isKimiFamily(model),
			supportsReplaceString: modelSupportsReplaceString(model),
			supportsMultiReplaceString: modelSupportsMultiReplaceString(model),
			canUseReplaceStringExclusively: modelCanUseReplaceStringExclusively(model),
			supportsApplyPatch: modelSupportsApplyPatch(model),
			canUseApplyPatchExclusively: modelCanUseApplyPatchExclusively(model),
		}]));

		expect(actual).toEqual({
			'kimi-k2.6': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
			'kimi-k2.7-code': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
			'kimi-k3': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
			'moonshot/kimi-k2.7-code': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
			'moonshot/kimi-k2.6': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
			'unknown-family + kimi model id': {
				isKimiFamily: true,
				supportsReplaceString: true,
				supportsMultiReplaceString: true,
				canUseReplaceStringExclusively: true,
				supportsApplyPatch: false,
				canUseApplyPatchExclusively: false,
			},
		});
	});
});

describe('modelSupportsToolSearch', () => {
	test('supports Claude Sonnet/Opus 4.5 and up, including new and future families', () => {
		expect(modelSupportsToolSearch('claude-sonnet-4-5')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4.5')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-5-20250929')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-6')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4.6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-5')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.5')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-5-20251101')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.6')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4.7')).toBe(true);
		expect(modelSupportsToolSearch('claude-opus-4-7@1.0.0')).toBe(true);
		expect(modelSupportsToolSearch('claude-sonnet-4-6@1.0.0')).toBe(true);
		// Denylist: newer/future Claude families are picked up automatically.
		expect(modelSupportsToolSearch('claude-opus-4-8')).toBe(true);
		expect(modelSupportsToolSearch('claude-future-version')).toBe(true);
	});

	test('rejects pre-4.5 models, including date-suffixed ones', () => {
		// Regression guard: the datestamp must not be read as the minor version.
		expect(modelSupportsToolSearch('claude-sonnet-4-20250514')).toBe(false);
		expect(modelSupportsToolSearch('claude-sonnet-4')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4-20250514')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4-1')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4.1')).toBe(false);
		expect(modelSupportsToolSearch('claude-opus-4-1-20250805')).toBe(false);
	});

	test('supports Haiku 4.5, the only shipping Haiku', () => {
		expect(modelSupportsToolSearch('claude-haiku-4-5')).toBe(true);
		expect(modelSupportsToolSearch('claude-haiku-4.5')).toBe(true);
		expect(modelSupportsToolSearch('claude-haiku-4-5-20251001')).toBe(true);
	});

	test('rejects legacy Claude families', () => {
		expect(modelSupportsToolSearch('claude-3-5-sonnet-20241022')).toBe(false);
		expect(modelSupportsToolSearch('claude-3-opus')).toBe(false);
	});

	test('supports OpenAI gpt-5.4 and gpt-5.5 models', () => {
		expect(modelSupportsToolSearch('gpt-5.4')).toBe(true);
		expect(modelSupportsToolSearch('gpt-5.5')).toBe(true);
	});

	test('rejects suffixed gpt-5.4/5.5 variants (exact match only)', () => {
		expect(modelSupportsToolSearch('gpt-5.4-mini')).toBe(false);
		expect(modelSupportsToolSearch('gpt-5.4-preview')).toBe(false);
		expect(modelSupportsToolSearch('gpt-5.5-preview')).toBe(false);
		expect(modelSupportsToolSearch('gpt5.5-preview')).toBe(false);
	});

	test('rejects other non-Claude models', () => {
		expect(modelSupportsToolSearch('gpt-5')).toBe(false);
		expect(modelSupportsToolSearch('gemini-2.5-pro')).toBe(false);
		expect(modelSupportsToolSearch('o4-mini')).toBe(false);
	});

	test('matches via endpoint.family when the model id is unknown', () => {
		// An unknown preview id whose family has been aliased to a supported production family.
		expect({
			'preview-id + family=claude-opus-4.7': modelSupportsToolSearch(fakeModel('claude-opus-4.7', 'preview-anthropic')),
			'preview-id + family=claude-sonnet-4.6': modelSupportsToolSearch(fakeModel('claude-sonnet-4.6', 'preview-sonnet-internal')),
			'preview-id + family=claude-opus-4 (pre-4.5)': modelSupportsToolSearch(fakeModel('claude-opus-4', 'preview-opus-old')),
			'known id + family=unknown': modelSupportsToolSearch(fakeModel('mystery-family', 'claude-opus-4.7')),
		}).toEqual({
			'preview-id + family=claude-opus-4.7': true,
			'preview-id + family=claude-sonnet-4.6': true,
			'preview-id + family=claude-opus-4 (pre-4.5)': false,
			'known id + family=unknown': true,
		});
	});
});

describe('modelSupportsContextEditing', () => {
	test('matches Claude id strings', () => {
		expect({
			'claude-opus-4.6': modelSupportsContextEditing('claude-opus-4.6'),
			'claude-fable-5': modelSupportsContextEditing('claude-fable-5'),
			'claude-opus-4.7': modelSupportsContextEditing('claude-opus-4.7'),
			'claude-opus-4.8': modelSupportsContextEditing('claude-opus-4.8'),
			'claude-opus-4-8-1m': modelSupportsContextEditing('claude-opus-4-8-1m'),
			'claude-sonnet-4.5': modelSupportsContextEditing('claude-sonnet-4.5'),
			'claude-haiku-4-5': modelSupportsContextEditing('claude-haiku-4-5'),
			'claude-opus-4.6-1m': modelSupportsContextEditing('claude-opus-4.6-1m'),
			'gpt-5': modelSupportsContextEditing('gpt-5'),
		}).toEqual({
			'claude-opus-4.6': true,
			'claude-fable-5': true,
			'claude-opus-4.7': true,
			'claude-opus-4.8': true,
			'claude-opus-4-8-1m': false, // 1M variant excluded
			'claude-sonnet-4.5': true,
			'claude-haiku-4-5': true,
			'claude-opus-4.6-1m': false, // 1M variant excluded
			'gpt-5': false,
		});
	});

	test('matches via endpoint.family when the model id is unknown', () => {
		expect({
			'preview-id + family=claude-opus-4.6': modelSupportsContextEditing(fakeModel('claude-opus-4.6', 'preview-anthropic')),
			'preview-id + family=claude-haiku-4-5': modelSupportsContextEditing(fakeModel('claude-haiku-4-5', 'preview-haiku-internal')),
			'preview-id + family=mystery': modelSupportsContextEditing(fakeModel('mystery-family', 'preview-anything')),
		}).toEqual({
			'preview-id + family=claude-opus-4.6': true,
			'preview-id + family=claude-haiku-4-5': true,
			'preview-id + family=mystery': false,
		});
	});
});

describe('getModelCapabilityOverride', () => {
	function makeConfig(map: Record<string, unknown>): IConfigurationService {
		const service = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		service.setConfig(ConfigKey.Advanced.ModelCapabilityOverrides, map as never);
		return service;
	}

	test('returns the entry for a known model id', () => {
		const config = makeConfig({
			'preview-anthropic': { family: 'claude-opus-4.7' },
		});
		expect(getModelCapabilityOverride('preview-anthropic', config)).toEqual({
			family: 'claude-opus-4.7',
		});
	});

	test('returns undefined for unknown model ids and when nothing is configured', () => {
		const config = makeConfig({
			'preview-anthropic': { family: 'claude-opus-4.7' },
		});
		expect({
			unknown: getModelCapabilityOverride('something-else', config),
			emptyMap: getModelCapabilityOverride('preview-anthropic', makeConfig({})),
		}).toEqual({
			unknown: undefined,
			emptyMap: undefined,
		});
	});
});
