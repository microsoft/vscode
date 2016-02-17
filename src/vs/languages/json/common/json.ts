/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import URI from 'vs/base/common/uri';
import WinJS = require('vs/base/common/winjs.base');
import Platform = require('vs/platform/platform');
import nls = require('vs/nls');
import jsonWorker = require('vs/languages/json/common/jsonWorker');
import tokenization = require('vs/languages/json/common/features/tokenization');
import {AbstractMode, createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IThreadService, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {IJSONContributionRegistry, Extensions, ISchemaContributions} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';

export class JSONMode extends AbstractMode<jsonWorker.JSONWorker> implements Modes.IExtraInfoSupport, Modes.IOutlineSupport, IThreadSynchronizableObject<ISchemaContributions> {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;

	public extraInfoSupport: Modes.IExtraInfoSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public formattingSupport: Modes.IFormattingSupport;

	public suggestSupport: Modes.ISuggestSupport;

	public outlineGroupLabel : { [name: string]: string; };

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, threadService);

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, true);

		this.richEditSupport = new RichEditSupport(this.getId(), {

			wordPattern: createWordRegExp('.-'),

			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']']
			],

			__electricCharacterSupport: {
				brackets: [
					{ tokenType:'delimiter.bracket.json', open: '{', close: '}', isElectric: true },
					{ tokenType:'delimiter.array.json', open: '[', close: ']', isElectric: true }
				]
			},

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}', notIn: ['string'] },
					{ open: '[', close: ']', notIn: ['string'] },
					{ open: '"', close: '"', notIn: ['string'] }
				]
			}
		});

		this.extraInfoSupport = this;

		// Initialize Outline support
		this.outlineSupport = this;
		this.outlineGroupLabel = Object.create(null);
		this.outlineGroupLabel['object'] = nls.localize('object', "objects");
		this.outlineGroupLabel['array'] = nls.localize('array', "arrays");
		this.outlineGroupLabel['string'] = nls.localize('string', "strings");
		this.outlineGroupLabel['number'] = nls.localize('number', "numbers");
		this.outlineGroupLabel['boolean'] = nls.localize('boolean', "booleans");
		this.outlineGroupLabel['null'] = nls.localize('undefined', "undefined");

		this.formattingSupport = this;

		this.suggestSupport = new SuggestSupport(this.getId(), {
			triggerCharacters: [],
			excludeTokens: ['comment.line.json', 'comment.block.json'],
			suggest: (resource, position) => this.suggest(resource, position)});
	}

	public creationDone(): void {
		super.creationDone();
		if (this._threadService.isInMainThread) {
			// Configure all workers
			this._configureWorkerSchemas(this.getSchemaConfiguration());
			var contributionRegistry = <IJSONContributionRegistry> Platform.Registry.as(Extensions.JSONContribution);
			contributionRegistry.addRegistryChangedListener(e => {
				this._configureWorkerSchemas(this.getSchemaConfiguration());
			});
		}
	}

	private getSchemaConfiguration() : ISchemaContributions {
		var contributionRegistry = <IJSONContributionRegistry> Platform.Registry.as(Extensions.JSONContribution);
		return contributionRegistry.getSchemaContributions();
	}

	public getSerializableState(): ISchemaContributions {
		return this.getSchemaConfiguration();
	}

	public setData(data:ISchemaContributions): void {
		// It is ok to not join the promise. Workers are managed using a special
		// worker promise and the next call to the worker will wait until this
		// call went through.
		this._worker((w) => w.setSchemaContributions(data));
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<Modes.IMode, Modes.IWorkerParticipant[], jsonWorker.JSONWorker> {
		return createAsyncDescriptor2('vs/languages/json/common/jsonWorker', 'JSONWorker');
	}

	static $_configureWorkerSchemas = AllWorkersAttr(JSONMode, JSONMode.prototype._configureWorkerSchemas);
	private _configureWorkerSchemas(data:ISchemaContributions): WinJS.TPromise<boolean> {
		return this._worker((w) => w.setSchemaContributions(data));
	}

	static $computeInfo = OneWorkerAttr(JSONMode, JSONMode.prototype.computeInfo);
	public computeInfo(resource:URI, position:EditorCommon.IPosition): WinJS.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	static $getOutline = OneWorkerAttr(JSONMode, JSONMode.prototype.getOutline);
	public getOutline(resource:URI):WinJS.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	static $formatDocument = OneWorkerAttr(JSONMode, JSONMode.prototype.formatDocument);
	public formatDocument(resource:URI, options:Modes.IFormattingOptions):WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.format(resource, null, options));
	}

	static $formatRange = OneWorkerAttr(JSONMode, JSONMode.prototype.formatRange);
	public formatRange(resource:URI, range:EditorCommon.IRange, options:Modes.IFormattingOptions):WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.format(resource, range, options));
	}
}