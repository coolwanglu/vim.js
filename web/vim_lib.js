/*  vim: set sw=2 ts=2 et foldmethod=marker foldmarker=VIMJS_FOLD_START,VIMJS_FOLD_END : */
/*
 * vim_lib.js: connect DOM and user inputs to VIM
 *
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */
mergeInto(LibraryManager.library, {
  $vimjs: {
    container: null,
    rows: 0,
    cols: 0,
    char_width: 0,
    char_height: 1,
    fg_color: null,
    bg_color: null,
    sp_color: null,
    gui_browser_add_to_input_buf: null,
    input_available: null,
    gui_resize_shell: null,
    special_keys: [],
    color_map: {},

    // functions that are not exposed to C
    handle_key: function(charCode, keyCode, e) {
      // macros defined in keymap.h
      var modifiers = 0;
      // shift already affects charCode
      if(charCode && e.shiftKey) modifiers |= 0x02;
      if(e.ctrlKey) modifiers |= 0x04;
      if(e.altKey) modifiers |= 0x08;
      if(e.metaKey) modifiers |= 0x10;

      var special = vimjs.special_keys[keyCode];
      if(special !== undefined) {
        vimjs.gui_browser_handle_key(charCode || keyCode, modifiers, special.charCodeAt(0), special.charCodeAt(1));
      } else {
        vimjs.gui_browser_handle_key(charCode || keyCode, modifiers, 0, 0);
      }
    },

    get_color_string: function(color) {
      var bgr = [];
      for(var i = 0; i < 3; ++i) {
        bgr.push(color & 0xff);
        color >>= 8;
      }
      return 'rgb('+bgr[2]+','+bgr[1]+','+bgr[0]+')';
    },

    resize: function() {
      var screen_w = _vimjs_get_screen_width();
      var screen_h = _vimjs_get_screen_height();
      var rows = vimjs.rows = Math.floor(screen_h / vimjs.char_height) + 1;
      var cols = vimjs.cols = Math.floor(screen_w / vimjs.char_width) + 1;
      var container = vimjs.container;
      // TODO: optimize: reuse old elements
      // clear old elements
      container.innerHTML = '';
      var style= 'background-color:' + vimjs.bg_color + ';';
      for(var r = 0; r < rows; ++r) {
        var row_ele = document.createElement('div');
        row_ele.classList.add('vimjs-line');
        for(var c = 0; c < cols; ++c) {
          var col_ele = document.createElement('span');
          col_ele.className='trans';
          col_ele.style = style;
          col_ele.textContent = ' ';
          row_ele.appendChild(col_ele);
        }
        container.appendChild(row_ele);
      }

      vimjs.gui_resize_shell(screen_w, screen_h); 
    },

    __dummy__: null
  },

  vimjs_init__deps: ['$vimjs', 'vimjs_init_font'],
  vimjs_init: function () {
    vimjs.gui_browser_handle_key = Module['cwrap']('gui_browser_handle_key', null, ['number', 'number', 'number', 'number']);
    vimjs.input_available = Module['cwrap']('input_available', 'number', []);
    vimjs.gui_resize_shell = Module['cwrap']('gui_resize_shell', null, ['number', 'number'])

    vimjs.fg_color = '#fff';
    vimjs.bg_color = '#000';
    vimjs.sp_color = '#f00';

    var container = vimjs.container = document.getElementById('vimjs-container');
    // there might be text nodes of other stuffs before loading vim
    container.innerHTML = '';

    // will call the resize function
    _vimjs_init_font('');

    /* initialize special_keys VIMJS_FOLD_START*/
    vimjs.special_keys = [];
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
    /* capture some special keys that won't trigger 'keypress' */
    document.addEventListener('keydown', function(e) {
      // TODO, create an array for all needed key codes
      if(e.keyCode == 27)  {// ESC
        e.preventDefault();
        vimjs.handle_key(0, e.keyCode, e);
      }
    });
  },

  vimjs_sleep: function (cb, ms) {
    setTimeout(cb, ms);
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

  vimjs_beep: function() {
    console.log('TODO: vimjs_beep');
  },

  vimjs_flash: function() {
    console.log('TODO: vimjs_flash');
  },

  vimjs_get_screen_width__deps: ['$vimjs'],
  vimjs_get_screen_width: function() {
    return vimjs.container.offsetWidth;
  },

  vimjs_get_screen_height__deps: ['$vimjs'],
  vimjs_get_screen_height: function() {
    return vimjs.container.offsetHeight;
  },

  vimjs_draw_string__deps: ['$vimjs'],
  vimjs_draw_string: function(row, col, s, len, flags) {
    var class_name = '';
    var style = '';

    // TODO: use macros
    if(flags & 0x01) class_name += ' trans';
    else style += 'color:' + vimjs.fg_color + ';';

    if(flags & 0x02) class_name += ' bold';
    if(flags & 0x04) class_name += ' underl';
    if(flags & 0x08) class_name += ' underc';

    style += 'background-color:' + vimjs.bg_color + ';';

    s = Pointer_stringify(s);
    var row_list = vimjs.container.childNodes[row].childNodes;
    for(var i = 0; i < len; ++i) {
      var cur_ele = row_list[col+i];
      cur_ele.className = class_name;
      cur_ele.style = style;
      cur_ele.textContent = s[i];
    }
  },

  vimjs_clear_block__deps: ['$vimjs'],
  vimjs_clear_block: function(row1, col1, row2, col2) {
    var row_list = vimjs.container.childNodes;
    var style= 'background-color:' + vimjs.bg_color + ';';
    for(var r = row1; r <= row2; ++r) {
      var cur_row  = row_list[r].childNodes;
      for(var c = col1; c <= col2; ++c) {
        var cur_ele = cur_row[c];
        cur_ele.className = 'trans';
        cur_ele.style = style;
        cur_ele.textContent = ' ';
      }
    }
  },   

  vimjs_clear_all__deps: ['$vimjs'],
  vimjs_clear_all: function() {
    var row_list = vimjs.container.childNodes;
    var style= 'background-color:' + vimjs.bg_color + ';';
    for(var r = 0, rl = row_list.length; r < rl; ++r) {
      var cur_row  = row_list[r].childNodes;
      for(var c = 0, cl = cur_row.length; c < cl; ++c) {
        var cur_ele = cur_row[c];
        cur_ele.className = 'trans';
        cur_ele.style = style;
        cur_ele.textContent = ' ';
      }
    }
  },

  vimjs_delete_lines__deps: ['$vimjs'],
  vimjs_delete_lines: function(row, num_lines) {
    var container = vimjs.container;
    var cur_children = container.childNodes;
    for(var i = row, l = row + num_lines; i < l; ++i)
      container.removeChild(cur_children[i]);
    // append some new lines in the end
    var style= 'background-color:' + vimjs.bg_color + ';';
    var cols = vimjs.cols;
    for(var r = 0; r < num_lines; ++r) {
      var row_ele = document.createElement('div');
      row_ele.classList.add('vimjs-line');
      for(var c = 0; c < cols; ++c) {
        var col_ele = document.createElement('span');
        col_ele.className='trans';
        col_ele.style = style;
        col_ele.textContent = ' ';
        row_ele.appendChild(col_ele);
      }
      container.appendChild(row_ele);
    }
  },

  vimjs_insert_lines__deps: ['$vimjs'],
  vimjs_insert_lines: function(row, num_lines) {
    var container = vimjs.container;
    var cur_children = container.childNodes;
    var ref_child = (cur_children.length > row ? cur_children[row] : null);
    var style= 'background-color:' + vimjs.bg_color + ';';
    for(var r = 0; r < num_lines; ++r) {
      var row_ele = document.createElement('div');
      row_ele.classList.add('vimjs-line');
      var row_ele_list = [];
      for(var c = 0; c < vimjs.cols; ++c) {
        var col_ele = document.createElement('span');
        col_ele.className='trans';
        col_ele.style = style;
        col_ele.textContent = ' ';
        row_ele.appendChild(col_ele);
        row_ele_list.push(col_ele);
      }
      container.insertBefore(row_ele, ref_child); 
    }
    // remove extra lines
    for(var i = 0; i < num_lines; ++i)
      container.removeChild(container.lastChild);
  },

  vimjs_init_font__deps: ['$vimjs'],
  vimjs_init_font: function(font) {
    if(typeof font !== 'string')
      font = Pointer_stringify(font);
    if(!font)
      font = '12px monospace';

    var container = vimjs.container;
    container.style.font = font;
    if(!container.hasChildNodes()) {
      container.innerHTML = '<div class="vimjs-line"><span class="trans"> </span></div>';
    }
    var first_ele = container.firstChild.firstChild;
    vimjs.char_height = first_ele.clientHeight;
    vimjs.char_width = first_ele.clientWidth;

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
      else
        console.log(string, 'vimjs_get_rgb: invalid color: which should not happen!');
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

  /* func is a function pointer */
  vimjs_async_cmd_call1: function(_, func, arg1) {
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
  vimjs_async_cmd_call2: function(_, func, arg1, arg2) {
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
  vimjs_async_cmd_call3: function(_, func, arg1, arg2, arg3) {
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
  vimjs_async_cmd_call6: function(_, func, arg1, arg2, arg3, arg4, arg5, arg6) {
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
