/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import filters = require('vs/base/common/filters');
import winjs = require('vs/base/common/winjs.base');
import severity from 'vs/base/common/severity';
import { IGitService, RefType, IRef, isValidBranchName } from 'vs/workbench/parts/git/common/git';
import quickopenwb = require('vs/workbench/browser/quickopen');
import quickopen = require('vs/base/parts/quickopen/common/quickOpen');
import model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IMessageService} from 'vs/platform/message/common/message';

// Entries

class AbstractRefEntry extends model.QuickOpenEntry {

	protected gitService: IGitService;
	protected messageService: IMessageService;
	protected ref: IRef;

	constructor(gitService: IGitService, messageService: IMessageService, ref: IRef, highlights:model.IHighlight[]) {
		super(highlights);

		this.gitService = gitService;
		this.messageService = messageService;
		this.ref = ref;
	}

	getIcon(): string { return 'git'; }
	getLabel(): string { return this.ref.name; }
	getDescription(): string { return ''; }
	getAriaLabel(): string { return nls.localize('refAriaLabel', "{0}, git", this.getLabel()); }

	run(mode: quickopen.Mode, context: model.IContext):boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		return true;
	}
}

class CheckoutHeadEntry extends AbstractRefEntry {

	getDescription(): string { return nls.localize('checkoutBranch', "Branch at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: quickopen.Mode, context: model.IContext): boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.ref.name).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

class CheckoutRemoteHeadEntry extends AbstractRefEntry {

	getDescription(): string { return nls.localize('checkoutRemoteBranch', "Remote branch at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: quickopen.Mode, context: model.IContext): boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		const match = /^[^/]+\/(.*)$/.exec(this.ref.name);
		const name = match ? match[1] : this.ref.name;

		this.gitService.checkout(name).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

class CheckoutTagEntry extends AbstractRefEntry {

	getDescription(): string { return nls.localize('checkoutTag', "Tag at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: quickopen.Mode, context: model.IContext): boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.ref.name).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

class CurrentHeadEntry extends AbstractRefEntry {
	getDescription(): string { return nls.localize('alreadyCheckedOut', "Branch {0} is already the current branch", this.ref.name); }
}

class BranchEntry extends model.QuickOpenEntry {

	private gitService: IGitService;
	private messageService: IMessageService;
	private name: string;

	constructor(gitService: IGitService, messageService: IMessageService, name: string) {
		super([{ start: 0, end: name.length }]);

		this.gitService = gitService;
		this.messageService = messageService;
		this.name = name;
	}

	getIcon(): string { return 'git'; }
	getLabel(): string { return this.name; }
	getAriaLabel(): string { return nls.localize({ key: 'branchAriaLabel', comment: ['the branch name'] }, "{0}, git branch", this.getLabel()); }
	getDescription(): string { return nls.localize('createBranch', "Create branch {0}", this.name); }

	run(mode: quickopen.Mode, context: model.IContext):boolean {
		if (mode === quickopen.Mode.PREVIEW) {
			return false;
		}

		this.gitService.branch(this.name, true).done(null, e => this.messageService.show(severity.Error, e));
		return true;
	}
}

// Commands

class CheckoutCommand implements quickopenwb.ICommand {

	aliases = ['checkout', 'co'];
	icon = 'git';

	constructor(private gitService: IGitService, private messageService: IMessageService) {
		// noop
	}

	getResults(input: string): winjs.TPromise<model.QuickOpenEntry[]> {
		input = input.trim();

		const gitModel = this.gitService.getModel();
		const currentHead = gitModel.getHEAD();
		const refs = gitModel.getRefs();
		const heads = refs.filter(ref => ref.type === RefType.Head);
		const tags = refs.filter(ref => ref.type === RefType.Tag);
		const remoteHeads = refs.filter(ref => ref.type === RefType.RemoteHead);

		const headMatches = heads
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const headEntries: model.QuickOpenEntry[] = headMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutHeadEntry(this.gitService, this.messageService, head, highlights));

		const tagMatches = tags
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const tagEntries = tagMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutTagEntry(this.gitService, this.messageService, head, highlights));

		const checkoutEntries = headEntries
			.concat(tagEntries)
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()));

		const remoteHeadMatches = remoteHeads
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const remoteHeadEntries: model.QuickOpenEntry[] = remoteHeadMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutRemoteHeadEntry(this.gitService, this.messageService, head, highlights))
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()));

		if (checkoutEntries.length > 0) {
			checkoutEntries[0] = new model.QuickOpenEntryGroup(checkoutEntries[0], 'checkout', false);
		}

		if (remoteHeadEntries.length > 0) {
			remoteHeadEntries[0] = new model.QuickOpenEntryGroup(remoteHeadEntries[0], 'checkout remote', checkoutEntries.length > 0);
		}

		const entries = checkoutEntries
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()))
			.concat(remoteHeadEntries);

		const allMatches = headMatches.concat(tagMatches).concat(remoteHeadMatches);
		const exactMatches = allMatches.filter(({ head }) => head.name === input);
		const currentHeadMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (currentHeadMatches.length > 0) {
			entries.unshift(new CurrentHeadEntry(this.gitService, this.messageService, currentHeadMatches[0].head, currentHeadMatches[0].highlights));

		} else if (exactMatches.length === 0 && isValidBranchName(input)) {
			const branchEntry = new BranchEntry(this.gitService, this.messageService, input);
			entries.push(new model.QuickOpenEntryGroup(branchEntry, 'branch', checkoutEntries.length > 0 || remoteHeadEntries.length > 0));
		}

		return winjs.TPromise.as<model.QuickOpenEntry[]>(entries);
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noBranches', "No other branches");
	}
}

class BranchCommand implements quickopenwb.ICommand {

	aliases = ['branch'];
	icon = 'git';

	constructor(private gitService: IGitService, private messageService: IMessageService) {
		// noop
	}

	getResults(input: string): winjs.TPromise<model.QuickOpenEntry[]> {
		input = input.trim();

		if (!isValidBranchName(input)) {
			return winjs.TPromise.as([]);
		}

		const gitModel = this.gitService.getModel();
		const currentHead = gitModel.getHEAD();

		const matches = gitModel.getRefs()
			.map(head => ({ head, highlights: filters.matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const exactMatches = matches.filter(({ head }) => head.name === input);
		const headMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (headMatches.length > 0) {
			return winjs.TPromise.as([new CurrentHeadEntry(this.gitService, this.messageService, headMatches[0].head, headMatches[0].highlights)]);
		} else if (exactMatches.length > 0) {
			return winjs.TPromise.as([new CheckoutHeadEntry(this.gitService, this.messageService, exactMatches[0].head, exactMatches[0].highlights)]);
		}

		const branchEntry = new BranchEntry(this.gitService, this.messageService, input);
		return winjs.TPromise.as([new model.QuickOpenEntryGroup(branchEntry, 'branch', false)]);
	}

	getEmptyLabel(input: string): string {
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
