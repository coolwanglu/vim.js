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

#endif //VIMJS_H__
