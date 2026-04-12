/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestStorageService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { AuthenticationAccessService } from '../../browser/authenticationAccessService.js';
suite('AuthenticationAccessService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let storageService;
    let productService;
    let authenticationAccessService;
    setup(() => {
        instantiationService = disposables.add(new TestInstantiationService());
        // Set up storage service
        storageService = disposables.add(new TestStorageService());
        instantiationService.stub(IStorageService, storageService);
        // Set up product service with no trusted extensions by default
        productService = { ...TestProductService, trustedExtensionAuthAccess: undefined };
        instantiationService.stub(IProductService, productService);
        // Create the service instance
        authenticationAccessService = disposables.add(instantiationService.createInstance(AuthenticationAccessService));
    });
    teardown(() => {
        // Reset product service configuration to prevent test interference
        if (productService) {
            productService.trustedExtensionAuthAccess = undefined;
        }
    });
    suite('isAccessAllowed', () => {
        test('returns undefined for unknown extension with no product configuration', () => {
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'unknown-extension');
            assert.strictEqual(result, undefined);
        });
        test('returns true for trusted extension from product.json (array format)', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension-1', 'trusted-extension-2'];
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'trusted-extension-1');
            assert.strictEqual(result, true);
        });
        test('returns true for trusted extension from product.json (object format)', () => {
            productService.trustedExtensionAuthAccess = {
                'github': ['github-extension'],
                'microsoft': ['microsoft-extension']
            };
            const result1 = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'github-extension');
            assert.strictEqual(result1, true);
            const result2 = authenticationAccessService.isAccessAllowed('microsoft', 'user@microsoft.com', 'microsoft-extension');
            assert.strictEqual(result2, true);
        });
        test('returns undefined for extension not in trusted list', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension'];
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'untrusted-extension');
            assert.strictEqual(result, undefined);
        });
        test('returns stored allowed state when extension is in storage', () => {
            // Add extension to storage
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [{
                    id: 'stored-extension',
                    name: 'Stored Extension',
                    allowed: false
                }]);
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'stored-extension');
            assert.strictEqual(result, false);
        });
        test('returns true for extension in storage with allowed=true', () => {
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [{
                    id: 'allowed-extension',
                    name: 'Allowed Extension',
                    allowed: true
                }]);
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'allowed-extension');
            assert.strictEqual(result, true);
        });
        test('returns true for extension in storage with undefined allowed property (legacy behavior)', () => {
            // Simulate legacy data where allowed property didn't exist
            const legacyExtension = {
                id: 'legacy-extension',
                name: 'Legacy Extension'
                // allowed property is undefined
            };
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [legacyExtension]);
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'legacy-extension');
            assert.strictEqual(result, true);
        });
        test('product.json trusted extensions take precedence over storage', () => {
            productService.trustedExtensionAuthAccess = ['product-trusted-extension'];
            // Try to store the same extension as not allowed
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [{
                    id: 'product-trusted-extension',
                    name: 'Product Trusted Extension',
                    allowed: false
                }]);
            // Product.json should take precedence
            const result = authenticationAccessService.isAccessAllowed('github', 'user@example.com', 'product-trusted-extension');
            assert.strictEqual(result, true);
        });
    });
    suite('readAllowedExtensions', () => {
        test('returns empty array when no data exists', () => {
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
        test('returns stored extensions', () => {
            const extensions = [
                { id: 'extension1', name: 'Extension 1', allowed: true },
                { id: 'extension2', name: 'Extension 2', allowed: false }
            ];
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', extensions);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'extension1');
            assert.strictEqual(result[0].allowed, true);
            assert.strictEqual(result[1].id, 'extension2');
            assert.strictEqual(result[1].allowed, false);
        });
        test('includes trusted extensions from product.json (array format)', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension-1', 'trusted-extension-2'];
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const trustedExtension1 = result.find(e => e.id === 'trusted-extension-1');
            assert.ok(trustedExtension1);
            assert.strictEqual(trustedExtension1.allowed, true);
            assert.strictEqual(trustedExtension1.trusted, true);
            assert.strictEqual(trustedExtension1.name, 'trusted-extension-1'); // Should default to ID
            const trustedExtension2 = result.find(e => e.id === 'trusted-extension-2');
            assert.ok(trustedExtension2);
            assert.strictEqual(trustedExtension2.allowed, true);
            assert.strictEqual(trustedExtension2.trusted, true);
        });
        test('includes trusted extensions from product.json (object format)', () => {
            productService.trustedExtensionAuthAccess = {
                'github': ['github-extension'],
                'microsoft': ['microsoft-extension']
            };
            const githubResult = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(githubResult.length, 1);
            assert.strictEqual(githubResult[0].id, 'github-extension');
            assert.strictEqual(githubResult[0].trusted, true);
            const microsoftResult = authenticationAccessService.readAllowedExtensions('microsoft', 'user@microsoft.com');
            assert.strictEqual(microsoftResult.length, 1);
            assert.strictEqual(microsoftResult[0].id, 'microsoft-extension');
            assert.strictEqual(microsoftResult[0].trusted, true);
            // Provider not in trusted list should return empty (no stored extensions)
            const unknownResult = authenticationAccessService.readAllowedExtensions('unknown', 'user@unknown.com');
            assert.strictEqual(unknownResult.length, 0);
        });
        test('merges stored extensions with trusted extensions from product.json', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension'];
            // Add some stored extensions
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'stored-extension', name: 'Stored Extension', allowed: false }
            ]);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const trustedExtension = result.find(e => e.id === 'trusted-extension');
            assert.ok(trustedExtension);
            assert.strictEqual(trustedExtension.trusted, true);
            assert.strictEqual(trustedExtension.allowed, true);
            const storedExtension = result.find(e => e.id === 'stored-extension');
            assert.ok(storedExtension);
            assert.strictEqual(storedExtension.trusted, undefined);
            assert.strictEqual(storedExtension.allowed, false);
        });
        test('updates existing stored extension to trusted when found in product.json', () => {
            // First add an extension to storage
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: false }
            ]);
            // Then add it to trusted list
            productService.trustedExtensionAuthAccess = ['extension1'];
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].id, 'extension1');
            assert.strictEqual(result[0].trusted, true);
            assert.strictEqual(result[0].allowed, true); // Should be marked as allowed due to being trusted
        });
        test('handles malformed storage data gracefully', () => {
            // Directly store malformed data in storage
            storageService.store('github-user@example.com', 'invalid-json', -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 0); // Should return empty array instead of throwing
        });
    });
    suite('updateAllowedExtensions', () => {
        test('adds new extensions to storage', () => {
            const extensions = [
                { id: 'extension1', name: 'Extension 1', allowed: true },
                { id: 'extension2', name: 'Extension 2', allowed: false }
            ];
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', extensions);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'extension1');
            assert.strictEqual(result[1].id, 'extension2');
        });
        test('updates existing extension allowed status', () => {
            // First add an extension
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: true }
            ]);
            // Then update its allowed status
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: false }
            ]);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].allowed, false);
        });
        test('updates existing extension name when new name is provided', () => {
            // First add an extension with default name
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'extension1', allowed: true }
            ]);
            // Then update with a proper name
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'My Extension', allowed: true }
            ]);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'My Extension');
        });
        test('does not update name when new name is same as ID', () => {
            // First add an extension with a proper name
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'My Extension', allowed: true }
            ]);
            // Then try to update with ID as name (should keep existing name)
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'extension1', allowed: false }
            ]);
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'My Extension'); // Should keep the original name
            assert.strictEqual(result[0].allowed, false); // But update the allowed status
        });
        test('does not store trusted extensions - they should only come from product.json', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension'];
            // Try to store a trusted extension along with regular extensions
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'regular-extension', name: 'Regular Extension', allowed: true },
                { id: 'trusted-extension', name: 'Trusted Extension', allowed: false }
            ]);
            // Check what's actually stored in storage (should only be the regular extension)
            const storedData = storageService.get('github-user@example.com', -1 /* StorageScope.APPLICATION */);
            assert.ok(storedData);
            const parsedData = JSON.parse(storedData);
            assert.strictEqual(parsedData.length, 1);
            assert.strictEqual(parsedData[0].id, 'regular-extension');
            // But when we read, we should get both (trusted from product.json + stored)
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            const trustedExt = result.find(e => e.id === 'trusted-extension');
            assert.ok(trustedExt);
            assert.strictEqual(trustedExt.trusted, true);
            assert.strictEqual(trustedExt.allowed, true); // Should be true from product.json, not false from storage
            const regularExt = result.find(e => e.id === 'regular-extension');
            assert.ok(regularExt);
            assert.strictEqual(regularExt.trusted, undefined);
            assert.strictEqual(regularExt.allowed, true);
        });
        test('filters out trusted extensions before storing', () => {
            productService.trustedExtensionAuthAccess = ['trusted-ext-1', 'trusted-ext-2'];
            // Add both trusted and regular extensions
            const extensions = [
                { id: 'regular-ext', name: 'Regular Extension', allowed: true },
                { id: 'trusted-ext-1', name: 'Trusted Extension 1', allowed: false },
                { id: 'another-regular-ext', name: 'Another Regular Extension', allowed: false },
                { id: 'trusted-ext-2', name: 'Trusted Extension 2', allowed: true }
            ];
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', extensions);
            // Check storage - should only contain regular extensions
            const storedData = storageService.get('github-user@example.com', -1 /* StorageScope.APPLICATION */);
            assert.ok(storedData);
            const parsedData = JSON.parse(storedData);
            assert.strictEqual(parsedData.length, 2);
            assert.ok(parsedData.find((e) => e.id === 'regular-ext'));
            assert.ok(parsedData.find((e) => e.id === 'another-regular-ext'));
            assert.ok(!parsedData.find((e) => e.id === 'trusted-ext-1'));
            assert.ok(!parsedData.find((e) => e.id === 'trusted-ext-2'));
        });
        test('fires onDidChangeExtensionSessionAccess event', () => {
            let eventFired = false;
            let eventData;
            const subscription = authenticationAccessService.onDidChangeExtensionSessionAccess(e => {
                eventFired = true;
                eventData = e;
            });
            disposables.add(subscription);
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: true }
            ]);
            assert.strictEqual(eventFired, true);
            assert.ok(eventData);
            assert.strictEqual(eventData.providerId, 'github');
            assert.strictEqual(eventData.accountName, 'user@example.com');
        });
    });
    suite('removeAllowedExtensions', () => {
        test('removes all extensions from storage', () => {
            // First add some extensions
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: true },
                { id: 'extension2', name: 'Extension 2', allowed: false }
            ]);
            // Verify they exist
            const result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.ok(result.length > 0);
            // Remove them
            authenticationAccessService.removeAllowedExtensions('github', 'user@example.com');
            // Verify storage is empty (but trusted extensions from product.json might still be there)
            const storedData = storageService.get('github-user@example.com', -1 /* StorageScope.APPLICATION */);
            assert.strictEqual(storedData, undefined);
        });
        test('fires onDidChangeExtensionSessionAccess event', () => {
            let eventFired = false;
            let eventData;
            // First add an extension
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'extension1', name: 'Extension 1', allowed: true }
            ]);
            // Then listen for the remove event
            const subscription = authenticationAccessService.onDidChangeExtensionSessionAccess(e => {
                eventFired = true;
                eventData = e;
            });
            disposables.add(subscription);
            authenticationAccessService.removeAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(eventFired, true);
            assert.ok(eventData);
            assert.strictEqual(eventData.providerId, 'github');
            assert.strictEqual(eventData.accountName, 'user@example.com');
        });
        test('does not affect trusted extensions from product.json', () => {
            productService.trustedExtensionAuthAccess = ['trusted-extension'];
            // Add some regular extensions and verify both trusted and regular exist
            authenticationAccessService.updateAllowedExtensions('github', 'user@example.com', [
                { id: 'regular-extension', name: 'Regular Extension', allowed: true }
            ]);
            let result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2); // 1 trusted + 1 regular
            // Remove stored extensions
            authenticationAccessService.removeAllowedExtensions('github', 'user@example.com');
            // Trusted extension should still be there
            result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].id, 'trusted-extension');
            assert.strictEqual(result[0].trusted, true);
        });
    });
    suite('integration with product.json configurations', () => {
        test('handles switching between array and object format', () => {
            // Start with array format
            productService.trustedExtensionAuthAccess = ['ext1', 'ext2'];
            let result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2);
            // Switch to object format
            productService.trustedExtensionAuthAccess = {
                'github': ['ext1', 'ext3'],
                'microsoft': ['ext4']
            };
            result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 2); // ext1 and ext3 for github
            assert.ok(result.find(e => e.id === 'ext1'));
            assert.ok(result.find(e => e.id === 'ext3'));
            assert.ok(!result.find(e => e.id === 'ext2')); // Should not be there anymore
        });
        test('handles empty trusted extension configurations', () => {
            // Test undefined
            productService.trustedExtensionAuthAccess = undefined;
            let result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
            // Test empty array
            productService.trustedExtensionAuthAccess = [];
            result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
            // Test empty object
            productService.trustedExtensionAuthAccess = {};
            result = authenticationAccessService.readAllowedExtensions('github', 'user@example.com');
            assert.strictEqual(result.length, 0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vdGVzdC9icm93c2VyL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsMkJBQTJCLEVBQWdDLE1BQU0sOENBQThDLENBQUM7QUFHekgsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxjQUFrQyxDQUFDO0lBQ3ZDLElBQUksY0FBc0csQ0FBQztJQUMzRyxJQUFJLDJCQUF5RCxDQUFDO0lBRTlELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixvQkFBb0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRXZFLHlCQUF5QjtRQUN6QixjQUFjLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUMzRCxv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