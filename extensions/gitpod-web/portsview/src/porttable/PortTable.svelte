<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import {
		provideVSCodeDesignSystem,
		vsCodeDataGrid,
		vsCodeDataGridCell,
		vsCodeDataGridRow,
	} from "@vscode/webview-ui-toolkit";
	import ContextMenu from "../components/ContextMenu.svelte";
	import PortInfo from "./PortInfo.svelte";
	import PortStatus from "./PortStatus.svelte";
	import PortLocalAddress from "./PortLocalAddress.svelte";
	import { vscode } from "../utils/vscode";
	import type { GitpodPortObject, PortCommand } from "../protocol/gitpod";
	import { getNLSTitle, getSplitCommands } from "../utils/commands";
	import type { MenuOption } from "../protocol/components";

	provideVSCodeDesignSystem().register(
		vsCodeDataGrid(),
		vsCodeDataGridCell(),
		vsCodeDataGridRow()
	);

	let tableHovered = false;

	const headers = ["", "Port", "Address", "Description", "State"];

	function postData(command: string, port: GitpodPortObject) {
		vscode.postMessage({
			port,
			command: command as PortCommand,
		});
	}

	export let ports: GitpodPortObject[] = [];

	//#region ContextMenu

	let menuData: {
		x: number;
		y: number;
		show: boolean;
		port: GitpodPortObject;
		options: MenuOption[];
	} = {
		x: 0,
		y: 0,
		show: false,
		port: undefined,
		options: [],
	};

	async function onRightClick(event, port) {
		if (menuData.show) {
			menuData.show = false;
			await new Promise((res) => setTimeout(res, 100));
		}
		menuData.options = getSplitCommands(port).map((e) =>
			!!e ? { command: e, label: getNLSTitle(e) } : null
		);
		menuData.port = port;
		menuData.x = event.x;
		menuData.y = event.y;
		menuData.show = true;
	}

	function closeMenu() {
		menuData.show = false;
	}

	//#endregion
</script>

<main>
	<ContextMenu
		{...menuData}
		on:clickoutside={closeMenu}
		on:command={(e) => {
			const command = e.detail;
			postData(command, menuData.port);
			closeMenu();
		}}
	/>

	<vscode-data-grid
		class="table"
		id="table"
		grid-template-columns="1fr 5fr 520px 5fr 7fr"
		class:table-hover={tableHovered}
		on:contextmenu|preventDefault
		on:mouseenter={() => (tableHovered = true)}
		on:mouseleave={() => (tableHovered = false)}
	>
		<vscode-data-grid-row class="tr" row-type="sticky-header">
			{#each headers as header, i (i)}
				<vscode-data-grid-cell
					class="th"
					cellType="columnheader"
					grid-column={i + 1}>{header}</vscode-data-grid-cell
				>
			{/each}
		</vscode-data-grid-row>
		{#each ports as port, i (port.status.localPort)}
			<vscode-data-grid-row
				class="tr tr-data"
				on:contextmenu|preventDefault={(event) => onRightClick(event, port)}
			>
				<vscode-data-grid-cell
					class="td"
					grid-column="1"
					class:served={port.status.served}
					style="text-align: center"
				>
					<PortStatus status={port.info.iconStatus} />
				</vscode-data-grid-cell>

				<vscode-data-grid-cell class="td" grid-column="2">
					<PortInfo {port} />
				</vscode-data-grid-cell>

				<vscode-data-grid-cell class="td" grid-column="3">
					{#if (port.status.exposed?.url.length ?? 0) > 0}
						<PortLocalAddress
							on:command={(e) => {
								const { command, port } = e.detail;
								postData(command, port);
							}}
							{port}
						/>
					{/if}
				</vscode-data-grid-cell>

				<vscode-data-grid-cell class="td" grid-column="4">
					<span title={port.status.description}>{port.status.description}</span>
				</vscode-data-grid-cell>

				<vscode-data-grid-cell class="td" grid-column="5">
					<span title={port.info.description}>{port.info.description}</span>
				</vscode-data-grid-cell>
			</vscode-data-grid-row>
		{/each}
	</vscode-data-grid>
</main>

<svelte:window
	on:scroll={() => {
		if (menuData.show) {
			menuData.show = false;
		}
	}}
/>

<style>
	.table {
		min-width: 1030px;
		width: 100%;
		height: 100%;
		font-size: 13px;
	}
	.td {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.th {
		font-weight: bold;
	}

	.tr-data:nth-child(odd) {
		background-color: var(--vscode-tree-tableOddRowsBackground);
	}
	.tr-data:hover {
		background-color: var(--vscode-list-hoverBackground);
	}
</style>
