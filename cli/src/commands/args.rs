/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{fmt, path::PathBuf};

use crate::{constants, log, options, tunnels::code_server::CodeServerArgs};
use clap::{Args, Parser, Subcommand, ValueEnum};
use const_format::concatcp;

const CLI_NAME: &str = concatcp!(constants::PRODUCT_NAME_LONG, " CLI");
const HELP_COMMANDS: &str = concatcp!(
	"Usage: ",
	constants::APPLICATION_NAME,
	" [options][paths...]

To read output from another program, append '-' (e.g. 'echo Hello World | {name} -')"
);

const STANDALONE_TEMPLATE: &str = concatcp!(
	CLI_NAME,
	" Standalone - {version}

",
	HELP_COMMANDS,
	"
Running editor commands requires installing ",
	constants::QUALITYLESS_PRODUCT_NAME,
	", and may differ slightly.

{all-args}"
);
const INTEGRATED_TEMPLATE: &str = concatcp!(
	CLI_NAME,
	" - {version}

",
	HELP_COMMANDS,
	"

{all-args}"
);

const COMMIT_IN_VERSION: &str = match constants::VSCODE_CLI_COMMIT {
	Some(c) => c,
	None => "unknown",
};
const NUMBER_IN_VERSION: &str = match constants::VSCODE_CLI_VERSION {
	Some(c) => c,
	None => "dev",
};
const VERSION: &str = concatcp!(NUMBER_IN_VERSION, " (commit ", COMMIT_IN_VERSION, ")");

#[derive(Parser, Debug, Default)]
#[clap(
   help_template = INTEGRATED_TEMPLATE,
   long_about = None,
	 name = constants::APPLICATION_NAME,
   version = VERSION,
 )]
pub struct IntegratedCli {
	#[clap(flatten)]
	pub core: CliCore,
}

/// Common CLI shared between intergated and standalone interfaces.
#[derive(Args, Debug, Default, Clone)]
pub struct CliCore {
	/// One or more files, folders, or URIs to open.
	#[clap(name = "paths")]
	pub open_paths: Vec<String>,

	#[clap(flatten, next_help_heading = Some("EDITOR OPTIONS"))]
	pub editor_options: EditorOptions,

	#[clap(flatten, next_help_heading = Some("EDITOR TROUBLESHOOTING"))]
	pub troubleshooting: EditorTroubleshooting,

	#[clap(flatten, next_help_heading = Some("GLOBAL OPTIONS"))]
	pub global_options: GlobalOptions,

	#[clap(subcommand)]
	pub subcommand: Option<Commands>,
}

#[derive(Parser, Debug, Default)]
#[clap(
   help_template = STANDALONE_TEMPLATE,
   long_about = None,
   version = VERSION,
	 name = constants::APPLICATION_NAME,
 )]
pub struct StandaloneCli {
	#[clap(flatten)]
	pub core: CliCore,

	#[clap(subcommand)]
	pub subcommand: Option<StandaloneCommands>,
}

pub enum AnyCli {
	Integrated(IntegratedCli),
	Standalone(StandaloneCli),
}

impl AnyCli {
	pub fn core(&self) -> &CliCore {
		match self {
			AnyCli::Integrated(cli) => &cli.core,
			AnyCli::Standalone(cli) => &cli.core,
		}
	}
}

impl CliCore {
	pub fn get_base_code_args(&self) -> Vec<String> {
		let mut args = self.open_paths.clone();
		self.editor_options.add_code_args(&mut args);
		self.troubleshooting.add_code_args(&mut args);
		self.global_options.add_code_args(&mut args);
		args
	}
}

impl<'a> From<&'a CliCore> for CodeServerArgs {
	fn from(cli: &'a CliCore) -> Self {
		let mut args = CodeServerArgs {
			log: cli.global_options.log,
			accept_server_license_terms: true,
			..Default::default()
		};

		args.log = cli.global_options.log;
		args.accept_server_license_terms = true;

		if cli.global_options.verbose {
			args.verbose = true;
		}

		if cli.global_options.disable_telemetry {
			args.telemetry_level = Some(options::TelemetryLevel::Off);
		} else if cli.global_options.telemetry_level.is_some() {
			args.telemetry_level = cli.global_options.telemetry_level;
		}

		args
	}
}

