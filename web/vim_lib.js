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

        __dummy__: null
    },


    vimjs_init__deps: ['$vimjs'],
    vimjs_init: function () {
        vimjs.rows = 40;
        vimjs.cols = 80;
        vimjs.fg_color = "#000";
        vimjs.bg_color = "#fff";
        vimjs.sp_color = "#777";
        vimjs.gui_browser_add_to_input_buf = Module['cwrap']('gui_browser_add_to_input_buf', null, ['number']);
        vimjs.input_available = Module['cwrap']('input_available', 'number', []);

        vimjs.container = document.getElementById('vimjs-container');
        for(var r = 0; r < vimjs.rows; ++r) {
            var row_ele = document.createElement('div');
            row_ele.classList.add('vimjs-line');
            var row_ele_list = [];
            for(var c = 0; c < vimjs.cols; ++c) {
                var col_ele = document.createElement('span');
                col_ele.textContent = ' ';
                row_ele.appendChild(col_ele);
                row_ele_list.push(col_ele);
            }
            vimjs.container.appendChild(row_ele);
            vimjs.elements.push(row_ele_list);
        }

        document.addEventListener('keypress', function(e) {
            e.preventDefault();
            var c = e.charCode || e.keyCode;
            vimjs.gui_browser_add_to_input_buf(c);
        });
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
            var c = s[i];
            var cur_ele = row_ele_list[col+i];
            cur_ele.className = class_name;
            cur_ele.style = style;
            cur_ele.textContent = c;
        }
    },

    vimjs_clear_block__deps: ['$vimjs'],
    vimjs_clear_block: function(row1, col1, row2, col2) {
        for(var r = row1; r <= row2; ++r) {
            var cur_row  = vimjs.elements[r];
            for(var c = col1; c <= col2; ++c) {
                var cur_ele = cur_row[c];
                cur_ele.className = 'trans';
                cur_ele.style = 'background-color:' + vimjs.bg_color + ';';
                cur_ele.textContent = ' ';
            }
        }
    },   

    vimjs_clear_all__deps: ['$vimjs'],
    vimjs_clear_all: function() {
        for(var r = 0, rl = vimjs.elements.length; r < rl; ++r) {
            var cur_row  = vimjs.elements[r];
            for(var c = 0, cl = cur_row.length; c < cl; ++c) {
                var cur_ele = cur_row[c];
                cur_ele.className = 'trans';
                cur_ele.style = 'background-color:' + vimjs.bg_color + ';';
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

    /* func is a function pointer */
    vimjs_async_cmd_call: function(_, func) {
        var cnt = arguments.length - 2;
        func = FUNCTION_TABLE[func];
        if(func.length == cnt) {
            /* func is sync */
            switch(cnt) {
                case 0:
                    return func.apply(null, []);
                case 1:
                    return func.apply(null, [arguments[2]]);
                case 2:
                    return func.apply(null, [arguments[2], arguments[3]]);
                case 3:
                    return func.apply(null, [arguments[2], arguments[3], arguments[4]]);
                default:
                    return func.apply(null, Array.prototype.slice.call(arguments, 2));
            }
        } else if (func.length == cnt + 1) {
            /* func is async */
            var args = arguments;
            // create a new function to forward the callback
            // cheats streamline
            return (function(cb){
                switch(args.length - 2) {
                    case 0: 
                        return func.apply(null, [cb]);
                    case 1:
                        return func.apply(null, [cb, args[2]]);
                    case 2:
                        return func.apply(null, [cb, args[2], args[3]]);
                    case 3:
                        return func.apply(null, [cb, args[2], args[3], args[4]]);
                    default:
                        var new_args = [];
                        new_args.push(cb);
                        for(var i = 2, l = args.length; i < l; ++i)
                            new_args.push(args[i]);
                        return func.apply(null, new_args);
                }
            })(_);
        } else {
            throw new Error('Cannot make async call');
        }
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

    __dummy__: null 
});
