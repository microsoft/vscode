/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { matchesContiguousSubString } from 'vs/base/common/filters';
import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { IGitService, RefType, IRef, IGitConfiguration } from 'vs/workbench/parts/git/common/git';
import { ICommand, CommandQuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { Mode } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, IHighlight, IContext, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IMessageService } from 'vs/platform/message/common/message';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class AbstractRefEntry extends QuickOpenEntry {

	protected gitService: IGitService;
	protected messageService: IMessageService;
	protected ref: IRef;

	constructor(gitService: IGitService, messageService: IMessageService, ref: IRef, highlights: IHighlight[]) {
		super(highlights);

		this.gitService = gitService;
		this.messageService = messageService;
		this.ref = ref;
	}

	getIcon(): string { return 'git'; }
	getLabel(): string { return this.ref.name; }
	getDescription(): string { return ''; }
	getAriaLabel(): string { return localize('refAriaLabel', "{0}, git", this.getLabel()); }

	run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		return true;
	}
}

class CheckoutHeadEntry extends AbstractRefEntry {

	getDescription(): string { return localize('checkoutBranch', "Branch at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.ref.name).done(null, e => this.messageService.show(Severity.Error, e));
		return true;
	}
}

class CheckoutRemoteHeadEntry extends AbstractRefEntry {

	getDescription(): string { return localize('checkoutRemoteBranch', "Remote branch at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		const match = /^[^/]+\/(.*)$/.exec(this.ref.name);
		const name = match ? match[1] : this.ref.name;

		this.gitService.checkout(name).done(null, e => this.messageService.show(Severity.Error, e));
		return true;
	}
}

class CheckoutTagEntry extends AbstractRefEntry {

	getDescription(): string { return localize('checkoutTag', "Tag at {0}", this.ref.commit.substr(0, 8)); }

	run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.gitService.checkout(this.ref.name).done(null, e => this.messageService.show(Severity.Error, e));
		return true;
	}
}

class CurrentHeadEntry extends AbstractRefEntry {
	getDescription(): string { return localize('alreadyCheckedOut', "Branch {0} is already the current branch", this.ref.name); }
}

class BranchEntry extends QuickOpenEntry {

	private gitService: IGitService;
	private messageService: IMessageService;
	private name: string;

	constructor(gitService: IGitService, messageService: IMessageService, name: string) {
		super([{ start: 0, end: name.length }]);

		this.gitService = gitService;
		this.messageService = messageService;

		// sanitize name
		this.name = name.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, '-');
	}

	getIcon(): string { return 'git'; }
	getLabel(): string { return this.name; }
	getAriaLabel(): string { return localize({ key: 'branchAriaLabel', comment: ['the branch name'] }, "{0}, git branch", this.getLabel()); }
	getDescription(): string { return localize('createBranch', "Create branch {0}", this.name); }

	run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.gitService.branch(this.name, true).done(null, e => this.messageService.show(Severity.Error, e));
		return true;
	}
}

// Commands

class CheckoutCommand implements ICommand {

	aliases = ['checkout', 'co'];
	icon = 'git';

	constructor(private gitService: IGitService, private messageService: IMessageService, private configurationService: IConfigurationService) {
		// noop
	}