#[derive(Subcommand, Debug, Clone)]
pub enum StandaloneCommands {
	/// Updates the CLI.
	Update(StandaloneUpdateArgs),
}

#[derive(Args, Debug, Clone)]
pub struct StandaloneUpdateArgs {
	/// Only check for updates, without actually updating the CLI.
	#[clap(long)]
	pub check: bool,
}

#[derive(Subcommand, Debug, Clone)]

pub enum Commands {
	/// Create a tunnel that's accessible on vscode.dev from anywhere.
	/// Run `code tunnel --help` for more usage info.
	Tunnel(TunnelArgs),

	/// Manage editor extensions.
	#[clap(name = "ext")]
	Extension(ExtensionArgs),

	/// Print process usage and diagnostics information.
	Status,

	/// Changes the version of the editor you're using.
	Version(VersionArgs),

	/// Runs a local web version of VS Code.
	#[clap(about = concatcp!("Runs a local web version of ", constants::PRODUCT_NAME_LONG))]
	ServeWeb(ServeWebArgs),

	/// Runs the control server on process stdin/stdout
	#[clap(hide = true)]
	CommandShell(CommandShellArgs),
}

#[derive(Args, Debug, Clone)]
pub struct ServeWebArgs {
	/// Host to listen on, defaults to 'localhost'
	#[clap(long)]
	pub host: Option<String>,
	// The path to a socket file for the server to listen to.
	#[clap(long)]
	pub socket_path: Option<String>,
	/// Port to listen on. If 0 is passed a random free port is picked.
	#[clap(long, default_value_t = 8000)]
	pub port: u16,
	/// A secret that must be included with all requests.
	#[clap(long)]
	pub connection_token: Option<String>,
	/// A file containing a secret that must be included with all requests.
	#[clap(long)]
	pub connection_token_file: Option<String>,
	/// Run without a connection token. Only use this if the connection is secured by other means.
	#[clap(long)]
	pub without_connection_token: bool,
	/// If set, the user accepts the server license terms and the server will be started without a user prompt.
	#[clap(long)]
	pub accept_server_license_terms: bool,
	/// Specifies the path under which the web UI and the code server is provided.
	#[clap(long)]
	pub server_base_path: Option<String>,
	/// Specifies the directory that server data is kept in.
	#[clap(long)]
	pub server_data_dir: Option<String>,
	/// Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of Code.
	#[clap(long)]
	pub user_data_dir: Option<String>,
	/// Set the root path for extensions.
	#[clap(long)]
	pub extensions_dir: Option<String>,
}

#[derive(Args, Debug, Clone)]
pub struct CommandShellArgs {
	/// Listen on a socket instead of stdin/stdout.
	#[clap(long)]
	pub on_socket: bool,
	/// Listen on a port instead of stdin/stdout.
	#[clap(long, num_args = 0..=1, default_missing_value = "0")]
	pub on_port: Option<u16>,
	/// Require the given token string to be given in the handshake.
	#[clap(long, env = "VSCODE_CLI_REQUIRE_TOKEN")]
	pub require_token: Option<String>,
	/// Optional parent process id. If provided, the server will be stopped when the process of the given pid no longer exists
	#[clap(long, hide = true)]
	pub parent_process_id: Option<String>,
}

#[derive(Args, Debug, Clone)]
pub struct ExtensionArgs {
	#[clap(subcommand)]
	pub subcommand: ExtensionSubcommand,

	#[clap(flatten)]
	pub desktop_code_options: DesktopCodeOptions,
}

impl ExtensionArgs {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		self.desktop_code_options.add_code_args(target);
		self.subcommand.add_code_args(target);
	}
}

