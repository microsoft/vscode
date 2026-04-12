/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { deepClone } from '../../../../base/common/objects.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { localizeManifest } from '../../common/extensionNls.js';
import { NullLogger } from '../../../log/common/log.js';
const manifest = {
    name: 'test',
    publisher: 'test',
    version: '1.0.0',
    engines: {
        vscode: '*'
    },
    contributes: {
        commands: [
            {
                command: 'test.command',
                title: '%test.command.title%',
                category: '%test.command.category%'
            },
        ],
        authentication: [
            {
                id: 'test.authentication',
                label: '%test.authentication.label%',
            }
        ],
        configuration: {
            // to ensure we test another "title" property
            title: '%test.configuration.title%',
            properties: {
                'test.configuration': {
                    type: 'string',
                    description: 'not important',
                }
            }
        }
    }
};
suite('Localize Manifest', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('replaces template strings', function () {
        const localizedManifest = localizeManifest(store.add(new NullLogger()), deepClone(manifest), {
            'test.command.title': 'Test Command',
            'test.command.category': 'Test Category',
            'test.authentication.label': 'Test Authentication',
            'test.configuration.title': 'Test Configuration',
        });
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, 'Test Command');
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, 'Test Category');
        assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, 'Test Authentication');
        assert.strictEqual((localizedManifest.contributes?.configuration).title, 'Test Configuration');
    });
    test('replaces template strings with fallback if not found in translations', function () {
        const localizedManifest = localizeManifest(store.add(new NullLogger()), deepClone(manifest), {}, {
            'test.command.title': 'Test Command',
            'test.command.category': 'Test Category',
            'test.authentication.label': 'Test Authentication',
            'test.configuration.title': 'Test Configuration',
        });
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, 'Test Command');
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, 'Test Category');
        assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, 'Test Authentication');
        assert.strictEqual((localizedManifest.contributes?.configuration).title, 'Test Configuration');
    });
    test('replaces template strings - command title & categories become ILocalizedString', function () {
        const localizedManifest = localizeManifest(store.add(new NullLogger()), deepClone(manifest), {
            'test.command.title': 'Befehl test',
            'test.command.category': 'Testkategorie',
            'test.authentication.label': 'Testauthentifizierung',
            'test.configuration.title': 'Testkonfiguration',
        }, {
            'test.command.title': 'Test Command',
            'test.command.category': 'Test Category',
            'test.authentication.label': 'Test Authentication',
            'test.configuration.title': 'Test Configuration',
        });
        const title = localizedManifest.contributes?.commands?.[0].title;
        const category = localizedManifest.contributes?.commands?.[0].category;
        assert.strictEqual(title.value, 'Befehl test');
        assert.strictEqual(title.original, 'Test Command');
        assert.strictEqual(category.value, 'Testkategorie');
        assert.strictEqual(category.original, 'Test Category');
        // Everything else stays as a string.
        assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, 'Testauthentifizierung');
        assert.strictEqual((localizedManifest.contributes?.configuration).title, 'Testkonfiguration');
    });
    test('replaces template strings - is best effort #164630', function () {
        const manifestWithTypo = {
            name: 'test',
            publisher: 'test',
            version: '1.0.0',
            engines: {
                vscode: '*'
            },
            contributes: {
                authentication: [
                    {
                        id: 'test.authentication',
                        // This not existing in the bundle shouldn't cause an error.
                        label: '%doesnotexist%',
                    }
                ],
                commands: [
                    {
                        command: 'test.command',
                        title: '%test.command.title%',
                        category: '%test.command.category%'
                    },
                ],
            }
        };
        const localizedManifest = localizeManifest(store.add(new NullLogger()), deepClone(manifestWithTypo), {
            'test.command.title': 'Test Command',
            'test.command.category': 'Test Category'
        });
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, 'Test Command');
        assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, 'Test Category');
        assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, '%doesnotexist%');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTmxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L3Rlc3QvY29tbW9uL2V4dGVuc2lvbk5scy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFaEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXhELE1BQU0sUUFBUSxHQUF1QjtJQUNwQyxJQUFJLEVBQUUsTUFBTTtJQUNaLFNBQVMsRUFBRSxNQUFNO0lBQ2pCLE9BQU8sRUFBRSxPQUFPO0lBQ2hCLE9BQU8sRUFBRTtRQUNSLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRCxXQUFXLEVBQUU7UUFDWixRQUFRLEVBQUU7WUFDVDtnQkFDQyxPQUFPLEVBQUUsY0FBYztnQkFDdkIsS0FBSyxFQUFFLHNCQUFzQjtnQkFDN0IsUUFBUSxFQUFFLHlCQUF5QjthQUNuQztTQUNEO1FBQ0QsY0FBYyxFQUFFO1lBQ2Y7Z0JBQ0MsRUFBRSxFQUFFLHFCQUFxQjtnQkFDekIsS0FBSyxFQUFFLDZCQUE2QjthQUNwQztTQUNEO1FBQ0QsYUFBYSxFQUFFO1lBQ2QsNkNBQTZDO1lBQzdDLEtBQUssRUFBRSw0QkFBNEI7WUFDbkMsVUFBVSxFQUFFO2dCQUNYLG9CQUFvQixFQUFFO29CQUNyQixJQUFJLEVBQUUsUUFBUTtvQkFDZCxXQUFXLEVBQUUsZUFBZTtpQkFDNUI7YUFDRDtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FB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