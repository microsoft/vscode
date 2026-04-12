/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { LanguagesRegistry } from '../../../editor/common/services/languagesRegistry.js';
/**
 * This function is called before test running and also again at the end of test running
 * and can be used to add assertions. e.g. that registries are empty, etc.
 *
 * !! This is called directly by the testing framework.
 *
 * @skipMangle
 */
export function assertCleanState() {
    // If this test fails, it is a clear indication that
    // your test or suite is leaking services (e.g. via leaking text models)
    // assert.strictEqual(LanguageService.instanceCount, 0, 'No leaking ILanguageService');
    assert.strictEqual(LanguagesRegistry.instanceCount, 0, 'Error: Test run should not leak in LanguagesRegistry.');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9jb21tb24vdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXpGOzs7Ozs7O0dBT0c7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCO0lBQy9CLG9EQUFvRDtJQUNwRCx3RUFBd0U7SUFDeEUsdUZBQXVGO0lBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFLENBQUMsRUFBRSx1REFBdUQsQ0FBQyxDQUFDO0FBQ2pILENBQUMifQ==