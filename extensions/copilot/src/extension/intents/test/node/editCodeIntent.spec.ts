/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { describe, expect, it } from 'vitest';
import { PromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { URI } from '../../../../util/vs/base/common/uri';
import { CodeBlock } from '../../../prompt/common/conversation';
import { MockChatResponseStream } from '../../../test/node/testHelpers';
import { getCodeBlocksFromResponse } from '../../node/editCodeIntent';

async function getCodeblocks(input: string[], outputStream: MockChatResponseStream, remoteName?: string) {
	const textStream = async function* () {
		for (const item of input) {
			yield item;
		}
	}();

	function createUriFromResponsePath(path: string): URI | undefined {
		return new PromptPathRepresentationService(new TestWorkspaceService()).resolveFilePath(path);
	}

	const result: CodeBlock[] = [];
	const codeBlocks = getCodeBlocksFromResponse(textStream, outputStream, createUriFromResponsePath, remoteName);
	for await (const codeBlock of codeBlocks) {
		result.push(codeBlock);
	}
	return result;
}

describe('getCodeBlocksFromResponse', () => {
	it('should process code blocks with valid URIs', async () => {
		const input = [
			'### /valid/path\n',
			'\n',
			'lets do the following change\n',
			'```typescript\n',
			'// filepath: /valid/path\n',
			'const x = 1;\n',
			'```\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(1);
		expect(result[0].resource?.toString()).toBe('file:///valid/path');
		expect(result[0].language).toBe('typescript');
		expect(result[0].code).toBe([
			'const x = 1;\n'
		].join(''));
		expect(outputStream.output.join('')).toBe([
			'### [path](file:///valid/path)\n',
			'\n',
			'lets do the following change\n',
			'```typescript\n',
			'const x = 1;\n',
			'```\n',
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///valid/path'
		]);
	});

	it('should process code blocks without URIs', async () => {
		const input = [
			'### /valid/path\n',
			'\n',
			'run a command\n',
			'```sh\n',
			'npm install minify\n',
			'```\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(1);
		expect(result[0].resource).toBe(undefined);
		expect(result[0].language).toBe('sh');
		expect(result[0].code).toBe([
			'npm install minify\n'
		].join(''));
		expect(outputStream.output.join('')).toBe([
			'### [path](file:///valid/path)\n',
			'\n',
			'run a command\n',
			'```sh\n',
			'npm install minify\n',
			'```\n',
		].join(''));
		expect(outputStream.uris).toEqual([
		]);
	});

	it('should not linkify non-filepath headers (#11079)', async () => {
		const input = [
			'### change summary\n',
			'\n',
			'1. Create a new file.\n',
			'\n',
			'### untitled:Untitled-1\n',
			'\n',
			'```python\n',
			'# filepath: untitled:Untitled-1\n',
			`print('Hello, World!')\n`,
			'```\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(1);
		expect(result[0].resource?.toString()).toBe('untitled:Untitled-1');
		expect(result[0].code).toBe([
			`print('Hello, World!')\n`,
		].join(''));
		expect(outputStream.output.join('')).toBe([
			'### change summary\n',
			'\n',
			'1. Create a new file.\n',
			'\n',
			'### [Untitled-1](untitled:Untitled-1)\n',
			'\n',
			'```python\n',
			`print('Hello, World!')\n`,
			'```\n',
		].join(''));
		expect(outputStream.uris).toEqual([
			'untitled:Untitled-1'
		]);
	});

	it('should not linkify other headers', async () => {
		const input = [
			'# /a/b\n',
			'\n',
			'### /a/b\n',
			'\n',
			'#### /a/b\n',
			'\n',
			'```python\n',
			'# filepath: /a/b\n',
			`print('Hello, World!')\n`,
			'```\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(1);
		expect(result[0].resource?.toString()).toBe('file:///a/b');
		expect(result[0].code).toBe([
			`print('Hello, World!')\n`,
		].join(''));
		expect(outputStream.output.join('')).toBe([
			'# /a/b\n',
			'\n',
			'### [b](file:///a/b)\n',
			'\n',
			'#### /a/b\n',
			'\n',
			'```python\n',
			`print('Hello, World!')\n`,
			'```\n',
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///a/b'
		]);
	});

	it('using 4 backticks (#11112)', async () => {
		const input = [
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### /Users/jospicer/dev/BunnyBunch/dog.txt\n',
			'\n',
			'Create a new file with some placeholder content.\n',
			'\n',
			'````plaintext\n',
			'// filepath: /Users/jospicer/dev/BunnyBunch/dog.txt\n',
			'This is a placeholder text for the dog.txt file.\n',
			'````\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(1);
		expect(result[0].resource?.toString()).toBe('file:///Users/jospicer/dev/BunnyBunch/dog.txt');
		expect(result[0].code).toBe([
			'This is a placeholder text for the dog.txt file.\n'
		].join(''));
		expect(outputStream.output.join('')).toBe([
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### [dog.txt](file:///Users/jospicer/dev/BunnyBunch/dog.txt)\n',
			'\n',
			'Create a new file with some placeholder content.\n',
			'\n',
			'````plaintext\n',
			'This is a placeholder text for the dog.txt file.\n',
			'````\n',
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///Users/jospicer/dev/BunnyBunch/dog.txt'
		]);
	});

	it('multi code block', async () => {
		const input = [
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift\n',
			'\n',
			'Add unit selection support and conversion methods to WaterStore.\n',
			'\n',
			'```swift\n',
			'// filepath: /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift\n',
			'import Foundation\n',
			'import SwiftUI\n',
			'```\n',
			'### /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift\n',
			'\n',
			'Create a new settings view for unit selection.\n',
			'\n',
			'```swift\n',
			'// filepath: /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift\n',
			'import SwiftUI\n',
			'```\n',
			'\n'
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(2);
		expect(result[0].resource?.toString()).toBe('file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift');
		expect(result[0].code).toBe([
			'import Foundation\n',
			'import SwiftUI\n',
		].join(''));
		expect(result[0].language).toBe('swift');
		expect(result[1].resource?.toString()).toBe('file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift');
		expect(result[1].code).toBe([
			'import SwiftUI\n',
		].join(''));
		expect(result[1].language).toBe('swift');

		expect(outputStream.output.join('')).toBe([
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### [WaterStore.swift](file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift)\n',
			'\n',
			'Add unit selection support and conversion methods to WaterStore.\n',
			'\n',
			'```swift\n',
			'import Foundation\n',
			'import SwiftUI\n',
			'```\n',

			'### [SettingsView.swift](file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift)\n',
			'\n',
			'Create a new settings view for unit selection.\n',
			'\n',
			'```swift\n',
			'import SwiftUI\n',
			'```\n',
			'\n'
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift',
			'file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift'
		]);
	});


	it('multi code block (#11034)', async () => {
		const input = [
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift\n',
			'\n',
			'Add unit selection support and conversion methods to WaterStore.\n',
			'\n',
			'```swift\n',
			'// filepath: /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift\n',
			'import Foundation\n',
			'import SwiftUI\n',
			'```\n',
			'### /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift\n',
			'\n',
			'Create a new settings view for unit selection.\n',
			'\n',
			'```swift\n',
			'// filepath: /home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift\n',
			'import SwiftUI\n',
			'```\n',
			'\n'
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(2);
		expect(result[0].resource?.toString()).toBe('file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift');
		expect(result[0].code).toBe([
			'import Foundation\n',
			'import SwiftUI\n',
		].join(''));
		expect(result[0].language).toBe('swift');
		expect(result[1].resource?.toString()).toBe('file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift');
		expect(result[1].code).toBe([
			'import SwiftUI\n',
		].join(''));
		expect(result[1].language).toBe('swift');
		expect(outputStream.output.join('')).toBe([
			'Sure, let\'s create a new file named `dog.txt` in the specified folder.\n',
			'\n',
			'### [WaterStore.swift](file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift)\n',
			'\n',
			'Add unit selection support and conversion methods to WaterStore.\n',
			'\n',
			'```swift\n',
			'import Foundation\n',
			'import SwiftUI\n',
			'```\n',

			'### [SettingsView.swift](file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift)\n',
			'\n',
			'Create a new settings view for unit selection.\n',
			'\n',
			'```swift\n',
			'import SwiftUI\n',
			'```\n',
			'\n'
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/WaterStore.swift',
			'file:///home/martin/workspaces/testing/water-tracker-ios/WaterTracker/SettingsView.swift'
		]);
	});

	it('should process code blocks from vscode-copilot-release#3983', async () => {
		const input = [
			`I'll help you split the Counter component and create a new CounterButton component. Here's the solution:\n`,
			'\n',
			'1. Create a new CounterButton component\n',
			'2. Move the button markup and click handler to the new component\n',
			'3. Modify the Counter component to use CounterButton\n',
			'\n',
			'### /workspaces/vscode-remote-try-dotnet/Components/Pages/Counter.razor\n',
			'\n',
			'Simplify the Counter component by removing the button markup and using the new CounterButton component.\n',
			'\n',
			'```razor\n',
			'// filepath: /workspaces/vscode-remote-try-dotnet/Components/Pages/Counter.razor\n',
			'@page "/counter"\n',
			'@rendermode InteractiveServer\n',
			'\n',
			'<PageTitle>Counter</PageTitle>\n',
			'\n',
			'<h1>Counter</h1>\n',
			'\n',
			'<p role="status">Current count: @currentCount</p>\n',
			'\n',
			'<CounterButton OnClick="IncrementCount" />\n',
			'\n',
			'@code {\n',
			'    private int currentCount = 0;\n',
			'\n',
			'    private void IncrementCount()\n',
			'    {\n',
			'        currentCount++;\n',
			'    }\n',
			'}\n',
			'```\n',
			'\n',
			'### /workspaces/vscode-remote-try-dotnet/Components/CounterButton.razor\n',
			'\n',
			'Create a new component for the button with an event callback.\n',
			'\n',
			'```razor\n',
			'// filepath: /workspaces/vscode-remote-try-dotnet/Components/CounterButton.razor\n',
			'@rendermode InteractiveServer\n',
			'\n',
			'<button class="btn btn-primary" @onclick="OnClick">Click me</button>\n',
			'\n',
			'@code {\n',
			'    [Parameter]\n',
			'    public EventCallback OnClick { get; set; }\n',
			'}\n',
			'```\n',
		];
		const outputStream = new MockChatResponseStream();
		const result = await getCodeblocks(input, outputStream);

		expect(result.length).toBe(2);
		expect(result[0].resource?.toString()).toBe('file:///workspaces/vscode-remote-try-dotnet/Components/Pages/Counter.razor');
		expect(result[0].language).toBe('razor');
		expect(result[0].code).toBe([
			'@page "/counter"\n',
			'@rendermode InteractiveServer\n',
			'\n',
			'<PageTitle>Counter</PageTitle>\n',
			'\n',
			'<h1>Counter</h1>\n',
			'\n',
			'<p role="status">Current count: @currentCount</p>\n',
			'\n',
			'<CounterButton OnClick="IncrementCount" />\n',
			'\n',
			'@code {\n',
			'    private int currentCount = 0;\n',
			'\n',
			'    private void IncrementCount()\n',
			'    {\n',
			'        currentCount++;\n',
			'    }\n',
			'}\n'
		].join(''));
		expect(result[1].resource?.toString()).toBe('file:///workspaces/vscode-remote-try-dotnet/Components/CounterButton.razor');
		expect(result[1].language).toBe('razor');
		expect(result[1].code).toBe([
			'@rendermode InteractiveServer\n',
			'\n',
			'<button class="btn btn-primary" @onclick="OnClick">Click me</button>\n',
			'\n',
			'@code {\n',
			'    [Parameter]\n',
			'    public EventCallback OnClick { get; set; }\n',
			'}\n'
		].join(''));
		expect(outputStream.output.join('')).toBe([
			`I'll help you split the Counter component and create a new CounterButton component. Here's the solution:\n`,
			'\n',
			'1. Create a new CounterButton component\n',
			'2. Move the button markup and click handler to the new component\n',
			'3. Modify the Counter component to use CounterButton\n',
			'\n',
			'### [Counter.razor](file:///workspaces/vscode-remote-try-dotnet/Components/Pages/Counter.razor)\n',
			'\n',
			'Simplify the Counter component by removing the button markup and using the new CounterButton component.\n',
			'\n',
			'```razor\n',
			'@page "/counter"\n',
			'@rendermode InteractiveServer\n',
			'\n',
			'<PageTitle>Counter</PageTitle>\n',
			'\n',
			'<h1>Counter</h1>\n',
			'\n',
			'<p role="status">Current count: @currentCount</p>\n',
			'\n',
			'<CounterButton OnClick="IncrementCount" />\n',
			'\n',
			'@code {\n',
			'    private int currentCount = 0;\n',
			'\n',
			'    private void IncrementCount()\n',
			'    {\n',
			'        currentCount++;\n',
			'    }\n',
			'}\n',
			'```\n',
			'\n',
			'### [CounterButton.razor](file:///workspaces/vscode-remote-try-dotnet/Components/CounterButton.razor)\n',
			'\n',
			'Create a new component for the button with an event callback.\n',
			'\n',
			'```razor\n',
			'@rendermode InteractiveServer\n',
			'\n',
			'<button class="btn btn-primary" @onclick="OnClick">Click me</button>\n',
			'\n',
			'@code {\n',
			'    [Parameter]\n',
			'    public EventCallback OnClick { get; set; }\n',
			'}\n',
			'```\n'
		].join(''));
		expect(outputStream.uris).toEqual([
			'file:///workspaces/vscode-remote-try-dotnet/Components/Pages/Counter.razor',
			'file:///workspaces/vscode-remote-try-dotnet/Components/CounterButton.razor'
		]);
	});
});
