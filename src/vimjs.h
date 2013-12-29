/*
j* Functions to be implemented by JavaScript
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

#ifndef VIMJS_H__
#define VIMJS_H__

#ifdef FEAT_GUI_BROWSER
// event
void vimjs_init();
void vimjs_sleep(int);
int vimjs_wait_for_chars(int);
void vimjs_update();
void vimjs_beep();
void vimjs_flash(int);

// merics
int vimjs_get_window_width();
int vimjs_get_window_height();
void vimjs_resize(int, int);

// text
void vimjs_draw_string(int, int, char_u *, int, int);
void vimjs_clear_block(int, int, int, int);
void vimjs_clear_all();
void vimjs_delete_lines(int, int, int, int, int);
void vimjs_insert_lines(int, int, int, int, int);
void vimjs_draw_hollow_cursor(int, int);
void vimjs_draw_part_cursor(int, int, int, int);
void vimjs_invert_rectangle(int, int, int, int);

// font
void vimjs_init_font(char *);
void vimjs_set_font(char *);
int vimjs_check_font(char *);
int vimjs_get_char_width();
int vimjs_get_char_height();

// color
int vimjs_is_valid_color(char *);
long_u vimjs_get_rgb(char *);
void vimjs_set_fg_color(long);
void vimjs_set_bg_color(long);
void vimjs_set_sp_color(long);

// others
void vimjs_print_stacktrace();
int vimjs_call_shell(char *, int);
void vimjs_browse(char *, int, int, char*, char*);
int vimjs_haskey(char*);

/*
 * some function pointers may point to async functions, which cannot be automatically detected
 * Instead, use these functions to mark the call
 * `safe` means that #args is checked, both sync and async functions can be called correctly
 */
void * vimjs_async_call_safe0(void (*)());
void * vimjs_async_call_safe1(void (*)(void*), void*);
void * vimjs_async_call_safe2(void (*)(void*,void*), void*, void*);
void * vimjs_async_call_safe3(void (*)(void*,void*,void*), void*,void*,void*);
void * vimjs_async_call_safe6(void (*)(void*,void*,void*,void*,void*,void*), void*,void*,void*,void*,void*,void*);

#endif // FEAT_GUI_BROWSER
#endif //VIMJS_H__
