mergeInto(LibraryManager.library, {
    $vimjs: {
        container: null,
        rows: 0,
        cols: 0,
        elements: [],
        fg_color: null,
        bg_color: null,
        sp_color: null,
        gui_browser_add_to_input_buf: null,
        input_available: null,
        special_keys : [],

        __dummy__: null
    },

    vimjs_init__deps: ['$vimjs', 'vimjs_handle_key'],
    vimjs_init: function () {
        vimjs.rows = 40;
        vimjs.cols = 80;
        vimjs.fg_color = "#000";
        vimjs.bg_color = "#fff";
        vimjs.sp_color = "#777";
        vimjs.gui_browser_handle_key = Module['cwrap']('gui_browser_handle_key', null, ['number', 'number', 'number', 'number']);
        vimjs.input_available = Module['cwrap']('input_available', 'number', []);

        var container = vimjs.container = document.getElementById('vimjs-container');
        var elements = vimjs.elements = [];
        var style= 'background-color:' + vimjs.bg_color + ';';
        for(var r = 0; r < vimjs.rows; ++r) {
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
            container.appendChild(row_ele);
            elements.push(row_ele_list);
        }

        // initial special_keys
        vimjs.special_keys = [];
        [
            [KeyEvent.DOM_VK_UP,    'ku'],
            [KeyEvent.DOM_VK_DOWN,  'kd'],
            [KeyEvent.DOM_VK_LEFT,  'kl'],
            [KeyEvent.DOM_VK_RIGHT, 'kr'],
            [KeyEvent.DOM_VK_F1,    'k1'],
            [KeyEvent.DOM_VK_F2,    'k2'],
            [KeyEvent.DOM_VK_F3,    'k3'],
            [KeyEvent.DOM_VK_F4,    'k4'],
            [KeyEvent.DOM_VK_F5,    'k5'],
            [KeyEvent.DOM_VK_F6,    'k6'],
            [KeyEvent.DOM_VK_F7,    'k7'],
            [KeyEvent.DOM_VK_F8,    'k8'],
            [KeyEvent.DOM_VK_F9,    'k9'],
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
            [KeyEvent.DOM_VK_END,    '@7'],
            [KeyEvent.DOM_VK_PAGE_UP,   'kP'],
            [KeyEvent.DOM_VK_PAGE_DOWN, 'kN'],
            [KeyEvent.DOM_VK_PRINT,  '%9'],
        ].forEach(function(p) {
            vimjs.special_keys[p[0]] = p[1];
        });

        document.addEventListener('keypress', function(e) {
            e.preventDefault();
            _vimjs_handle_key(e.charCode, e.keyCode, e);
        });
        /* capture some special keys that won't trigger 'keypress' */
        document.addEventListener('keydown', function(e) {
            // TODO, create an array for all needed key codes
            if(e.keyCode == 27)  {// ESC
                e.preventDefault();
                _vimjs_handle_key(0, e.keyCode, e);
            }
        });
    },

    vimjs_handle_key__deps: ['$vimjs'],
    vimjs_handle_key: function(charCode, keyCode, e) {
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

    vimjs_sleep: function (cb, ms) {
        setTimeout(cb, ms);
    },

    vimjs_get_screen_width__deps: ['$vimjs'],
    vimjs_get_screen_width: function() {
        return vimjs.container.clientWidth;
    },

    vimjs_get_screen_height__deps: ['$vimjs'],
    vimjs_get_screen_height: function() {
        return vimjs.container.clientHeight;
    },

    vimjs_is_valid_color: function(colorp) {
        var color = Pointer_stringify(colorp);
        return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(color);
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
        var row_ele_list = vimjs.elements[row];
        for(var i = 0; i < len; ++i) {
            var cur_ele = row_ele_list[col+i];
            cur_ele.className = class_name;
            cur_ele.style = style;
            cur_ele.textContent = s[i];
        }
    },

    vimjs_clear_block__deps: ['$vimjs'],
    vimjs_clear_block: function(row1, col1, row2, col2) {
        var elements = vimjs.elements;
        var style= 'background-color:' + vimjs.bg_color + ';';
        for(var r = row1; r <= row2; ++r) {
            var cur_row  = elements[r];
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
        var elements = vimjs.elements;
        var style= 'background-color:' + vimjs.bg_color + ';';
        for(var r = 0, rl = elements.length; r < rl; ++r) {
            var cur_row  = elements[r];
            for(var c = 0, cl = cur_row.length; c < cl; ++c) {
                var cur_ele = cur_row[c];
                cur_ele.className = 'trans';
                cur_ele.style = style;
                cur_ele.textContent = ' ';
            }
        }
    },

    vimjs_print_stacktrace: function() {
        console.log((new Error).stack);
    },

    /* https://github.com/harthur/color-string */
    /* MIT License */
    vimjs_get_rgb: function (string) {
        string = Pointer_stringify(string);
        if (!string) {
            return 0;
        }
        var abbr = /^#([a-fA-F0-9]{3})$/;
        var hex = /^#([a-fA-F0-9]{6})$/;

        var rgb = [0, 0, 0];
        var match = string.match(abbr);
        if (match) {
            match = match[1];
            for (var i = 0; i < rgb.length; i++) {
                rgb[i] = parseInt(match[i] + match[i], 16);
            }
        }
        else if (match = string.match(hex)) {
            match = match[1];
            for (var i = 0; i < rgb.length; i++) {
                rgb[i] = parseInt(match.slice(i * 2, i * 2 + 2), 16);
            }
        }
        var ret = 0;
        for (var i = 0; i < rgb.length; i++) {
            ret = (ret << 8) + rgb[i];
        }
        return ret;
    },

    vimjs_set_fg_color__deps: ['$vimjs'],
    vimjs_set_fg_color: function(color) {
        vimjs.fg_color = Pointer_stringify(color);
    },
    vimjs_set_bg_color__deps: ['$vimjs'],
    vimjs_set_bg_color: function(color) {
        vimjs.bg_color = Pointer_stringify(color);
    },
    vimjs_set_sp_color__deps: ['$vimjs'],
    vimjs_set_sp_color: function(color) {
        vimjs.sp_color = Pointer_stringify(color);
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

    vimjs_delete_lines__deps: ['$vimjs'],
    vimjs_delete_lines: function(row, num_lines) {
        var container = vimjs.container;
        var cur_children = container.childNodes;
        for(var i = row, l = row + num_lines; i < l; ++i)
            container.removeChild(cur_children[i]);
        vimjs.elements.splice(row, num_lines);
    },

    vimjs_insert_lines__deps: ['$vimjs'],
    vimjs_insert_lines: function(row, num_lines) {
        var container = vimjs.container;
        var cur_children = container.childNodes;
        var ref_child = (cur_children.length > row ? cur_children[row] : null);
        var args = [row, 0];
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
            args.push(row_ele_list);
        }
        Array.prototype.splice.apply(vimjs.elements, args);
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
