/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { TPromise } from 'vs/base/common/winjs.base';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import * as ExtensionsActions from 'vs/workbench/parts/extensions/browser/extensionsActions';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	IExtensionManagementService, IExtensionGalleryService, IExtensionEnablementService, IExtensionTipsService, ILocalExtension, LocalExtensionType, IGalleryExtension,
	DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getLocalExtensionIdFromManifest, getGalleryExtensionId, getLocalExtensionIdFromGallery } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { TestExtensionEnablementService } from 'vs/platform/extensionManagement/test/common/extensionEnablementService.test';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IURLService } from 'vs/platform/url/common/url';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceContextService, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';

suite('ExtensionsActions Test', () => {

	let instantiationService: TestInstantiationService;

	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<DidInstallExtensionEvent>,
		uninstallEvent: Emitter<string>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;


	suiteSetup(() => {
		installEvent = new Emitter();
		didInstallEvent = new Emitter();
		uninstallEvent = new Emitter();
		didUninstallEvent = new Emitter();

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IURLService, { onOpenURL: new Emitter().event });
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		instantiationService.set(IWorkspaceContextService, new WorkspaceContextService(TestWorkspace));

		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);

		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);

		instantiationService.stub(IExtensionEnablementService, new TestExtensionEnablementService(instantiationService));

		instantiationService.stub(IExtensionTipsService, ExtensionTipsService);
		instantiationService.stub(IExtensionTipsService, 'getKeymapRecommendations', () => []);
	});

	setup(() => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
		instantiationService.stub(IExtensionService, { getExtensions: () => TPromise.wrap([]) });
		(<TestExtensionEnablementService>instantiationService.get(IExtensionEnablementService)).reset();

		instantiationService.set(IExtensionsWorkbenchService, instantiationService.createInstance(ExtensionsWorkbenchService));
	});

	teardown(() => {
		(<ExtensionsWorkbenchService>instantiationService.get(IExtensionsWorkbenchService)).dispose();
	});

	test('Install action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);

		assert.ok(!testObject.enabled);
	});

	test('Test Install action when state is installed', (done) => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(() => {
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { id: local.id })));
			workbenchService.queryGallery().done((paged) => {
				testObject.extension = paged.firstPage[0];
				assert.ok(!testObject.enabled);
				assert.equal('Install', testObject.label);
				assert.equal('extension-action install', testObject.class);
				done();
			});
		});
	});

	test('Test Install action when state is installing', (done) => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		workbenchService.queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			installEvent.fire({ id: gallery.uuid, gallery });

			assert.ok(!testObject.enabled);
			assert.equal('Installing', testObject.label);
			assert.equal('extension-action install installing', testObject.class);
			done();
		});
	});

	test('Test Install action when state is uninstalled', (done) => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		workbenchService.queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			assert.ok(testObject.enabled);
			assert.equal('Install', testObject.label);
			done();
		});
	});

	test('Test Install action when extension is system action', (done) => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			uninstallEvent.fire(local.id);
			didUninstallEvent.fire({ id: local.id });
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test Install action when extension doesnot has gallery', (done) => {
		const testObject: ExtensionsActions.InstallAction = instantiationService.createInstance(ExtensionsActions.InstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			uninstallEvent.fire(local.id);
			didUninstallEvent.fire({ id: local.id });
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Uninstall action is disabled when there is no extension', () => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);

		assert.ok(!testObject.enabled);
	});

	test('Test Uninstall action when state is uninstalling', (done) => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			assert.ok(!testObject.enabled);
			assert.equal('Uninstalling', testObject.label);
			assert.equal('extension-action uninstall uninstalling', testObject.class);
			done();
		});
	});

	test('Test Uninstall action when state is installed and is user extension', (done) => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			assert.equal('Uninstall', testObject.label);
			assert.equal('extension-action uninstall', testObject.class);
			done();
		});
	});

	test('Test Uninstall action when state is installed and is system extension', (done) => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			assert.equal('Uninstall', testObject.label);
			assert.equal('extension-action uninstall', testObject.class);
			done();
		});
	});

	test('Test Uninstall action after extension is installed', (done) => {
		const testObject: ExtensionsActions.UninstallAction = instantiationService.createInstance(ExtensionsActions.UninstallAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(paged => {
			testObject.extension = paged.firstPage[0];

			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });

			assert.ok(testObject.enabled);
			assert.equal('Uninstall', testObject.label);
			assert.equal('extension-action uninstall', testObject.class);
			done();
		});
	});

	test('Test CombinedInstallAction when there is no extension', () => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);

		assert.ok(!testObject.enabled);
		assert.equal('extension-action install no-extension', testObject.class);
	});

	test('Test CombinedInstallAction when extension is system extension', (done) => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			assert.equal('extension-action install no-extension', testObject.class);
			done();
		});
	});

	test('Test CombinedInstallAction when installAction is enabled', (done) => {
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		workbenchService.queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			assert.ok(testObject.enabled);
			assert.equal('Install', testObject.label);
			assert.equal('extension-action install', testObject.class);
			done();
		});
	});

	test('Test CombinedInstallAction when unInstallAction is enabled', (done) => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			assert.equal('Uninstall', testObject.label);
			assert.equal('extension-action uninstall', testObject.class);
			done();
		});
	});

	test('Test CombinedInstallAction when state is installing', (done) => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		workbenchService.queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			installEvent.fire({ id: gallery.uuid, gallery });

			assert.ok(!testObject.enabled);
			assert.equal('Installing', testObject.label);
			assert.equal('extension-action install installing', testObject.class);
			done();
		});
	});

	test('Test CombinedInstallAction when state is uninstalling', (done) => {
		const testObject: ExtensionsActions.CombinedInstallAction = instantiationService.createInstance(ExtensionsActions.CombinedInstallAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			assert.ok(!testObject.enabled);
			assert.equal('Uninstalling', testObject.label);
			assert.equal('extension-action uninstall uninstalling', testObject.class);
			done();
		});
	});

	test('Test UpdateAction when there is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAction when extension is uninstalled', (done) => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		const gallery = aGalleryExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test UpdateAction when extension is installed and not outdated', (done) => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { id: local.id, version: local.manifest.version })));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(extensions => {
				assert.ok(!testObject.enabled);
				done();
			});
		});
	});

	test('Test UpdateAction when extension is installed outdated and system extension', (done) => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		const local = aLocalExtension('a', { version: '1.0.0' }, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { id: local.id, version: '1.0.1' })));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(extensions => {
				assert.ok(!testObject.enabled);
				done();
			});
		});
	});

	test('Test UpdateAction when extension is installed outdated and user extension', (done) => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { id: local.id, version: '1.0.1' })));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(extensions => {
				assert.ok(testObject.enabled);
				done();
			});
		});
	});

	test('Test UpdateAction when extension is installing and outdated and user extension', (done) => {
		const testObject: ExtensionsActions.UpdateAction = instantiationService.createInstance(ExtensionsActions.UpdateAction);
		const local = aLocalExtension('a', { version: '1.0.0' });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			const gallery = aGalleryExtension('a', { id: local.id, version: '1.0.1' });
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
			instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(extensions => {
				installEvent.fire({ id: local.id, gallery });
				assert.ok(!testObject.enabled);
				done();
			});
		});
	});

	test('Test ManageExtensionAction when there is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);

		assert.ok(!testObject.enabled);
	});

	test('Test ManageExtensionAction when extension is installed', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			assert.equal('extension-action manage', testObject.class);
			assert.equal('', testObject.tooltip);

			done();
		});
	});

	test('Test ManageExtensionAction when extension is uninstalled', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];
			assert.ok(!testObject.enabled);
			assert.equal('extension-action manage hide', testObject.class);
			assert.equal('', testObject.tooltip);

			done();
		});
	});

	test('Test ManageExtensionAction when extension is installing', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];

			installEvent.fire({ id: gallery.uuid, gallery });
			assert.ok(!testObject.enabled);
			assert.equal('extension-action manage hide', testObject.class);
			assert.equal('', testObject.tooltip);

			done();
		});
	});

	test('Test ManageExtensionAction when extension is queried from gallery and installed', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];
			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });

			assert.ok(testObject.enabled);
			assert.equal('extension-action manage', testObject.class);
			assert.equal('', testObject.tooltip);

			done();
		});
	});

	test('Test ManageExtensionAction when extension is system extension', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const local = aLocalExtension('a', {}, { type: LocalExtensionType.System });
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			assert.equal('extension-action manage hide', testObject.class);
			assert.equal('', testObject.tooltip);

			done();
		});
	});

	test('Test ManageExtensionAction when extension is uninstalling', (done) => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationService.createInstance(ExtensionsActions.ManageExtensionAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);

			assert.ok(!testObject.enabled);
			assert.equal('extension-action manage', testObject.class);
			assert.equal('Uninstalling', testObject.tooltip);

			done();
		});
	});

	test('Test EnableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction, 'id');

		assert.ok(!testObject.enabled);
	});

	test('Test EnableForWorkspaceAction when there extension is not disabled', (done) => {
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableForWorkspaceAction when there extension is disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableForWorkspaceAction when extension is disabled for workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test EnableForWorkspaceAction when the extension is disabled in both', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.EnableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction, 'id');

		assert.ok(!testObject.enabled);
	});

	test('Test EnableGloballyAction when the extension is not disabled', (done) => {
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableGloballyAction when the extension is disabled for workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableGloballyAction when the extension is disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test EnableGloballyAction when the extension is disabled in both', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.EnableGloballyAction = instantiationService.createInstance(ExtensionsActions.EnableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test EnableAction when there is no extension', () => {
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);

		assert.ok(!testObject.enabled);
	});

	test('Test EnableAction when extension is installed and enabled', (done) => {
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableAction when extension is installed and disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test EnableAction when extension is installed and disabled for workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test EnableAction when extension is uninstalled', (done) => {
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test EnableAction when extension is installing', (done) => {
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];

			installEvent.fire({ id: gallery.uuid, gallery });
			assert.ok(!testObject.enabled);

			done();
		});
	});

	test('Test EnableAction when extension is uninstalling', (done) => {
		const testObject: ExtensionsActions.EnableAction = instantiationService.createInstance(ExtensionsActions.EnableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableForWorkspaceAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, 'id');

		assert.ok(!testObject.enabled);
	});

	test('Test DisableForWorkspaceAction when the extension is disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableForWorkspaceAction when the extension is disabled workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableForWorkspaceAction when extension is enabled', (done) => {
		const testObject: ExtensionsActions.DisableForWorkspaceAction = instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test DisableGloballyAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, 'id');

		assert.ok(!testObject.enabled);
	});

	test('Test DisableGloballyAction when the extension is disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableGloballyAction when the extension is disabled for workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableGloballyAction when the extension is enabled', (done) => {
		const testObject: ExtensionsActions.DisableGloballyAction = instantiationService.createInstance(ExtensionsActions.DisableGloballyAction, 'id');
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test DisableAction when there is no extension', () => {
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);

		assert.ok(!testObject.enabled);
	});

	test('Test DisableAction when extension is installed and enabled', (done) => {
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(testObject.enabled);
			done();
		});
	});

	test('Test DisableAction when extension is installed and disabled globally', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableAction when extension is installed and disabled for workspace', (done) => {
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false, true);
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableAction when extension is uninstalled', (done) => {
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test DisableAction when extension is installing', (done) => {
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));

		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done(page => {
			testObject.extension = page.firstPage[0];

			installEvent.fire({ id: gallery.uuid, gallery });
			assert.ok(!testObject.enabled);

			done();
		});
	});

	test('Test DisableAction when extension is uninstalling', (done) => {
		const testObject: ExtensionsActions.DisableAction = instantiationService.createInstance(ExtensionsActions.DisableAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test UpdateAllAction when no installed extensions', () => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');

		assert.ok(!testObject.enabled);
	});

	test('Test UpdateAllAction when installed extensions are not outdated', (done) => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a'), aLocalExtension('b')]);
		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test UpdateAllAction when some installed extensions are outdated', (done) => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		workbenchService.queryLocal().done(() => {
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { id: local[0].id, version: '1.0.2' }), aGalleryExtension('b', { id: local[1].id, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)));
			workbenchService.queryGallery().done(() => {
				assert.ok(testObject.enabled);
				done();
			});
		});
	});

	test('Test UpdateAllAction when some installed extensions are outdated and some outdated are being installed', (done) => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const gallery = [aGalleryExtension('a', { id: local[0].id, version: '1.0.2' }), aGalleryExtension('b', { id: local[1].id, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		workbenchService.queryLocal().done(() => {
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...gallery));
			workbenchService.queryGallery().done(() => {
				installEvent.fire({ id: local[0].id, gallery: gallery[0] });
				assert.ok(testObject.enabled);
				done();
			});
		});
	});

	test('Test UpdateAllAction when some installed extensions are outdated and all outdated are being installed', (done) => {
		const testObject: ExtensionsActions.UpdateAllAction = instantiationService.createInstance(ExtensionsActions.UpdateAllAction, 'id', 'label');
		const local = [aLocalExtension('a', { version: '1.0.1' }), aLocalExtension('b', { version: '1.0.1' }), aLocalExtension('c', { version: '1.0.1' })];
		const gallery = [aGalleryExtension('a', { id: local[0].id, version: '1.0.2' }), aGalleryExtension('b', { id: local[1].id, version: '1.0.2' }), aGalleryExtension('c', local[2].manifest)];
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', local);
		workbenchService.queryLocal().done(() => {
			instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...gallery));
			workbenchService.queryGallery().done(() => {
				installEvent.fire({ id: local[0].id, gallery: gallery[0] });
				installEvent.fire({ id: local[1].id, gallery: gallery[1] });
				assert.ok(!testObject.enabled);
				done();
			});
		});
	});

	test('Test ReloadAction when there is no extension', () => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);

		assert.ok(!testObject.enabled);
	});

	test('Test ReloadAction when extension state is installing', (done) => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		workbenchService.queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			installEvent.fire({ id: gallery.uuid, gallery });

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension state is uninstalling', (done) => {
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);

		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is newly installed', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });

			assert.ok(testObject.enabled);
			assert.equal('Reload to activate', testObject.tooltip);
			assert.equal(`Reload this window to activate the extension 'a'?`, testObject.reloadMessaage);
			done();
		});
	});

	test('Test ReloadAction when extension is installed and uninstalled', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const gallery = aGalleryExtension('a');
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
		instantiationService.get(IExtensionsWorkbenchService).queryGallery().done((paged) => {
			testObject.extension = paged.firstPage[0];
			const id = getLocalExtensionIdFromGallery(gallery, gallery.version);
			installEvent.fire({ id, gallery });
			didInstallEvent.fire({ id, gallery, local: aLocalExtension('a', gallery, { id }) });
			uninstallEvent.fire(id);
			didUninstallEvent.fire({ id });

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is uninstalled', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.a' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			didUninstallEvent.fire({ id: local.id });

			assert.ok(testObject.enabled);
			assert.equal('Reload to deactivate', testObject.tooltip);
			assert.equal(`Reload this window to deactivate the uninstalled extension 'a'?`, testObject.reloadMessaage);
			done();
		});
	});

	test('Test ReloadAction when extension is uninstalled and installed', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.a', version: '1.0.0' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		instantiationService.get(IExtensionsWorkbenchService).queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			uninstallEvent.fire(local.id);
			didUninstallEvent.fire({ id: local.id });

			const gallery = aGalleryExtension('a');
			const id = getLocalExtensionIdFromGallery(gallery, gallery.version);
			installEvent.fire({ id, gallery });
			didInstallEvent.fire({ id, gallery, local });

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is updated while running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.a', version: '1.0.1' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];

			const gallery = aGalleryExtension('a', { uuid: local.id, version: '1.0.2' });
			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });

			assert.ok(testObject.enabled);
			assert.equal('Reload to update', testObject.tooltip);
			assert.equal(`Reload this window to activate the updated extension 'a'?`, testObject.reloadMessaage);
			done();

		});
	});

	test('Test ReloadAction when extension is updated when not running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];

			const gallery = aGalleryExtension('a', { id: local.id, version: '1.0.2' });
			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is disabled when running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.a' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			workbenchService.setEnablement(extensions[0], false);

			assert.ok(testObject.enabled);
			assert.equal('Reload to deactivate', testObject.tooltip);
			assert.equal(`Reload this window to deactivate the extension 'a'?`, testObject.reloadMessaage);
			done();
		});
	});

	test('Test ReloadAction when extension enablement is toggled when running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.a', version: '1.0.0' }]);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			workbenchService.setEnablement(extensions[0], false);
			workbenchService.setEnablement(extensions[0], true);

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is enabled when not running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			workbenchService.setEnablement(extensions[0], true);

			assert.ok(testObject.enabled);
			assert.equal('Reload to activate', testObject.tooltip);
			assert.equal(`Reload this window to activate the extension 'a'?`, testObject.reloadMessaage);
			done();
		});
	});

	test('Test ReloadAction when extension enablement is toggled when not running', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a');
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];
			workbenchService.setEnablement(extensions[0], true);
			workbenchService.setEnablement(extensions[0], false);

			assert.ok(!testObject.enabled);
			done();
		});
	});

	test('Test ReloadAction when extension is updated when not running and enabled', (done) => {
		instantiationService.stubPromise(IExtensionService, 'getExtensions', [{ id: 'pub.b' }]);
		instantiationService.get(IExtensionEnablementService).setEnablement('pub.a', false);
		const testObject: ExtensionsActions.ReloadAction = instantiationService.createInstance(ExtensionsActions.ReloadAction);
		const local = aLocalExtension('a', { version: '1.0.1' });
		const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		workbenchService.queryLocal().done(extensions => {
			testObject.extension = extensions[0];

			const gallery = aGalleryExtension('a', { id: local.id, version: '1.0.2' });
			installEvent.fire({ id: gallery.uuid, gallery });
			didInstallEvent.fire({ id: gallery.uuid, gallery, local: aLocalExtension('a', gallery, gallery) });
			workbenchService.setEnablement(extensions[0], true);

			assert.ok(testObject.enabled);
			assert.equal('Reload to activate', testObject.tooltip);
			assert.equal(`Reload this window to activate the extension 'a'?`, testObject.reloadMessaage);
			done();
		});
	});

	function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
		const localExtension = <ILocalExtension>Object.create({ manifest: {} });
		assign(localExtension, { type: LocalExtensionType.User, manifest: {} }, properties);
		assign(localExtension.manifest, { name, publisher: 'pub', version: '1.0.0' }, manifest);
		localExtension.metadata = { id: localExtension.id, publisherId: localExtension.manifest.publisher, publisherDisplayName: 'somename' };
		localExtension.id = getLocalExtensionIdFromManifest(localExtension.manifest);
		return localExtension;
	}

	function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: any = {}): IGalleryExtension {
		const galleryExtension = <IGalleryExtension>Object.create({});
		assign(galleryExtension, { name, publisher: 'pub', uuid: generateUuid(), version: '1.0.0', properties: {}, assets: {} }, properties);
		assign(galleryExtension.properties, { dependencies: [] }, galleryExtensionProperties);
		assign(galleryExtension.assets, assets);
		galleryExtension.id = getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name);
		return <IGalleryExtension>galleryExtension;
	}

	function aPage<T>(...objects: T[]): IPager<T> {
		return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
	}

});