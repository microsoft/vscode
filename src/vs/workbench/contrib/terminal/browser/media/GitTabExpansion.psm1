# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

# This is a fork of posh-git that has been modified to add additional features and custom VS Code
# specific integrations.
#
# Copyright (c) 2010-2018 Keith Dahlby, Keith Hill, and contributors
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

function dbg($Message, [Diagnostics.Stopwatch]$Stopwatch) {
	if ($Stopwatch) {
		Write-Verbose ('{0:00000}:{1}' -f $Stopwatch.ElapsedMilliseconds,$Message) -Verbose # -ForegroundColor Yellow
	}
}

function Get-AliasPattern($cmd) {
	$aliases = @($cmd) + @(Get-Alias | Where-Object { $_.Definition -match "^$cmd(\.exe)?$" } | Foreach-Object Name)
	"($($aliases -join '|'))"
}

$Global:GitTabSettings = New-Object PSObject -Property @{
	AllCommands = $false
	KnownAliases = @{
		'!f() { exec vsts code pr "$@"; }; f' = 'vsts.pr'
	}
	EnableLogging = $false
	LogPath = Join-Path ([System.IO.Path]::GetTempPath()) posh-git_tabexp.log
	RegisteredCommands = ""
}

$subcommands = @{
	bisect = "start bad good skip reset visualize replay log run"
	notes = 'add append copy edit get-ref list merge prune remove show'
	'vsts.pr' = 'create update show list complete abandon reactivate reviewers work-items set-vote policies'
	reflog = "show delete expire"
	remote = "
		add rename remove set-head set-branches
		get-url set-url show prune update
		"
	rerere = "clear forget diff remaining status gc"
	stash = 'push save list show apply clear drop pop create branch'
	submodule = "add status init deinit update summary foreach sync"
	svn = "
		init fetch clone rebase dcommit log find-rev
		set-tree commit-diff info create-ignore propget
		proplist show-ignore show-externals branch tag blame
		migrate mkdirs reset gc
		"
	tfs = "
		list-remote-branches clone quick-clone bootstrap init
		clone fetch pull quick-clone unshelve shelve-list labels
		rcheckin checkin checkintool shelve shelve-delete
		branch
		info cleanup cleanup-workspaces help verify autotag subtree reset-remote checkout
		"
	flow = "init feature bugfix release hotfix support help version"
	worktree = "add list lock move prune remove unlock"
}

$gitflowsubcommands = @{
	init = 'help'
	feature = 'list start finish publish track diff rebase checkout pull help delete'
	bugfix = 'list start finish publish track diff rebase checkout pull help delete'
	release = 'list start finish track publish help delete'
	hotfix = 'list start finish track publish help delete'
	support = 'list start help'
	config = 'list set base'
}

function script:gitCmdOperations($commands, $command, $filter) {
	$commands[$command].Trim() -split '\s+' | Where-Object { $_ -like "$filter*" }
}

$script:someCommands = @(
	'add','am','annotate','archive','bisect','blame','branch','bundle','checkout','cherry',
	'cherry-pick','citool','clean','clone','commit','config','describe','diff','difftool','fetch',
	'format-patch','gc','grep','gui','help','init','instaweb','log','merge','mergetool','mv',
	'notes','prune','pull','push','rebase','reflog','remote','rerere','reset','restore','revert','rm',
	'shortlog','show','stash','status','submodule','svn','switch','tag','whatchanged', 'worktree'
)

