# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# TODO: Dynamically enable depending on quality?
Microsoft.PowerShell.Core\Register-ArgumentCompleter -CommandName "code","code-insiders" -Native -ScriptBlock {
	param($wordToComplete, $commandAst, $cursorPosition)

	# TODO: These tooltips could be localized?
	# TODO: Context aware suggestions
	# TODO: Auto-generate this
	# TODO: Subcommands
	@(
		[System.Management.Automation.CompletionResult]::new("--add", "--add", 'ParameterName', 'Add folder(s) to the last active window.'),
		[System.Management.Automation.CompletionResult]::new("--category", "--category", 'ParameterName', 'Filters installed extensions by provided category, when using --list-extensions.'),
		[System.Management.Automation.CompletionResult]::new("--diff", "--diff", 'ParameterName', 'Compare two files with each other.'),
		[System.Management.Automation.CompletionResult]::new("--disable-chromium-sandbox", "--disable-chromium-sandbox", 'ParameterName', 'Use this option only when there is requirement to launch the application as sudo user on Linux or when running as an elevated user in an applocker environment on Windows.'),
		[System.Management.Automation.CompletionResult]::new("--disable-extension", "--disable-extension", 'ParameterName', 'Disable the provided extension. This option is not persisted and is effective only when the command opens a new window.'),
		[System.Management.Automation.CompletionResult]::new("--disable-extensions", "--disable-extensions", 'ParameterName', 'Disable all installed extensions. This option is not persisted and is effective only when the command opens a new window.'),
		[System.Management.Automation.CompletionResult]::new("--disable-gpu", "--disable-gpu", 'ParameterName', 'Disable GPU hardware acceleration.'),
		[System.Management.Automation.CompletionResult]::new("--disable-lcd-text", "--disable-lcd-text", 'ParameterName', 'Disable LCD font rendering.'),
		[System.Management.Automation.CompletionResult]::new("--enable-proposed-api", "--enable-proposed-api", 'ParameterName', 'Enables proposed API features for extensions. Can receive one or more extension IDs to enable individually.'),
		[System.Management.Automation.CompletionResult]::new("--extensions-dir", "--extensions-dir", 'ParameterName', 'Set the root path for extensions.'),
		[System.Management.Automation.CompletionResult]::new("--goto", "--goto", 'ParameterName', 'Open a file at the path on the specified line and character position.'),
		[System.Management.Automation.CompletionResult]::new("--help", "--help", 'ParameterName', 'Print usage.'),
		[System.Management.Automation.CompletionResult]::new("--inspect-brk-extensions", "--inspect-brk-extensions", 'ParameterName', 'Allow debugging and profiling of extensions with the extension host being paused after start. Check the developer tools for the connection URI.'),
		[System.Management.Automation.CompletionResult]::new("--inspect-extensions", "--inspect-extensions", 'ParameterName', 'Allow debugging and profiling of extensions. Check the developer tools for the connection URI.'),
		[System.Management.Automation.CompletionResult]::new("--install-extension", "--install-extension", 'ParameterName', 'Installs or updates an extension. The argument is either an extension id or a path to a VSIX. The identifier of an extension is ''${publisher}.${name}''. Use ''--force'' argument to update to latest version. To install a specific version provide ''@${version}''. For example: ''vscode.csharp@1.2.3''.'),
		[System.Management.Automation.CompletionResult]::new("--list-extensions", "--list-extensions", 'ParameterName', 'List the installed extensions.'),
		[System.Management.Automation.CompletionResult]::new("--locale", "--locale", 'ParameterName', 'The locale to use (e.g. en-US or zh-TW).'),
		[System.Management.Automation.CompletionResult]::new("--log", "--log", 'ParameterName', 'Log level to use. Default is ''info''. Allowed values are ''critical'', ''error'', ''warn'', ''info'', ''debug'', ''trace'', ''off''. You can also configure the log level of an extension by passing extension id and log level in the following format:\n\n ''${publisher}.${name}:${logLevel}''. For example: ''vscode.csharp:trace''. Can receive one or more such entries.'),
		[System.Management.Automation.CompletionResult]::new("--merge", "--merge", 'ParameterName', 'Perform a three-way merge by providing paths for two modified versions of a file, the common origin of both modified versions and the output file to save merge results.'),
		[System.Management.Automation.CompletionResult]::new("--new-window", "--new-window", 'ParameterName', 'Force to open a new window.'),
		[System.Management.Automation.CompletionResult]::new("--pre-release", "--pre-release", 'ParameterName', 'Installs the pre-release version of the extension, when using'),
		[System.Management.Automation.CompletionResult]::new("--prof-startup", "--prof-startup", 'ParameterName', 'Run CPU profiler during startup.'),
		[System.Management.Automation.CompletionResult]::new("--profile", "--profile", 'ParameterName', 'Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created.'),
		[System.Management.Automation.CompletionResult]::new("--reuse-window", "--reuse-window", 'ParameterName', 'Force to open a file or folder in an already opened window.'),
		[System.Management.Automation.CompletionResult]::new("--show-versions", "--show-versions", 'ParameterName', 'Show versions of installed extensions, when using --list-extensions.'),
		[System.Management.Automation.CompletionResult]::new("--status", "--status", 'ParameterName', 'Print process usage and diagnostics information.'),
		[System.Management.Automation.CompletionResult]::new("--sync", "--sync", 'ParameterName', 'Turn sync on or off.'),
		[System.Management.Automation.CompletionResult]::new("--telemetry", "--telemetry", 'ParameterName', 'Shows all telemetry events which VS code collects.'),
		[System.Management.Automation.CompletionResult]::new("--uninstall-extension", "--uninstall-extension", 'ParameterName', 'Uninstalls an extension.'),
		[System.Management.Automation.CompletionResult]::new("--update-extensions", "--update-extensions", 'ParameterName', 'Update the installed extensions.'),
		[System.Management.Automation.CompletionResult]::new("--user-data-dir", "--user-data-dir", 'ParameterName', 'Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of Code.'),
		[System.Management.Automation.CompletionResult]::new("--verbose", "--verbose", 'ParameterName', 'Print verbose output (implies --wait).'),
		[System.Management.Automation.CompletionResult]::new("--version", "--version", 'ParameterName', 'Print version.'),
		[System.Management.Automation.CompletionResult]::new("--wait", "--wait", 'ParameterName', 'Wait for the files to be closed before returning.'),
		[System.Management.Automation.CompletionResult]::new("-a", "-a", 'ParameterName', 'Add folder(s) to the last active window.'),
		[System.Management.Automation.CompletionResult]::new("-d", "-d", 'ParameterName', 'Compare two files with each other.'),
		[System.Management.Automation.CompletionResult]::new("-g", "-g", 'ParameterName', 'Open a file at the path on the specified line and character position.'),
		[System.Management.Automation.CompletionResult]::new("-h", "-h", 'ParameterName', 'Print usage.'),
		[System.Management.Automation.CompletionResult]::new("-m", "-m", 'ParameterName', 'Perform a three-way merge by providing paths for two modified versions of a file, the common origin of both modified versions and the output file to save merge results.'),
		[System.Management.Automation.CompletionResult]::new("-n", "-n", 'ParameterName', 'Force to open a new window.'),
		[System.Management.Automation.CompletionResult]::new("-r", "-r", 'ParameterName', 'Force to open a file or folder in an already opened window.'),
		[System.Management.Automation.CompletionResult]::new("-s", "-s", 'ParameterName', 'Print process usage and diagnostics information.'),
		[System.Management.Automation.CompletionResult]::new("-v", "-v", 'ParameterName', 'Print version.'),
		[System.Management.Automation.CompletionResult]::new("-w", "-w", 'ParameterName', 'Wait for the files to be closed before returning.'),
		[System.Management.Automation.CompletionResult]::new("serve-web", "serve-web", 'Command', 'Run a server that displays the editor UI in browsers.')
		[System.Management.Automation.CompletionResult]::new("tunnel", "tunnel", 'Command', 'Make the current machine accessible from vscode.dev or other machines through a secure tunnel')
	)
}
