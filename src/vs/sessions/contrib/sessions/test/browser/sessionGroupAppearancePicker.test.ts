/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IconPicker } from '../../../../../workbench/services/userDataProfile/browser/iconPicker.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionGroupAppearancePicker } from '../../browser/views/sessionGroupAppearancePicker.js';

suite('SessionGroupAppearancePicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const result of [Codicon.rocket, null, undefined]) {
		test(`shared icon picker result ${result?.id ?? result} preserves reset versus cancellation`, async () => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const icons: (string | undefined)[] = [];
			let disposed = false;
			instantiationService.stubInstance(IconPicker, new class extends mock<IconPicker>() {
				override async pickIcons() { return result; }
				override dispose() { disposed = true; }
			}());
			const picker = disposables.add(instantiationService.createInstance(SessionGroupAppearancePicker));
			await picker.changeIcon(icon => icons.push(icon));
			assert.deepStrictEqual({ icons, disposed }, { icons: result === undefined ? [] : [result?.id], disposed: true });
		});
	}

	for (const selection of ['terminal.ansiGreen', 'reset', 'cancel']) {
		test(`color picker supports ${selection}`, async () => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const colors: (string | undefined)[] = [];
			const quickInputService = instantiationService.get(IQuickInputService);
			let offered: readonly IQuickPickItem[] = [];
			quickInputService.pick = async picks => {
				const items = (await picks).filter(item => item.type !== 'separator');
				offered = items;
				return selection === 'cancel' ? undefined : items.find(item => selection === 'reset' ? item.id === undefined : item.id === selection);
			};
			const picker = disposables.add(instantiationService.createInstance(SessionGroupAppearancePicker));
			await picker.changeColor('terminal.ansiBlue', color => colors.push(color));
			assert.deepStrictEqual({
				colors,
				swatches: offered.filter(item => item.iconColor).map(item => ({ id: item.id, color: item.iconColor?.id })),
			}, {
				colors: selection === 'cancel' ? [] : [selection === 'reset' ? undefined : selection],
				swatches: ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'].map(color => ({ id: `terminal.ansi${color}`, color: `terminal.ansi${color}` })),
			});
		});
	}
});
