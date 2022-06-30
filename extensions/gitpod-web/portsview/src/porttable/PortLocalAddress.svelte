<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import HoverOptions from "../components/HoverOptions.svelte";
	import type { HoverOption } from "../protocol/components";
	import type { GitpodPortObject, PortCommand } from "../protocol/gitpod";
	import { commandIconMap, getCommands, getNLSTitle } from "../utils/commands";

	export let port: GitpodPortObject;

	const copyOpt: HoverOption = {
		icon: "copy",
		title: "Copy URL",
		command: "urlCopy",
	};

	function getHoverOption(port?: GitpodPortObject) {
		if (port == null) {
			return [];
		}
		const opts: HoverOption[] = getCommands(port).map((e) => ({
			icon: commandIconMap[e],
			title: getNLSTitle(e),
			command: e,
		}));
		opts.unshift(copyOpt);
		return opts;
	}

	$: hoverOpts = getHoverOption(port);
	const dispatch = createEventDispatcher<{
		command: { command: PortCommand; port: GitpodPortObject };
	}>();
	function onHoverCommand(command: string) {
		dispatch("command", { command: command as PortCommand, port });
	}
</script>

<HoverOptions
	alwaysShow
	options={hoverOpts}
	on:command={(e) => {
		onHoverCommand(e.detail);
	}}
>
	<a href={port.status.exposed.url}>{port.status.exposed.url}</a>
</HoverOptions>

<style>
	a {
		color: var(--vscode-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: inline-block;
	}
	a:focus {
		outline: none;
	}
</style>
