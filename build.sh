#!/bin/bash
set -e
EM_DIR=~/src/emscripten

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
    -o vim.js \
    --js-library vim_lib.js \
    --post-js vim_post.js \
    -s EXPORTED_FUNCTIONS="['_main', '_input_available', '_gui_browser_add_to_input_buf']" \

popd
}

do_transform() {
pushd web
echo "Transfoming..."
js transform.js

echo "streamline.js..."
_node -c vim._js

popd
}

#do_config
do_make
do_link
do_transform
