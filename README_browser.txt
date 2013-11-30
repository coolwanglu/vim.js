README_browser.txt for version 7.4 of Vim: Vi IMproved.

See "README.txt" for general information about Vim.

Vim 7.4 
Browser Port by Lu Wang <coolwanglu@gmail.com>


Notes:

- Install dependencies
- Install emscripten
- Set up path variables in build.sh
- Run build.sh


About the port

Still working in progress.
Mostly it's about converting sync function calls into async versions,
some useful functions and macros are defined in src/async.h
Some features are disabled temporarily.
