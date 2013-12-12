#!/bin/bash
set -e
EM_DIR=~/src/emscripten
CC_DIR=~/src/closure-compiler

do_config() {
# something wrong with emcc + cproto, use gcc as CPP instead
CPPFLAGS="-DFEAT_GUI_BROWSER" \
CPP="gcc -E" \
$EM_DIR/emconfigure ./configure \
    --enable-gui=browser \
    --with-features=tiny \
    --disable-nls \
    --with-modified-by="Lu Wang" \

}

do_make() {
$EM_DIR/emmake make
}

do_link() {
pushd web
cp ../src/vim vim.bc
$EM_DIR/emcc vim.bc \
    -o vim-1.js\
    --closure 0 \
    --js-library vim_lib.js \
    --post-js vim_post.js \
    -s EXPORTED_FUNCTIONS="['_main', '_input_available', '_gui_browser_handle_key', '_gui_resize_shell']" \
    --embed-file usr \

popd
}

do_transform() {
pushd web

echo "Transfoming..."
js transform.js vim-1.js vim-2._js

echo "Compiling with streamline.js...(very slow)"
_node -c vim-2._js

popd
}

do_compress() {
pushd web 

echo "Optimizing with closure compiler"
java -jar $CC_DIR/compiler.jar \
    --language_in ECMASCRIPT5 \
    --js vim-2.js\
    --js_output_file vim.js \
    --externs externs.js \

popd
}

#do_config
do_make
do_link
do_transform
do_compress
