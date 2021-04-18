# This workflow uses actions that are not certified by GitHub.
# They are provided by a third-party and are governed by
# separate terms of service, privacy policy, and support
# documentation.

# This workflow will install Deno and run tests across stable and nightly builds on Windows, Ubuntu and macOS.
# For more information see: https://github.com/denolib/setup-deno

name: Deno

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ${{ matrix.os }} # runs a test on Ubuntu, Windows and macOS

    strategy:
      matrix:
        deno: ["v1.x", "nightly"]
        os: [macOS-latest, windows-latest, ubuntu-latest]

    steps:
      - name: Setup repo
        uses: actions/checkout@v2

      - name: Setup Deno
        uses: denolib/setup-deno@c7d7968ad4a59c159a777f79adddad6872ee8d96
        with:
          deno-version: ${{ matrix.deno }} # tests across multiple Deno versions

      - name: Cache Dependencies
        run: deno cache deps.ts

      - name: Run Tests
        run: deno test -A --unstable
