#!/usr/bin/env bash

declare -A juices=(
    ['apple']='Apple Juice'
    ['orange']='Orange Juice'
)

# This is a comment
echo "${juices['apple']}"
