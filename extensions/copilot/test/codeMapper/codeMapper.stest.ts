/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import type { MappedEditsResponseStream } from 'vscode';
import { Intent } from '../../src/extension/common/constants';
import { IDocumentContext } from '../../src/extension/prompt/node/documentContext';
import { CodeMapper, ICodeMapperExistingDocument } from '../../src/extension/prompts/node/codeMapper/codeMapper';
import { WorkingCopyOriginalDocument } from '../../src/extension/prompts/node/inline/workingCopies';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../src/platform/test/node/services';
import { IFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { isEqual } from '../../src/util/vs/base/common/resources';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource, Selection, TextEdit } from '../../src/vscodeTypes';
import { Configuration, ISimulationTestRuntime, ssuite, stest } from '../base/stest';
import { KnownDiagnosticProviders } from '../simulation/diagnosticProviders';
import { setupSimulationWorkspace, teardownSimulationWorkspace, toIRange } from '../simulation/inlineChatSimulator';
import { assertJSON, assertNoElidedCodeComments, getWorkspaceDiagnostics, validateConsistentIndentation } from '../simulation/outcomeValidators';
import { INLINE_CHANGED_DOC_TAG, INLINE_INITIAL_DOC_TAG, INLINE_STATE_TAG, IWorkspaceState } from '../simulation/shared/sharedTypes';
import { fromFixture } from '../simulation/stestUtil';
import { OutcomeAnnotation } from '../simulation/types';


function forEditsAndAgent(callback: (variant: string | undefined, model: string | undefined, configurations: Configuration<any>[] | undefined) => void): void {
	callback('', undefined, undefined);
}

