/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import filters = require('vs/base/common/filters');
import winjs = require('vs/base/common/winjs.base');
import severity from 'vs/base/common/severity';
import git = require('vs/workbench/parts/git/common/git');
import quickopenwb = require('vs/workbench/browser/quickopen');
import quickopen = require('vs/base/parts/quickopen/common/quickOpen');
import model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IMessageService} from 'vs/platform/message/common/message';

import IGitService = git.IGitService;

// Entries

class AbstractRefEntry extends model.QuickOpenEntry {

	protected gitService: git.IGitService;
	protected messageService: IMessageService;
	protected head: git.IBranch;

	constructor(gitService: git.IGitService, messageService: IMessageService, head: git.IBranch, highlights:model.IHighlight[]) {
		super(highlights);

		this.gitService = gitService;
		this.messageService = messageService;
		this.head = head;
	}

	public getIcon(): string { return 'git'; }
	public getLabel(): string { return this.head.name; }
	public getDescription(): string { return ''; }
	public getAriaLabel(): string { return nls.localize('refAriaLabel', "{0}, git", this.getLabel()); }

	public run(mode: quickopen.Mode, context: model.IContext):boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		return true;
	}
}

class CheckoutHeadEntry extends AbstractRefEntry {

	public getDescription(): string { return nls.localize('checkoutBranch', "Branch at {0}", this.head.commit.substr(0, 8)); }

	public run(mode: quickopen.Mode, context: model.IContext): boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.head.name).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

class CheckoutTagEntry extends AbstractRefEntry {

	public getDescription(): string { return nls.localize('checkoutTag', "Tag at {0}", this.head.commit.substr(0, 8)); }

	public run(mode: quickopen.Mode, context: model.IContext): boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.head.name).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

class CurrentHeadEntry extends AbstractRefEntry {
	public getDescription(): string { return nls.localize('alreadyCheckedOut', "Branch {0} is already the current branch", this.head.name); }
}

class BranchEntry extends model.QuickOpenEntry {

	private gitService: git.IGitService;
	private messageService: IMessageService;
	private name: string;

	constructor(gitService: git.IGitService, messageService: IMessageService, name: string) {
		super([{ start: 0, end: name.length }]);

		this.gitService = gitService;
		this.messageService = messageService;
		this.name = name;
	}

	public getIcon(): string { return 'git'; }
	public getLabel(): string { return this.name; }
	public getAriaLabel(): string { return nls.localize('branchAriaLabel', "{0}, git branch", this.getLabel()); }
	public getDescription(): string { return nls.localize('createBranch', "Create branch {0}", this.name); }

	public run(mode: quickopen.Mode, context: model.IContext):boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.branch(this.name, true).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

// Commands

class CheckoutCommand implements quickopenwb.ICommand {

	public aliases = ['checkout', 'co'];
	public icon = 'git';

	constructor(private gitService: git.IGitService, private messageService: IMessageService) {
		// noop
	}

	public getResults(input: string): winjs.TPromise<model.QuickOpenEntry[]> {
		input = input.trim();

		var gitModel = this.gitService.getModel();
		var currentHead = gitModel.getHEAD();

		var headMatches = gitModel.getHeads()
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		var headEntries: model.QuickOpenEntry[] = headMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutHeadEntry(this.gitService, this.messageService, head, highlights));

		var tagMatches = gitModel.getTags()
			.map(tag => ({ tag, highlights: filters.matchesContiguousSubString(input, tag.name) }))
			.filter(({ highlights }) => !!highlights);

		var tagEntries: model.QuickOpenEntry[] = tagMatches
			.filter(({ tag }) => tag.name !== currentHead.name)
			.map(({ tag, highlights }) => new CheckoutTagEntry(this.gitService, this.messageService, tag, highlights));

		var entries = headEntries
			.concat(tagEntries)
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()));

		if (entries.length > 0) {
			entries[0] = new model.QuickOpenEntryGroup(entries[0], 'checkout', false);
		}

		var exactMatches = headMatches.filter(({ head }) => head.name === input);
		var currentHeadMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (currentHeadMatches.length > 0) {
			entries.unshift(new CurrentHeadEntry(this.gitService, this.messageService, currentHeadMatches[0].head, currentHeadMatches[0].highlights));

		} else if (exactMatches.length === 0 && git.isValidBranchName(input)) {
			var branchEntry = new BranchEntry(this.gitService, this.messageService, input);
			entries.push(new model.QuickOpenEntryGroup(branchEntry, 'branch', false));
		}

		return winjs.TPromise.as<model.QuickOpenEntry[]>(entries);
	}

	public getEmptyLabel(input: string): string {
		return nls.localize('noBranches', "No other branches");
	}
}

class BranchCommand implements quickopenwb.ICommand {

	public aliases = ['branch'];
	public icon = 'git';

	constructor(private gitService: git.IGitService, private messageService: IMessageService) {
		// noop
	}

	public getResults(input: string): winjs.TPromise<model.QuickOpenEntry[]> {
		input = input.trim();

		if (!git.isValidBranchName(input)) {
			return winjs.TPromise.as([]);
		}

		var gitModel = this.gitService.getModel();
		var currentHead = gitModel.getHEAD();

		var matches = gitModel.getHeads()
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		var exactMatches = matches.filter(({ head }) => head.name === input);
		var headMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (headMatches.length > 0) {
			return winjs.TPromise.as([new CurrentHeadEntry(this.gitService, this.messageService, headMatches[0].head, headMatches[0].highlights)]);
		} else if (exactMatches.length > 0) {
			return winjs.TPromise.as([new CheckoutHeadEntry(this.gitService, this.messageService, exactMatches[0].head, exactMatches[0].highlights)]);
		}

		var branchEntry = new BranchEntry(this.gitService, this.messageService, input);
		return winjs.TPromise.as([new model.QuickOpenEntryGroup(branchEntry, 'branch', false)]);
	}

	public getEmptyLabel(input: string): string {
		return nls.localize('notValidBranchName', "Please provide a valid branch name");
	}
}

export class CommandQuickOpenHandler extends quickopenwb.CommandQuickOpenHandler {

	constructor(@IQuickOpenService quickOpenService: IQuickOpenService, @IGitService gitService: IGitService, @IMessageService messageService: IMessageService) {
		super(quickOpenService, {
			prefix: 'git',
			commands: [
				new CheckoutCommand(gitService, messageService),
				new BranchCommand(gitService, messageService)
			]
		});
	}
}
