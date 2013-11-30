/* termlib.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, char *value, size_t length));
void async_get __ARGS((char **p, async_context *context, char *value, size_t length));
void async_return __ARGS((async_context *context));
async_context *async_pop __ARGS((async_context *context));
int tgetent __ARGS((char *tbuf, char *term));
int tgetflag __ARGS((char *id));
int tgetnum __ARGS((char *id));
char *tgetstr __ARGS((char *id, char **buf));
char *tgoto __ARGS((char *cm, int col, int line));
int tputs __ARGS((char *cp, int affcnt, void (*outc)(unsigned int)));
/* vim: set ft=c : */
