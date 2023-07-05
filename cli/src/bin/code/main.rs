/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
mod legacy_args;

use std::process::Command;

use clap::Parser;
use cli::{
	commands::{args, tunnels, update, version, CommandContext},
	constants::get_default_user_agent,
	desktop, log,
	state::LauncherPaths,
	util::{
		errors::{wrap, AnyError},
		is_integrated_cli,
		prereqs::PreReqChecker,
	},
};
use legacy_args::try_parse_legacy;
use opentelemetry::sdk::trace::TracerProvider as SdkTracerProvider;
use opentelemetry::trace::TracerProvider;

#[tokio::main]
async fn main() -> Result<(), std::convert::Infallible> {
	let raw_args = std::env::args_os().collect::<Vec<_>>();
	let parsed = try_parse_legacy(&raw_args)
		.map(|core| args::AnyCli::Integrated(args::IntegratedCli { core }))
		.unwrap_or_else(|| {
			if let Ok(true) = is_integrated_cli() {
				args::AnyCli::Integrated(args::IntegratedCli::parse_from(&raw_args))
			} else {
				args::AnyCli::Standalone(args::StandaloneCli::parse_from(&raw_args))
			}
		});

	let core = parsed.core();
	let context_paths = LauncherPaths::migrate(core.global_options.cli_data_dir.clone()).unwrap();
	let context_args = core.clone();

	// gets a command context without installing the global logger
	let context_no_logger = || CommandContext {
		http: reqwest::ClientBuilder::new()
			.user_agent(get_default_user_agent())
			.build()
			.unwrap(),
		paths: context_paths,
		log: make_logger(&context_args),
		args: context_args,
	};

	// gets a command context with the global logger installer. Usually what most commands want.
	macro_rules! context {
		() => {{
			let context = context_no_logger();
			log::install_global_logger(context.log.clone());
			context
		}};
	}

	let result = match parsed {
		args::AnyCli::Standalone(args::StandaloneCli {
			subcommand: Some(cmd),
			..
		}) => match cmd {
			args::StandaloneCommands::Update(args) => update::update(context!(), args).await,
		},
		args::AnyCli::Standalone(args::StandaloneCli { core: c, .. })
		| args::AnyCli::Integrated(args::IntegratedCli { core: c, .. }) => match c.subcommand {
			None => {
				let context = context!();
				let ca = context.args.get_base_code_args();
				start_code(context, ca).await
			}

			Some(args::Commands::Extension(extension_args)) => {
				let context = context!();
				let mut ca = context.args.get_base_code_args();
				extension_args.add_code_args(&mut ca);
				start_code(context, ca).await
			}

			Some(args::Commands::Status) => {
				let context = context!();
				let mut ca = context.args.get_base_code_args();
				ca.push("--status".to_string());
				start_code(context, ca).await
			}

			Some(args::Commands::Version(version_args)) => match version_args.subcommand {
				args::VersionSubcommand::Use(use_version_args) => {
					version::switch_to(context!(), use_version_args).await
				}
				args::VersionSubcommand::Show => version::show(context!()).await,
			},

			Some(args::Commands::CommandShell) => tunnels::command_shell(context!()).await,

			Some(args::Commands::Tunnel(tunnel_args)) => match tunnel_args.subcommand {
				Some(args::TunnelSubcommand::Prune) => tunnels::prune(context!()).await,
				Some(args::TunnelSubcommand::Unregister) => tunnels::unregister(context!()).await,
				Some(args::TunnelSubcommand::Kill) => tunnels::kill(context!()).await,
				Some(args::TunnelSubcommand::Restart) => tunnels::restart(context!()).await,
				Some(args::TunnelSubcommand::Status) => tunnels::status(context!()).await,
				Some(args::TunnelSubcommand::Rename(rename_args)) => {
					tunnels::rename(context!(), rename_args).await
				}
				Some(args::TunnelSubcommand::User(user_command)) => {
					tunnels::user(context!(), user_command).await
				}
				Some(args::TunnelSubcommand::Service(service_args)) => {
					tunnels::service(context_no_logger(), service_args).await
				}
				None => tunnels::serve(context_no_logger(), tunnel_args.serve_args).await,
			},
		},
	};

	match result {
		Err(e) => print_and_exit(e),
		Ok(code) => std::process::exit(code),
	}
}

fn make_logger(core: &args::CliCore) -> log::Logger {
	let log_level = if core.global_options.verbose {
		log::Level::Trace
	} else {
		core.global_options.log.unwrap_or(log::Level::Info)
	};

	let tracer = SdkTracerProvider::builder().build().tracer("codecli");
	let mut log = log::Logger::new(tracer, log_level);
	if let Some(f) = &core.global_options.log_to_file {
		log = log
			.with_sink(log::FileLogSink::new(log_level, f).expect("expected to make file logger"))
	}

	log
}

fn print_and_exit<E>(err: E) -> !
where
	E: std::fmt::Display,
{
	log::emit(log::Level::Error, "", &format!("{}", err));
	std::process::exit(1);
}

async fn start_code(context: CommandContext, args: Vec<String>) -> Result<i32, AnyError> {
	// todo: once the integrated CLI takes the place of the Node.js CLI, this should
	// redirect to the current installation without using the CodeVersionManager.

	let platform = PreReqChecker::new().verify().await?;
	let version_manager =
		desktop::CodeVersionManager::new(context.log.clone(), &context.paths, platform);
	let version = match &context.args.editor_options.code_options.use_version {
		Some(v) => desktop::RequestedVersion::try_from(v.as_str())?,
		None => version_manager.get_preferred_version(),
	};

	let binary = match version_manager.try_get_entrypoint(&version).await {
		Some(ep) => ep,
		None => {
			desktop::prompt_to_install(&version);
			return Ok(1);
		}
	};

	let code = Command::new(&binary)
		.args(args)
		.status()
		.map(|s| s.code().unwrap_or(1))
		.map_err(|e| wrap(e, format!("error running editor from {}", binary.display())))?;

	Ok(code)
}
