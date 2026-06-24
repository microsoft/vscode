/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTypeDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/promptTypeDetectionCapability.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';

suite('PromptTypeDetectionCapability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should have correct capability type', () => {
		const capability = store.add(new PromptTypeDetectionCapability());
		strictEqual(capability.type, TerminalCapability.PromptTypeDetection);
	});

	test('should initialize with undefined prompt type', () => {
		const capability = store.add(new PromptTypeDetectionCapability());
		strictEqual(capability.promptType, undefined);
	});

	test('should set and get prompt type', () => {
		const capability = store.add(new PromptTypeDetectionCapability());

		capability.setPromptType('p10k');
		strictEqual(capability.promptType, 'p10k');

		capability.setPromptType('posh-git');
		strictEqual(capability.promptType, 'posh-git');
	});

	test('should fire event when prompt type changes', () => {
		const capability = store.add(new PromptTypeDetectionCapability());
		let eventFiredCount = 0;
		let lastEventValue: string | undefined;

		const disposable = capability.onPromptTypeChanged(value => {
			eventFiredCount++;
			lastEventValue = value;
		});
		store.add(disposable);

		capability.setPromptType('starship');
		strictEqual(eventFiredCount, 1);
		strictEqual(lastEventValue, 'starship');

		capability.setPromptType('oh-my-zsh');
		strictEqual(eventFiredCount, 2);
		strictEqual(lastEventValue, 'oh-my-zsh');
	});
});
