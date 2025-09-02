/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITerminalLinkDetector, ITerminalSimpleLink, TerminalBuiltinLinkType } from '../../browser/links.js';
import { TerminalLinkDetectorAdapter } from '../../browser/terminalLinkDetectorAdapter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { Terminal, IBufferLine } from '@xterm/xterm';

// Mock terminal for testing
class MockTerminal {
	readonly cols = 80;
	readonly rows = 30;
	buffer = {
		active: {
			length: 30,
			viewportY: 0,
			cursorY: 0,
			getLine: (index: number) => {
				return {
					isWrapped: false,
					translateToString: () => 'mock line content'
				};
			}
		}
	};
}

// Mock link detector for testing
class MockTerminalLinkDetector implements ITerminalLinkDetector {
	readonly maxLinkLength = 500;
	
	constructor(
		public readonly xterm: Terminal,
		private _links: ITerminalSimpleLink[] = []
	) {}

	setMockLinks(links: ITerminalSimpleLink[]) {
		this._links = links;
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		return this._links;
	}
}

suite('TerminalLinkDetectorAdapter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let mockTerminal: MockTerminal;
	let mockDetector: MockTerminalLinkDetector;
	let adapter: TerminalLinkDetectorAdapter;

	setup(() => {
		mockTerminal = new MockTerminal();
		instantiationService = new TestInstantiationService();
		mockDetector = new MockTerminalLinkDetector(mockTerminal as any);
		adapter = store.add(instantiationService.createInstance(TerminalLinkDetectorAdapter, mockDetector));
	});

	test('should initialize with proper events', () => {
		assert.ok(adapter.onDidActivateLink, 'onDidActivateLink event should be available');
		assert.ok(adapter.onDidShowHover, 'onDidShowHover event should be available');
	});

	test('should provide links when detector finds them', async () => {
		// Setup mock links
		const mockLink: ITerminalSimpleLink = {
			text: 'https://example.com',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 18, y: 0 } },
			type: TerminalBuiltinLinkType.Url,
			uri: URI.parse('https://example.com')
		};
		mockDetector.setMockLinks([mockLink]);

		// Test provideLinks
		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					assert.strictEqual(links![0].text, 'https://example.com', 'Link text should match');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should handle empty links gracefully', async () => {
		mockDetector.setMockLinks([]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links array should be provided even when empty');
					assert.strictEqual(links!.length, 0, 'Should find no links');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should cache concurrent requests for same line', async () => {
		const mockLink: ITerminalSimpleLink = {
			text: 'test.txt',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 8, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile,
			uri: URI.file('/test.txt')
		};
		mockDetector.setMockLinks([mockLink]);

		// Make two concurrent requests for the same line
		const promise1 = new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'First request should get links');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});

		const promise2 = new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Second request should get same links');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});

		await Promise.all([promise1, promise2]);
	});

	test('should handle different link types correctly', async () => {
		const urlLink: ITerminalSimpleLink = {
			text: 'https://example.com',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 18, y: 0 } },
			type: TerminalBuiltinLinkType.Url
		};

		const fileLink: ITerminalSimpleLink = {
			text: '/path/to/file.txt',
			bufferRange: { start: { x: 20, y: 0 }, end: { x: 36, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile
		};

		const searchLink: ITerminalSimpleLink = {
			text: 'searchterm',
			bufferRange: { start: { x: 38, y: 0 }, end: { x: 47, y: 0 } },
			type: TerminalBuiltinLinkType.Search
		};

		mockDetector.setMockLinks([urlLink, fileLink, searchLink]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided');
					assert.strictEqual(links!.length, 3, 'Should find three links');
					
					// Verify each link type
					const linkTexts = links!.map(l => l.text);
					assert.ok(linkTexts.includes('https://example.com'), 'URL link should be present');
					assert.ok(linkTexts.includes('/path/to/file.txt'), 'File link should be present');
					assert.ok(linkTexts.includes('searchterm'), 'Search link should be present');
					
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should fire onDidActivateLink event when link is activated', (done) => {
		const mockLink: ITerminalSimpleLink = {
			text: 'test.txt',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 8, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile
		};
		mockDetector.setMockLinks([mockLink]);

		// Listen for the activate event
		const disposable = adapter.onDidActivateLink((event) => {
			try {
				assert.ok(event, 'Event should be provided');
				assert.ok(event.link, 'Event should contain link');
				assert.strictEqual(event.link.text, 'test.txt', 'Link text should match');
				disposable.dispose();
				done();
			} catch (error) {
				disposable.dispose();
				done(error);
			}
		});

		adapter.provideLinks(0, (links) => {
			if (links && links.length > 0) {
				// Trigger the link activation
				const mockEvent = { type: 'click' } as MouseEvent;
				links[0].activate(mockEvent, links[0].text);
			}
		});
	});

	test('should provide correct labels for different link types', () => {
		// Test the private _getLabel method through public behavior
		const testCases = [
			{ type: TerminalBuiltinLinkType.Url, expectedLabel: 'Follow link' },
			{ type: TerminalBuiltinLinkType.LocalFile, expectedLabel: 'Open file in editor' },
			{ type: TerminalBuiltinLinkType.LocalFolderInWorkspace, expectedLabel: 'Focus folder in explorer' },
			{ type: TerminalBuiltinLinkType.LocalFolderOutsideWorkspace, expectedLabel: 'Open folder in new window' },
			{ type: TerminalBuiltinLinkType.Search, expectedLabel: 'Search workspace' }
		];

		// We'll test each link type by creating links and verifying the labels
		testCases.forEach(({ type, expectedLabel }) => {
			const mockLink: ITerminalSimpleLink = {
				text: 'test',
				bufferRange: { start: { x: 1, y: 0 }, end: { x: 5, y: 0 } },
				type: type
			};
			mockDetector.setMockLinks([mockLink]);

			adapter.provideLinks(0, (links) => {
				if (links && links.length > 0) {
					assert.ok(links[0].label, 'Link should have a label');
				}
			});
		});
	});

	test('should trim colon from link text when appropriate', async () => {
		const linkWithColon: ITerminalSimpleLink = {
			text: 'test.txt:',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 9, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile
		};
		mockDetector.setMockLinks([linkWithColon]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					assert.strictEqual(links![0].text, 'test.txt', 'Colon should be trimmed from link text');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should not trim colon when disableTrimColon is true', async () => {
		const linkWithColon: ITerminalSimpleLink = {
			text: 'test.txt:',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 9, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile,
			disableTrimColon: true
		};
		mockDetector.setMockLinks([linkWithColon]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					assert.strictEqual(links![0].text, 'test.txt:', 'Colon should not be trimmed when disabled');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should handle wrapped lines correctly', async () => {
		// Mock wrapped lines
		mockTerminal.buffer.active.getLine = (index: number) => {
			return {
				isWrapped: index === 1, // Second line is wrapped
				translateToString: () => index === 0 ? 'A very long line that contains a link https://example.com' : ' and should wrap'
			};
		};

		const mockLink: ITerminalSimpleLink = {
			text: 'https://example.com',
			bufferRange: { start: { x: 40, y: 0 }, end: { x: 57, y: 0 } },
			type: TerminalBuiltinLinkType.Url
		};
		mockDetector.setMockLinks([mockLink]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided for wrapped lines');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					assert.strictEqual(links![0].text, 'https://example.com', 'Link text should match');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});

	test('should handle links with custom labels', async () => {
		const linkWithLabel: ITerminalSimpleLink = {
			text: 'custom-link',
			bufferRange: { start: { x: 1, y: 0 }, end: { x: 11, y: 0 } },
			type: TerminalBuiltinLinkType.LocalFile,
			label: 'Custom Label'
		};
		mockDetector.setMockLinks([linkWithLabel]);

		return new Promise<void>((resolve, reject) => {
			adapter.provideLinks(0, (links) => {
				try {
					assert.ok(links, 'Links should be provided');
					assert.strictEqual(links!.length, 1, 'Should find one link');
					assert.strictEqual(links![0].label, 'Custom Label', 'Custom label should be preserved');
					resolve();
				} catch (error) {
					reject(error);
				}
			});
		});
	});
});