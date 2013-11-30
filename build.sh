#!/bin/bash
set -e
EM_DIR=~/src/emscripten

do_config() {
# something wrong with emcc + cproto, use gcc as CPP instead
CPPFLAGS="-DASYNC" \
CPP="gcc -E" \
$EM_DIR/emconfigure ./configure \
    --enable-gui=browser \
    --disable-nls \

}

do_make() {
$EM_DIR/emmake make
}

do_link() {
cp src/vim vim.bc
$EM_DIR/emcc vim.bc -o vim.js
}

do_config
do_make
do_link

