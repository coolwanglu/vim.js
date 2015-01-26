/*
j* Functions to be implemented by JavaScript
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

#ifndef VIMJS_H__
#define VIMJS_H__

#ifdef FEAT_GUI_WEB
void emscripten_sleep(int);
// event
void vimjs_init();
int vimjs_prepare_exit();
//int vimjs_wait_for_chars(int);
//void vimjs_update();
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

#endif // FEAT_GUI_WEB
#endif //VIMJS_H__
