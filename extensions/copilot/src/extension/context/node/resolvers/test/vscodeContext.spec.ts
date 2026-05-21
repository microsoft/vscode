/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { IWorkbenchService } from '../../../../../platform/workbench/common/workbenchService';
import { parseSettingsAndCommands } from '../vscodeContext';

// Mock implementation of IWorkbenchService for testing
class MockWorkbenchService implements IWorkbenchService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private mockSettings: { [key: string]: any } = {},
		private mockCommands: { label: string; command: string; keybinding: string }[] = []
	) { }

	getAllExtensions(): readonly any[] {
		return [];
	}

	async getAllCommands(): Promise<{ label: string; command: string; keybinding: string }[]> {
		return this.mockCommands;
	}

	async getAllSettings(): Promise<{ [key: string]: any }> {
		return this.mockSettings;
	}
}

describe('parseSettingsAndCommands', () => {
	it('returns empty array for non-JSON code blocks', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = '```typescript\nconsole.log("hello");\n```';
		const result = await parseSettingsAndCommands(mockService, codeBlock);
		expect(result).toEqual([]);
	});

	it('returns empty array for invalid JSON', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = '```json\n{ invalid json\n```';
		const result = await parseSettingsAndCommands(mockService, codeBlock);
		expect(result).toEqual([]);
	});

	it('returns empty array for empty parsed array', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = '```json\n[]\n```';
		const result = await parseSettingsAndCommands(mockService, codeBlock);
		expect(result).toEqual([]);
	});

	it('handles trailing commas in JSON', async () => {
		const mockService = new MockWorkbenchService({
			'editor.fontSize': { value: 14 }
		});
		const codeBlock = `\`\`\`json
[
  {
    "type": "setting",
    "details": {
      "key": "editor.fontSize",
    }
  },
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);
		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.action.openSettings');
		expect(result[0].commandToRun?.arguments).toEqual(['@id:editor.fontSize ']);
	});

	it('processes settings and creates openSettings command', async () => {
		const mockService = new MockWorkbenchService({
			'editor.fontSize': { value: 14 },
			'workbench.colorTheme': { value: 'Dark+' }
		});
		const codeBlock = `\`\`\`json
[
  {
    "type": "setting",
    "details": {
      "key": "editor.fontSize"
    }
  },
  {
    "type": "setting",
    "details": {
      "key": "workbench.colorTheme"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.action.openSettings');
		expect(result[0].commandToRun?.arguments).toEqual(['@id:editor.fontSize @id:workbench.colorTheme ']);
		expect(result[0].commandToRun?.title).toBe('Show in Settings Editor');
	});

	it('filters out unknown settings', async () => {
		const mockService = new MockWorkbenchService({
			'editor.fontSize': { value: 14 }
			// 'unknown.setting' is intentionally not included
		});
		const codeBlock = `\`\`\`json
[
  {
    "type": "setting",
    "details": {
      "key": "editor.fontSize"
    }
  },
  {
    "type": "setting",
    "details": {
      "key": "unknown.setting"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.arguments).toEqual(['@id:editor.fontSize ']);
	});

	it('returns empty quickOpen for unknown command', async () => {
		const mockService = new MockWorkbenchService({}, [
			{ label: 'Show All Commands', command: 'workbench.action.showCommands', keybinding: 'Ctrl+Shift+P' }
		]);
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "unknown.command"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);
		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.action.quickOpen');
		expect(result[0].commandToRun?.arguments).toEqual(['>']);
		expect(result[0].commandToRun?.title).toBe('Open Command Palette');
	});

	it('processes extension search command', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.extensions.search",
      "value": "python"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.extensions.search');
		expect(result[0].commandToRun?.arguments).toEqual(['python']);
		expect(result[0].commandToRun?.title).toBe('Search Extension Marketplace');
	});

	it('processes extension install command', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.extensions.installExtension",
      "value": ["ms-python.python"]
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.extensions.search');
		expect(result[0].commandToRun?.arguments).toEqual(['ms-python.python']);
		expect(result[0].commandToRun?.title).toBe('Search Extension Marketplace');
	});

	it('handles extension search with known queries', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.extensions.search",
      "value": "popular"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.arguments).toEqual(['@popular']);
	});

	it('handles extension search with tag', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.extensions.search",
      "value": "category:themes"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.arguments).toEqual(['@category:themes']);
	});

	it('processes general command with quickOpen', async () => {
		const mockService = new MockWorkbenchService({}, [
			{ label: 'Show All Commands', command: 'workbench.action.showCommands', keybinding: 'Ctrl+Shift+P' }
		]);
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.action.showCommands"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.action.quickOpen');
		expect(result[0].commandToRun?.arguments).toEqual(['>Show All Commands']);
		expect(result[0].commandToRun?.title).toBe('Show in Command Palette');
	});

	it('handles code block without language specified', async () => {
		const mockService = new MockWorkbenchService({
			'editor.fontSize': { value: 14 }
		});
		const codeBlock = `\`\`\`
[
  {
    "type": "setting",
    "details": {
      "key": "editor.fontSize"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.command).toBe('workbench.action.openSettings');
	});

	it('handles items without details property', async () => {
		const mockService = new MockWorkbenchService({
			'editor.fontSize': { value: 14 }
		});
		const codeBlock = `\`\`\`json
[
  {
    "type": "setting"
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.arguments).toEqual(['']);
	});

	it('handles non-string extension arguments', async () => {
		const mockService = new MockWorkbenchService();
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "workbench.extensions.search",
      "value": [123, "python", null]
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		// Should filter out non-string values
		expect(result[0].commandToRun?.arguments).toEqual(['python']);
	});

	it('handles command with empty label', async () => {
		const mockService = new MockWorkbenchService({}, [
			{ label: '', command: 'test.command', keybinding: 'Ctrl+T' }
		]);
		const codeBlock = `\`\`\`json
[
  {
    "type": "command",
    "details": {
      "key": "test.command"
    }
  }
]
\`\`\``;

		const result = await parseSettingsAndCommands(mockService, codeBlock);

		expect(result).toHaveLength(1);
		expect(result[0].commandToRun?.arguments).toEqual(['>']);
		expect(result[0].commandToRun?.title).toBe('Show in Command Palette');
	});
});
