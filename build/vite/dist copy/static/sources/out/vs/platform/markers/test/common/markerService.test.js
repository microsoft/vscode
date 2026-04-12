/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarkerSeverity } from '../../common/markers.js';
import * as markerService from '../../common/markerService.js';
function randomMarkerData(severity = MarkerSeverity.Error) {
    return {
        severity,
        message: Math.random().toString(16),
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1
    };
}
suite('Marker Service', () => {
    let service;
    teardown(function () {
        service.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('query', () => {
        service = new markerService.MarkerService();
        service.changeAll('far', [{
                resource: URI.parse('file:///c/test/file.cs'),
                marker: randomMarkerData(MarkerSeverity.Error)
            }]);
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
        assert.strictEqual(service.read({ resource: URI.parse('file:///c/test/file.cs') }).length, 1);
        assert.strictEqual(service.read({ owner: 'far', resource: URI.parse('file:///c/test/file.cs') }).length, 1);
        service.changeAll('boo', [{
                resource: URI.parse('file:///c/test/file.cs'),
                marker: randomMarkerData(MarkerSeverity.Warning)
            }]);
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Hint }).length, 0);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning }).length, 2);
    });
    test('changeOne override', () => {
        service = new markerService.MarkerService();
        service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
        service.changeOne('boo', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
        service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData(), randomMarkerData()]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 2);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
    });
    test('changeOne/All clears', () => {
        service = new markerService.MarkerService();
        service.changeOne('far', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
        service.changeOne('boo', URI.parse('file:///path/only.cs'), [randomMarkerData()]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
        assert.strictEqual(service.read().length, 2);
        service.changeOne('far', URI.parse('file:///path/only.cs'), []);
        assert.strictEqual(service.read({ owner: 'far' }).length, 0);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 1);
        assert.strictEqual(service.read().length, 1);
        service.changeAll('boo', []);
        assert.strictEqual(service.read({ owner: 'far' }).length, 0);
        assert.strictEqual(service.read({ owner: 'boo' }).length, 0);
        assert.strictEqual(service.read().length, 0);
    });
    test('changeAll sends event for cleared', () => {
        service = new markerService.MarkerService();
        service.changeAll('far', [{
                resource: URI.parse('file:///d/path'),
                marker: randomMarkerData()
            }, {
                resource: URI.parse('file:///d/path'),
                marker: randomMarkerData()
            }]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 2);
        const d = service.onMarkerChanged(changedResources => {
            assert.strictEqual(changedResources.length, 1);
            changedResources.forEach(u => assert.strictEqual(u.toString(), 'file:///d/path'));
            assert.strictEqual(service.read({ owner: 'far' }).length, 0);
        });
        service.changeAll('far', []);
        d.dispose();
    });
    test('changeAll merges', () => {
        service = new markerService.MarkerService();
        service.changeAll('far', [{
                resource: URI.parse('file:///c/test/file.cs'),
                marker: randomMarkerData()
            }, {
                resource: URI.parse('file:///c/test/file.cs'),
                marker: randomMarkerData()
            }]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 2);
    });
    test('changeAll must not break integrety, issue #12635', () => {
        service = new markerService.MarkerService();
        service.changeAll('far', [{
                resource: URI.parse('scheme:path1'),
                marker: randomMarkerData()
            }, {
                resource: URI.parse('scheme:path2'),
                marker: randomMarkerData()
            }]);
        service.changeAll('boo', [{
                resource: URI.parse('scheme:path1'),
                marker: randomMarkerData()
            }]);
        service.changeAll('far', [{
                resource: URI.parse('scheme:path1'),
                marker: randomMarkerData()
            }, {
                resource: URI.parse('scheme:path2'),
                marker: randomMarkerData()
            }]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 2);
        assert.strictEqual(service.read({ resource: URI.parse('scheme:path1') }).length, 2);
    });
    test('invalid marker data', () => {
        const data = randomMarkerData();
        service = new markerService.MarkerService();
        data.message = undefined;
        service.changeOne('far', URI.parse('some:uri/path'), [data]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 0);
        data.message = null;
        service.changeOne('far', URI.parse('some:uri/path'), [data]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 0);
        data.message = 'null';
        service.changeOne('far', URI.parse('some:uri/path'), [data]);
        assert.strictEqual(service.read({ owner: 'far' }).length, 1);
    });
    test('MapMap#remove returns bad values, https://github.com/microsoft/vscode/issues/13548', () => {
        service = new markerService.MarkerService();
        service.changeOne('o', URI.parse('some:uri/1'), [randomMarkerData()]);
        service.changeOne('o', URI.parse('some:uri/2'), []);
    });
    test('Error code of zero in markers get removed, #31275', function () {
        const data = {
            code: '0',
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 5,
            message: 'test',
            severity: 0,
            source: 'me'
        };
        service = new markerService.MarkerService();
        service.changeOne('far', URI.parse('some:thing'), [data]);
        const marker = service.read({ resource: URI.parse('some:thing') });
        assert.strictEqual(marker.length, 1);
        assert.strictEqual(marker[0].code, '0');
    });
    test('modelVersionId is preserved on IMarker when present in IMarkerData', () => {
        service = new markerService.MarkerService();
        const resource = URI.parse('file:///path/file.ts');
        // Test with modelVersionId present
        const dataWithVersion = {
            ...randomMarkerData(),
            modelVersionId: 42
        };
        service.changeOne('owner', resource, [dataWithVersion]);
        const markersWithVersion = service.read({ resource });
        assert.strictEqual(markersWithVersion.length, 1);
        assert.strictEqual(markersWithVersion[0].modelVersionId, 42);
        // Test without modelVersionId (should be undefined)
        const dataWithoutVersion = randomMarkerData();
        service.changeOne('owner', resource, [dataWithoutVersion]);
        const markersWithoutVersion = service.read({ resource });
        assert.strictEqual(markersWithoutVersion.length, 1);
        assert.strictEqual(markersWithoutVersion[0].modelVersionId, undefined);
    });
    test('resource filter hides markers for the filtered resource', () => {
        service = new markerService.MarkerService();
        const resource1 = URI.parse('file:///path/file1.cs');
        const resource2 = URI.parse('file:///path/file2.cs');
        // Add markers to both resources
        service.changeOne('owner1', resource1, [randomMarkerData()]);
        service.changeOne('owner1', resource2, [randomMarkerData()]);
        // Verify both resources have markers
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ resource: resource1 }).length, 1);
        assert.strictEqual(service.read({ resource: resource2 }).length, 1);
        // Install filter for resource1
        const filter = service.installResourceFilter(resource1, 'Test filter');
        // Verify resource1 markers are filtered out, but have 1 info marker instead
        assert.strictEqual(service.read().length, 2); // 1 real + 1 info
        assert.strictEqual(service.read({ resource: resource1 }).length, 1); // 1 info
        assert.strictEqual(service.read({ resource: resource2 }).length, 1);
        // Dispose filter
        filter.dispose();
        // Verify resource1 markers are visible again
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ resource: resource1 }).length, 1);
        assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    });
    test('resource filter hides markers for the filtered resource UNLESS explicit read', () => {
        service = new markerService.MarkerService();
        const resource1 = URI.parse('file:///path/file1.cs');
        const resource2 = URI.parse('file:///path/file2.cs');
        // Add markers to both resources
        service.changeOne('owner1', resource1, [randomMarkerData()]);
        service.changeOne('owner1', resource2, [randomMarkerData()]);
        // Verify both resources have markers
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ resource: resource1 }).length, 1);
        assert.strictEqual(service.read({ resource: resource2 }).length, 1);
        // Install filter for resource1
        const filter = service.installResourceFilter(resource1, 'Test filter');
        // Verify resource1 markers are filtered out, but have 1 info marker instead
        assert.strictEqual(service.read().length, 2); // 1 real + 1 info
        assert.strictEqual(service.read({ resource: resource1 }).length, 1); // 1 info
        assert.strictEqual(service.read({ resource: resource2 }).length, 1);
        // Verify resource1 markers are visible again
        assert.strictEqual(service.read({ ignoreResourceFilters: true }).length, 2);
        assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true }).length, 1);
        assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
        assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true }).length, 1);
        assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
        // Dispose filter
        filter.dispose();
    });
    test('resource filter affects all filter combinations', () => {
        service = new markerService.MarkerService();
        const resource = URI.parse('file:///path/file.cs');
        service.changeOne('owner1', resource, [randomMarkerData(MarkerSeverity.Error)]);
        service.changeOne('owner2', resource, [randomMarkerData(MarkerSeverity.Warning)]);
        // Verify initial state
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ resource }).length, 2);
        assert.strictEqual(service.read({ owner: 'owner1' }).length, 1);
        assert.strictEqual(service.read({ owner: 'owner2' }).length, 1);
        assert.strictEqual(service.read({ owner: 'owner1', resource }).length, 1);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
        assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
        // Install filter
        const filter = service.installResourceFilter(resource, 'Filter reason');
        // Verify information marker is shown for resource queries
        assert.strictEqual(service.read().length, 1); // 1 info marker
        assert.strictEqual(service.read({ resource }).length, 1); // 1 info marker
        assert.strictEqual(service.read({ owner: 'owner1' }).length, 1); // 1 info marker
        assert.strictEqual(service.read({ owner: 'owner2' }).length, 1); // 1 info marker
        // Verify owner+resource query returns an info marker for filtered resources
        const ownerResourceMarkers = service.read({ owner: 'owner1', resource });
        assert.strictEqual(ownerResourceMarkers.length, 1);
        assert.strictEqual(ownerResourceMarkers[0].severity, MarkerSeverity.Info);
        assert.strictEqual(ownerResourceMarkers[0].owner, 'markersFilter');
        assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1); // 1 info marker
        assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1); // 1 info marker
        assert.strictEqual(service.read({ severities: MarkerSeverity.Info }).length, 1); // Our info marker
        // Remove filter and verify markers are visible again
        filter.dispose();
        assert.strictEqual(service.read().length, 2);
    });
    test('multiple filters for same resource are handled correctly', () => {
        service = new markerService.MarkerService();
        const resource = URI.parse('file:///path/file.cs');
        // Add marker to resource
        service.changeOne('owner1', resource, [randomMarkerData()]);
        // Verify resource has markers
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ resource }).length, 1);
        // Install two filters for the same resource
        const filter1 = service.installResourceFilter(resource, 'First filter');
        const filter2 = service.installResourceFilter(resource, 'Second filter');
        // Verify resource markers are filtered out but info marker is shown
        assert.strictEqual(service.read().length, 1); // 1 info marker
        assert.strictEqual(service.read({ resource }).length, 1); // 1 info marker
        // Dispose only one filter
        filter1.dispose();
        // Verify resource markers are still filtered out because one filter remains
        assert.strictEqual(service.read().length, 1); // still 1 info marker
        assert.strictEqual(service.read({ resource }).length, 1); // still 1 info marker
        // Dispose the second filter
        filter2.dispose();
        // Now all filters are gone, so markers should be visible again
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ resource }).length, 1);
    });
    test('resource filter with reason shows info marker when markers are filtered', () => {
        service = new markerService.MarkerService();
        const resource = URI.parse('file:///path/file.cs');
        // Add error and warning to the resource
        service.changeOne('owner1', resource, [
            randomMarkerData(MarkerSeverity.Error),
            randomMarkerData(MarkerSeverity.Warning)
        ]);
        // Verify initial state
        assert.strictEqual(service.read().length, 2);
        assert.strictEqual(service.read({ resource }).length, 2);
        // Apply a filter with reason
        const filterReason = 'Test filter reason';
        const filter = service.installResourceFilter(resource, filterReason);
        // Verify that we get a single info marker with our reason
        const markers = service.read({ resource });
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
        assert.ok(markers[0].message.includes(filterReason));
        // Remove filter and verify the original markers are back
        filter.dispose();
        assert.strictEqual(service.read({ resource }).length, 2);
    });
    test('reading all markers shows info marker for filtered resources', () => {
        service = new markerService.MarkerService();
        const resource1 = URI.parse('file:///path/file1.cs');
        const resource2 = URI.parse('file:///path/file2.cs');
        // Add markers to both resources
        service.changeOne('owner1', resource1, [randomMarkerData()]);
        service.changeOne('owner1', resource2, [randomMarkerData()]);
        // Verify initial state
        assert.strictEqual(service.read().length, 2);
        // Filter one resource with a reason
        const filterReason = 'Resource is being edited';
        const filter = service.installResourceFilter(resource1, filterReason);
        // Read all markers
        const allMarkers = service.read();
        // Should have 2 markers - one real marker and one info marker
        assert.strictEqual(allMarkers.length, 2);
        // Find the info marker
        const infoMarker = allMarkers.find(marker => marker.owner === 'markersFilter' &&
            marker.severity === MarkerSeverity.Info);
        // Verify the info marker
        assert.ok(infoMarker);
        assert.strictEqual(infoMarker?.resource.toString(), resource1.toString());
        assert.ok(infoMarker?.message.includes(filterReason));
        // Remove filter
        filter.dispose();
    });
    test('out of order filter disposal works correctly', () => {
        service = new markerService.MarkerService();
        const resource = URI.parse('file:///path/file.cs');
        // Add marker to resource
        service.changeOne('owner1', resource, [randomMarkerData()]);
        // Verify resource has markers
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ resource }).length, 1);
        // Install three filters for the same resource
        const filter1 = service.installResourceFilter(resource, 'First filter');
        const filter2 = service.installResourceFilter(resource, 'Second filter');
        const filter3 = service.installResourceFilter(resource, 'Third filter');
        // Verify resource markers are filtered out but info marker is shown
        assert.strictEqual(service.read().length, 1); // 1 info marker
        assert.strictEqual(service.read({ resource }).length, 1); // 1 info marker
        // Dispose filters in a different order than they were created
        filter2.dispose(); // Remove the second filter first
        // Verify resource markers are still filtered out with 2 filters remaining
        assert.strictEqual(service.read().length, 1); // still 1 info marker
        assert.strictEqual(service.read({ resource }).length, 1); // still 1 info marker
        // Check if message contains the correct count of filters
        const markers = service.read({ resource });
        assert.ok(markers[0].message.includes('Problems are paused because'));
        // Remove remaining filters in any order
        filter3.dispose();
        filter1.dispose();
        // Now all filters are gone, so markers should be visible again
        assert.strictEqual(service.read().length, 1);
        assert.strictEqual(service.read({ resource }).length, 1);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VyU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbWFya2Vycy90ZXN0L2NvbW1vbi9tYXJrZXJTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQWUsY0FBYyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEUsT0FBTyxLQUFLLGFBQWEsTUFBTSwrQkFBK0IsQ0FBQztBQUUvRCxTQUFTLGdCQUFnQixDQUFDLFFBQVEsR0FBRyxjQUFjLENBQUMsS0FBSztJQUN4RCxPQUFPO1FBQ04sUUFBUTtRQUNSLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxlQUFlLEVBQUUsQ0FBQztRQUNsQixXQUFXLEVBQUUsQ0FBQztRQUNkLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLFNBQVMsRUFBRSxDQUFDO0tBQ1osQ0FBQztBQUNILENBQUM7QUFFRCxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBRTVCLElBQUksT0FBb0MsQ0FBQztJQUV6QyxRQUFRLENBQUM7UUFDUixPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1FBRWxCLE9BQU8sR0FBRyxJQUFJLGFBQWEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUU1QyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssRUFB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