# %~dp0.. in CMD
$tilde_dp0_parent = Split-Path -Parent (Split-Path -Parent $MyInvocation.Mycommand.Path)

$env:VSCODE_DEV = ""
$env:ELECTRON_RUN_AS_NODE = "1"
&(Join-Path $tilde_dp0_parent "@@NAME@@.exe") (Join-Path $tilde_dp0_parent "resources" | Join-Path -ChildPath "app" | Join-Path -ChildPath "out" | Join-Path -ChildPath "cli.js") $args
