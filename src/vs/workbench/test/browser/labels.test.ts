/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { UnthemedProductIconTheme } from '../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../browser/labels.js';
import { DecorationsService } from '../../services/decorations/browser/decorationsService.js';
import { IDecorationData, IDecorationsService } from '../../services/decorations/common/decorations.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

suite('Resource labels - text badges', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opts into a centered final character without changing default badges', async () => {
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const decorations = store.add(instantiationService.createInstance(DecorationsService));
		instantiationService.stub(IDecorationsService, decorations);
		const changes = store.add(new Emitter<readonly URI[]>());
		const resource = URI.file('/repo/file.ts');
		let data: IDecorationData | undefined = { letter: '2, M', tooltip: 'Modified' };
		store.add(decorations.registerDecorationsProvider({
			label: 'Test',
			onDidChange: changes.event,
			provideDecorations: () => data,
		}));
		const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const label = labels.create(container);
		const snapshot = () => {
			const badge = label.element.querySelector('.monaco-decoration-badge-content');
			return {
				generatedContent: getWindow(container).getComputedStyle(label.element, '::after').content,
				text: badge?.textContent,
				parts: badge ? [...badge.children].map(element => element.textContent) : undefined,
				hiddenFromScreenReaders: badge?.getAttribute('aria-hidden'),
			};
		};
		label.setFile(resource, { fileDecorations: { colors: false, badges: true } });
		const defaultBadge = snapshot();
		label.setFile(resource, { fileDecorations: { colors: false, badges: true, alignBadgeLastCharacter: true } });
		const centeredBadge = snapshot();
		const originalBadge = label.element.querySelector('.monaco-decoration-badge-content');
		const rendered = Event.toPromise(label.onDidRender);
		data = { letter: '123, e\u0301' };
		changes.fire([resource]);
		await rendered;
		const updatedBadge = snapshot();
		const reusedBadge = originalBadge === label.element.querySelector('.monaco-decoration-badge-content');
		label.setFile(resource, { fileDecorations: { colors: false, badges: true } });
		const restoredDefault = snapshot();
		label.setFile(resource, { fileDecorations: { colors: false, badges: true, alignBadgeLastCharacter: true } });
		label.clear();

		assert.deepStrictEqual(
			{ defaultBadge, centeredBadge, updatedBadge, reusedBadge, restoredDefault, cleared: label.element.querySelector('.monaco-decoration-badge-content') },
			{
				defaultBadge: { generatedContent: '"2, M"', text: undefined, parts: undefined, hiddenFromScreenReaders: undefined },
				centeredBadge: { generatedContent: 'none', text: '2, M', parts: ['2, ', 'M'], hiddenFromScreenReaders: 'true' },
				updatedBadge: { generatedContent: 'none', text: '123, e\u0301', parts: ['123, ', 'e\u0301'], hiddenFromScreenReaders: 'true' },
				reusedBadge: true,
				restoredDefault: { generatedContent: '"123, e\u0301"', text: undefined, parts: undefined, hiddenFromScreenReaders: undefined },
				cleared: null,
			}
		);
	});

	test('preserves icon decorations when final-character alignment is requested', () => {
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IThemeService, new TestThemeService(undefined, undefined, new UnthemedProductIconTheme()));
		const decorations = store.add(instantiationService.createInstance(DecorationsService));
		instantiationService.stub(IDecorationsService, decorations);
		store.add(decorations.registerDecorationsProvider({
			label: 'Test',
			onDidChange: Event.None,
			provideDecorations: () => ({ letter: Codicon.lockSmall }),
		}));
		const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const label = labels.create(container);
		label.setFile(URI.file('/repo/file.ts'), { fileDecorations: { colors: false, badges: true, alignBadgeLastCharacter: true } });
		assert.deepStrictEqual({
			hasIcon: getWindow(container).getComputedStyle(label.element, '::after').fontFamily.includes('codicon'),
			textBadge: label.element.querySelector('.monaco-decoration-badge-content'),
		}, { hasIcon: true, textBadge: null });
	});

	test('preserves shaping and bidirectional ordering of text decorations', async () => {
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const decorations = store.add(instantiationService.createInstance(DecorationsService));
		instantiationService.stub(IDecorationsService, decorations);
		const changes = store.add(new Emitter<readonly URI[]>());
		const resource = URI.file('/repo/file.ts');
		let letter = 'تم';
		store.add(decorations.registerDecorationsProvider({
			label: 'Test',
			onDidChange: changes.event,
			provideDecorations: () => ({ letter }),
		}));
		const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const label = labels.create(container);
		label.setFile(resource, { fileDecorations: { colors: false, badges: true, alignBadgeLastCharacter: true } });
		const results = [];
		for (const text of ['تم', '2, تم', 'تم, M', '١, ٢', '\u202E1, M', 'कक', 'fi', '↓M', '↓M, M', '2, M', 'M']) {
			const rendered = Event.toPromise(label.onDidRender);
			letter = text;
			changes.fire([resource]);
			await rendered;
			results.push({
				generatedContent: getWindow(container).getComputedStyle(label.element, '::after').content,
				text: label.element.querySelector('.monaco-decoration-badge-content')?.textContent,
			});
		}
		assert.deepStrictEqual(results, [
			{ generatedContent: '"تم"', text: undefined },
			{ generatedContent: '"2, تم"', text: undefined },
			{ generatedContent: '"تم, M"', text: undefined },
			{ generatedContent: '"١, ٢"', text: undefined },
			{ generatedContent: '"\u202E1, M"', text: undefined },
			{ generatedContent: '"कक"', text: undefined },
			{ generatedContent: '"fi"', text: undefined },
			{ generatedContent: 'none', text: '↓M' },
			{ generatedContent: 'none', text: '↓M, M' },
			{ generatedContent: 'none', text: '2, M' },
			{ generatedContent: 'none', text: 'M' },
		]);
	});
});