# Based on git help -a output
$script:someCommandsDescriptions =  @{
	# Main Porcelain Commands"
	add = "Add file contents to the index"
	am = "Apply a series of patches from a mailbox"
	archive = "Create an archive of files from a named tree"
	bisect = "Use binary search to find the commit that introduced a bug"
	branch = "List, create, or delete branches"
	bundle = "Move objects and refs by archive"
	checkout = "Switch branches or restore working tree files"
	"cherry-pick" = "Apply the changes introduced by some existing commits"
	citool = "Graphical alternative to git-commit"
	clean = "Remove untracked files from the working tree"
	clone = "Clone a repository into a new directory"
	commit = "Record changes to the repository"
	describe = "Give an object a human readable name based on an available ref"
	diff = "Show changes between commits, commit and working tree, etc"
	fetch = "Download objects and refs from another repository"
	"format-patch" = "Prepare patches for e-mail submission"
	gc = "Cleanup unnecessary files and optimize the local repository"
	grep = "Print lines matching a pattern"
	gui = "A portable graphical interface to Git"
	init = "Create an empty Git repository or reinitialize an existing one"
	log = "Show commit logs"
	merge = "Join two or more development histories together"
	mv = "Move or rename a file, a directory, or a symlink"
	notes = "Add or inspect object notes"
	pull = "Fetch from and integrate with another repository or a local branch"
	push = "Update remote refs along with associated objects"
	rebase = "Reapply commits on top of another base tip"
	reset = "Reset current HEAD to the specified state"
	restore = "Restore working tree files"
	revert = "Revert some existing commits"
	rm = "Remove files from the working tree and from the index"
	shortlog = "Summarize 'git log' output"
	show = "Show various types of objects"
	stash = "Stash the changes in a dirty working directory away"
	status = "Show the working tree status"
	submodule = "Initialize, update or inspect submodules"
	switch = "Switch branches"
	tag = "Create, list, delete or verify a tag object signed with GPG"
	worktree = "Manage multiple working trees"

	# Ancillary Commands / Manipulators
	config = "Get and set repository or global options"
	mergetool = "Run merge conflict resolution tools to resolve merge conflicts"
	"pack-refs" = "Pack heads and tags for efficient repository access"
	prune = "Prune all unreachable objects from the object database"
	reflog = "Manage reflog information"
	remote = "Manage set of tracked repositories"

	# Ancillary Commands / Interrogators
	annotate = "Annotate file lines with commit information"
	blame = "Show what revision and author last modified each line of a file"
	difftool = "Show changes using common diff tools"
	help = "Display help information about Git"
	rerere = "Reuse recorded resolution of conflicted merges"
	whatchanged = "Show logs with differences each commit introduces"

	# Low-level Commands / Interrogators
	cherry = "Find commits yet to be applied to upstream"
}



if ((($PSVersionTable.PSVersion.Major -eq 5) -or $IsWindows) -and ($script:GitVersion -ge [System.Version]'2.16.2')) {
	$script:someCommands += 'update-git-for-windows'
}

$script:gitCommandsWithLongParams = $longGitParams.Keys -join '|'
$script:gitCommandsWithShortParams = $shortGitParams.Keys -join '|'
$script:gitCommandsWithParamValues = $gitParamValues.Keys -join '|'
$script:vstsCommandsWithShortParams = $shortVstsParams.Keys -join '|'
$script:vstsCommandsWithLongParams = $longVstsParams.Keys -join '|'

try {
	if ($null -ne (git help -a 2>&1 | Select-String flow)) {
		$script:someCommands += 'flow'
	}
}
catch {
	Write-Debug "Search for 'flow' in 'git help' output failed with error: $_"
}

filter quoteStringWithSpecialChars {
	if ($_ -and ($_ -match '\s+|#|@|\$|;|,|''|\{|\}|\(|\)')) {
		$str = $_ -replace "'", "''"
		"'$str'"
	}
	else {
		$_
	}
}

function script:gitCommands($filter, $includeAliases) {
	$cmdList = @()
	if (-not $global:GitTabSettings.AllCommands) {
		$cmdList += $someCommands -like "$filter*"
	}
	else {
		$cmdList += git help --all |
			Where-Object { $_ -match '^\s{2,}\S.*' } |
			ForEach-Object { $_.Split(' ', [StringSplitOptions]::RemoveEmptyEntries) } |
			Where-Object { $_ -like "$filter*" }
	}

	$completions = $cmdList | Sort-Object | ForEach-Object {
		$command = $_
		if ($script:someCommandsDescriptions.ContainsKey($command)) {
			[System.Management.Automation.CompletionResult]::new($command, $command, 'Method', $script:someCommandsDescriptions[$command])
		} else {
			[System.Management.Automation.CompletionResult]::new($command, $command, 'Method', $command)
		}
	}

	if ($includeAliases) {
		$completions += gitAliases $filter
	}

	$completions
}

function script:gitRemotes($filter) {
	git remote |
		Where-Object { $_ -like "$filter*" } |
		quoteStringWithSpecialChars
}

