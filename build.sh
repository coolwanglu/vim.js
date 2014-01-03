#!/bin/bash
set -e
: ${EM_DIR:?"EM_DIR is not set!"}

# must be > 1
JOB_COUNT=6

do_config() {
    echo config
# something wrong with emcc + cproto, use gcc as CPP instead
CPPFLAGS="-DFEAT_GUI_WEB" \
CPP="gcc -E" \
$EM_DIR/emconfigure ./configure \
    --enable-gui=web \
    --with-features=small \
    --disable-selinux \
    --disable-xsmp \
    --disable-xmp-interact \
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
    --disable-multibye \
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
$EM_DIR/emmake make
}

do_link() {
pushd web
cp ../src/vim vim.bc
#cp vim_lib.js usr/local/share/vim/example.js
cat vim_lib.js | sed -e "1 s/\(foldmethod\|foldmarker\)[^ ]\+//g" > usr/local/share/vim/example.js

# Use vim.js as filename to generate vim.js.mem
$EM_DIR/emcc vim.bc \
    -o vim.js \
    -O0 \
    --closure 0 \
    --memory-init-file 1 \
    --js-library vim_lib.js \
    -s EXPORTED_FUNCTIONS="['_main', '_input_available', '_gui_web_handle_key', '_gui_resize_shell']" \
    --embed-file usr \

mv vim.js vim-1.js

popd
}

do_transform() {
pushd web

# vim-2._js is counted as a job
JOB_COUNT=$((JOB_COUNT-1))

echo "Transfoming..."
node transform.js vim-1.js vim-2 $JOB_COUNT

echo "Compiling with streamline.js..."

_node -li -c vim-2._js &

for ((i=0; i < JOB_COUNT; i++))
do
    _node -li -c vim-2.$i._js &
done

wait

for ((i=0; i < JOB_COUNT; i++))
do
    cat vim-2.$i.js >> vim-2.js
done

popd
}

do_compress() {
pushd web 

echo "Optimizing with closure compiler"
#--compilation_level ADVANCED_OPTIMIZATIONS \
java -Xmx2048m \
     -jar $EM_DIR/third_party/closure-compiler/compiler.jar \
     --language_in ECMASCRIPT5 \
     --js vim-2.js\
     --js_output_file vim.js \

popd
}

do_config
do_make
do_link
do_transform
do_compress
