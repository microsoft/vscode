#!/usr/bin/env bash
# Runs the extension host suites of scripts/test-integration.sh and scripts/test-remote-integration.sh,
# which source this file. Most of the time of a suite is starting VS Code, which takes a fraction of
# the machine, so running suites in parallel shortens a run.
#
# By default, the suites run one after another, in the order they were added. With
# INTEGRATION_TEST_PARALLEL=<lanes>, up to <lanes> suites run at the same time, the longest first. Each
# suite then gets its own folders from the prepare_suite <name> <folder> function of the script: a
# VS Code instance that starts with the user data folder of a running instance hands its arguments to
# that instance and exits. The output of a suite is printed when it finishes. Suites of the same group
# run one after another in one lane, for example when they change the same workspace folder. The
# suites of a group marked with run_group_alone run first, with no other suite at the same time.

# The added suites, in order: "<group>|<name>|<estimated seconds>|<title>|<function>".
INTEGRATION_SUITES=()

# The groups marked with run_group_alone, each followed by a space.
INTEGRATION_SOLO_GROUPS=" "

# add_suite <group> <name> <estimated seconds> <title> <function>
add_suite() {
	INTEGRATION_SUITES+=("$1|$2|$3|$4|$5")
}

# run_group_alone <group>: in a parallel run, runs the suites of the group before the lanes start, with
# no other suite at the same time. For suites whose tests wait a fixed time for something to happen,
# which another VS Code instance competing for the CPU can delay past that time.
run_group_alone() {
	INTEGRATION_SOLO_GROUPS+="$1 "
}

# Runs one suite of a parallel lane and prints its output when it finishes.
run_parallel_suite() { # <name> <title> <function> <state folder>
	local name=$1 title=$2 fn=$3 state=$4
	local folder="$state/$name" output="$state/$name.log" start=$SECONDS status=0
	mkdir -p "$folder"
	# A command that fails stops the suite, as when the suites run one after another. That only works
	# when the subshell isn't part of a && or || list, which ignore set -e in the commands they run.
	set +e
	(
		set -e
		prepare_suite "$name" "$folder"
		"$fn"
	) > "$output" 2>&1
	status=$?
	set -e
	until mkdir "$state/output-lock" 2>/dev/null; do sleep 0.1; done
	echo
	echo "### $title ($((SECONDS - start))s)"
	echo
	cat "$output"
	rmdir "$state/output-lock"
	if [[ $status -ne 0 ]]; then
		echo "$title|$status" >> "$state/failed"
	fi
}

# Runs the groups of the queue one after another, until the queue is empty.
run_lane() { # <state folder> <groups, longest first...>
	local state=$1
	shift
	local groups=("$@") index entry group name estimate title fn
	while true; do
		until mkdir "$state/queue-lock" 2>/dev/null; do sleep 0.1; done
		index=$(cat "$state/next")
		echo $((index + 1)) > "$state/next"
		rmdir "$state/queue-lock"
		if (( index >= ${#groups[@]} )); then
			return 0
		fi
		for entry in "${INTEGRATION_SUITES[@]}"; do
			IFS='|' read -r group name estimate title fn <<< "$entry"
			if [[ "$group" == "${groups[$index]}" ]]; then
				run_parallel_suite "$name" "$title" "$fn" "$state"
			fi
		done
	done
}

run_suites() {
	local lanes=${INTEGRATION_TEST_PARALLEL:-1} entry group name estimate title fn
	if [[ ! "$lanes" =~ ^[0-9]+$ ]] || (( lanes < 2 || ${#INTEGRATION_SUITES[@]} < 2 )); then
		for entry in "${INTEGRATION_SUITES[@]}"; do
			IFS='|' read -r group name estimate title fn <<< "$entry"
			start_suite "$title"
			"$fn"
		done
		return 0
	fi
	if [[ -n "$INTEGRATION_TEST_APP_NAME" ]]; then
		# kill_app would also quit the apps of the other lanes.
		echo "Error: INTEGRATION_TEST_PARALLEL cannot be combined with INTEGRATION_TEST_APP_NAME" >&2
		return 1
	fi
	# Each suite reports its own failure below. The EXIT trap of the script must not report it as the
	# suite that ran before, such as the node.js integration tests.
	CURRENT_SUITE=""
	# Unless the caller prepared them, scripts/code.sh and scripts/node-electron.sh download Electron,
	# compile and fetch the built-in extensions when they are missing or out of date, which can replace
	# the Electron of another lane while it runs. Prepare them once, before the lanes start.
	if [[ -z "$VSCODE_SKIP_PRELAUNCH" ]]; then
		node "$ROOT/build/lib/preLaunch.ts"
		export VSCODE_SKIP_PRELAUNCH=1
	fi

	# The groups that don't run alone, longest first.
	local weights="" groups=() solo=() total
	for entry in "${INTEGRATION_SUITES[@]}"; do
		IFS='|' read -r group name estimate title fn <<< "$entry"
		if [[ "$INTEGRATION_SOLO_GROUPS" == *" $group "* ]]; then
			solo+=("$entry")
		else
			weights+="$estimate $group"$'\n'
		fi
	done
	while read -r total group; do
		groups+=("$group")
	done < <(printf '%s' "$weights" | awk '{ sum[$2] += $1 } END { for (g in sum) print sum[g], g }' | sort -k1,1nr -k2,2)

	local state lane pids=()
	# A short folder: macOS limits the IPC socket path inside each user data folder to 103 characters,
	# which the default macOS $TMPDIR already uses most of.
	state=$(mktemp -d /tmp/vscode-it.XXXXXX)
	echo 0 > "$state/next"
	echo
	echo "Running ${#solo[@]} suites alone, then $((${#INTEGRATION_SUITES[@]} - ${#solo[@]})) suites in $lanes parallel lanes; each suite's output follows when it finishes."
	for entry in "${solo[@]}"; do
		IFS='|' read -r group name estimate title fn <<< "$entry"
		run_parallel_suite "$name" "$title" "$fn" "$state"
	done
	for ((lane = 0; lane < lanes; lane++)); do
		run_lane "$state" "${groups[@]}" &
		pids+=($!)
	done
	# A lane that stops, for example when it can't create the folders of a suite, doesn't run the rest
	# of its group: fail the run, after waiting for the other lanes.
	local failed=false status
	for lane in "${pids[@]}"; do
		wait "$lane" || {
			status=$?
			failed=true
			echo "Integration tests failed: a parallel lane stopped with exit code $status before its suites finished." >&2
			if [[ "$GITHUB_ACTIONS" == "true" ]]; then
				echo "::error title=Integration tests failed::A parallel lane stopped with exit code $status before its suites finished"
			fi
		}
	done

	if [[ -s "$state/failed" ]]; then
		failed=true
		while IFS='|' read -r title status; do
			echo "Integration tests failed in '$title' with exit code $status." >&2
			if [[ "$GITHUB_ACTIONS" == "true" ]]; then
				echo "::error title=Integration tests failed::'$title' exited with code $status"
			fi
		done < "$state/failed"
	fi
	# An app can still write to its user data folder for a moment after its suite returns: a removal
	# that races with it must not fail a run whose suites passed.
	rm -rf -- "$state" 2>/dev/null || true
	if $failed; then
		return 1
	fi
}
