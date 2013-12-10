/*
 * Functions to be implemented by JavaScript
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

#ifndef VIMJS_H__
#define VIMJS_H__

void vimjs_init();
void vimjs_sleep(int msec);

int vimjs_get_screen_width();
int vimjs_get_screen_height();

int vimjs_is_valid_color(guicolor_T color);

void vimjs_draw_string(int row, int col, char_u *s, int len, int flags);

void vimjs_clear_block(int row1, int col1, int row2, int col2);
void vimjs_clear_all();

void vimjs_print_stacktrace();

#endif //VIMJS_H__