function script:gitBranches($filter, $includeHEAD = $false, $prefix = '') {
	if ($filter -match "^(?<from>\S*\.{2,3})(?<to>.*)") {
		$prefix += $matches['from']
		$filter = $matches['to']
	}

	$branches = @(git branch --no-color | ForEach-Object { if (($_ -notmatch "^\* \(HEAD detached .+\)$") -and ($_ -match "^[\*\+]?\s*(?<ref>\S+)(?: -> .+)?")) { $matches['ref'] } }) +
				@(git branch --no-color -r | ForEach-Object { if ($_ -match "^  (?<ref>\S+)(?: -> .+)?") { $matches['ref'] } }) +
				@(if ($includeHEAD) { 'HEAD','FETCH_HEAD','ORIG_HEAD','MERGE_HEAD' })

	$branches |
		Where-Object { $_ -ne '(no branch)' -and $_ -like "$filter*" } |
		ForEach-Object { $prefix + $_ } |
		quoteStringWithSpecialChars
}

function script:gitRemoteUniqueBranches($filter) {
	git branch --no-color -r |
		ForEach-Object { if ($_ -match "^  (?<remote>[^/]+)/(?<branch>\S+)(?! -> .+)?$") { $matches['branch'] } } |
		Group-Object -NoElement |
		Where-Object { $_.Count -eq 1 } |
		Select-Object -ExpandProperty Name |
		Where-Object { $_ -like "$filter*" } |
		quoteStringWithSpecialChars
}

function script:gitConfigKeys($section, $filter, $defaultOptions = '') {
	$completions = @($defaultOptions -split ' ')

	git config --name-only --get-regexp ^$section\..* |
		ForEach-Object { $completions += ($_ -replace "$section\.","") }

	return $completions |
		Where-Object { $_ -like "$filter*" } |
		Sort-Object |
		quoteStringWithSpecialChars
}

function script:gitTags($filter, $prefix = '') {
	git tag |
		Where-Object { $_ -like "$filter*" } |
		ForEach-Object { $prefix + $_ } |
		quoteStringWithSpecialChars
}

function script:gitFeatures($filter, $command) {
	$featurePrefix = git config --local --get "gitflow.prefix.$command"
	$branches = @(git branch --no-color | ForEach-Object { if ($_ -match "^\*?\s*$featurePrefix(?<ref>.*)") { $matches['ref'] } })
	$branches |
		Where-Object { $_ -ne '(no branch)' -and $_ -like "$filter*" } |
		ForEach-Object { $featurePrefix + $_ } |
		quoteStringWithSpecialChars
}

function script:gitRemoteBranches($remote, $ref, $filter, $prefix = '') {
	git branch --no-color -r |
		Where-Object { $_ -like "  $remote/$filter*" } |
		ForEach-Object { $prefix + $ref + ($_ -replace "  $remote/","") } |
		quoteStringWithSpecialChars
}

function script:gitStashes($filter) {
	(git stash list) -replace ':.*','' |
		Where-Object { $_ -like "$filter*" } |
		quoteStringWithSpecialChars
}

function script:gitTfsShelvesets($filter) {
	(git tfs shelve-list) |
		Where-Object { $_ -like "$filter*" } |
		quoteStringWithSpecialChars
}

function script:gitFiles($filter, $files) {
	$files | Sort-Object |
		Where-Object { $_ -like "$filter*" } |
		quoteStringWithSpecialChars
}

function script:gitIndex($GitStatus, $filter) {
	gitFiles $filter $GitStatus.Index
}

function script:gitAddFiles($GitStatus, $filter) {
	gitFiles $filter (@($GitStatus.Working.Unmerged) + @($GitStatus.Working.Modified) + @($GitStatus.Working.Added))
}

function script:gitCheckoutFiles($GitStatus, $filter) {
	gitFiles $filter (@($GitStatus.Working.Unmerged) + @($GitStatus.Working.Modified) + @($GitStatus.Working.Deleted))
}

function script:gitDeleted($GitStatus, $filter) {
	gitFiles $filter $GitStatus.Working.Deleted
}

function script:gitDiffFiles($GitStatus, $filter, $staged) {
	if ($staged) {
		gitFiles $filter $GitStatus.Index.Modified
	}
	else {
		gitFiles $filter (@($GitStatus.Working.Unmerged) + @($GitStatus.Working.Modified) + @($GitStatus.Index.Modified))
	}
}

function script:gitMergeFiles($GitStatus, $filter) {
	gitFiles $filter $GitStatus.Working.Unmerged
}

function script:gitRestoreFiles($GitStatus, $filter, $staged) {
	if ($staged) {
		gitFiles $filter (@($GitStatus.Index.Added) + @($GitStatus.Index.Modified) + @($GitStatus.Index.Deleted))
	}
	else {
		gitFiles $filter (@($GitStatus.Working.Unmerged) + @($GitStatus.Working.Modified) + @($GitStatus.Working.Deleted))
	}
}

