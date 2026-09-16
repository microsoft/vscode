/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorPane, IResourceDiffEditorInput } from '../../../../common/editor.js';
import { IView, IViewDescriptor, IViewDescriptorService } from '../../../../common/views.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { EditorSampleTryoutPresentation } from '../../browser/onboardingSamplePresentation.js';
import { CommandTryoutPresentation, ViewTryoutPresentation } from '../../browser/onboardingTryoutActions.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService } from '../../common/onboardingTryout.js';
import { EditorSampleTryoutPayload } from '../../common/onboardingTryoutActions.js';

suite('Onboarding tryout presentations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createContext(token = CancellationToken.None): IOnboardingTryoutRunContext {
		return { id: 'test.sample', token, store: store.add(new DisposableStore()) };
	}

	function createContextKeys() {
		return store.add(new ContextKeyService(upcastPartial<IConfigurationService>(new TestConfigurationService())));
	}

	function registerCommand(id: string): void {
		store.add(CommandsRegistry.registerCommand(id, () => undefined));
	}

	test('commands preserve exact fixed arguments and do not execute during preparation', async () => {
		registerCommand('test.command');
		const executeCommand = sinon.stub().resolves();
		const presentation = new CommandTryoutPresentation(upcastPartial<ICommandService>({ executeCommand }), createContextKeys());
		const payload = { commandId: 'test.command', arguments: [{ setting: 'value' }, 'second'] };
		const prepared = await presentation.prepare(payload, createContext());
		const callsBeforeRun = executeCommand.callCount;
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}
		const result = await prepared.run();
		assert.deepStrictEqual({ callsBeforeRun, result, calls: executeCommand.args }, {
			callsBeforeRun: 0,
			result: { kind: 'executed' },
			calls: [['test.command', { setting: 'value' }, 'second']],
		});
	});

	test('command preconditions are rechecked immediately before execution', async () => {
		const contextKeys = createContextKeys();
		const enabled = contextKeys.createKey<boolean>('test.commandEnabled', true);
		store.add(MenuRegistry.addCommand({ id: 'test.guardedCommand', title: 'Test', precondition: ContextKeyExpr.has('test.commandEnabled') }));
		registerCommand('test.guardedCommand');
		const executeCommand = sinon.stub().resolves();
		const presentation = new CommandTryoutPresentation(upcastPartial<ICommandService>({ executeCommand }), contextKeys);
		const prepared = await presentation.prepare({ commandId: 'test.guardedCommand' }, createContext());
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}
		enabled.set(false);
		const result = await prepared.run();
		assert.deepStrictEqual({ kind: result.kind, calls: executeCommand.callCount }, { kind: 'unavailable', calls: 0 });
	});

	test('command failures retain their normal failure result', async () => {
		registerCommand('test.failure');
		const executeCommand = sinon.stub().rejects(new Error('command failed'));
		const presentation = new CommandTryoutPresentation(upcastPartial<ICommandService>({ executeCommand }), createContextKeys());
		const prepared = await presentation.prepare({ commandId: 'test.failure' }, createContext());
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind === 'ready') {
			await assert.rejects(prepared.run(), /command failed/);
		}
	});

	test('commands can bind guided steps to a returned target scope', async () => {
		registerCommand('test.scopedCommand');
		const executeCommand = sinon.stub().resolves({ targetScope: 'prepared-instance' });
		const presentation = new CommandTryoutPresentation(upcastPartial<ICommandService>({ executeCommand }), createContextKeys());
		const prepared = await presentation.prepare({ commandId: 'test.scopedCommand', captureTargetScope: true }, createContext());
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}

		assert.deepStrictEqual(await prepared.run(), {
			kind: 'executed',
			targetScope: 'prepared-instance',
		});
	});

	test('scoped commands fail closed when no target scope is returned', async () => {
		registerCommand('test.missingTarget');
		const presentation = new CommandTryoutPresentation(
			upcastPartial<ICommandService>({ executeCommand: sinon.stub().resolves(undefined) }),
			createContextKeys(),
		);
		const prepared = await presentation.prepare({ commandId: 'test.missingTarget', captureTargetScope: true }, createContext());
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}

		assert.deepStrictEqual(await prepared.run(), {
			kind: 'unavailable',
			message: 'The example opened, but its target is no longer available.',
		});
	});

	test('unregistered commands are unavailable before dispatch', () => {
		const presentation = new CommandTryoutPresentation(
			upcastPartial<ICommandService>({}),
			createContextKeys(),
		);

		assert.deepStrictEqual(presentation.getAvailability({ commandId: 'test.notRegistered' }), {
			kind: 'unavailable',
			message: 'This command is not available in the current context.',
		});
	});

	test('opens the contributed view rather than relying on active UI state', async () => {
		const openView = sinon.stub().resolves(upcastPartial<IView>({ id: 'test.view' }));
		const presentation = new ViewTryoutPresentation(
			upcastPartial<IViewsService>({ openView }),
			upcastPartial<IViewDescriptorService>({
				onDidChangeViewContainers: Event.None,
				onDidChangeContainer: Event.None,
				getViewDescriptorById: () => upcastPartial<IViewDescriptor>({ id: 'test.view' }),
			}),
			createContextKeys(),
		);
		const prepared = await presentation.prepare({ id: 'test.view', target: 'view' }, createContext());
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}
		const result = await prepared.run();
		assert.deepStrictEqual({ result, calls: openView.args }, {
			result: { kind: 'opened' },
			calls: [['test.view', true]],
		});
	});

	function createSamplePresentation(payload: EditorSampleTryoutPayload, cancelAfterReference?: CancellationTokenSource) {
		const models = new Map<string, ITextModel>();
		const references: string[] = [];
		let released = 0;
		let provider: ITextModelContentProvider | undefined;
		const openEditor = sinon.stub().resolves(upcastPartial<IEditorPane>({}));
		const textModelService = upcastPartial<ITextModelService>({
			registerTextModelContentProvider: (scheme, value) => {
				assert.strictEqual(scheme, Schemas.vscodeOnboardingSample);
				provider = value;
				return Disposable.None;
			},
			createModelReference: async resource => {
				if (!provider) {
					throw new Error('Expected a registered sample provider.');
				}
				const model = await provider.provideTextContent(resource);
				if (!model) {
					throw new Error('Expected a sample model.');
				}
				references.push(resource.path);
				cancelAfterReference?.cancel();
				return {
					object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: model }),
					dispose: () => released++,
				};
			},
		});
		const modelService = upcastPartial<IModelService>({
			getModel: resource => models.get(resource.toString()) ?? null,
			createModel: (value, language, resource) => {
				if (typeof value !== 'string' || !resource) {
					throw new Error('Expected a text sample and its resource.');
				}
				const model = upcastPartial<ITextModel>({ uri: resource, getValue: () => value, getLanguageId: () => language?.languageId ?? 'plaintext' });
				models.set(resource.toString(), model);
				return model;
			},
		});
		const languageService = upcastPartial<ILanguageService>({
			onDidChange: Event.None,
			isRegisteredLanguageId: () => true,
			createById: id => ({ languageId: id ?? 'plaintext', onDidChange: Event.None }),
		});
		const tryoutService = upcastPartial<IOnboardingTryoutService>({
			getTryout: id => id === 'test.sample' ? {
				id,
				trigger: { kind: 'command', commandId: 'test.command' },
				tryout: { title: 'Sample', description: 'Sample description' },
				presentation: { kind: 'editorSample', payload },
			} : undefined,
		});
		const presentation = store.add(new EditorSampleTryoutPresentation(
			upcastPartial<IEditorService>({ openEditor }),
			textModelService,
			modelService,
			languageService,
			tryoutService,
		));
		return { presentation, models, references, openEditor, get released() { return released; } };
	}

	test('prepares real comparison content without opening or writing user files', async () => {
		const payload: EditorSampleTryoutPayload = { type: 'diff', title: 'Sample comparison', languageId: 'typescript', original: 'const value = 1;', modified: 'const value = 2;' };
		const sample = createSamplePresentation(payload);
		const context = createContext();
		const prepared = await sample.presentation.prepare(payload, context);
		const openedBeforeRun = sample.openEditor.callCount;
		assert.strictEqual(prepared.kind, 'ready');
		if (prepared.kind !== 'ready') {
			return;
		}
		const result = await prepared.run();
		const input: IResourceDiffEditorInput = sample.openEditor.firstCall.args[0];
		context.store.dispose();

		assert.deepStrictEqual({
			result,
			openedBeforeRun,
			references: sample.references,
			contents: [...sample.models.values()].map(model => model.getValue()),
			schemes: [input.original.resource?.scheme, input.modified.resource?.scheme],
			released: sample.released,
		}, {
			result: { kind: 'opened' },
			openedBeforeRun: 0,
			references: ['/test.sample/original', '/test.sample/modified'],
			contents: ['const value = 1;', 'const value = 2;'],
			schemes: [Schemas.vscodeOnboardingSample, Schemas.vscodeOnboardingSample],
			released: 2,
		});
	});

	test('cancelled sample preparation never opens an editor', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const payload: EditorSampleTryoutPayload = { type: 'diff', title: 'Sample comparison', original: 'before', modified: 'after' };
		const sample = createSamplePresentation(payload, cancellation);
		const context = createContext(cancellation.token);
		const prepared = await sample.presentation.prepare(payload, context);
		context.store.dispose();
		assert.deepStrictEqual({ prepared, opened: sample.openEditor.callCount, references: sample.references, released: sample.released }, {
			prepared: { kind: 'cancelled' },
			opened: 0,
			references: ['/test.sample/original'],
			released: 1,
		});
	});

	test('sample content can only be resolved from registered example data', async () => {
		const sample = createSamplePresentation({ type: 'text', title: 'Sample', text: 'Known example' });
		const injected = URI.from({ scheme: Schemas.vscodeOnboardingSample, path: '/test.sample/text', query: 'text=untrusted' });
		sample.models.set(injected.toString(), upcastPartial<ITextModel>({ uri: injected }));
		await assert.rejects(sample.presentation.provideTextContent(URI.from({ scheme: Schemas.vscodeOnboardingSample, path: '/unknown/text' })), /no longer available/);
		await assert.rejects(sample.presentation.provideTextContent(injected), /no longer available/);
		await assert.rejects(sample.presentation.provideTextContent(URI.from({ scheme: Schemas.vscodeOnboardingSample, path: '/test.sample/modified' })), /no longer available/);
	});
});