#[derive(Subcommand, Debug, Clone)]
pub enum ExtensionSubcommand {
	/// List installed extensions.
	List(ListExtensionArgs),
	/// Install an extension.
	Install(InstallExtensionArgs),
	/// Uninstall an extension.
	Uninstall(UninstallExtensionArgs),
	/// Update the installed extensions.
	Update,
}

impl ExtensionSubcommand {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		match self {
			ExtensionSubcommand::List(args) => {
				target.push("--list-extensions".to_string());
				if args.show_versions {
					target.push("--show-versions".to_string());
				}
				if let Some(category) = &args.category {
					target.push(format!("--category={}", category));
				}
			}
			ExtensionSubcommand::Install(args) => {
				for id in args.id_or_path.iter() {
					target.push(format!("--install-extension={}", id));
				}
				if args.pre_release {
					target.push("--pre-release".to_string());
				}
				if args.force {
					target.push("--force".to_string());
				}
			}
			ExtensionSubcommand::Uninstall(args) => {
				for id in args.id.iter() {
					target.push(format!("--uninstall-extension={}", id));
				}
			}
			ExtensionSubcommand::Update => {
				target.push("--update-extensions".to_string());
			}
		}
	}
}

#[derive(Args, Debug, Clone)]
pub struct ListExtensionArgs {
	/// Filters installed extensions by provided category, when using --list-extensions.
	#[clap(long, value_name = "category")]
	pub category: Option<String>,

	/// Show versions of installed extensions, when using --list-extensions.
	#[clap(long)]
	pub show_versions: bool,
}

#[derive(Args, Debug, Clone)]
pub struct InstallExtensionArgs {
	/// Either an extension id or a path to a VSIX. The identifier of an
	/// extension is '${publisher}.${name}'. Use '--force' argument to update
	/// to latest version. To install a specific version provide '@${version}'.
	/// For example: 'vscode.csharp@1.2.3'.
	#[clap(name = "ext-id | id")]
	pub id_or_path: Vec<String>,

	/// Installs the pre-release version of the extension
	#[clap(long)]
	pub pre_release: bool,

	/// Update to the latest version of the extension if it's already installed.
	#[clap(long)]
	pub force: bool,
}

#[derive(Args, Debug, Clone)]
pub struct UninstallExtensionArgs {
	/// One or more extension identifiers to uninstall. The identifier of an
	/// extension is '${publisher}.${name}'. Use '--force' argument to update
	/// to latest version.
	#[clap(name = "ext-id")]
	pub id: Vec<String>,
}

#[derive(Args, Debug, Clone)]
pub struct VersionArgs {
	#[clap(subcommand)]
	pub subcommand: VersionSubcommand,
}

#[derive(Subcommand, Debug, Clone)]
pub enum VersionSubcommand {
	/// Switches the version of the editor in use.
	Use(UseVersionArgs),

	/// Shows the currently configured editor version.
	Show,
}

#[derive(Args, Debug, Clone)]
pub struct UseVersionArgs {
	/// The version of the editor you want to use. Can be "stable", "insiders",
	/// or an absolute path to an existing install.
	#[clap(value_name = "stable | insiders | x.y.z | path")]
	pub name: String,

	/// The directory where the version can be found.
	#[clap(long, value_name = "path")]
	pub install_dir: Option<String>,
}

#[derive(Args, Debug, Default, Clone)]
pub struct EditorOptions {
	/// Compare two files with each other.
	#[clap(short, long, value_names = &["file", "file"])]
	pub diff: Vec<String>,

	/// Add folder(s) to the last active window.
	#[clap(short, long, value_name = "folder")]
	pub add: Option<String>,

	/// Open a file at the path on the specified line and character position.
	#[clap(short, long, value_name = "file:line[:character]")]
	pub goto: Option<String>,

	/// Force to open a new window.
	#[clap(short, long)]
	pub new_window: bool,

	/// Force to open a file or folder in an
	#[clap(short, long)]
	pub reuse_window: bool,

	/// Wait for the files to be closed before returning.
	#[clap(short, long)]
	pub wait: bool,

	/// The locale to use (e.g. en-US or zh-TW).
	#[clap(long, value_name = "locale")]
	pub locale: Option<String>,