function script:gitAliases($filter) {
	git config --get-regexp ^alias\. | ForEach-Object {
		if ($_ -match "^alias\.(?<alias>\S+) (?<expanded>.+)") {
			$alias = $Matches['alias']
			$expanded = $Matches['expanded']
			if ($alias -like "$filter*") {
				[System.Management.Automation.CompletionResult]::new($alias, $alias, 'Variable', $expanded)
			}
		}
	}
}

function script:expandGitAlias($cmd, $rest) {
	$alias = git config "alias.$cmd"

	if ($alias) {
		$known = $Global:GitTabSettings.KnownAliases[$alias]
		if ($known) {
			return "git $known$rest"
		}

		return "git $alias$rest"
	}
	else {
		return "git $cmd$rest"
	}
}

function script:expandLongParams($hash, $cmd, $filter) {
	$hash[$cmd].Trim() -split ' ' |
		Where-Object { $_ -like "$filter*" } |
		Sort-Object |
		ForEach-Object { -join ("--", $_) }
}

function script:expandShortParams($hash, $cmd, $filter) {
	$hash[$cmd].Trim() -split ' ' |
		Where-Object { $_ -like "$filter*" } |
		Sort-Object |
		ForEach-Object { -join ("-", $_) }
}

function script:expandParamValues($cmd, $param, $filter) {
	$paramValues = $gitParamValues[$cmd][$param]

	$completions = if ($paramValues -is [scriptblock]) {
		& $paramValues $filter
	}
	else {
		$paramValues.Trim() -split ' ' | Where-Object { $_ -like "$filter*" } | Sort-Object
	}

	$completions | ForEach-Object { -join ("--", $param, "=", $_) }
}

function Expand-GitCommand($Command) {
	# Parse all Git output as UTF8, including tab completion output - https://github.com/dahlbyk/posh-git/pull/359
	$res = GitTabExpansionInternal $Command $Global:GitStatus
	$res
}

