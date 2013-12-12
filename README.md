### Vim.js : JavaScript port of Vim

A Tool/Toy for Non-Beginners

by Lu Wang

### Status

Runnable, but very unstable, only tested on Firefox + Ubuntu

### Features

vim is built with `--with-features=tiny`. More features will be enabled gradually.

### Instructions

- Prepare the dependencies:
  - emscripten
  - node.js
  - streamline.js
  - closure compiler
  - cproto (maybe)
- Get yourself familiar with everything above and also:
  - source code of vim
  - JavaScript
- Setup paths in `build.sh`
- Run `build.sh`

### Development

Patches are welcome for
- Wrapping async functions &mdash; [learn more](https://github.com/coolwanglu/vim.js/wiki/Sync-to-Async-Transformation)
- Multi-browser/platform support
- Stability improvements
- UI improvements
- Other stuffs in `TODO`

If you want to work on other features to be merged, please file an issue and discuss with me first.

### Contact

Lu Wang coolwanglu(a)gmail.com &mdash; please do not expect a prompt response.

### License
Same as vim