	/// Enables proposed API features for extensions. Can receive one or
	/// more extension IDs to enable individually.
	#[clap(long, value_name = "ext-id")]
	pub enable_proposed_api: Vec<String>,

	#[clap(flatten)]
	pub code_options: DesktopCodeOptions,
}

impl EditorOptions {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		if !self.diff.is_empty() {
			target.push("--diff".to_string());
			for file in self.diff.iter() {
				target.push(file.clone());
			}
		}
		if let Some(add) = &self.add {
			target.push("--add".to_string());
			target.push(add.clone());
		}
		if let Some(goto) = &self.goto {
			target.push("--goto".to_string());
			target.push(goto.clone());
		}
		if self.new_window {
			target.push("--new-window".to_string());
		}
		if self.reuse_window {
			target.push("--reuse-window".to_string());
		}
		if self.wait {
			target.push("--wait".to_string());
		}
		if let Some(locale) = &self.locale {
			target.push(format!("--locale={}", locale));
		}
		if !self.enable_proposed_api.is_empty() {
			for id in self.enable_proposed_api.iter() {
				target.push(format!("--enable-proposed-api={}", id));
			}
		}
		self.code_options.add_code_args(target);
	}
}

/// Arguments applicable whenever the desktop editor is launched
#[derive(Args, Debug, Default, Clone)]
pub struct DesktopCodeOptions {
	/// Set the root path for extensions.
	#[clap(long, value_name = "dir")]
	pub extensions_dir: Option<String>,

	/// Specifies the directory that user data is kept in. Can be used to
	/// open multiple distinct instances of the editor.
	#[clap(long, value_name = "dir")]
	pub user_data_dir: Option<String>,

	/// Sets the editor version to use for this command. The preferred version
	/// can be persisted with `code version use <version>`. Can be "stable",
	/// "insiders", a version number, or an absolute path to an existing install.
	#[clap(long, value_name = "stable | insiders | x.y.z | path")]
	pub use_version: Option<String>,
}

/// Argument specifying the output format.
#[derive(Args, Debug, Clone)]
pub struct OutputFormatOptions {
	/// Set the data output formats.
	#[clap(value_enum, long, value_name = "format", default_value_t = OutputFormat::Text)]
	pub format: OutputFormat,
}

impl DesktopCodeOptions {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		if let Some(extensions_dir) = &self.extensions_dir {
			target.push(format!("--extensions-dir={}", extensions_dir));
		}
		if let Some(user_data_dir) = &self.user_data_dir {
			target.push(format!("--user-data-dir={}", user_data_dir));
		}
	}
}

#[derive(Args, Debug, Default, Clone)]
pub struct GlobalOptions {
	/// Directory where CLI metadata should be stored.
	#[clap(long, env = "VSCODE_CLI_DATA_DIR", global = true)]
	pub cli_data_dir: Option<String>,

	/// Print verbose output (implies --wait).
	#[clap(long, global = true)]
	pub verbose: bool,

	/// Log to a file in addition to stdout. Used when running as a service.
	#[clap(long, global = true, hide = true)]
	pub log_to_file: Option<PathBuf>,

	/// Log level to use.
	#[clap(long, value_enum, value_name = "level", global = true)]
	pub log: Option<log::Level>,

	/// Disable telemetry for the current command, even if it was previously
	/// accepted as part of the license prompt or specified in '--telemetry-level'
	#[clap(long, global = true, hide = true)]
	pub disable_telemetry: bool,

	/// Sets the initial telemetry level
	#[clap(value_enum, long, global = true, hide = true)]
	pub telemetry_level: Option<options::TelemetryLevel>,
}

impl GlobalOptions {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		if self.verbose {
			target.push("--verbose".to_string());
		}
		if let Some(log) = self.log {
			target.push(format!("--log={}", log));
		}
		if self.disable_telemetry {
			target.push("--disable-telemetry".to_string());
		}
		if let Some(telemetry_level) = &self.telemetry_level {
			target.push(format!("--telemetry-level={}", telemetry_level));
		}
	}
}