function GitTabExpansionInternal($lastBlock, $GitStatus = $null) {
	$ignoreGitParams = '(?<params>\s+-(?:[aA-zZ0-9]+|-[aA-zZ0-9][aA-zZ0-9-]*)(?:=\S+)?)*'

	if ($lastBlock -match "^$(Get-AliasPattern git) (?<cmd>\S+)(?<args> .*)$") {
		$lastBlock = expandGitAlias $Matches['cmd'] $Matches['args']
	}

	# Handles tgit <command> (tortoisegit)
	if ($lastBlock -match "^$(Get-AliasPattern tgit) (?<cmd>\S*)$") {
		# Need return statement to prevent fall-through.
		return $Global:TortoiseGitSettings.TortoiseGitCommands.Keys.GetEnumerator() | Sort-Object | Where-Object { $_ -like "$($matches['cmd'])*" }
	}

	# Handles gitk
	if ($lastBlock -match "^$(Get-AliasPattern gitk).* (?<ref>\S*)$") {
		return gitBranches $matches['ref'] $true
	}

	switch -regex ($lastBlock -replace "^$(Get-AliasPattern git) ","") {

		# Handles git <cmd> <op>
		"^(?<cmd>$($subcommands.Keys -join '|'))\s+(?<op>\S*)$" {
			gitCmdOperations $subcommands $matches['cmd'] $matches['op']
		}

		# Handles git flow <cmd> <op>
		"^flow (?<cmd>$($gitflowsubcommands.Keys -join '|'))\s+(?<op>\S*)$" {
			gitCmdOperations $gitflowsubcommands $matches['cmd'] $matches['op']
		}

		# Handles git flow <command> <op> <name>
		"^flow (?<command>\S*)\s+(?<op>\S*)\s+(?<name>\S*)$" {
			gitFeatures $matches['name'] $matches['command']
		}

		# Handles git remote (rename|rm|remove|set-head|set-branches|set-url|show|prune) <stash>
		"^remote.* (?:rename|rm|remove|set-head|set-branches|set-url|show|prune).* (?<remote>\S*)$" {
			gitRemotes $matches['remote'] | ConvertTo-VscodeCompletion -Type 'remote'
		}

		# Handles git stash (show|apply|drop|pop|branch) <stash>
		"^stash (?:show|apply|drop|pop|branch).* (?<stash>\S*)$" {
			gitStashes $matches['stash'] | ConvertTo-VscodeCompletion -Type 'stash'
		}

		# Handles git bisect (bad|good|reset|skip) <ref>
		"^bisect (?:bad|good|reset|skip).* (?<ref>\S*)$" {
			gitBranches $matches['ref'] $true | ConvertTo-VscodeCompletion -Type 'branch'
		}

		# Handles git tfs unshelve <shelveset>
		"^tfs +unshelve.* (?<shelveset>\S*)$" {
			gitTfsShelvesets $matches['shelveset']
		}

		# Handles git branch -d|-D|-m|-M <branch name>
		# Handles git branch <branch name> <start-point>
		"^branch.* (?<branch>\S*)$" {
			gitBranches $matches['branch'] | ConvertTo-VscodeCompletion -Type 'branch'
		}

		# Handles git <cmd> (commands & aliases)
		"^(?<cmd>\S*)$" {
			gitCommands $matches['cmd'] $TRUE
		}

		# Handles git help <cmd> (commands only)
		"^help (?<cmd>\S*)$" {
			gitCommands $matches['cmd'] $FALSE
		}

		# Handles git push remote <ref>:<branch>
		# Handles git push remote +<ref>:<branch>
		"^push${ignoreGitParams}\s+(?<remote>[^\s-]\S*).*\s+(?<force>\+?)(?<ref>[^\s\:]*\:)(?<branch>\S*)$" {
			gitRemoteBranches $matches['remote'] $matches['ref'] $matches['branch'] -prefix $matches['force'] | ConvertTo-VscodeCompletion -Type 'branch'
		}

		# Handles git push remote <ref>
		# Handles git push remote +<ref>
		# Handles git pull remote <ref>
		"^(?:push|pull)${ignoreGitParams}\s+(?<remote>[^\s-]\S*).*\s+(?<force>\+?)(?<ref>[^\s\:]*)$" {
			gitBranches $matches['ref'] -prefix $matches['force'] | ConvertTo-VscodeCompletion -Type 'branch'
			gitTags $matches['ref'] -prefix $matches['force'] | ConvertTo-VscodeCompletion -Type 'tag'
		}

		# Handles git pull <remote>
		# Handles git push <remote>
		# Handles git fetch <remote>
		"^(?:push|pull|fetch)${ignoreGitParams}\s+(?<remote>\S*)$" {
			gitRemotes $matches['remote'] | ConvertTo-VscodeCompletion -Type 'remote'
		}

		# Handles git reset HEAD <path>
		# Handles git reset HEAD -- <path>
		"^reset.* HEAD(?:\s+--)? (?<path>\S*)$" {
			gitIndex $GitStatus $matches['path']
		}

		# Handles git <cmd> <ref>
		"^commit.*-C\s+(?<ref>\S*)$" {
			gitBranches $matches['ref'] $true | ConvertTo-VscodeCompletion -Type 'branch'
		}

		# Handles git add <path>
		"^add.* (?<files>\S*)$" {
			gitAddFiles $GitStatus $matches['files']
		}

		# Handles git checkout -- <path>
		"^checkout.* -- (?<files>\S*)$" {
			gitCheckoutFiles $GitStatus $matches['files']
		}

		# Handles git restore -s <ref> / --source=<ref> - must come before the next regex case
		"^restore.* (?-i)(-s\s*|(?<source>--source=))(?<ref>\S*)$" {
			gitBranches $matches['ref'] $true $matches['source']
			gitTags $matches['ref']
			break
		}

		# Handles git restore <path>
		"^restore(?:.* (?<staged>(?:(?-i)-S|--staged))|.*) (?<files>\S*)$" {
			gitRestoreFiles $GitStatus $matches['files'] $matches['staged']
		}

		# Handles git rm <path>
		"^rm.* (?<index>\S*)$" {
			gitDeleted $GitStatus $matches['index']
		}

		# Handles git diff/difftool <path>
		"^(?:diff|difftool)(?:.* (?<staged>(?:--cached|--staged))|.*) (?<files>\S*)$" {
			gitDiffFiles $GitStatus $matches['files'] $matches['staged']
		}

		# Handles git merge/mergetool <path>
		"^(?:merge|mergetool).* (?<files>\S*)$" {
			gitMergeFiles $GitStatus $matches['files']
		}

		# Handles git checkout|switch <ref>
		"^(?:checkout|switch).* (?<ref>\S*)$" {
			& {
				& {
					gitBranches $matches['ref'] $true
					gitRemoteUniqueBranches $matches['ref']
					# Return only unique branches (to eliminate duplicates where the branch exists locally and on the remote)
				} | Select-Object -Unique | ConvertTo-VscodeCompletion -Type 'branch'

				gitTags $matches['ref'] | Select-Object -Unique | ConvertTo-VscodeCompletion -Type 'tag'
			}
		}

		# Handles git worktree add <path> <ref>
		"^worktree add.* (?<files>\S+) (?<ref>\S*)$" {
			gitBranches $matches['ref'] | ConvertTo-VscodeCompletion -Type 'branch'
		}

		# Handles git <cmd> <ref>
		"^(?:cherry|cherry-pick|diff|difftool|log|merge|rebase|reflog\s+show|reset|revert|show).* (?<ref>\S*)$" {
			gitBranches $matches['ref'] $true | ConvertTo-VscodeCompletion -Type 'branch'
			gitTags $matches['ref'] | ConvertTo-VscodeCompletion -Type 'tag'
		}

		# Handles git <cmd> --<param>=<value>
		"^(?<cmd>$gitCommandsWithParamValues).* --(?<param>[^=]+)=(?<value>\S*)$" {
			expandParamValues $matches['cmd'] $matches['param'] $matches['value']
		}

		# Handles git <cmd> --<param>
		"^(?<cmd>$gitCommandsWithLongParams).* --(?<param>\S*)$" {
			expandLongParams $longGitParams $matches['cmd'] $matches['param']
		}

		# Handles git <cmd> -<shortparam>
		"^(?<cmd>$gitCommandsWithShortParams).* -(?<shortparam>\S*)$" {
			expandShortParams $shortGitParams $matches['cmd'] $matches['shortparam']
		}

		# Handles git pr alias
		"vsts\.pr\s+(?<op>\S*)$" {
			gitCmdOperations $subcommands 'vsts.pr' $matches['op']
		}

		# Handles git pr <cmd> --<param>
		"vsts\.pr\s+(?<cmd>$vstsCommandsWithLongParams).*--(?<param>\S*)$"
		{
			expandLongParams $longVstsParams $matches['cmd'] $matches['param']
		}

		# Handles git pr <cmd> -<shortparam>
		"vsts\.pr\s+(?<cmd>$vstsCommandsWithShortParams).*-(?<shortparam>\S*)$"
		{
			expandShortParams $shortVstsParams $matches['cmd'] $matches['shortparam']
		}
	}
}