	getResults(input: string): TPromise<QuickOpenEntry[]> {
		input = input.trim();

		const config = this.configurationService.getConfiguration<IGitConfiguration>('git');
		const checkoutType = config.checkoutType;
		const includeTags = checkoutType === 'all' || checkoutType === 'tags';
		const includeRemotes = checkoutType === 'all' || checkoutType === 'remote';

		const gitModel = this.gitService.getModel();
		const currentHead = gitModel.getHEAD();
		const refs = gitModel.getRefs();
		const heads = refs.filter(ref => ref.type === RefType.Head);
		const tags = includeTags ? refs.filter(ref => ref.type === RefType.Tag) : [];
		const remoteHeads = includeRemotes ? refs.filter(ref => ref.type === RefType.RemoteHead) : [];

		const headMatches = heads
			.map(head => ({ head, highlights: matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const headEntries: QuickOpenEntry[] = headMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutHeadEntry(this.gitService, this.messageService, head, highlights));

		const tagMatches = tags
			.map(head => ({ head, highlights: matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const tagEntries = tagMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutTagEntry(this.gitService, this.messageService, head, highlights));

		const checkoutEntries = headEntries
			.concat(tagEntries)
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()));

		const remoteHeadMatches = remoteHeads
			.map(head => ({ head, highlights: matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const remoteHeadEntries: QuickOpenEntry[] = remoteHeadMatches
			.filter(({ head }) => head.name !== currentHead.name)
			.map(({ head, highlights }) => new CheckoutRemoteHeadEntry(this.gitService, this.messageService, head, highlights))
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()));

		if (checkoutEntries.length > 0) {
			checkoutEntries[0] = new QuickOpenEntryGroup(checkoutEntries[0], 'checkout', false);
		}

		if (remoteHeadEntries.length > 0) {
			remoteHeadEntries[0] = new QuickOpenEntryGroup(remoteHeadEntries[0], 'checkout remote', checkoutEntries.length > 0);
		}

		const entries = checkoutEntries
			.sort((a, b) => a.getLabel().localeCompare(b.getLabel()))
			.concat(remoteHeadEntries);

		const allMatches = headMatches.concat(tagMatches).concat(remoteHeadMatches);
		const exactMatches = allMatches.filter(({ head }) => head.name === input);
		const currentHeadMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (currentHeadMatches.length > 0) {
			entries.unshift(new CurrentHeadEntry(this.gitService, this.messageService, currentHeadMatches[0].head, currentHeadMatches[0].highlights));

		} else if (exactMatches.length === 0 && input) {
			const branchEntry = new BranchEntry(this.gitService, this.messageService, input);
			entries.push(new QuickOpenEntryGroup(branchEntry, 'branch', checkoutEntries.length > 0 || remoteHeadEntries.length > 0));
		}

		return TPromise.as<QuickOpenEntry[]>(entries);
	}

	getEmptyLabel(input: string): string {
		return localize('noBranches', "No other branches");
	}
}

class BranchCommand implements ICommand {

	aliases = ['branch'];
	icon = 'git';

	constructor(private gitService: IGitService, private messageService: IMessageService) {
		// noop
	}

	getResults(input: string): TPromise<QuickOpenEntry[]> {
		input = input.trim();

		if (!input) {
			return TPromise.as([]);
		}

		const gitModel = this.gitService.getModel();
		const currentHead = gitModel.getHEAD();

		const matches = gitModel.getRefs()
			.map(head => ({ head, highlights: matchesContiguousSubString(input, head.name) }))
			.filter(({ highlights }) => !!highlights);

		const exactMatches = matches.filter(({ head }) => head.name === input);
		const headMatches = exactMatches.filter(({ head }) => head.name === currentHead.name);

		if (headMatches.length > 0) {
			return TPromise.as([new CurrentHeadEntry(this.gitService, this.messageService, headMatches[0].head, headMatches[0].highlights)]);
		} else if (exactMatches.length > 0) {
			return TPromise.as([new CheckoutHeadEntry(this.gitService, this.messageService, exactMatches[0].head, exactMatches[0].highlights)]);
		}

		const branchEntry = new BranchEntry(this.gitService, this.messageService, input);
		return TPromise.as([new QuickOpenEntryGroup(branchEntry, 'branch', false)]);
	}

	getEmptyLabel(input: string): string {
		return localize('notValidBranchName', "Please provide a valid branch name");
	}
}

export class GitCommandQuickOpenHandler extends CommandQuickOpenHandler {

	constructor(
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IGitService gitService: IGitService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(quickOpenService, {
			prefix: 'git',
			commands: [
				new CheckoutCommand(gitService, messageService, configurationService),
				new BranchCommand(gitService, messageService)
			]
		});
	}
}
