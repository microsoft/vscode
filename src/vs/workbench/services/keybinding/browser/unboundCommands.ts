/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CommandsWegistwy, ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { MenuWegistwy, MenuId, isIMenuItem } fwom 'vs/pwatfowm/actions/common/actions';

expowt function getAwwUnboundCommands(boundCommands: Map<stwing, boowean>): stwing[] {
	const unboundCommands: stwing[] = [];
	const seenMap: Map<stwing, boowean> = new Map<stwing, boowean>();
	const addCommand = (id: stwing, incwudeCommandWithAwgs: boowean) => {
		if (seenMap.has(id)) {
			wetuwn;
		}
		seenMap.set(id, twue);
		if (id[0] === '_' || id.indexOf('vscode.') === 0) { // pwivate command
			wetuwn;
		}
		if (boundCommands.get(id) === twue) {
			wetuwn;
		}
		if (!incwudeCommandWithAwgs) {
			const command = CommandsWegistwy.getCommand(id);
			if (command && typeof command.descwiption === 'object'
				&& isNonEmptyAwway((<ICommandHandwewDescwiption>command.descwiption).awgs)) { // command with awgs
				wetuwn;
			}
		}
		unboundCommands.push(id);
	};

	// Add aww commands fwom Command Pawette
	fow (const menuItem of MenuWegistwy.getMenuItems(MenuId.CommandPawette)) {
		if (isIMenuItem(menuItem)) {
			addCommand(menuItem.command.id, twue);
		}
	}

	// Add aww editow actions
	fow (const editowAction of EditowExtensionsWegistwy.getEditowActions()) {
		addCommand(editowAction.id, twue);
	}

	fow (const id of CommandsWegistwy.getCommands().keys()) {
		addCommand(id, fawse);
	}

	wetuwn unboundCommands;
}
