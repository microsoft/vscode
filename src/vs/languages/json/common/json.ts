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
import {AbstractMode, createWordRegExp, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {IJSONContributionRegistry, Extensions, ISchemaContributions} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {CancellationToken} from 'vs/base/common/cancellation';
import {wireCancellationToken} from 'vs/base/common/async';

export class JSONMode extends AbstractMode implements Modes.HoverProvider, Modes.IOutlineSupport {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;
	public configSupport:Modes.IConfigurationSupport;
	public inplaceReplaceSupport:Modes.IInplaceReplaceSupport;
	public outlineSupport: Modes.IOutlineSupport;
	public formattingSupport: Modes.IFormattingSupport;

	public outlineGroupLabel : { [name: string]: string; };

	private _modeWorkerManager: ModeWorkerManager<jsonWorker.JSONWorker>;
	private _threadService:IThreadService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor.id);
		this._modeWorkerManager = new ModeWorkerManager<jsonWorker.JSONWorker>(descriptor, 'vs/languages/json/common/jsonWorker', 'JSONWorker', null, instantiationService);
		this._threadService = threadService;

		this.tokenizationSupport = tokenization.createTokenizationSupport(this, true);

		this.richEditSupport = new RichEditSupport(this.getId(), null, {

			wordPattern: createWordRegExp('.-'),

			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']']
			],

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}', notIn: ['string'] },
					{ open: '[', close: ']', notIn: ['string'] },
					{ open: '"', close: '"', notIn: ['string'] }
				]
			}
		});

		Modes.HoverProviderRegistry.register(this.getId(), this);
		this.inplaceReplaceSupport = this;
		this.configSupport = this;

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

		Modes.SuggestRegistry.register(this.getId(), new SuggestSupport(this.getId(), {
			triggerCharacters: [],
			suggest: (resource, position) => this.suggest(resource, position)
		}));
	}

	public creationDone(): void {
		if (this._threadService.isInMainThread) {
			// Pick a worker to do validation
			this._pickAWorkerToValidate();

			// Configure all workers
			this._configureWorkerSchemas(this.getSchemaConfiguration());
			var contributionRegistry = <IJSONContributionRegistry> Platform.Registry.as(Extensions.JSONContribution);
			contributionRegistry.addRegistryChangedListener(e => {
				this._configureWorkerSchemas(this.getSchemaConfiguration());
			});
		}
	}

	private _worker<T>(runner:(worker:jsonWorker.JSONWorker)=>WinJS.TPromise<T>): WinJS.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	private getSchemaConfiguration() : ISchemaContributions {
		var contributionRegistry = <IJSONContributionRegistry> Platform.Registry.as(Extensions.JSONContribution);
		return contributionRegistry.getSchemaContributions();
	}

	public configure(options:any): WinJS.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(JSONMode, JSONMode.prototype._configureWorkers);
	private _configureWorkers(options:any): WinJS.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $_configureWorkerSchemas = AllWorkersAttr(JSONMode, JSONMode.prototype._configureWorkerSchemas);
	private _configureWorkerSchemas(data:ISchemaContributions): WinJS.TPromise<boolean> {
		return this._worker((w) => w.setSchemaContributions(data));
	}

	static $_pickAWorkerToValidate = OneWorkerAttr(JSONMode, JSONMode.prototype._pickAWorkerToValidate, ThreadAffinity.Group1);
	private _pickAWorkerToValidate(): WinJS.TPromise<void> {
		return this._worker((w) => w.enableValidator());
	}

	static $navigateValueSet = OneWorkerAttr(JSONMode, JSONMode.prototype.navigateValueSet);
	public navigateValueSet(resource:URI, position:EditorCommon.IRange, up:boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		return this._worker((w) => w.navigateValueSet(resource, position, up));
	}

	static $suggest = OneWorkerAttr(JSONMode, JSONMode.prototype.suggest);
	public suggest(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ISuggestResult[]> {
		return this._worker((w) => w.suggest(resource, position));
	}

	public provideHover(model:EditorCommon.IModel, position:EditorCommon.IEditorPosition, cancellationToken:CancellationToken): Thenable<Modes.Hover> {
		return wireCancellationToken(cancellationToken, this._provideHover(model.getAssociatedResource(), position));
	}

	static $_provideHover = OneWorkerAttr(JSONMode, JSONMode.prototype._provideHover);
	public _provideHover(resource:URI, position:EditorCommon.IPosition): WinJS.TPromise<Modes.Hover> {
		return this._worker((w) => w.provideHover(resource, position));
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