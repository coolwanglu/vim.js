/*
 * Functions to be implemented by JavaScript
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

#ifndef VIMJS_H__
#define VIMJS_H__

#ifdef FEAT_GUI_BROWSER
// event
void vimjs_init();
void vimjs_sleep(int msec);
int vimjs_wait_for_chars(int);
void vimjs_update();
void vimjs_beep();
void vimjs_flash();

// merics
int vimjs_get_screen_width();
int vimjs_get_screen_height();

// text
void vimjs_draw_string(int row, int col, char_u *s, int len, int flags);
void vimjs_clear_block(int row1, int col1, int row2, int col2);
void vimjs_clear_all();
void vimjs_delete_lines(int, int);
void vimjs_insert_lines(int, int);

// font
void vimjs_init_font(char *);
int vimjs_get_char_width();
int vimjs_get_char_height();

// color
int vimjs_is_valid_color(guicolor_T color);
long_u vimjs_get_rgb(char *);
void vimjs_set_fg_color(char *);
void vimjs_set_bg_color(char *);
void vimjs_set_sp_color(char *);


// others
void vimjs_print_stacktrace();

/*
 * some function pointers may point to async functions, which cannot be automatically detected
 * Instead, use these functions to mark the call
 */
void * vimjs_async_cmd_call1(void (*)(void*), void*);
void * vimjs_async_cmd_call2(void (*)(void*,void*), void*, void*);
void * vimjs_async_cmd_call3(void (*)(void*,void*,void*), void*,void*,void*);
void * vimjs_async_cmd_call6(void (*)(void*,void*,void*,void*,void*,void*), void*,void*,void*,void*,void*,void*);

#endif // FEAT_GUI_BROWSER
#endif //VIMJS_H__
