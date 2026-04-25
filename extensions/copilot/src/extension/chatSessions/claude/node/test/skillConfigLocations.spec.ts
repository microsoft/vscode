/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { SKILLS_LOCATION_KEY } from '../../../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { resolveSkillConfigLocations } from '../../../common/skillConfigLocations';

function createWorkspaceService(folders: URI[] = [URI.file('/workspace')]): IWorkspaceService {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkspaceFolders: Event.None,
		getWorkspaceFolders: () => folders,
	} as unknown as IWorkspaceService;
}

describe('resolveSkillConfigLocations', () => {
	const disposables = new DisposableStore();
	let baseConfigurationService: IConfigurationService;

	beforeEach(() => {
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		baseConfigurationService = accessor.get(IConfigurationService);
	});

	afterEach(() => {
		disposables.clear();
	});

	function resolve(options?: {
		configLocations?: Record<string, boolean>;
		workspaceFolders?: URI[];
		userHome?: URI;
	}): URI[] {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		if (options?.configLocations) {
			configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, options.configLocations);
		}

		const envService: INativeEnvService = options?.userHome
			? new class extends NullNativeEnvService { override get userHome() { return options.userHome!; } }()
			: new NullNativeEnvService();

		const workspaceService = createWorkspaceService(options?.workspaceFolders);

		return resolveSkillConfigLocations(configService, envService, workspaceService);
	}

	it('returns empty array when no config is set', () => {
		expect(resolve()).toEqual([]);
	});

	it('returns empty array when config is not an object', () => {
		const configService = new InMemoryConfigurationService(baseConfigurationService);
		configService.setNonExtensionConfig(SKILLS_LOCATION_KEY, 'not-an-object');
		const result = resolveSkillConfigLocations(
			configService,
			new NullNativeEnvService(),
			createWorkspaceService(),
		);
		expect(result).toEqual([]);
	});

	it('expands tilde-prefixed paths using user home directory', () => {
		const result = resolve({
			configLocations: { '~/my-skills': true },
			userHome: URI.file('/home/user'),
		});
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/home/user/my-skills');
	});

	it('handles absolute paths', () => {
		const result = resolve({
			configLocations: { '/absolute/skills/path': true },
		});
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/absolute/skills/path');
	});

	it('joins relative paths to each workspace folder', () => {
		const result = resolve({
			configLocations: { 'relative/skills': true },
			workspaceFolders: [URI.file('/workspace1'), URI.file('/workspace2')],
		});
		expect(result).toHaveLength(2);
		expect(result[0].path).toBe('/workspace1/relative/skills');
		expect(result[1].path).toBe('/workspace2/relative/skills');
	});

	it('ignores config entries with value !== true', () => {
		const result = resolve({
			configLocations: {
				'/included': true,
				'/excluded': false,
			},
		});
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/included');
	});

	it('handles mixed path types', () => {
		const result = resolve({
			configLocations: {
				'~/home-skills': true,
				'/absolute-skills': true,
				'relative-skills': true,
			},
			userHome: URI.file('/home/user'),
			workspaceFolders: [URI.file('/workspace')],
		});
		expect(result).toHaveLength(3);
		expect(result[0].path).toBe('/home/user/home-skills');
		expect(result[1].path).toBe('/absolute-skills');
		expect(result[2].path).toBe('/workspace/relative-skills');
	});

	it('trims whitespace from location keys', () => {
		const result = resolve({
			configLocations: { '  /trimmed  ': true },
		});
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe('/trimmed');
	});
});
