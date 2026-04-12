/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Extensions as ThemeingExtensions } from '../../../../../platform/theme/common/colorRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ansiColorIdentifiers, registerColors } from '../../common/terminalColorRegistry.js';
import { Color } from '../../../../../base/common/color.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
registerColors();
const themingRegistry = Registry.as(ThemeingExtensions.ColorContribution);
function getMockTheme(type) {
    const theme = {
        selector: '',
        label: '',
        type: type,
        getColor: (colorId) => themingRegistry.resolveDefaultColor(colorId, theme),
        defines: () => true,
        getTokenStyleMetadata: () => undefined,
        tokenColorMap: [],
        tokenFontMap: [],
        semanticHighlighting: false
    };
    return theme;
}
suite('Workbench - TerminalColorRegistry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('hc colors', function () {
        const theme = getMockTheme(ColorScheme.HIGH_CONTRAST_DARK);
        const colors = ansiColorIdentifiers.map(colorId => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
        assert.deepStrictEqual(colors, [
            '#000000',
            '#cd0000',
            '#00cd00',
            '#cdcd00',
            '#0000ee',
            '#cd00cd',
            '#00cdcd',
            '#e5e5e5',
            '#7f7f7f',
            '#ff0000',
            '#00ff00',
            '#ffff00',
            '#5c5cff',
            '#ff00ff',
            '#00ffff',
            '#ffffff'
        ], 'The high contrast terminal colors should be used when the hc theme is active');
    });
    test('light colors', function () {
        const theme = getMockTheme(ColorScheme.LIGHT);
        const colors = ansiColorIdentifiers.map(colorId => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
        assert.deepStrictEqual(colors, [
            '#000000',
            '#cd3131',
            '#107c10',
            '#949800',
            '#0451a5',
            '#bc05bc',
            '#0598bc',
            '#555555',
            '#666666',
            '#cd3131',
            '#14ce14',
            '#b5ba00',
            '#0451a5',
            '#bc05bc',
            '#0598bc',
            '#a5a5a5'
        ], 'The light terminal colors should be used when the light theme is active');
    });
    test('dark colors', function () {
        const theme = getMockTheme(ColorScheme.DARK);
        const colors = ansiColorIdentifiers.map(colorId => Color.Format.CSS.formatHexA(theme.getColor(colorId), true));
        assert.deepStrictEqual(colors, [
            '#000000',
            '#cd3131',
            '#0dbc79',
            '#e5e510',
            '#2472c8',
            '#bc3fbc',
            '#11a8cd',
            '#e5e5e5',
            '#666666',
            '#f14c4c',
            '#23d18b',
            '#f5f543',
            '#3b8eea',
            '#d670d6',
            '#29b8db',
            '#e5e5e5'
        ], 'The dark terminal colors should be used when a dark theme is active');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb2xvclJlZ2lzdHJ5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsSUFBSSxrQkFBa0IsRUFBbUMsTUFBTSx1REFBdUQsQ0FBQztBQUMxSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsY0FBYyxFQUFFLENBQUM7QUFFakIsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBaUIsa0JBQWtCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUMxRixTQUFTLFlBQVksQ0FBQyxJQUFpQjtJQUN0QyxNQUFNLEtBQUssR0FBRztRQUNiLFFBQVEsRUFBRSxFQUFFO1FBQ1osS0FBSyxFQUFFLEVBQUU7UUFDVCxJQUFJLEVBQUUsSUFBSTtRQUNWLFFBQVEsRUFBRSxDQUFDLE9BQXdCLEVBQXFCLEVBQUUsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQztRQUM5RyxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTtRQUNuQixxQkFBcUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxT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