#!/bin/bash
set -e
: ${EM_DIR:?"EM_DIR is not set!"}

# must be > 1
JOB_COUNT=6

function check_queue {
    OLDQUEUE=$RUNNING_QUEUE
    for PID in $OLDQUEUE
    do
        if [ ! -d /proc/$PID ]; then
            regenerate_queue
            break
        fi
    done
}

function regenerate_queue {
    OLDQUEUE=$RUNNING_QUEUE
    RUNNING_QUEUE=""
    RUNNING_COUNT=0
    for PID in $OLDQUEUE
    do
        if [ -d /proc/$PID ]; then
            RUNNING_QUEUE="$RUNNING_QUEUE $PID"
            RUNNING_COUNT=$(($RUNNING_COUNT+1))
        fi
    done
}

function new_job {
    PROCESS=$*
    eval "$PROCESS &"
    RUNNING_QUEUE="$RUNNING_QUEUE $!"
}

do_config() {
    echo config
# something wrong with emcc + cproto, use gcc as CPP instead
CPPFLAGS="-DFEAT_GUI_BROWSER" \
CPP="gcc -E" \
$EM_DIR/emconfigure ./configure \
    --enable-gui=browser \
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
# Use vim.js as filename to generate vim.js.mem
$EM_DIR/emcc vim.bc \
    -o vim.js \
    -O0 \
    --closure 0 \
    --memory-init-file 1 \
    --js-library vim_lib.js \
    -s EXPORTED_FUNCTIONS="['_main', '_input_available', '_gui_browser_handle_key', '_gui_resize_shell']" \
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

_node -c vim-2._js &

for ((i=0; i < JOB_COUNT; i++))
do
    _node -c vim-2.$i._js &
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
java -jar $EM_DIR/third_party/closure-compiler/compiler.jar \
    --language_in ECMASCRIPT5 \
    --js vim-2.js\
    --js_output_file vim.js \

popd
}

#do_config
do_make
do_link
do_transform
do_compress
