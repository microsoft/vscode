/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BareFontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { DisassemblyView, IDisassembledInstructionEntry, InstructionRenderer } from '../../browser/disassemblyView.js';

suite('Debug - Disassembly View', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	function instructionEntry(address: string, instruction: string, opts?: {
		instructionBytes?: string;
		sourcePath?: string;
		line?: number;
		showSourceLocation?: boolean;
	}): IDisassembledInstructionEntry {
		return {
			allowBreakpoint: false,
			isBreakpointSet: false,
			isBreakpointEnabled: false,
			instructionReference: address,
			instructionReferenceOffset: 0,
			instructionOffset: 0,
			showSourceLocation: opts?.showSourceLocation,
			instruction: {
				address,
				instruction,
				instructionBytes: opts?.instructionBytes,
				location: opts?.sourcePath === undefined ? undefined : { name: 'repro.c', path: opts.sourcePath },
				line: opts?.line,
			},
			address: 0n,
		};
	}

	// Mirrors the row format: address and bytes are padded to a minimal width.
	function expectedInstructionText(address: string, bytes: string | undefined, instruction: string): string {
		const pad = (s: string, minLength: number) => {
			let spaces = 10;
			if (s.length < minLength) {
				spaces = minLength - s.length;
			}
			return s + ' '.repeat(spaces);
		};
		return (address === '-1' ? '' : pad(address, 25)) + (bytes ? pad(bytes, 30) : '') + instruction;
	}

	function textModelReference(lines: string[], disposedRefs?: IReference<IResolvedTextEditorModel>[]): IReference<IResolvedTextEditorModel> {
		const textModel = upcastPartial<ITextModel>({
			getLineCount: () => lines.length,
			getLineContent: lineNumber => lines[lineNumber - 1],
		});
		const ref: IReference<IResolvedTextEditorModel> = {
			object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: textModel }),
			dispose: () => { disposedRefs?.push(ref); },
		};
		return ref;
	}

	function createFixture() {
		const services = workbenchInstantiationService(undefined, disposables);
		const createModelReferenceCalls: URI[] = [];
		let referenceBehavior: (resource: URI) => Promise<IReference<IResolvedTextEditorModel>> = async () => { throw new Error('no reference behavior configured'); };
		services.stub(ITextModelService, {
			_serviceBrand: undefined,
			createModelReference: async resource => {
				createModelReferenceCalls.push(resource);
				return referenceBehavior(resource);
			},
		});

		const disassemblyView = upcastPartial<DisassemblyView>({
			isSourceCodeRender: true,
			fontInfo: upcastPartial<BareFontInfo>({
				getMassagedFontFamily: () => 'monospace',
				fontWeight: 'normal',
				fontSize: 12,
				fontFeatureSettings: '',
				fontVariationSettings: '',
				lineHeight: 20,
				letterSpacing: 0,
			}),
			onDidChangeStackFrame: Event.None,
			currentInstructionAddresses: [],
			focusedInstructionAddress: undefined,
			focusedCurrentInstructionAddress: undefined,
			debugSession: undefined,
		});
		const renderer = disposables.add(services.createInstance(InstructionRenderer, disassemblyView));

		const container = document.createElement('div');
		disposables.add(toDisposable(() => container.remove()));
		document.body.appendChild(container);

		const templateData = renderer.renderTemplate(container);
		let lastElement: IDisassembledInstructionEntry | undefined;
		disposables.add(toDisposable(() => {
			if (lastElement) {
				renderer.disposeElement(lastElement, 0, templateData);
			}
			renderer.disposeTemplate(templateData);
		}));

		return {
			renderer,
			templateData,
			createModelReferenceCalls,
			setReferenceBehavior: (behavior: (resource: URI) => Promise<IReference<IResolvedTextEditorModel>>) => { referenceBehavior = behavior; },
			renderElement: (element: IDisassembledInstructionEntry) => {
				lastElement = element;
				renderer.renderElement(element, 0, templateData);
			},
		};
	}

	test('renders the source line when the source is available', async () => {
		const fixture = createFixture();
		fixture.setReferenceBehavior(async () => textModelReference(['int main(void) {']));

		fixture.renderElement(instructionEntry('0x5141', 'mov -0x8(%rbp),%edx', { instructionBytes: '48 8b 55 f8', sourcePath: '/src/repro.c', line: 1, showSourceLocation: true }));
		await flush();

		assert.deepStrictEqual({
			instruction: fixture.templateData.instruction.innerText,
			source: fixture.templateData.sourcecode.innerText,
			requestedUris: fixture.createModelReferenceCalls.map(uri => uri.path),
		}, {
			instruction: expectedInstructionText('0x5141', '48 8b 55 f8', 'mov -0x8(%rbp),%edx'),
			source: '  1: int main(void) {\n',
			requestedUris: ['/src/repro.c'],
		});
	});

	test('renders the instruction when the source cannot be loaded', async () => {
		const fixture = createFixture();
		fixture.setReferenceBehavior(async () => { throw new Error('source not available'); });

		fixture.renderElement(instructionEntry('0x5141', 'mov -0x8(%rbp),%edx', { instructionBytes: '48 8b 55 f8', sourcePath: '/src/repro.c', line: 5, showSourceLocation: true }));
		await flush();

		assert.deepStrictEqual({
			instruction: fixture.templateData.instruction.innerText,
			source: fixture.templateData.sourcecode.innerText,
		}, {
			instruction: expectedInstructionText('0x5141', '48 8b 55 f8', 'mov -0x8(%rbp),%edx'),
			source: '',
		});
	});

	test('replaces the row content of a reused row whose source cannot be loaded', async () => {
		const fixture = createFixture();
		fixture.setReferenceBehavior(async () => textModelReference(['int main(void) {']));

		fixture.renderElement(instructionEntry('0x513f', 'nop word ptr cs:[rax+rax]', { instructionBytes: '66 2e 0f 1f 84 00 00 00 00 00', sourcePath: '/src/repro.c', line: 1, showSourceLocation: true }));
		await flush();

		// The table reuses the row for the next instruction, whose source is not available.
		fixture.setReferenceBehavior(async () => { throw new Error('source not available'); });
		fixture.renderElement(instructionEntry('0x5141', 'mov -0x8(%rbp),%edx', { instructionBytes: '48 8b 55 f8', sourcePath: '/src/repro.c', line: 5, showSourceLocation: true }));
		await flush();

		assert.deepStrictEqual({
			instruction: fixture.templateData.instruction.innerText,
			source: fixture.templateData.sourcecode.innerText,
		}, {
			instruction: expectedInstructionText('0x5141', '48 8b 55 f8', 'mov -0x8(%rbp),%edx'),
			source: '',
		});
	});

	test('does not let a late source error overwrite a newer row', async () => {
		const fixture = createFixture();
		const firstSource = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		fixture.setReferenceBehavior(() => firstSource.p);

		fixture.renderElement(instructionEntry('0x513f', 'nop word ptr cs:[rax+rax]', { sourcePath: '/src/repro.c', line: 1, showSourceLocation: true }));

		// The table reuses the row for an instruction without a source location while the
		// first source is still loading.
		fixture.renderElement(instructionEntry('0x5141', 'mov -0x8(%rbp),%edx', { instructionBytes: '48 8b 55 f8', showSourceLocation: false }));
		await flush();

		firstSource.error(new Error('source not available'));
		await flush();

		assert.deepStrictEqual({
			instruction: fixture.templateData.instruction.innerText,
			source: fixture.templateData.sourcecode.innerText,
		}, {
			instruction: expectedInstructionText('0x5141', '48 8b 55 f8', 'mov -0x8(%rbp),%edx'),
			source: '',
		});
	});

	test('does not let a late source load overwrite a newer row and disposes the stale reference', async () => {
		const fixture = createFixture();
		const disposedRefs: IReference<IResolvedTextEditorModel>[] = [];
		const firstSource = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		fixture.setReferenceBehavior(() => firstSource.p);

		fixture.renderElement(instructionEntry('0x513f', 'nop word ptr cs:[rax+rax]', { sourcePath: '/src/repro.c', line: 1, showSourceLocation: true }));

		fixture.renderElement(instructionEntry('0x5141', 'mov -0x8(%rbp),%edx', { instructionBytes: '48 8b 55 f8', showSourceLocation: false }));
		await flush();

		firstSource.complete(textModelReference(['int main(void) {'], disposedRefs));
		await flush();

		assert.deepStrictEqual({
			instruction: fixture.templateData.instruction.innerText,
			source: fixture.templateData.sourcecode.innerText,
			disposedReferences: disposedRefs.length,
		}, {
			instruction: expectedInstructionText('0x5141', '48 8b 55 f8', 'mov -0x8(%rbp),%edx'),
			source: '',
			disposedReferences: 1,
		});
	});
});
