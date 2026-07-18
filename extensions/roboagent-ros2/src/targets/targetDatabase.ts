/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Target Database (REQ-4 / R4.4)
 *
 *  A typed, data-driven catalog of low-level (microcontroller) targets. Adding a new MCU or
 *  board is a DATA edit here only — the New-Project wizard reads this catalog and needs no
 *  code change. Seeded with STM32 and ESP32 families. The `framework`/`flashTool`/
 *  `debugAdapter` fields are not consumed yet — they deliberately carry the data the deploy/
 *  flash/on-chip-debug follow-up slices will need (REQ-4 spec, section 7).
 *--------------------------------------------------------------------------------------------*/

export type TargetFamily = 'STM32' | 'ESP32';
export type TargetFramework = 'platformio' | 'cube' | 'esp-idf';
export type FlashTool = 'openocd' | 'esptool';

export interface TargetDefinition {
	/** Stable id recorded in `.roboagent/project.json` (`target`). */
	readonly id: string;
	readonly family: TargetFamily;
	/** Human label shown in the wizard picker. */
	readonly label: string;
	readonly description: string;
	/** Build framework the scaffold uses. */
	readonly framework: TargetFramework;
	/** Tool used to flash the device (future: one-click flash). */
	readonly flashTool: FlashTool;
	/** Debug adapter id for on-chip debugging (future: OpenOCD/gdb over SWD/JTAG). */
	readonly debugAdapter?: string;
	/** Template folder under `templates/` used to scaffold the project. */
	readonly scaffold: string;
	/** CLI tool whose presence indicates the toolchain is installed (R4.7 detection). */
	readonly toolchainProbe: string;
	/** Install guidance shown when {@link toolchainProbe} is not on PATH (R4.7). */
	readonly toolchainHint: string;
}

/**
 * The seeded catalog. To add a target, append an entry — no other code changes required.
 */
export const TARGET_DATABASE: readonly TargetDefinition[] = [
	{
		id: 'stm32',
		family: 'STM32',
		label: 'STM32',
		description: 'ARM Cortex-M microcontroller (PlatformIO · ST-Link/OpenOCD)',
		framework: 'platformio',
		flashTool: 'openocd',
		debugAdapter: 'openocd-gdb',
		scaffold: 'stm32-platformio',
		toolchainProbe: 'pio',
		toolchainHint: 'Install PlatformIO Core (`pip install platformio`) to build/flash this target.',
	},
	{
		id: 'esp32',
		family: 'ESP32',
		label: 'ESP32',
		description: 'Espressif Wi-Fi/BLE SoC (PlatformIO · esptool)',
		framework: 'platformio',
		flashTool: 'esptool',
		debugAdapter: 'openocd-gdb',
		scaffold: 'esp32-platformio',
		toolchainProbe: 'pio',
		toolchainHint: 'Install PlatformIO Core (`pip install platformio`) to build/flash this target.',
	},
];

export function getTarget(id: string): TargetDefinition | undefined {
	return TARGET_DATABASE.find(t => t.id === id);
}