#[derive(Args, Debug, Default, Clone)]
pub struct EditorTroubleshooting {
	/// Run CPU profiler during startup.
	#[clap(long)]
	pub prof_startup: bool,

	/// Disable all installed extensions.
	#[clap(long)]
	pub disable_extensions: bool,

	/// Disable an extension.
	#[clap(long, value_name = "ext-id")]
	pub disable_extension: Vec<String>,

	/// Turn sync on or off.
	#[clap(value_enum, long, value_name = "on | off")]
	pub sync: Option<SyncState>,

	/// Allow debugging and profiling of extensions. Check the developer tools for the connection URI.
	#[clap(long, value_name = "port")]
	pub inspect_extensions: Option<u16>,

	/// Allow debugging and profiling of extensions with the extension host
	/// being paused after start. Check the developer tools for the connection URI.
	#[clap(long, value_name = "port")]
	pub inspect_brk_extensions: Option<u16>,

	/// Disable GPU hardware acceleration.
	#[clap(long)]
	pub disable_gpu: bool,

	/// Shows all telemetry events which the editor collects.
	#[clap(long)]
	pub telemetry: bool,
}

impl EditorTroubleshooting {
	pub fn add_code_args(&self, target: &mut Vec<String>) {
		if self.prof_startup {
			target.push("--prof-startup".to_string());
		}
		if self.disable_extensions {
			target.push("--disable-extensions".to_string());
		}
		for id in self.disable_extension.iter() {
			target.push(format!("--disable-extension={}", id));
		}
		if let Some(sync) = &self.sync {
			target.push(format!("--sync={}", sync));
		}
		if let Some(port) = &self.inspect_extensions {
			target.push(format!("--inspect-extensions={}", port));
		}
		if let Some(port) = &self.inspect_brk_extensions {
			target.push(format!("--inspect-brk-extensions={}", port));
		}
		if self.disable_gpu {
			target.push("--disable-gpu".to_string());
		}
		if self.telemetry {
			target.push("--telemetry".to_string());
		}
	}
}

#[derive(ValueEnum, Clone, Copy, Debug)]
pub enum SyncState {
	On,
	Off,
}

impl fmt::Display for SyncState {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			SyncState::Off => write!(f, "off"),
			SyncState::On => write!(f, "on"),
		}
	}
}

#[derive(ValueEnum, Clone, Copy, Debug)]
pub enum OutputFormat {
	Json,
	Text,
}

#[derive(Args, Clone, Debug, Default)]
pub struct ExistingTunnelArgs {
	/// Name you'd like to assign preexisting tunnel to use to connect the tunnel
	/// Old option, new code sohuld just use `--name`.
	#[clap(long, hide = true)]
	pub tunnel_name: Option<String>,

	/// Token to authenticate and use preexisting tunnel
	#[clap(long, hide = true)]
	pub host_token: Option<String>,

	/// ID of preexisting tunnel to use to connect the tunnel
	#[clap(long, hide = true)]
	pub tunnel_id: Option<String>,

	/// Cluster of preexisting tunnel to use to connect the tunnel
	#[clap(long, hide = true)]
	pub cluster: Option<String>,
}

#[derive(Args, Debug, Clone, Default)]
pub struct TunnelServeArgs {
	/// Optional details to connect to an existing tunnel
	#[clap(flatten, next_help_heading = Some("ADVANCED OPTIONS"))]
	pub tunnel: ExistingTunnelArgs,

	/// Randomly name machine for port forwarding service
	#[clap(long)]
	pub random_name: bool,

	/// Prevents the machine going to sleep while this command runs.
	#[clap(long)]
	pub no_sleep: bool,

	/// Sets the machine name for port forwarding service
	#[clap(long)]
	pub name: Option<String>,

	/// Optional parent process id. If provided, the server will be stopped when the process of the given pid no longer exists
	#[clap(long, hide = true)]
	pub parent_process_id: Option<String>,

