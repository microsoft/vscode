/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { BreadcrumbsControl } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { BreadcrumbsService, IBreadcrumbsService } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { OperatingSystem } from 'vs/base/common/platform';

suite('Breadcrumbs Control', function () {

	function givenBreadcrumbsControl() {
		const instantiationService = new TestInstantiationService();
		const configService = new TestConfigurationService();
		const themeService = new TestThemeService();
		const contextKeyService = new MockContextKeyService();
		const breadcrumbsService = new BreadcrumbsService();

		instantiationService.stub(IConfigurationService, configService);
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IBreadcrumbsService, breadcrumbsService);

		const container = document.createElement('div');
		return instantiationService.createInstance(BreadcrumbsControl, container, { showFileIcons: false, showSymbolIcons: true, showDecorationColors: false, breadcrumbsBackground: '#FFFFFF', showPlaceholder: false }, 1);
	}
	suite('_getOverrideBreadcrumbSeparatorText', function () {
		test('should return specific text if given _overrideSeparatorText', function (done) {
			const control = givenBreadcrumbsControl();
			control._overrideSeparatorText.getValue = () => ('|||');
			const actual = control._getOverrideBreadcrumbSeparatorText();
			actual.then((val: string | undefined) => {
				assert(val === '|||');
			}).catch((err: Error) => {
				done(err);
			});

		});
		test('should return specific text if no overrideText is set and _breadcrumbSeparatorSuggest is os', function (done) {
			const control = givenBreadcrumbsControl();
			control._overrideSeparatorText.getValue = () => ('|||');
			control._breadcrumbSeparatorSuggest.getValue = function () {
				return 'os';
			};
			const actual = control._getOverrideBreadcrumbSeparatorText();
			actual.then((val: string | undefined) => {
				assert(val === '|||');
				done();
			}).catch((err: Error) => {
				done(err);
			});
		});

		test('should return undefined if no overrideText and _breadcrumbSeparatorSuggest is default', function (done) {
			const control = givenBreadcrumbsControl();
			control._breadcrumbSeparatorSuggest.getValue = function () {
				return 'default';
			};
			const actual = control._getOverrideBreadcrumbSeparatorText();
			actual.then((val: string | undefined) => {
				assert(val === undefined);
				done();
			}).catch((err: Error) => {
				done(err);
			});
		});

		test('should return os specific if _breadcrumbSeparatorSuggest is os', function (done) {
			const control = givenBreadcrumbsControl();
			control._breadcrumbSeparatorSuggest.getValue = function () {
				return 'os';
			};
			Promise.all([control._getOverrideBreadcrumbSeparatorText(OperatingSystem.Linux), control._getOverrideBreadcrumbSeparatorText(OperatingSystem.Macintosh), control._getOverrideBreadcrumbSeparatorText(OperatingSystem.Windows)]).then(val => {
				assert(val[0] === '/');
				assert(val[1] === '/');
				assert(val[2] === '\\');
				done();
			}).catch((err: Error) => {
				done(err);
			});
		});

	});
});
