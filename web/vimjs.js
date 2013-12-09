mergeInto(LibraryManager.library, {
    vimjs_container: null,
    vimjs_rows: 40,
    vimjs_cols: 80,
    vimjs_elements: [],


    vimjs_init__deps: ['vimjs_container', 'vimjs_rows', 'vimjs_cols', 'vimjs_elements'],
    vimjs_init: function () {
        _vimjs_container = document.getElementById('container');
        for(var r = 0; r < vimjs_rows; ++r) {
            var row_ele = document.createElement('pre');
            var row_ele_list = [];
            for(var c = 0; c < vimjs_cols; ++c) {
                var col_ele = document.createElement('span');
                row_ele.appendChild(col_ele);
                row_ele_list.push(col_ele);
            }
            _vimjs_container.appendChild(row_ele);
            vimjs_elements.push(row_ele_list);
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

    __dummy__: null 
})


