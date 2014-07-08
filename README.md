### Vim.js : JavaScript port of Vim

A Tool/Toy for Non-Beginners

by Lu Wang

### [Try it online](http://coolwanglu.github.io/vim.js/web/vim.html)



### Status

        | Firefox | Chrome | IE
--------|---------|--------|--------
Speed   | Normal  | Best   | Good
Feature | Best    | Normal | Good

Usable and almost stable, but be careful and do `:w` a lot!
In case it crashes, files can still be accessible through the emscripten FS API, e.g. `FS.readFile`



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



### Tips for hackers

- Need emscripten with async transformation
- Need GCC & cproto (maybe) &mdash; Sometimes you need to run `make proto` when you see errors about 'undeclared variables/functions/structs'
- Read `build.sh`
- The building process might take more than 3GB memory.



### Contact

Lu Wang coolwanglu(a)gmail.com &mdash; please do not expect a prompt response.



### License

Read `LICENSE`



