# Getting started

This is a draft

## Language tools

To get started working on Vaporview, you will need the following installed and up to date:

- [VScode - latest](https://code.visualstudio.com/)
- [Node - 20.18.0 or later](https://nodejs.org/en)
- [Rust - 1.80.0 or later](https://www.rust-lang.org/)

## Install libraries

Once those are installed, make sure you install the necessary packages:

- `npm install`
- `cargo update`

## building and running

To build and run, you should be able to use the **Run and Debug** utility in VScode. It will do the following steps automatically, but in case you need to do them individually (which does happen)

### Compile WebAssembly component

This compiles Rust code to a WASM blob

`cargo build --target wasm32-unknown-unknown`

Note that there are 2 tpyes of WASM compile options: "debug" and "release". The debug version is much slower, but compiles faster. This is good for general debug of functionality, but is not recommended for testing large files. To build a release version, use the following command:

`cargo build --target wasm32-unknown-unknown --release`

You will also need to specify the release binary in extension.ts

### Generate WebAssembly interface

This generates filehandler.ts. I opted to not check in this file since it's technically considered compiled/generated code. In the VScode extension examples, these files are checked in, and I spent an annoying amount of time trying to understand how it worked until I realized that I didn't need to understand it. In fact, the whole point of the .wit file and wit2ts tool is that we don't need to understand this file.

`npm run generate:model`

### "Compile" Typescript

This "compiles" Typescript into Javascript.

`tsc -b`