forEditsAndAgent((variant, model, configurations) => {

	ssuite({ title: 'codeMapper' + variant, location: 'context', configurations }, () => {
		stest({ description: 'add new function at location 1', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/fibonacci_recursive.ts')],
				activeDocument: 'fibonacci_recursive.ts',
				selection: [5, 0, 5, 0],
				focusLocations: [],
				codeBlock: [
					'function fibonacci_iterative(n: number): number {',
					'    if (n === 1) return 0;',
					'    if (n === 2) return 1;',
					'    let a = 0, b = 1, sum = 0;',
					'    for (let i = 2; i < n; i++) {',
					'        sum = a + b;',
					'        a = b;',
					'        b = sum;',
					'    }',
					'    return sum;',
					'}'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.ok(outcome.editedFile.includes('function fibonacci_iterative(n: number): number {'), 'has fibonacci_iterative');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'modify function', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/fibonacci_recursive.ts')],
				activeDocument: 'fibonacci_recursive.ts',
				selection: [0, 0, 4, 1],
				focusLocations: [],
				codeBlock: [
					'function fibonacci_recursive(n: number): number {',
					'	// Base case: if n is 1, the first number in the Fibonacci sequence is returned (0).',
					'	if (n === 1) return 0;',
					'	// Base case: if n is 2, the second number in the Fibonacci sequence is returned (1).',
					'	if (n === 2) return 1;',
					'	// Recursive case: return the sum of the two preceding numbers in the sequence.',
					'	// This is done by calling fibonacci_recursive for (n - 1) and (n - 2) and adding their results.',
					'	return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2);',
					'}'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.equal(numOccurrences(outcome.editedFile, 'function fibonacci_recursive'), 1, 'only once occurrence of fibonacci_recursive');
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.ok(outcome.editedFile.includes('// Base case: if n is 1'), 'has comments added');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'replace statement with ident change', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/fibonacci_recursive.ts')],
				activeDocument: 'fibonacci_recursive.ts',
				selection: [7, 0, 7, 93],
				focusLocations: [],
				codeBlock: [
					'// More readable version of generating a Fibonacci series',
					'const fibonacci_series = Array.from({ length: n }, (value, index) => {',
					'	return fibonacci_recursive(index + 1);',
					'});'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.ok(outcome.editedFile.includes('return fibonacci_recursive(index + 1);'), 'has new statement');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'move to class', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/fibonacci_recursive.ts')],
				activeDocument: 'fibonacci_recursive.ts',
				selection: [0, 0, 10, 0],
				focusLocations: [],
				codeBlock: [
					'class FibonacciGenerator {',
					'    static fibonacci_recursive(n: number): number {',
					'        if (n === 1) return 0;',
					'        if (n === 2) return 1;',
					'        return FibonacciGenerator.fibonacci_recursive(n - 1) + FibonacciGenerator.fibonacci_recursive(n - 2);',
					'    }',
					'',
					'    static generate_fibonacci_recursive(n: number): number[] {',
					'        const fibonacci_series = Array.from({ length: n }, (_, i) => FibonacciGenerator.fibonacci_recursive(i + 1));',
					'        return fibonacci_series;',
					'    }',
					'}'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.ok(outcome.editedFile.includes('class FibonacciGenerator {'), 'has class');
					assert.equal(numOccurrences(outcome.editedFile, 'console.log(function generate_fibonacci_recursive'), 0, 'no references to the old function');
					assert.equal(numOccurrences(outcome.editedFile, 'console.log(FibonacciGenerator.generate_fibonacci_recursive'), 1, 'references to the new method');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'add import', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/fibonacci_recursive.ts')],
				activeDocument: 'fibonacci_recursive.ts',
				selection: [11, 0, 17, 0],
				focusLocations: [],
				codeBlock: [
					'import { readFileSync } from \'fs\';',
					'',
					'// Assuming the mock_data is stored in a file named \'data.json\' with the structure { "number": 10 }',
					'const data = JSON.parse(readFileSync(\'data.json\', \'utf8\'));',
					'',
					'console.log(\'\\nFibonacci Series using recursion:\');',
					'console.log(generate_fibonacci_recursive(data.number));'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.equal(numOccurrences(outcome.editedFile, 'import { readFileSync } from \'fs\';'), 1, 'has import');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'break up function, large file', language: 'typescript' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/scanner.ts'), fromFixture('codeMapper/scannerTypes.ts')],
				activeDocument: 'scanner.ts',
				selection: [25, 0, 50, 0],
				focusLocations: [],
				codeBlock: [
					'// Checks if a character code is a numeric hex digit (0-9)',
					'function isNumericHexDigit(ch: number): boolean {',
					'    return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;',
					'}',
					'',
					'// Checks if a character code is an alphabetic hex digit (A-F or a-f)',
					'function isAlphabeticHexDigit(ch: number): boolean {',
					'    return (ch >= CharacterCodes.A && ch <= CharacterCodes.F) || (ch >= CharacterCodes.a && ch <= CharacterCodes.f);',
					'}',
					'',
					'// Calculates the numerical value of a hex digit character code',
					'function calculateHexValue(ch: number): number {',
					'    if (isNumericHexDigit(ch)) {',
					'        return ch - CharacterCodes._0;',
					'    } else if (ch >= CharacterCodes.A && ch <= CharacterCodes.F) {',
					'        return 10 + ch - CharacterCodes.A;',
					'    } else if (ch >= CharacterCodes.a && ch <= CharacterCodes.f) {',
					'        return 10 + ch - CharacterCodes.a;',
					'    }',
					'    // Return -1 if not a hex digit, though this case should be handled before calling this function',
					'    return -1;',
					'}',
					'',
					'// The main scanning function, refactored to use the helper functions',
					'function scanHexDigits(count: number, exact?: boolean): number {',
					'    let digits = 0;',
					'    let value = 0;',
					'    while (digits < count || !exact) {',
					'        let ch = text.charCodeAt(pos);',
					'        if (isNumericHexDigit(ch) || isAlphabeticHexDigit(ch)) {',
					'            value = value * 16 + calculateHexValue(ch);',
					'        } else {',
					'            break;',
					'        }',
					'        pos++;',
					'        digits++;',
					'    }',
					'    if (digits < count) {',
					'        value = -1;',
					'    }',
					'    return value;',
					'}'
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.equal(numOccurrences(outcome.editedFile, '\t// Checks if a character code is a numeric hex digit (0-9)'), 1, 'inserted with indent');
					assert.deepEqual(await getWorkspaceDiagnostics(accessor, workspace, KnownDiagnosticProviders.tsc), [], 'no diagnostics');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});

		stest({ description: 'make changes in package.json', language: 'json' }, async (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/package.json')],
				activeDocument: 'package.json',
				selection: [11, 0, 17, 0],
				focusLocations: [],
				codeBlock: [
					`"keywords": [ 'ai' ],`,
					`"devDependencies": {`,
					`	"@microsoft/tiktokenizer": "^1.0.6",`,
					`	"@types/node": "^20.11.30",`,
					`	"@vscode/test-cli": "^0.0.9",`,
					`	"@vscode/test-electron": "^2.4.1",`,
					`	"@types/vscode": "^1.89.0",`,
					`	"esbuild": "0.25.0",`,
					`	"npm-dts": "^1.3.12",`, // removed mocha
					`	"prettier": "^2.8.7",`,
					`	"tsx": "^4.6.2",`,
					`	"typescript": "^5.5.0",`, // update version
					`	"vitest": "^0.34.0"`, // inserted
					`},`,
					`"scripts": {`,
					`	"test": "vitest"`,
					`}`
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const pgkJSON = assertJSON(outcome.editedFile);
					assert.equal(pgkJSON.devDependencies['vitest'], '^0.34.0', 'has vitest');
					assert.equal(pgkJSON.devDependencies['mocha'], undefined, 'no longer has mocha');
					assert.deepEqual(pgkJSON.keywords, ['ai'], 'keyword added');
					assert.equal(pgkJSON.scripts['test'], 'vitest', 'has test script');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});

		stest({ description: 'does not delete random parts of code (big file)', language: 'typescript' }, (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/quickInput.ts')],
				activeDocument: 'quickInput.ts',
				selection: [0, 0, 25, 0],
				focusLocations: [],
				textBeforeCodeBlock: 'Add a utility function to calculate Fibonacci numbers.',
				codeBlock: [
					`// ...existing code...`,
					``,
					`/**`,
					` * Calculates the nth Fibonacci number.`,
					` * @param n - The position in the Fibonacci sequence (0-based).`,
					` * @returns The nth Fibonacci number.`,
					` */`,
					`function fibonacci(n: number): number {`,
					`	if (n <= 1) {`,
					`		return n;`,
					`	}`,
					`	let a = 0, b = 1;`,
					`	for (let i = 2; i <= n; i++) {`,
					`		const temp = a + b;`,
					`		a = b;`,
					`		b = temp;`,
					`	}`,
					`	return b;`,
					`}`,
					``,
					`// ...existing code...`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const newText = outcome.editedFile;
					assert.ok(newText.includes('function fibonacci'), 'fibonacci function not added');
					assert.ok(newText.length > outcome.originalFileContent.length, 'deleted code');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});

		stest({ description: 'does not remove stale imports #11766', language: 'typescript' }, (testingServiceCollection) => {
			return simulateCodeMapper(testingServiceCollection, {
				files: [fromFixture('codeMapper/index.ts')],
				activeDocument: 'index.ts',
				selection: [0, 0, 25, 0],
				focusLocations: [],
				textBeforeCodeBlock: 'Update saveCategorization endpoint to use the new CSV utility function.',
				codeBlock: [
					`import { saveCategorizationToCSV } from '$lib/csvUtils';`,
					``,
					`export const POST: RequestHandler = async ({ request }) => {`,
					`	const { respondentId, categories, notActionable, highlight } = await request.json();`,
					`	const filePath = 'data/export.csv';`,
					``,
					`	saveCategorizationToCSV(filePath, respondentId, categories, notActionable, highlight);`,
					``,
					`	return new Response(null, { status: 200 });`,
					`};`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const newText = outcome.editedFile;
					assert.ok(!newText.includes(`'path'`), 'rewritten file contains unused imports');
					assert.ok(!newText.includes(`'fs'`), 'rewritten file contains unused imports');
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});
		stest({ description: 'sorted product icons (60kb) - modify & insert', language: 'markdown', model }, (testingServiceCollection) => {
			const inputFile = fromFixture('codeMapper/product-icons-sorted.md');
			return simulateCodeMapper(testingServiceCollection, {
				files: [inputFile],
				activeDocument: inputFile.fileName,
				selection: [0, 0, 0, 0],
				focusLocations: [],
				textBeforeCodeBlock: '',
				codeBlock: [
					`<!-- ... existing content ... -->`,
					`## Icon Listing`,
					``,
					`Below is a complete listing of the built-in product icons by identifier.`, // modified line
					``,
					`The ID of the icon identifies the location where the icon is used. The default codicon ID describes which icon from the codicon library is used by default, and the preview shows what that icon looks like.`,
					`<!-- ... existing content ... -->`,
					`|<i class="codicon codicon-wrench"></i>|wrench|`,
					`|<i class="codicon codicon-wrench-extra"></i>|wrench-extra|`, // added line
					`|<i class="codicon codicon-x"></i>|ports-stop-forward-icon|x|Icon for the stop forwarding action.|`,
					`<!-- ... existing content ... -->`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const newText = outcome.editedFile;
					const expectedText = inputFile.fileContents
						.replace('Below is a listing', 'Below is a complete listing')
						.replace('|<i class="codicon codicon-wrench"></i>|wrench|', '|<i class="codicon codicon-wrench"></i>|wrench|\n|<i class="codicon codicon-wrench-extra"></i>|wrench-extra|');

					assert.equal(newText, expectedText, 'rewritten file is as expected: ');
					assertNoElidedCodeComments(outcome.editedFile);
				}
			});
		});

		stest({ description: 'mixed product icons (60kb) - modify & insert', language: 'markdown', model }, (testingServiceCollection) => {
			const inputFile = fromFixture('codeMapper/product-icons-mixed.md');
			return simulateCodeMapper(testingServiceCollection, {
				files: [inputFile],
				activeDocument: inputFile.fileName,
				selection: [0, 0, 0, 0],
				focusLocations: [],
				textBeforeCodeBlock: '',
				codeBlock: [
					`<!-- ... existing content ... -->`,
					`## Icon Listing`,
					``,
					`Below is a complete listing of the built-in product icons by identifier.`, // modified line
					``,
					`The ID of the icon identifies the location where the icon is used. The default codicon ID describes which icon from the codicon library is used by default, and the preview shows what that icon looks like.`,
					`<!-- ... existing content ... -->`,
					`|<i class="codicon codicon-wrench-subaction"></i>|wrench-subaction|`,
					`|<i class="codicon codicon-wrench-extra"></i>|wrench-extra|`, // added line
					`|<i class="codicon codicon-x"></i>|x|`,
					`<!-- ... existing content ... -->`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const newText = outcome.editedFile;
					const expectedText = inputFile.fileContents
						.replace('Below is a listing', 'Below is a complete listing')
						.replace('|<i class="codicon codicon-wrench-subaction"></i>|wrench-subaction|', '|<i class="codicon codicon-wrench-subaction"></i>|wrench-subaction|\n|<i class="codicon codicon-wrench-extra"></i>|wrench-extra|');

					assert.equal(newText, expectedText, 'rewritten file is as expected: ');
					assertNoElidedCodeComments(outcome.editedFile);
				}
			});
		});

		stest({ description: 'other tests updated similarly', language: 'typescript', model }, (testingServiceCollection) => {
			// the code clock contains a comment: 'other tests updated similarly'
			const inputFile = fromFixture('codeMapper/extHostExtensionActivator.test.ts');
			return simulateCodeMapper(testingServiceCollection, {
				files: [inputFile],
				activeDocument: inputFile.fileName,
				selection: [0, 0, 0, 0],
				focusLocations: [],
				textBeforeCodeBlock: '',
				codeBlock: [
					`suite('ExtensionsActivator', () => {`,
					``,
					`    ensureNoDisposablesAreLeakedInTestSuite();`,
					``,
					`    let activator: ExtensionsActivator | undefined;`,
					``,
					`    teardown(() => {`,
					`        if (activator) {`,
					`            activator.dispose();`,
					`            activator = undefined;`,
					`        }`,
					`    });`,
					``,
					`    const idA = new ExtensionIdentifier(\`a\`);`,
					`    const idB = new ExtensionIdentifier(\`b\`);`,
					`    const idC = new ExtensionIdentifier(\`c\`);`,
					``,
					`    test('calls activate only once with sequential activations', async () => {`,
					`        const host = new SimpleExtensionsActivatorHost();`,
					`        activator = createActivator(host, [`,
					`            desc(idA)`,
					`        ]);`,
					``,
					`        await activator.activateByEvent('*', false);`,
					`        assert.deepStrictEqual(host.activateCalls, [idA]);`,
					``,
					`        await activator.activateByEvent('*', false);`,
					`        assert.deepStrictEqual(host.activateCalls, [idA]);`,
					`    });`,
					``,
					`    test('calls activate only once with parallel activations', async () => {`,
					`        const extActivation = new ExtensionActivationPromiseSource();`,
					`        const host = new PromiseExtensionsActivatorHost([`,
					`            [idA, extActivation]`,
					`        ]);`,
					`        activator = createActivator(host, [`,
					`            desc(idA, [], ['evt1', 'evt2'])`,
					`        ]);`,
					``,
					`        const activate1 = activator.activateByEvent('evt1', false);`,
					`        const activate2 = activator.activateByEvent('evt2', false);`,
					``,
					`        extActivation.resolve();`,
					``,
					`        await activate1;`,
					`        await activate2;`,
					``,
					`        assert.deepStrictEqual(host.activateCalls, [idA]);`,
					`    });`,
					``,
					`    // ...other tests updated similarly...`,
					``,
					`});`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					assert.equal(numRegexOccurrences(outcome.editedFile, /(?!const\s*)activator = createActivator/g), 9);
					assert.equal(numOccurrences(outcome.editedFile, 'activator.dispose();'), 1);
					assertNoElidedCodeComments(outcome.editedFile);
					validateConsistentIndentation(outcome.editedFile, false, outcome.annotations);
				}
			});
		});

		stest({ description: 'looping in short yaml file', language: 'yaml' }, (testingServiceCollection) => {
			const inputFile = fromFixture('codeMapper/product-build-linux.yml');
			return simulateCodeMapper(testingServiceCollection, {
				files: [inputFile],
				activeDocument: inputFile.fileName,
				selection: [363, 0, 387, 0],
				focusLocations: [],
				textBeforeCodeBlock: `I'll modify the snap building section to split it into two parts - preparation and building within the FOO container.`,
				codeBlock: [
					`    - script: |`,
					`        set -e`,
					`        npm run gulp "vscode-linux-$(VSCODE_ARCH)-prepare-snap"`,
					``,
					`        # Create a tarball of the snap content`,
					`        SNAP_ROOT="$(pwd)/.build/linux/snap/$(VSCODE_ARCH)"`,
					`        SNAP_TARBALL_PATH="$(pwd)/.build/linux/snap-tarball"`,
					`        mkdir -p "$SNAP_TARBALL_PATH"`,
					`        tar -czf "$SNAP_TARBALL_PATH/snap-$(VSCODE_ARCH).tar.gz" -C "$SNAP_ROOT" .`,
					`      displayName: Prepare snap package`,
					``,
					`    - task: 1ES.PublishPipelineArtifact@2`,
					`      displayName: "Publish snap tarball for container build"`,
					`      inputs:`,
					`        targetPath: .build/linux/snap-tarball`,
					`        artifact: snap-$(VSCODE_ARCH)`,
					``,
					`    - task: DownloadPipelineArtifact@2`,
					`      displayName: "Download snap tarball for container build"`,
					`      inputs:`,
					`        artifact: snap-$(VSCODE_ARCH)`,
					`        path: .build/linux/snap-tarball`,
					``,
					`    - script: |`,
					`        set -e`,
					``,
					`        # Define variables`,
					`        SNAP_ROOT="$(pwd)/.build/linux/snap/$(VSCODE_ARCH)"`,
					``,
					`        # Extract snap tarball content if it doesn't exist`,
					`        mkdir -p "$SNAP_ROOT"`,
					``,
					`        # Run build steps inside the FOO container`,
					`        sudo docker run \\`,
					`          --rm \\`,
					`          -v "$(pwd):/workspace" \\`,
					`          -e VSCODE_QUALITY \\`,
					`          -e VSCODE_ARCH \\`,
					`          FOO \\`,
					`          /bin/bash -c "cd /workspace && \\`,
					`            # Get snapcraft version`,
					`            snapcraft --version && \\`,
					``,
					`            # Make sure we get latest packages`,
					`            apt-get update && \\`,
					`            apt-get upgrade -y && \\`,
					`            apt-get install -y curl apt-transport-https ca-certificates && \\`,
					``,
					`            # Define variables`,
					`            SNAP_ROOT='/workspace/.build/linux/snap/\$VSCODE_ARCH' && \\`,
					``,
					`            # Unpack snap tarball artifact, in order to preserve file perms`,
					`            (cd /workspace/.build/linux && tar -xzf snap-tarball/snap-\$VSCODE_ARCH.tar.gz) && \\`,
					``,
					`            # Create snap package`,
					`            BUILD_VERSION=\$(date +%s) && \\`,
					`            SNAP_FILENAME=code-\$VSCODE_QUALITY-\$VSCODE_ARCH-\$BUILD_VERSION.snap && \\`,
					`            SNAP_PATH=\$SNAP_ROOT/\$SNAP_FILENAME && \\`,
					`            case \$VSCODE_ARCH in \\`,
					`              x64) SNAPCRAFT_TARGET_ARGS=\"\" ;; \\`,
					`              *) SNAPCRAFT_TARGET_ARGS=\"--target-arch \$VSCODE_ARCH\" ;; \\`,
					`            esac && \\`,
					`            (cd \$SNAP_ROOT/code-* && snapcraft snap \$SNAPCRAFT_TARGET_ARGS --output \"\$SNAP_PATH\") && \\`,
					``,
					`            # Fix permissions for files created inside container`,
					`            chown -R $(id -u):$(id -g) /workspace/.build/linux/snap"`,
					``,
					`        # Find the generated snap file`,
					`        SNAP_PATH=$(find .build/linux/snap/$(VSCODE_ARCH) -name "*.snap" | head -n 1)`,
					`        echo "##vso[task.setvariable variable=SNAP_PATH]$SNAP_PATH"`,
					``,
					`        # Save the directory path for SBOM generation`,
					`        SNAP_EXTRACTED_PATH=$(find .build/linux/snap/$(VSCODE_ARCH) -maxdepth 1 -type d -name 'code-*')`,
					`        echo "##vso[task.setvariable variable=SNAP_EXTRACTED_PATH]$SNAP_EXTRACTED_PATH"`,
					`      env:`,
					`        VSCODE_QUALITY: \${{ parameters.VSCODE_QUALITY }}`,
					`        VSCODE_ARCH: $(VSCODE_ARCH)`,
					`      displayName: Build snap package inside FOO container`,
				],
				validate: async (outcome, workspace, accessor) => {
					assert.ok(outcome.appliedEdits.length, 'has edits');
					const originalFileLineCount = outcome.originalFileContent.split('\n').length;
					const editedFileLineCount = outcome.editedFile.split('\n').length;
					assert.ok(editedFileLineCount >= originalFileLineCount, 'deleted code');
					assertNoElidedCodeComments(outcome.editedFile);
				}
			});
		});

	});

	function numOccurrences(str: string, substr: string): number {
		return str.split(substr).length - 1;
	}
	function numRegexOccurrences(str: string, regex: RegExp): number {
		const matches = str.match(regex);
		return matches ? matches.length : 0;
	}

	interface IOutcome {
		appliedEdits: TextEdit[];
		annotations: OutcomeAnnotation[];
		originalFileContent: string;
		editedFile: string;
	}

	interface ICodeMapperScenario {
		files: IFile[];
		activeDocument: string;
		selection: [number, number, number, number];
		focusLocations: [number, number, number, number][];
		textBeforeCodeBlock?: string;
		codeBlock: string[];
		validate: (outcome: IOutcome, workspace: SimulationWorkspace, accessor: ITestingServicesAccessor) => Promise<void>;
	}

	async function simulateCodeMapper(testingServiceCollection: TestingServiceCollection, scenario: ICodeMapperScenario): Promise<void> {
		const workspace = setupSimulationWorkspace(testingServiceCollection, { files: scenario.files });
		const accessor = testingServiceCollection.createTestingAccessor();
		const testRuntime = accessor.get(ISimulationTestRuntime);
		const states: IWorkspaceState[] = [];
		const source = new CancellationTokenSource();
		try {
			const document = workspace.getDocument(scenario.activeDocument).document;
			workspace.setCurrentDocument(document.uri);
			const selection = new Selection(...scenario.selection);
			workspace.setCurrentSelection(selection);

			const workspacePath = workspace.getFilePath(document.uri);
			states.push({
				kind: 'initial',
				file: {
					workspacePath,
					relativeDiskPath: await testRuntime.writeFile(workspacePath + '.txt', document.getText(), INLINE_INITIAL_DOC_TAG),
					languageId: document.languageId
				},
				additionalFiles: [],
				languageId: document.languageId,
				selection: toIRange(selection),
				range: toIRange(selection),
				diagnostics: [],
			});

			const editor = accessor.get(ITabsAndEditorsService).activeTextEditor!;
			const documentContext = IDocumentContext.fromEditor(editor);
			const codeMapper = accessor.get(IInstantiationService).createInstance(CodeMapper);

			const workingCopyDocument = new WorkingCopyOriginalDocument(document.getText());
			const response: MappedEditsResponseStream = {
				textEdit(target, edits) {
					if (isEqual(target, document.uri)) {
						edits = Array.isArray(edits) ? edits : [edits];
						workspace.applyEdits(document.uri, edits);
						const offsetEdits = workingCopyDocument.transformer.toOffsetEdit(edits);
						workingCopyDocument.applyOffsetEdits(offsetEdits);
					} else {
						throw new Error('Unexpected target: ' + target);
					}
				},
				notebookEdit(target, edits) {
					edits = Array.isArray(edits) ? edits : [edits];
					workspace.applyNotebookEdits(target, edits);
				},
			};

			const codeMap = scenario.codeBlock.join('\n');
			const input: ICodeMapperExistingDocument = { createNew: false, codeBlock: codeMap, uri: document.uri, markdownBeforeBlock: scenario.textBeforeCodeBlock, existingDocument: documentContext.document };
			const originalFileContent = document.getText();
			const result = await codeMapper.mapCode(input, response, undefined, source.token);
			if (!result) {
				return; // cacnelled
			}


			testRuntime.setOutcome({
				kind: 'edit',
				files: [{ srcUri: workspacePath, post: workspacePath }],
				annotations: result.annotations
			});

			states.push({
				kind: 'interaction',
				changedFiles: [{
					workspacePath,
					relativeDiskPath: await testRuntime.writeFile(workspacePath, document.getText(), INLINE_CHANGED_DOC_TAG),
					languageId: document.languageId
				}],
				annotations: result.annotations,
				fileName: workspace.getFilePath(editor.document.uri),
				languageId: document.languageId,
				diagnostics: {},
				selection: toIRange(editor.selection),
				range: toIRange(editor.selection),
				interaction: {
					query: '',
					actualIntent: Intent.Unknown,
					detectedIntent: undefined,
				},
				requestCount: 0
			});

			const appliedEdits = workingCopyDocument.transformer.toTextEdits(workingCopyDocument.appliedEdits);

			await scenario.validate({
				appliedEdits,
				annotations: result.annotations,
				originalFileContent,
				editedFile: document.getText(),
			}, workspace, accessor);
		} finally {
			source.dispose();
			await teardownSimulationWorkspace(accessor, workspace);
			await testRuntime.writeFile('inline-simulator.txt', JSON.stringify(states, undefined, 2), INLINE_STATE_TAG);

		}
	}
});