function ConvertTo-VscodeCompletion {
	Param(
		[Parameter(ValueFromPipeline=$true)]
		$CompletionText,
		[string]
		$Type
	)

	Process {
		$CompletionText | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'DynamicKeyword', "$type $_") }
	}
}

function WriteTabExpLog([string] $Message) {
	if (!$global:GitTabSettings.EnableLogging) { return }

	$timestamp = Get-Date -Format HH:mm:ss
	"[$timestamp] $Message" | Out-File -Append $global:GitTabSettings.LogPath
}

# if ($PSVersionTable.PSVersion.Major -ge 6) {
$cmdNames = "git","tgit","gitk"

# Create regex pattern from $cmdNames: ^(git|git\.exe|tgit|tgit\.exe|gitk|gitk\.exe)$
$cmdNamesPattern = "^($($cmdNames -join '|'))(\.exe)?$"
$cmdNames += Get-Alias | Where-Object { $_.Definition -match $cmdNamesPattern } | Foreach-Object Name

$global:GitTabSettings.RegisteredCommands = $cmdNames -join ", "

Microsoft.PowerShell.Core\Register-ArgumentCompleter -CommandName $cmdNames -Native -ScriptBlock {
	param($wordToComplete, $commandAst, $cursorPosition)

	# The PowerShell completion has a habit of stripping the trailing space when completing:
	# git checkout <tab>
	# The Expand-GitCommand expects this trailing space, so pad with a space if necessary.
	$padLength = $cursorPosition - $commandAst.Extent.StartOffset
	$textToComplete = $commandAst.ToString().PadRight($padLength, ' ').Substring(0, $padLength)

	WriteTabExpLog "Expand: command: '$($commandAst.Extent.Text)', padded: '$textToComplete', padlen: $padLength"
	Expand-GitCommand $textToComplete
}


