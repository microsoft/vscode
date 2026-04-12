/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { TestConfiguration } from '../config/testConfiguration.js';
import { MonospaceLineBreaksComputerFactory } from '../../../common/viewModel/monospaceLineBreaksComputer.js';
import { createTextModel } from '../../common/testTextModel.js';
import { TestLanguageConfigurationService } from '../../common/modes/testLanguageConfigurationService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
export function testViewModel(text, options, callback) {
    const EDITOR_ID = 1;
    const configuration = new TestConfiguration(options);
    const model = createTextModel(text.join('\n'));
    const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
    const testLanguageConfigurationService = new TestLanguageConfigurationService();
    const viewModel = new ViewModel(EDITOR_ID, configuration, model, monospaceLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, null, testLanguageConfigurationService, new TestThemeService(), {
        setVisibleLines(visibleLines, stabilized) {
        },
    }, {
        batchChanges: (cb) => cb(),
    });
    callback(viewModel, model);
    viewModel.dispose();
    model.dispose();
    configuration.dispose();
    testLanguageConfigurationService.dispose();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFZpZXdNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlld01vZGVsL3Rlc3RWaWV3TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU5RixNQUFNLFVBQVUsYUFBYSxDQUFDLElBQWMsRUFBRSxPQUF1QixFQUFFLFFBQTBEO0lBQ2hJLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQztJQUVwQixNQUFNLGFBQWEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JELE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0MsTUFBTSxrQ0FBa0MsR0FBRyxrQ0FBa0MsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVHLE1BQU0sZ0NBQWdDLEdBQUcsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDO0lBQ2hGLE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLGtDQUFrQyxFQUFFLElBQUssRUFBRSxnQ0FBZ0MsRUFBRSxJQUFJLGdCQUFnQixFQUFFLEVBQUU7UUFDek0sZUFBZSxDQUFDLFlBQVksRUFBRSxVQUFVO1FBQ3hDLENBQUM7S0FDRCxFQUFFO1FBQ0YsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUU7S0FDMUIsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUUzQixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN4QixnQ0FBZ0MsQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUM1QyxDQUFDIn0=