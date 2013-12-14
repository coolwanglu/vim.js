### Vim.js : JavaScript port of Vim

A Tool/Toy for Non-Beginners

by Lu Wang

### [Try it online](http://coolwanglu.github.io/vim.js/web/vim.html)



### Status

- Works but unstable, only tested on Firefox/Chrome + Ubuntu
- Faster on Chrome than Firefox
- Some features work better on Firefox (e.g. `<Ctrl>`)



### Features

vim.js is built with the small feature set (`--with-features=small`), 
with also a few from the normal set.
Run `:version` to check.

`--with-features=normal` is too large and too slow for online usage.

As we all know that there are huge number of features in Vim, but
most people use only a small subset of it. So I have to try to balance
the feature set and the file size, by including most common features,
and also a few that I pick.

If you really want some feature(s) enabled by default,
please try to compile it yourself first, estimate the increase in size and
create a pull request.



### Instructions for hackers

- Prepare the dependencies:
  - emscripten
    - Use the `wl` branch of [my fork](https://github.com/coolwanglu/emscripten/tree/wl) if anything goes wrong
  - node.js
  - streamline.js
  - GCC & cproto (maybe)
    - Sometimes you need to run `make proto` when you see errors about 'undeclared variables/functions/structs'
- Get yourself familiar with everything above and also:
  - source code of vim
  - JavaScript, and also HTML/CSS
- Prepare `build.sh`
  - Setup the path of emscripten inside
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

Do not override `vim.js` or `build.sh`!



### Contact

Lu Wang coolwanglu(a)gmail.com &mdash; please do not expect a prompt response.



### License

Read `LICENSE`



