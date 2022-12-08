/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashMap;

use cli::commands::args::{
	CliCore, Commands, DesktopCodeOptions, ExtensionArgs, ExtensionSubcommand,
	InstallExtensionArgs, ListExtensionArgs, UninstallExtensionArgs,
};

/// Tries to parse the argv using the legacy CLI interface, looking for its
/// flags and generating a CLI with subcommands if those don't exist.
pub fn try_parse_legacy(
	iter: impl IntoIterator<Item = impl Into<std::ffi::OsString>>,
) -> Option<CliCore> {
	let raw = clap_lex::RawArgs::new(iter);
	let mut cursor = raw.cursor();
	raw.next(&mut cursor); // Skip the bin

	// First make a hashmap of all flags and capture positional arguments.
	let mut args: HashMap<String, Vec<String>> = HashMap::new();
	let mut last_arg = None;
	while let Some(arg) = raw.next(&mut cursor) {
		if let Some((long, value)) = arg.to_long() {
			if let Ok(long) = long {
				last_arg = Some(long.to_string());
				match args.get_mut(long) {
					Some(prev) => {
						if let Some(v) = value {
							prev.push(v.to_str_lossy().to_string());
						}
					}
					None => {
						if let Some(v) = value {
							args.insert(long.to_string(), vec![v.to_str_lossy().to_string()]);
						} else {
							args.insert(long.to_string(), vec![]);
						}
					}
				}
			}
		} else if let Ok(value) = arg.to_value() {
			if let Some(last_arg) = &last_arg {
				args.get_mut(last_arg)
					.expect("expected to have last arg")
					.push(value.to_string());
			}
		}
	}

	let get_first_arg_value =
		|key: &str| args.get(key).and_then(|v| v.first()).map(|s| s.to_string());
	let desktop_code_options = DesktopCodeOptions {
		extensions_dir: get_first_arg_value("extensions-dir"),
		user_data_dir: get_first_arg_value("user-data-dir"),
		use_version: None,
	};

	// Now translate them to subcommands.
	// --list-extensions        -> ext list
	// --install-extension=id   -> ext install <id>
	// --uninstall-extension=id -> ext uninstall <id>
	// --status                 -> status

	if args.contains_key("list-extensions") {
		Some(CliCore {
			subcommand: Some(Commands::Extension(ExtensionArgs {
				subcommand: ExtensionSubcommand::List(ListExtensionArgs {
					category: get_first_arg_value("category"),
					show_versions: args.contains_key("show-versions"),
				}),
				desktop_code_options,
			})),
			..Default::default()
		})
	} else if let Some(exts) = args.remove("install-extension") {
		Some(CliCore {
			subcommand: Some(Commands::Extension(ExtensionArgs {
				subcommand: ExtensionSubcommand::Install(InstallExtensionArgs {
					id_or_path: exts,
					pre_release: args.contains_key("pre-release"),
					force: args.contains_key("force"),
				}),
				desktop_code_options,
			})),
			..Default::default()
		})
	} else if let Some(exts) = args.remove("uninstall-extension") {
		Some(CliCore {
			subcommand: Some(Commands::Extension(ExtensionArgs {
				subcommand: ExtensionSubcommand::Uninstall(UninstallExtensionArgs { id: exts }),
				desktop_code_options,
			})),
			..Default::default()
		})
	} else if args.contains_key("status") {
		Some(CliCore {
			subcommand: Some(Commands::Status),
			..Default::default()
		})
	} else {
		None
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_parses_list_extensions() {
		let args = vec![
			"code",
			"--list-extensions",
			"--category",
			"themes",
			"--show-versions",
		];
		let cli = try_parse_legacy(args.into_iter()).unwrap();

		if let Some(Commands::Extension(extension_args)) = cli.subcommand {
			if let ExtensionSubcommand::List(list_args) = extension_args.subcommand {
				assert_eq!(list_args.category, Some("themes".to_string()));
				assert!(list_args.show_versions);
			} else {
				panic!(
					"Expected list subcommand, got {:?}",
					extension_args.subcommand
				);
			}
		} else {
			panic!("Expected extension subcommand, got {:?}", cli.subcommand);
		}
	}

	#[test]
	fn test_parses_install_extension() {
		let args = vec![
			"code",
			"--install-extension",
			"connor4312.codesong",
			"connor4312.hello-world",
			"--pre-release",
			"--force",
		];
		let cli = try_parse_legacy(args.into_iter()).unwrap();

		if let Some(Commands::Extension(extension_args)) = cli.subcommand {
			if let ExtensionSubcommand::Install(install_args) = extension_args.subcommand {
				assert_eq!(
					install_args.id_or_path,
					vec!["connor4312.codesong", "connor4312.hello-world"]
				);
				assert!(install_args.pre_release);
				assert!(install_args.force);
			} else {
				panic!(
					"Expected install subcommand, got {:?}",
					extension_args.subcommand
				);
			}
		} else {
			panic!("Expected extension subcommand, got {:?}", cli.subcommand);
		}
	}

	#[test]
	fn test_parses_uninstall_extension() {
		let args = vec!["code", "--uninstall-extension", "connor4312.codesong"];
		let cli = try_parse_legacy(args.into_iter()).unwrap();

		if let Some(Commands::Extension(extension_args)) = cli.subcommand {
			if let ExtensionSubcommand::Uninstall(uninstall_args) = extension_args.subcommand {
				assert_eq!(uninstall_args.id, vec!["connor4312.codesong"]);
			} else {
				panic!(
					"Expected uninstall subcommand, got {:?}",
					extension_args.subcommand
				);
			}
		} else {
			panic!("Expected extension subcommand, got {:?}", cli.subcommand);
		}
	}

	#[test]
	fn test_parses_user_data_dir_and_extensions_dir() {
		let args = vec![
			"code",
			"--uninstall-extension",
			"connor4312.codesong",
			"--user-data-dir",
			"foo",
			"--extensions-dir",
			"bar",
		];
		let cli = try_parse_legacy(args.into_iter()).unwrap();

		if let Some(Commands::Extension(extension_args)) = cli.subcommand {
			assert_eq!(
				extension_args.desktop_code_options.user_data_dir,
				Some("foo".to_string())
			);
			assert_eq!(
				extension_args.desktop_code_options.extensions_dir,
				Some("bar".to_string())
			);
			if let ExtensionSubcommand::Uninstall(uninstall_args) = extension_args.subcommand {
				assert_eq!(uninstall_args.id, vec!["connor4312.codesong"]);
			} else {
				panic!(
					"Expected uninstall subcommand, got {:?}",
					extension_args.subcommand
				);
			}
		} else {
			panic!("Expected extension subcommand, got {:?}", cli.subcommand);
		}
	}

	#[test]
	fn test_status() {
		let args = vec!["code", "--status"];
		let cli = try_parse_legacy(args.into_iter()).unwrap();

		if let Some(Commands::Status) = cli.subcommand {
			// no-op
		} else {
			panic!("Expected extension subcommand, got {:?}", cli.subcommand);
		}
	}
}
