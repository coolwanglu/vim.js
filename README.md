### Vim.js : JavaScript port of Vim

A Tool/Toy for Non-Beginners

by Lu Wang

[Online Demo](http://coolwanglu.github.io/vim.js/web/vim.html)

### Status

Works but unstable, only tested on Firefox/Chrome + Ubuntu

### Features

vim is built with `--with-features=tiny`. More features will be enabled gradually.

### Instructions for hackers

- Prepare the dependencies:
  - emscripten
  - node.js
  - streamline.js
  - closure compiler
  - GCC & cproto (in case you need to generate the .pro files)
- Get yourself familiar with everything above and also:
  - source code of vim
  - JavaScript, and also HTML/CSS
- Setup paths in `build.sh`
- Uncomment the last few lines in `build.sh`
- Run `build.sh`

### Development

Patches are welcome and wanted for
- Wrapping async functions &mdash; [learn more](https://github.com/coolwanglu/vim.js/wiki/Sync-to-Async-Transformation)
- Multi-browser/platform support
- Stability improvements
- UI improvements
- Other stuffs in `TODO`

If you want to work on other features to be merged, please file an issue and discuss with me first.

### Contact

Lu Wang coolwanglu(a)gmail.com &mdash; please do not expect a prompt response.

### License
Read `LICENSE`



