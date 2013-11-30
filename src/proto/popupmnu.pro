/* popupmnu.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, char *value, size_t length));
void async_get __ARGS((char **p, async_context *context, char *value, size_t length));
void async_return __ARGS((async_context *context));
async_context *async_pop __ARGS((async_context *context));
void pum_display __ARGS((pumitem_T *array, int size, int selected));
void pum_redraw __ARGS((void));
void pum_undisplay __ARGS((void));
void pum_clear __ARGS((void));
int pum_visible __ARGS((void));
int pum_get_height __ARGS((void));
/* vim: set ft=c : */
