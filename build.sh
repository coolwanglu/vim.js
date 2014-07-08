#!/bin/bash
set -e
[ -z $EM_DIR] && EM_DIR=~/src/emscripten

do_config() {
    echo config
# something wrong with emcc + cproto, use gcc as CPP instead
CPPFLAGS="-Os -DFEAT_GUI_WEB" \
CPP="gcc -E" \
$EM_DIR/emconfigure ./configure \
    --enable-gui=web \
    --with-features=small \
    --disable-selinux \
    --disable-xsmp \
    --disable-xsmp-interact \
    --disable-luainterp \
    --disable-mzschemeinterp \
    --disable-perlinterp \
    --disable-pythoninterp \
    --disable-python3interp \
    --disable-tclinterp \
    --disable-rubyinterp \
    --disable-cscope \
    --disable-workshop \
    --disable-netbeans \
    --disable-sniff \
    --disable-multibyte \
    --disable-hangulinput \
    --disable-xim \
    --disable-fontset \
    --disable-gtk2-check \
    --disable-gnome-check \
    --disable-motif-check \
    --disable-athena-check \
    --disable-nextaw-check \
    --disable-carbon-check \
    --disable-gtktest \
    --disable-largefile \
    --disable-acl \
    --disable-gpm \
    --disable-sysmouse \
    --disable-nls \
    --with-modified-by="Lu Wang" \
    --with-compiledby="Lu Wang" \

}

do_make() {
$EM_DIR/emmake make -j8
}

do_link() {
pushd web
cp ../src/vim vim.bc
#cp vim_lib.js usr/local/share/vim/example.js
cat vim_lib.js | sed -e "1 s/\(foldmethod\|foldmarker\)[^ ]\+//g" > usr/local/share/vim/example.js

# Use vim.js as filename to generate vim.js.mem
$EM_DIR/emcc vim.bc \
    -o vim.js \
    -Oz \
    --memory-init-file 1 \
    --js-library vim_lib.js \
    -s EXPORTED_FUNCTIONS="['_main', '_input_available', '_gui_web_handle_key', '_gui_resize_shell']" \
    --embed-file usr \

popd
}

#do_config
#do_make
do_link
