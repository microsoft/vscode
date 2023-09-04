#!/usr/bin/env bash
cmd=( 'ls' '-la' )
if (( ${#cmd[@]} )); then
	"${cmd[@]}"
	printf '%s' "${cmd[@]}"
fi
