
mergeInto(LibraryManager.library, {
    vimjs_container: null,
    vimjs_rows: 40,
    vimjs_cols: 80,
    vimjs_elements: [],


    vimjs_init__deps: ['vimjs_container', 'vimjs_rows', 'vimjs_cols', 'vimjs_elements'],
    vimjs_init: function () {
        _vimjs_container = document.getElementById('vimjs-container');
        for(var r = 0; r < _vimjs_rows; ++r) {
            var row_ele = document.createElement('div');
            row_ele.classList.add('vimjs-line');
            var row_ele_list = [];
            for(var c = 0; c < _vimjs_cols; ++c) {
                var col_ele = document.createElement('span');
                col_ele.classList.add('vimjs-char');
                col_ele.textContent = ' ';
                row_ele.appendChild(col_ele);
                row_ele_list.push(col_ele);
            }
            _vimjs_container.appendChild(row_ele);
            _vimjs_elements.push(row_ele_list);
        }
    },
    vimjs_sleep: function (cb, ms) {
        setTimeout(cb, ms);
    },

    vimjs_get_screen_width__deps: ['vimjs_container'],
    vimjs_get_screen_width: function() {
        return _vimjs_container.clientWidth;
    },

    vimjs_get_screen_height__deps: ['vimjs_container'],
    vimjs_get_screen_height: function() {
        return _vimjs_container.clientHeight;
    },

    vimjs_is_valid_color: function(colorp) {
        var color = Pointer_stringify(colorp);
        return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(color);
    },

    vimjs_draw_string__deps: ['vimjs_elements'],
    vimjs_draw_string: function(row, col, s, len, flags) {
        s = Pointer_stringify(s);
        var row_ele_list = _vimjs_elements[row];
        for(var i = 0; i < len; ++i) {
            var c = s[i];
            row_ele_list[col+i].textContent = c;
        }
    },

    vimjs_clear_block__deps: ['vimjs_elements'],
    vimjs_clear_block: function(row1, col1, row2, col2) {
        for(var r = row1; r <= row2; ++r) {
            var cur_row  = _vimjs_elements[r];
            for(var c = col1; c <= col2; ++c) {
                cur_row[c].textContent = ' ';
            }
        }
    },   

    vimjs_clear_all__deps: ['vimjs_elements'],
    vimjs_clear_all: function() {
        for(var r = 0, rl = _vimjs_elements.length; r < rl; ++r) {
            var cur_row  = _vimjs_elements[r];
            for(var c = 0, cl = cur_row.length; c < cl; ++c) {
                cur_row[c].textContent = ' ';
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
    }

    __dummy__: null 
});
