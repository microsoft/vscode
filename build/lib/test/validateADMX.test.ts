/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { validateADMX, validateADML, validatePolicyFiles } from '../policies/validateADMX.ts';

suite('ADMX Validation', () => {

	suite('validateADMX', () => {

		test('should pass validation for valid ADMX content', () => {
			const validAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions revision="1.1" schemaVersion="1.0">
	<categories>
		<category displayName="$(string.Application)" name="Application" />
		<category displayName="$(string.Category_test)" name="test"><parentCategory ref="Application" /></category>
	</categories>
	<policies>
		<policy name="TestPolicy" displayName="$(string.TestPolicy)" explainText="$(string.TestPolicy_description)" presentation="$(presentation.TestPolicy)">
			<elements>
				<enum id="TestPolicy" valueName="TestPolicy">
					<item displayName="$(string.TestPolicy_option1)"><value><string>option1</string></value></item>
				</enum>
			</elements>
		</policy>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(validAdmx);
			assert.strictEqual(result.valid, true, 'Expected valid ADMX to pass validation');
			assert.strictEqual(result.errors.length, 0, 'Expected no errors');
		});

		test('should fail validation for string references with dots in ID', () => {
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy displayName="$(string.TestPolicy_test.invalid.id)">
		</policy>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 1, 'Expected one error');
			assert.ok(result.errors[0].message.includes('dots'), 'Error should mention dots');
			assert.ok(result.errors[0].value.includes('test.invalid.id'), 'Error should include the invalid value');
		});

		test('should fail validation for presentation references with dots in ID', () => {
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy presentation="$(presentation.Test.Invalid.Presentation)">
		</policy>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 1, 'Expected one error');
			assert.ok(result.errors[0].message.includes('dots'), 'Error should mention dots');
		});

		test('should fail validation for id attributes with dots', () => {
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<enum id="Test.Invalid.Id" valueName="TestPolicy">
		</enum>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 1, 'Expected one error');
			assert.ok(result.errors[0].message.includes('dots'), 'Error should mention dots');
		});

		test('should report multiple errors', () => {
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy displayName="$(string.Test.First.Error)">
			<enum id="Test.Second.Error">
				<item displayName="$(string.Test.Third.Error)">
				</item>
			</enum>
		</policy>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 3, 'Expected three errors');
		});

		test('should provide correct line numbers for errors', () => {
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy displayName="$(string.Valid_Id)">
		</policy>
		<policy displayName="$(string.Invalid.Id)">
		</policy>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 1, 'Expected one error');
			assert.strictEqual(result.errors[0].line, 6, 'Error should be on line 6');
		});

		test('should handle real-world example from issue #278352', () => {
			// This simulates the error from the original issue
			const invalidAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<enum id="ChatMCP" valueName="ChatMCP">
			<item displayName="$(string.ChatMCP_chat.mcp.access.none)"><value><string>none</string></value></item>
			<item displayName="$(string.ChatMCP_chat.mcp.access.registry)"><value><string>registry</string></value></item>
			<item displayName="$(string.ChatMCP_chat.mcp.access.any)"><value><string>all</string></value></item>
		</enum>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(invalidAdmx);
			assert.strictEqual(result.valid, false, 'Expected invalid ADMX to fail validation');
			assert.strictEqual(result.errors.length, 3, 'Expected three errors for three invalid items');

			// Check that errors mention the problematic patterns
			const errorMessages = result.errors.map(e => e.message);
			assert.ok(errorMessages.some(m => m.includes('chat.mcp.access.none')), 'Should catch chat.mcp.access.none error');
			assert.ok(errorMessages.some(m => m.includes('chat.mcp.access.registry')), 'Should catch chat.mcp.access.registry error');
			assert.ok(errorMessages.some(m => m.includes('chat.mcp.access.any')), 'Should catch chat.mcp.access.any error');
		});

		test('should handle corrected version from issue #278352', () => {
			// This is the corrected version with underscores instead of dots
			const validAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<enum id="ChatMCP" valueName="ChatMCP">
			<item displayName="$(string.ChatMCP_chat_mcp_access_none)"><value><string>none</string></value></item>
			<item displayName="$(string.ChatMCP_chat_mcp_access_registry)"><value><string>registry</string></value></item>
			<item displayName="$(string.ChatMCP_chat_mcp_access_any)"><value><string>all</string></value></item>
		</enum>
	</policies>
</policyDefinitions>`;

			const result = validateADMX(validAdmx);
			assert.strictEqual(result.valid, true, 'Expected corrected ADMX to pass validation');
			assert.strictEqual(result.errors.length, 0, 'Expected no errors');
		});
	});

	suite('validateADML', () => {

		test('should pass validation for valid ADML content', () => {
			const validAdml = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources revision="1.0" schemaVersion="1.0">
	<resources>
		<stringTable>
			<string id="Application">VS Code</string>
			<string id="TestPolicy">Test Policy</string>
			<string id="TestPolicy_description">Description</string>
		</stringTable>
		<presentationTable>
			<presentation id="TestPolicy">
				<dropdownList refId="TestPolicy" />
			</presentation>
		</presentationTable>
	</resources>
</policyDefinitionResources>`;

			const result = validateADML(validAdml);
			assert.strictEqual(result.valid, true, 'Expected valid ADML to pass validation');
			assert.strictEqual(result.errors.length, 0, 'Expected no errors');
		});

		test('should fail validation for string IDs with dots', () => {
			const invalidAdml = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources>
	<resources>
		<stringTable>
			<string id="Test.Invalid.Id">Value</string>
		</stringTable>
	</resources>
</policyDefinitionResources>`;

			const result = validateADML(invalidAdml);
			assert.strictEqual(result.valid, false, 'Expected invalid ADML to fail validation');
			assert.strictEqual(result.errors.length, 1, 'Expected one error');
			assert.ok(result.errors[0].message.includes('dots'), 'Error should mention dots');
		});
	});

	suite('validatePolicyFiles', () => {

		test('should validate both ADMX and ADML files', () => {
			const admx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy displayName="$(string.TestPolicy)">
		</policy>
	</policies>
</policyDefinitions>`;

			const admlContents = [
				{
					languageId: 'en-us',
					contents: `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources>
	<resources>
		<stringTable>
			<string id="TestPolicy">Test Policy</string>
		</stringTable>
	</resources>
</policyDefinitionResources>`
				}
			];

			const result = validatePolicyFiles(admx, admlContents);
			assert.strictEqual(result.admx.valid, true);
			assert.strictEqual(result.adml.length, 1);
			assert.strictEqual(result.adml[0].languageId, 'en-us');
			assert.strictEqual(result.adml[0].result.valid, true);
		});

		test('should report errors in both ADMX and ADML files', () => {
			const admx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions>
	<policies>
		<policy displayName="$(string.Test.Invalid)">
		</policy>
	</policies>
</policyDefinitions>`;

			const admlContents = [
				{
					languageId: 'en-us',
					contents: `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources>
	<resources>
		<stringTable>
			<string id="Test.Invalid">Test Policy</string>
		</stringTable>
	</resources>
</policyDefinitionResources>`
				}
			];

			const result = validatePolicyFiles(admx, admlContents);
			assert.strictEqual(result.admx.valid, false, 'ADMX should fail validation');
			assert.strictEqual(result.adml[0].result.valid, false, 'ADML should fail validation');
		});
	});
});
