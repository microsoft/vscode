function handleRemovals(rules: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {
	// Do a first pass and construct a hash-map for removals
	const removals = new Map</* commandId */ string, ResolvedKeybindingItem[]>();
	for (let i = 0, len = rules.length; i < len; i++) {
		const rule = rules[i];
		if (rule.command && rule.command.charAt(0) === '-') {
			const command = rule.command.substring(1);
			if (!removals.has(command)) {
				removals.set(command, [rule]);
			} else {
				removals.get(command)!.push(rule);
			}
		}
	}

	if (removals.size === 0) {
		// There are no removals
		return rules;
	}

	// Do a second pass and keep only non-removed keybindings
	const result: ResolvedKeybindingItem[] = [];
	for (let i = 0, len = rules.length; i < len; i++) {
		const rule = rules[i];

		if (!rule.command || rule.command.length === 0) {
			result.push(rule);
			continue;
		}
		if (rule.command.charAt(0) === '-') {
			continue;
		}
		const commandRemovals = removals.get(rule.command);
		if (!commandRemovals || !rule.isDefault) {
			result.push(rule);
			continue;
		}
		let isRemoved = false;
		for (const commandRemoval of commandRemovals) {
			const when = commandRemoval.when;
			if (this._isTargetedForRemoval(rule, commandRemoval.chords, when)) {
				isRemoved = true;
				break;
			}
		}
		if (!isRemoved) {
			result.push(rule);
			continue;
		}
	}
	return result;
}