	/// If set, the user accepts the server license terms and the server will be started without a user prompt.
	#[clap(long)]
	pub accept_server_license_terms: bool,

	/// Requests that extensions be preloaded and installed on connecting servers.
	#[clap(long)]
	pub install_extension: Vec<String>,

	/// Specifies the directory that server data is kept in.
	#[clap(long)]
	pub server_data_dir: Option<String>,

	/// Set the root path for extensions.
	#[clap(long)]
	pub extensions_dir: Option<String>,
}

impl TunnelServeArgs {
	pub fn apply_to_server_args(&self, csa: &mut CodeServerArgs) {
		csa.install_extensions
			.extend_from_slice(&self.install_extension);

		if let Some(d) = &self.server_data_dir {
			csa.server_data_dir = Some(d.clone());
		}

		if let Some(d) = &self.extensions_dir {
			csa.extensions_dir = Some(d.clone());
		}
	}
}

#[derive(Args, Debug, Clone)]
pub struct TunnelArgs {
	#[clap(subcommand)]
	pub subcommand: Option<TunnelSubcommand>,

	#[clap(flatten)]
	pub serve_args: TunnelServeArgs,
}

#[derive(Subcommand, Debug, Clone)]
pub enum TunnelSubcommand {
	/// Delete all servers which are currently not running.
	Prune,

	/// Stops any running tunnel on the system.
	Kill,

	/// Restarts any running tunnel on the system.
	Restart,

	/// Gets whether there is a tunnel running on the current machine.
	Status,

	/// Rename the name of this machine associated with port forwarding service.
	Rename(TunnelRenameArgs),

	/// Remove this machine's association with the port forwarding service.
	Unregister,

	#[clap(subcommand)]
	User(TunnelUserSubCommands),

	/// (Preview) Manages the tunnel when installed as a system service,
	#[clap(subcommand)]
	Service(TunnelServiceSubCommands),

	/// (Preview) Forwards local port using the dev tunnel
	#[clap(hide = true)]
	ForwardInternal(TunnelForwardArgs),
}

#[derive(Subcommand, Debug, Clone)]
pub enum TunnelServiceSubCommands {
	/// Installs or re-installs the tunnel service on the machine.
	Install(TunnelServiceInstallArgs),

	/// Uninstalls and stops the tunnel service.
	Uninstall,

	/// Shows logs for the running service.
	Log,

	/// Internal command for running the service
	#[clap(hide = true)]
	InternalRun,
}

#[derive(Args, Debug, Clone)]
pub struct TunnelServiceInstallArgs {
	/// If set, the user accepts the server license terms and the server will be started without a user prompt.
	#[clap(long)]
	pub accept_server_license_terms: bool,

	/// Sets the machine name for port forwarding service
	#[clap(long)]
	pub name: Option<String>,
}

#[derive(Args, Debug, Clone)]
pub struct TunnelRenameArgs {
	/// The name you'd like to rename your machine to.
	pub name: String,
}

#[derive(Args, Debug, Clone)]
pub struct TunnelForwardArgs {
	/// One or more ports to forward.
	pub ports: Vec<u16>,

	/// Login args -- used for convenience so the forwarding call is a single action.
	#[clap(flatten)]
	pub login: LoginArgs,
}

#[derive(Subcommand, Debug, Clone)]
pub enum TunnelUserSubCommands {
	/// Log in to port forwarding service
	Login(LoginArgs),

	/// Log out of port forwarding service
	Logout,

	/// Show the account that's logged into port forwarding service
	Show,
}

#[derive(Args, Debug, Clone)]
pub struct LoginArgs {
	/// An access token to store for authentication. Note: this will not be
	/// refreshed if it expires!
	#[clap(long, requires = "provider")]
	pub access_token: Option<String>,

	/// The auth provider to use. If not provided, a prompt will be shown.
	#[clap(value_enum, long)]
	pub provider: Option<AuthProvider>,
}

#[derive(clap::ValueEnum, Debug, Clone, Copy)]
pub enum AuthProvider {
	Microsoft,
	Github,
}
