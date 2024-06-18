/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorResourceAccessor, SideBySideEditor, EditorInputWithPreferredResource, EditorInputCapabilities, isEditorIdentifier, IResourceDiffEditorInput, IUntitledTextResourceEditorInput, isResourceEditorInput, isUntitledResourceEditorInput, isResourceDiffEditorInput, isEditorInputWithOptionsAndGroup, EditorInputWithOptions, isEditorInputWithOptions, isEditorInput, EditorInputWithOptionsAndGroup, isResourceSideBySideEditorInput, IResourceSideBySideEditorInput, isTextEditorViewState, isResourceMergeEditorInput, IResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestServiceAccessor, TestEditorInput, registerTestEditor, registerTestFileEditor, registerTestResourceEditor, TestFileEditorInput, createEditorPart, registerTestSideBySideEditor } from 'vs/workbench/test/browser/workbenchTestServices';
import { Schemas } from 'vs/base/common/network';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from 'vs/base/test/common/utils';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { whenEditorClosed } from 'vs/workbench/browser/editor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { EditorResolution, IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { ICodeEditorViewState, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';

suite('Workbench editor utils', () => {

	class TestEditorInputWithPreferredResource extends TestEditorInput implements EditorInputWithPreferredResource {

		constructor(resource: URI, public preferredResource: URI, typeId: string) {
			super(resource, typeId);
		}
	}

	const disposables = new DisposableStore();

	const TEST_EDITOR_ID = 'MyTestEditorForEditors';

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		disposables.add(accessor.untitledTextEditorService);
		disposables.add(registerTestFileEditor());
		disposables.add(registerTestSideBySideEditor());
		disposables.add(registerTestResourceEditor());
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)]));
	});

	teardown(() => {
		disposables.clear();
	});

	test('untyped check functions', () => {
		assert.ok(!isResourceEditorInput(undefined));
		assert.ok(!isResourceEditorInput({}));
		assert.ok(!isResourceEditorInput({ original: { resource: URI.file('/') }, modified: { resource: URI.file('/') } }));
		assert.ok(isResourceEditorInput({ resource: URI.file('/') }));

		assert.ok(!isUntitledResourceEditorInput(undefined));
		assert.ok(isUntitledResourceEditorInput({}));
		assert.ok(isUntitledResourceEditorInput({ resource: URI.file('/').with({ scheme: Schemas.untitled }) }));
		assert.ok(isUntitledResourceEditorInput({ resource: URI.file('/'), forceUntitled: true }));

		assert.ok(!isResourceDiffEditorInput(undefined));
		assert.ok(!isResourceDiffEditorInput({}));
		assert.ok(!isResourceDiffEditorInput({ resource: URI.file('/') }));
		assert.ok(isResourceDiffEditorInput({ original: { resource: URI.file('/') }, modified: { resource: URI.file('/') } }));
		assert.ok(isResourceDiffEditorInput({ original: { resource: URI.file('/') }, modified: { resource: URI.file('/') }, primary: { resource: URI.file('/') }, secondary: { resource: URI.file('/') } }));
		assert.ok(!isResourceDiffEditorInput({ primary: { resource: URI.file('/') }, secondary: { resource: URI.file('/') } }));

		assert.ok(!isResourceSideBySideEditorInput(undefined));
		assert.ok(!isResourceSideBySideEditorInput({}));
		assert.ok(!isResourceSideBySideEditorInput({ resource: URI.file('/') }));
		assert.ok(isResourceSideBySideEditorInput({ primary: { resource: URI.file('/') }, secondary: { resource: URI.file('/') } }));
		assert.ok(!isResourceSideBySideEditorInput({ original: { resource: URI.file('/') }, modified: { resource: URI.file('/') } }));
		assert.ok(!isResourceSideBySideEditorInput({ primary: { resource: URI.file('/') }, secondary: { resource: URI.file('/') }, original: { resource: URI.file('/') }, modified: { resource: URI.file('/') } }));

		assert.ok(!isResourceMergeEditorInput(undefined));
		assert.ok(!isResourceMergeEditorInput({}));
		assert.ok(!isResourceMergeEditorInput({ resource: URI.file('/') }));
		assert.ok(isResourceMergeEditorInput({ input1: { resource: URI.file('/') }, input2: { resource: URI.file('/') }, base: { resource: URI.file('/') }, result: { resource: URI.file('/') } }));
	});

	test('EditorInputCapabilities', () => {
		const testInput1 = disposables.add(new TestFileEditorInput(URI.file('resource1'), 'testTypeId'));
		const testInput2 = disposables.add(new TestFileEditorInput(URI.file('resource2'), 'testTypeId'));

		testInput1.capabilities = EditorInputCapabilities.None;
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.None), true);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Readonly), false);
		assert.strictEqual(testInput1.isReadonly(), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Untitled), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.RequiresTrust), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Singleton), false);

		testInput1.capabilities |= EditorInputCapabilities.Readonly;
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Readonly), true);
		assert.strictEqual(!!testInput1.isReadonly(), true);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.None), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Untitled), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.RequiresTrust), false);
		assert.strictEqual(testInput1.hasCapability(EditorInputCapabilities.Singleton), false);

		testInput1.capabilities = EditorInputCapabilities.None;
		testInput2.capabilities = EditorInputCapabilities.None;

		const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, testInput1, testInput2);
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.MultipleEditors), true);
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Readonly), false);
		assert.strictEqual(sideBySideInput.isReadonly(), false);
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Untitled), false);
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.RequiresTrust), false);
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Singleton), false);

		testInput1.capabilities |= EditorInputCapabilities.Readonly;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Readonly), false);
		assert.strictEqual(sideBySideInput.isReadonly(), false);

		testInput2.capabilities |= EditorInputCapabilities.Readonly;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Readonly), true);
		assert.strictEqual(!!sideBySideInput.isReadonly(), true);

		testInput1.capabilities |= EditorInputCapabilities.Untitled;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Untitled), false);

		testInput2.capabilities |= EditorInputCapabilities.Untitled;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Untitled), true);

		testInput1.capabilities |= EditorInputCapabilities.RequiresTrust;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.RequiresTrust), true);

		testInput2.capabilities |= EditorInputCapabilities.RequiresTrust;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.RequiresTrust), true);

		testInput1.capabilities |= EditorInputCapabilities.Singleton;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Singleton), true);

		testInput2.capabilities |= EditorInputCapabilities.Singleton;
		assert.strictEqual(sideBySideInput.hasCapability(EditorInputCapabilities.Singleton), true);
	});

	test('EditorResourceAccessor - typed inputs', () => {
		const service = accessor.untitledTextEditorService;

		assert.ok(!EditorResourceAccessor.getCanonicalUri(null));
		assert.ok(!EditorResourceAccessor.getOriginalUri(null));

		const untitled = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled)?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.ANY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: Schemas.untitled })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource.toString());
		assert.ok(!EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: Schemas.file }));

		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled)?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.ANY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: Schemas.untitled })?.toString(), untitled.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource.toString());
		assert.ok(!EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: Schemas.file }));

		const file = disposables.add(new TestEditorInput(URI.file('/some/path.txt'), 'editorResourceFileTest'));

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file)?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.ANY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: Schemas.file })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());
		assert.ok(!EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: Schemas.untitled }));

		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file)?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.ANY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { filterByScheme: Schemas.file })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());
		assert.ok(!EditorResourceAccessor.getOriginalUri(file, { filterByScheme: Schemas.untitled }));

		const diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', untitled, file, undefined);
		const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, 'name', 'description', untitled, file);
		for (const input of [diffInput, sideBySideInput]) {
			assert.ok(!EditorResourceAccessor.getCanonicalUri(input));
			assert.ok(!EditorResourceAccessor.getCanonicalUri(input, { filterByScheme: Schemas.file }));

			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());

			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: Schemas.untitled })?.toString(), untitled.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.file }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.untitled }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());

			assert.ok(!EditorResourceAccessor.getOriginalUri(input));
			assert.ok(!EditorResourceAccessor.getOriginalUri(input, { filterByScheme: Schemas.file }));

			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());

			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: Schemas.untitled })?.toString(), untitled.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.file }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.untitled }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource.toString());
		}

		const resource = URI.file('/some/path.txt');
		const preferredResource = URI.file('/some/PATH.txt');
		const fileWithPreferredResource = disposables.add(new TestEditorInputWithPreferredResource(URI.file('/some/path.txt'), URI.file('/some/PATH.txt'), 'editorResourceFileTest'));

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(fileWithPreferredResource)?.toString(), resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(fileWithPreferredResource)?.toString(), preferredResource.toString());
	});

	test('EditorResourceAccessor - untyped inputs', () => {

		assert.ok(!EditorResourceAccessor.getCanonicalUri(null));
		assert.ok(!EditorResourceAccessor.getOriginalUri(null));

		const untitledURI = URI.from({
			scheme: Schemas.untitled,
			authority: 'foo',
			path: '/bar'
		});
		const untitled: IUntitledTextResourceEditorInput = {
			resource: untitledURI
		};

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled)?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.ANY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: Schemas.untitled })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource?.toString());
		assert.ok(!EditorResourceAccessor.getCanonicalUri(untitled, { filterByScheme: Schemas.file }));

		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled)?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.ANY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: Schemas.untitled })?.toString(), untitled.resource?.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource?.toString());
		assert.ok(!EditorResourceAccessor.getOriginalUri(untitled, { filterByScheme: Schemas.file }));

		const file: IResourceEditorInput = {
			resource: URI.file('/some/path.txt')
		};

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file)?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.ANY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: Schemas.file })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());
		assert.ok(!EditorResourceAccessor.getCanonicalUri(file, { filterByScheme: Schemas.untitled }));

		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file)?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.ANY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { supportSideBySide: SideBySideEditor.BOTH })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { filterByScheme: Schemas.file })?.toString(), file.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(file, { filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());
		assert.ok(!EditorResourceAccessor.getOriginalUri(file, { filterByScheme: Schemas.untitled }));

		const diffInput: IResourceDiffEditorInput = { original: untitled, modified: file };
		const sideBySideInput: IResourceSideBySideEditorInput = { primary: file, secondary: untitled };
		for (const untypedInput of [diffInput, sideBySideInput]) {
			assert.ok(!EditorResourceAccessor.getCanonicalUri(untypedInput));
			assert.ok(!EditorResourceAccessor.getCanonicalUri(untypedInput, { filterByScheme: Schemas.file }));

			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());

			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource?.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: Schemas.untitled })?.toString(), untitled.resource?.toString());
			assert.strictEqual(EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource?.toString());

			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.file }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.untitled }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());
			assert.strictEqual((EditorResourceAccessor.getCanonicalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());

			assert.ok(!EditorResourceAccessor.getOriginalUri(untypedInput));
			assert.ok(!EditorResourceAccessor.getOriginalUri(untypedInput, { filterByScheme: Schemas.file }));

			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file })?.toString(), file.resource.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), file.resource.toString());

			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY })?.toString(), untitled.resource?.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: Schemas.untitled })?.toString(), untitled.resource?.toString());
			assert.strictEqual(EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: [Schemas.file, Schemas.untitled] })?.toString(), untitled.resource?.toString());

			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.file }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).primary.toString(), file.resource.toString());

			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: Schemas.untitled }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());
			assert.strictEqual((EditorResourceAccessor.getOriginalUri(untypedInput, { supportSideBySide: SideBySideEditor.BOTH, filterByScheme: [Schemas.file, Schemas.untitled] }) as { primary: URI; secondary: URI }).secondary.toString(), untitled.resource?.toString());
		}

		const fileMerge: IResourceMergeEditorInput = {
			input1: { resource: URI.file('/some/remote.txt') },
			input2: { resource: URI.file('/some/local.txt') },
			base: { resource: URI.file('/some/base.txt') },
			result: { resource: URI.file('/some/merged.txt') }
		};

		assert.strictEqual(EditorResourceAccessor.getCanonicalUri(fileMerge)?.toString(), fileMerge.result.resource.toString());
		assert.strictEqual(EditorResourceAccessor.getOriginalUri(fileMerge)?.toString(), fileMerge.result.resource.toString());
	});

	test('isEditorIdentifier', () => {
		assert.strictEqual(isEditorIdentifier(undefined), false);
		assert.strictEqual(isEditorIdentifier('undefined'), false);

		const testInput1 = disposables.add(new TestFileEditorInput(URI.file('resource1'), 'testTypeId'));
		assert.strictEqual(isEditorIdentifier(testInput1), false);
		assert.strictEqual(isEditorIdentifier({ editor: testInput1, groupId: 3 }), true);
	});

	test('isEditorInputWithOptionsAndGroup', () => {
		const editorInput = disposables.add(new TestFileEditorInput(URI.file('resource1'), 'testTypeId'));
		assert.strictEqual(isEditorInput(editorInput), true);
		assert.strictEqual(isEditorInputWithOptions(editorInput), false);
		assert.strictEqual(isEditorInputWithOptionsAndGroup(editorInput), false);

		const editorInputWithOptions: EditorInputWithOptions = { editor: editorInput, options: { override: EditorResolution.PICK } };
		assert.strictEqual(isEditorInput(editorInputWithOptions), false);
		assert.strictEqual(isEditorInputWithOptions(editorInputWithOptions), true);
		assert.strictEqual(isEditorInputWithOptionsAndGroup(editorInputWithOptions), false);

		const service = accessor.editorGroupService;
		const editorInputWithOptionsAndGroup: EditorInputWithOptionsAndGroup = { editor: editorInput, options: { override: EditorResolution.PICK }, group: service.activeGroup };
		assert.strictEqual(isEditorInput(editorInputWithOptionsAndGroup), false);
		assert.strictEqual(isEditorInputWithOptions(editorInputWithOptionsAndGroup), true);
		assert.strictEqual(isEditorInputWithOptionsAndGroup(editorInputWithOptionsAndGroup), true);
	});

	test('isTextEditorViewState', () => {
		assert.strictEqual(isTextEditorViewState(undefined), false);
		assert.strictEqual(isTextEditorViewState({}), false);

		const codeEditorViewState: ICodeEditorViewState = {
			contributionsState: {},
			cursorState: [],
			viewState: {
				scrollLeft: 0,
				firstPosition: new Position(1, 1),
				firstPositionDeltaTop: 1
			}
		};

		assert.strictEqual(isTextEditorViewState(codeEditorViewState), true);

		const diffEditorViewState: IDiffEditorViewState = {
			original: codeEditorViewState,
			modified: codeEditorViewState
		};

		assert.strictEqual(isTextEditorViewState(diffEditorViewState), true);
	});

	test('whenEditorClosed (single editor)', async function () {
		return testWhenEditorClosed(false, false, toResource.call(this, '/path/index.txt'));
	});

	test('whenEditorClosed (multiple editor)', async function () {
		return testWhenEditorClosed(false, false, toResource.call(this, '/path/index.txt'), toResource.call(this, '/test.html'));
	});

	test('whenEditorClosed (single editor, diff editor)', async function () {
		return testWhenEditorClosed(true, false, toResource.call(this, '/path/index.txt'));
	});

	test('whenEditorClosed (multiple editor, diff editor)', async function () {
		return testWhenEditorClosed(true, false, toResource.call(this, '/path/index.txt'), toResource.call(this, '/test.html'));
	});

	test('whenEditorClosed (single custom editor)', async function () {
		return testWhenEditorClosed(false, true, toResource.call(this, '/path/index.txt'));
	});

	test('whenEditorClosed (multiple custom editor)', async function () {
		return testWhenEditorClosed(false, true, toResource.call(this, '/path/index.txt'), toResource.call(this, '/test.html'));
	});

	async function createServices(): Promise<TestServiceAccessor> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		return instantiationService.createInstance(TestServiceAccessor);
	}

	async function testWhenEditorClosed(sideBySide: boolean, custom: boolean, ...resources: URI[]): Promise<void> {
		const accessor = await createServices();

		for (const resource of resources) {
			if (custom) {
				await accessor.editorService.openEditor(new TestFileEditorInput(resource, 'testTypeId'), { pinned: true });
			} else if (sideBySide) {
				await accessor.editorService.openEditor(instantiationService.createInstance(SideBySideEditorInput, 'testSideBySideEditor', undefined, new TestFileEditorInput(resource, 'testTypeId'), new TestFileEditorInput(resource, 'testTypeId')), { pinned: true });
			} else {
				await accessor.editorService.openEditor({ resource, options: { pinned: true } });
			}
		}

		const closedPromise = accessor.instantitionService.invokeFunction(accessor => whenEditorClosed(accessor, resources));

		accessor.editorGroupService.activeGroup.closeAllEditors();

		await closedPromise;
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
