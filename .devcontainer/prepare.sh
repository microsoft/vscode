#!/bin/bash

# This file contains the steps that should be run when creating the intermediary image that contains
# contents for that should be in the image by default. It will be used to build up from the base image
# to create an image that speeds up first time use of the dev container by "caching" the results
# of these commands. Developers can still run these commands without an issue once the container is
# up, but only differences will be processed which also speeds up the first time these operations occur.

yarn install
yarn electron
