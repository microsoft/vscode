/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(target_os = "windows")]
pub type SleepInhibitor = super::nosleep_windows::SleepInhibitor;

#[cfg(target_os = "linux")]
pub type SleepInhibitor = super::nosleep_linux::SleepInhibitor;

#[cfg(target_os = "macos")]
pub type SleepInhibitor = super::nosleep_macos::SleepInhibitor;
