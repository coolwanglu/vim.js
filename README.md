### Vim.js : JavaScript port of Vim

A Tool/Toy for Non-Beginners

by Lu Wang

### [Try it online](http://coolwanglu.github.io/vim.js/web/vim.html)



### Status

Works but unstable

        | Firefox | Chrome | IE
--------|---------|--------|--------
Speed   | Normal  | Good   | Good
Feature | Good    | Normal | Normal 



### Vim.js Features

- Persistent `~/.vimrc`
- Execute JavaScript from Vim.js 
- Read local files 
- Read files from Dropbox

Run `:e $VIM/vimrc` for more detail.



### Vim Features

The online demo is built with the small feature set (`--with-features=small`), 
with also a few from the normal set.
Run `:version` to check details. 
(`--with-features=normal` is too large and too slow for online usage.)

Some features can be requested via pull requests, some are not intended to be included. 
Please discuss with me first before you work on a PR.



### Instructions for hackers

- Prepare the dependencies:
  - emscripten &mdash; Use the `wl` branch of [my fork](https://github.com/coolwanglu/emscripten/tree/wl) if anything goes wrong
  - node.js
  - streamline.js
  - GCC & cproto (maybe) &mdash; Sometimes you need to run `make proto` when you see errors about 'undeclared variables/functions/structs'
- Get yourself familiar with everything above and also:
  - source code of vim
  - JavaScript, and also HTML/CSS
- Set up EM\_DIR
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



