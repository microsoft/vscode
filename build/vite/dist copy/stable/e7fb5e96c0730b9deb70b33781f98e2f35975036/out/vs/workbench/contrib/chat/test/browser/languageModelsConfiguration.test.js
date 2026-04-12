/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { parseLanguageModelsProviderGroups } from '../../browser/languageModelsConfigurationService.js';
suite('LanguageModelsConfiguration', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    test('parseLanguageModelsConfiguration - empty', () => {
        const model = testDisposables.add(createTextModel('[]'));
        const result = parseLanguageModelsProviderGroups(model);
        assert.deepStrictEqual(result, []);
    });
    test('parseLanguageModelsConfiguration - simple', () => {
        const content = JSON.stringify([{
                vendor: 'vendor',
                name: 'group',
                configurations: []
            }], null, '\t');
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'group');
        assert.strictEqual(result[0].vendor, 'vendor');
        assert.ok(result[0].range);
    });
    test('parseLanguageModelsConfiguration - with configuration range', () => {
        const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"foo": "bar"
				}
			}
		]
	}
]`;
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        const configurations = result[0].configurations;
        const config = configurations[0].configuration;
        assert.deepStrictEqual(config, { foo: 'bar' });
    });
    test('parseLanguageModelsConfiguration - multiple vendors and groups', () => {
        const content = `[
	{ "vendor": "vendor1", "name": "g1", "configurations": [] },
	{ "vendor": "vendor1", "name": "g2", "configurations": [] },
	{ "vendor": "vendor2", "name": "g3", "configurations": [] }
]`;
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].name, 'g1');
        assert.strictEqual(result[0].vendor, 'vendor1');
        assert.strictEqual(result[1].name, 'g2');
        assert.strictEqual(result[1].vendor, 'vendor1');
        assert.strictEqual(result[2].name, 'g3');
        assert.strictEqual(result[2].vendor, 'vendor2');
    });
    test('parseLanguageModelsConfiguration - complex configuration values', () => {
        const content = `[
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": [
			{
				"configuration": {
					"str": "value",
					"num": 123,
					"bool": true,
					"null": null,
					"arr": [1, 2],
					"obj": { "nested": "val" }
				}
			}
		]
	}
]`;
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        const configurations = result[0]?.configurations;
        const config = configurations[0].configuration;
        assert.strictEqual(config.str, 'value');
        assert.strictEqual(config.num, 123);
        assert.strictEqual(config.bool, true);
        assert.strictEqual(config.null, null);
        assert.deepStrictEqual(config.arr, [1, 2]);
        assert.deepStrictEqual(config.obj, { nested: 'val' });
    });
    test('parseLanguageModelsConfiguration - with comments', () => {
        const content = `[
	// This is a comment
	/* Block comment */
	{
		"vendor": "vendor",
		"name": "group",
		"configurations": []
	}
]`;
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'group');
        assert.strictEqual(result[0].vendor, 'vendor');
    });
    test('parseLanguageModelsConfiguration - ranges', () => {
        const content = `[
	{
		"vendor": "vendor",
		"name": "g1",
		"configurations": []
	},
	{
		"vendor": "vendor",
		"name": "g2",
		"configurations": []
	}
]`;
        const model = testDisposables.add(createTextModel(content));
        const result = parseLanguageModelsProviderGroups(model);
        const g1 = result[0];
        const g2 = result[1];
        assert.ok(g1.range);
        assert.ok(g2.range);
        assert.strictEqual(g1.range.startLineNumber, 2);
        assert.strictEqual(g1.range.endLineNumber, 6);
        assert.strictEqual(g2.range.startLineNumber, 7);
        assert.strictEqual(g2.range.endLineNumber, 11);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXhHLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDekMsTUFBTSxlQUFlLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVsRSxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1FBQ3JELE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxNQUFNLEdBQUcsaUNBQWlDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDL0IsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLElBQUksRUFBRSxPQUFPO2dCQUNiLGNBQWMsRUFBRSxFQUFFO2FBQ2xCLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEIsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLE1BQU0sR0FBRyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2REFBNkQsRUFBRSxHQUFHLEVBQUU7UUFDeEUsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7Ozs7OztFQVloQixDQUFDO1FBQ0QsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLE1BQU0sR0FBRyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4RCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBOEQsQ0FBQztRQUNoRyxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDaEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFO1FBQzNFLE1BQU0sT0FBTyxHQUFHOzs7O0VBSWhCLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sTUFBTSxHQUFHLGlDQUFpQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXhELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUU7UUFDNUUsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBaUJoQixDQUFDO1FBQ0QsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM1RCxNQUFNLE1BQU0sR0FBRyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4RCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBOEQsQ0FBQztRQUNqRyxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7UUFDN0QsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7O0VBUWhCLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sTUFBTSxHQUFHLGlDQUFpQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXhELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxNQUFNLE9BQU8sR0FBRzs7Ozs7Ozs7Ozs7RUFXaEIsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxNQUFNLEdBQUcsaUNBQWlDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFeEQsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQixNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQixNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==