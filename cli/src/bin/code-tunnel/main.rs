/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use clap::Parser;
use cli::{
	commands::{args, tunnels, CommandContext},
	constants, log as own_log,
	state::LauncherPaths,
};
use opentelemetry::sdk::trace::TracerProvider as SdkTracerProvider;
use opentelemetry::trace::TracerProvider;

use log::{Level, Metadata, Record};

#[derive(Parser, Debug)]
#[clap(
   long_about = None,
   name = "Visual Studio Code Tunnels CLI",
   version = match constants::VSCODE_CLI_VERSION { Some(v) => v, None => "dev" },
 )]
pub struct TunnelCli {
	#[clap(flatten, next_help_heading = Some("GLOBAL OPTIONS"))]
	pub global_options: args::GlobalOptions,

	#[clap(flatten, next_help_heading = Some("TUNNEL OPTIONS"))]
	pub tunnel_options: args::TunnelArgs,
}

/// Entrypoint for a standalone "code-tunnel" subcommand. This is a temporary
/// artifact until we're ready to do swap to the full "code" CLI, and most
/// code in here is duplicated from `src/bin/code/main.rs`
#[tokio::main]
async fn main() -> Result<(), std::convert::Infallible> {
	let parsed = TunnelCli::parse();
	let context = CommandContext {
		http: reqwest::Client::new(),
		paths: LauncherPaths::new(&parsed.global_options.cli_data_dir).unwrap(),
		log: own_log::Logger::new(
			SdkTracerProvider::builder().build().tracer("codecli"),
			if parsed.global_options.verbose {
				own_log::Level::Trace
			} else {
				parsed.global_options.log.unwrap_or(own_log::Level::Info)
			},
		),
		args: args::Cli {
			global_options: parsed.global_options,
			subcommand: Some(args::Commands::Tunnel(parsed.tunnel_options.clone())),
			..Default::default()
		},
	};

	log::set_logger(Box::leak(Box::new(RustyLogger(context.log.clone()))))
		.map(|()| log::set_max_level(log::LevelFilter::Debug))
		.expect("expected to make logger");

	let result = match parsed.tunnel_options.subcommand {
		Some(args::TunnelSubcommand::Prune) => tunnels::prune(context).await,
		Some(args::TunnelSubcommand::Unregister) => tunnels::unregister(context).await,
		Some(args::TunnelSubcommand::Rename(rename_args)) => {
			tunnels::rename(context, rename_args).await
		}
		Some(args::TunnelSubcommand::User(user_command)) => {
			tunnels::user(context, user_command).await
		}
		Some(args::TunnelSubcommand::Service(service_args)) => {
			tunnels::service(context, service_args).await
		}
		None => tunnels::serve(context, parsed.tunnel_options.serve_args).await,
	};

	match result {
		Err(e) => print_and_exit(e),
		Ok(code) => std::process::exit(code),
	}
}

fn print_and_exit<E>(err: E) -> !
where
	E: std::fmt::Display,
{
	own_log::emit(own_log::Level::Error, "", &format!("{}", err));
	std::process::exit(1);
}

/// Logger that uses the common rust "log" crate and directs back to one of
/// our managed loggers.
struct RustyLogger(own_log::Logger);

impl log::Log for RustyLogger {
	fn enabled(&self, metadata: &Metadata) -> bool {
		metadata.level() <= Level::Debug
	}

	fn log(&self, record: &Record) {
		if !self.enabled(record.metadata()) {
			return;
		}

		// exclude noisy log modules:
		let src = match record.module_path() {
			Some("russh::cipher") => return,
			Some("russh::negotiation") => return,
			Some(s) => s,
			None => "<unknown>",
		};

		self.0.emit(
			match record.level() {
				log::Level::Debug => own_log::Level::Debug,
				log::Level::Error => own_log::Level::Error,
				log::Level::Info => own_log::Level::Info,
				log::Level::Trace => own_log::Level::Trace,
				log::Level::Warn => own_log::Level::Warn,
			},
			&format!("[{}] {}", src, record.args()),
		);
	}

	fn flush(&self) {}
}
