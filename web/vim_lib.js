/*  vim: set sw=2 ts=2 et foldmethod=marker foldmarker=VIMJS_FOLD_START,VIMJS_FOLD_END : */
/*
 * vim_lib.js: connect DOM and user inputs to VIM
 *
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*
 * $vimjs holds the common states and functions
 * vimjs_* functions are exposed to C
 */
mergeInto(LibraryManager.library, {
  $vimjs__deps: ['mktemp'],
  $vimjs: {
    is_chrome: false,

    // HTML elements
    container_node: null,
    beep_node: null, // for beeping
    style_node: null, // to adjust line-height dynamically
    file_node: null, // file selector
    trigger_dialog_node: null, // to trigger file selector

    rows: 0,
    cols: 0,
    char_width: 1,
    char_height: 1,

    fg_color: null,
    bg_color: null,
    sp_color: null,

    gui_browser_add_to_input_buf: null,
    input_available: null,

    special_keys: [],
    color_map: {},
    file_callback: null,
    dropbox_callback: null,
    trigger_callback: null,

    dropbox: null,

    // functions that are not exposed to C
    handle_key: function(charCode, keyCode, e) {//VIMJS_FOLD_START
      // macros defined in keymap.h
      var modifiers = 0;
      // shift already affects charCode
      if(charCode && e.shiftKey) modifiers |= 0x02;
      if(e.ctrlKey) modifiers |= 0x04;
      if(e.altKey) modifiers |= 0x08;
      if(e.metaKey) modifiers |= 0x10;

      if(charCode == 0) {
        var special = vimjs.special_keys[keyCode];
        if(special !== undefined) {
          vimjs.gui_browser_handle_key(charCode || keyCode, modifiers, special.charCodeAt(0), special.charCodeAt(1));
          return;
        } 
      }

      vimjs.gui_browser_handle_key(charCode || keyCode, modifiers, 0, 0);
    },//VIMJS_FOLD_END

    get_color_string: function(color) {//VIMJS_FOLD_START
      var bgr = [];
      for(var i = 0; i < 3; ++i) {
        bgr.push(color & 0xff);
        color >>= 8;
      }
      return 'rgb('+bgr[2]+','+bgr[1]+','+bgr[0]+')';
    },//VIMJS_FOLD_END

    resize: function(rows, cols) {//VIMJS_FOLD_START
      var screen_w = _vimjs_get_screen_width();
      var screen_h = _vimjs_get_screen_height();
      rows = rows || (Math.floor(screen_h / vimjs.char_height) + 1);
      cols = cols || (Math.floor(screen_w / vimjs.char_width) + 1);
      vimjs.rows = rows;
      vimjs.cols = cols;
      var container_node = vimjs.container_node;
      container_node.style.height = rows * vimjs.char_height + 'px';
      container_node.style.width = cols * vimjs.char_width + 'px';
      // TODO: optimize: reuse old elements
      // clear old elements
      container_node.innerHTML = '';
      for(var r = 0; r < rows; ++r) {
        var row_ele = document.createElement('div');
        row_ele.classList.add('vimjs-line');
        for(var c = 0; c < cols; ++c) {
          var cur_ele = document.createElement('span');
          cur_ele.className = 'trans';
          cur_ele.style.backgroundColor = vimjs.bg_color;
          cur_ele.textContent = ' ';
          row_ele.appendChild(cur_ele);
        }
        container_node.appendChild(row_ele);
      }
    },//VIMJS_FOLD_END

    // called before the program starts
    preRun: function () {//VIMJS_FOLD_START
      // setup dir
      Module["FS_createPath"]("/", "root", true, true);

      // load .vimrc, use localStorage when possible
      var vimrc_storage_id = 'vimjs/root/.vimrc';
      if(typeof localStorage !== 'undefined') {
        var stored_vimrc = localStorage[vimrc_storage_id];
        if(stored_vimrc) {
          Module['FS_createDataFile']('/root', '.vimrc', stored_vimrc, true, true);
        }
        window.addEventListener('beforeunload', function() {
          try {
            localStorage[vimrc_storage_id] = FS.readFile('/root/.vimrc', { encoding: 'utf8' });
          } catch(e) {
          }
        });
      } 
      
      // Hijack callMain to call _main with callback
      // call _main with callback
      Module['callMain'] = Module.callMain = function(args) {
        // embed a function to be transformed by streamline.js
        (function (_) {
          assert(((runDependencies == 0)), "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
          assert(((__ATPRERUN__.length == 0)), "cannot call main when preRun functions remain to be called");
          args = ((args || []));
          ensureInitRuntime();

          // setup environment
          ENV['USER'] = 'root';
          ENV['HOME'] = '/root'; 
          ENV['PWD'] = '/root';
          ENV['_'] = '/bin/vim';

          FS.currentPath = '/root';

          var argc = ((args.length + 1));
          var argv = [allocate(intArrayFromString("/bin/vim"), "i8", ALLOC_NORMAL), 0, 0, 0];
          for (var i = 0; i < argc - 1; ++i) {
            argv.concat([allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL), 0, 0, 0]);
          }
          argv.push(0);
          argv = allocate(argv, "i32", ALLOC_NORMAL);
          initialStackTop = STACKTOP;
          try {
            var crashed = false;
            var ret = Module["_main"](_, argc, argv, 0);
            if (!Module["noExitRuntime"]) {
              exit(ret); 
            } 
          } catch (e) {
            if (e instanceof ExitStatus) {
            } else if (e == "SimulateInfiniteLoop") {
              Module["noExitRuntime"] = true;
            } else {
              crashed = true;

              if (e && (typeof e === "object") && e.stack) {
                Module.printErr("exception thrown: " + [e,e.stack,]); 
              }
              throw e; 
            }
          } finally {
            calledMain = true; 
        //    Module["vimjs-exit"](crashed);
          }
        })(function(){ console.log('Vim.js exited.'); });
      };
    },//VIMJS_FOLD_END

    // load external resources

    // On some browsers file selector cannot
    // be trigger unless inside a user event
    user_trigger: function (cb) {
      if(vimjs.is_chrome) {
        vimjs.trigger_callback = function() {
          vimjs.trigger_dialog_node.parentNode.removeChild(vimjs.trigger_dialog_node);
          setTimeout(cb, 1);
        };

        vimjs.container_node.appendChild(vimjs.trigger_dialog_node);

      } else {
        cb();
      }
    },
    
    load_nothing: function (cb, buf) {
      {{{ makeSetValue('buf', 0, 0, 'i8') }}};
      setTimeout(cb, 1);
    },

    // save data to a temp file and return it to Vim
    load_data: function (cb, buf, data_array) {
      writeArrayToMemory(intArrayFromString('/tmp/vimjs-XXXXXX'), buf);
      _mktemp(buf);
      FS.writeFile(Pointer_stringify(buf), data_array, { encoding: 'binary' });
      setTimeout(cb, 1);
    },

    // load local file
    load_local_file: function (cb, buf) {
      // read from local
      vimjs.file_callback = function (files) {
        vimjs.file_callback = null;
        if(files.length == 0) {
          vimjs.load_nothing(cb, buf);
          return;
        }
        var reader = new FileReader();
        reader.onload = function(e) {
          vimjs.load_data(cb, buf, new Uint8Array(e.target.result));
        }
        reader.readAsArrayBuffer(files[0]);
      };
      vimjs.user_trigger(function() {
        vimjs.file_node.click();
      });
    },

    // load dropbox-js if necessary
    ensure_dropbox: function (cb) {
      if (typeof Dropbox === 'undefined') {
        // load js
        var ele = document.createElement('script');
        ele.id = 'dropboxjs';
        ele.setAttribute('data-app-key', 'ayzai5sqtyjydma');
        ele.onload = function() {
          cb();
        };
        ele.onerror = function() {
          ele.parentNode.removeChild(ele);
          cb();
        }
        ele.src = 'https://www.dropbox.com/static/api/1/dropins.js';
        document.body.appendChild(ele);
      } else {
        cb();
      }
    },

    load_dropbox_file: function (cb, buf) {
      if(typeof Dropbox === 'undefined') {
        vimjs.load_nothing(cb, buf);
        return;
      }
      vimjs.user_trigger(function() {
        Dropbox.choose({
          success: function(files) {
            var url = files[0].link;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function () {
              if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
                vimjs.load_data(cb, buf, new Uint8Array(xhr.response));
              } else {
                xhr.onerror();
              }
            };
            xhr.onerror = function() {
              vimjs.load_nothing(cb, buf);
            };
            xhr.send(null);
          },
          cancel: function() {
            vimjs.load_nothing(cb, buf);
          },
          linkType: 'direct',
          multiselect: false
        });
      });
    },

    __dummy__: null
  },

  vimjs_init__deps: ['$vimjs', 'vimjs_init_font'],
  vimjs_init: function () {
    vimjs.is_chrome = !!window.chrome;
    
    vimjs.gui_browser_handle_key = Module['cwrap']('gui_browser_handle_key', null, ['number', 'number', 'number', 'number']);
    vimjs.input_available = Module['cwrap']('input_available', 'number', []);

    vimjs.fg_color = '#fff';
    vimjs.bg_color = '#000';
    vimjs.sp_color = '#f00';

    vimjs.beep_node = document.getElementById('vimjs-beep');

    vimjs.file_node = document.getElementById('vimjs-file');
    vimjs.file_node.addEventListener('change', function(e) {
      if(vimjs.file_callback)
        vimjs.file_callback(e.target.files);
    });

    document.getElementById('vimjs-trigger-button').addEventListener('click', function() {
      if(vimjs.trigger_callback)
        vimjs.trigger_callback();
    });
    var trigger_dialog_node =  vimjs.trigger_dialog_node = document.getElementById('vimjs-trigger-dialog');
    trigger_dialog_node.parentNode.removeChild(trigger_dialog_node);
    trigger_dialog_node.style.display = 'block';

    vimjs.style_node = document.createElement('style');
    document.body.appendChild(vimjs.style_node);

    var container_node = vimjs.container_node = document.getElementById('vimjs-container');
    // there might be text nodes of other stuffs before loading vim
    container_node.innerHTML = '';
    container_node.style.backgroundColor = 'black';

    // will call the resize function
    _vimjs_init_font('');

    /* initialize special_keys VIMJS_FOLD_START*/
    vimjs.special_keys = [];
    /* for closure compiler */
    var KeyEvent = window.KeyEvent;
    /* for Chrome */
    /* http://stackoverflow.com/questions/1465374/javascript-event-keycode-constants/1465409#1465409 */
    if (typeof KeyEvent == "undefined") {
        var KeyEvent = {
            DOM_VK_CANCEL: 3,
            DOM_VK_HELP: 6,
            DOM_VK_BACK_SPACE: 8,
            DOM_VK_TAB: 9,
            DOM_VK_CLEAR: 12,
            DOM_VK_RETURN: 13,
            DOM_VK_ENTER: 14,
            DOM_VK_SHIFT: 16,
            DOM_VK_CONTROL: 17,
            DOM_VK_ALT: 18,
            DOM_VK_PAUSE: 19,
            DOM_VK_CAPS_LOCK: 20,
            DOM_VK_ESCAPE: 27,
            DOM_VK_SPACE: 32,
            DOM_VK_PAGE_UP: 33,
            DOM_VK_PAGE_DOWN: 34,
            DOM_VK_END: 35,
            DOM_VK_HOME: 36,
            DOM_VK_LEFT: 37,
            DOM_VK_UP: 38,
            DOM_VK_RIGHT: 39,
            DOM_VK_DOWN: 40,
            DOM_VK_PRINTSCREEN: 44,
            DOM_VK_INSERT: 45,
            DOM_VK_DELETE: 46,
            DOM_VK_0: 48,
            DOM_VK_1: 49,
            DOM_VK_2: 50,
            DOM_VK_3: 51,
            DOM_VK_4: 52,
            DOM_VK_5: 53,
            DOM_VK_6: 54,
            DOM_VK_7: 55,
            DOM_VK_8: 56,
            DOM_VK_9: 57,
            DOM_VK_SEMICOLON: 59,
            DOM_VK_EQUALS: 61,
            DOM_VK_A: 65,
            DOM_VK_B: 66,
            DOM_VK_C: 67,
            DOM_VK_D: 68,
            DOM_VK_E: 69,
            DOM_VK_F: 70,
            DOM_VK_G: 71,
            DOM_VK_H: 72,
            DOM_VK_I: 73,
            DOM_VK_J: 74,
            DOM_VK_K: 75,
            DOM_VK_L: 76,
            DOM_VK_M: 77,
            DOM_VK_N: 78,
            DOM_VK_O: 79,
            DOM_VK_P: 80,
            DOM_VK_Q: 81,
            DOM_VK_R: 82,
            DOM_VK_S: 83,
            DOM_VK_T: 84,
            DOM_VK_U: 85,
            DOM_VK_V: 86,
            DOM_VK_W: 87,
            DOM_VK_X: 88,
            DOM_VK_Y: 89,
            DOM_VK_Z: 90,
            DOM_VK_CONTEXT_MENU: 93,
            DOM_VK_NUMPAD0: 96,
            DOM_VK_NUMPAD1: 97,
            DOM_VK_NUMPAD2: 98,
            DOM_VK_NUMPAD3: 99,
            DOM_VK_NUMPAD4: 100,
            DOM_VK_NUMPAD5: 101,
            DOM_VK_NUMPAD6: 102,
            DOM_VK_NUMPAD7: 103,
            DOM_VK_NUMPAD8: 104,
            DOM_VK_NUMPAD9: 105,
            DOM_VK_MULTIPLY: 106,
            DOM_VK_ADD: 107,
            DOM_VK_SEPARATOR: 108,
            DOM_VK_SUBTRACT: 109,
            DOM_VK_DECIMAL: 110,
            DOM_VK_DIVIDE: 111,
            DOM_VK_F1: 112,
            DOM_VK_F2: 113,
            DOM_VK_F3: 114,
            DOM_VK_F4: 115,
            DOM_VK_F5: 116,
            DOM_VK_F6: 117,
            DOM_VK_F7: 118,
            DOM_VK_F8: 119,
            DOM_VK_F9: 120,
            DOM_VK_F10: 121,
            DOM_VK_F11: 122,
            DOM_VK_F12: 123,
            DOM_VK_F13: 124,
            DOM_VK_F14: 125,
            DOM_VK_F15: 126,
            DOM_VK_F16: 127,
            DOM_VK_F17: 128,
            DOM_VK_F18: 129,
            DOM_VK_F19: 130,
            DOM_VK_F20: 131,
            DOM_VK_F21: 132,
            DOM_VK_F22: 133,
            DOM_VK_F23: 134,
            DOM_VK_F24: 135,
            DOM_VK_NUM_LOCK: 144,
            DOM_VK_SCROLL_LOCK: 145,
            DOM_VK_COMMA: 188,
            DOM_VK_PERIOD: 190,
            DOM_VK_SLASH: 191,
            DOM_VK_BACK_QUOTE: 192,
            DOM_VK_OPEN_BRACKET: 219,
            DOM_VK_BACK_SLASH: 220,
            DOM_VK_CLOSE_BRACKET: 221,
            DOM_VK_QUOTE: 222,
            DOM_VK_META: 224
        };
    }
    [
      [KeyEvent.DOM_VK_UP,  'ku'],
      [KeyEvent.DOM_VK_DOWN,  'kd'],
      [KeyEvent.DOM_VK_LEFT,  'kl'],
      [KeyEvent.DOM_VK_RIGHT, 'kr'],
      [KeyEvent.DOM_VK_F1,  'k1'],
      [KeyEvent.DOM_VK_F2,  'k2'],
      [KeyEvent.DOM_VK_F3,  'k3'],
      [KeyEvent.DOM_VK_F4,  'k4'],
      [KeyEvent.DOM_VK_F5,  'k5'],
      [KeyEvent.DOM_VK_F6,  'k6'],
      [KeyEvent.DOM_VK_F7,  'k7'],
      [KeyEvent.DOM_VK_F8,  'k8'],
      [KeyEvent.DOM_VK_F9,  'k9'],
      [KeyEvent.DOM_VK_F10,   'k;'],
      [KeyEvent.DOM_VK_F11,   'F1'],
      [KeyEvent.DOM_VK_F12,   'F2'],
      [KeyEvent.DOM_VK_F13,   'F3'],
      [KeyEvent.DOM_VK_F14,   'F4'],
      [KeyEvent.DOM_VK_F15,   'F5'],
      [KeyEvent.DOM_VK_F16,   'F6'],
      [KeyEvent.DOM_VK_F17,   'F7'],
      [KeyEvent.DOM_VK_F18,   'F8'],
      [KeyEvent.DOM_VK_F19,   'F9'],
      [KeyEvent.DOM_VK_F20,   'FA'],
      [KeyEvent.DOM_VK_F21,   'FB'],
      [KeyEvent.DOM_VK_F22,   'FC'],
      [KeyEvent.DOM_VK_F23,   'FD'],
      [KeyEvent.DOM_VK_F24,   'FE'],
      [KeyEvent.DOM_VK_PAUSE,  'FB'], // equal to F21, see gui_gtk_x11.c
      [KeyEvent.DOM_VK_HELP,   '%1'],
      [KeyEvent.DOM_VK_BACK_SPACE, 'kb'],
      [KeyEvent.DOM_VK_INSERT, 'kI'],
      [KeyEvent.DOM_VK_DELETE, 'kD'],
      [KeyEvent.DOM_VK_CLEAR,  'kC'],
      [KeyEvent.DOM_VK_HOME,   'kh'],
      [KeyEvent.DOM_VK_END,  '@7'],
      [KeyEvent.DOM_VK_PAGE_UP,   'kP'],
      [KeyEvent.DOM_VK_PAGE_DOWN, 'kN'],
      [KeyEvent.DOM_VK_PRINT,  '%9'],
    ].forEach(function(p) {
      vimjs.special_keys[p[0]] = p[1];
    });
    /* VIMJS_FOLD_END */

    /* initialize color names VIMJS_FOLD_START
     * https://github.com/harthur/color-convert
     * MIT License
     */
    vimjs.color_map = {
      aliceblue: [240,248,255],
      antiquewhite: [250,235,215],
      aqua: [0,255,255],
      aquamarine: [127,255,212],
      azure: [240,255,255],
      beige: [245,245,220],
      bisque: [255,228,196],
      black: [0,0,0],
      blanchedalmond: [255,235,205],
      blue: [0,0,255],
      blueviolet: [138,43,226],
      brown: [165,42,42],
      burlywood: [222,184,135],
      cadetblue: [95,158,160],
      chartreuse: [127,255,0],
      chocolate: [210,105,30],
      coral: [255,127,80],
      cornflowerblue: [100,149,237],
      cornsilk: [255,248,220],
      crimson: [220,20,60],
      cyan: [0,255,255],
      darkblue: [0,0,139],
      darkcyan: [0,139,139],
      darkgoldenrod: [184,134,11],
      darkgray: [169,169,169],
      darkgreen: [0,100,0],
      darkgrey: [169,169,169],
      darkkhaki: [189,183,107],
      darkmagenta: [139,0,139],
      darkolivegreen: [85,107,47],
      darkorange: [255,140,0],
      darkorchid: [153,50,204],
      darkred: [139,0,0],
      darksalmon: [233,150,122],
      darkseagreen: [143,188,143],
      darkslateblue: [72,61,139],
      darkslategray: [47,79,79],
      darkslategrey: [47,79,79],
      darkturquoise: [0,206,209],
      darkviolet: [148,0,211],
      deeppink: [255,20,147],
      deepskyblue: [0,191,255],
      dimgray: [105,105,105],
      dimgrey: [105,105,105],
      dodgerblue: [30,144,255],
      firebrick: [178,34,34],
      floralwhite: [255,250,240],
      forestgreen: [34,139,34],
      fuchsia: [255,0,255],
      gainsboro: [220,220,220],
      ghostwhite: [248,248,255],
      gold: [255,215,0],
      goldenrod: [218,165,32],
      gray: [128,128,128],
      green: [0,128,0],
      greenyellow: [173,255,47],
      grey: [128,128,128],
      honeydew: [240,255,240],
      hotpink: [255,105,180],
      indianred: [205,92,92],
      indigo: [75,0,130],
      ivory: [255,255,240],
      khaki: [240,230,140],
      lavender: [230,230,250],
      lavenderblush: [255,240,245],
      lawngreen: [124,252,0],
      lemonchiffon: [255,250,205],
      lightblue: [173,216,230],
      lightcoral: [240,128,128],
      lightcyan: [224,255,255],
      lightgoldenrodyellow: [250,250,210],
      lightgray: [211,211,211],
      lightgreen: [144,238,144],
      lightgrey: [211,211,211],
      lightpink: [255,182,193],
      lightsalmon: [255,160,122],
      lightseagreen: [32,178,170],
      lightskyblue: [135,206,250],
      lightslategray: [119,136,153],
      lightslategrey: [119,136,153],
      lightsteelblue: [176,196,222],
      lightyellow: [255,255,224],
      lime: [0,255,0],
      limegreen: [50,205,50],
      linen: [250,240,230],
      magenta: [255,0,255],
      maroon: [128,0,0],
      mediumaquamarine: [102,205,170],
      mediumblue: [0,0,205],
      mediumorchid: [186,85,211],
      mediumpurple: [147,112,219],
      mediumseagreen: [60,179,113],
      mediumslateblue: [123,104,238],
      mediumspringgreen: [0,250,154],
      mediumturquoise: [72,209,204],
      mediumvioletred: [199,21,133],
      midnightblue: [25,25,112],
      mintcream: [245,255,250],
      mistyrose: [255,228,225],
      moccasin: [255,228,181],
      navajowhite: [255,222,173],
      navy: [0,0,128],
      oldlace: [253,245,230],
      olive: [128,128,0],
      olivedrab: [107,142,35],
      orange: [255,165,0],
      orangered: [255,69,0],
      orchid: [218,112,214],
      palegoldenrod: [238,232,170],
      palegreen: [152,251,152],
      paleturquoise: [175,238,238],
      palevioletred: [219,112,147],
      papayawhip: [255,239,213],
      peachpuff: [255,218,185],
      peru: [205,133,63],
      pink: [255,192,203],
      plum: [221,160,221],
      powderblue: [176,224,230],
      purple: [128,0,128],
      red: [255,0,0],
      rosybrown: [188,143,143],
      royalblue: [65,105,225],
      saddlebrown: [139,69,19],
      salmon: [250,128,114],
      sandybrown: [244,164,96],
      seagreen: [46,139,87],
      seashell: [255,245,238],
      sienna: [160,82,45],
      silver: [192,192,192],
      skyblue: [135,206,235],
      slateblue: [106,90,205],
      slategray: [112,128,144],
      slategrey: [112,128,144],
      snow: [255,250,250],
      springgreen: [0,255,127],
      steelblue: [70,130,180],
      tan: [210,180,140],
      teal: [0,128,128],
      thistle: [216,191,216],
      tomato: [255,99,71],
      turquoise: [64,224,208],
      violet: [238,130,238],
      wheat: [245,222,179],
      white: [255,255,255],
      whitesmoke: [245,245,245],
      yellow: [255,255,0],
      yellowgreen: [154,205,50]
    };
    /* VIMJS_FOLD_END */

    document.addEventListener('keypress', function(e) {
      e.preventDefault();
      vimjs.handle_key(e.charCode, e.keyCode, e);
    });

    /* 
     * Most keys can be handled during the keypress event
     * But some special keys must be handled during the keydown event in order to prevent default actions
     *
     * F means "needed for Firfox"
     * C means "needed for Chrome"
     */
    var keys_to_intercept_upon_keydown = {};
    [ KeyEvent.DOM_VK_ESCAPE, // CF
      KeyEvent.DOM_VK_TAB, // C
      KeyEvent.DOM_VK_BACK_SPACE, // C 
      KeyEvent.DOM_VK_UP, // C
      KeyEvent.DOM_VK_DOWN, // C
      KeyEvent.DOM_VK_LEFT, // C
      KeyEvent.DOM_VK_RIGHT, // C
      KeyEvent.DOM_VK_DELETE, // C
      KeyEvent.DOM_VK_PAGE_UP, // C
      KeyEvent.DOM_VK_PAGE_DOWN, // C
    ].forEach(function(k) {
      keys_to_intercept_upon_keydown[k] = 1;
    });

    /* capture some special keys that won't trigger 'keypress' */
    document.addEventListener('keydown', function(e) {
      if(e.keyCode in keys_to_intercept_upon_keydown)  {
        e.preventDefault();
        vimjs.handle_key(0, e.keyCode, e);
      }
    });
  },

  vimjs_sleep: function (_, ms) {
    setTimeout(_, ms);
  },
  
  vimjs_wait_for_chars__deps: ['$vimjs'],
  vimjs_wait_for_chars: function(_, wtime) {
    if(wtime > 0) {
      var stop_time = Date.now() + wtime;
    }    
    // TODO: use macros of OK/FAIL
    do {
      if(vimjs.input_available())
        return 1; // OK
      setTimeout(_, 10);
    } while((wtime == -1) || (Date.now() < stop_time));
    return 0; // FAIL
  },

  /* process pending events */
  vimjs_update: function(_) {
    setTimeout(_, 1);
  },

  vimjs_beep__deps: ['$vimjs'],
  vimjs_beep: function() {
    var beep_node = vimjs.beep_node;
    /* sometimes this is called before vimjs.beep is initialized */
    if(beep_node) {
      if(vimjs.is_chrome) {
        // without this Chrome would only play it once
        beep_node.load(); 
      }
      beep_node.play();
    }
  },

  vimjs_flash: function() {
    console.log('TODO: vimjs_flash');
  },

  vimjs_get_screen_width__deps: ['$vimjs'],
  vimjs_get_screen_width: function() {
    return vimjs.container_node.clientWidth;
  },

  vimjs_get_screen_height__deps: ['$vimjs'],
  vimjs_get_screen_height: function() {
    return vimjs.container_node.clientHeight;
  },

  // ensure that we have enough blocks
  vimjs_check_dimension__deps: ['$vimjs'],
  vimjs_check_dimension: function(rows, cols) {
    try {
      if (vimjs.container_node.childNodes[rows-1].childNodes[cols-1] === undefined)
        resize(rows, cols);
    } catch (e) {
        resize(rows, cols);
    }
  },

  vimjs_draw_string__deps: ['$vimjs'],
  vimjs_draw_string: function(row, col, s, len, flags) {
    var class_name = '';
    var set_fg_color = true;
    // TODO: use macros
    if(flags & 0x01) {
      class_name += ' trans';
      set_fg_color = false;
    }
    if(flags & 0x02) class_name += ' bold';
    if(flags & 0x04) class_name += ' underl';
    if(flags & 0x08) class_name += ' underc';

    s = Pointer_stringify(s);
    var row_list = vimjs.container_node.childNodes[row].childNodes;
    for(var i = 0; i < len; ++i) {
      var cur_ele = row_list[col+i];
      cur_ele.className = class_name;
      if(set_fg_color) 
        cur_ele.style.color = vimjs.fg_color;
      cur_ele.style.backgroundColor = vimjs.bg_color;
      cur_ele.textContent = s[i];
    }
  },

  vimjs_clear_block__deps: ['$vimjs'],
  vimjs_clear_block: function(row1, col1, row2, col2) {
    var row_list = vimjs.container_node.childNodes;
    for(var r = row1; r <= row2; ++r) {
      var cur_row  = row_list[r].childNodes;
      for(var c = col1; c <= col2; ++c) {
        var cur_ele = cur_row[c];
        cur_ele.className = 'trans';
        cur_ele.style.backgroundColor = vimjs.bg_color;
        cur_ele.textContent = ' ';
      }
    }
  },   

  vimjs_clear_all__deps: ['$vimjs'],
  vimjs_clear_all: function() {
    var row_list = vimjs.container_node.childNodes;
    for(var r = 0, rl = row_list.length; r < rl; ++r) {
      var cur_row  = row_list[r].childNodes;
      for(var c = 0, cl = cur_row.length; c < cl; ++c) {
        var cur_ele = cur_row[c];
        cur_ele.className = 'trans';
        cur_ele.style.backgroundColor = vimjs.bg_color;
        cur_ele.textContent = ' ';
      }
    }
  },

  vimjs_delete_lines__deps: ['$vimjs'],
  vimjs_delete_lines: function(row, num_lines) {
    var container_node = vimjs.container_node;
    var child_to_remove = container_node.childNodes[row];
    for(var i = 0; i < num_lines; ++i) {
      var next_child = child_to_remove.nextSibling;
      container_node.removeChild(child_to_remove);
      child_to_remove = next_child;
    }
    // append some new lines in the end
    var cols = vimjs.cols;
    for(var r = 0; r < num_lines; ++r) {
      var row_ele = document.createElement('div');
      row_ele.classList.add('vimjs-line');
      for(var c = 0; c < cols; ++c) {
        var cur_ele = document.createElement('span');
        cur_ele.className='trans';
        cur_ele.style.backgroundColor = vimjs.bg_color;
        cur_ele.textContent = ' ';
        row_ele.appendChild(cur_ele);
      }
      container_node.appendChild(row_ele);
    }
  },

  vimjs_insert_lines__deps: ['$vimjs'],
  vimjs_insert_lines: function(row, num_lines) {
    var container_node = vimjs.container_node;
    var cur_children = container_node.childNodes;
    var ref_child = (cur_children.length > row ? cur_children[row] : null);
    for(var r = 0; r < num_lines; ++r) {
      var row_ele = document.createElement('div');
      row_ele.classList.add('vimjs-line');
      var row_ele_list = [];
      for(var c = 0; c < vimjs.cols; ++c) {
        var cur_ele = document.createElement('span');
        cur_ele.className='trans';
        cur_ele.style.backgroundColor = vimjs.bg_color;
        cur_ele.textContent = ' ';
        row_ele.appendChild(cur_ele);
        row_ele_list.push(cur_ele);
      }
      container_node.insertBefore(row_ele, ref_child); 
    }
    // remove extra lines
    for(var i = 0; i < num_lines; ++i)
      container_node.removeChild(container_node.lastChild);
  },

  vimjs_init_font__deps: ['$vimjs'],
  vimjs_init_font: function(font) {
    if(typeof font !== 'string')
      font = Pointer_stringify(font);
    if(!font)
      font = '12px monospace';

    var container_node = vimjs.container_node;
    container_node.style.font = font;
    if(!container_node.hasChildNodes()) {
      /* the content will be cleared in resize() anyway */
      container_node.innerHTML = '<div class="vimjs-line"><span class="trans"> </span></div>';
    }
    var first_ele = container_node.firstChild.firstChild;
    /* clientWidth/Height won't work */
    vimjs.char_height = Math.max(1, first_ele.offsetHeight);
    vimjs.char_width = Math.max(1, first_ele.offsetWidth);

    /* adjust the line height to fit the font */
    vimjs.style_node.innerHTML = '.vimjs-line{line-height:' + vimjs.char_height + 'px;}';

    vimjs.resize();
  },
  vimjs_get_char_width__deps: ['$vimjs'], 
  vimjs_get_char_width: function() {
    return vimjs.char_width;
  },
  vimjs_get_char_height__deps: ['$vimjs'], 
  vimjs_get_char_height: function() {
    return vimjs.char_height;
  },

  vimjs_is_valid_color__deps: ['$vimjs'],
  vimjs_is_valid_color: function(colorp) {
    var color = Pointer_stringify(colorp);
    return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(color)
      || (color.toLowerCase() in vimjs.color_map);
  },
  vimjs_get_rgb__deps: ['$vimjs'],
  vimjs_get_rgb: function (string) {
    string = Pointer_stringify(string);
    string = string.toLowerCase();
    // https://github.com/harthur/color-string
    // MIT License
    var abbr = /^#([a-fA-F0-9]{3})$/;
    var hex = /^#([a-fA-F0-9]{6})$/;

    var rgb = [0, 0, 0];
    var match = string.match(abbr);
    if (match) {
      match = match[1];
      for (var i = 0; i < rgb.length; i++) {
        rgb[i] = parseInt(match[i] + match[i], 16);
      }
    } else if (match = string.match(hex)) {
      match = match[1];
      for (var i = 0; i < rgb.length; i++) {
        rgb[i] = parseInt(match.slice(i * 2, i * 2 + 2), 16);
      }
    } else {
      var builtin_rgb = vimjs.color_map[string];
      if(builtin_rgb)
        rgb = builtin_rgb;
    }
    var ret = 0;
    for (var i = 0; i < rgb.length; i++) {
      ret = (ret << 8) + rgb[i];
    }
    return ret;
  },
  vimjs_set_fg_color__deps: ['$vimjs'],
  vimjs_set_fg_color: function(color) {
    vimjs.fg_color = vimjs.get_color_string(color);
  },
  vimjs_set_bg_color__deps: ['$vimjs'],
  vimjs_set_bg_color: function(color) {
    vimjs.bg_color = vimjs.get_color_string(color);
  },
  vimjs_set_sp_color__deps: ['$vimjs'],
  vimjs_set_sp_color: function(color) {
    vimjs.sp_color = vimjs.get_color_string(color);
  },

  vimjs_print_stacktrace: function() {
    console.log((new Error).stack);
  },

  vimjs_call_shell: function(cmd, options) {
    cmd = Pointer_stringify(cmd);
    try {
      try {
        // the cmd may be a JavaScript snippet
        eval(cmd);
      } catch (e) {
        if(e instanceof SyntaxError) {
          // try to execute a file
          try {
            var content = FS.readFile(cmd.replace(/(^\s+|\s+$)/g, ''), { encoding: 'utf8'} );
          } catch(e1) {
            // cannot find file, throw the old Error
            throw e;
          }
          eval(content);
        } else {
          // not a SyntaxError, process it outside
          throw e;
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        console.log(e.name + ': ' + e.message);
      } else {
        console.log('Exception thrown: ', e);
      }
    }
  }, 

  vimjs_browse__dep: ['$vimjs'],
  vimjs_browse: function(cb, buf, buf_size, saving, default_name, init_dir) {
    default_name = Pointer_stringify(default_name);
    if(default_name === 'local' && window.FileReader) { 
      if(saving) {
        // save to local 
        // TODO
      } else {
        vimjs.load_local_file(cb, buf);
      }
    } else if (default_name === 'dropbox') {
      if(saving) {
        vimjs.ensure_dropbox(function() {
          vimjs.save_dropbox_file(cb, buf);
        });
      } else {
        vimjs.ensure_dropbox(function() {
          vimjs.load_dropbox_file(cb, buf);
        });
      }
    } else {
      vimjs.load_nothing(cb, buf);
    }
  },

  /* func is a function pointer */
  vimjs_async_call_safe1: function(_, func, arg1) {
    func = FUNCTION_TABLE[func];
    if(func.length == 1) {
      return func(arg1);
    } else if (func.length == 2) {
      return func(_, arg1);
    } else {
      throw new Error('Cannot make async call');
    }
  },

  /* func is a function pointer */
  vimjs_async_call_safe2: function(_, func, arg1, arg2) {
    func = FUNCTION_TABLE[func];
    if(func.length == 2) {
      return func(arg1, arg2);
    } else if (func.length == 3) {
      return func(_, arg1, arg2);
    } else {
      throw new Error('Cannot make async call');
    }
  },

  /* func is a function pointer */
  vimjs_async_call_safe3: function(_, func, arg1, arg2, arg3) {
    func = FUNCTION_TABLE[func];
    if(func.length == 3) {
      return func(arg1, arg2, arg3);
    } else if (func.length == 4) {
      return func(_, arg1, arg2, arg3);
    } else {
      throw new Error('Cannot make async call');
    }
  },

  /* func is a function pointer */
  vimjs_async_call_safe6: function(_, func, arg1, arg2, arg3, arg4, arg5, arg6) {
    func = FUNCTION_TABLE[func];
    if(func.length == 6) {
      return func(arg1, arg2, arg3, arg4, arg5, arg6);
    } else if (func.length == 7) {
      return func(_, arg1, arg2, arg3, arg4, arg5, arg6);
    } else {
      throw new Error('Cannot make async call');
    }
  },

  vimjs_dummy__: null 
});
