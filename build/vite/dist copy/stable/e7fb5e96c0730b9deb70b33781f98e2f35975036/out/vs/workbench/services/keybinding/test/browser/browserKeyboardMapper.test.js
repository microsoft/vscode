/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import '../../browser/keyboardLayouts/en.darwin.js';
import '../../browser/keyboardLayouts/de.darwin.js';
import { KeyboardLayoutContribution } from '../../browser/keyboardLayouts/_.contribution.js';
import { BrowserKeyboardMapperFactoryBase } from '../../browser/keyboardLayoutService.js';
import { KeymapInfo } from '../../common/keymapInfo.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
class TestKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
    constructor(configurationService, notificationService, storageService, commandService) {
        // super(notificationService, storageService, commandService);
        super(configurationService);
        const keymapInfos = KeyboardLayoutContribution.INSTANCE.layoutInfos;
        this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout))));
        this._mru = this._keymapInfos;
        this._initialized = true;
        this.setLayoutFromBrowserAPI();
        const usLayout = this.getUSStandardLayout();
        if (usLayout) {
            this.setActiveKeyMapping(usLayout.mapping);
        }
    }
}
suite('keyboard layout loader', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let instance;
    setup(() => {
        instantiationService = new TestInstantiationService();
        const storageService = new TestStorageService();
        const notitifcationService = instantiationService.stub(INotificationService, new TestNotificationService());
        const configurationService = instantiationService.stub(IConfigurationService, new TestConfigurationService());
        const commandService = instantiationService.stub(ICommandService, {});
        ds.add(instantiationService);
        ds.add(storageService);
        instance = new TestKeyboardMapperFactory(configurationService, notitifcationService, storageService, commandService);
        ds.add(instance);
    });
    teardown(() => {
        instantiationService.dispose();
    });
    test('load default US keyboard layout', () => {
        assert.notStrictEqual(instance.activeKeyboardLayout, null);
    });
    test('isKeyMappingActive', () => {
        instance.setUSKeyboardLayout();
        assert.strictEqual(instance.isKeyMappingActive({
            KeyA: {
                value: 'a',
                valueIsDeadKey: false,
                withShift: 'A',
                withShiftIsDeadKey: false,
                withAltGr: 'å',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Å',
                withShiftAltGrIsDeadKey: false
            }
        }), true);
        assert.strictEqual(instance.isKeyMappingActive({
            KeyA: {
                value: 'a',
                valueIsDeadKey: false,
                withShift: 'A',
                withShiftIsDeadKey: false,
                withAltGr: 'å',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Å',
                withShiftAltGrIsDeadKey: false
            },
            KeyZ: {
                value: 'z',
                valueIsDeadKey: false,
                withShift: 'Z',
                withShiftIsDeadKey: false,
                withAltGr: 'Ω',
                withAltGrIsDeadKey: false,
                withShiftAltGr: '¸',
                withShiftAltGrIsDeadKey: false
            }
        }), true);
        assert.strictEqual(instance.isKeyMappingActive({
            KeyZ: {
                value: 'y',
                valueIsDeadKey: false,
                withShift: 'Y',
                withShiftIsDeadKey: false,
                withAltGr: '¥',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Ÿ',
                withShiftAltGrIsDeadKey: false
            },
        }), false);
    });
    test('Switch keymapping', () => {
        instance.setActiveKeyMapping({
            KeyZ: {
                value: 'y',
                valueIsDeadKey: false,
                withShift: 'Y',
                withShiftIsDeadKey: false,
                withAltGr: '¥',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Ÿ',
                withShiftAltGrIsDeadKey: false
            }
        });
        assert.strictEqual(!!instance.activeKeyboardLayout.isUSStandard, false);
        assert.strictEqual(instance.isKeyMappingActive({
            KeyZ: {
                value: 'y',
                valueIsDeadKey: false,
                withShift: 'Y',
                withShiftIsDeadKey: false,
                withAltGr: '¥',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Ÿ',
                withShiftAltGrIsDeadKey: false
            },
        }), true);
        instance.setUSKeyboardLayout();
        assert.strictEqual(instance.activeKeyboardLayout.isUSStandard, true);
    });
    test('Switch keyboard layout info', () => {
        instance.setKeyboardLayout('com.apple.keylayout.German');
        assert.strictEqual(!!instance.activeKeyboardLayout.isUSStandard, false);
        assert.strictEqual(instance.isKeyMappingActive({
            KeyZ: {
                value: 'y',
                valueIsDeadKey: false,
                withShift: 'Y',
                withShiftIsDeadKey: false,
                withAltGr: '¥',
                withAltGrIsDeadKey: false,
                withShiftAltGr: 'Ÿ',
                withShiftAltGrIsDeadKey: false
            },
        }), true);
        instance.setUSKeyboardLayout();
        assert.strictEqual(instance.activeKeyboardLayout.isUSStandard, true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlcktleWJvYXJkTWFwcGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy90ZXN0L2Jyb3dzZXIvYnJvd3NlcktleWJvYXJkTWFwcGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sNENBQTRDLENBQUM7QUFDcEQsT0FBTyw0Q0FBNEMsQ0FBQztBQUNwRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNEJBQTRCLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3RILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0seUJBQTBCLFNBQVEsZ0NBQWdDO0lBQ3ZFLFlBQVksb0JBQTJDLEVBQUUsbUJBQXlDLEVBQUUsY0FBK0IsRUFBRSxjQUErQjtRQUNuSyw4REFBOEQ7UUFD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