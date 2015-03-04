/*  vim: set sw=2 ts=2 et ft=javascript   : */
/*
 * vim_lib.js: connect DOM and user inputs to Vim.js
 *
 * Copyright (c) 2013,2014 Lu Wang <coolwanglu@gmail.com>
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
var LibraryVIM = {
  $vimjs__deps: ['mktemp'],
  $vimjs: {
    is_firefox: false,
    is_chrome: false,

    // HTML elements
    container_node: null,
    canvas_node: null,
    beep_node: null, // for beeping
    file_node: null, // file selector
    font_test_node: null,
    trigger_dialog_node: null, // to trigger file selector

    canvas_ctx: null,

    // dimensions
    devicePixelRatio: 0,
    char_width: 1,
    char_height: 1,
    window_width: 0,
    window_height: 0,

    // styles
    font: '12px monospace',
    fg_color: '#fff',
    bg_color: '#000',
    sp_color: '#f00',

    // functions 
    gui_web_handle_key: null,
    input_available: null,

    special_keys: [],
    special_keys_namemap: {},
    color_map: {},
    file_callback: null,
    dropbox_callback: null,
    trigger_callback: null,

    // workaround for ^W on non-firefox
    ctrl_pressed: false,

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

      var handled = false;
      if(charCode == 0) {
        var special = vimjs.special_keys[keyCode];
        if(special !== undefined) {
          vimjs.gui_web_handle_key(charCode || keyCode, modifiers, special.charCodeAt(0), special.charCodeAt(1));
          handled = true;
        } 
      }

      if(!handled)
        vimjs.gui_web_handle_key(charCode || keyCode, modifiers, 0, 0);

    },//VIMJS_FOLD_END

    get_color_string: function(color) {//VIMJS_FOLD_START
      var bgr = [];
      for(var i = 0; i < 3; ++i) {
        bgr.push(color & 0xff);
        color >>= 8;
      }
      return 'rgb('+bgr[2]+','+bgr[1]+','+bgr[0]+')';
    },//VIMJS_FOLD_END

    // dirty works, called before the program starts
    pre_run: function () {//VIMJS_FOLD_START
      // setup directories & environment
      ENV['USER'] = 'root';
      ENV['HOME'] = '/root'; 
      ENV['PWD'] = '/root';
      ENV['_'] = '/bin/vim';

      Module["FS_createPath"]("/", "root", true, true);
      FS.currentPath = '/root';

      // load .vimrc, use localStorage when possible
      var vimrc_storage_id = 'vimjs/root/.vimrc';
      if(typeof localStorage !== 'undefined') {
        var stored_vimrc = localStorage[vimrc_storage_id];
        if(stored_vimrc) {
          Module['FS_createDataFile']('/root', '.vimrc', stored_vimrc, true, true);
        }
        window.addEventListener('beforeunload', function() {
          // save ~/.vimrc upon exit
          try {
            localStorage[vimrc_storage_id] = FS.readFile('/root/.vimrc', { encoding: 'utf8' });
          } catch(e) {
          }
          // show message about ^W
          if((!vimjs.is_firefox) && (vimjs.ctrl_pressed)) {
            vimjs.ctrl_pressed = false;
            return "^W is not working on non-Firefox browsers.";
          }
        });
      } 
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
    
    // load file from different locations VIMJS_FOLD_START

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
    }, // VIMJS_FOLD_END

    invert_canvas: function(x, y, w, h) {
      var ctx = vimjs.canvas_ctx;
      var img = ctx.getImageData(x, y, w, h);
      var data = img.data;
      for(var i = 0, l = data.length; i < l;) {
        data[i] = 255 - data[i];
        ++i;
        data[i] = 255 - data[i];
        ++i;
        data[i] = 255 - data[i];
        i += 2;
      }
      ctx.putImageData(img, x, y);
    },

    __dummy__: null
  },

  vimjs_init__deps: ['vimjs_init_font'],
  vimjs_init: function () {
    vimjs.is_firefox = typeof InstallTrigger !== 'undefined';
    vimjs.is_chrome = !!window.chrome;
    
    vimjs.gui_web_handle_key = Module['cwrap']('gui_web_handle_key', null, ['number', 'number', 'number', 'number']);
    vimjs.input_available = Module['cwrap']('input_available', 'number', []);

    vimjs.beep_node = document.getElementById('vimjs-beep');

    vimjs.file_node = document.getElementById('vimjs-file');
    vimjs.file_node.addEventListener('change', function(e) {
      if(vimjs.file_callback)
        vimjs.file_callback(e.target.files);
    });

    vimjs.font_test_node = document.getElementById('vimjs-font-test');

    document.getElementById('vimjs-trigger-button').addEventListener('click', function() {
      if(vimjs.trigger_callback)
        vimjs.trigger_callback();
    });
    var trigger_dialog_node =  vimjs.trigger_dialog_node = document.getElementById('vimjs-trigger-dialog');
    trigger_dialog_node.parentNode.removeChild(trigger_dialog_node);
    trigger_dialog_node.style.display = 'block';

    var canvas_node = vimjs.canvas_node = document.getElementById('vimjs-canvas');
    canvas_node.style.display = 'block';
    vimjs.canvas_ctx = canvas_node.getContext('2d');

    var container_node = vimjs.container_node = document.getElementById('vimjs-container');
    // there might be text nodes of other stuffs before loading vim
    container_node.removeChild(canvas_node);
    container_node.innerHTML = '';
    container_node.appendChild(canvas_node);
    container_node.style.backgroundColor = 'black';

    vimjs.devicePixelRatio = window.devicePixelRatio || 1;
    vimjs.window_width = container_node.clientWidth * vimjs.devicePixelRatio;
    vimjs.window_height = container_node.clientHeight * vimjs.devicePixelRatio;

    _vimjs_init_font('');

    /* initialize special_keys VIMJS_FOLD_START*/
    vimjs.special_keys = [];
    vimjs.special_keys_namemap = {};
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
      vimjs.special_keys_namemap[p[1]] = p[0];
    });
    /* VIMJS_FOLD_END */

    /* initialize color names VIMJS_FOLD_START
     *
     * a few colors added by Lu Wang
     * original version from https://github.com/harthur/color-convert
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
      darkyellow: [0xbb, 0xbb, 0], // WL
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
      gray: [128,128,128], // WL
      gray10: [0x1a, 0x1a, 0x1a], // WL
      gray20: [0x33, 0x33, 0x33], // WL
      gray30: [0x4d, 0x4d, 0x4d], // WL
      gray40: [0x66, 0x66, 0x66], // WL
      gray50: [0x7f, 0x7f, 0x7f], // WL
      gray60: [0x99, 0x99, 0x99], // WL
      gray70: [0xb3, 0xb3, 0xb3], // WL
      gray80: [0xcc, 0xcc, 0xcc], // WL
      gray90: [0xe5, 0xe5, 0xe5], // WL
      grey: [128,128,128],
      grey10: [0x1a, 0x1a, 0x1a], // WL
      grey20: [0x33, 0x33, 0x33], // WL
      grey30: [0x4d, 0x4d, 0x4d], // WL
      grey40: [0x66, 0x66, 0x66], // WL
      grey50: [0x7f, 0x7f, 0x7f], // WL
      grey60: [0x99, 0x99, 0x99], // WL
      grey70: [0xb3, 0xb3, 0xb3], // WL
      grey80: [0xcc, 0xcc, 0xcc], // WL
      grey90: [0xe5, 0xe5, 0xe5], // WL
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
      lightred: [0xff, 0xbb, 0xbb], // WL
      lightblue: [173,216,230],
      lightcoral: [240,128,128],
      lightcyan: [224,255,255],
      lightgoldenrodyellow: [250,250,210],
      lightgray: [211,211,211],
      lightgreen: [144,238,144],
      lightgrey: [211,211,211],
      lightmagenta: [0xff, 0xbb, 0xff], // WL
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
    vimjs.lastMouseDownTarget = vimjs.canvas_node; // set focus on start
    var ignoreKeys = function() {
      return (vimjs.lastMouseDownTarget !== vimjs.canvas_node);
    }

    document.addEventListener('mousedown', function(event) {
        if (vimjs.canvas_node.contains(event.target)) {
          vimjs.lastMouseDownTarget = vimjs.canvas_node;
        } else {
          vimjs.lastMouseDownTarget = event.target;
        }
        //console.log("lastmousedown", vimjs.lastMouseDownTarget);
      },
      false);

    document.addEventListener('keypress', function(e) {
      if (ignoreKeys()) return true;
      e.preventDefault();
      vimjs.handle_key(e.charCode, e.keyCode, e);
    });

    /* 
     * Most keys can be handled during the keypress event
     * But some special keys must be handled during the keydown event in order to prevent default actions
     *
     * F means "needed for Firefox"
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
      if (ignoreKeys()) return true;
      if(e.keyCode in keys_to_intercept_upon_keydown)  {
        e.preventDefault();
        vimjs.handle_key(0, e.keyCode, e);
      }
    });

    if(!vimjs.is_firefox) {
      // monitor ctrl for non-firefox
      // display dialog if ^W is pressed
      document.addEventListener('keydown', function(e) {
        if (ignoreKeys()) return true;
        if(e.keyCode === KeyEvent.DOM_VK_CONTROL)
          vimjs.ctrl_pressed = true;
      });
      document.addEventListener('keyup', function(e) {
        if (ignoreKeys()) return true;
        if(e.keyCode === KeyEvent.DOM_VK_CONTROL)
          vimjs.ctrl_pressed = false;
      });
    }
  },
  
  vimjs_prepare_exit: function() {
    if(!!Module['VIMJS_ALLOW_EXIT']) {
      // This is likely to be set by async jobs
      // hack it to exit normally
      Module['noExitRuntime'] = false;
      return 1;
    } else {
      return 0;
    }
  },

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

  vimjs_flash__deps: ['emscripten_async_resume'],
  vimjs_flash: function(msec) {
    var canvas_node = vimjs.canvas_node;
    var w = canvas_node.width;
    var h = canvas_node.height;
    vimjs.invert_canvas(0, 0, w, h);
    setTimeout(function() {
      vimjs.invert_canvas(0, 0, w, h);
      asm['setAsync']();
      _emscripten_async_resume();
    }, msec);
  },

  vimjs_get_window_width: function() {
    return vimjs.window_width;
  },

  vimjs_get_window_height: function() {
    return vimjs.window_height;
  },

  vimjs_resize: function(width, height) {
    var container_node = vimjs.container_node;
    container_node.style.width = width / vimjs.devicePixelRatio + container_node.offsetWidth - container_node.clientWidth + 'px';
    container_node.style.height = height / vimjs.devicePixelRatio + container_node.offsetHeight - container_node.clientHeight + 'px';
    var canvas_node = vimjs.canvas_node;
    canvas_node.width = width;
    canvas_node.height = height;
  },

  vimjs_draw_string__deps: ['vimjs_clear_block'],
  vimjs_draw_string: function(row, col, s, len, flags) {

    // TODO: use macros for flag constants
    if(!(flags & 0x01)) {
      _vimjs_clear_block(row, col, row, col + len - 1);
    }

    var font = vimjs.font;
    if(flags & 0x02) font = 'bold ' + font;

    s = Pointer_stringify(s, len);

    var ctx = vimjs.canvas_ctx;

    ctx.font = font;
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = vimjs.fg_color;

    var x = col * vimjs.char_width;
    var y = (row + 1) * vimjs.char_height;
    var w = len * vimjs.char_width;
    ctx.fillText(s, x, y, w);

    if(flags & 0x04) { // underline
      ctx.strokeStyle = vimjs.fg_color;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.5);
      ctx.lineTo(x + w, y - 0.5);
      ctx.stroke();
    }
    if(flags & 0x08) { // undercurl
      var offs = [1.5, 0.5, 0.5, 0.5, 1.5, 2.5, 2.5, 2.5];
      ctx.strokeStyle = vimjs.sp_color;
      ctx.beginPath();
      ctx.moveTo(x, y - offs[x%8]);

      for(var xx = x + 1, xx2 = x + w; xx < xx2; ++xx)
        ctx.lineTo(xx, y - offs[xx%8]);

      ctx.stroke();
    }
  },

  vimjs_clear_block: function(row1, col1, row2, col2) {
    var ctx = vimjs.canvas_ctx;
    ctx.fillStyle = vimjs.bg_color;
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    ctx.fillRect(col1 * cw,
                 row1 * ch,
                 (col2-col1+1) * cw,
                 (row2-row1+1) * ch);
  },   

  vimjs_clear_all: function() {
    var canvas_node = vimjs.canvas_node;
    var ctx = vimjs.canvas_ctx;
    ctx.fillStyle = vimjs.bg_color;
    ctx.fillRect(0, 0, canvas_node.width, canvas_node.height);
  },

  vimjs_delete_lines__deps: ['vimjs_clear_block'],
  vimjs_delete_lines: function(num_lines, row1, row2, col1, col2) {
    var ctx = vimjs.canvas_ctx;
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    var x = col1 * cw;
    var y = (row1 + num_lines) * ch;
    var w = (col2 - col1 + 1) * cw;
    var h = (row2 + 1) * ch - y;
    ctx.drawImage(vimjs.canvas_node, 
                  x, y, w, h,
                  x, row1 * ch, w, h);

    _vimjs_clear_block(row2 - num_lines + 1, col1, row2, col2);
  },

  vimjs_insert_lines__deps: ['vimjs_clear_block'],
  vimjs_insert_lines: function(num_lines, row1, row2, col1, col2) {
    var ctx = vimjs.canvas_ctx;
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    var x = col1 * cw;
    var w = (col2 - col1 + 1) * cw;
    var h = (row2 - row1 - num_lines + 1) * ch;
    ctx.drawImage(vimjs.canvas_node, 
                  x, row1 * ch, w, h,
                  x, (row1 + num_lines) * ch, w, h);

    _vimjs_clear_block(row1, col1, row1 + num_lines - 1, col2);
  },

  vimjs_draw_hollow_cursor: function(row, col) {
    var ctx = vimjs.canvas_ctx;
    ctx.strokeStyle = vimjs.fg_color;
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    ctx.strokeRect(col * cw + 0.5, row * ch + 0.5, cw - 1, ch - 1);
  },

  vimjs_draw_part_cursor: function(row, col, width, height) {
    var ctx = vimjs.canvas_ctx;
    ctx.fillStyle = vimjs.fg_color;
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    ctx.fillRect(col * cw, (row + 1) * ch - height, width, height);
  },

  vimjs_invert_rectangle: function(row, col, row_count, col_count) {
    var cw = vimjs.char_width;
    var ch = vimjs.char_height;
    vimjs.invert_canvas(col * cw, row * ch, col_count *cw, row_count * ch);
  },

  vimjs_init_font: function(font) {
    if(typeof font !== 'string')
      font = Pointer_stringify(font);
    if(!font)
      font = '12px monospace';

    var font_test_node = vimjs.font_test_node;
    font_test_node.style.font = font;
    font_test_node.innerHTML = 'm';

    /* clientWidth/Height won't work */
    vimjs.char_height = Math.max(1, font_test_node.clientHeight * vimjs.devicePixelRatio);
    vimjs.char_width = Math.max(1, font_test_node.clientWidth * vimjs.devicePixelRatio);
  },

  vimjs_set_font: function(font) {
    vimjs.font = Pointer_stringify(font);
    try {
      var l = vimjs.font.split(/([\d]+)(?=in|[cem]m|ex|p[ctx])/);
      l[1] = parseFloat(l[1]) * vimjs.devicePixelRatio;
      vimjs.font = l.join('');
    } catch (e) { }
  },

  vimjs_check_font: function(font) {
    // check if font exists
    font = Pointer_stringify(font);
    var font_test_node = vimjs.font_test_node;
    font_test_node.innerHTML = 'the quick brown fox jumps over the lazy dog';

    return ['serif', 'sans-serif', 'monospace'].some(function(base_font) {
      font_test_node.style.font = font + ',' + base_font;
      // override existing definition of font size
      font_test_node.style.fontSize = '64px';
      var w = font_test_node.clientWidth;
      var h = font_test_node.clientHeight;
  
      font_test_node.style.font = '64px ' + base_font;
      return (font_test_node.clientWidth != w) || (font_test_node.clientHeight != h);
    });
  },

  vimjs_get_char_width: function() {
    return vimjs.char_width;
  },
  vimjs_get_char_height: function() {
    return vimjs.char_height;
  },

  vimjs_is_valid_color: function(colorp) {
    var color = Pointer_stringify(colorp);
    return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(color)
      || (color.toLowerCase() in vimjs.color_map);
  },
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
  vimjs_set_fg_color: function(color) {
    vimjs.fg_color = vimjs.get_color_string(color);
  },
  vimjs_set_bg_color: function(color) {
    vimjs.bg_color = vimjs.get_color_string(color);
  },
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

  vimjs_browse__dep: ['$vimjs', 'emscripten_async_resume'],
  vimjs_browse: function(buf, buf_size, saving, default_name, init_dir) {
    asm['setAsync']();
    default_name = Pointer_stringify(default_name);
    if(default_name === 'local' && window.FileReader) { 
      if(saving) {
        // TODO: save to local 
        setTimeout(_emscripten_async_resume, 1);
      } else {
        vimjs.load_local_file(_emscripten_async_resume, buf);
      }
    } else if (default_name === 'dropbox') {
      if(saving) {
        vimjs.ensure_dropbox(function() {
          vimjs.save_dropbox_file(_emscripten_async_resume, buf);
        });
      } else {
        vimjs.ensure_dropbox(function() {
          vimjs.load_dropbox_file(_emscripten_async_resume, buf);
        });
      }
    } else {
      vimjs.load_nothing(_emscripten_async_resume, buf);
    }
  },

  vimjs_haskey: function(name) {
    name = Pointer_stringify(name, 2);
    return (name in vimjs.special_keys_namemap);
  },

  vimjs_dummy__: null 
};
autoAddDeps(LibraryVIM, '$vimjs');
mergeInto(LibraryManager.library, LibraryVIM);
