/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarkerService } from '../../../../platform/markers/common/markerService.js';
import { IMarkerData } from '../../../../platform/markers/common/markers.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { MainThreadDiagnostics } from '../../browser/mainThreadDiagnostics.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { mock } from '../../../test/common/workbenchTestServices.js';


suite('MainThreadDiagnostics', function () {

	let markerService: MarkerService;

	setup(function () {
		markerService = new MarkerService();
	});

	teardown(function () {
		markerService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('clear markers on dispose', function () {

		const diag = new MainThreadDiagnostics(
			new class implements IExtHostContext {
				remoteAuthority = '';
				extensionHostKind = ExtensionHostKind.LocalProcess;
				dispose() { }
				assertRegistered() { }
				set(v: any): any { return null; }
				getProxy(): any {
					return {
						$acceptMarkersChange() { }
					};
				}
				drain(): any { return null; }
			},
			markerService,
			new class extends mock<IUriIdentityService>() {
				override asCanonicalUri(uri: URI) { return uri; }
			}
		);

		diag.$changeMany('foo', [[URI.file('a'), [{
			code: '666',
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 1,
			message: 'fffff',
			severity: 1,
			source: 'me'
		}]]]);

		assert.strictEqual(markerService.read().length, 1);
		diag.dispose();
		assert.strictEqual(markerService.read().length, 0);
	});

	test('OnDidChangeDiagnostics triggers twice on same diagnostics #136434', function () {

		return runWithFakedTimers({}, async () => {

			const changedData: [UriComponents, IMarkerData[]][][] = [];

			const diag = new MainThreadDiagnostics(
				new class implements IExtHostContext {
					remoteAuthority = '';
					extensionHostKind = ExtensionHostKind.LocalProcess;
					dispose() { }
					assertRegistered() { }
					set(v: any): any { return null; }
					getProxy(): any {
						return {
							$acceptMarkersChange(data: [UriComponents, IMarkerData[]][]) {
								changedData.push(data);
							}
						};
					}
					drain(): any { return null; }
				},
				markerService,
				new class extends mock<IUriIdentityService>() {
					override asCanonicalUri(uri: URI) { return uri; }
				}
			);

			const markerDataStub = {
				code: '666',
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 1,
				severity: 1,
				source: 'me'
			};
			const target = URI.file('a');
			diag.$changeMany('foo', [[target, [{ ...markerDataStub, message: 'same_owner' }]]]);
			markerService.changeOne('bar', target, [{ ...markerDataStub, message: 'forgein_owner' }]);

			// added one marker via the API and one via the ext host. the latter must not
			// trigger an event to the extension host

			await timeout(0);
			assert.strictEqual(markerService.read().length, 2);
			assert.strictEqual(changedData.length, 1);
			assert.strictEqual(changedData[0].length, 1);
			assert.strictEqual(changedData[0][0][1][0].message, 'forgein_owner');

			diag.dispose();
		});
	});

	test('onDidChangeDiagnostics different behavior when "extensionKind" ui running on remote workspace #136955', function () {
		return runWithFakedTimers({}, async () => {

			const markerData: IMarkerData = {
				code: '666',
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 1,
				severity: 1,
				source: 'me',
				message: 'message'
			};
			const target = URI.file('a');
			markerService.changeOne('bar', target, [markerData]);

			const changedData: [UriComponents, IMarkerData[]][][] = [];

			const diag = new MainThreadDiagnostics(
				new class implements IExtHostContext {
					remoteAuthority = '';
					extensionHostKind = ExtensionHostKind.LocalProcess;
					dispose() { }
					assertRegistered() { }
					set(v: any): any { return null; }
					getProxy(): any {
						return {
							$acceptMarkersChange(data: [UriComponents, IMarkerData[]][]) {
								changedData.push(data);
							}
						};
					}
					drain(): any { return null; }
				},
				markerService,
				new class extends mock<IUriIdentityService>() {
					override asCanonicalUri(uri: URI) { return uri; }
				}
			);

			diag.$clear('bar');
			await timeout(0);
			assert.strictEqual(markerService.read().length, 0);
			assert.strictEqual(changedData.length, 1);

			diag.dispose();
		});
	});
});
