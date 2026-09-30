/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Embeds a Windows version resource in `copilot.exe`. VS Code setup compares its file version with the published
//! shim's and replaces the shim only when they differ, because signing makes every build's bytes different. Bump the
//! package version whenever the shim changes.
//!
//! The resource is written directly in the `.res` format, which the MSVC linker accepts as an input, so the build
//! needs neither a resource compiler nor extra dependencies.

use std::env;
use std::fs;
use std::path::PathBuf;

const RT_VERSION: u16 = 16;
const LANGUAGE_EN_US: u16 = 0x0409;
const CODE_PAGE_UNICODE: u16 = 0x04b0;

fn main() {
	println!("cargo:rerun-if-changed=build.rs");
	if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows")
		|| env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("msvc")
	{
		return;
	}

	let version = env::var("CARGO_PKG_VERSION").expect("package version");
	let numbers: Vec<u16> = version
		.split(['.', '-', '+'])
		.take(3)
		.map(|part| part.parse().expect("numeric package version"))
		.collect();
	let [major, minor, patch] = numbers[..] else {
		panic!("package version {version} is not major.minor.patch");
	};

	let resource = version_resource(major, minor, patch, &version);
	let path = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR")).join("version.res");
	fs::write(&path, resource).expect("write the version resource");
	println!("cargo:rustc-link-arg-bins={}", path.display());
}

fn version_resource(major: u16, minor: u16, patch: u16, version: &str) -> Vec<u8> {
	let version_ms = (u32::from(major) << 16) | u32::from(minor);
	let version_ls = u32::from(patch) << 16;
	let mut fixed = Vec::new();
	for value in [
		0xFEEF_04BD, // signature
		0x0001_0000, // structure version
		version_ms,  // file version
		version_ls,
		version_ms, // product version
		version_ls,
		0x3F,        // file flags mask
		0,           // file flags
		0x0004_0004, // VOS_NT_WINDOWS32
		1,           // VFT_APP
		0,           // subtype
		0,           // date
		0,
	] {
		fixed.extend_from_slice(&u32::to_le_bytes(value));
	}

	let strings = [
		("CompanyName", "Microsoft Corporation"),
		("FileDescription", "GitHub Copilot CLI launcher"),
		("FileVersion", version),
		("InternalName", "copilot.exe"),
		(
			"LegalCopyright",
			"Copyright (C) Microsoft Corporation. All rights reserved.",
		),
		("OriginalFilename", "copilot.exe"),
		("ProductName", "Visual Studio Code"),
		("ProductVersion", version),
	]
	.map(|(key, value)| Node::text(key, value));
	let string_table = Node::branch(
		&format!("{LANGUAGE_EN_US:04x}{CODE_PAGE_UNICODE:04x}"),
		strings.to_vec(),
	);
	let translation = Node {
		key: String::from("Translation"),
		value: [LANGUAGE_EN_US, CODE_PAGE_UNICODE]
			.iter()
			.flat_map(|value| value.to_le_bytes())
			.collect(),
		value_length: 4,
		text: false,
		children: Vec::new(),
	};
	let root = Node {
		key: String::from("VS_VERSION_INFO"),
		value_length: fixed.len() as u16,
		value: fixed,
		text: false,
		children: vec![
			Node::branch("StringFileInfo", vec![string_table]),
			Node::branch("VarFileInfo", vec![translation]),
		],
	};

	let data = root.encode();
	let mut resource = resource_header(0, 0, 0, 0);
	resource.extend(resource_header(
		data.len() as u32,
		RT_VERSION,
		1,
		LANGUAGE_EN_US,
	));
	resource.extend(&data);
	pad(&mut resource);
	resource
}

/// A `.res` entry header with a numeric type and name. An empty first entry marks the file as a 32-bit resource file.
fn resource_header(data_size: u32, resource_type: u16, name: u16, language: u16) -> Vec<u8> {
	let mut header = Vec::new();
	header.extend_from_slice(&data_size.to_le_bytes());
	header.extend_from_slice(&32_u32.to_le_bytes());
	for value in [0xFFFF, resource_type, 0xFFFF, name] {
		header.extend_from_slice(&u16::to_le_bytes(value));
	}
	header.extend_from_slice(&0_u32.to_le_bytes()); // data version
	let memory_flags: u16 = if data_size == 0 { 0 } else { 0x0030 }; // MOVEABLE | PURE
	header.extend_from_slice(&memory_flags.to_le_bytes());
	header.extend_from_slice(&language.to_le_bytes());
	header.extend_from_slice(&0_u32.to_le_bytes()); // version
	header.extend_from_slice(&0_u32.to_le_bytes()); // characteristics
	header
}

/// A node of the version information tree: `wLength`, `wValueLength`, `wType`, key, value, and children, each aligned to
/// four bytes.
#[derive(Clone)]
struct Node {
	key: String,
	value: Vec<u8>,
	value_length: u16,
	text: bool,
	children: Vec<Node>,
}

impl Node {
	fn text(key: &str, value: &str) -> Self {
		let value: Vec<u16> = value.encode_utf16().chain([0]).collect();
		Self {
			key: key.to_owned(),
			value_length: value.len() as u16,
			value: value.iter().flat_map(|unit| unit.to_le_bytes()).collect(),
			text: true,
			children: Vec::new(),
		}
	}

	fn branch(key: &str, children: Vec<Node>) -> Self {
		Self {
			key: key.to_owned(),
			value: Vec::new(),
			value_length: 0,
			text: true,
			children,
		}
	}

	fn encode(&self) -> Vec<u8> {
		let mut bytes = vec![0; 6];
		bytes[2..4].copy_from_slice(&self.value_length.to_le_bytes());
		bytes[4..6].copy_from_slice(&u16::from(self.text).to_le_bytes());
		for unit in self.key.encode_utf16().chain([0]) {
			bytes.extend_from_slice(&unit.to_le_bytes());
		}
		pad(&mut bytes);
		bytes.extend_from_slice(&self.value);
		for child in &self.children {
			pad(&mut bytes);
			bytes.extend(child.encode());
		}
		let length = bytes.len() as u16;
		bytes[0..2].copy_from_slice(&length.to_le_bytes());
		bytes
	}
}

fn pad(bytes: &mut Vec<u8>) {
	while !bytes.len().is_multiple_of(4) {
		bytes.push(0);
	}
}
